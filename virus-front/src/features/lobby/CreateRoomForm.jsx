import { useState } from 'react';
import { motion } from 'framer-motion';
import { IconPlus } from './icons';

const SIZES = [2, 3, 4, 5, 6];
export const ROOM_NAME_MAX = 24;

// Formulario de crear sala: nombre y máximo de jugadores (2 a 6)
export const CreateRoomForm = ({ onCreate, busy, defaultName }) => {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);

  const submit = (e) => {
    e.preventDefault();
    // Nombre vacío → el lobby pone uno por defecto ("Sala de …")
    onCreate(name.trim().slice(0, ROOM_NAME_MAX), maxPlayers);
  };

  return (
    <form className="create-room" onSubmit={submit}>
      <div className="create-room__name">
        <label className="field__label" htmlFor="room-name">Nueva sala</label>
        <input
          id="room-name"
          className="ui-input"
          value={name}
          maxLength={ROOM_NAME_MAX}
          placeholder={defaultName || 'Nombre de la sala'}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="create-room__size">
        <span className="field__label">Jugadores</span>
        <div className="segmented" role="radiogroup" aria-label="Máximo de jugadores">
          {SIZES.map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={n === maxPlayers}
              className={`segmented__opt ${n === maxPlayers ? 'is-active' : ''}`}
              onClick={() => setMaxPlayers(n)}
            >
              {n === maxPlayers && (
                <motion.span layoutId="seg-pill" className="segmented__pill" transition={{ type: 'spring', stiffness: 500, damping: 32 }} />
              )}
              <span className="segmented__label">{n}</span>
            </button>
          ))}
        </div>
      </div>
      <motion.button className="ui-btn ui-btn--primary create-room__btn" disabled={busy} whileTap={{ scale: 0.94 }}>
        {busy ? <span className="ui-spinner" /> : <IconPlus />} Crear sala
      </motion.button>
    </form>
  );
};
