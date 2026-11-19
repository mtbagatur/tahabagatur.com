// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

const BASE_ORIGIN = 'https://tahabagatur.com';

const BILINGUAL_PAIRS = [
  ['/', '/tr/'],
  ['/notes/', '/tr/notes/'],
  ['/notes/red-team-my-own-rag-bot', '/tr/notes/red-team-my-own-rag-bot'],
  ['/notes/parallel-ai-sessions', '/tr/notes/parallel-ai-sessions'],
  ['/notes/reading-silenced-alerts', '/tr/notes/reading-silenced-alerts'],
  ['/notes/empty-source-backups', '/tr/notes/empty-source-backups'],
  ['/notes/ai-tool-review', '/tr/notes/ai-tool-review'],
  ['/lab/canary/', '/tr/lab/canary/'],
  ['/work/slow-llm-prefill', '/tr/work/slow-llm-prefill'],
  ['/work/gpu-node-nvme-hang', '/tr/work/gpu-node-nvme-hang'],
  ['/work/agentless-monitoring-bridge', '/tr/work/agentless-monitoring-bridge'],
  ['/work/dns-migration-decision', '/tr/work/dns-migration-decision'],
];

const SITEMAP_PAGES = [
  ...BILINGUAL_PAIRS.flatMap(([en, tr]) => [en, tr]),
];

const ALL_PAGES = [
  ...SITEMAP_PAGES,
  '/red-team-check/',
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

    const readme = await request.get('/README.md');
    expect(readme.headers()['x-robots-tag']).toBe('noindex');
    const script = await request.get('/scripts/kontrol.sh');
    expect(script.headers()['x-robots-tag']).toBe('noindex');
  });
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
      expect(ogImg).toBe(BASE_ORIGIN + '/og.png');

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

  for (const vp of [
    { name: 'mobile-360', width: 360, height: 740 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1280', width: 1280, height: 800 },
  ]) {
    test(`No horizontal overflow on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const p of ['/', '/tr/', '/notes/', '/notes/red-team-my-own-rag-bot', '/work/slow-llm-prefill']) {
        await page.goto(p);
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(overflow, `Overflow on ${p} at ${vp.name}`).toBe(false);
      }
    });
  }
});
