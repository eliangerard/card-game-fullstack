import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { IconWifiOff } from './icons';

// Indicador global de conexión (montado una vez en App, encima de todo).
// Antes de la primera conexión dice "Conectando…" (y sólo tras una breve espera);
// si se pierde la conexión después, dice "Reconectando…". Si otra pestaña tomó
// la sesión, el servidor corta esta y se ofrece recuperarla aquí.
export const ConnectionBanner = () => {
  const connected = useStore((s) => s.connected);
  const replaced = useStore((s) => s.replaced);
  const isDemo = useStore((s) => !!s.demo);
  const everConnected = useRef(connected);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (connected) {
      everConnected.current = true;
      setVisible(false);
      return undefined;
    }
    const t = setTimeout(() => setVisible(true), everConnected.current ? 250 : 1500);
    return () => clearTimeout(t);
  }, [connected]);

  // La mesa de demostración no usa el servidor
  if (isDemo) return null;

  const label = everConnected.current ? 'Reconectando' : 'Conectando con el servidor';
  const show = replaced || (visible && !connected);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={replaced ? 'replaced' : 'offline'}
          className="conn-banner"
          role="status"
          initial={{ y: -80, x: '-50%', opacity: 0 }}
          animate={{ y: 0, x: '-50%', opacity: 1 }}
          exit={{ y: -80, x: '-50%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <motion.span
            className="conn-banner__icon"
            animate={replaced ? { opacity: 1 } : { opacity: [1, 0.35, 1] }}
            transition={replaced ? { duration: 0.2 } : { repeat: Infinity, duration: 1.2 }}
          >
            <IconWifiOff />
          </motion.span>
          {replaced ? (
            <>
              <span>Abriste Roña en otra pestaña</span>
              <button type="button" className="conn-banner__btn" onClick={() => useStore.getState().reclaim()}>
                Jugar aquí
              </button>
            </>
          ) : (
            <span className="ui-dots">{label}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
