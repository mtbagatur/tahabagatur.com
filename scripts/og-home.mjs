// Renders scripts/og-home.html to /og.png (1200x630). Needs the dev server: python3 scripts/serve.py 8793
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:8793';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(base + '/scripts/og-home.html');
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: new URL('../og.png', import.meta.url).pathname });
await b.close();
