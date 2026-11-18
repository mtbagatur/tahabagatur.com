#!/usr/bin/env bash
# Deterministic site check: prints one finding per line as "SEVERITY | page | issue". No model, no network writes.
#   scripts/kontrol.sh [base_url]   (default https://tahabagatur.com)
set -u
base="${1:-https://tahabagatur.com}"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# Pages come from the sitemap, so a new page is checked as soon as it is listed there.
pages=$(curl -s --max-time 15 "$base/sitemap.xml" | grep -o '<loc>[^<]*</loc>' | sed 's#<loc>https://tahabagatur.com##;s#</loc>##')
[ -n "$pages" ] || pages="/ /red-team-check/ /notes/red-team-my-own-rag-bot"
pages="$pages /404-test-yok"
for p in $pages; do
  f="$tmp/$(echo "$p" | tr '/' '_').html"
  code=$(curl -s -L -o "$f" -w '%{http_code}' --max-time 15 "$base$p")
  if [ "$p" = "/404-test-yok" ]; then
    [ "$code" = "404" ] || echo "YUKSEK | $p | bilinmeyen yol $code dönüyor (404 olmalı)"; continue
  fi
  [ "$code" = "200" ] || { echo "YUKSEK | $p | HTTP $code"; continue; }
  for tag in '<title>' 'name="description"' 'property="og:title"' 'property="og:image"' 'rel="canonical"' 'name="viewport"' '<html lang='; do
    grep -qi -- "$tag" "$f" || echo "ORTA | $p | eksik: $tag"
  done
  size=$(wc -c < "$f"); [ "$size" -gt 300000 ] && echo "ORTA | $p | sayfa ${size} bayt"
  grep -o 'href="[^"#]*"' "$f" | sed 's/href="//;s/"$//' | sort -u | while read -r l; do
    case "$l" in
      mailto:*|tel:*|data:*|/cdn-cgi/*|"") continue ;;
      https://tahabagatur.com/*) u="$base${l#https://tahabagatur.com}" ;;
      /*) u="$base$l" ;;
      http*) u="$l" ;;
      *) u="$base${p%/*}/$l" ;;
    esac
    c=$(curl -s -o /dev/null -L -w '%{http_code}' --max-time 15 -A 'Mozilla/5.0 site-kontrol' "$u")
    case "$c" in 2*) ;; 403|429|999) echo "DUSUK | $p | $u -> $c (bot engeli olabilir)" ;; *) echo "YUKSEK | $p | kırık link $u -> $c" ;; esac
  done
done
curl -s --max-time 15 "$base/robots.txt" | grep -qi '^Sitemap:' || echo "ORTA | /robots.txt | Sitemap satırı yok"
for f in /robots.txt /sitemap.xml /feed.xml /tr/feed.xml; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$base$f"); [ "$c" = "200" ] || echo "ORTA | $f | HTTP $c"
done
