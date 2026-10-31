import { create } from 'zustand';
import { socket, request } from '../net/socket';

const TOKEN_KEY = 'rona.token';
const PROFILE_KEY = 'rona.profile';

const savedProfile = () => {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null; } catch { return null; }
};

export const useStore = create((set, get) => ({
  connected: socket.connected,
  session: null,          // { token, playerId }
  profile: savedProfile() || { name: '', avatar: 0, color: '#ffae00' },
  rooms: [],
  room: null,             // RoomState
  chat: [],
  game: null,             // PlayerView & { turnDeadline, turnMs }
  eventQueue: [],         // lotes { seq, events } pendientes de animar

  hello: async () => {
    const res = await request('session:hello', {
      token: localStorage.getItem(TOKEN_KEY) || undefined,
      profile: get().profile.name ? get().profile : undefined,
    });
    localStorage.setItem(TOKEN_KEY, res.token);
    set({ session: { token: res.token, playerId: res.playerId }, profile: res.profile });
    get().refreshRooms();
    return res;
  },

  updateProfile: async (profile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    set({ profile });
    const res = await request('profile:update', profile);
    set({ profile: res.profile });
    return res.profile;
  },

  refreshRooms: async () => {
    const res = await request('rooms:list');
    set({ rooms: res.rooms });
  },

  createRoom: (name, maxPlayers) => request('room:create', { name, maxPlayers }),
  joinRoom: (roomId) => request('room:join', { roomId }),
  leaveRoom: async () => {
    await request('room:leave');
    set({ room: null, chat: [], game: null, eventQueue: [] });
  },
  addBot: (level = 'normal') => request('room:addBot', { level }),
  kick: (playerId) => request('room:kick', { playerId }),
  startGame: () => request('room:start'),
  rematch: () => request('room:rematch'),
  sendChat: (text) => request('room:chat', { text }),
  act: (action) => request('game:action', action),

  // La mesa saca los lotes de eventos conforme termina de animarlos
  shiftEvents: () => set((s) => ({ eventQueue: s.eventQueue.slice(1) })),
}));

// Suscripciones del servidor (una sola vez, a nivel de módulo)
socket.on('connect', () => {
  useStore.setState({ connected: true });
  useStore.getState().hello().catch(() => {});
});
socket.on('disconnect', () => useStore.setState({ connected: false }));
socket.on('rooms:update', (rooms) => useStore.setState({ rooms }));
socket.on('room:state', (room) => useStore.setState((s) => ({
  room,
  ...(room ? {} : { chat: [], game: null, eventQueue: [] }),
  ...(room && room.status === 'lobby' ? { game: null, eventQueue: [] } : {}),
})));
socket.on('room:chat', (msg) => useStore.setState((s) => ({ chat: [...s.chat.slice(-199), msg] })));
socket.on('game:events', (batch) => useStore.setState((s) => ({ eventQueue: [...s.eventQueue, batch] })));
socket.on('game:state', (game) => useStore.setState({ game }));
