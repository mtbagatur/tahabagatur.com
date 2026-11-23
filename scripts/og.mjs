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
const TEMPLATE_VERSION = '2';
const SKIP = new Set(['index.html', 'tr/index.html', '404.html']);
const IGNORE_DIRS = new Set(['node_modules', 'test-results', 'og', '.git', 'samples', 'scripts', 'tests']);
const CHECK = process.argv.includes('--check');

const KICKERS = [
  ['work/', 'CASE STUDY', 'VAKA ÇALIŞMASI'],
  ['notes/index', 'FIELD NOTES', 'SAHA NOTLARI'],
  ['notes/', 'FIELD NOTE', 'SAHA NOTU'],
  ['lab/canary/', 'PROMPT-INJECTION CANARY', 'PROMPT INJECTION KANARYASI'],
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

function cardHtml(c) {
  const titleSize = c.title.length > 70 ? 54 : c.title.length > 40 ? 62 : 72;
  const body = c.desc.replace(/^(Case study|Vaka çalışması|Vaka):\s*/i, '');
  const desc = body.length > 170 ? body.slice(0, 167).replace(/\s+\S*$/, '') + '…' : body;
  return `<html><body style="margin:0;width:1200px;height:630px;background:#121518;color:#e8e6e1;font-family:'Noto Sans',system-ui,sans-serif;overflow:hidden">
<div style="position:absolute;left:0;top:0;bottom:0;width:14px;background:#c8692a"></div>
<div style="position:absolute;left:90px;right:90px;top:84px;bottom:70px;display:flex;flex-direction:column">
  <div style="color:#a8be7a;font-weight:600;letter-spacing:2px;font-size:24px">${esc(c.kicker)}</div>
  <div style="font-weight:700;font-size:${titleSize}px;line-height:1.1;margin-top:24px">${esc(c.title)}</div>
  <div style="color:#9ea5ad;font-size:27px;line-height:1.42;margin-top:26px">${esc(desc)}</div>
  <div style="margin-top:auto;color:#8bb8e6;font-weight:600;font-size:25px">Taha Bagatur · ${esc(c.pageUrl)}</div>
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
  const img = `${ORIGIN}/${c.png}`;
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
  for (const { c, hash } of jobs) {
    mkdirSync(dirname(join(ROOT, c.png)), { recursive: true });
    await page.setContent(cardHtml(c));
    await page.screenshot({ path: join(ROOT, c.png) });
    manifest[c.png] = hash;
    console.log('rendered', c.png);
  }
  await browser.close();
  writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + '\n');
}
console.log(`${stale.length} page(s) updated, ${jobs.length} card(s) rendered.`);
