# tahabagatur.com

Source of [tahabagatur.com](https://tahabagatur.com), the personal site of Taha Bagatur (DevOps & MLOps engineer).

Plain static HTML and CSS, no client-side JavaScript, no build step. Default language is English (`/`), with a full Turkish mirror under `/tr/`. Served by Cloudflare Pages.

## Layout

- `index.html`, `tr/index.html`: home pages (EN / TR)
- `work/*.html`, `tr/work/*.html`: case studies (`/work/<slug>`)
- `notes/index.html`, `tr/notes/index.html`: notes index (`/notes/`)
- `notes/*.html`, `tr/notes/*.html`: write-ups from real work
- `feed.xml`, `tr/feed.xml`: Atom feeds (EN / TR)
- `sitemap.xml`, `robots.txt`, `_headers`, `_redirects`: SEO, headers and redirects
- `assets/site.css`: shared stylesheet (light & dark mode)
- `/live/` and `/tr/live/`: static public status pages generated from JSON; no live connection by default
- `scripts/kontrol.sh`: deterministic site check (status codes, broken links, meta/OG tags, sitemap, feeds)
- `scripts/serve.py`: local server matching Cloudflare Pages clean URLs, headers and redirects
- `scripts/build-live.py`: renders the EN/TR static status pages from `live/data.json` (the public data export contract for open-ops-lab). Start with `python3 scripts/build-live.py && node scripts/og.mjs`; see the live-data section below.
- `scripts/og.mjs`: one social preview card per page (`og/…png`), rendered from the page's own og:title/description; re-renders only what changed. `--check` fails on stale cards (also run by the test suite). Pre-commit hook (`scripts/hooks`, enable once with `git config core.hooksPath scripts/hooks`) runs it automatically. Home pages keep the hand-made `/og.png`.
- `tests/site.spec.js`: Playwright + axe-core end-to-end and WCAG AA accessibility suite

## Check & Test

```sh
scripts/kontrol.sh                    # live site
python3 scripts/serve.py 8787         # local preview
scripts/kontrol.sh http://127.0.0.1:8787
npx playwright test                   # Playwright + axe accessibility and responsive suite
```

Each `kontrol.sh` finding is one line: `SEVERITY | page | issue`.

## Live status data

`live/data.json` is a safe example export matching the fields planned for open-ops-lab: generation timestamp, optional uptime and SLO values, and a bounded list of public alarm summaries. `null` means the metric is not connected; the example contains no real measurements or incidents. `python3 scripts/build-live.py` validates this schema and writes the no-JavaScript pages at `/live/` and `/tr/live/`.

The real connection is a separate step: open-ops-lab should export only explicitly public, aggregated fields to this JSON schema, with timestamps and alarm text reviewed for sensitive identifiers before publication. The generator must run after export and before deployment. No endpoint, credential, or live data connection is configured in this repository.

Cloudflare Web Analytics has a commented insertion marker in each public HTML page. Add Cloudflare's provided snippet to all public HTML pages only after its token is supplied; no token or active analytics script is present now. CSP allowances follow [Cloudflare’s Web Analytics instructions](https://developers.cloudflare.com/web-analytics/faq/).

Talks: the ICAIS'24 abstract-book publisher page is linked. A safe public ICOLES proceedings link has not been verified: `[TEYİT]` remains on those two cards, and the downloadable PDF was intentionally not linked because it contains third-party contact details.
