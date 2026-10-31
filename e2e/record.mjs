// Graba un video de dos jugadores humanos (Claude contra Claude) jugando 1 contra 1 a clics.
//
//   node e2e/record.mjs      (con el servidor en :3001 y vite en :5173 ya corriendo)
//
// Cada jugador decide su jugada con el bot 'normal' del motor (sobre su PlayerView) y la ejecuta
// con el ratón en la interfaz, con un cursor visible que se mueve suave. Deja dos .webm en
// e2e/video/ (uno por jugador); el lado a lado se arma luego con ffmpeg.

import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chooseBotAction } from '../shared/engine/index.js';

const BASE = process.env.E2E_URL || 'http://localhost:5173';
const OUT = fileURLToPath(new URL('./video/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const SIZE = { width: 1280, height: 720 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Cursor visible para el video: sigue al ratón y "late" al hacer clic
const cursorScript = (color) => `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:transform .12s';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7 19 2.5-7.5L20 11z" fill="${color}" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    let x = -50, y = -50;
    const put = (s) => { c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.transform = 'scale(' + s + ')'; };
    window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; put(1); }, true);
    window.addEventListener('mousedown', () => put(0.75), true);
    window.addEventListener('mouseup', () => put(1), true);
    put(1);
  });
`;

const peek = (page) => page.evaluate(() => {
  const s = window.__ronaStore?.getState();
  if (!s) return null;
  return { game: s.game, queue: s.eventQueue.length, status: s.room?.status || null };
});

// Mueve el cursor hasta el elemento con pasos (para que se vea) y hace clic
const glide = async (page, loc, { dy = 0 } = {}) => {
  const el = loc.first();
  if ((await el.count()) === 0) return false;
  const box = await el.boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(box.height / 2, box.height * 0.3 + dy);
  await page.mouse.move(x, y, { steps: 18 });
  await sleep(180);
  await page.mouse.click(x, y);
  return true;
};

const clickButton = (page, name) => glide(page, page.getByRole('button', { name }));
const handCard = (page, id) => page.locator(`.gt-hand .gt-hand-card[data-card-id="${id}"]`);
const slot = (page, pid, sid) => page.locator(`[data-drop="slot"][data-pid="${pid}"][data-slot="${sid}"]`);

// Ejecuta una acción del motor como lo haría una persona
const perform = async (page, view, action) => {
  if (action.type === 'discard') {
    await clickButton(page, 'Descartar');
    await sleep(350);
    for (const id of action.cardIds) { await glide(page, handCard(page, id)); await sleep(250); }
    await sleep(300);
    return clickButton(page, /^Tirar/);
  }
  if (action.type !== 'play') return false;
  const card = view.hand.find((c) => c.id === action.cardId);
  await glide(page, handCard(page, action.cardId));
  await sleep(700); // que se vean los destinos resaltados
  const t = action.target || {};
  if (card.kind === 'organ') {
    return (await glide(page, page.locator(`[data-drop="body"][data-pid="${view.you}"]`))) ||
      glide(page, page.locator('[data-drop="table"]'));
  }
  if (card.kind === 'treatment') {
    switch (card.treatment) {
      case 'transplant':
        await glide(page, slot(page, t.a.playerId, t.a.slotId));
        await sleep(500);
        return glide(page, slot(page, t.b.playerId, t.b.slotId));
      case 'thief':
        return glide(page, slot(page, t.playerId, t.slotId));
      case 'contagion':
        return clickButton(page, 'Contagiar');
      case 'glove':
        await clickButton(page, 'Usar guante');
        await sleep(400);
        return clickButton(page, '¡Úsalo!');
      case 'medicalError':
        return glide(page, page.locator(`[data-drop="player"][data-pid="${t.playerId}"]`));
    }
  }
  return glide(page, slot(page, t.playerId, t.slotId));
};

const enter = async (page, name, avatarClicks) => {
  await page.goto(BASE);
  await page.waitForFunction(() => window.__ronaStore?.getState().session, null, { timeout: 15000 });
  await sleep(2200); // que se luzca la portada
  const play = page.getByRole('button', { name: /Jugar/ });
  const box = await play.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await sleep(300);
  await play.click({ force: true });
  const input = page.getByPlaceholder('¿Cómo te llamas?');
  await input.waitFor();
  await sleep(600);
  await glide(page, input);
  await input.press('Control+A');
  await input.press('Backspace');
  await input.pressSequentially(name, { delay: 90 });
  for (let i = 0; i < avatarClicks; i++) {
    await glide(page, page.getByRole('button', { name: 'Avatar siguiente' }));
    await sleep(350);
  }
  await sleep(300);
  await clickButton(page, 'Guardar perfil');
  await page.waitForFunction((n) => window.__ronaStore.getState().profile.name === n, name, { timeout: 8000 });
  await sleep(700);
};

const main = async () => {
  const browser = await chromium.launch();
  const mk = (color) => browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } })
    .then(async (ctx) => { await ctx.addInitScript(cursorScript(color)); return ctx; });
  const [ctxA, ctxB] = await Promise.all([mk('#ffae00'), mk('#20c997')]);
  const [a, b] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);
  for (const [p, n] of [[a, 'A'], [b, 'B']]) p.on('pageerror', (e) => log(`[${n}] pageerror`, e.message));

  const vids = [a.video(), b.video()];
  try {
    await Promise.all([enter(a, 'Claude', 2), enter(b, 'Claude 2', 5)]);

    // A crea la sala 1 contra 1
    const roomName = 'Claude vs Claude';
    const roomInput = a.locator('form', { hasText: 'Crear sala' }).locator('input').first();
    await glide(a, roomInput);
    await roomInput.pressSequentially(roomName, { delay: 70 });
    await glide(a, a.getByRole('radio', { name: '2', exact: true }));
    await sleep(300);
    await clickButton(a, 'Crear sala');
    await a.getByRole('button', { name: /Empezar/ }).waitFor({ timeout: 8000 });

    // B la ve aparecer y se une
    const row = b.locator('.room-row', { hasText: roomName });
    await row.waitFor({ timeout: 8000 });
    await sleep(900);
    await glide(b, row.getByRole('button', { name: 'Unirse' }));
    await a.waitForFunction(() => window.__ronaStore.getState().room?.players.length === 2, null, { timeout: 8000 });

    // Un poco de plática
    const say = async (page, text) => {
      const box = page.getByPlaceholder('Escribe un mensaje…');
      await glide(page, box);
      await box.pressSequentially(text, { delay: 60 });
      await box.press('Enter');
      await sleep(700);
    };
    await sleep(800);
    await say(b, '¿Listo para perder contra ti mismo?');
    await say(a, 'Yo ya sé todas tus jugadas 😏');
    await say(b, 'Y yo las tuyas. Dale');
    await sleep(800);
    await clickButton(a, /Empezar/);
    await Promise.all([a, b].map((p) => p.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 10000 })));
    await sleep(2500);

    // Partida
    let done = false;
    const loop = async (page, who) => {
      let last = null;
      while (!done) {
        const s = await peek(page).catch(() => null);
        if (!s?.game) { await sleep(200); continue; }
        const g = s.game;
        if (g.winner || s.status === 'finished') { done = true; break; }
        const mine = g.turnPlayerId === g.you;
        if (!mine || s.queue > 0 || g.turnNumber === last || !(await page.locator('.gt-root.is-my-turn').count())) {
          await sleep(150);
          continue;
        }
        last = g.turnNumber;
        await sleep(900); // "pensando"
        const action = chooseBotAction(g, g.you, { level: 'normal' });
        if (!action) continue;
        const ok = await perform(page, g, action).catch(() => false);
        await sleep(1200);
        const after = await peek(page);
        if (!ok || (after.game.turnNumber === g.turnNumber && !after.game.winner)) {
          // Si la interfaz no tomó el clic, que no se trabe el video
          log(`[${who}] la jugada por clics no entró (${JSON.stringify(action).slice(0, 90)}); la mando directa`);
          await page.keyboard.press('Escape');
          await page.evaluate((act) => window.__ronaStore.getState().act(act).catch(() => {}), action);
        }
        log(`[${who}] turno ${g.turnNumber}: ${action.type} ${action.cardId || ''}`);
      }
    };
    await Promise.all([loop(a, 'A'), loop(b, 'B')]);
    await Promise.all([a, b].map((p) => p.locator('.gt-end-card').waitFor({ timeout: 10000 }).catch(() => {})));
    await sleep(6000); // confeti
    const g = (await peek(a)).game;
    log('ganó', g.winner?.playerId === g.you ? 'Claude (A)' : 'Claude 2 (B)');
  } finally {
    await ctxA.close();
    await ctxB.close();
    await browser.close();
  }
  // Nombres fijos para los dos videos
  renameSync(await vids[0].path(), `${OUT}a.webm`);
  renameSync(await vids[1].path(), `${OUT}b.webm`);
  log('videos listos en', OUT);
};

main();
