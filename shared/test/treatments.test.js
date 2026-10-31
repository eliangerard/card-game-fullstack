import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, slotStatus, GameError, countAllCards, bodyHasDuplicateColors } from '../engine/index.js';
import { arrange, P, handCard, slotOf, types } from './helpers.js';

const play = (st, pid, card, target) => applyAction(st, pid, { type: 'play', cardId: card.id, target });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof GameError && e.code === code, `se esperaba ${code}`);
const ref = (st, pid, color) => ({ playerId: pid, slotId: slotOf(st, pid, color).id });

describe('trasplante', () => {
  test('intercambia dos ranuras completas entre dos jugadores (incluido quien juega)', () => {
    const st = arrange({
      hands: { a: ['transplant'] },
      bodies: { a: [{ o: 'red', v: ['red'] }], b: [{ o: 'blue', m: ['blue'] }] },
    });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red'), b: ref(st, 'b', 'blue') });
    assert.equal(slotStatus(slotOf(state, 'a', 'blue')), 'vaccinated');
    assert.equal(slotStatus(slotOf(state, 'b', 'red')), 'infected');
    assert.equal(events.filter((e) => e.type === 'slotMoved').length, 2);
    assert.equal(state.discard.at(-1).treatment, 'transplant');
    assert.equal(countAllCards(state), 68);
  });

  test('entre dos terceros', () => {
    const st = arrange({ players: ['a', 'b', 'c'], hands: { a: ['transplant'] }, bodies: { b: ['red'], c: ['green'] } });
    const { state } = play(st, 'a', handCard(st, 'a'), { a: ref(st, 'b', 'red'), b: ref(st, 'c', 'green') });
    assert.ok(slotOf(state, 'b', 'green'));
    assert.ok(slotOf(state, 'c', 'red'));
  });

  test('se pueden intercambiar dos órganos del mismo color', () => {
    const st = arrange({ hands: { a: ['transplant'] }, bodies: { a: ['red', 'blue'], b: [{ o: 'red', v: ['red'] }, 'blue'] } });
    const { state } = play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red'), b: ref(st, 'b', 'red') });
    assert.equal(slotStatus(slotOf(state, 'a', 'red')), 'infected');
    assert.ok(!bodyHasDuplicateColors(P(state, 'a').body));
  });

  test('ilegal si algún cuerpo quedaría con colores duplicados', () => {
    // a da su rojo por el azul de b, pero a ya tiene azul
    const st = arrange({ hands: { a: ['transplant'] }, bodies: { a: ['red', 'blue'], b: ['blue'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red'), b: ref(st, 'b', 'blue') }), 'ILLEGAL_MOVE');
  });

  test('ilegal con una ranura inmunizada', () => {
    const st = arrange({ hands: { a: ['transplant'] }, bodies: { a: ['red'], b: [{ o: 'blue', m: ['blue', 'multi'] }] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red'), b: ref(st, 'b', 'blue') }), 'ILLEGAL_MOVE');
  });

  test('ilegal entre dos ranuras del mismo jugador', () => {
    const st = arrange({ hands: { a: ['transplant'] }, bodies: { a: ['red', 'blue'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red'), b: ref(st, 'a', 'blue') }), 'ILLEGAL_MOVE');
  });

  test('target mal formado → BAD_TARGET', () => {
    const st = arrange({ hands: { a: ['transplant'] }, bodies: { a: ['red'], b: ['blue'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { a: ref(st, 'a', 'red') }), 'BAD_TARGET');
  });

  test('un trasplante puede hacer ganar a un tercero (y gana él, no quien juega)', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['transplant'] },
      bodies: { b: ['red', 'green', 'blue', { o: 'yellow', v: ['yellow'] }], c: ['yellow'] },
    });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { a: ref(st, 'b', 'yellow'), b: ref(st, 'c', 'yellow') });
    assert.deepEqual(state.winner, { playerId: 'b', reason: 'organs' });
    assert.equal(events.at(-1).type, 'win');
    assert.ok(!types(events).includes('turn'), 'tras la victoria no se pasa el turno');
  });
});

describe('ladrón de órganos', () => {
  test('roba la ranura completa', () => {
    const st = arrange({ hands: { a: ['thief'] }, bodies: { b: [{ o: 'green', m: ['green'] }] } });
    const { state, events } = play(st, 'a', handCard(st, 'a'), ref(st, 'b', 'green'));
    assert.equal(P(state, 'b').body.length, 0);
    assert.equal(slotStatus(slotOf(state, 'a', 'green')), 'vaccinated');
    assert.deepEqual(events.find((e) => e.type === 'slotMoved'), {
      type: 'slotMoved',
      fromPlayerId: 'b',
      toPlayerId: 'a',
      slotId: slotOf(st, 'b', 'green').id,
    });
  });

  test('ilegal si el ladrón ya tiene ese color (color repetido)', () => {
    const st = arrange({ hands: { a: ['thief'] }, bodies: { a: [{ o: 'green', v: ['green'] }], b: ['green'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), ref(st, 'b', 'green')), 'ILLEGAL_MOVE');
  });

  test('ilegal sobre inmunizado o sobre uno mismo', () => {
    const st = arrange({ hands: { a: ['thief'] }, bodies: { a: ['red'], b: [{ o: 'green', m: ['green', 'green'] }] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), ref(st, 'b', 'green')), 'ILLEGAL_MOVE');
    throwsCode(() => play(st, 'a', handCard(st, 'a'), ref(st, 'a', 'red')), 'ILLEGAL_MOVE');
  });

  test('puede robar el multi aunque tenga los cuatro colores', () => {
    const st = arrange({
      hands: { a: ['thief'] },
      bodies: { a: ['red', 'green', 'blue', { o: 'yellow', v: ['yellow'] }], b: ['multi'] },
    });
    const { state } = play(st, 'a', handCard(st, 'a'), ref(st, 'b', 'multi'));
    assert.equal(state.winner.playerId, 'a');
  });
});

describe('contagio', () => {
  test('manual: pasa los virus elegidos a órganos sanos compatibles de otros', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['contagion'] },
      bodies: { a: [{ o: 'red', v: ['red'] }, { o: 'blue', v: ['multi'] }], b: ['red', 'green'], c: ['yellow'] },
    });
    const moves = [
      { fromSlotId: slotOf(st, 'a', 'red').id, toPlayerId: 'b', toSlotId: slotOf(st, 'b', 'red').id },
      { fromSlotId: slotOf(st, 'a', 'blue').id, toPlayerId: 'c', toSlotId: slotOf(st, 'c', 'yellow').id },
    ];
    const { state, events } = play(st, 'a', handCard(st, 'a'), { moves });
    assert.equal(slotStatus(slotOf(state, 'a', 'red')), 'healthy');
    assert.equal(slotStatus(slotOf(state, 'a', 'blue')), 'healthy');
    assert.equal(slotStatus(slotOf(state, 'b', 'red')), 'infected');
    assert.equal(slotStatus(slotOf(state, 'c', 'yellow')), 'infected');
    assert.equal(events.filter((e) => e.type === 'virusMoved').length, 2);
    assert.equal(countAllCards(state), 68);
  });

  test('manual: ilegal a un órgano no sano, incompatible, propio, o dos virus al mismo destino', () => {
    const st = arrange({
      hands: { a: ['contagion'] },
      bodies: {
        a: [{ o: 'red', v: ['red'] }, { o: 'green', v: ['multi'] }, 'blue'],
        b: [{ o: 'red', m: ['red'] }, 'yellow', 'green'],
      },
    });
    const c = handCard(st, 'a');
    const from = slotOf(st, 'a', 'red').id;
    const fromMulti = slotOf(st, 'a', 'green').id;
    throwsCode(() => play(st, 'a', c, { moves: [{ fromSlotId: from, toPlayerId: 'b', toSlotId: slotOf(st, 'b', 'red').id }] }), 'ILLEGAL_MOVE');
    throwsCode(() => play(st, 'a', c, { moves: [{ fromSlotId: from, toPlayerId: 'b', toSlotId: slotOf(st, 'b', 'yellow').id }] }), 'ILLEGAL_MOVE');
    throwsCode(() => play(st, 'a', c, { moves: [{ fromSlotId: from, toPlayerId: 'a', toSlotId: slotOf(st, 'a', 'blue').id }] }), 'ILLEGAL_MOVE');
    throwsCode(
      () => play(st, 'a', c, { moves: [{ fromSlotId: slotOf(st, 'a', 'blue').id, toPlayerId: 'b', toSlotId: slotOf(st, 'b', 'yellow').id }] }),
      'ILLEGAL_MOVE',
    );
    const y = slotOf(st, 'b', 'yellow').id;
    throwsCode(
      () =>
        play(st, 'a', c, {
          moves: [
            { fromSlotId: fromMulti, toPlayerId: 'b', toSlotId: y },
            { fromSlotId: fromMulti, toPlayerId: 'b', toSlotId: slotOf(st, 'b', 'green').id },
          ],
        }),
      'ILLEGAL_MOVE',
    );
  });

  test('automático: asigna tantos como pueda (emparejamiento máximo)', () => {
    // Virus multi puede ir a rojo o azul; virus rojo sólo al rojo. Un reparto codicioso
    // (multi→rojo) dejaría al rojo sin destino; el máximo es 2.
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['contagion'] },
      bodies: { a: [{ o: 'green', v: ['multi'] }, { o: 'red', v: ['red'] }], b: ['red'], c: ['blue'] },
    });
    const { state, events } = play(st, 'a', handCard(st, 'a'), {});
    const moved = events.filter((e) => e.type === 'virusMoved');
    assert.equal(moved.length, 2);
    assert.equal(slotStatus(slotOf(state, 'b', 'red')), 'infected');
    assert.equal(slotStatus(slotOf(state, 'c', 'blue')), 'infected');
    assert.equal(P(state, 'a').body.every((s) => slotStatus(s) === 'healthy'), true);
    // El evento 'played' lleva los moves resueltos
    assert.equal(events[0].type, 'played');
    assert.equal(events[0].target.moves.length, 2);
  });

  test('se puede jugar aunque no mueva ningún virus', () => {
    const st = arrange({ hands: { a: ['contagion'] }, bodies: { a: ['red'], b: ['red'] } });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { moves: [] });
    assert.equal(events.filter((e) => e.type === 'virusMoved').length, 0);
    assert.equal(state.discard.at(-1).treatment, 'contagion');
  });

  test('moves vacío o ausente = automático', () => {
    const st = arrange({ hands: { a: ['contagion'] }, bodies: { a: [{ o: 'red', v: ['red'] }], b: ['red'] } });
    for (const target of [undefined, {}, { moves: [] }]) {
      const { events } = play(st, 'a', handCard(st, 'a'), target);
      assert.equal(events.filter((e) => e.type === 'virusMoved').length, 1);
    }
  });
});

describe('guante de látex', () => {
  test('los demás tiran la mano, pierden su turno (sólo roban) y el turno vuelve', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['glove', 'organ:red', 'organ:blue'], b: ['virus:red', 'virus:blue', 'thief'], c: ['medicine:red', 'transplant', 'organ:green'] },
    });
    const { state, events } = play(st, 'a', handCard(st, 'a', 0));
    const t = types(events);
    assert.ok(t.includes('handsDiscarded'));
    assert.deepEqual(events.find((e) => e.type === 'handsDiscarded').playerIds, ['b', 'c']);
    // b y c pierden el turno: el turno vuelve a 'a'
    assert.equal(state.players[state.turn].id, 'a');
    assert.deepEqual(
      events.filter((e) => e.type === 'turnSkipped').map((e) => e.playerId),
      ['b', 'c'],
    );
    for (const id of ['b', 'c']) {
      assert.equal(P(state, id).hand.length, 3, 'robaron 3');
      assert.equal(P(state, id).skipNext, false, 'skipNext se consume');
    }
    // Cada cambio de turno sube turnNumber: b (2), c (3), a (4)
    assert.equal(state.turnNumber, 4);
    assert.equal(countAllCards(state), 68);
  });

  test('skipNext se respeta si se pone a mano y se marca en la vista', () => {
    const st = arrange({ players: ['a', 'b', 'c'], hands: { a: ['organ:red'] }, skipNext: { b: true } });
    const { state, events } = applyAction(st, 'a', { type: 'discard', cardIds: [handCard(st, 'a').id] });
    assert.equal(state.players[state.turn].id, 'c');
    assert.deepEqual(
      events.filter((e) => e.type === 'turn').map((e) => e.playerId),
      ['b', 'c'],
    );
  });
});

describe('error médico', () => {
  test('intercambia los cuerpos completos (también lo inmunizado)', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      hands: { a: ['medicalError'] },
      bodies: { a: ['red'], b: [{ o: 'blue', m: ['blue', 'blue'] }, 'green'] },
    });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { playerId: 'b' });
    assert.equal(P(state, 'a').body.length, 2);
    assert.equal(slotStatus(slotOf(state, 'a', 'blue')), 'immunized');
    assert.ok(slotOf(state, 'b', 'red'));
    assert.deepEqual(events.find((e) => e.type === 'bodiesSwapped'), { type: 'bodiesSwapped', a: 'a', b: 'b' });
  });

  test('ilegal contra uno mismo o contra alguien que no está', () => {
    const st = arrange({ players: ['a', 'b', 'c'], hands: { a: ['medicalError'] }, out: { c: true } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'a' }), 'ILLEGAL_MOVE');
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'c' }), 'BAD_TARGET');
  });

  test('el error médico puede dar la victoria a quien lo juega', () => {
    const st = arrange({
      hands: { a: ['medicalError'] },
      bodies: { a: ['red', 'green', 'blue', 'yellow'].map((o) => ({ o, v: [o] })), b: ['red', 'green', 'blue', 'multi'] },
    });
    const { state } = play(st, 'a', handCard(st, 'a'), { playerId: 'b' });
    assert.deepEqual(state.winner, { playerId: 'a', reason: 'organs' });
  });
});

describe('desempate de la victoria', () => {
  // Estados artificiales en los que dos jugadores ya cumplen la condición antes de la acción
  const winning = ['red', 'green', 'blue', 'yellow'];

  test('si varios cumplen la condición, gana el que actuó', () => {
    const st = arrange({ players: ['a', 'b', 'c'], turn: 1, hands: { b: ['organ:multi'] }, bodies: { a: winning, b: winning.map((o) => ({ o, m: [o] })) } });
    const { state } = applyAction(st, 'b', { type: 'play', cardId: handCard(st, 'b').id, target: { playerId: 'b' } });
    assert.deepEqual(state.winner, { playerId: 'b', reason: 'organs' });
  });

  test('si el que actuó no está entre ellos, gana el primero en orden de asientos', () => {
    const st = arrange({
      players: ['a', 'b', 'c'],
      turn: 0,
      hands: { a: ['thief'] },
      bodies: { b: [...winning, 'multi'], c: winning },
    });
    // a roba el multi de b: b sigue con 4 sanos, c también → gana b (asiento anterior)
    const { state } = applyAction(st, 'a', { type: 'play', cardId: handCard(st, 'a').id, target: ref(st, 'b', 'multi') });
    assert.deepEqual(state.winner, { playerId: 'b', reason: 'organs' });
  });
});
