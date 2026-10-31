// Servidor de Roña: Express (HTTP) + Socket.IO (tiempo real).
// `createServer` arma una instancia aislada (los tests levantan varias en puertos aleatorios);
// si este archivo se ejecuta directamente, arranca en PORT (3001 por defecto).
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { toClientError } from './errors.js';
import { SessionStore, defaultProfile } from './sessions.js';
import { RoomManager } from './rooms.js';
import { parseProfile, parseProfileLoose, parseToken, isPlainObject } from './validate.js';

const envInt = (name, def) => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

// Límite de eventos por socket (antiflood general, aparte del límite del chat)
const FLOOD_MAX = 40;
const FLOOD_WINDOW_MS = 2000;

function makeLogger(enabled) {
  const stamp = () => new Date().toISOString().slice(11, 19);
  if (!enabled) return { info() {}, warn() {}, error() {} };
  return {
    info: (...a) => console.log(`[${stamp()}]`, ...a),
    warn: (...a) => console.warn(`[${stamp()}] AVISO:`, ...a),
    error: (...a) => console.error(`[${stamp()}] ERROR:`, ...a),
  };
}

/**
 * Crea el servidor sin escuchar todavía.
 * @param {object} [opts]
 * @param {number} [opts.turnMs]               turno normal (TURN_MS, 40 s)
 * @param {number} [opts.disconnectedTurnMs]   turno de un desconectado (DISCONNECTED_TURN_MS, 8 s)
 * @param {number} [opts.reconnectTurnMs]      margen mínimo al volver en tu turno (15 s)
 * @param {number} [opts.graceMs]              asiento guardado al desconectarse (GRACE_MS, 60 s)
 * @param {number} [opts.botMinMs] [opts.botMaxMs]  lo que "piensa" un bot (900–1600 ms)
 * @param {number} [opts.seed]                 semilla fija para las partidas (tests)
 * @param {boolean} [opts.fixedSeats]          no barajar asientos al empezar (tests)
 * @param {string}  [opts.clientOrigin]        CORS; por defecto cualquier origen
 * @param {boolean} [opts.log]                 logs en consola
 */
export function createServer(opts = {}) {
  const timing = {
    turnMs: opts.turnMs ?? envInt('TURN_MS', 40_000),
    disconnectedTurnMs: opts.disconnectedTurnMs ?? envInt('DISCONNECTED_TURN_MS', 8_000),
    reconnectTurnMs: opts.reconnectTurnMs ?? envInt('RECONNECT_TURN_MS', 15_000),
    botMinMs: opts.botMinMs ?? envInt('BOT_MIN_MS', 900),
    botMaxMs: opts.botMaxMs ?? envInt('BOT_MAX_MS', 1600),
    seed: opts.seed,
    fixedSeats: !!opts.fixedSeats,
  };
  const graceMs = opts.graceMs ?? envInt('GRACE_MS', 60_000);
  const log = makeLogger(opts.log ?? process.env.LOG !== '0');

  const originSetting = opts.clientOrigin ?? process.env.CLIENT_ORIGIN;
  const origin = originSetting ? originSetting.split(',').map((s) => s.trim()).filter(Boolean) : true;

  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024,
  });

  let rooms = null;
  let closing = false;
  const sessions = new SessionStore({
    graceMs,
    log,
    onGraceExpired: (session) => rooms.onGraceExpired(session),
  });
  rooms = new RoomManager({ io, sessions, timing, log });

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.get('/rooms', (req, res) => res.json(rooms.list()));
  app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'No existe' } }));
  // Express 4 necesita los 4 parámetros para reconocer el manejador de errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log.error('Error HTTP:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  // ---------- sockets ----------

  io.on('connection', (socket) => {
    const flood = [];

    // Registra un manejador con ack: valida, atrapa cualquier excepción y responde siempre
    const handle = (event, fn, { needsSession = true } = {}) => {
      socket.on(event, (...args) => {
        const ack = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        const reply = (res) => {
          if (!ack) return;
          try { ack(res); } catch (err) { log.error(`Fallo al responder ${event}:`, err); }
        };
        const now = Date.now();
        while (flood.length && now - flood[0] > FLOOD_WINDOW_MS) flood.shift();
        if (flood.length >= FLOOD_MAX) {
          reply({ ok: false, error: { code: 'RATE_LIMITED', message: 'Demasiadas peticiones, más despacio' } });
          return;
        }
        flood.push(now);
        try {
          const session = sessions.getBySocket(socket.id);
          if (needsSession && !session) {
            reply({ ok: false, error: { code: 'NO_SESSION', message: 'Primero manda session:hello' } });
            return;
          }
          const data = fn(args[0], session) || {};
          reply({ ok: true, ...data });
        } catch (err) {
          const error = toClientError(err);
          if (error.code === 'INTERNAL') log.error(`Error en ${event}:`, err);
          reply({ ok: false, error });
        }
      });
    };

    handle('session:hello', (payload) => {
      const p = isPlainObject(payload) ? payload : {};
      const token = parseToken(p.token);
      let session = sessions.getByToken(token);
      const restored = !!session;
      if (!session) session = sessions.create(parseProfileLoose(p.profile, defaultProfile()));
      else if (p.profile !== undefined) session.profile = parseProfileLoose(p.profile, session.profile);

      // Si este socket ya era de otra sesión, se suelta de ella y de los canales de su sala
      const current = sessions.getBySocket(socket.id);
      const switching = current && current !== session ? current : null;
      if (switching) {
        for (const r of socket.rooms) if (r.startsWith('room:')) socket.leave(r);
      }
      const previous = sessions.attach(session, socket.id);
      if (switching) rooms.onDisconnected(switching);
      if (previous) {
        // Otra pestaña tenía esta sesión: se le avisa y se corta (no se reconecta sola)
        const old = io.sockets.sockets.get(previous);
        if (old) {
          old.emit('session:replaced');
          old.disconnect(true);
        }
      }
      if (restored) {
        log.info(`${session.profile.name} recuperó su sesión`);
        if (session.roomId) rooms.onProfileChanged(session);
        rooms.onSessionRestored(session);
      }
      return { token: session.token, playerId: session.playerId, profile: session.profile, roomId: session.roomId };
    }, { needsSession: false });

    handle('profile:update', (payload, session) => {
      session.profile = parseProfile(payload);
      rooms.onProfileChanged(session);
      return { profile: session.profile };
    });

    handle('rooms:list', () => ({ rooms: rooms.list() }), { needsSession: false });
    handle('room:create', (payload, session) => rooms.create(session, payload));
    handle('room:join', (payload, session) => rooms.join(session, payload));
    handle('room:leave', (payload, session) => rooms.leave(session, 'leave'));
    handle('room:addBot', (payload, session) => rooms.addBot(session, payload));
    handle('room:kick', (payload, session) => rooms.kick(session, payload));
    handle('room:start', (payload, session) => rooms.start(session, payload));
    handle('room:chat', (payload, session) => rooms.chat(session, payload));
    handle('room:rematch', (payload, session) => rooms.rematch(session, payload));
    handle('game:action', (payload, session) => rooms.act(session, payload));

    socket.on('disconnect', () => {
      try {
        if (closing) return;
        const session = sessions.getBySocket(socket.id);
        if (!session || session.socketId !== socket.id) return;
        sessions.detach(session);
        rooms.onDisconnected(session);
      } catch (err) {
        log.error('Error al desconectar:', err);
      }
    });
  });

  // Limpieza periódica de sesiones viejas sin sala
  const pruneTimer = setInterval(() => {
    const n = sessions.prune(6 * 60 * 60 * 1000);
    if (n) log.info(`Se borraron ${n} sesiones inactivas`);
  }, 10 * 60 * 1000);
  pruneTimer.unref();

  return {
    app,
    io,
    httpServer,
    rooms,
    sessions,
    timing,
    // Escucha en `port` (0 = aleatorio) y resuelve con el puerto real
    listen(port = 0, host) {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          resolve(httpServer.address().port);
        });
      });
    },
    close() {
      closing = true;
      clearInterval(pruneTimer);
      rooms.dispose();
      sessions.dispose();
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}

// ---------- arranque directo ----------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  process.on('uncaughtException', (err) => console.error('ERROR no atrapado:', err));
  process.on('unhandledRejection', (err) => console.error('Promesa rechazada sin atrapar:', err));

  const server = createServer();
  const port = envInt('PORT', 3001);
  server.listen(port).then(
    (p) => console.log(`Servidor de Roña escuchando en http://localhost:${p}`),
    (err) => {
      console.error(`No se pudo abrir el puerto ${port}:`, err.message);
      process.exit(1);
    },
  );
  const shutdown = () => {
    console.log('Apagando el servidor…');
    server.close().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
