import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { IconWifiOff } from './icons';

// Indicador global de conexión. Móntalo una vez en App (encima de todo).
// Antes de la primera conexión dice "Conectando…" (y sólo tras una breve espera);
// si se pierde la conexión después, dice "Reconectando…".
export const ConnectionBanner = () => {
  const connected = useStore((s) => s.connected);
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

  const label = everConnected.current ? 'Reconectando' : 'Conectando con el servidor';

  return (
    <AnimatePresence>
      {visible && !connected && (
        <motion.div
          className="conn-banner"
          role="status"
          initial={{ y: -80, x: '-50%', opacity: 0 }}
          animate={{ y: 0, x: '-50%', opacity: 1 }}
          exit={{ y: -80, x: '-50%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <motion.span
            className="conn-banner__icon"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
          >
            <IconWifiOff />
          </motion.span>
          <span className="ui-dots">{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
