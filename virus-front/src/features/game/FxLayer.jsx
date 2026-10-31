import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { onFx } from './fx';
import { BACK_IMAGE, cardImage, cardLabel, TREATMENT_HELP } from '../../lib/cards';

const DURATION = {
  explosion: 1100, sparkles: 1200, glint: 900, goldWave: 1600, puff: 1000, trail: 1000, flyCard: 900, reveal: 1500, shuffle: 1000, swirl: 1100,
};

const rand = (a, b) => a + Math.random() * (b - a);

// Partículas que salen disparadas desde un punto
const Burst = ({ x, y, n, colors, dist, size, cls, spread = 360, up = 0 }) =>
  Array.from({ length: n }, (_, i) => {
    const ang = ((spread === 360 ? (i / n) * 360 : -90 - spread / 2 + (i / n) * spread) + rand(-12, 12)) * (Math.PI / 180);
    const d = dist * rand(0.55, 1.15);
    return (
      <span
        key={i}
        className={`fx-p ${cls}`}
        style={{
          left: x,
          top: y,
          width: size * rand(0.6, 1.3),
          height: size * rand(0.6, 1.3),
          background: colors[i % colors.length],
          '--dx': `${Math.cos(ang) * d}px`,
          '--dy': `${Math.sin(ang) * d - up}px`,
          '--r': `${rand(-260, 260)}deg`,
          animationDelay: `${rand(0, 90)}ms`,
        }}
      />
    );
  });

const Explosion = ({ x, y, w = 80, color = '#ff4d4d' }) => (
  <>
    <span className="fx-flash" style={{ left: x, top: y, width: w * 2.2, height: w * 2.2 }} />
    <span className="fx-ring fx-ring-boom" style={{ left: x, top: y, width: w * 0.6, height: w * 0.6, borderColor: color }} />
    <Burst x={x} y={y} n={26} colors={[color, '#fff', '#ffae00', '#653FD3', color]} dist={w * 1.9} size={w * 0.16} cls="fx-burst" />
    <Burst x={x} y={y} n={8} colors={['#3a2380', '#2b1a66']} dist={w * 1.3} size={w * 0.32} cls="fx-debris" />
  </>
);

const Sparkles = ({ x, y, w = 80, colors = ['#fff', '#ffe066', '#9dffb0'] }) => (
  <>
    <span className="fx-ring fx-ring-soft" style={{ left: x, top: y, width: w, height: w, borderColor: '#9dffb0' }} />
    <Burst x={x} y={y} n={16} colors={colors} dist={w * 1.1} size={w * 0.2} cls="fx-star" up={w * 0.3} />
  </>
);

const Glint = ({ x, y, w = 80 }) => (
  <>
    <span className="fx-ring fx-ring-soft" style={{ left: x, top: y, width: w * 0.8, height: w * 0.8, borderColor: '#7fe9ff' }} />
    <Burst x={x} y={y} n={10} colors={['#7fe9ff', '#fff']} dist={w * 0.8} size={w * 0.16} cls="fx-star" up={w * 0.15} />
  </>
);

const GoldWave = ({ x, y, w = 80 }) => (
  <>
    {[0, 1, 2].map((i) => (
      <span key={i} className="fx-ring fx-ring-gold" style={{ left: x, top: y, width: w, height: w, animationDelay: `${i * 170}ms` }} />
    ))}
    <span className="fx-flash fx-flash-gold" style={{ left: x, top: y, width: w * 2, height: w * 2 }} />
    <Burst x={x} y={y} n={22} colors={['#ffd34d', '#fff3b0', '#ffae00', '#fff']} dist={w * 1.6} size={w * 0.18} cls="fx-star" />
  </>
);

const Puff = ({ x, y, w = 80 }) => (
  <>
    <Burst x={x} y={y} n={12} colors={['#8cff4d', '#4fd11f', '#c6ff8a', '#2f8f12']} dist={w * 0.75} size={w * 0.3} cls="fx-blob" up={w * 0.25} />
    <Burst x={x} y={y} n={8} colors={['#b7ff7a']} dist={w * 1.1} size={w * 0.1} cls="fx-bubble" up={w * 0.6} spread={120} />
  </>
);

// Un virus "salta" de un cuerpo a otro (contagio)
const Trail = ({ from, to, w = 60 }) => {
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - Math.max(60, Math.abs(from.x - to.x) * 0.25);
  return (
    <>
      <motion.span
        className="fx-germ"
        style={{ left: 0, top: 0, width: w * 0.5, height: w * 0.5, marginLeft: -w * 0.25, marginTop: -w * 0.25 }}
        initial={{ x: from.x, y: from.y, scale: 0.4 }}
        animate={{ x: [from.x, midX, to.x], y: [from.y, midY, to.y], scale: [0.4, 1.3, 0.8], rotate: [0, 360, 720] }}
        transition={{ duration: 0.75, ease: 'easeInOut' }}
      />
      {[1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="fx-germ fx-germ-tail"
          style={{ left: 0, top: 0, width: w * (0.42 - i * 0.07), height: w * (0.42 - i * 0.07), marginLeft: -w * (0.21 - i * 0.035), marginTop: -w * (0.21 - i * 0.035) }}
          initial={{ x: from.x, y: from.y, opacity: 0 }}
          animate={{ x: [from.x, midX, to.x], y: [from.y, midY, to.y], opacity: [0, 0.8, 0] }}
          transition={{ duration: 0.75, ease: 'easeInOut', delay: i * 0.05 }}
        />
      ))}
    </>
  );
};

// Una carta que viaja de un punto a otro (manos al descarte, robos de los rivales…)
const FlyCard = ({ from, to, w, h, card, faceDown, delay = 0, rotate = 0 }) => (
  <motion.img
    className="fx-card"
    src={faceDown || !card ? BACK_IMAGE : cardImage(card, 'sm')}
    alt=""
    style={{ left: 0, top: 0, width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2 }}
    initial={{ x: from.x, y: from.y, rotate: rotate - 30, scale: 0.9, opacity: 0 }}
    animate={{
      x: [from.x, (from.x + to.x) / 2, to.x],
      y: [from.y, Math.min(from.y, to.y) - 50, to.y],
      rotate: [rotate - 30, rotate + 160, rotate + 360],
      scale: [0.9, 1.1, 0.85],
      opacity: [1, 1, 0],
    }}
    transition={{ duration: 0.65, delay: delay / 1000, ease: 'easeInOut', times: [0, 0.5, 1] }}
  />
);

// Carta grande al centro cuando un rival juega un tratamiento
const Reveal = ({ card, who }) => (
  <motion.div
    className="fx-reveal"
    initial={{ scale: 0.3, opacity: 0, rotate: -18, y: 40 }}
    animate={{ scale: [0.3, 1.08, 1, 1, 0.8], opacity: [0, 1, 1, 1, 0], rotate: [-18, 4, 0, 0, 8], y: [40, 0, 0, 0, -30] }}
    transition={{ duration: 1.45, times: [0, 0.22, 0.32, 0.8, 1] }}
  >
    <img src={cardImage(card, 'big')} alt="" />
    <div className="fx-reveal-label">
      {who && <small>{who}</small>}
      <strong>{cardLabel(card)}</strong>
      {card.kind === 'treatment' && <span>{TREATMENT_HELP[card.treatment]}</span>}
    </div>
  </motion.div>
);

// Barajeo: reversos que giran alrededor del mazo
const Shuffle = ({ x, y, w, h }) =>
  [0, 1, 2, 3].map((i) => (
    <motion.img
      key={i}
      className="fx-card"
      src={BACK_IMAGE}
      alt=""
      style={{ left: x - w / 2, top: y - h / 2, width: w, height: h }}
      animate={{ x: [0, (i % 2 ? 1 : -1) * w * 0.9, 0], rotate: [0, (i % 2 ? 1 : -1) * 25, 0], y: [0, -10 * i, 0] }}
      transition={{ duration: 0.8, delay: i * 0.06, ease: 'easeInOut' }}
    />
  ));

// Remolino que cruza dos cuerpos (error médico / trasplante)
const Swirl = ({ from, to, w = 80 }) => (
  <>
    <Trail from={from} to={to} w={w * 0.9} />
    <Trail from={to} to={from} w={w * 0.9} />
  </>
);

const RENDER = {
  explosion: Explosion, sparkles: Sparkles, glint: Glint, goldWave: GoldWave, puff: Puff, trail: Trail,
  flyCard: FlyCard, reveal: Reveal, shuffle: Shuffle, swirl: Swirl,
};

// Capa de efectos encima de la mesa (no recibe clics)
export const FxLayer = memo(function FxLayer() {
  const [items, setItems] = useState([]);
  useEffect(() => onFx((fx) => {
    setItems((list) => [...list.slice(-60), fx]);
    const ttl = (DURATION[fx.kind] || 1000) + (fx.delay || 0) + 100;
    setTimeout(() => setItems((list) => list.filter((f) => f.id !== fx.id)), ttl);
  }), []);

  return (
    <div className="fx-layer" aria-hidden>
      {items.map((fx) => {
        const C = RENDER[fx.kind];
        return C ? <C key={fx.id} {...fx} /> : null;
      })}
    </div>
  );
});
