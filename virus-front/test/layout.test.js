// Pruebas de la geometría de la mesa (layout.js es JS puro: corre con `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, MIN_TOUCH } from '../src/features/game/layout.js';

const SIZES = [
  [1920, 1080], [1600, 900], [1366, 768], [1280, 720], // escritorio
  [844, 390], [932, 430], [740, 360], [667, 375], // celulares en horizontal
];

const inside = (r, W, H) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5;

test('las ranuras de todos los rivales llegan al mínimo táctil en cualquier pantalla y número de jugadores', () => {
  for (const [W, H] of SIZES) {
    for (let nOpp = 1; nOpp <= 5; nOpp++) {
      const L = computeLayout(W, H, nOpp);
      for (const s of L.seats) {
        assert.ok(s.card4.w >= MIN_TOUCH, `${W}×${H}, ${nOpp} rivales, asiento ${s.pos}: ranura de ${s.card4.w}px`);
      }
    }
  }
});

test('6 jugadores en 844×390: la fila de arriba usa todo el ancho y los laterales empiezan debajo', () => {
  const L = computeLayout(844, 390, 5);
  const tops = L.seats.filter((s) => s.pos === 'top');
  const sides = L.seats.filter((s) => s.pos !== 'top');
  assert.equal(tops.length, 3);
  assert.ok(tops[0].x < L.sideW, 'la fila de arriba invade la columna lateral');
  for (const s of sides) assert.ok(s.headY >= L.topH, `el avatar lateral (y=${s.headY}) queda debajo de la fila de arriba (${L.topH})`);
  // Los asientos de arriba no se enciman entre sí y caben en la pantalla
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i].x >= tops[i - 1].x + tops[i - 1].w, 'asientos de arriba encimados');
  for (const s of tops) assert.ok(inside(s, 844, 390), 'asiento fuera de la pantalla');
});

test('en escritorio la distribución de 6 jugadores no cambia (laterales desde arriba)', () => {
  for (const [W, H] of [[1920, 1080], [1280, 720]]) {
    const L = computeLayout(W, H, 5);
    for (const s of L.seats.filter((x) => x.pos !== 'top')) assert.ok(s.headY < L.topH * 0.5, `${W}×${H}: el lateral bajó sin necesidad`);
    for (const s of L.seats.filter((x) => x.pos === 'top')) assert.ok(s.x >= L.sideW, `${W}×${H}: la fila de arriba invadió los laterales`);
  }
});

test('los asientos compactos guardan espacio para el avatar sin la franja de reversos', () => {
  for (const [W, H] of SIZES) {
    const L = computeLayout(W, H, 5);
    for (const s of L.seats.filter((x) => x.compact)) {
      assert.ok(s.head >= s.avatar, `${W}×${H}: la franja (${s.head}) no alcanza para el avatar (${s.avatar})`);
    }
  }
});
