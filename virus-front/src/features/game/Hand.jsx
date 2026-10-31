import { memo, useEffect, useRef } from 'react';
import { animate, useMotionValue } from 'framer-motion';
import { GameCard } from './GameCard';
import { sfx } from '../../lib/sfx';
import { cardLabel } from '../../lib/cards';

const SPRING_BACK = { type: 'spring', stiffness: 420, damping: 30 };

// Una carta de mi mano: se selecciona con clic o se arrastra hacia un destino
const HandCard = memo(function HandCard({
  card, w, h, left, top, tilt, index, canDrag, selected, marked, idle, onClick, onDragStart, onDragMove, onDrop,
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragging = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const back = () => {
    animate(x, 0, SPRING_BACK);
    animate(y, 0, SPRING_BACK);
  };

  const classes = [
    'gt-hand-card',
    selected && 'is-selected',
    marked && 'is-marked',
    idle && 'is-idle',
  ].filter(Boolean).join(' ');

  return (
    <GameCard
      card={card}
      w={w}
      h={h}
      className={classes}
      style={{ left, top, x, y, zIndex: selected ? 30 : 10 + index }}
      animate={{ rotate: selected ? 0 : tilt }}
      drag={canDrag}
      dragMomentum={false}
      dragElastic={0.18}
      whileDrag={{ scale: 0.82, rotate: 0, zIndex: 90, cursor: 'grabbing' }}
      onDragStart={() => {
        dragging.current = true;
        onDragStart(card.id);
      }}
      onDrag={(e, info) => onDragMove(info.point)}
      onDragEnd={(e, info) => {
        // Si se soltó sobre un destino válido, se juega; si no (o falla), regresa a la mano
        Promise.resolve(onDrop(card.id, info.point)).then((ok) => {
          if (!ok && alive.current) back();
        });
        setTimeout(() => { dragging.current = false; }, 0);
      }}
      onClick={() => {
        if (dragging.current) return;
        onClick(card.id);
      }}
      onMouseEnter={() => !idle && sfx.hover()}
      role="button"
      aria-label={cardLabel(card)}
      aria-pressed={selected || marked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(card.id); }
      }}
    >
      {marked && <span className="gt-mark">✕</span>}
    </GameCard>
  );
});

// Mi mano en abanico, abajo al centro
export const Hand = memo(function Hand({
  hand, layout, myTurn, selectedId, discardMode, discardIds, onCardClick, onDragStart, onDragMove, onDrop,
}) {
  const { card, cx, top } = layout;
  const n = hand.length;
  const mid = (n - 1) / 2;
  const spacing = card.w * 0.86;

  return (
    <div className={`gt-hand ${myTurn ? 'is-my-turn' : ''} ${discardMode ? 'is-discard' : ''}`} data-anchor="hand:me">
      {hand.map((c, i) => {
        const d = i - mid;
        return (
          <HandCard
            key={c.id}
            card={c}
            index={i}
            w={card.w}
            h={card.h}
            left={cx + d * spacing - card.w / 2}
            top={top + d * d * card.h * 0.045}
            tilt={d * 7}
            canDrag={myTurn && !discardMode}
            selected={selectedId === c.id}
            marked={discardIds.includes(c.id)}
            idle={!myTurn}
            onClick={onCardClick}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDrop={onDrop}
          />
        );
      })}
    </div>
  );
});
