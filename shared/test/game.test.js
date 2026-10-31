import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  applyAction,
  advanceTimeout,
  removePlayer,
  getPlayerView,
  GameError,
  countAllCards,
  chooseBotAction,
} from '../engine/index.js';
import { arrange, P, handCard, slotOf, types } from './helpers.js';

const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof GameError && e.code === code, `se esperaba ${code}`);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}` }));
const discardFirst = (st) => {
  const p = st.players[st.turn];
  return applyAction(st, p.id, { type: 'discard', cardIds: [p.hand[0].id] });
};

describe('createGame', () => {
  test('reparte 3 cartas a cada uno, empieza el primero y conserva 68 cartas', () => {
    for (let n = 2; n <= 6; n++) {
      const st = createGame({ players: players(n), seed: n });
      assert.equal(st.players.length, n);
      for (const p of st.players) {
        assert.equal(p.hand.length, 3);
        assert.deepEqual(p.body, []);
        assert.equal(p.skipNext, false);
        assert.equal(p.out, false);
      }
      assert.equal(st.turn, 0);
      assert.equal(st.turnNumber, 1);
      assert.equal(st.winner, null);
      assert.equal(st.deck.length, 68 - 3 * n);
      assert.equal(st.discard.length, 0);
      assert.equal(countAllCards(st), 68);
      const ids = new Set([...st.deck, ...st.players.flatMap((p) => p.hand)].map((c) => c.id));
      assert.equal(ids.size, 68);
    }
  });

  test('misma semilla → misma partida; distinta semilla → distinto barajado', () => {
    const a = createGame({ players: players(3), seed: 123 });
    const b = createGame({ players: players(3), seed: 123 });
    const c = createGame({ players: players(3), seed: 124 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.deck, c.deck);
    assert.equal(typeof a.rngState, 'number');
  });

  test('rechaza menos de 2, más de 6 o ids repetidos', () => {
    assert.throws(() => createGame({ players: players(1) }), GameError);
    assert.throws(() => createGame({ players: players(7) }), GameError);
    assert.throws(() => createGame({ players: [{ id: 'x' }, { id: 'x' }] }), GameError);
  });

  test('sin semilla también funciona', () => {
    const st = createGame({ players: players(2) });
    assert.equal(countAllCards(st), 68);
  });
});

describe('turnos y acciones', () => {
  test('descartar de 1 a 3: van al descarte (públicas), se roba hasta 3 y pasa el turno', () => {
    const st = createGame({ players: players(3), seed: 7 });
    const hand = st.players[0].hand;
    const { state, events } = applyAction(st, 'p0', { type: 'discard', cardIds: hand.map((c) => c.id) });
    assert.deepEqual(types(events), ['discarded', 'drew', 'turn']);
    assert.deepEqual(events[0].cards, hand);
    assert.equal(events[0].count, 3);
    assert.deepEqual(events[1], { type: 'drew', playerId: 'p0', count: 3 });
    assert.deepEqual(events[2], { type: 'turn', playerId: 'p1', turnNumber: 2 });
    assert.equal(P(state, 'p0').hand.length, 3);
    assert.equal(state.discard.length, 3);
    assert.equal(state.turn, 1);
  });

  test('errores: turno, mano, descarte y acción desconocida', () => {
    const st = createGame({ players: players(2), seed: 7 });
    const [c0, c1, c2] = st.players[0].hand;
    throwsCode(() => applyAction(st, 'p1', { type: 'discard', cardIds: [st.players[1].hand[0].id] }), 'NOT_YOUR_TURN');
    throwsCode(() => applyAction(st, 'nadie', { type: 'discard', cardIds: [c0.id] }), 'NOT_YOUR_TURN');
    throwsCode(() => applyAction(st, 'p0', { type: 'discard', cardIds: [] }), 'BAD_DISCARD');
    throwsCode(() => applyAction(st, 'p0', { type: 'discard', cardIds: [c0.id, c0.id] }), 'BAD_DISCARD');
    throwsCode(() => applyAction(st, 'p0', { type: 'discard', cardIds: [c0.id, c1.id, c2.id, 'c99'] }), 'BAD_DISCARD');
    throwsCode(() => applyAction(st, 'p0', { type: 'discard', cardIds: 'c01' }), 'BAD_DISCARD');
    throwsCode(() => applyAction(st, 'p0', { type: 'discard', cardIds: ['c99'] }), 'CARD_NOT_IN_HAND');
    throwsCode(() => applyAction(st, 'p0', { type: 'play', cardId: st.players[1].hand[0].id, target: {} }), 'CARD_NOT_IN_HAND');
    throwsCode(() => applyAction(st, 'p0', { type: 'bailar' }), 'UNKNOWN_ACTION');
    throwsCode(() => applyAction(st, 'p0', null), 'UNKNOWN_ACTION');
    throwsCode(() => applyAction(st, 'p0', { type: 'pass' }), 'ILLEGAL_MOVE');
  });

  test('GameError trae code y message', () => {
    const st = createGame({ players: players(2), seed: 7 });
    try {
      applyAction(st, 'p1', { type: 'discard', cardIds: ['c01'] });
      assert.fail('debió lanzar');
    } catch (e) {
      assert.ok(e instanceof Error);
      assert.equal(e.code, 'NOT_YOUR_TURN');
      assert.equal(typeof e.message, 'string');
    }
  });

  test('las funciones no mutan el estado de entrada', () => {
    const st = createGame({ players: players(3), seed: 99 });
    const snapshot = structuredClone(st);
    discardFirst(st);
    advanceTimeout(st);
    removePlayer(st, 'p1');
    getPlayerView(st, 'p0');
    chooseBotAction(st, 'p0', { level: 'normal' });
    chooseBotAction(st, 'p0', { level: 'easy' });
    assert.deepEqual(st, snapshot);
  });

  test('turnNumber sube 1 por cambio de turno y el orden es circular', () => {
    let st = createGame({ players: players(3), seed: 5 });
    const order = [];
    for (let i = 0; i < 6; i++) {
      order.push(st.players[st.turn].id);
      st = discardFirst(st).state;
    }
    assert.deepEqual(order, ['p0', 'p1', 'p2', 'p0', 'p1', 'p2']);
    assert.equal(st.turnNumber, 7);
  });

  test('el orden de turnos salta a los que tienen out', () => {
    let st = arrange({ players: ['a', 'b', 'c', 'd'], hands: { a: ['organ:red'], c: ['organ:blue'] }, out: { b: true } });
    st = applyAction(st, 'a', { type: 'discard', cardIds: [handCard(st, 'a').id] }).state;
    assert.equal(st.players[st.turn].id, 'c');
  });

  test('pass sólo es válido con la mano vacía', () => {
    const st = arrange({ players: ['a', 'b'], hands: { b: ['organ:red'] }, deckSize: 0 });
    const { state, events } = applyAction(st, 'a', { type: 'pass' });
    assert.equal(state.players[state.turn].id, 'b');
    assert.ok(types(events).includes('turn'));
  });
});

describe('robo y rebarajado', () => {
  test('si el mazo se acaba, se baraja el descarte y pasa a ser el mazo', () => {
    const st = arrange({ hands: { a: ['organ:red', 'organ:blue', 'organ:green'] }, deckSize: 1 });
    const discardBefore = st.discard.length;
    const { state, events } = applyAction(st, 'a', { type: 'discard', cardIds: P(st, 'a').hand.map((c) => c.id) });
    const ev = events.find((e) => e.type === 'reshuffled');
    assert.ok(ev, 'hubo rebarajado');
    // Se robó 1 del mazo; luego el descarte (anterior + 3 recién descartadas) pasa a ser el mazo
    assert.equal(ev.count, discardBefore + 3);
    assert.equal(state.discard.length, 0);
    assert.equal(P(state, 'a').hand.length, 3);
    assert.deepEqual(events.find((e) => e.type === 'drew'), { type: 'drew', playerId: 'a', count: 3 });
    assert.equal(state.deck.length, discardBefore + 3 - 2);
    assert.equal(countAllCards(state), 68);
  });

  test('si aun así no alcanza, roba lo que haya', () => {
    // Estado artificial: mazo vacío, descarte vacío y el resto de las cartas en la mano de 'b'
    const st = arrange({ hands: { a: ['organ:red', 'organ:blue', 'organ:green'] }, deckSize: 0 });
    P(st, 'b').hand.push(...st.discard.splice(0));
    assert.equal(countAllCards(st), 68);
    // a juega un órgano (no va al descarte): necesita 1 y no hay nada que robar
    const r1 = applyAction(st, 'a', { type: 'play', cardId: handCard(st, 'a').id, target: { playerId: 'a' } });
    assert.ok(!types(r1.events).includes('drew'));
    assert.ok(!types(r1.events).includes('reshuffled'));
    assert.equal(P(r1.state, 'a').hand.length, 2);
    // Con 1 carta en el descarte y necesitando 2, roba sólo 1
    const s2 = structuredClone(st);
    s2.discard.push(P(s2, 'b').hand.pop());
    s2.players[0].hand.splice(1, 1); // a se queda con 2 cartas: juega 1 → necesita 2
    P(s2, 'b').hand.push(...st.players[0].hand.slice(1, 2));
    assert.equal(countAllCards(s2), 68);
    const r2 = applyAction(s2, 'a', { type: 'play', cardId: handCard(s2, 'a').id, target: { playerId: 'a' } });
    assert.deepEqual(r2.events.find((e) => e.type === 'drew'), { type: 'drew', playerId: 'a', count: 1 });
    assert.equal(r2.events.find((e) => e.type === 'reshuffled').count, 1);
    assert.equal(P(r2.state, 'a').hand.length, 2);
  });

  test('el rebarajado es determinista con la semilla', () => {
    const st = arrange({ hands: { a: ['organ:red'] }, deckSize: 0 });
    const r1 = applyAction(st, 'a', { type: 'discard', cardIds: [handCard(st, 'a').id] });
    const r2 = applyAction(st, 'a', { type: 'discard', cardIds: [handCard(st, 'a').id] });
    assert.deepEqual(r1.state, r2.state);
    assert.notEqual(r1.state.rngState, st.rngState);
  });
});

describe('victoria', () => {
  test('4 órganos de distinto color no infectados (el multi cuenta); se comprueba tras la acción', () => {
    const st = arrange({ hands: { a: ['organ:multi'] }, bodies: { a: ['red', { o: 'green', m: ['green'] }, { o: 'blue', m: ['blue', 'blue'] }] } });
    const { state, events } = applyAction(st, 'a', { type: 'play', cardId: handCard(st, 'a').id, target: { playerId: 'a' } });
    assert.deepEqual(state.winner, { playerId: 'a', reason: 'organs' });
    assert.deepEqual(events.at(-1), { type: 'win', playerId: 'a', reason: 'organs' });
    throwsCode(() => applyAction(state, 'a', { type: 'pass' }), 'GAME_OVER');
    throwsCode(() => advanceTimeout(state), 'GAME_OVER');
    assert.equal(chooseBotAction(state, 'b'), null);
  });

  test('un órgano infectado no cuenta', () => {
    const st = arrange({ hands: { a: ['organ:multi'] }, bodies: { a: ['red', 'green', { o: 'blue', v: ['blue'] }] } });
    const { state } = applyAction(st, 'a', { type: 'play', cardId: handCard(st, 'a').id, target: { playerId: 'a' } });
    assert.equal(state.winner, null);
  });

  test('curar el último órgano da la victoria', () => {
    const st = arrange({ hands: { a: ['medicine:yellow'] }, bodies: { a: ['red', 'green', 'blue', { o: 'yellow', v: ['yellow'] }] } });
    const { state } = applyAction(st, 'a', { type: 'play', cardId: handCard(st, 'a').id, target: { playerId: 'a', slotId: slotOf(st, 'a', 'yellow').id } });
    assert.equal(state.winner.playerId, 'a');
  });
});

describe('abandono', () => {
  test('sus cartas van al descarte y se le salta', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['organ:red'], b: ['virus:red', 'thief'], c: ['organ:blue'] },
      bodies: { b: [{ o: 'green', v: ['green'] }, { o: 'red', m: ['red', 'multi'] }] },
    });
    const { state, events } = removePlayer(st, 'b');
    assert.equal(P(state, 'b').out, true);
    assert.deepEqual(P(state, 'b').hand, []);
    assert.deepEqual(P(state, 'b').body, []);
    assert.equal(state.discard.length, st.discard.length + 2 + 2 + 3);
    assert.deepEqual(events, [{ type: 'playerLeft', playerId: 'b' }]);
    assert.equal(state.players[state.turn].id, 'a', 'no era su turno: no cambia');
    const next = applyAction(state, 'a', { type: 'discard', cardIds: [handCard(state, 'a').id] }).state;
    assert.equal(next.players[next.turn].id, 'c');
    throwsCode(() => applyAction(state, 'b', { type: 'pass' }), 'NOT_YOUR_TURN');
    assert.equal(countAllCards(state), 68);
  });

  test('si abandona el jugador en turno, el turno pasa', () => {
    const st = createGame({ players: players(3), seed: 3 });
    const { state, events } = removePlayer(st, 'p0');
    assert.equal(state.players[state.turn].id, 'p1');
    assert.deepEqual(types(events), ['playerLeft', 'turn']);
    assert.equal(state.turnNumber, 2);
  });

  test('si queda uno solo, gana por abandono', () => {
    const st = createGame({ players: players(3), seed: 3 });
    const r1 = removePlayer(st, 'p1');
    assert.equal(r1.state.winner, null);
    const r2 = removePlayer(r1.state, 'p0');
    assert.deepEqual(r2.state.winner, { playerId: 'p2', reason: 'forfeit' });
    assert.deepEqual(r2.events.at(-1), { type: 'win', playerId: 'p2', reason: 'forfeit' });
    assert.equal(countAllCards(r2.state), 68);
  });

  test('quitar a alguien que no está o que ya salió no hace nada', () => {
    const st = createGame({ players: players(2), seed: 3 });
    assert.deepEqual(removePlayer(st, 'nadie'), { state: st, events: [] });
    const out = removePlayer(removePlayer(createGame({ players: players(3), seed: 1 }), 'p1').state, 'p1');
    assert.deepEqual(out.events, []);
  });

  test('si abandona y el siguiente tiene skipNext, se le salta también', () => {
    const st = arrange({ players: ['a', 'b', 'c'], hands: { a: ['organ:red'] }, skipNext: { b: true } });
    const { state, events } = removePlayer(st, 'a');
    assert.equal(state.players[state.turn].id, 'c');
    assert.ok(types(events).includes('turnSkipped'));
  });
});

describe('timeout', () => {
  test('descarta 1 carta al azar con la semilla, roba y pasa el turno', () => {
    const st = createGame({ players: players(2), seed: 11 });
    const r1 = advanceTimeout(st);
    const r2 = advanceTimeout(st);
    assert.deepEqual(r1, r2, 'determinista');
    assert.deepEqual(types(r1.events), ['timeout', 'discarded', 'drew', 'turn']);
    assert.equal(r1.events[0].playerId, 'p0');
    const discarded = r1.events[1].cards[0];
    assert.ok(st.players[0].hand.some((c) => c.id === discarded.id));
    assert.equal(r1.state.discard.length, 1);
    assert.equal(r1.state.players[r1.state.turn].id, 'p1');
    assert.equal(P(r1.state, 'p0').hand.length, 3);
  });

  test('con distinta semilla el descarte puede variar (se usa el PRNG)', () => {
    const picked = new Set();
    for (let s = 0; s < 30; s++) {
      const st = createGame({ players: players(2), seed: s });
      const idx = st.players[0].hand.findIndex((c) => c.id === advanceTimeout(st).events[1].cards[0].id);
      picked.add(idx);
    }
    assert.ok(picked.size > 1);
  });

  test('timeout con la mano vacía sólo pasa el turno', () => {
    // Mazo y descarte vacíos: el resto de las cartas, en la mano de 'b'
    const st = arrange({ players: ['a', 'b'], deckSize: 0 });
    P(st, 'b').hand.push(...st.discard.splice(0));
    const { state, events } = advanceTimeout(st);
    assert.deepEqual(types(events), ['timeout', 'turn']);
    assert.equal(countAllCards(state), 68);
    assert.equal(state.players[state.turn].id, 'b');
  });
});

describe('getPlayerView', () => {
  test('sólo muestra tu mano; los demás, el número de cartas; sin mazo', () => {
    const st = createGame({ players: players(3), seed: 21 });
    const v = getPlayerView(st, 'p1');
    assert.equal(v.you, 'p1');
    assert.deepEqual(v.hand, st.players[1].hand);
    assert.equal(v.deckCount, st.deck.length);
    assert.equal(v.discardCount, 0);
    assert.equal(v.discardTop, null);
    assert.equal(v.turnPlayerId, 'p0');
    assert.equal(v.turnNumber, 1);
    assert.equal(v.winner, null);
    assert.ok(!('deck' in v));
    for (const p of v.players) {
      assert.ok(!('hand' in p), 'no se filtran manos ajenas');
      assert.equal(p.handCount, 3);
      assert.deepEqual(Object.keys(p).sort(), ['body', 'handCount', 'id', 'isTurn', 'name', 'out', 'skipNext']);
    }
    assert.deepEqual(v.players.map((p) => p.isTurn), [true, false, false]);
    // Ninguna carta de las manos ajenas aparece en la vista serializada
    const json = JSON.stringify(v);
    for (const p of st.players) {
      if (p.id === 'p1') continue;
      for (const c of p.hand) assert.ok(!json.includes(`"${c.id}"`), `filtró ${c.id}`);
    }
    for (const c of st.deck) assert.ok(!json.includes(`"${c.id}"`), `filtró el mazo (${c.id})`);
  });

  test('discardTop es la última carta del descarte; un espectador no ve manos', () => {
    const st = createGame({ players: players(2), seed: 21 });
    const { state } = discardFirst(st);
    const v = getPlayerView(state, 'p1');
    assert.deepEqual(v.discardTop, state.discard.at(-1));
    assert.equal(v.discardCount, 1);
    assert.deepEqual(getPlayerView(state, 'espectador').hand, []);
  });

  test('la vista no comparte referencias con el estado', () => {
    const st = createGame({ players: players(2), seed: 21 });
    const v = getPlayerView(st, 'p0');
    v.hand.push({ id: 'xx' });
    v.players[0].body.push({});
    assert.equal(st.players[0].hand.length, 3);
    assert.equal(st.players[0].body.length, 0);
  });
});
