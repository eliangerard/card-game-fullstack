// Set de capturas "de vitrina" contra el servidor real y vite (como play.mjs).
//
//   node e2e/final-shots.mjs      (servidor en :3001 con BOT_MIN_MS=350 BOT_MAX_MS=650, vite en :5173)
//
// Deja en e2e/shots/final-*.png: home, lobby, sala con chat, mesa al inicio, mesa a media partida
// con órganos en varios estados, una carta seleccionada con sus destinos resaltados y la victoria.
// Dos humanos (que juegan con una heurística sencilla: órganos y medicinas en su cuerpo, roña a los
// rivales) contra 2 bots fáciles; si gana un bot, se pide la revancha y se vuelve a jugar (hasta MAX_GAMES).
//
// Variables: E2E_URL (http://localhost:5173), MAX_GAMES (5), HEADED=1.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.E2E_URL || 'http://localhost:5173';
const MAX_GAMES = Number(process.env.MAX_GAMES || 5);
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: `${SHOTS}final-${name}.png` });
  log('captura', `final-${name}.png`);
};

const watch = (page, who) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/React DevTools/.test(m.text())) problems.push(`[${who}] consola: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${who}] pageerror: ${e.message}`));
};

// Estado del store (sólo lectura) y conteo de estados de los órganos en la mesa
const peek = (page) => page.evaluate(() => {
  const s = window.__ronaStore?.getState();
  const g = s?.game;
  if (!g) return { roomStatus: s?.room?.status || null, game: false };
  const statuses = {};
  let organs = 0;
  for (const p of g.players) {
    for (const slot of p.body) {
      organs++;
      const st = slot.viruses.length ? 'infected' : slot.medicines.length === 2 ? 'immunized' : slot.medicines.length ? 'vaccinated' : 'healthy';
      statuses[st] = (statuses[st] || 0) + 1;
    }
  }
  return {
    game: true,
    roomStatus: s.room?.status || null,
    queue: s.eventQueue.length,
    winner: g.winner || null,
    turnNumber: g.turnNumber,
    myTurn: g.turnPlayerId === g.you && !g.winner,
    you: g.you,
    hand: g.hand.map((c) => c.id),
    organs,
    statuses,
  };
});

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
const waitApplied = async (page, before, ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await peek(page);
    if (!s.game || s.winner || s.turnNumber !== before.turnNumber || s.hand.join() !== before.hand.join()) return true;
    await sleep(100);
  }
  return false;
};

// Prioridad de cartas: órgano > medicina > roña > tratamiento
const rank = (label = '') => (/^Órgano/.test(label) ? 0 : /^Medicina/.test(label) ? 1 : /^Roña/.test(label) ? 2 : 3);
const wantsMine = (label = '') => /^(Órgano|Medicina)/.test(label);

let selectionShot = false;

const takeTurn = async (page, who, isHost) => {
  const before = await peek(page);
  const cards = page.locator('.gt-hand .gt-hand-card[data-card-id]');
  const n = await cards.count();
  const order = [];
  for (let i = 0; i < n; i++) order.push({ i, label: await cards.nth(i).getAttribute('aria-label') });
  order.sort((a, b) => rank(a.label) - rank(b.label) || Math.random() - 0.5);

  for (const { i, label } of order) {
    if (!(await clickVisible(cards.nth(i)))) continue;
    await sleep(300);
    if (await clickIfVisible(page.getByRole('button', { name: 'Contagiar' }))) {
      if (await waitApplied(page, before)) return `contagio (${label})`;
    } else if (await clickIfVisible(page.getByRole('button', { name: 'Usar guante' }))) {
      await sleep(200);
      await clickIfVisible(page.getByRole('button', { name: '¡Úsalo!' }));
      if (await waitApplied(page, before)) return `guante (${label})`;
    } else {
      const all = page.locator('[data-drop]');
      const mine = page.locator('.gt-me-panel [data-drop]');
      const total = await all.count();
      if (total > 0) {
        // Destinos propios para órganos/medicinas; de rivales para lo demás
        const nMine = await mine.count();
        let target = null;
        if (wantsMine(label) && nMine > 0) target = mine.nth(Math.floor(Math.random() * nMine));
        else if (!wantsMine(label) && total > nMine) {
          const others = page.locator('[data-drop]:not(.gt-me-panel [data-drop])');
          const k = await others.count();
          if (k > 0) target = others.nth(Math.floor(Math.random() * k));
        }
        if (!target && rank(label) < 3) { await page.keyboard.press('Escape'); await sleep(150); continue; }
        target = target || all.nth(Math.floor(Math.random() * total));

        // Captura de la carta seleccionada: una roña o medicina con varios destinos resaltados
        if (isHost && !selectionShot && rank(label) <= 2 && total >= 2) {
          selectionShot = true;
          // Que no la tape el letrero de «¡Tu turno!» ni la revelación de un tratamiento
          await page.locator('.gt-banner, .fx-reveal').first().waitFor({ state: 'detached', timeout: 4000 }).catch(() => {});
          await sleep(500);
          await shot(page, 'seleccion');
        }
        await clickVisible(target);
        await sleep(250);
        await clickIfVisible(page.getByRole('button', { name: '¡Úsalo!' }));
        const second = page.locator('[data-drop]');
        const s2 = await second.count();
        const still = await peek(page);
        if (s2 > 0 && still.hand.join() === before.hand.join() && still.turnNumber === before.turnNumber) {
          await clickVisible(second.nth(Math.floor(Math.random() * s2)));
        }
        if (await waitApplied(page, before)) return `jugó ${label}`;
      }
    }
    await page.keyboard.press('Escape');
    await sleep(150);
    const now = await peek(page);
    if (!now.myTurn || now.turnNumber !== before.turnNumber) return 'el turno se fue';
  }

  // Nada útil: descartar la carta de menor prioridad
  if (!(await clickIfVisible(page.getByRole('button', { name: 'Descartar' })))) return 'no pude descartar';
  await sleep(200);
  await clickVisible(cards.nth(order[order.length - 1].i));
  await sleep(150);
  await clickIfVisible(page.getByRole('button', { name: /^Tirar/ }));
  if (await waitApplied(page, before)) return 'descartó 1';
  await page.keyboard.press('Escape');
  return 'descarte sin efecto';
};

const enter = async (page, name, isHost) => {
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ronaStore?.getState().session, null, { timeout: 15000 });
  if (isHost) {
    await sleep(1500);
    await shot(page, 'home');
  }
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
  const ctxB = await browser.newContext({ viewport });
  const host = await ctxA.newPage();
  const guest = await ctxB.newPage();
  watch(host, 'anfitrión');
  watch(guest, 'invitado');

  try {
    const roomName = 'Mesa de la roña';
    await enter(host, 'Adán', true);
    await enter(guest, 'Beto', false);

    // Lobby con una sala de otro jugador en la lista
    await guest.locator('form', { hasText: 'Crear sala' }).locator('input').first().fill('Los contagiados');
    await guest.getByRole('button', { name: 'Crear sala' }).click();
    await guest.getByRole('button', { name: /Agregar bot/ }).waitFor({ timeout: 8000 });
    await host.locator('.room-row', { hasText: 'Los contagiados' }).waitFor({ timeout: 8000 });
    await host.getByText('Perfil guardado').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await sleep(600);
    await shot(host, 'lobby');
    // El invitado sale de su sala para unirse a la del anfitrión
    await clickIfVisible(guest.getByRole('button', { name: /Salir/ }));
    await guest.waitForFunction(() => !window.__ronaStore.getState().room, null, { timeout: 8000 });

    await host.locator('form', { hasText: 'Crear sala' }).locator('input').first().fill(roomName);
    await host.getByRole('button', { name: 'Crear sala' }).click();
    await host.getByRole('button', { name: /Agregar bot/ }).waitFor({ timeout: 8000 });
    await guest.locator('.room-row', { hasText: roomName }).getByRole('button', { name: 'Unirse' }).click({ timeout: 8000 });
    await guest.waitForFunction(() => window.__ronaStore.getState().room?.players.length === 2, null, { timeout: 8000 });

    // Chat de ida y vuelta
    const say = async (page, text, other) => {
      const input = page.getByPlaceholder('Escribe un mensaje…');
      await input.fill(text);
      await input.press('Enter');
      await other.getByText(text).waitFor({ timeout: 5000 });
    };
    await say(guest, '¡Qué onda! ¿Una partidita?', host);
    await say(host, 'Va, te voy a pegar la roña 😈', guest);
    await say(guest, 'Ya veremos quién se enferma primero', host);
    // Bots fáciles: con bots normales la heurística de los humanos casi nunca gana y no hay captura de victoria
    await host.getByRole('radio', { name: 'Fácil' }).click();
    for (let i = 0; i < 2; i++) {
      await host.getByRole('button', { name: /Agregar bot/ }).click();
      await host.waitForFunction((k) => window.__ronaStore.getState().room?.players.length === k, 3 + i, { timeout: 8000 });
    }
    await sleep(1000);
    await shot(host, 'sala-chat');

    let won = false;
    let midShot = false;
    const complete = () => won && midShot && selectionShot;
    for (let gameNo = 1; gameNo <= MAX_GAMES && !complete(); gameNo++) {
      await host.getByRole('button', { name: /Empezar/ }).click();
      await Promise.all([host, guest].map((p) => p.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 10000 })));
      if (gameNo === 1) {
        await sleep(2800);
        await shot(host, 'mesa-inicio');
      }

      let done = false;
      const loop = async (page, who, isHost) => {
        let lastTurn = null;
        while (!done) {
          const s = await peek(page).catch(() => null);
          if (!s || !s.game) { await sleep(200); continue; }
          if (s.winner) { done = true; break; }
          if (s.turnNumber >= 200) { done = true; break; }

          // A media partida: al menos 7 órganos en la mesa y 3 estados distintos (o 4)
          if (isHost && !midShot && s.queue === 0 && !s.myTurn && s.organs >= 7) {
            const kinds = Object.keys(s.statuses).length;
            if (kinds >= 4 || (kinds >= 3 && s.turnNumber >= 20)) {
              midShot = true;
              await sleep(400);
              await shot(page, 'mesa-media');
              log('estados en la mesa:', s.statuses);
            }
          }

          const ready = s.myTurn && s.queue === 0 && (await page.locator('.gt-root.is-my-turn').count()) > 0;
          if (ready && s.turnNumber !== lastTurn) {
            lastTurn = s.turnNumber;
            const what = await takeTurn(page, who, isHost);
            log(`[${who}] turno ${s.turnNumber}: ${what}`);
          } else {
            await sleep(150);
          }
        }
      };
      await Promise.all([loop(host, 'anfitrión', true), loop(guest, 'invitado', false)]);

      const end = await peek(host);
      if (!end.winner) { problems.push(`Partida ${gameNo} sin ganador`); break; }
      await Promise.all([host, guest].map((p) => p.locator('.gt-end-card').waitFor({ timeout: 8000 })));
      await sleep(1500);
      const guestState = await peek(guest);
      const humanWon = end.winner.playerId === end.you || end.winner.playerId === guestState.you;
      if (!won && end.winner.playerId === end.you) { await shot(host, 'victoria'); won = true; }
      else if (!won && end.winner.playerId === guestState.you) { await shot(guest, 'victoria'); won = true; }
      else if (!humanWon && gameNo === 1) await shot(host, 'derrota');
      log(`partida ${gameNo}: ganó ${end.winner.playerId} (${end.winner.reason})`);
      if (!complete()) {
        log('faltan capturas; revancha');
        await host.getByRole('button', { name: 'Revancha' }).click();
        await host.getByRole('button', { name: /Empezar/ }).waitFor({ timeout: 8000 });
        await sleep(500);
      }
    }
    if (!won) problems.push(`Ningún humano ganó en ${MAX_GAMES} partidas: no hay captura de victoria`);
    if (!midShot) problems.push('No hubo un momento con órganos en varios estados: falta final-mesa-media');
    if (!selectionShot) problems.push('No hubo una carta con varios destinos: falta final-seleccion');
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
  console.log('\n✓ capturas listas');
};

main();
