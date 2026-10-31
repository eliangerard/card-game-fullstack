import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IconClose } from './icons';

// Modal genérico con fondo oscurecido; se cierra con Esc o clic fuera
export const Modal = ({ open, onClose, title, children, wide = false, labelledBy = 'modal-title' }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
        >
          <motion.div
            className={`ui-panel modal ${wide ? 'modal--wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 60, scale: 0.85, rotate: -2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, y: 40, scale: 0.9, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <header className="modal__header">
              <h2 className="ui-panel__title" id={labelledBy}>{title}</h2>
              {onClose && (
                <button className="ui-icon-btn modal__close" onClick={onClose} aria-label="Cerrar">
                  <IconClose />
                </button>
              )}
            </header>
            <div className="modal__body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
