// Modo de demostración SÓLO para desarrollo: ?demo=lobby | ?demo=room | ?demo=room-guest | ?demo=offline
// Rellena el store con datos falsos y sustituye las acciones de red por versiones locales,
// para poder ver y probar las pantallas sin el servidor. En producción no hace nada.
import { useStore } from '../../store/useStore';

const param = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('demo') : null;
export const DEMO = import.meta.env.DEV ? param : null;

const ME = 'p-me';
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
let seq = 100;
const msg = (from, text, system = false) => ({ id: `m${seq++}`, from, text, ts: Date.now(), system });

const BOT_NAMES = ['Doctora Chancla', 'Bot Mocoso', 'Sr. Estornudo', 'La Tía Gripa', 'Robotín'];
const BOT_COLORS = ['#20c040', '#1e90ff', '#ff4d4d', '#c070ff', '#ff7ab6'];

const demoRooms = [
  { id: 'r1', name: 'Los de la prepa', playerCount: 3, maxPlayers: 6, status: 'lobby', hostName: 'Vane' },
  { id: 'r2', name: 'Roña en familia', playerCount: 4, maxPlayers: 4, status: 'lobby', hostName: 'Elian' },
  { id: 'r3', name: 'Torneo relámpago', playerCount: 5, maxPlayers: 6, status: 'playing', hostName: 'Misael' },
  { id: 'r4', name: 'Sólo novatos', playerCount: 1, maxPlayers: 2, status: 'lobby', hostName: 'Adán' },
];

const demoRoom = (host) => ({
  id: 'r-demo',
  name: 'La sala perrona',
  hostId: host ? ME : 'p-vane',
  maxPlayers: 6,
  status: 'lobby',
  players: [
    { id: 'p-vane', name: 'Vane', avatar: 0, color: '#c070ff', isBot: false, connected: true },
    { id: ME, name: 'Adán', avatar: 3, color: '#1e90ff', isBot: false, connected: true },
    { id: 'p-elian', name: 'Elian', avatar: 1, color: '#20c040', isBot: false, connected: false },
    { id: 'b-1', name: 'Doctora Chancla', avatar: 6, color: '#ff4d4d', isBot: true, connected: true },
  ].sort((a, b) => (a.id === (host ? ME : 'p-vane') ? -1 : b.id === (host ? ME : 'p-vane') ? 1 : 0)),
});

const vane = { id: 'p-vane', name: 'Vane', color: '#c070ff' };
const elian = { id: 'p-elian', name: 'Elian', color: '#20c040' };

const demoChat = () => [
  msg(null, 'Vane creó la sala', true),
  msg(vane, '¡Hola! ¿Quién se avienta una partida?'),
  msg(null, 'Adán se unió', true),
  msg({ id: ME, name: 'Adán', color: '#1e90ff' }, 'Yo mero, pero no me infecten el cerebro 🧠'),
  msg(elian, 'jajaja nadie promete nada'),
  msg(null, 'Elian se desconectó', true),
  msg(vane, 'Le pongo un bot mientras regresa'),
];

const install = () => {
  const set = useStore.setState;
  const get = useStore.getState;
  const profile = DEMO === 'lobby' ? { name: '', avatar: 2, color: '#ffae00' } : { name: 'Adán', avatar: 3, color: '#1e90ff' };

  const me = () => ({ id: ME, name: get().profile.name || 'Tú', color: get().profile.color });

  const roomFromSummary = (summary, host) => ({
    id: summary.id,
    name: summary.name,
    hostId: host ? ME : 'p-vane',
    maxPlayers: summary.maxPlayers,
    status: 'lobby',
    players: [
      ...(host ? [] : [{ id: 'p-vane', name: summary.hostName, avatar: 0, color: '#c070ff', isBot: false, connected: true }]),
      { id: ME, name: get().profile.name, avatar: get().profile.avatar, color: get().profile.color, isBot: false, connected: true },
    ],
  });

  set({
    connected: DEMO !== 'offline',
    session: { token: 'demo', playerId: ME },
    profile,
    rooms: demoRooms,
    room: DEMO === 'room' ? demoRoom(true) : DEMO === 'room-guest' ? demoRoom(false) : null,
    chat: DEMO && DEMO.startsWith('room') ? demoChat() : [],

    hello: async () => ({}),
    refreshRooms: async () => { await wait(400); set({ rooms: [...demoRooms] }); },
    updateProfile: async (p) => { await wait(450); set({ profile: p }); return p; },
    createRoom: async (name, maxPlayers) => {
      await wait();
      const summary = { id: `r${seq++}`, name, playerCount: 1, maxPlayers, status: 'lobby', hostName: get().profile.name };
      set({ room: roomFromSummary(summary, true), chat: [msg(null, `${get().profile.name} creó la sala`, true)] });
      return { ok: true, roomId: summary.id };
    },
    joinRoom: async (roomId) => {
      await wait();
      const summary = get().rooms.find((r) => r.id === roomId);
      if (!summary) throw { code: 'ROOM_NOT_FOUND', message: 'La sala no existe' };
      if (summary.playerCount >= summary.maxPlayers) throw { code: 'ROOM_FULL', message: 'La sala está llena' };
      set({ room: roomFromSummary(summary, false), chat: [msg(null, `${get().profile.name} se unió`, true)] });
      return { ok: true };
    },
    leaveRoom: async () => { await wait(150); set({ room: null, chat: [], game: null, eventQueue: [] }); },
    addBot: async (level) => {
      await wait(200);
      const room = get().room;
      if (room.players.length >= room.maxPlayers) throw { code: 'ROOM_FULL', message: 'La sala está llena' };
      const n = room.players.filter((p) => p.isBot).length;
      const bot = {
        id: `b-${seq++}`,
        name: `${BOT_NAMES[n % BOT_NAMES.length]}${level === 'easy' ? ' (fácil)' : ''}`,
        avatar: (n * 4 + 5) % 9,
        color: BOT_COLORS[n % BOT_COLORS.length],
        isBot: true,
        connected: true,
      };
      set({ room: { ...room, players: [...room.players, bot] }, chat: [...get().chat, msg(null, `${bot.name} se unió`, true)] });
      return { ok: true };
    },
    kick: async (playerId) => {
      await wait(150);
      const room = get().room;
      const gone = room.players.find((p) => p.id === playerId);
      set({
        room: { ...room, players: room.players.filter((p) => p.id !== playerId) },
        chat: [...get().chat, msg(null, `${gone?.name} fue expulsado`, true)],
      });
      return { ok: true };
    },
    startGame: async () => {
      await wait(300);
      throw { code: 'DEMO', message: 'Modo demo: aquí empezaría la partida' };
    },
    sendChat: async (text) => {
      if (text === 'error') throw { code: 'RATE_LIMIT', message: 'Demasiados mensajes' };
      set({ chat: [...get().chat, msg(me(), text)] });
      await wait(900);
      set({ chat: [...get().chat, msg(vane, ['jaja', '¡Va!', 'Ya empieza, anfitrión 👀', 'Cuidado con mi ladrón de órganos'][seq % 4])] });
      return { ok: true };
    },
  });
};

if (DEMO) install();
