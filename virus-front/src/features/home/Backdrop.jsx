import { motion, useReducedMotion } from 'framer-motion';
import doodles from '../../assets/doodles.png';
import { cardImage } from '../../lib/cards';

// Cartas que flotan de fondo: posición (%), ancho base (px), giro base y ritmo (s)
const FLOATERS = [
  { card: { kind: 'organ', color: 'red' }, x: 6, y: 14, w: 120, r: -18, d: 7 },
  { card: { kind: 'virus', color: 'green' }, x: 84, y: 10, w: 110, r: 14, d: 8.5 },
  { card: { kind: 'medicine', color: 'blue' }, x: 88, y: 60, w: 130, r: -10, d: 9 },
  { card: { kind: 'treatment', treatment: 'thief' }, x: 4, y: 64, w: 125, r: 12, d: 7.8 },
  { card: { kind: 'organ', color: 'yellow' }, x: 22, y: 82, w: 95, r: -6, d: 10 },
  { card: { kind: 'virus', color: 'multi' }, x: 72, y: 84, w: 100, r: 20, d: 8.2 },
  { card: { kind: 'organ', color: 'blue' }, x: 25, y: 3, w: 85, r: 8, d: 9.5 },
  { card: { kind: 'medicine', color: 'multi' }, x: 64, y: 2, w: 80, r: -14, d: 11 },
  { card: { kind: 'treatment', treatment: 'contagion' }, x: 47, y: 88, w: 90, r: 4, d: 8.8 },
];

// Fondo morado con doodles en movimiento y, opcionalmente, cartas flotando
export const Backdrop = ({ cards = true, intensity = 1 }) => {
  const reduce = useReducedMotion();
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop__glow" />
      <div className="ui-doodles" style={{ backgroundImage: `url(${doodles})` }} />
      {cards && FLOATERS.map((f, i) => (
        <motion.div
          key={i}
          className="backdrop__card"
          style={{
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: `clamp(${Math.round(f.w * 0.5)}px, ${((f.w / 1440) * 100).toFixed(2)}vw, ${Math.round(f.w * 1.3)}px)`,
          }}
          initial={{ opacity: 0, scale: 0.2, rotate: f.r - 120, y: 140 }}
          animate={{ opacity: intensity, scale: 1, rotate: f.r, y: 0 }}
          transition={{ type: 'spring', stiffness: 90, damping: 13, delay: 0.3 + 0.07 * i }}
        >
          <motion.img
            src={cardImage(f.card, 'sm')}
            alt=""
            draggable="false"
            animate={reduce ? undefined : { rotate: [0, 9, -7, 0], y: [0, -20, 10, 0] }}
            transition={{ duration: f.d, repeat: Infinity, ease: 'easeInOut', delay: 1.2 + 0.1 * i }}
          />
        </motion.div>
      ))}
    </div>
  );
};
