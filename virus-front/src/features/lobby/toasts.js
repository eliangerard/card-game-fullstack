import { create } from 'zustand';

// Mensajes en español para los códigos de error del servidor
const ERROR_TEXT = {
  ROOM_NOT_FOUND: 'Esa sala ya no existe',
  ROOM_FULL: 'La sala está llena',
  ROOM_IN_GAME: 'Esa sala ya está jugando',
  ALREADY_IN_ROOM: 'Ya estás dentro de una sala',
  NOT_HOST: 'Sólo el anfitrión puede hacer eso',
  NOT_ENOUGH_PLAYERS: 'Se necesitan al menos 2 jugadores',
  TIMEOUT: 'El servidor no respondió',
  RATE_LIMIT: '¡Más despacio! Espera un momento',
  RATE_LIMITED: '¡Más despacio! Espera un momento',
  NOT_IN_LOBBY: 'La partida ya empezó',
  NOT_IN_ROOM: 'Ya no estás en esa sala',
  NO_SESSION: 'Todavía no hay conexión con el servidor',
  SERVER_FULL: 'Hay demasiadas salas abiertas, intenta más tarde',
  PLAYER_NOT_FOUND: 'Ese jugador ya no está en la sala',
};

export const errorText = (err) =>
  (err && (ERROR_TEXT[err.code] || err.message)) || 'Algo salió mal';

let nextId = 1;

// Pila de avisos flotantes (los pinta <Toaster />)
export const useToasts = create((set, get) => ({
  toasts: [],
  push: (text, kind = 'info', ms = 3800) => {
    const id = nextId++;
    // No repetir el mismo aviso si ya está en pantalla
    if (get().toasts.some((t) => t.text === text)) return;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (text, kind) => useToasts.getState().push(text, kind);
export const toastError = (err) => toast(errorText(err), 'error');
