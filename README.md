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
- `red-team-check/`: AI Red-Team Check service page
- `samples/`: sample reports (PDF)
- `scripts/kontrol.sh`: deterministic site check (status codes, broken links, meta/OG tags, sitemap, feeds)
- `scripts/serve.py`: local server matching Cloudflare Pages clean URLs, headers and redirects
- `tests/site.spec.js`: Playwright + axe-core end-to-end and WCAG AA accessibility suite

## Check & Test

```sh
scripts/kontrol.sh                    # live site
python3 scripts/serve.py 8787         # local preview
scripts/kontrol.sh http://127.0.0.1:8787
npx playwright test                   # 61 end-to-end & accessibility tests
```

Each `kontrol.sh` finding is one line: `SEVERITY | page | issue`.
