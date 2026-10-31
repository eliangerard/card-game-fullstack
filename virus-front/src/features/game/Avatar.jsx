import { memo } from 'react';
import { motion } from 'framer-motion';
import avatars from '../../lib/avatars';
import { avatarAnchor } from './fx';

// Anillo de cuenta regresiva del turno: una animación CSS con la duración restante
const TurnRing = ({ size, timer }) => {
  if (!timer) return null;
  const stroke = Math.max(3, size * 0.07);
  const r = size / 2 + stroke * 0.9;
  const box = r * 2 + stroke * 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, timer.end - timer.start);
  const elapsed = Math.min(total, Math.max(0, Date.now() - timer.start));
  return (
    <svg
      key={timer.start}
      className="gt-ring"
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      style={{ left: (size - box) / 2, top: (size - box) / 2 }}
      aria-hidden
    >
      <circle className="gt-ring-track" cx={box / 2} cy={box / 2} r={r} strokeWidth={stroke} />
      <circle
        className="gt-ring-bar"
        cx={box / 2}
        cy={box / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={c}
        style={{
          '--c': c,
          animationDuration: `${total}ms`,
          animationDelay: `${-elapsed}ms`,
        }}
      />
    </svg>
  );
};

// Si el nombre tiene un ancho máximo (para no invadir el asiento vecino) puede ocupar dos renglones,
// y la letra se achica hasta que quepa la palabra más larga, sin bajar de 12 px; lo que sobre se corta con "…"
const ALIGN = { right: 'left', left: 'right', bottom: 'center' };
const nameStyle = (name, size, nameMax, compact, nameSide) => {
  if (!nameMax) return undefined;
  const base = Math.max(13, Math.min(40, size * (compact ? 0.45 : 0.27)));
  const longest = Math.max(1, ...name.split(/\s+/).map((w) => [...w].length));
  const fit = (nameMax - 14) / (longest * 0.72);
  return {
    maxWidth: nameMax,
    fontSize: Math.max(12, Math.min(base, fit)),
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    lineHeight: 1.08,
    textAlign: ALIGN[nameSide] || 'center',
  };
};

// Avatar de un jugador con su color, nombre, anillo de turno y estado
export const Avatar = memo(function Avatar({
  info, gp, size, timer, isMe = false, nameSide = 'right', targetable = false, hovered = false, onClick, compact = false, nameMax,
}) {
  const color = info?.color || '#ffae00';
  const img = avatars[info?.avatar ?? 0] || avatars[0];
  const isTurn = !!gp?.isTurn;
  const offline = info && info.connected === false;
  const out = !!gp?.out;
  const classes = [
    'gt-avatar',
    `gt-name-${nameSide}`,
    isTurn && 'is-turn',
    offline && 'is-offline',
    out && 'is-out',
    targetable && 'is-target',
    hovered && 'is-hover',
    compact && 'is-compact',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{ '--pc': color, '--as': `${size}px` }}
      onClick={onClick}
      data-drop={targetable ? 'player' : undefined}
      data-pid={gp?.id}
    >
      <motion.div
        className="gt-avatar-pic"
        data-anchor={avatarAnchor(gp?.id)}
        animate={isTurn ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={isTurn ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      >
        <img src={img} alt="" draggable={false} />
        {isTurn && <TurnRing size={size} timer={timer} />}
        {offline && !out && (
          <span className="gt-badge gt-badge-off" title="Sin conexión" aria-label="Sin conexión">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 8.5a13 13 0 0 1 18 0M6 12a8 8 0 0 1 12 0M9.2 15.4a3.5 3.5 0 0 1 5.6 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="12" cy="19" r="1.6" fill="currentColor" />
              <path d="M4 3l16 18" stroke="#ff4d4d" strokeWidth="2.8" strokeLinecap="round" />
            </svg>
          </span>
        )}
        {gp?.skipNext && !out && <span className="gt-badge gt-badge-skip">pierde turno</span>}
        {info?.isBot && <span className="gt-badge gt-badge-bot">bot</span>}
        {out && <span className="gt-badge gt-badge-out">fuera</span>}
      </motion.div>
      {nameSide !== 'none' && (
        <div className="gt-avatar-name">
          <span style={nameStyle(gp?.name || info?.name || '…', size, nameMax, compact, nameSide)}>{gp?.name || info?.name || '…'}</span>
          {isMe && <small>tú</small>}
        </div>
      )}
    </div>
  );
});
