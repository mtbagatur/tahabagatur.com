#!/usr/bin/env python3
"""Serve the site locally the way Cloudflare Pages does, closely enough for tests.
  python3 scripts/serve.py [port] [root]
- /a/b -> a/b.html, /a/ -> a/index.html, /a -> 308 /a/ when a/ is a folder
- /x.html -> 308 /x, /index.html and /a/index.html -> 308 to the folder
- unknown paths -> 404.html with status 404
- applies _headers (path patterns with *) and exact-match rules from _redirects
Not Cloudflare: no compression, no email obfuscation, no caching."""
import http.server, os, sys, fnmatch

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), ".."))

def parse_headers():
    rules, cur = [], None
    try:
        lines = open(os.path.join(ROOT, "_headers"), encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        return rules
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            cur = (line.strip(), []); rules.append(cur)
        elif cur and ":" in line:
            k, v = line.strip().split(":", 1); cur[1].append((k.strip(), v.strip()))
    return rules

def parse_redirects():
    out = {}
    try:
        for line in open(os.path.join(ROOT, "_redirects"), encoding="utf-8"):
            parts = line.split()
            if len(parts) >= 2 and not parts[0].startswith("#"):
                out[parts[0]] = (parts[1], int(parts[2]) if len(parts) > 2 else 302)
    except FileNotFoundError:
        pass
    return out

HEADERS, REDIRECTS = parse_headers(), parse_redirects()

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
    def end_headers(s):
        path = s.path.split("?")[0]
        for pat, hs in HEADERS:
            if fnmatch.fnmatchcase(path, pat):
                for k, v in hs: s.send_header(k, v)
        super().end_headers()
    def redirect(s, to, code=308):
        s.send_response(code); s.send_header("Location", to); s.send_header("Content-Length", "0"); s.end_headers()
    def send_head(s):
        p = s.path.split("?")[0]
        if p in REDIRECTS:
            to, code = REDIRECTS[p]; s.redirect(to, code); return None
        f = os.path.join(ROOT, p.lstrip("/"))
        if p.endswith("/index.html"):
            s.redirect(p[:-len("index.html")]); return None
        if p.endswith(".html") and os.path.isfile(f):
            s.redirect(p[:-5]); return None
        if os.path.isdir(f):
            if not p.endswith("/"):
                s.redirect(p + "/"); return None
            if not os.path.isfile(os.path.join(f, "index.html")):
                return s.not_found()
        elif not os.path.isfile(f):
            if os.path.isfile(f + ".html"):
                s.path = p + ".html"
            else:
                return s.not_found()
        return super().send_head()
    def not_found(s):
        body = open(os.path.join(ROOT, "404.html"), "rb").read()
        s.send_response(404); s.send_header("Content-Type", "text/html; charset=utf-8")
        s.send_header("Content-Length", str(len(body))); s.end_headers()
        import io; return io.BytesIO(body)
    def guess_type(s, path):
        if str(path).endswith(".xml"): return "application/xml; charset=utf-8"
        t = super().guess_type(path)
        return t + "; charset=utf-8" if t.startswith("text/") else t

if __name__ == "__main__":
    print(f"serving {ROOT} on http://127.0.0.1:{PORT}", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
