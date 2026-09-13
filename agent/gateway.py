from __future__ import annotations

import http.client
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CLIENT = (ROOT / "dist" / "client").resolve()
UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = int(os.getenv("WEB_UPSTREAM_PORT", "3001"))
PUBLIC_PORT = int(os.getenv("PORT", "3000"))
HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


class GatewayHandler(BaseHTTPRequestHandler):
    def _serve_asset(self) -> bool:
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/assets/"):
            return False
        candidate = (CLIENT / path.removeprefix("/")).resolve()
        if CLIENT not in candidate.parents or not candidate.is_file():
            self.send_error(404)
            return True
        body = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
        return True

    def _proxy(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length else None
        headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP and key.lower() != "host"
        }
        headers["Host"] = f"{UPSTREAM_HOST}:{UPSTREAM_PORT}"
        connection = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=15)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            response = connection.getresponse()
            response_body = response.read()
            self.send_response(response.status, response.reason)
            for key, value in response.getheaders():
                if key.lower() not in HOP_BY_HOP and key.lower() != "content-length":
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(response_body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(response_body)
        except OSError as exc:
            message = f"网页服务尚未就绪：{exc}".encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(message)))
            self.end_headers()
            self.wfile.write(message)
        finally:
            connection.close()

    def do_GET(self) -> None:  # noqa: N802
        if not self._serve_asset():
            self._proxy()

    def do_HEAD(self) -> None:  # noqa: N802
        if not self._serve_asset():
            self._proxy()

    def do_POST(self) -> None:  # noqa: N802
        self._proxy()

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PUBLIC_PORT), GatewayHandler)
    except OSError as exc:
        raise SystemExit(f"无法启动手机网页入口：{exc}") from exc
    print(f"监控网页已启动：http://localhost:{PUBLIC_PORT}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
