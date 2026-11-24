// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_ORIGIN = 'https://tahabagatur.com';

const BILINGUAL_PAIRS = [
  ['/', '/tr/'],
  ['/notes/', '/tr/notes/'],
  ['/notes/red-team-my-own-rag-bot', '/tr/notes/red-team-my-own-rag-bot'],
  ['/notes/parallel-ai-sessions', '/tr/notes/parallel-ai-sessions'],
  ['/notes/bekci-agent-security', '/tr/notes/bekci-agent-security'],
  ['/notes/audit-01-claude-code-vs-hermes', '/tr/notes/audit-01-claude-code-vs-hermes'],
  ['/lab/canary/', '/tr/lab/canary/'],
  ['/live/', '/tr/live/'],
  ['/work/slow-llm-prefill', '/tr/work/slow-llm-prefill'],
  ['/work/gpu-node-nvme-hang', '/tr/work/gpu-node-nvme-hang'],
  ['/work/agentless-monitoring-bridge', '/tr/work/agentless-monitoring-bridge'],
  ['/work/dns-migration-decision', '/tr/work/dns-migration-decision'],
];

const SITEMAP_PAGES = [
  ...BILINGUAL_PAIRS.flatMap(([en, tr]) => [en, tr]),
  '/notes/audit-01-claude-code-vs-hermes/matrix',
  '/notes/audit-01-claude-code-vs-hermes/method',
];

const ALL_PAGES = [
  ...SITEMAP_PAGES,
];

test.describe('1. Sitemap, robots.txt & Atom feeds', () => {
  test('robots.txt is 200 and includes Sitemap directive', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toContain('Sitemap: https://tahabagatur.com/sitemap.xml');
  });

  test('sitemap.xml lists all public bilingual URLs with valid lastmod and hreflang alternates', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs.length).toBe(SITEMAP_PAGES.length);
    expect(new Set(locs).size).toBe(locs.length);
    for (const p of SITEMAP_PAGES) {
      expect(locs).toContain(BASE_ORIGIN + p);
      const pageRes = await request.get(p);
      expect(pageRes.status(), `Sitemap URL ${p} should return 200`).toBe(200);
    }

    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
    expect(lastmods.length).toBe(SITEMAP_PAGES.length);
    for (const lm of lastmods) {
      expect(lm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    for (const [enPath, trPath] of BILINGUAL_PAIRS) {
      const en = BASE_ORIGIN + enPath;
      const tr = BASE_ORIGIN + trPath;
      const pairBlocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
        .filter(m => m[1].includes(`<loc>${en}</loc>`) || m[1].includes(`<loc>${tr}</loc>`));
      expect(pairBlocks).toHaveLength(2);
      for (const block of pairBlocks) {
        expect(block[1]).toContain(`hreflang="en" href="${en}"`);
        expect(block[1]).toContain(`hreflang="tr" href="${tr}"`);
        expect(block[1]).toContain(`hreflang="x-default" href="${en}"`);
      }
    }
  });

  test('Atom feeds (/feed.xml and /tr/feed.xml) are valid and link to notes', async ({ request }) => {
    for (const [feedPath, lang, notePath] of [
      ['/feed.xml', 'en', '/notes/red-team-my-own-rag-bot'],
      ['/tr/feed.xml', 'tr', '/tr/notes/red-team-my-own-rag-bot'],
    ]) {
      const res = await request.get(feedPath);
      expect(res.status()).toBe(200);
      const xml = await res.text();
      expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
      expect(xml).toContain(`xml:lang="${lang}"`);
      expect(xml).toContain(`<link rel="self" type="application/atom+xml" href="${BASE_ORIGIN}${feedPath}"/>`);
      expect(xml).toContain(`<id>${BASE_ORIGIN}${notePath}</id>`);
      expect(xml).toContain('<entry>');
      expect(xml).toContain('<summary>');
    }
  });
});

test.describe('2. Clean URLs, redirects, 404 & security headers', () => {
  test('404 page returns HTTP 404 with bilingual help and noindex', async ({ page }) => {
    const res = await page.goto('/non-existent-route-12345');
    expect(res && res.status()).toBe(404);
    await expect(page.locator('h1').first()).toContainText('Page not found');
    await expect(page.locator('.tr h1')).toContainText('Sayfa bulunamadı');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toBe('noindex');
  });

  test('unpublished scheduled notes redirect to the archive in both languages', async ({ request }) => {
    for (const [from, to] of [
      ['/notes/reading-silenced-alerts', '/notes/'], ['/tr/notes/reading-silenced-alerts', '/tr/notes/'],
      ['/notes/empty-source-backups', '/notes/'], ['/tr/notes/empty-source-backups', '/tr/notes/'],
      ['/notes/ai-tool-review', '/notes/'], ['/tr/notes/ai-tool-review', '/tr/notes/'],
    ]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect([301, 302]).toContain(res.status());
      expect(res.headers()['location']).toBe(to);
    }
  });

  test('clean URL redirects (.html, /work, trailing slash)', async ({ request }) => {
    const r1 = await request.get('/notes/red-team-my-own-rag-bot.html', { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(r1.status());
    expect(r1.headers()['location']).toBe('/notes/red-team-my-own-rag-bot');

    const r2 = await request.get('/work/slow-llm-prefill.html', { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(r2.status());
    expect(r2.headers()['location']).toBe('/work/slow-llm-prefill');

    const r3 = await request.get('/work', { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(r3.status());
    expect(r3.headers()['location']).toBe('/#work');

    const r4 = await request.get('/tr/work', { maxRedirects: 0 });
    expect([301, 302, 308]).toContain(r4.status());
    expect(r4.headers()['location']).toBe('/tr/#work');
  });

  test('security headers and X-Robots-Tag on repo files', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['content-security-policy']).toContain("default-src 'self'");
    expect(h['content-security-policy']).toContain('https://static.cloudflareinsights.com/beacon.min.js');
    expect(h['content-security-policy']).toContain('https://cloudflareinsights.com');

    const readme = await request.get('/README.md');
    expect(readme.headers()['x-robots-tag']).toBe('noindex');
    const script = await request.get('/scripts/kontrol.sh');
    expect(script.headers()['x-robots-tag']).toBe('noindex');
  });
});

test('Social cards are up to date with page text', () => {
  execFileSync('node', ['scripts/og.mjs', '--check'], { stdio: 'inherit' });
});

test.describe('3. SEO, JSON-LD, OpenGraph & email_off across all pages', () => {
  for (const p of ALL_PAGES) {
    test(`Metadata & JSON-LD check on ${p}`, async ({ page }) => {
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', err => consoleErrors.push(err.message));

      const res = await page.goto(p);
      expect(res && res.status()).toBe(200);
      expect(consoleErrors).toEqual([]);

      const expectedLang = p.startsWith('/tr/') ? 'tr' : 'en';
      await expect(page.locator('html')).toHaveAttribute('lang', expectedLang);

      const title = await page.title();
      expect(title.length).toBeGreaterThanOrEqual(10);

      const desc = await page.locator('meta[name="description"]').getAttribute('content');
      expect(desc && desc.length).toBeGreaterThan(30);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(canonical).toBe(BASE_ORIGIN + p);

      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
      const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
      const ogImg = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(ogTitle && ogTitle.length).toBeGreaterThan(5);
      expect(ogUrl).toBe(BASE_ORIGIN + p);
      const isHome = p === '/' || p === '/tr/';
      const slug = p.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '');
      expect(ogImg).toBe(BASE_ORIGIN + (isHome ? '/og.png' : `/og/${slug}.png`));
      const twImg = await page.locator('meta[name="twitter:image"]').getAttribute('content');
      expect(twImg).toBe(ogImg);
      const imgRes = await page.request.get(ogImg.replace(BASE_ORIGIN, ''));
      expect(imgRes.status()).toBe(200);

      await expect(page.locator('h1')).toHaveCount(1);

      const rawHtml = await page.content();
      expect(rawHtml).toContain('<!--email_off-->');
      expect(rawHtml).toContain('<!--/email_off-->');

      if (p !== '/red-team-check/') {
        const ldScripts = await page.locator('script[type="application/ld+json"]').allTextContents();
        expect(ldScripts.length).toBeGreaterThanOrEqual(1);
        for (const raw of ldScripts) {
          const parsed = JSON.parse(raw);
          expect(parsed['@context']).toBe('https://schema.org');
        }
      }
    });
  }
});

test.describe('4. Bilingual EN <-> TR navigation and hreflang symmetry', () => {
  for (const [enPath, trPath] of BILINGUAL_PAIRS) {
    test(`Language toggle & hreflang pair: ${enPath} <-> ${trPath}`, async ({ page }) => {
      await page.goto(enPath);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', BASE_ORIGIN + enPath);
      await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute('href', BASE_ORIGIN + trPath);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', BASE_ORIGIN + enPath);

      const langLinkEn = page.locator('header a.lang');
      await expect(langLinkEn).toHaveText('Türkçe');
      await expect(langLinkEn).toHaveAttribute('href', trPath);

      await langLinkEn.click();
      await expect(page).toHaveURL(new RegExp(trPath.replace(/\//g, '\\/') + '$'));
      await expect(page.locator('html')).toHaveAttribute('lang', 'tr');

      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', BASE_ORIGIN + enPath);
      await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute('href', BASE_ORIGIN + trPath);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute('href', BASE_ORIGIN + enPath);

      const langLinkTr = page.locator('header a.lang');
      await expect(langLinkTr).toHaveText('English');
      await expect(langLinkTr).toHaveAttribute('href', enPath);

      await langLinkTr.click();
      await expect(page).toHaveURL(new RegExp(enPath.replace(/\//g, '\\/') + '$'));
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  }
});

test('Canary lab contains four harmless codes and no tracking or external scripts', async ({ page }) => {
  await page.goto('/lab/canary/');
  const html = await page.content();
  for (const code of ['CANARY-A7', 'CANARY-B4', 'CANARY-C9', 'CANARY-D2']) {
    expect(html).toContain(code);
  }
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('script:not([type="application/ld+json"])')).toHaveCount(0);
});

test.describe('5. Accessibility (axe-core WCAG AA) & responsive layout', () => {
  for (const p of ALL_PAGES) {
    for (const scheme of ['light', 'dark']) {
      test(`axe-core zero violations on ${p} (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(p);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }

  test('Live status pages are static, labeled as sample data, and bilingual', async ({ page }) => {
    for (const [p, heading] of [
      ['/live/', 'Production status · sample data'],
      ['/tr/live/', 'Üretim durumu · örnek veri'],
    ]) {
      await page.goto(p);
      await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute('href', /^\/assets\/site\.css(\?v=\w+)?$/);
      await expect(page.locator('main h1')).toHaveText(heading);
      await expect(page.locator('main')).toContainText(p.startsWith('/tr/') ? 'Örnek veri' : 'Sample data');
      await expect(page.locator('main')).toContainText('SLO');
      // Only the first-party day/night toggle; no data fetching or tracking.
      await expect(page.locator('script:not([type="application/ld+json"]):not([src="/assets/tema.js"])')).toHaveCount(0);
    }
  });

  for (const vp of [
    { name: 'mobile-320', width: 320, height: 740 },
    { name: 'mobile-375', width: 375, height: 812 },
    { name: 'mobile-360', width: 360, height: 740 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1280', width: 1280, height: 800 },
  ]) {
    test(`No horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const p of ['/', '/tr/', '/notes/', '/notes/red-team-my-own-rag-bot', '/work/slow-llm-prefill', '/live/', '/tr/live/']) {
        await page.goto(p);
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Overflow on ${p} at ${vp.name}`).toBe(false);
      }
    });
  }
});


test('Retired service URLs redirect away and home pages avoid employment-seeking language', async ({ page, request }) => {
  for (const [oldPath, destination] of [
    ['/red-team-check', 'https://check.tahabagatur.com/'],
    ['/red-team-check/', 'https://check.tahabagatur.com/'],
    ['/tr/red-team-check', 'https://check.tahabagatur.com/tr/'],
    ['/tr/red-team-check/', 'https://check.tahabagatur.com/tr/'],
  ]) {
    const res = await request.get(oldPath, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()['location']).toBe(destination);
  }
  for (const p of ['/', '/tr/']) {
    await page.goto(p);
    const text = (await page.locator('body').innerText()).toLowerCase();
    for (const phrase of ['open to work', 'available for', 'hire me', 'taking engagements', 'fixed-price red-team', 'ai red-team check']) {
      expect(text).not.toContain(phrase);
    }
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(7);
    await expect(page.locator('#ask a[href^="mailto:"]')).toHaveCount(6);
    const questions = await page.locator('#ask a[href^="mailto:"]').evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(questions.every(href => href.includes('subject='))).toBe(true);
    await expect(page.locator('#ask h2')).toHaveText(p.startsWith('/tr/') ? 'Danış bana' : 'Ask me');
    await expect(page.locator('a[href="/cv.pdf"]')).toHaveCount(1);
  }
});

test.describe('6. Bottom-of-page account links open in a new tab', () => {
  for (const p of [...ALL_PAGES, '/404']) {
    test(`external account links on ${p} use target=_blank and rel=noopener`, async ({ page }) => {
      await page.goto(p);
      const bottom = page.locator('#contact, footer');
      const links = await bottom.locator('a[href]').evaluateAll(els => els.map(a => ({
        href: a.getAttribute('href'), target: a.getAttribute('target'), rel: (a.getAttribute('rel') || '').split(/\s+/),
      })));
      for (const l of links) {
        if (/^https?:\/\//.test(l.href)) {
          expect(l.target, l.href).toBe('_blank');
          expect(l.rel, l.href).toContain('noopener');
          expect(l.rel, l.href).toContain('noreferrer');
        } else {
          expect(l.target, l.href).toBeNull();
        }
      }
      if (p === '/' || p === '/tr/') {
        expect(links.filter(l => /^https?:\/\//.test(l.href))).toHaveLength(8);
        await expect(page.locator('#newtab-hint')).toHaveText(p === '/' ? '(opens in a new tab)' : '(yeni sekmede açılır)');
      }
    });
  }

  test('clicking an account link opens a new tab and keeps the home page', async ({ page, context }) => {
    await context.route(/^https:\/\/github\.com\//, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
    await page.goto('/');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#contact .social a[href="https://github.com/mtbagatur"]').click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe('https://github.com/mtbagatur');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
