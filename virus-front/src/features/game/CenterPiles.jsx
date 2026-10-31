import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameCard, CardBack } from './GameCard';
import logo from '../../assets/roña.png';
import { pressable } from './a11y';

// Inclinación "aleatoria" pero estable para cada carta del descarte
const tiltOf = (id = '') => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (h % 34) - 17;
};

// Centro de la mesa: el mazo (con contador) y el descarte (con la última carta)
export const CenterPiles = memo(function CenterPiles({ center, deckCount, discardTop, discardCount, tableTarget, hover, onTable }) {
  const { w, h } = center.card;
  const layers = Math.min(4, Math.max(0, Math.ceil(deckCount / 12)));
  const under = Math.min(3, Math.max(0, discardCount - 1));
  const gap = w * 0.45;

  return (
    <div
      className={`gt-center ${tableTarget ? 'is-target' : ''} ${hover === 'table' ? 'is-hover' : ''}`}
      style={{ left: center.x, top: center.y, width: center.w, height: center.h }}
      data-drop={tableTarget ? 'table' : undefined}
      {...pressable(tableTarget ? onTable : null, 'Jugar la carta en la mesa')}
    >
      <img className="gt-center-logo" src={logo} alt="" draggable={false} style={{ height: Math.min(center.h * 0.9, center.w * 0.3) }} />

      <div className="gt-piles" style={{ gap }}>
        <div className="gt-deck" data-anchor="deck" style={{ width: w, height: h }} title={`${deckCount} cartas en el mazo`}>
          {Array.from({ length: layers }, (_, i) => (
            <div key={i} className="gt-deck-layer" style={{ transform: `translate(${(i + 1) * 1.5}px, ${(i + 1) * 3}px)`, zIndex: -i - 1 }} />
          ))}
          {deckCount > 0 ? <CardBack w={w} h={h} fxKey="deck-top" className="gt-deck-top" /> : <div className="gt-pile-empty" />}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={deckCount}
              className="gt-deck-count"
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
            >
              {deckCount}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="gt-discard" data-anchor="discard" style={{ width: w, height: h }} title={`${discardCount} cartas en el descarte`}>
          {Array.from({ length: under }, (_, i) => (
            <div key={i} className="gt-discard-layer" style={{ transform: `rotate(${(i - 1) * 9 + 4}deg)` }} />
          ))}
          {!discardTop && <div className="gt-pile-empty"><span>descarte</span></div>}
          {discardTop && (
            <GameCard
              key={discardTop.id}
              card={discardTop}
              w={w}
              h={h}
              className="gt-discard-top"
              style={{ rotate: tiltOf(discardTop.id), zIndex: 5 }}
            />
          )}
        </div>
      </div>
      {tableTarget && <div className="gt-center-drop">Suelta aquí o haz clic para jugarla</div>}
    </div>
  );
});
