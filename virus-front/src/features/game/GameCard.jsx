import { forwardRef, memo, useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BACK_IMAGE, cardImage, cardLabel } from '../../lib/cards';
import { playOrigin } from './fx';

// Transición de las cartas cuando cambian de contenedor (mano → ranura → descarte…)
export const CARD_LAYOUT_TRANSITION = { type: 'spring', stiffness: 260, damping: 26, mass: 0.9 };

// Carta de la mesa. Capas:
//   motion.div (layoutId = card.id: vuela sola entre contenedores)
//     .gc-fly   (WAAPI: llegada desde un avatar o el mazo, temblores)
//       .gc-lift (CSS: levantarse al pasar el ratón / al seleccionarla)
//         .gc-flip (volteo 3D: frente y reverso)
const GameCardBase = forwardRef(function GameCard(
  { card, w, h, faceDown = false, fxKey, className = '', style, children, layoutId, noLayout = false, ...rest },
  outerRef,
) {
  const flyRef = useRef(null);
  const flipRef = useRef(null);
  const elRef = useRef(null);
  const key = fxKey || card?.id;

  // Si el reproductor de eventos registró un origen para esta carta, llega volando desde ahí
  useLayoutEffect(() => {
    playOrigin(key, flyRef.current, flipRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRefs = (el) => {
    elRef.current = el;
    if (typeof outerRef === 'function') outerRef(el);
    else if (outerRef) outerRef.current = el;
  };

  // Mientras vuela por un cambio de layout, que pase por encima de todo
  const raise = () => { if (elRef.current) elRef.current.style.zIndex = 60; };
  const lower = () => { if (elRef.current) elRef.current.style.zIndex = ''; };

  const id = layoutId !== undefined ? layoutId : (!faceDown && card ? card.id : undefined);
  const front = faceDown ? BACK_IMAGE : cardImage(card, 'sm');

  return (
    <motion.div
      ref={setRefs}
      layoutId={noLayout ? undefined : id}
      layout={noLayout ? false : true}
      transition={CARD_LAYOUT_TRANSITION}
      onLayoutAnimationStart={raise}
      onLayoutAnimationComplete={lower}
      className={`gc ${className}`}
      style={{ width: w, height: h, ...style }}
      data-card-id={!faceDown && card ? card.id : undefined}
      data-fx-key={key}
      {...rest}
    >
      <div className="gc-fly" ref={flyRef}>
        <div className="gc-lift">
          <div className="gc-flip" ref={flipRef}>
            <img className="gc-face gc-front" src={front} alt={faceDown ? 'Carta boca abajo' : cardLabel(card)} draggable={false} />
            <img className="gc-face gc-back" src={BACK_IMAGE} alt="" draggable={false} />
          </div>
          {children}
        </div>
      </div>
    </motion.div>
  );
});

export const GameCard = memo(GameCardBase);

// Reverso simple sin layoutId (manos de los rivales, mazo)
export const CardBack = memo(function CardBack({ w, h, fxKey, className = '', style }) {
  const flyRef = useRef(null);
  useLayoutEffect(() => {
    playOrigin(fxKey, flyRef.current, null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`gc gc-plain ${className}`} style={{ width: w, height: h, ...style }} data-fx-key={fxKey}>
      <div className="gc-fly" ref={flyRef}>
        <img className="gc-face gc-front" src={BACK_IMAGE} alt="" draggable={false} />
      </div>
    </div>
  );
});
