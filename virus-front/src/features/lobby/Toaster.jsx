import { AnimatePresence, motion } from 'framer-motion';
import { useToasts } from './toasts';
import { IconCheck, IconClose, IconWarning, IconSparkle } from './icons';

const ICONS = { error: IconWarning, success: IconCheck, info: IconSparkle };

// Avisos animados arriba al centro
export const Toaster = () => {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toaster" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind] || IconSparkle;
          return (
            <motion.div
              key={t.id}
              layout
              className={`toast toast--${t.kind}`}
              initial={{ opacity: 0, y: -40, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: [0, -2, 2, 0] }}
              exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <span className="toast__icon"><Icon /></span>
              <span className="toast__text">{t.text}</span>
              <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
                <IconClose />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
