import { useEffect } from 'react';
import { create } from 'zustand';
import { motion } from 'framer-motion';
import soundtrack from '../../assets/roña soundtrack.mp3';
import { IconVolume, IconVolumeOff } from './icons';

// Música del lobby: un único <audio> compartido entre pantallas,
// con silencio persistido y tolerante al bloqueo de autoplay.
const MUTE_KEY = 'rona.muted';
const VOLUME = 0.35;

const readMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
};

export const useMusicStore = create((set) => ({
  muted: readMuted(),
  toggle: () => set((s) => {
    const muted = !s.muted;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* sin almacenamiento */ }
    return { muted };
  }),
}));

let audio = null;
let users = 0;
let fadeTimer = null;
let stopTimer = null;
let unlockArmed = false;

const getAudio = () => {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio(soundtrack);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
  }
  return audio;
};

const fadeTo = (target, ms = 900, done) => {
  const a = getAudio();
  if (!a) return;
  clearInterval(fadeTimer);
  const steps = 18;
  const from = a.volume;
  let i = 0;
  fadeTimer = setInterval(() => {
    i += 1;
    a.volume = Math.max(0, Math.min(1, from + ((target - from) * i) / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      done?.();
    }
  }, ms / steps);
};

// Si el navegador bloquea el autoplay, reintenta en la primera interacción
const armUnlock = () => {
  if (unlockArmed) return;
  unlockArmed = true;
  const retry = () => {
    unlockArmed = false;
    window.removeEventListener('pointerdown', retry);
    window.removeEventListener('keydown', retry);
    sync();
  };
  window.addEventListener('pointerdown', retry, { once: true });
  window.addEventListener('keydown', retry, { once: true });
};

const sync = () => {
  const a = getAudio();
  if (!a) return;
  const shouldPlay = users > 0 && !useMusicStore.getState().muted;
  if (shouldPlay) {
    clearTimeout(stopTimer);
    if (a.paused) {
      a.play().then(() => fadeTo(VOLUME)).catch(() => armUnlock());
    } else {
      fadeTo(VOLUME);
    }
  } else if (!a.paused) {
    fadeTo(0, 500, () => a.pause());
  }
};

useMusicStore.subscribe(sync);

// Mientras la pantalla que lo usa esté montada, suena la música
export const useLobbyMusic = () => {
  useEffect(() => {
    users += 1;
    sync();
    return () => {
      users -= 1;
      // Pequeña espera para que el cambio lobby → sala no corte la canción
      clearTimeout(stopTimer);
      stopTimer = setTimeout(sync, 150);
    };
  }, []);
};

export const MusicToggle = () => {
  const muted = useMusicStore((s) => s.muted);
  const toggle = useMusicStore((s) => s.toggle);
  const Icon = muted ? IconVolumeOff : IconVolume;
  return (
    <motion.button
      className="ui-icon-btn"
      onClick={toggle}
      whileHover={{ rotate: [0, -10, 10, 0] }}
      title={muted ? 'Activar música' : 'Silenciar música'}
      aria-label={muted ? 'Activar música' : 'Silenciar música'}
      aria-pressed={muted}
    >
      <motion.span key={muted ? 'off' : 'on'} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'grid' }}>
        <Icon />
      </motion.span>
    </motion.button>
  );
};
