// Fuzz: 300 partidas bot contra bot con semillas distintas, de 2 a 6 jugadores.
// Invariantes tras cada acción: 68 cartas en total, ids únicos, sin colores repetidos en un cuerpo,
// manos de como mucho 3 cartas y toda acción del bot aceptada por el motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyAction,
  advanceTimeout,
  removePlayer,
  chooseBotAction,
  getPlayerView,
  getLegalTargets,
  countAllCards,
  bodyHasDuplicateColors,
  slotStatus,
} from '../engine/index.js';

const GAMES = 300;
const MAX_TURNS = 2000;

function checkInvariants(st, ctx) {
  assert.equal(countAllCards(st), 68, `${ctx}: se perdieron o duplicaron cartas`);
  const ids = [...st.deck, ...st.discard];
  for (const p of st.players) {
    ids.push(...p.hand);
    assert.ok(p.hand.length <= 3, `${ctx}: mano de más de 3`);
    assert.ok(!bodyHasDuplicateColors(p.body), `${ctx}: cuerpo con colores repetidos`);
    for (const s of p.body) {
      ids.push(s.organ, ...s.viruses, ...s.medicines);
      assert.equal(s.id, s.organ.id);
      assert.equal(s.organ.kind, 'organ');
      assert.ok(!(s.viruses.length && s.medicines.length), `${ctx}: virus y medicina conviven`);
      assert.ok(s.viruses.length <= 1 && s.medicines.length <= 2, `${ctx}: ranura imposible`);
    }
    if (p.out) assert.equal(p.hand.length + p.body.length, 0, `${ctx}: un jugador fuera conserva cartas`);
  }
  assert.equal(new Set(ids.map((c) => c.id)).size, 68, `${ctx}: ids repetidos`);
  assert.ok(!st.players[st.turn].out || st.winner, `${ctx}: el turno es de alguien que salió`);
}

test(`fuzz: ${GAMES} partidas bot contra bot terminan sin errores`, () => {
  const winsByReason = { organs: 0, forfeit: 0 };
  let longest = 0;
  for (let g = 0; g < GAMES; g++) {
    const n = 2 + (g % 5);
    const seed = 1000 + g * 7919;
    const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}` }));
    // Mezcla de niveles: todas easy, todas normal o alternadas
    const mode = g % 3;
    const level = (i) => (mode === 0 ? 'easy' : mode === 1 ? 'normal' : i % 2 ? 'easy' : 'normal');
    let st = createGame({ players, seed });
    checkInvariants(st, `partida ${g} (inicio)`);
    let turns = 0;
    while (!st.winner) {
      assert.ok(turns < MAX_TURNS, `partida ${g} (semilla ${seed}) no terminó en ${MAX_TURNS} turnos`);
      const idx = st.turn;
      const pid = st.players[idx].id;
      const ctx = `partida ${g} turno ${turns}`;
      let res;
      // De vez en cuando: un timeout o un abandono, para ejercitar esos caminos
      if (g % 10 === 7 && turns % 13 === 5) {
        res = advanceTimeout(st);
      } else if (g % 25 === 3 && turns === 20) {
        res = removePlayer(st, st.players[(idx + 1) % n].id);
      } else {
        const action = chooseBotAction(st, pid, { level: level(idx) });
        assert.ok(action, `${ctx}: el bot no devolvió acción`);
        // El bot también debe poder decidir con su PlayerView y los targets del view deben coincidir
        if (turns % 17 === 0) {
          const view = getPlayerView(st, pid);
          for (const c of st.players[idx].hand) {
            assert.deepEqual(getLegalTargets(view, pid, c.id), getLegalTargets(st, pid, c.id), `${ctx}: view ≠ state`);
          }
          const viewAction = chooseBotAction(view, pid, { level: level(idx) });
          assert.doesNotThrow(() => applyAction(st, pid, viewAction), `${ctx}: acción del bot con view ilegal`);
        }
        try {
          res = applyAction(st, pid, action);
        } catch (e) {
          assert.fail(`${ctx}: acción ilegal del bot ${JSON.stringify(action)} → ${e.code} ${e.message}`);
        }
      }
      assert.ok(Array.isArray(res.events));
      st = res.state;
      checkInvariants(st, ctx);
      turns++;
    }
    if (st.winner.reason === 'organs') {
      const w = st.players.find((p) => p.id === st.winner.playerId);
      const healthy = new Set(w.body.filter((s) => slotStatus(s) !== 'infected').map((s) => s.organ.color));
      assert.ok(healthy.size >= 4, `partida ${g}: ganador sin 4 órganos sanos`);
    }
    winsByReason[st.winner.reason]++;
    longest = Math.max(longest, turns);
  }
  assert.equal(winsByReason.organs + winsByReason.forfeit, GAMES);
  // Información útil al leer la salida del test
  console.log(`fuzz: ${GAMES} partidas, la más larga ${longest} acciones, victorias`, winsByReason);
});

test('fuzz: el bot normal le gana con claridad al fácil (2 jugadores)', () => {
  let normalWins = 0;
  const games = 120;
  for (let g = 0; g < games; g++) {
    const players = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
    const normalIdx = g % 2;
    let st = createGame({ players, seed: 50000 + g });
    for (let t = 0; !st.winner && t < MAX_TURNS; t++) {
      const pid = st.players[st.turn].id;
      const level = st.turn === normalIdx ? 'normal' : 'easy';
      st = applyAction(st, pid, chooseBotAction(st, pid, { level })).state;
    }
    if (st.winner.playerId === players[normalIdx].id) normalWins++;
  }
  assert.ok(normalWins / games > 0.7, `el normal sólo ganó ${normalWins}/${games}`);
});
