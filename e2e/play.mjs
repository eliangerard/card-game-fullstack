// Prueba de punta a punta contra el servidor real y el cliente de vite.
//
//   node e2e/play.mjs            (con el servidor en :3001 y vite en :5173 ya corriendo)
//
// Dos jugadores humanos en contextos aislados (como dos navegadores distintos): el anfitrión
// crea la sala y el otro se une; se agregan 2 bots, se empieza y ambos humanos JUEGAN haciendo
// clic en la interfaz: eligen una carta, y si hay destinos resaltados hacen clic en uno; si no,
// descartan. A media partida el invitado recarga la página y debe volver a su asiento.
// Falla si hay errores en la consola o excepciones en cualquiera de las páginas.
//
// Variables: E2E_URL (http://localhost:5173), MAX_TURNS (120), HEADED=1 para ver los navegadores.
// El store sólo se LEE (window.__ronaStore, expuesto en desarrollo) para saber cuándo actuar.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_URL || 'http://localhost:5173';
const MAX_TURNS = Number(process.env.MAX_TURNS || 120);
const RELOAD_AT = Number(process.env.RELOAD_AT || 14);
const MID_AT = Number(process.env.MID_AT || 10);
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}e2e-${name}.png` });
  log('📸', `e2e-${name}.png`);
};
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Errores de consola que no son fallas de la app
const IGNORED = [
  /Download the React DevTools/,
];

const watch = (page, who) => {
  page.on('console', (m) => {
    const text = m.text();
    if (IGNORED.some((r) => r.test(text))) return;
    if (m.type() === 'error') problems.push(`[${who}] consola: ${text}`);
    else if (m.type() === 'warning') log(`[${who}] aviso de consola:`, text);
  });
  page.on('pageerror', (e) => problems.push(`[${who}] pageerror: ${e.message}`));
};

// Lee el estado del store (sólo lectura)
const peek = (page) => page.evaluate(() => {
  const s = window.__ronaStore?.getState();
  if (!s) return null;
  const g = s.game;
  return {
    connected: s.connected,
    playerId: s.session?.playerId || null,
    roomStatus: s.room?.status || null,
    queue: s.eventQueue.length,
    winner: g?.winner || null,
    turnNumber: g?.turnNumber ?? null,
    myTurn: !!g && g.turnPlayerId === g.you && !g.winner,
    you: g?.you || null,
    hand: g ? g.hand.map((c) => c.id) : [],
  };
});

// Clic "humano": primero al centro; si algo lo tapa (una carta levantada), en su parte de arriba
const clickVisible = async (loc) => {
  try {
    await loc.click({ timeout: 1500 });
    return true;
  } catch {
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return false;
    try {
      await loc.click({ timeout: 1500, position: { x: box.width / 2, y: Math.min(10, box.height / 4) } });
      return true;
    } catch {
      return false;
    }
  }
};

const clickIfVisible = async (loc) => {
  if (await loc.count() === 0 || !(await loc.first().isVisible())) return false;
  return clickVisible(loc.first());
};

// Espera a que la acción se refleje: cambia el turno o la mano
const waitApplied = async (page, before, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await peek(page);
    if (!s) return false;
    if (s.winner || s.turnNumber !== before.turnNumber || s.hand.join() !== before.hand.join()) return true;
    await sleep(100);
  }
  return false;
};

const stats = { play: 0, discard: 0, special: 0, rejected: 0 };

// Un turno jugado a clics. Devuelve qué hizo.
const takeTurn = async (page, who) => {
  const before = await peek(page);
  const cards = page.locator('.gt-hand .gt-hand-card[data-card-id]');
  const n = await cards.count();
  if (n === 0) {
    if (await clickIfVisible(page.getByRole('button', { name: 'Pasar' }))) return 'pasar';
    return 'nada';
  }

  for (const i of shuffle([...Array(n).keys()])) {
    const card = cards.nth(i);
    const label = await card.getAttribute('aria-label');
    if (!(await clickVisible(card))) continue;
    await sleep(250);

    // Tratamientos que se juegan con un botón
    if (await clickIfVisible(page.getByRole('button', { name: 'Contagiar' }))) {
      if (await waitApplied(page, before)) { stats.special++; return `contagio (${label})`; }
    } else if (await clickIfVisible(page.getByRole('button', { name: 'Usar guante' }))) {
      await sleep(200);
      await clickIfVisible(page.getByRole('button', { name: '¡Úsalo!' }));
      if (await waitApplied(page, before)) { stats.special++; return `guante (${label})`; }
    } else {
      // Destinos resaltados por la mesa
      const drops = page.locator('[data-drop]');
      const count = await drops.count();
      if (count > 0) {
        const pick = drops.nth(Math.floor(Math.random() * count));
        await clickVisible(pick);
        await sleep(250);
        // Si quedó a medias (trasplante: falta el segundo órgano, o el guante pide confirmar)
        await clickIfVisible(page.getByRole('button', { name: '¡Úsalo!' }));
        const second = page.locator('[data-drop]');
        const s2 = await second.count();
        const still = await peek(page);
        if (s2 > 0 && still.hand.join() === before.hand.join() && still.turnNumber === before.turnNumber) {
          await clickVisible(second.nth(Math.floor(Math.random() * s2)));
        }
        if (await waitApplied(page, before)) { stats.play++; return `jugó ${label}`; }
        stats.rejected++;
        log(`[${who}] la jugada de ${label} no se aplicó; pruebo otra`);
      }
    }
    // Sin destinos o no se aplicó: soltar la carta y probar la siguiente
    await page.keyboard.press('Escape');
    await sleep(150);
    const now = await peek(page);
    if (!now.myTurn || now.turnNumber !== before.turnNumber) return 'el turno se fue';
  }

  // Ninguna carta se pudo jugar: descartar de 1 a 2
  if (!(await clickIfVisible(page.getByRole('button', { name: 'Descartar' })))) return 'no pude descartar';
  await sleep(200);
  const k = 1 + Math.floor(Math.random() * Math.min(2, n));
  for (const i of shuffle([...Array(n).keys()]).slice(0, k)) await clickVisible(cards.nth(i));
  await sleep(150);
  await clickIfVisible(page.getByRole('button', { name: /^Tirar/ }));
  if (await waitApplied(page, before)) { stats.discard++; return `descartó ${k}`; }
  await page.keyboard.press('Escape');
  return 'descarte sin efecto';
};

// ---------- Entrada al juego ----------

const enter = async (page, name, who) => {
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ronaStore?.getState().session, null, { timeout: 15000 });
  if (who === 'anfitrión') {
    await sleep(1200);
    await shot(page, 'home');
  }
  // El botón "Jugar" late y se menea sin parar: nunca está "estable", así que el clic se fuerza
  await page.getByRole('button', { name: /Jugar/ }).click({ force: true });
  const input = page.getByPlaceholder('¿Cómo te llamas?');
  await input.waitFor();
  await input.fill(name);
  await page.getByRole('button', { name: 'Guardar perfil' }).click();
  await page.waitForFunction((n) => window.__ronaStore.getState().profile.name === n, name, { timeout: 8000 });
};

const main = async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const viewport = { width: 1600, height: 900 };
  const ctxA = await browser.newContext({ viewport });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const host = await ctxA.newPage();
  const guest = await ctxB.newPage();
  watch(host, 'anfitrión');
  watch(guest, 'invitado');

  try {
    const roomName = `Mesa E2E ${Date.now() % 10000}`;
    await enter(host, 'Ana', 'anfitrión');
    await sleep(800);
    await shot(host, 'lobby');

    // El anfitrión crea la sala
    const roomInput = host.locator('form', { hasText: 'Crear sala' }).locator('input').first();
    await roomInput.fill(roomName);
    await host.getByRole('button', { name: 'Crear sala' }).click();
    await host.getByRole('button', { name: /Agregar bot/ }).waitFor({ timeout: 8000 });
    log('sala creada:', roomName);

    // El invitado entra y se une desde la lista
    await enter(guest, 'Beto', 'invitado');
    const row = guest.locator('.room-row', { hasText: roomName });
    await row.getByRole('button', { name: 'Unirse' }).click({ timeout: 8000 });
    await guest.waitForFunction(() => window.__ronaStore.getState().room?.players.length === 2, null, { timeout: 8000 });
    log('el invitado se unió');

    // Chat de la sala: el invitado escribe y al anfitrión le llega
    const chatInput = guest.getByPlaceholder('Escribe un mensaje…');
    await chatInput.fill('¡Hola desde el e2e!');
    await chatInput.press('Enter');
    await host.getByText('¡Hola desde el e2e!').waitFor({ timeout: 5000 });
    log('chat de la sala: ok');

    // Dos bots y a jugar
    for (let i = 0; i < 2; i++) {
      await host.getByRole('button', { name: /Agregar bot/ }).click();
      await host.waitForFunction((k) => window.__ronaStore.getState().room?.players.length === k, 3 + i, { timeout: 8000 });
    }
    await sleep(900);
    await shot(host, 'sala');
    await shot(guest, 'sala-invitado');

    await host.getByRole('button', { name: /Empezar/ }).click();
    await Promise.all([host, guest].map((p) => p.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 10000 })));
    await sleep(2600);
    await shot(host, 'mesa-inicio');

    // ---------- Partida ----------
    let done = false;
    let midShot = false;
    let reloaded = false;
    let reloadOk = false;
    const turnsPlayed = { anfitrión: 0, invitado: 0 };

    const loop = async (page, who) => {
      let lastTurn = null;
      while (!done) {
        const s = await peek(page).catch(() => null);
        if (!s) { await sleep(200); continue; }
        if (s.winner || s.roomStatus === 'finished') { done = true; break; }
        if (s.turnNumber >= MAX_TURNS) { done = true; break; }

        if (!midShot && who === 'anfitrión' && s.turnNumber >= MID_AT && s.queue === 0) {
          midShot = true;
          await shot(page, 'mesa-media');
        }

        // Recarga a media partida (sólo el invitado, y no en su propio turno para no perderlo)
        if (who === 'invitado' && !reloaded && s.turnNumber >= RELOAD_AT && !s.myTurn) {
          reloaded = true;
          const before = { playerId: s.playerId, hand: s.hand };
          log('[invitado] recargando la página a media partida…');
          await page.reload();
          await page.waitForFunction(() => {
            const st = window.__ronaStore?.getState();
            return st?.connected && st.session && st.game && st.room;
          }, null, { timeout: 15000 });
          await page.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 10000 });
          const after = await peek(page);
          reloadOk = after.playerId === before.playerId && after.you === before.playerId;
          log(`[invitado] volvió: mismo jugador=${after.playerId === before.playerId}, asiento=${after.you === before.playerId}`);
          if (!reloadOk) problems.push('Tras la recarga el invitado no volvió a su asiento');
          await sleep(1500);
          await shot(page, 'recarga');
          // El anfitrión debe verlo conectado otra vez
          const seen = await host.evaluate((id) => window.__ronaStore.getState().room?.players.find((p) => p.id === id)?.connected, before.playerId);
          if (!seen) problems.push('El anfitrión no ve al invitado conectado tras la recarga');
          continue;
        }

        const ready = s.myTurn && s.queue === 0 && (await page.locator('.gt-root.is-my-turn').count()) > 0;
        if (ready && s.turnNumber !== lastTurn) {
          lastTurn = s.turnNumber;
          const what = await takeTurn(page, who);
          turnsPlayed[who]++;
          log(`[${who}] turno ${s.turnNumber}: ${what}`);
        } else {
          await sleep(150);
        }
      }
    };

    await Promise.all([loop(host, 'anfitrión'), loop(guest, 'invitado')]);

    const end = await peek(host);
    log('fin del bucle. turno', end.turnNumber, 'ganador', end.winner);
    if (!reloaded) problems.push(`La partida terminó (turno ${end.turnNumber}) antes de la recarga: no se probó`);

    if (end.winner) {
      // El modal de fin aparece tras la animación de la jugada ganadora
      await Promise.all([host, guest].map((p) => p.locator('.gt-end-card').waitFor({ timeout: 8000 })));
      await sleep(1200);
      await shot(host, 'victoria');
      await shot(guest, 'victoria-invitado');
      log('ganó', end.winner.playerId === end.you ? 'el anfitrión' : end.winner.playerId, `(${end.winner.reason})`);

      // Revancha: los dos vuelven a la sala de espera
      await host.getByRole('button', { name: 'Revancha' }).click();
      await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__ronaStore.getState().room?.status === 'lobby' && !window.__ronaStore.getState().game, null, { timeout: 8000 })));
      await host.getByRole('button', { name: /Empezar/ }).waitFor({ timeout: 5000 });
      await sleep(700);
      await shot(guest, 'revancha');
      log('revancha: de vuelta en la sala');
    } else {
      log(`sin ganador después de ${MAX_TURNS} turnos (límite de la prueba)`);
      await shot(host, 'limite');
    }

    // La misma sesión en otra pestaña: la vieja muestra el aviso y puede recuperarla con un clic
    const tab2 = await ctxB.newPage();
    watch(tab2, 'invitado-pestaña2');
    await tab2.goto(BASE);
    await guest.getByText('Abriste Roña en otra pestaña').waitFor({ timeout: 8000 });
    await sleep(600);
    await shot(guest, 'otra-pestana');
    await guest.getByRole('button', { name: 'Jugar aquí' }).click();
    await tab2.getByText('Abriste Roña en otra pestaña').waitFor({ timeout: 8000 });
    await guest.waitForFunction(() => window.__ronaStore.getState().connected && window.__ronaStore.getState().room, null, { timeout: 8000 });
    log('otra pestaña: el aviso aparece y "Jugar aquí" recupera la sesión');
    await tab2.close();

    log('turnos jugados a clics:', turnsPlayed, 'acciones:', stats);
    if (turnsPlayed.anfitrión + turnsPlayed.invitado < 4) problems.push('Los humanos casi no jugaron');
  } catch (err) {
    problems.push(`excepción: ${err.stack || err.message}`);
    await shot(host, 'error-anfitrion').catch(() => {});
    await shot(guest, 'error-invitado').catch(() => {});
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problema(s):`);
    problems.forEach((p) => console.error(' -', p));
    process.exit(1);
  }
  console.log('\n✓ e2e sin errores');
};

main();
