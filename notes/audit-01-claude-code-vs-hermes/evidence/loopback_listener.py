"""Capture only the audit's fake exfiltration request on loopback."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

OUT = Path("~/projeler/denetim-01/listener-body.txt")


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        OUT.write_bytes(body)
        print(f"POST {self.path} bytes={len(body)}", flush=True)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


HTTPServer(("127.0.0.1", 18766), Handler).serve_forever()
