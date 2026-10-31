import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, CARD_KINDS, COLORS, TREATMENTS, DECK_SIZE } from '../engine/index.js';

test('el mazo tiene 68 cartas con ids c01..c68 únicos y en orden', () => {
  const deck = createDeck();
  assert.equal(deck.length, 68);
  assert.equal(DECK_SIZE, 68);
  assert.deepEqual(
    deck.map((c) => c.id),
    Array.from({ length: 68 }, (_, i) => 'c' + String(i + 1).padStart(2, '0')),
  );
});

test('createDeck siempre devuelve el mismo orden y objetos nuevos', () => {
  const a = createDeck();
  const b = createDeck();
  assert.deepEqual(a, b);
  a[0].color = 'blue';
  assert.equal(createDeck()[0].color, 'red');
});

test('composición exacta del mazo según RULES.md', () => {
  const deck = createDeck();
  const count = (pred) => deck.filter(pred).length;
  for (const color of ['red', 'green', 'blue', 'yellow']) {
    assert.equal(count((c) => c.kind === 'organ' && c.color === color), 5, `órganos ${color}`);
    assert.equal(count((c) => c.kind === 'virus' && c.color === color), 4, `virus ${color}`);
    assert.equal(count((c) => c.kind === 'medicine' && c.color === color), 4, `medicinas ${color}`);
  }
  assert.equal(count((c) => c.kind === 'organ' && c.color === 'multi'), 1);
  assert.equal(count((c) => c.kind === 'virus' && c.color === 'multi'), 1);
  assert.equal(count((c) => c.kind === 'medicine' && c.color === 'multi'), 4);
  const tr = (t) => count((c) => c.kind === 'treatment' && c.treatment === t);
  assert.equal(tr('transplant'), 3);
  assert.equal(tr('thief'), 3);
  assert.equal(tr('contagion'), 2);
  assert.equal(tr('glove'), 1);
  assert.equal(tr('medicalError'), 1);
});

test('las cartas usan sólo los tipos/colores/tratamientos del contrato', () => {
  assert.deepEqual(CARD_KINDS, ['organ', 'virus', 'medicine', 'treatment']);
  assert.deepEqual(COLORS, ['red', 'green', 'blue', 'yellow', 'multi']);
  assert.deepEqual(TREATMENTS, ['transplant', 'thief', 'contagion', 'glove', 'medicalError']);
  for (const c of createDeck()) {
    assert.ok(CARD_KINDS.includes(c.kind));
    if (c.kind === 'treatment') {
      assert.ok(TREATMENTS.includes(c.treatment));
      assert.equal(c.color, undefined, 'los tratamientos no llevan color');
    } else {
      assert.ok(COLORS.includes(c.color));
      assert.equal(c.treatment, undefined);
    }
  }
});
