# tahabagatur.com

Source of [tahabagatur.com](https://tahabagatur.com), the personal site of Taha Bagatur (DevOps & MLOps engineer).

Plain static HTML, no build step. Served by Cloudflare Pages.

## Layout

- `index.html`: home page
- `red-team-check/`: AI Red-Team Check service page
- `notes/`: write-ups from real work
- `samples/`: sample reports (PDF)
- `scripts/kontrol.sh`: deterministic site check (status codes, broken links, meta/OG tags, sitemap)

## Check

```sh
scripts/kontrol.sh                    # live site
scripts/kontrol.sh http://localhost:8000
```

Each finding is one line: `SEVERITY | page | issue`.
