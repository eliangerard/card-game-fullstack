import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  getLegalTargets,
  getPlayerView,
  isCompatible,
  slotStatus,
  GameError,
  countAllCards,
} from '../engine/index.js';
import { arrange, P, handCard, slotOf, types, sortTargets } from './helpers.js';

const play = (st, pid, card, target) => applyAction(st, pid, { type: 'play', cardId: card.id, target });
const throwsCode = (fn, code) =>
  assert.throws(fn, (e) => e instanceof GameError && e.code === code, `se esperaba ${code}`);

describe('compatibilidad y estados', () => {
  test('isCompatible: mismo color o multi en cualquiera de los lados', () => {
    assert.ok(isCompatible('red', 'red'));
    assert.ok(isCompatible('multi', 'blue'));
    assert.ok(isCompatible('green', 'multi'));
    assert.ok(isCompatible('multi', 'multi'));
    assert.ok(!isCompatible('red', 'blue'));
  });

  test('slotStatus', () => {
    const o = { id: 'x', organ: { color: 'red' } };
    assert.equal(slotStatus({ ...o, viruses: [], medicines: [] }), 'healthy');
    assert.equal(slotStatus({ ...o, viruses: [{}], medicines: [] }), 'infected');
    assert.equal(slotStatus({ ...o, viruses: [], medicines: [{}] }), 'vaccinated');
    assert.equal(slotStatus({ ...o, viruses: [], medicines: [{}, {}] }), 'immunized');
  });
});

describe('órganos', () => {
  test('se colocan sanos en el cuerpo propio', () => {
    const st = arrange({ hands: { a: ['organ:red'] } });
    const card = handCard(st, 'a');
    const { state, events } = play(st, 'a', card, { playerId: 'a' });
    assert.equal(P(state, 'a').body.length, 1);
    assert.equal(slotStatus(P(state, 'a').body[0]), 'healthy');
    assert.equal(P(state, 'a').body[0].id, card.id);
    assert.deepEqual(types(events).slice(0, 2), ['played', 'organPlaced']);
    assert.equal(countAllCards(state), 68);
  });

  test('no se puede repetir color; el multi convive con los cuatro', () => {
    const st = arrange({ hands: { a: ['organ:red', 'organ:multi'] }, bodies: { a: ['red', 'green', 'blue', { o: 'yellow', v: ['yellow'] }] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a', 0), { playerId: 'a' }), 'ILLEGAL_MOVE');
    const { state } = play(st, 'a', handCard(st, 'a', 1), { playerId: 'a' });
    assert.equal(P(state, 'a').body.length, 5);
  });

  test('no se puede poner un órgano en otro cuerpo', () => {
    const st = arrange({ hands: { a: ['organ:red'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'b' }), 'BAD_TARGET');
  });
});

describe('virus', () => {
  test('sano → infectado (también en el cuerpo propio)', () => {
    const st = arrange({ hands: { a: ['virus:red', 'virus:red'] }, bodies: { a: ['red'], b: ['red'] } });
    const r1 = play(st, 'a', handCard(st, 'a', 0), { playerId: 'b', slotId: slotOf(st, 'b', 'red').id });
    assert.equal(slotStatus(slotOf(r1.state, 'b', 'red')), 'infected');
    assert.ok(types(r1.events).includes('infected'));
    const r2 = play(st, 'a', handCard(st, 'a', 1), { playerId: 'a', slotId: slotOf(st, 'a', 'red').id });
    assert.equal(slotStatus(slotOf(r2.state, 'a', 'red')), 'infected');
  });

  test('infectado + virus → el órgano se destruye y va al descarte con los dos virus', () => {
    const st = arrange({ hands: { a: ['virus:red'] }, bodies: { b: [{ o: 'red', v: ['multi'] }] } });
    const slot = slotOf(st, 'b', 'red');
    const before = st.discard.length;
    const { state, events } = play(st, 'a', handCard(st, 'a'), { playerId: 'b', slotId: slot.id });
    assert.equal(P(state, 'b').body.length, 0);
    const ev = events.find((e) => e.type === 'organDestroyed');
    assert.equal(ev.cards.length, 3);
    assert.equal(state.discard.length, before + 3);
    assert.equal(countAllCards(state), 68);
  });

  test('vacunado + virus → se anulan y el órgano queda sano', () => {
    const st = arrange({ hands: { a: ['virus:blue'] }, bodies: { b: [{ o: 'blue', m: ['blue'] }] } });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { playerId: 'b', slotId: slotOf(st, 'b', 'blue').id });
    assert.equal(slotStatus(slotOf(state, 'b', 'blue')), 'healthy');
    assert.ok(types(events).includes('vaccineRemoved'));
    assert.equal(state.discard.length, st.discard.length + 2);
  });

  test('inmunizado → ilegal', () => {
    const st = arrange({ hands: { a: ['virus:multi'] }, bodies: { b: [{ o: 'blue', m: ['blue', 'multi'] }] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'b', slotId: slotOf(st, 'b', 'blue').id }), 'ILLEGAL_MOVE');
  });

  test('color incompatible → ilegal; virus multi infecta cualquier órgano; cualquier virus infecta el órgano multi', () => {
    const st = arrange({
      hands: { a: ['virus:red', 'virus:multi', 'virus:green'] },
      bodies: { b: ['blue', 'multi'] },
    });
    const blue = slotOf(st, 'b', 'blue').id;
    const multi = slotOf(st, 'b', 'multi').id;
    throwsCode(() => play(st, 'a', handCard(st, 'a', 0), { playerId: 'b', slotId: blue }), 'ILLEGAL_MOVE');
    assert.equal(slotStatus(slotOf(play(st, 'a', handCard(st, 'a', 1), { playerId: 'b', slotId: blue }).state, 'b', 'blue')), 'infected');
    assert.equal(slotStatus(slotOf(play(st, 'a', handCard(st, 'a', 2), { playerId: 'b', slotId: multi }).state, 'b', 'multi')), 'infected');
  });

  test('para destruir, el segundo virus debe ser compatible con el órgano (no con el virus)', () => {
    // Órgano azul infectado por virus multi: un virus rojo no lo destruye
    const st = arrange({ hands: { a: ['virus:red', 'virus:blue'] }, bodies: { b: [{ o: 'blue', v: ['multi'] }] } });
    const slotId = slotOf(st, 'b', 'blue').id;
    throwsCode(() => play(st, 'a', handCard(st, 'a', 0), { playerId: 'b', slotId }), 'ILLEGAL_MOVE');
    const { state } = play(st, 'a', handCard(st, 'a', 1), { playerId: 'b', slotId });
    assert.equal(P(state, 'b').body.length, 0);
  });

  test('destino inexistente → BAD_TARGET', () => {
    const st = arrange({ hands: { a: ['virus:red'] }, bodies: { b: ['red'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'zzz', slotId: 'c01' }), 'BAD_TARGET');
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'b', slotId: 'c99' }), 'BAD_TARGET');
    throwsCode(() => play(st, 'a', handCard(st, 'a'), undefined), 'BAD_TARGET');
  });
});

describe('medicinas', () => {
  test('sano → vacunado → inmunizado → ilegal', () => {
    const st = arrange({ hands: { a: ['medicine:green', 'medicine:multi', 'medicine:green'] }, bodies: { a: ['green'] } });
    const slotId = slotOf(st, 'a', 'green').id;
    const r1 = play(st, 'a', handCard(st, 'a', 0), { playerId: 'a', slotId });
    assert.equal(slotStatus(slotOf(r1.state, 'a', 'green')), 'vaccinated');
    assert.ok(types(r1.events).includes('vaccinated'));
    // Volvemos el turno a 'a' para seguir probando
    const s2 = { ...r1.state, turn: 0 };
    const r2 = play(s2, 'a', P(s2, 'a').hand.find((c) => c.color === 'multi'), { playerId: 'a', slotId });
    assert.equal(slotStatus(slotOf(r2.state, 'a', 'green')), 'immunized');
    assert.ok(types(r2.events).includes('immunized'));
    const s3 = { ...r2.state, turn: 0 };
    const green = P(s3, 'a').hand.find((c) => c.kind === 'medicine' && c.color === 'green');
    throwsCode(() => play(s3, 'a', green, { playerId: 'a', slotId }), 'ILLEGAL_MOVE');
  });

  test('infectado + medicina → se anulan y queda sano', () => {
    const st = arrange({ hands: { a: ['medicine:red'] }, bodies: { a: [{ o: 'red', v: ['red'] }] } });
    const { state, events } = play(st, 'a', handCard(st, 'a'), { playerId: 'a', slotId: slotOf(st, 'a', 'red').id });
    assert.equal(slotStatus(slotOf(state, 'a', 'red')), 'healthy');
    assert.ok(types(events).includes('cured'));
    assert.equal(state.discard.length, st.discard.length + 2);
  });

  test('sólo en el cuerpo propio', () => {
    const st = arrange({ hands: { a: ['medicine:red'] }, bodies: { b: ['red'] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'b', slotId: slotOf(st, 'b', 'red').id }), 'BAD_TARGET');
  });

  test('color incompatible → ilegal; medicina multi va en cualquier órgano', () => {
    const st = arrange({ hands: { a: ['medicine:red', 'medicine:multi'] }, bodies: { a: ['blue'] } });
    const slotId = slotOf(st, 'a', 'blue').id;
    throwsCode(() => play(st, 'a', handCard(st, 'a', 0), { playerId: 'a', slotId }), 'ILLEGAL_MOVE');
    assert.equal(slotStatus(slotOf(play(st, 'a', handCard(st, 'a', 1), { playerId: 'a', slotId }).state, 'a', 'blue')), 'vaccinated');
  });

  test('curar un virus multi: lo cura la medicina compatible con el órgano (o la multi), no cualquiera', () => {
    const st = arrange({
      hands: { a: ['medicine:yellow', 'medicine:red', 'medicine:multi'] },
      bodies: { a: [{ o: 'yellow', v: ['multi'] }] },
    });
    const slotId = slotOf(st, 'a', 'yellow').id;
    const { state } = play(st, 'a', handCard(st, 'a', 0), { playerId: 'a', slotId });
    assert.equal(slotStatus(slotOf(state, 'a', 'yellow')), 'healthy');
    assert.equal(state.discard.length, st.discard.length + 2, 'virus y medicina al descarte');
    // RULES.md: "un órgano infectado por un virus multi lo cura cualquier medicina compatible con el órgano"
    throwsCode(() => play(st, 'a', handCard(st, 'a', 1), { playerId: 'a', slotId }), 'ILLEGAL_MOVE');
    const r3 = play(st, 'a', handCard(st, 'a', 2), { playerId: 'a', slotId });
    assert.equal(slotStatus(slotOf(r3.state, 'a', 'yellow')), 'healthy');
  });

  test('órgano multi infectado por un virus rojo: lo cura una roja o cualquiera (compatible con el multi)', () => {
    const st = arrange({ hands: { a: ['medicine:blue'] }, bodies: { a: [{ o: 'multi', v: ['red'] }] } });
    const { state } = play(st, 'a', handCard(st, 'a'), { playerId: 'a', slotId: slotOf(st, 'a', 'multi').id });
    assert.equal(slotStatus(slotOf(state, 'a', 'multi')), 'healthy');
  });

  test('órgano rojo infectado por virus rojo: una medicina azul no lo cura', () => {
    const st = arrange({ hands: { a: ['medicine:blue'] }, bodies: { a: [{ o: 'red', v: ['red'] }] } });
    throwsCode(() => play(st, 'a', handCard(st, 'a'), { playerId: 'a', slotId: slotOf(st, 'a', 'red').id }), 'ILLEGAL_MOVE');
  });
});

describe('getLegalTargets', () => {
  const st = arrange({
    players: ['a', 'b', 'c'],
    hands: { a: ['virus:red', 'medicine:blue', 'organ:green', 'organ:red', 'thief', 'medicalError', 'glove', 'transplant', 'contagion'] },
    bodies: {
      a: ['red', { o: 'blue', v: ['blue'] }],
      b: ['red', { o: 'green', m: ['green', 'green'] }],
      c: [{ o: 'multi', m: ['multi'] }],
    },
  });
  const ids = (cardSpec) => P(st, 'a').hand.find((c) => (c.kind === 'treatment' ? c.treatment === cardSpec : `${c.kind}:${c.color}` === cardSpec)).id;

  test('virus: todos los órganos compatibles no inmunizados de todos', () => {
    const t = getLegalTargets(st, 'a', ids('virus:red'));
    assert.deepEqual(
      sortTargets(t),
      sortTargets([
        { playerId: 'a', slotId: slotOf(st, 'a', 'red').id },
        { playerId: 'b', slotId: slotOf(st, 'b', 'red').id },
        { playerId: 'c', slotId: slotOf(st, 'c', 'multi').id },
      ]),
    );
  });

  test('medicina: sólo en lo propio y compatible', () => {
    assert.deepEqual(getLegalTargets(st, 'a', ids('medicine:blue')), [{ playerId: 'a', slotId: slotOf(st, 'a', 'blue').id }]);
  });

  test('órgano: sólo si no lo tienes', () => {
    assert.deepEqual(getLegalTargets(st, 'a', ids('organ:green')), [{ playerId: 'a' }]);
    assert.deepEqual(getLegalTargets(st, 'a', ids('organ:red')), []);
  });

  test('ladrón, error médico, guante, contagio', () => {
    assert.deepEqual(getLegalTargets(st, 'a', ids('thief')), [{ playerId: 'c', slotId: slotOf(st, 'c', 'multi').id }]);
    assert.deepEqual(getLegalTargets(st, 'a', ids('medicalError')), [{ playerId: 'b' }, { playerId: 'c' }]);
    assert.deepEqual(getLegalTargets(st, 'a', ids('glove')), [{}]);
    const cont = getLegalTargets(st, 'a', ids('contagion'));
    assert.equal(cont.length, 1);
    // El virus azul de a puede ir al rojo de b? No: azul no es compatible con rojo. Al multi de c? Está vacunado. → sin movimientos
    assert.deepEqual(cont[0], { moves: [] });
  });

  test('trasplante: todos los pares {a,b} válidos', () => {
    const t = getLegalTargets(st, 'a', ids('transplant'));
    // a.rojo↔b.rojo (mismo color, vale); a.azul↔b.rojo NO (a quedaría con dos rojos); inmunizados fuera; c vacunado sí
    const expected = [
      { a: { playerId: 'a', slotId: slotOf(st, 'a', 'red').id }, b: { playerId: 'b', slotId: slotOf(st, 'b', 'red').id } },
      { a: { playerId: 'a', slotId: slotOf(st, 'a', 'red').id }, b: { playerId: 'c', slotId: slotOf(st, 'c', 'multi').id } },
      { a: { playerId: 'a', slotId: slotOf(st, 'a', 'blue').id }, b: { playerId: 'c', slotId: slotOf(st, 'c', 'multi').id } },
      { a: { playerId: 'b', slotId: slotOf(st, 'b', 'red').id }, b: { playerId: 'c', slotId: slotOf(st, 'c', 'multi').id } },
    ];
    assert.deepEqual(sortTargets(t), sortTargets(expected));
  });

  test('funciona igual con un PlayerView que con el GameState', () => {
    const view = getPlayerView(st, 'a');
    for (const c of P(st, 'a').hand) {
      assert.deepEqual(getLegalTargets(view, 'a', c.id), getLegalTargets(st, 'a', c.id), `carta ${c.id}`);
    }
  });

  test('carta que no está en la mano → []', () => {
    assert.deepEqual(getLegalTargets(st, 'a', 'c99'), []);
    assert.deepEqual(getLegalTargets(getPlayerView(st, 'b'), 'a', ids('glove')), []);
  });

  test('todo target devuelto es aceptado por applyAction', () => {
    for (const c of P(st, 'a').hand) {
      for (const target of getLegalTargets(st, 'a', c.id)) {
        assert.doesNotThrow(() => play(st, 'a', c, target), `carta ${c.id} → ${JSON.stringify(target)}`);
      }
    }
  });
});
