// Regresión visual y de accesibilidad de la mesa (hallazgos de la revisión del frontend).
//
//   node e2e/front-check.mjs          (con vite corriendo; por defecto http://localhost:5174)
//
// Casi todo usa el modo demo (?demo=game…&longnames&pause), que no necesita servidor. La prueba del
// silencio compartido (lobby → mesa) sí recorre el flujo real, así que necesita el servidor al que
// apunte ese vite (VITE_SERVER_URL); si no hay servidor, esa prueba se marca como omitida.
//
// Variables: E2E_URL, SKIP_REAL=1 (omite la prueba con servidor), HEADED=1.
// Las capturas quedan en e2e/shots/fix-*.png. Sale con código 1 si algo falla.

import { chromium, devices } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.E2E_URL || 'http://localhost:5174').replace(/\/$/, '');
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
const ASSETS = fileURLToPath(new URL('../virus-front/src/assets/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok ' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => {
  results.push({ name, ok: true, skipped: true });
  console.log(`omit.  ${name} — ${why}`);
};

const browser = await chromium.launch({ headless: !process.env.HEADED });
const errors = [];

const open = async (query, viewport, extra = {}) => {
  const ctx = await browser.newContext({ viewport, ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${query}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${query}: ${m.text()}`); });
  await page.goto(`${BASE}/?${query}`);
  await page.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1800); // reparto y animaciones de entrada
  return { ctx, page };
};

// Nombres de los avatares: ¿se recortan o se parten a media palabra?
const nameReport = (page) => page.evaluate(() => [...document.querySelectorAll('.gt-avatar-name span')].map((span) => {
  const text = span.textContent;
  const node = span.firstChild;
  const clipped = span.scrollHeight > span.clientHeight + 2 || span.scrollWidth > span.clientWidth + 2;
  const broken = [];
  let idx = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const start = text.indexOf(w, idx);
    idx = start + w.length;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, idx);
    const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top / 4)));
    if (tops.size > 1) broken.push(w);
  }
  return { text, clipped, broken, font: parseFloat(getComputedStyle(span).fontSize) };
}));

const overlap = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

// ---------- 1. Nombres en varias resoluciones ----------

const SIZES = [[1920, 1080], [1600, 900], [1366, 768], [1280, 720], [844, 390]];
for (const game of ['game', 'game6']) {
  for (const [w, h] of SIZES) {
    const mobile = w < 900;
    const { ctx, page } = await open(`demo=${game}&longnames&pause`, { width: w, height: h }, mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
    const names = await nameReport(page);
    const bad = names.filter((n) => n.clipped || n.broken.length);
    const minFont = Math.min(...names.map((n) => n.font));
    check(`${game} ${w}×${h}: nombres completos y sin partir palabras`, bad.length === 0,
      bad.map((n) => `"${n.text}"${n.clipped ? ' recortado' : ''}${n.broken.length ? ` partido en ${n.broken.join(',')}` : ''}`).join('; '));
    check(`${game} ${w}×${h}: nombres legibles (≥ 11 px)`, minFont >= 11, `mínimo ${minFont}px`);
    if (mobile && game === 'game6') {
      // Ranuras de los rivales con tamaño táctil y sin encimar avatar/chip con los reversos
      const m = await page.evaluate(() => {
        const slots = [...document.querySelectorAll('.gt-seat .gt-slot, .gt-seat .gt-well')].map((e) => e.getBoundingClientRect());
        const issues = [];
        document.querySelectorAll('.gt-seat.is-compact').forEach((seat) => {
          const chip = seat.querySelector('.gt-seat-chip')?.getBoundingClientRect();
          seat.querySelectorAll('.gt-back-slot .gc').forEach((b) => {
            const r = b.getBoundingClientRect();
            if (chip && r.left < chip.right && chip.left < r.right && r.top < chip.bottom && chip.top < r.bottom) issues.push(seat.textContent.slice(0, 20));
          });
        });
        return { minW: Math.min(...slots.map((r) => r.width)), issues: [...new Set(issues)] };
      });
      check(`game6 ${w}×${h}: ranuras de los rivales ≥ 44 px de ancho`, m.minW >= 44, `mínimo ${Math.round(m.minW)}px`);
      check(`game6 ${w}×${h}: el avatar compacto no se encima con los reversos`, m.issues.length === 0, m.issues.join('; '));
    }
    await page.screenshot({ path: `${SHOTS}fix-nombres-${game}-${w}x${h}.png` });
    await ctx.close();
  }
}

// ---------- 2. Celular en vertical: aviso para girar ----------
{
  const { ctx, page } = await open('demo=game&longnames&pause', { width: 390, height: 844 }, { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const vis = await page.evaluate(() => {
    const el = document.querySelector('.gt-rotate');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { display: getComputedStyle(el).display, w: r.width, h: r.height, text: el.textContent };
  });
  check('390×844 vertical: aparece el aviso "gira tu teléfono"', !!vis && vis.display !== 'none' && vis.w >= 380 && vis.h >= 800, JSON.stringify(vis));
  await page.screenshot({ path: `${SHOTS}fix-vertical-390x844.png` });
  // Al girarlo, el aviso desaparece
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(500);
  const gone = await page.evaluate(() => {
    const el = document.querySelector('.gt-rotate');
    return !el || getComputedStyle(el).display === 'none';
  });
  check('844×390 horizontal: el aviso se quita', gone);
  await ctx.close();
}

// ---------- 3. Modal de fin con un nombre largo ----------
for (const [w, h, mobile] of [[844, 390, true], [1280, 720, false], [1920, 1080, false]]) {
  const { ctx, page } = await open('demo=game&longnames&pause', { width: w, height: h }, mobile ? { isMobile: true, hasTouch: true } : {});
  await page.evaluate(() => window.__ronaDemo.run('lose'));
  await page.locator('.gt-end-title').waitFor({ timeout: 6000 });
  await sleep(1600);
  const m = await page.evaluate(() => {
    const t = document.querySelector('.gt-end-title');
    const card = document.querySelector('.gt-end-card').getBoundingClientRect();
    const r = t.getBoundingClientRect();
    // Contraste del relleno del título contra el fondo blanco del modal
    const rgb = getComputedStyle(t).color.match(/\d+/g).slice(0, 3).map(Number);
    const lum = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    return {
      text: t.textContent,
      inside: r.left >= card.left - 1 && r.right <= card.right + 1 && t.scrollWidth <= t.clientWidth + 1,
      inViewport: card.left >= 0 && card.right <= innerWidth && card.top >= -1 && card.bottom <= innerHeight + 1,
      contrast: 1.05 / (L + 0.05),
    };
  });
  check(`fin ${w}×${h}: "${m.text}" cabe en el modal`, m.inside);
  check(`fin ${w}×${h}: el modal cabe en la pantalla`, m.inViewport);
  check(`fin ${w}×${h}: el título de derrota tiene contraste ≥ 3:1 sobre blanco`, m.contrast >= 3, `${m.contrast.toFixed(2)}:1`);
  await page.screenshot({ path: `${SHOTS}fix-fin-${w}x${h}.png` });
  await ctx.close();
}

// ---------- 4. Pista de la carta seleccionada, teclado y destinos ----------
{
  const { ctx, page } = await open('demo=game&longnames&pause', { width: 1920, height: 1080 });
  // Seleccionar el trasplante (con el ratón) y leer la pista
  await page.locator('.gt-hand .gt-hand-card[aria-label="Trasplante"]').click();
  await sleep(500);
  const hint = await page.evaluate(() => {
    const el = document.querySelector('.gt-hint');
    const r = el.getBoundingClientRect();
    return { text: el.querySelector('span')?.textContent || '', w: r.width, ws: getComputedStyle(el).whiteSpace };
  });
  check('pista del trasplante: sin repetir la descripción del tratamiento', !hint.text.includes('Intercambia un órgano entre dos jugadores'), hint.text);
  check('pista: no ocupa más del 62 % del ancho', hint.w <= 1920 * 0.62, `${Math.round(hint.w)}px, white-space ${hint.ws}`);
  await page.screenshot({ path: `${SHOTS}fix-pista-trasplante.png` });

  // Todos los destinos resaltados son operables con teclado
  const drops = await page.evaluate(() => [...document.querySelectorAll('[data-drop]')].map((e) => ({
    role: e.getAttribute('role'), tab: e.getAttribute('tabindex'), label: e.getAttribute('aria-label') || '',
  })));
  const badDrops = drops.filter((d) => d.role !== 'button' || !['0', '-1'].includes(d.tab) || !d.label);
  check('destinos con role="button", tabindex y aria-label', drops.length > 0 && badDrops.length === 0, `${drops.length} destinos, ${badDrops.length} sin accesibilidad; ej. ${JSON.stringify(drops[0])}`);
  await page.keyboard.press('Escape');
  await sleep(300);

  // Jugar una roña sólo con el teclado: foco en la carta → Enter → el foco salta al destino → Enter
  const before = await page.evaluate(() => window.__ronaStore.getState().game.hand.map((c) => c.id).join());
  const virus = page.locator('.gt-hand .gt-hand-card[aria-label^="Roña"]').first();
  await virus.focus();
  await page.keyboard.press('Enter');
  await sleep(400);
  const focused = await page.evaluate(() => ({ drop: document.activeElement?.dataset?.drop || null, label: document.activeElement?.getAttribute('aria-label') }));
  check('al elegir una carta con teclado, el foco pasa al primer destino', !!focused.drop, JSON.stringify(focused));
  await page.keyboard.press('Enter');
  await sleep(900);
  const after = await page.evaluate(() => window.__ronaStore.getState().game.hand.map((c) => c.id).join());
  check('una carta se puede jugar sólo con el teclado', before !== after);
  await ctx.close();
}

// ---------- 5. Revelación de un tratamiento rival vs. la píldora de turno ----------
{
  const { ctx, page } = await open('demo=game&longnames&pause', { width: 1280, height: 720 });
  await page.evaluate(() => window.__ronaDemo.run('glove'));
  await page.locator('.fx-reveal').waitFor({ timeout: 4000 });
  await sleep(450);
  const r = await page.evaluate(() => {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, op: +getComputedStyle(e.closest('.gt-hint-wrap') || e).opacity }; };
    return { reveal: box('.fx-reveal'), label: box('.fx-reveal-label'), hint: box('.gt-hint') };
  });
  const hintVisible = r.hint && r.hint.op > 0.05;
  check('la revelación no tapa la píldora de turno', !hintVisible || (!overlap(r.reveal, r.hint) && !overlap(r.label, r.hint)), JSON.stringify(r));
  await page.screenshot({ path: `${SHOTS}fix-revelacion.png` });
  await ctx.close();
}

// ---------- 6. Chat de la mesa con la fuente de lectura ----------
{
  const { ctx, page } = await open('demo=game&longnames&pause', { width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Chat' }).click();
  await sleep(600);
  const f = await page.evaluate(() => ({
    msg: getComputedStyle(document.querySelector('.gt-msg span')).fontFamily,
    input: getComputedStyle(document.querySelector('.gt-chat-form input')).fontFamily,
  }));
  check('chat de la mesa: mensajes y campo con la fuente de lectura', !/super_sedan/.test(f.msg) && !/super_sedan/.test(f.input), JSON.stringify(f));
  await page.screenshot({ path: `${SHOTS}fix-chat.png` });
  await ctx.close();
}

// ---------- 7. Peso de las imágenes ----------
{
  const kb = statSync(`${ASSETS}doodles.png`).size / 1024;
  check('doodles.png pesa menos de 200 KB', kb < 200, `${Math.round(kb)} KB`);
  const { ctx, page } = await open('demo=game6&pause', { width: 1280, height: 720 });
  const backs = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => /back_/.test(i.src)).map((i) => i.src.match(/back_\w+/)[0]));
  const big = backs.filter((b) => b === 'back_big');
  check('los reversos de la mesa usan la versión _sm', backs.length > 0 && big.length === 0, `${backs.length} reversos, ${big.length} _big`);
  await ctx.close();
}

// ---------- 8. Un solo silencio para la música y los efectos (flujo real con servidor) ----------
if (process.env.SKIP_REAL) {
  skip('silencio compartido lobby → mesa', 'SKIP_REAL');
} else {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`real: ${e.message}`));
  await page.goto(BASE);
  const ok = await page.waitForFunction(() => window.__ronaStore?.getState().connected, null, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!ok) {
    skip('silencio compartido lobby → mesa', 'no hay servidor detrás de este vite');
  } else {
    await page.getByRole('button', { name: /Jugar/ }).click({ force: true });
    const input = page.getByPlaceholder('¿Cómo te llamas?');
    await input.waitFor();
    await input.fill('Muteado');
    await page.getByRole('button', { name: 'Guardar perfil' }).click();
    await page.getByRole('button', { name: 'Silenciar sonido' }).first().click();
    await sleep(300);
    const roomInput = page.locator('form', { hasText: 'Crear sala' }).locator('input').first();
    await roomInput.fill(`Silencio ${Date.now() % 10000}`);
    await page.getByRole('button', { name: 'Crear sala' }).click();
    await page.getByRole('button', { name: /Agregar bot/ }).click();
    await page.waitForFunction(() => window.__ronaStore.getState().room?.players.length === 2, null, { timeout: 8000 });
    await page.getByRole('button', { name: /Empezar/ }).click();
    await page.locator('.gt-root:not(.gt-loading)').waitFor({ timeout: 10000 });
    await sleep(1200);
    const label = await page.locator('.gt-controls .gt-icon-btn').first().getAttribute('aria-label');
    check('silenciado en el lobby → la mesa empieza silenciada', label === 'Activar sonido', `aria-label "${label}"`);
    // Al reactivar en la mesa, la música también queda activa (y al revés)
    await page.locator('.gt-controls .gt-icon-btn').first().click();
    await sleep(200);
    const st = await page.evaluate(() => ({ ls: localStorage.getItem('rona.muted') }));
    const label2 = await page.locator('.gt-controls .gt-icon-btn').first().getAttribute('aria-label');
    check('reactivar en la mesa des-silencia todo (localStorage = 0)', st.ls === '0' && label2 === 'Silenciar', `ls=${st.ls}, aria-label "${label2}"`);
    await page.screenshot({ path: `${SHOTS}fix-silencio-mesa.png` });
    // Salir para no dejar la sala colgada
    await page.getByRole('button', { name: 'Salir de la partida' }).click();
    await page.getByRole('button', { name: 'Salir', exact: true }).click().catch(() => {});
    await sleep(500);
  }
  await ctx.close();
}

await browser.close();

check('sin errores de consola ni excepciones', errors.length === 0, errors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones bien`);
process.exit(failed.length ? 1 : 0);
