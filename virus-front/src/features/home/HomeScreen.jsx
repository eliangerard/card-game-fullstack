import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import logo from '../../assets/roña.png';
import { Backdrop } from './Backdrop';
import { DEMO } from '../lobby/demo';
import { HowToPlayButton } from '../lobby/HowToPlay';
import { IconPlay } from '../lobby/icons';
import './home.css';

const LETTERS = 'Órganos, roñas y medicinas'.split(' ');

// Pantalla de inicio: logo, fondo animado y botón "Jugar"
export const HomeScreen = ({ onEnter, ready }) => {
  const reduce = useReducedMotion();

  // Modo demo (sólo desarrollo): entra directo al lobby
  useEffect(() => {
    if ((DEMO === 'lobby' || DEMO === 'offline') && ready) onEnter?.();
  }, [ready, onEnter]);

  // Enter también entra
  useEffect(() => {
    const onKey = (e) => e.key === 'Enter' && ready && !e.target.closest?.('input,textarea,[role=dialog]') && onEnter?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, onEnter]);

  return (
    <main className="home">
      <Backdrop />

      <div className="home__center">
        <motion.div
          className="home__logo-wrap"
          initial={{ scale: 0, rotate: -25, y: -200 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 11, delay: 0.1 }}
        >
          <motion.img
            src={logo}
            alt="Roña"
            className="home__logo"
            draggable="false"
            animate={reduce ? undefined : { y: [0, -14, 0], rotate: [-1.5, 1.5, -1.5] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            whileHover={{ scale: 1.05, rotate: [0, -4, 4, -2, 0], transition: { duration: 0.5 } }}
          />
        </motion.div>

        <p className="home__tagline">
          {LETTERS.map((w, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.12, type: 'spring', stiffness: 300, damping: 18 }}
            >
              {w}
            </motion.span>
          ))}
        </p>

        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 1.1 }}
        >
          <motion.button
            className="ui-btn ui-btn--primary ui-btn--lg home__play"
            onClick={onEnter}
            disabled={!ready}
            whileHover={ready ? { scale: 1.07, rotate: [0, -2, 2, 0] } : undefined}
            whileTap={ready ? { scale: 0.94 } : undefined}
            animate={ready && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={ready && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
          >
            {ready ? (
              <><IconPlay /> Jugar</>
            ) : (
              <><span className="ui-spinner" /> <span className="ui-dots">Conectando</span></>
            )}
          </motion.button>
        </motion.div>

        <motion.div
          className="home__extras"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <HowToPlayButton />
          <span className="home__meta">De 2 a 6 jugadores · en línea</span>
        </motion.div>
      </div>
    </main>
  );
};
