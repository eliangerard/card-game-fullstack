// Registro de efectos visuales compartido entre el reproductor de eventos, las cartas y la capa de partículas.
// - origins: de dónde debe "llegar volando" un elemento que se monta (carta de un rival, carta robada…)
// - emitFx: dispara un efecto de partículas en la capa FxLayer
// - anchors: los elementos marcados con data-anchor="…" sirven de referencia de posición

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Anclas de posición ----------

export const anchorEl = (anchor) =>
  typeof document === 'undefined' ? null : document.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`);

export const anchorRect = (anchor) => anchorEl(anchor)?.getBoundingClientRect() || null;

export const centerOf = (r) => (r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null);

// Foto de todas las anclas (para ubicar efectos de cosas que van a desaparecer)
export const snapshotAnchors = () => {
  const map = new Map();
  document.querySelectorAll('[data-anchor]').forEach((el) => map.set(el.dataset.anchor, el.getBoundingClientRect()));
  return map;
};

export const slotAnchor = (playerId, slotId) => `slot:${playerId}:${slotId}`;
export const avatarAnchor = (playerId) => `avatar:${playerId}`;
export const handAnchor = (playerId) => `hand:${playerId}`;

// ---------- Llegadas volando ----------

const origins = new Map(); // key → { x, y, flip, delay, scale, rotate, at }

// Registra que el elemento `key` (al montarse) debe venir desde el punto (x, y) de la pantalla
export const setOrigin = (key, point, opts = {}) => {
  if (!point) return;
  origins.set(key, { x: point.x, y: point.y, at: Date.now(), ...opts });
};

export const hasOrigin = (key) => origins.has(key);

// Lo llama cada carta al montarse: si tiene un origen registrado, hace el vuelo con WAAPI
// sobre el contenedor interno (no interfiere con las animaciones de layout de framer-motion)
export const playOrigin = (key, flyEl, flipEl) => {
  const o = origins.get(key);
  if (!o || !flyEl) return;
  origins.delete(key);
  if (Date.now() - o.at > 4000 || reducedMotion()) return;
  const r = flyEl.getBoundingClientRect();
  const dx = o.x - (r.left + r.width / 2);
  const dy = o.y - (r.top + r.height / 2);
  const delay = o.delay || 0;
  const duration = o.duration || 620;
  flyEl.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${o.scale ?? 0.55}) rotate(${o.rotate ?? -25}deg)`, opacity: o.fade ? 0 : 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 40}px) scale(1.12) rotate(${(o.rotate ?? -25) / 3}deg)`, opacity: 1, offset: 0.55 },
      { transform: 'none', opacity: 1 },
    ],
    { duration, delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'backwards' },
  );
  if (o.flip && flipEl) {
    flipEl.animate(
      [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.35 }, { transform: 'rotateY(0deg)' }],
      { duration: duration + 120, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' },
    );
  }
};

// ---------- Temblores ----------

export const shake = (el, strength = 8, duration = 450, rot = 1) => {
  if (!el || reducedMotion()) return;
  const s = strength;
  const r = (deg) => deg * rot;
  el.animate(
    [
      { transform: 'translate(0,0) rotate(0)' },
      { transform: `translate(${-s}px, ${s / 3}px) rotate(${r(-3)}deg)` },
      { transform: `translate(${s}px, ${-s / 3}px) rotate(${r(3)}deg)` },
      { transform: `translate(${-s * 0.8}px, 0) rotate(${r(-2)}deg)` },
      { transform: `translate(${s * 0.6}px, ${s / 4}px) rotate(${r(2)}deg)` },
      { transform: `translate(${-s * 0.3}px, 0) rotate(${r(-1)}deg)` },
      { transform: 'translate(0,0) rotate(0)' },
    ],
    { duration, easing: 'ease-in-out' },
  );
};

// Sacude la pantalla entera (explosiones grandes)
export const shakeScreen = (strength = 6) => shake(document.querySelector('.gt-root'), strength, 380, 0);

// ---------- Capa de partículas ----------

let fxSeq = 0;
const fxSubs = new Set();

export const onFx = (fn) => {
  fxSubs.add(fn);
  return () => fxSubs.delete(fn);
};

// fx = { kind: 'explosion'|'sparkles'|'glint'|'goldWave'|'puff'|'trail'|'flyCard'|'reveal'|'shuffle', ... }
export const emitFx = (fx) => {
  if (reducedMotion() && fx.kind !== 'reveal') return;
  const item = { id: ++fxSeq, ...fx };
  fxSubs.forEach((fn) => fn(item));
};
