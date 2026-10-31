// Uso: node e2e/shot.mjs <url> <salida.png> [ancho] [alto] [esperaMs]
import { chromium } from 'playwright';
const [url, out, w = '1600', h = '900', wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
await browser.close();
console.log('ok', out);
