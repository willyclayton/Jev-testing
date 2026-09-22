"""Serve this folder and report whether a TypeSafe key is present.

The page itself does not call Jev. The API response does not include
Access-Control-Allow-Origin, so a static host cannot call it from the browser.
The key, when you have one, stays in this process and out of the page.

    python3 server.py
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[fourth-down] {fmt % args}")

    def _send(self, status, body, content_type):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send(200, {"ok": True, "key_configured": bool(os.environ.get("TYPESAFE_API_KEY", "").strip())}, "application/json")
            return
        if path == "/favicon.ico":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        relative = "index.html" if path in ("/", "") else path.lstrip("/")
        file_path = (ROOT / relative).resolve()
        if not file_path.is_relative_to(ROOT) or not file_path.is_file():
            self._send(404, {"error": "not found"}, "application/json")
            return
        kind = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }.get(file_path.suffix, "application/octet-stream")
        self._send(200, file_path.read_bytes(), kind)


if __name__ == "__main__":
    print(f"http://127.0.0.1:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
