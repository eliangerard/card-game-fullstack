// Tests de regresión de los hallazgos de la revisión: abusos de reconexión, sesiones,
// salas por IP, unirse a partidas terminadas, rate limit del chat y anfitrión desconectado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, makeClient, sleep } from './helpers.js';

const profile = (name) => ({ name, avatar: 0, color: '#885ffe' });

describe('Endurecimiento', () => {
  test('reconectar en tu turno da margen una sola vez: el turno termina venciendo', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 7, turnMs: 1500, reconnectTurnMs: 1200 });
    try {
      const a = await srv.client({ profile: profile('Tramposo') });
      const b = await srv.client({ profile: profile('Paciente') });
      const { roomId } = await a.ok('room:create', { name: 'Reloj' });
      await b.ok('room:join', { roomId });
      const stP = b.waitFor('game:state');
      await a.ok('room:start');
      assert.equal((await stP).turnPlayerId, a.session.playerId);

      const timeoutP = b.waitFor('game:events',
        (x) => x.events.some((e) => e.type === 'timeout' && e.playerId === a.session.playerId),
        { timeout: 3500 });
      // a "reconecta" cada 300 ms con su token; antes esto congelaba el turno para siempre
      let stop = false;
      const spam = (async () => {
        while (!stop) {
          await a.req('session:hello', { token: a.session.token }).catch(() => {});
          await sleep(300);
        }
      })();
      try {
        await timeoutP;
      } finally {
        stop = true;
        await spam;
      }
    } finally {
      await srv.close();
    }
  });

  test('un socket tiene una sola sesión: hello sin token no crea otra', async () => {
    const srv = await startServer();
    try {
      const a = await srv.client({ profile: profile('Único') });
      await a.ok('room:create', { name: 'Mía' });
      const again = await a.ok('session:hello', {});
      assert.equal(again.playerId, a.session.playerId);
      assert.equal(again.token, a.session.token);
      assert.ok(again.roomId);
      // Token desconocido tampoco suelta la sesión actual
      const stale = await a.ok('session:hello', { token: 'x'.repeat(32) });
      assert.equal(stale.playerId, a.session.playerId);
      assert.equal(await a.errCode('room:create', {}), 'ALREADY_IN_ROOM');
      assert.equal(srv.server.rooms.rooms.size, 1);
      assert.equal(srv.server.sessions.byToken.size, 1);
    } finally {
      await srv.close();
    }
  });

  test('tope de salas abiertas por IP', async () => {
    const srv = await startServer({ limits: { maxRoomsPerIp: 2 } });
    try {
      for (let i = 0; i < 2; i++) {
        const c = await srv.client({ profile: profile(`Sala ${i}`) });
        await c.ok('room:create', {});
      }
      const c = await srv.client({ profile: profile('Tercera') });
      assert.equal(await c.errCode('room:create', {}), 'RATE_LIMITED');
      // Al cerrarse una (su anfitrión sale) se libera el cupo
      const first = [...srv.server.rooms.rooms.values()][0];
      const host = srv.server.sessions.getById(first.hostId);
      srv.server.rooms.leave(host);
      await c.ok('room:create', {});
    } finally {
      await srv.close();
    }
  });

  test('tope de sesiones nuevas por IP y de conexiones simultáneas por IP', async () => {
    const srv = await startServer({ limits: { sessionsPerIpPerMin: 2, maxConnectionsPerIp: 4 } });
    try {
      const a = await srv.client({ profile: profile('Uno') });
      await srv.client({ profile: profile('Dos') });
      const c = await srv.client({ hello: false });
      assert.equal(await c.errCode('session:hello', {}), 'RATE_LIMITED');
      // Recuperar una sesión existente sí se puede
      const again = await srv.client({ token: a.session.token });
      assert.equal(again.session.playerId, a.session.playerId);
      // La pestaña vieja de a se cortó al recuperar su token: quedan 3 abiertas; con otra son 4
      await sleep(50);
      await srv.client({ hello: false });
      // 4 conexiones abiertas: la quinta se rechaza al conectar
      const extra = makeClient(srv.url);
      await assert.rejects(extra.connected);
      extra.socket.disconnect();
    } finally {
      await srv.close();
    }
  });

  test('un tope en 0 se desactiva (pruebas de carga desde una sola IP)', async () => {
    const srv = await startServer({ limits: { sessionsPerIpPerMin: 0, maxConnectionsPerIp: 0, maxRoomsPerIp: 0 } });
    try {
      // Más de 20 sesiones, conexiones y salas desde 127.0.0.1 (los topes por defecto)
      for (let i = 0; i < 24; i++) {
        const c = await srv.client({ profile: profile(`Carga ${i}`) });
        await c.ok('room:create', {});
      }
      assert.equal(srv.server.rooms.rooms.size, 24);
    } finally {
      await srv.close();
    }
  });

  test('los topes por IP se leen de variables de entorno', async () => {
    const before = process.env.SESSIONS_PER_IP_PER_MIN;
    process.env.SESSIONS_PER_IP_PER_MIN = '1';
    const srv = await startServer();
    try {
      await srv.client({ profile: profile('Primera') });
      const c = await srv.client({ hello: false });
      assert.equal(await c.errCode('session:hello', {}), 'RATE_LIMITED');
    } finally {
      if (before === undefined) delete process.env.SESSIONS_PER_IP_PER_MIN;
      else process.env.SESSIONS_PER_IP_PER_MIN = before;
      await srv.close();
    }
  });

  test('no se puede entrar a una sala con la partida terminada', async () => {
    const srv = await startServer({ fixedSeats: true, seed: 3 });
    try {
      const a = await srv.client({ profile: profile('Gana') });
      const b = await srv.client({ profile: profile('Huye') });
      const { roomId } = await a.ok('room:create', { name: 'Fin' });
      await b.ok('room:join', { roomId });
      await a.ok('room:start');
      await b.ok('room:leave');
      await a.waitFor('room:state', (s) => s?.status === 'finished', { past: true });

      const c = await srv.client({ profile: profile('Curioso') });
      assert.equal(await c.errCode('room:join', { roomId }), 'ROOM_IN_GAME');
      await sleep(100);
      assert.equal(c.all('game:state').length, 0);
      // Tras la revancha la sala vuelve al lobby y ya se puede entrar
      await a.ok('room:rematch');
      await c.ok('room:join', { roomId });
      assert.equal(c.all('game:state').length, 0);
    } finally {
      await srv.close();
    }
  });

  test('salir y volver no reinicia el límite del chat; entrar/salir en bucle se limita', async () => {
    const srv = await startServer();
    try {
      const a = await srv.client({ profile: profile('Sala') });
      const b = await srv.client({ profile: profile('Spam') });
      const { roomId } = await a.ok('room:create', {});
      await b.ok('room:join', { roomId });
      for (let i = 0; i < 5; i++) await b.ok('room:chat', { text: `m${i}` });
      assert.equal(await b.errCode('room:chat', { text: 'otro' }), 'RATE_LIMITED');
      await b.ok('room:leave');
      await b.ok('room:join', { roomId });
      assert.equal(await b.errCode('room:chat', { text: 'otro' }), 'RATE_LIMITED');

      let limited = false;
      for (let i = 0; i < 12 && !limited; i++) {
        await b.ok('room:leave');
        const res = await b.req('room:join', { roomId });
        if (!res.ok) {
          assert.equal(res.error.code, 'RATE_LIMITED');
          limited = true;
        }
      }
      assert.ok(limited, 'entrar y salir sin parar debía limitarse');
    } finally {
      await srv.close();
    }
  });

  test('si el anfitrión se desconecta en el lobby, el rol pasa enseguida a otro humano conectado', async () => {
    const srv = await startServer({ graceMs: 60_000 });
    try {
      const a = await srv.client({ profile: profile('Se cae') });
      const b = await srv.client({ profile: profile('Sigue') });
      const { roomId } = await a.ok('room:create', {});
      await a.ok('room:addBot');
      await b.ok('room:join', { roomId });
      const st = b.waitFor('room:state', (s) => s && s.hostId === b.session.playerId, { timeout: 1000 });
      a.socket.disconnect();
      const room = await st;
      // a sigue en la sala (tiene su gracia), pero ya no es el anfitrión
      assert.ok(room.players.some((p) => p.id === a.session.playerId && !p.connected));
      await b.ok('room:addBot');
      await b.waitFor('room:chat', (m) => m.system && m.text === 'Sigue ahora es el anfitrión', { past: true });
    } finally {
      await srv.close();
    }
  });
});
