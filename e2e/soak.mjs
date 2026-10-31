// Prueba de resistencia por socket puro (sin navegador).
//
//   node e2e/soak.mjs                         levanta su propio servidor (rápido) en un puerto libre
//   SOAK_URL=http://localhost:3001 node e2e/soak.mjs   contra un servidor ya corriendo
//
// Juega GAMES partidas (20 por defecto) de 2 humanos-script + 1 a 4 bots. Los humanos eligen al azar
// una jugada legal (con getLegalTargets del motor sobre SU PlayerView) o descartan, y de vez en cuando
// mandan algo ilegal a propósito. En algunas partidas un humano se desconecta y vuelve con su token,
// o abandona a media partida.
//
// En cada game:state comprueba:
//   - 68 cartas en total: mi mano + manos ajenas (handCount) + cuerpos + mazo + descarte
//   - handCount del propio jugador = hand.length; nadie con más de 3; los que salieron sin cartas
//   - turnNumber nunca baja; el turno no es de alguien que salió; tras un lote con 'turn',
//     el estado apunta a ese jugador y turno
//   - seq de game:events consecutivo (salvo tras reconectar, donde sólo debe crecer)
// y que cada partida termine (con ganador) sin quedarse atorada.

import { io as connect } from 'socket.io-client';
import { getLegalTargets } from '../shared/engine/index.js';

const GAMES = Number(process.env.GAMES || 20);
const DECK = 68;
const STALL_MS = Number(process.env.STALL_MS || 20000); // sin cambio de turno en este tiempo = atorada
const GAME_MS = Number(process.env.GAME_MS || 180000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

// ---------- Servidor ----------

let server = null;
let URL_BASE = process.env.SOAK_URL;
if (!URL_BASE) {
  const { createServer } = await import('../virus-back/src/index.js');
  server = createServer({ log: false, botMinMs: 5, botMaxMs: 20, graceMs: 1500, turnMs: 40000 });
  const port = await server.listen(0, '127.0.0.1');
  URL_BASE = `http://127.0.0.1:${port}`;
}

// ---------- Cliente ----------

const client = async (name) => {
  const socket = connect(URL_BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
  const c = { socket, name, token: null, playerId: null };
  c.req = (ev, payload) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name}: sin ack para ${ev}`)), 5000);
    socket.emit(ev, payload, (res) => { clearTimeout(t); resolve(res); });
  });
  c.ok = async (ev, payload) => {
    const res = await c.req(ev, payload);
    if (!res?.ok) throw new Error(`${name}: ${ev} falló: ${JSON.stringify(res?.error)}`);
    return res;
  };
  const hello = await c.ok('session:hello', { profile: { name, avatar: rand(9), color: '#ffae00' } });
  c.token = hello.token;
  c.playerId = hello.playerId;
  return c;
};

// ---------- Invariantes ----------

const cardsInView = (v) => {
  let n = v.hand.length + v.deckCount + v.discardCount;
  for (const p of v.players) {
    if (p.id !== v.you) n += p.handCount;
    for (const s of p.body) n += 1 + s.viruses.length + s.medicines.length;
  }
  return n;
};

const checkView = (v, ctx, fail) => {
  const total = cardsInView(v);
  if (total !== DECK) fail(`hay ${total} cartas visibles+ocultas, no ${DECK}`);
  const me = v.players.find((p) => p.id === v.you);
  if (!me) fail('el jugador no aparece en su propia vista');
  else if (me.handCount !== v.hand.length) fail(`handCount ${me.handCount} ≠ mano ${v.hand.length}`);
  for (const p of v.players) {
    if (p.handCount > 3) fail(`${p.name} tiene ${p.handCount} cartas en la mano`);
    if (p.out && (p.handCount || p.body.length)) fail(`${p.name} salió pero conserva cartas`);
    const colors = p.body.map((s) => s.organ.color).filter((c) => c !== 'multi');
    if (new Set(colors).size !== colors.length) fail(`${p.name} tiene órganos repetidos`);
  }
  if (!v.winner) {
    const turnP = v.players.find((p) => p.id === v.turnPlayerId);
    if (!turnP) fail('el turno es de alguien que no existe');
    else if (turnP.out) fail(`el turno es de ${turnP.name}, que ya salió`);
  }
  if (ctx.lastTurnNumber != null && v.turnNumber < ctx.lastTurnNumber) {
    fail(`turnNumber bajó de ${ctx.lastTurnNumber} a ${v.turnNumber}`);
  }
  if (ctx.expectTurn) {
    const t = ctx.expectTurn;
    if (!v.winner && (v.turnPlayerId !== t.playerId || v.turnNumber !== t.turnNumber)) {
      fail(`el lote anunció el turno ${t.turnNumber} de ${t.playerId} y el estado dice ${v.turnNumber} de ${v.turnPlayerId}`);
    }
    ctx.expectTurn = null;
  }
  ctx.lastTurnNumber = v.turnNumber;
  if (v.hand.some((c) => !c?.id)) fail('carta sin id en la mano');
  if (typeof v.turnDeadline !== 'number' || typeof v.turnMs !== 'number') fail('falta turnDeadline/turnMs');
  // Ninguna vista puede filtrar cartas ajenas
  const json = JSON.stringify(v.players);
  if (/"hand"/.test(json)) fail('la vista trae manos ajenas');
};

// ---------- Un humano-script ----------

const chooseAction = (v) => {
  const me = v.you;
  const hand = v.hand;
  if (!hand.length) return { type: 'pass' };
  if (Math.random() < 0.8) {
    const options = [];
    for (const card of hand) {
      for (const target of getLegalTargets(v, me, card.id)) options.push({ type: 'play', cardId: card.id, target });
    }
    if (options.length) return pick(options);
  }
  const k = 1 + rand(hand.length);
  return { type: 'discard', cardIds: [...hand].sort(() => Math.random() - 0.5).slice(0, k).map((c) => c.id) };
};

// Conecta los listeners de partida a un cliente
const attach = (c, g) => {
  const ctx = { lastSeq: null, lastTurnNumber: null, expectTurn: null, view: null, acting: false, resumed: false };
  c.ctx = ctx;
  const fail = (msg) => g.errors.push(`[partida ${g.n}] ${c.name}: ${msg}`);

  // Juega si es su turno. Se vuelve a revisar al llegar el ack, porque el estado de un turno que
  // regresa enseguida (p. ej. tras el guante, todos los demás pierden turno) puede llegar antes que el ack.
  let actedOn = null;
  const maybeAct = () => {
    const v = ctx.view;
    if (!v || v.winner || c.gone || ctx.acting) return;
    if (v.turnPlayerId !== v.you || actedOn === v.turnNumber) return;
    ctx.acting = true;
    actedOn = v.turnNumber;
    setTimeout(async () => {
      try {
        if (c.gone || ctx.view?.turnNumber !== v.turnNumber) return;
        const action = chooseAction(ctx.view);
        const res = await c.req('game:action', action);
        if (!res.ok) {
          // Puede pasar si el turno se acabó justo antes; si no, es un error del motor/servidor
          if (res.error.code !== 'NOT_YOUR_TURN' && res.error.code !== 'GAME_OVER') {
            fail(`acción legal rechazada ${JSON.stringify(action)} → ${res.error.code}: ${res.error.message}`);
          }
        } else g.actions++;
      } catch (err) {
        if (!c.gone) fail(err.message);
      } finally {
        ctx.acting = false;
        maybeAct();
      }
    }, 5 + rand(25));
  };

  c.socket.on('game:events', (batch) => {
    if (ctx.lastSeq != null) {
      if (ctx.resumed ? batch.seq <= ctx.lastSeq : batch.seq !== ctx.lastSeq + 1) {
        fail(`seq ${batch.seq} después de ${ctx.lastSeq}`);
      }
    }
    ctx.resumed = false;
    ctx.lastSeq = batch.seq;
    const turns = batch.events.filter((e) => e.type === 'turn');
    ctx.expectTurn = turns.length ? turns[turns.length - 1] : null;
    for (const e of batch.events) {
      g.eventCounts[e.type] = (g.eventCounts[e.type] || 0) + 1;
      if (e.type === 'win') g.winner = e;
    }
  });

  c.socket.on('game:state', (v) => {
    g.states++;
    checkView(v, ctx, fail);
    ctx.view = v;
    if (v.turnNumber !== g.turnNumber) { g.turnNumber = v.turnNumber; g.lastProgress = Date.now(); }
    if (v.winner) { g.winner = g.winner || v.winner; return; }
    const mine = v.turnPlayerId === v.you;
    if (!mine && Math.random() < 0.03) {
      // Ilegal a propósito: jugar fuera de turno. Debe rechazarse sin cambiar nada.
      c.req('game:action', { type: 'discard', cardIds: v.hand.slice(0, 1).map((x) => x.id) }).then((res) => {
        if (res?.ok) fail('el servidor aceptó una acción fuera de turno');
        else g.rejected++;
      }).catch(() => {});
    }
    if (mine) maybeAct();
  });
};

// ---------- Una partida ----------

const playGame = async (n) => {
  const g = {
    n, errors: [], eventCounts: {}, states: 0, actions: 0, rejected: 0,
    winner: null, turnNumber: 0, lastProgress: Date.now(),
  };
  const scenario = n % 5 === 3 ? 'reconexión' : n % 7 === 6 ? 'abandono' : 'normal';
  const a = await client(`Ana${n}`);
  const b = await client(`Beto${n}`);
  const clients = [a, b];
  try {
    const bots = 1 + rand(4);
    const created = await a.ok('room:create', { name: `Soak ${n}`, maxPlayers: 2 + bots });
    await b.ok('room:join', { roomId: created.roomId });
    for (let i = 0; i < bots; i++) await a.ok('room:addBot', { level: Math.random() < 0.5 ? 'easy' : 'normal' });
    attach(a, g);
    attach(b, g);
    await a.ok('room:start');

    const t0 = Date.now();
    let disrupted = false;
    while (!g.winner) {
      await sleep(25);
      if (Date.now() - g.lastProgress > STALL_MS) throw new Error(`atorada en el turno ${g.turnNumber}`);
      if (Date.now() - t0 > GAME_MS) throw new Error(`no terminó en ${GAME_MS / 1000} s (turno ${g.turnNumber})`);

      if (!disrupted && g.turnNumber >= 12 && scenario === 'reconexión') {
        disrupted = true;
        // Beto se cae y vuelve con su token: mismo asiento y misma mano
        const handBefore = b.ctx.view?.hand.map((c) => c.id).sort().join();
        b.gone = true; // el socket viejo ya no juega
        b.socket.disconnect();
        await sleep(150);
        const b2 = await (async () => {
          const socket = connect(URL_BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
          await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
          return { ...b, socket, gone: false };
        })();
        b2.req = (ev, payload) => new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`sin ack para ${ev}`)), 5000);
          b2.socket.emit(ev, payload, (res) => { clearTimeout(t); resolve(res); });
        });
        const ctxPrev = b.ctx;
        attach(b2, g);
        b2.ctx.lastSeq = ctxPrev.lastSeq;
        b2.ctx.lastTurnNumber = ctxPrev.lastTurnNumber;
        b2.ctx.resumed = true;
        const firstState = new Promise((res) => b2.socket.once('game:state', res));
        const hello = await b2.req('session:hello', { token: b.token });
        if (!hello.ok || hello.playerId !== b.playerId || !hello.roomId) g.errors.push(`[partida ${n}] la reconexión no recuperó la sesión`);
        const v = await Promise.race([firstState, sleep(3000).then(() => null)]);
        if (!v) g.errors.push(`[partida ${n}] tras reconectar no llegó game:state`);
        else if (v.you !== b.playerId) g.errors.push(`[partida ${n}] tras reconectar el asiento es otro`);
        else if (!g.winner && v.turnNumber === ctxPrev.view?.turnNumber && v.hand.map((c) => c.id).sort().join() !== handBefore) {
          g.errors.push(`[partida ${n}] tras reconectar la mano cambió sin que pasara el turno`);
        }
        clients[1] = b2;
      }

      if (!disrupted && g.turnNumber >= 10 && scenario === 'abandono') {
        disrupted = true;
        b.gone = true;
        await b.ok('room:leave');
        b.socket.removeAllListeners('game:state');
        b.socket.removeAllListeners('game:events');
      }
    }

    if (!g.winner) throw new Error('sin ganador');
    // Dejar que lleguen los últimos estados y que la sala pase a finished
    await sleep(100);
  } catch (err) {
    g.errors.push(`[partida ${n}] ${err.message}`);
  } finally {
    for (const c of clients) {
      c.gone = true;
      await c.req('room:leave').catch(() => {});
      c.socket.disconnect();
    }
  }
  return { ...g, scenario };
};

// ---------- Principal ----------

const totals = { states: 0, actions: 0, rejected: 0, turns: 0, events: {} };
const allErrors = [];
const t0 = Date.now();
console.log(`soak: ${GAMES} partidas contra ${URL_BASE}${server ? ' (servidor propio)' : ''}`);
for (let n = 1; n <= GAMES; n++) {
  const g = await playGame(n);
  totals.states += g.states;
  totals.actions += g.actions;
  totals.rejected += g.rejected;
  totals.turns += g.turnNumber;
  for (const [k, v] of Object.entries(g.eventCounts)) totals.events[k] = (totals.events[k] || 0) + v;
  allErrors.push(...g.errors);
  const w = g.winner ? `ganó ${g.winner.playerId} (${g.winner.reason})` : 'SIN GANADOR';
  console.log(`  partida ${String(n).padStart(2)} [${g.scenario}]: ${g.turnNumber} turnos, ${g.states} estados, ${w}${g.errors.length ? `  ✗ ${g.errors.length} error(es)` : ''}`);
}

console.log(`\n${GAMES} partidas en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${totals.turns} turnos · ${totals.states} estados revisados · ${totals.actions} acciones de humanos · ${totals.rejected} ilegales rechazadas`);
console.log('eventos:', totals.events);
if (server) await server.close();

if (allErrors.length) {
  console.error(`\n✗ ${allErrors.length} problema(s):`);
  [...new Set(allErrors)].slice(0, 40).forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log('\n✓ soak sin errores');
process.exit(0);
