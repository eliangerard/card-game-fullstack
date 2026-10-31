// Tests de integración de la partida: arranque, reconexión, partida completa con bots,
// revancha, acciones ilegales, desconexión con timer corto y pérdida del asiento.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sleep } from './helpers.js';

const profile = (name) => ({ name, avatar: 0, color: '#885ffe' });

// Comprueba que la vista no filtra manos ajenas ni el mazo
function assertPrivateView(view) {
  assert.ok(Array.isArray(view.hand) && view.hand.length <= 3);
  assert.equal(view.deck, undefined);
  for (const p of view.players) {
    assert.equal(p.hand, undefined);
    assert.equal(typeof p.handCount, 'number');
  }
  assert.equal(typeof view.turnDeadline, 'number');
  assert.equal(typeof view.turnMs, 'number');
}

describe('Partida', () => {
  test('addBot + start: llegan game:events y luego game:state', async () => {
    const srv = await startServer({ botMinMs: 900, botMaxMs: 1600 });
    try {
      const a = await srv.client({ profile: profile('Ana') });
      const { roomId } = await a.ok('room:create', { name: 'Vs bot' });
      await a.ok('room:addBot', { level: 'normal' });
      const stateP = a.waitFor('game:state');
      const before = Date.now();
      await a.ok('room:start');
      const view = await stateP;
      assertPrivateView(view);
      assert.equal(view.you, a.session.playerId);
      assert.equal(view.hand.length, 3);
      assert.equal(view.players.length, 2);
      assert.equal(view.deckCount, 68 - 6);
      assert.ok(view.turnDeadline >= before + 39_000);
      assert.equal(view.turnMs, 40_000);
      // Orden: el primer game:events (seq 1) llega antes del primer game:state
      const idxEv = a.log.findIndex((x) => x.ev === 'game:events');
      const idxSt = a.log.findIndex((x) => x.ev === 'game:state');
      assert.ok(idxEv !== -1 && idxEv < idxSt);
      assert.equal(a.log[idxEv].data.seq, 1);
      assert.equal(a.log[idxEv].data.events[0].type, 'turn');

      const room = a.last('room:state');
      assert.equal(room.status, 'playing');
      assert.equal(await a.errCode('room:addBot'), 'NOT_IN_LOBBY');
      assert.equal(await a.errCode('room:start'), 'NOT_IN_LOBBY');
      assert.equal(await a.errCode('room:rematch'), 'NOT_FINISHED');
      const late = await srv.client({ profile: profile('Tarde') });
      assert.equal(await late.errCode('room:join', { roomId }), 'ROOM_IN_GAME');

      // Si empezó el bot, debe jugar en 900–1600 ms
      if (view.turnPlayerId !== a.session.playerId) {
        const ev = await a.waitFor('game:events', (b) => b.seq === 2, { timeout: 2500, past: true });
        assert.ok(ev.events.some((e) => e.type === 'played' || e.type === 'discarded'));
        assert.ok(Date.now() - before >= 850);
      }
    } finally {
      await srv.close();
    }
  });

  test('recarga a media partida: mismo jugador, misma sala, misma mano', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 1234 });
    try {
      const a = await srv.client({ profile: profile('Recarga') });
      const b = await srv.client({ profile: profile('Testigo') });
      const { roomId } = await a.ok('room:create', { name: 'Recargas' });
      await b.ok('room:join', { roomId });
      const stP = a.waitFor('game:state');
      await a.ok('room:start');
      const view = await stP;
      assert.equal(view.turnPlayerId, a.session.playerId); // asientos fijos: empieza el anfitrión

      // a "recarga": se cae el socket
      const seesOffline = b.waitFor('room:state', (s) => s?.players.find((p) => p.id === a.session.playerId)?.connected === false);
      const shortClock = b.waitFor('game:state', (s) => s.turnMs === 8000);
      a.socket.disconnect();
      await seesOffline;
      await shortClock; // su turno ahora corre con el reloj de desconectado

      const a2 = await srv.client({ hello: false });
      const roomP = a2.waitFor('room:state');
      const gameP = a2.waitFor('game:state');
      const res = await a2.ok('session:hello', { token: a.session.token });
      assert.equal(res.playerId, a.session.playerId);
      assert.equal(res.roomId, roomId);
      const room = await roomP;
      assert.equal(room.id, roomId);
      const view2 = await gameP;
      assertPrivateView(view2);
      assert.deepEqual(view2.hand.map((c) => c.id), view.hand.map((c) => c.id));
      assert.equal(view2.turnPlayerId, a.session.playerId);
      // Al volver en su turno recupera un margen de 15 s
      assert.ok(view2.turnDeadline - Date.now() > 10_000);
      await b.waitFor('room:state', (s) => s?.players.find((p) => p.id === a.session.playerId)?.connected === true, { past: true });

      // Y puede seguir jugando con el socket nuevo
      await a2.ok('game:action', { type: 'discard', cardIds: [view2.hand[0].id] });
      const after = await b.waitFor('game:state', (s) => s.turnPlayerId === b.session.playerId, { past: true });
      assert.equal(after.players.find((p) => p.id === a.session.playerId).handCount, 3);
    } finally {
      await srv.close();
    }
  });

  test('1 humano + 3 bots hasta que haya ganador; luego revancha', async () => {
    const srv = await startServer({ turnMs: 25, botMinMs: 1, botMaxMs: 4 });
    try {
      const a = await srv.client({ profile: profile('Humano') });
      const { roomId } = await a.ok('room:create', { name: 'Maratón' });
      for (let i = 0; i < 3; i++) await a.ok('room:addBot', { level: i === 0 ? 'easy' : 'normal' });
      const done = a.waitFor('game:state', (s) => s.winner !== null, { timeout: 60_000 });
      await a.ok('room:start');
      const final = await done;
      assert.ok(['organs', 'forfeit'].includes(final.winner.reason));
      assert.ok(final.players.some((p) => p.id === final.winner.playerId));
      assert.ok(final.players.every((p) => !p.isTurn));

      // Lotes de eventos con seq consecutivo, cada uno antes de su estado
      const batches = a.all('game:events');
      batches.forEach((b, i) => assert.equal(b.seq, i + 1));
      assert.equal(batches.at(-1).events.at(-1).type, 'win');
      assert.ok(batches.some((b) => b.events.some((e) => e.type === 'timeout' && e.playerId === a.session.playerId)));
      const order = a.log.filter((x) => x.ev === 'game:events' || x.ev === 'game:state').map((x) => x.ev);
      for (let i = 0; i < order.length; i += 2) assert.deepEqual(order.slice(i, i + 2), ['game:events', 'game:state']);
      for (const s of a.all('game:state')) assertPrivateView(s);

      const room = await a.waitFor('room:state', (s) => s?.status === 'finished', { past: true });
      assert.equal(room.id, roomId);
      const winnerName = final.players.find((p) => p.id === final.winner.playerId).name;
      await a.waitFor('room:chat', (m) => m.system && m.text.includes(winnerName) && m.text.includes('ganó'), { past: true });
      assert.equal(await a.errCode('game:action', { type: 'discard', cardIds: ['c01'] }), 'GAME_OVER');
      // No quedan timers vivos: no llegan más lotes
      const n = a.all('game:events').length;
      await sleep(150);
      assert.equal(a.all('game:events').length, n);

      // Con la partida terminada no entra nadie nuevo (ni recibe el estado final)
      const v = await srv.client({ profile: profile('Mirón') });
      assert.equal(await v.errCode('room:join', { roomId }), 'ROOM_IN_GAME');

      const lobby = a.waitFor('room:state', (s) => s?.status === 'lobby');
      await a.ok('room:rematch');
      const st = await lobby;
      assert.equal(st.players.length, 4);
      assert.equal(st.players.filter((p) => p.isBot).length, 3);
      // Tras la revancha sí puede entrar, pero no pedir otra
      await v.ok('room:join', { roomId });
      assert.equal(v.all('game:state').length, 0);
      assert.equal(await v.errCode('room:rematch'), 'NOT_HOST');
      assert.equal(await a.errCode('room:rematch'), 'NOT_FINISHED');
      assert.equal(await a.errCode('game:action', { type: 'pass' }), 'NOT_PLAYING');
      // Y se puede volver a empezar
      const again = a.waitFor('game:state', (s) => s.winner === null && s.turnNumber === 1);
      await a.ok('room:start');
      await again;
    } finally {
      await srv.close();
    }
  });

  test('acción ilegal → ack con error y la partida sigue', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 42 });
    try {
      const a = await srv.client({ profile: profile('Uno') });
      const b = await srv.client({ profile: profile('Dos') });
      assert.equal(await a.errCode('game:action', { type: 'pass' }), 'NOT_IN_ROOM');
      const { roomId } = await a.ok('room:create', { name: 'Ilegal' });
      await b.ok('room:join', { roomId });
      assert.equal(await a.errCode('game:action', { type: 'pass' }), 'NOT_PLAYING');
      const stP = a.waitFor('game:state');
      await a.ok('room:start');
      const view = await stP;
      const hand = view.hand;
      const otherId = b.session.playerId;

      // b no está en turno
      const bView = await b.waitFor('game:state', () => true, { past: true });
      assert.equal(await b.errCode('game:action', { type: 'discard', cardIds: [bView.hand[0].id] }), 'NOT_YOUR_TURN');
      // Payloads basura
      assert.equal(await a.errCode('game:action'), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', 'discard'), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'hack' }), 'UNKNOWN_ACTION');
      assert.equal(await a.errCode('game:action', { type: 'play', cardId: 123 }), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'play', cardId: hand[0].id, target: 'yo' }), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'play', cardId: hand[0].id, target: { playerId: { $gt: '' } } }), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'discard', cardIds: [] }), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'discard', cardIds: ['c01', 'c02', 'c03', 'c04'] }), 'BAD_PAYLOAD');
      assert.equal(await a.errCode('game:action', { type: 'discard', cardIds: 'c01' }), 'BAD_PAYLOAD');
      // Errores del motor
      const notMine = Array.from({ length: 68 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`).find((id) => !hand.some((c) => c.id === id));
      assert.equal(await a.errCode('game:action', { type: 'play', cardId: notMine, target: {} }), 'CARD_NOT_IN_HAND');
      assert.equal(await a.errCode('game:action', { type: 'discard', cardIds: [hand[0].id, hand[0].id] }), 'BAD_DISCARD');
      assert.equal(await a.errCode('game:action', { type: 'pass' }), 'ILLEGAL_MOVE');
      // Jugar algo sobre un cuerpo vacío ajeno nunca es legal (órgano ajeno, virus sin órgano, etc.)
      const organ = hand.find((c) => c.kind === 'organ');
      if (organ) {
        const code = await a.errCode('game:action', { type: 'play', cardId: organ.id, target: { playerId: otherId } });
        assert.ok(['BAD_TARGET', 'ILLEGAL_MOVE'].includes(code), code);
      }
      // __proto__ en el payload no contamina nada
      const evil = JSON.parse(`{"type":"discard","cardIds":["${notMine}"],"__proto__":{"polluted":true}}`);
      await a.req('game:action', evil);
      assert.equal({}.polluted, undefined);

      // Nada cambió: ni seq ni la mano
      assert.equal(a.all('game:events').length, 1);
      const cur = a.last('game:state');
      assert.deepEqual(cur.hand.map((c) => c.id), hand.map((c) => c.id));

      // Una jugada legal sí pasa
      const evP = b.waitFor('game:events', (x) => x.seq === 2);
      await a.ok('game:action', { type: 'discard', cardIds: [hand[1].id, hand[2].id] });
      const ev = await evP;
      const types = ev.events.map((e) => e.type);
      assert.deepEqual(types, ['discarded', 'drew', 'turn']);
      assert.deepEqual(ev.events[0].cards.map((c) => c.id), [hand[1].id, hand[2].id]);
      const bv = await b.waitFor('game:state', (s) => s.turnPlayerId === otherId, { past: true });
      assert.equal(bv.discardCount, 2);
      assert.equal(bv.players.find((p) => p.id === a.session.playerId).handCount, 3);
    } finally {
      await srv.close();
    }
  });

  test('desconectado: su turno corre con 8 s y al pasar la gracia pierde el asiento', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 7, disconnectedTurnMs: 150, graceMs: 700 });
    try {
      const a = await srv.client({ profile: profile('Se va') });
      const b = await srv.client({ profile: profile('Se queda') });
      const { roomId } = await a.ok('room:create', { name: 'Gracia' });
      await b.ok('room:join', { roomId });
      const stP = b.waitFor('game:state');
      await a.ok('room:start');
      const view = await stP;
      assert.equal(view.turnPlayerId, a.session.playerId);

      const timeoutP = b.waitFor('game:events', (x) => x.events.some((e) => e.type === 'timeout' && e.playerId === a.session.playerId), { timeout: 1000 });
      const t0 = Date.now();
      a.socket.disconnect();
      await timeoutP;
      assert.ok(Date.now() - t0 < 900);

      // Ahora es turno de b; b descarta para devolverle el turno a a (desconectado)
      const bView = await b.waitFor('game:state', (s) => s.turnPlayerId === b.session.playerId, { past: true });
      await b.ok('game:action', { type: 'discard', cardIds: [bView.hand[0].id] });

      // Pasada la gracia: playerLeft y b gana por abandono
      const end = await b.waitFor('game:events', (x) => x.events.some((e) => e.type === 'playerLeft'), { timeout: 2000, past: true });
      assert.deepEqual(end.events.map((e) => e.type), ['playerLeft', 'win']);
      assert.deepEqual(end.events[1], { type: 'win', playerId: b.session.playerId, reason: 'forfeit' });
      const room = await b.waitFor('room:state', (s) => s?.status === 'finished', { past: true });
      assert.equal(room.players.length, 1);
      assert.equal(room.hostId, b.session.playerId);
      await b.waitFor('room:chat', (m) => m.system && m.text === 'Se queda ganó: los demás abandonaron', { past: true });

      // El que volvió tarde ya no tiene sala
      const a2 = await srv.client({ token: a.session.token });
      assert.equal(a2.session.playerId, a.session.playerId);
      assert.equal(a2.session.roomId, null);
    } finally {
      await srv.close();
    }
  });

  test('salir a media partida con 3 jugadores: la partida sigue sin él', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 99, botMinMs: 5000, botMaxMs: 5000 });
    try {
      const a = await srv.client({ profile: profile('Primero') });
      const b = await srv.client({ profile: profile('Segunda') });
      const { roomId } = await a.ok('room:create', { name: 'Abandono' });
      await b.ok('room:join', { roomId });
      await a.ok('room:addBot');
      const stP = b.waitFor('game:state');
      await a.ok('room:start');
      await stP;
      const evP = b.waitFor('game:events', (x) => x.events.some((e) => e.type === 'playerLeft'));
      await a.ok('room:leave');
      const ev = await evP;
      // a tenía el turno: se pasa al siguiente (b)
      assert.deepEqual(ev.events.map((e) => e.type), ['playerLeft', 'turn']);
      assert.equal(ev.events[1].playerId, b.session.playerId);
      const room = await b.waitFor('room:state', (s) => s?.players.length === 2, { past: true });
      assert.equal(room.status, 'playing');
      assert.equal(room.hostId, b.session.playerId);
      const st = b.last('game:state');
      assert.equal(st.players.find((p) => p.id === a.session.playerId).out, true);
      assert.equal(st.winner, null);

      // Si b también sale, sólo queda el bot: la sala se borra y sus timers se limpian
      await b.ok('room:leave');
      assert.equal(srv.server.rooms.rooms.size, 0);
    } finally {
      await srv.close();
    }
  });
});
