import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { Modal } from './Modal';
import { Avatar } from './Avatar';
import { NAME_MAX, validateName } from './ProfileCard';
import { toastError } from './toasts';

// Pide el nombre antes de crear o unirse a una sala; al guardar, sigue con la acción pendiente
export const NameModal = ({ open, onClose, onDone }) => {
  const profile = useStore((s) => s.profile);
  const updateProfile = useStore((s) => s.updateProfile);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(profile.name || '');
    setShake(0);
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const error = validateName(name);

  const submit = async (e) => {
    e.preventDefault();
    if (error) { setShake((n) => n + 1); return; }
    setBusy(true);
    try {
      await updateProfile({ ...profile, name: name.trim() });
      onDone?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Antes de jugar…" labelledBy="name-modal-title">
      <form className="name-modal" onSubmit={submit}>
        <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ duration: 0.6, delay: 0.3 }}>
          <Avatar avatar={profile.avatar} color={profile.color} size={96} />
        </motion.div>
        <p className="name-modal__text">¿Cómo te van a ver los demás?</p>
        <motion.input
          ref={inputRef}
          key={shake}
          animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : undefined}
          transition={{ duration: 0.4 }}
          className="ui-input name-modal__input"
          placeholder="Tu nombre"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={shake > 0 && !!error}
          style={{ color: profile.color }}
        />
        <span className={`name-modal__hint ${shake > 0 && error ? 'is-error' : ''}`}>
          {shake > 0 && error ? error : `De 1 a ${NAME_MAX} caracteres`}
        </span>
        <button className="ui-btn ui-btn--primary" disabled={busy}>
          {busy ? <><span className="ui-spinner" /> Guardando</> : '¡Listo!'}
        </button>
      </form>
    </Modal>
  );
};
