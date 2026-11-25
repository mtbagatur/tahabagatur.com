// Generates one social preview card (1200x630) per page from its own
// og:title / og:description, and points og:image + twitter:image at it.
// Cards are re-rendered only when the page text or the template changes
// (hashes in og/manifest.json).
//
//   node scripts/og.mjs          render stale cards, update meta tags
//   node scripts/og.mjs --check  exit 1 if any card or meta tag is stale
//
// The home pages (/ and /tr/) keep the hand-made /og.png.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://tahabagatur.com';
const TEMPLATE_VERSION = '4';
const SKIP = new Set(['index.html', 'tr/index.html', '404.html']);
const IGNORE_DIRS = new Set(['node_modules', 'test-results', 'og', '.git', 'samples', 'scripts', 'tests', 'onizleme']);
const CHECK = process.argv.includes('--check');

const KICKERS = [
  ['work/', 'CASE STUDY', 'VAKA ÇALIŞMASI'],
  ['notes/index', 'FIELD NOTES', 'SAHA NOTLARI'],
  ['notes/', 'FIELD NOTE', 'SAHA NOTU'],
  ['lab/canary/', 'PROMPT-INJECTION CANARY', 'PROMPT INJECTION KANARYASI'],
  ['lab/jetson-', 'LAB · BUILD LOG', 'LAB · KURULUM KAYDI'],
  ['lab/', 'LAB', 'LAB'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!IGNORE_DIRS.has(name)) walk(p, out); }
    else if (name.endsWith('.html')) out.push(relative(ROOT, p));
  }
  return out;
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const meta = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`));
  return m ? decode(m[1]) : null;
};

function cardFor(file, html) {
  const tr = file.startsWith('tr/');
  const rel = tr ? file.slice(3) : file;
  const title = (meta(html, 'property', 'og:title') || '').replace(/ · Taha Bagatur$/, '');
  const desc = meta(html, 'property', 'og:description') || '';
  const k = KICKERS.find(([pre]) => rel.startsWith(pre));
  const kicker = k ? (tr ? k[2] : k[1]) : '';
  const slug = file.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  const pageUrl = (meta(html, 'property', 'og:url') || '').replace(/^https:\/\//, '').replace(/\/$/, '');
  return { title, desc, kicker, pageUrl, png: `og/${slug}.png` };
}

// Card look = the hand-made home card (scripts/og-home.html): fonts, compass and
// palette are read from it so the two cannot drift apart.
const HOME = readFileSync(join(ROOT, 'scripts/og-home.html'), 'utf8');
const FONT_FACES = HOME.split('\n').filter(l => l.startsWith('@font-face')).join('\n');
const COMPASS = HOME.match(/<svg class="bg"[\s\S]*?<\/svg>/)[0];
const SEAL = HOME.match(/<svg class="seal"[\s\S]*?<\/svg>/)[0];

function cardHtml(c) {
  const titleSize = c.title.length > 70 ? 56 : c.title.length > 40 ? 66 : 78;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FACES}
html,body{margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#0f1622;color:#ece4d3;font-family:"Inter Tight",sans-serif;position:relative}
.bg{position:absolute;inset:0}
.bg line{stroke:#c9a46a;stroke-width:.8;opacity:.07}
.bg .rose{stroke:#c9a46a;fill:none;opacity:.16}
.bg .rose .pt{fill:#c9a46a;stroke:none}
.bg .route{stroke:#e0756e;stroke-width:1.6;stroke-dasharray:4 7;fill:none;opacity:.22}
.in{position:absolute;left:84px;top:64px;right:84px;bottom:60px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:16px;font:600 28px "Inter Tight"}
.seal{width:42px;height:42px} .s-bg{fill:#ece4d3} .s-fg{fill:#0f1622}
.eb{margin-top:auto;font:400 20px "IBM Plex Mono";letter-spacing:.08em;color:#ece4d3c4}
.eb i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#5fb393;margin-right:12px;vertical-align:2px}
h1{font:400 ${titleSize}px/1.06 Fraunces,serif;margin:18px 0 0;letter-spacing:-.01em;max-width:900px}
.ft{margin-top:34px;display:flex;justify-content:flex-end;font:400 20px "IBM Plex Mono";color:#ece4d3a8}
</style></head><body>
${COMPASS}
<div class="in">
<div class="brand">${SEAL}Taha Bagatur</div>
<div class="eb"><i></i>${esc(c.kicker)}</div>
<h1>${esc(c.title)}</h1>
<div class="ft"><span>${esc(c.pageUrl)}</span></div>
</div></body></html>`;
}

function setMeta(html, attr, key, value, after) {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  if (re.test(html)) return html.replace(re, tag);
  const anchor = new RegExp(`(<meta ${after.attr}="${after.key}" content="[^"]*">)`);
  if (!anchor.test(html)) throw new Error(`no anchor ${after.key} for ${key}`);
  return html.replace(anchor, `$1\n${tag}`);
}

const manifestPath = join(ROOT, 'og/manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const stale = [];
const jobs = [];

for (const file of walk(ROOT).sort()) {
  if (SKIP.has(file)) continue;
  const html = readFileSync(join(ROOT, file), 'utf8');
  if (!html.includes('property="og:title"')) continue;
  const c = cardFor(file, html);
  const hash = createHash('sha256').update(TEMPLATE_VERSION + cardHtml(c)).digest('hex').slice(0, 16);
  const img = `${ORIGIN}/${c.png}?v=${TEMPLATE_VERSION}`; // versioned: platforms cache cards by URL
  let next = html;
  next = setMeta(next, 'property', 'og:image', img, { attr: 'property', key: 'og:url' });
  next = setMeta(next, 'property', 'og:image:width', '1200', { attr: 'property', key: 'og:image' });
  next = setMeta(next, 'property', 'og:image:height', '630', { attr: 'property', key: 'og:image:width' });
  next = setMeta(next, 'property', 'og:image:alt', c.title, { attr: 'property', key: 'og:image:height' });
  next = setMeta(next, 'name', 'twitter:title', c.title, { attr: 'name', key: 'twitter:card' });
  next = setMeta(next, 'name', 'twitter:description', c.desc, { attr: 'name', key: 'twitter:title' });
  next = setMeta(next, 'name', 'twitter:image', img, { attr: 'name', key: 'twitter:description' });
  next = setMeta(next, 'name', 'twitter:image:alt', c.title, { attr: 'name', key: 'twitter:image' });
  const pngStale = manifest[c.png] !== hash || !existsSync(join(ROOT, c.png));
  if (next !== html || pngStale) stale.push(file);
  if (CHECK) continue;
  if (next !== html) writeFileSync(join(ROOT, file), next);
  if (pngStale) jobs.push({ c, hash });
}

if (CHECK) {
  if (stale.length) { console.error('Stale social cards (run: node scripts/og.mjs):\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log('Social cards up to date.');
  process.exit(0);
}

if (jobs.length) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  let current = '';
  await page.route('https://card.local/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/card.html') return route.fulfill({ contentType: 'text/html', body: current });
    return route.fulfill({ path: join(ROOT, path) });
  });
  for (const { c, hash } of jobs) {
    mkdirSync(dirname(join(ROOT, c.png)), { recursive: true });
    current = cardHtml(c);
    await page.goto('https://card.local/card.html');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(ROOT, c.png) });
    manifest[c.png] = hash;
    console.log('rendered', c.png);
  }
  await browser.close();
  writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
}
console.log(`${stale.length} page(s) updated, ${jobs.length} card(s) rendered.`);
