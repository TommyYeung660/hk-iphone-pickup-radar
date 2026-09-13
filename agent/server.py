from __future__ import annotations

import json
import os
import signal
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

VENDOR = Path(__file__).resolve().parent / "vendor"
sys.path.insert(0, str(VENDOR))

from apple_store_stock.core import AppleStockClient, StockError  # noqa: E402

HOST = "127.0.0.1"
PORT = 8765
INTERVAL_SECONDS = max(30, int(os.getenv("STOCK_INTERVAL_SECONDS", "60")))
TARGETS = (
    {"sku": "MJY14ZA/A", "label": "冰川色", "color": "glacier"},
    {"sku": "MJY04ZA/A", "label": "布根地红色", "color": "burgundy"},
)


class Monitor:
    def __init__(self) -> None:
        self.client = AppleStockClient(
            chrome_channel=os.getenv("APPLE_BROWSER_CHANNEL", "msedge").strip() or None
        )
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.payload: dict[str, Any] | None = None
        self.error: str | None = None
        self.checking = False

    def snapshot(self) -> tuple[dict[str, Any] | None, str | None, bool]:
        with self.lock:
            return self.payload, self.error, self.checking

    def request_refresh(self) -> None:
        self.wake.set()

    def run(self) -> None:
        while not self.stop.is_set():
            with self.lock:
                self.checking = True
                self.error = None
            try:
                results = self.client.query_skus(tuple(item["sku"] for item in TARGETS))
                targets = [
                    {**result, **target}
                    for target, result in zip(TARGETS, results, strict=True)
                ]
                payload = {
                    "ok": True,
                    "checked_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "targets": targets,
                }
                with self.lock:
                    self.payload = payload
                    self.error = None
            except StockError as exc:
                with self.lock:
                    self.error = str(exc)
            except Exception as exc:
                with self.lock:
                    self.error = f"库存检查异常：{exc}"
            finally:
                with self.lock:
                    self.checking = False
            self.wake.wait(INTERVAL_SECONDS)
            self.wake.clear()
        self.client.close()


monitor = Monitor()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path not in ("/api/status", "/health"):
            self.send_json(404, {"ok": False, "message": "Not found"})
            return
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return
        payload, error, checking = monitor.snapshot()
        if payload is not None:
            self.send_json(200, {**payload, "checking": checking, "last_error": error})
        elif error:
            self.send_json(503, {"ok": False, "checking": checking, "message": error})
        else:
            self.send_json(202, {
                "ok": False,
                "checking": True,
                "message": "首次连接 Apple 库存服务中，请稍候再试。",
            })

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/refresh":
            self.send_json(404, {"ok": False, "message": "Not found"})
            return
        monitor.request_refresh()
        self.send_json(202, {"ok": True, "message": "已安排立即刷新"})

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}", flush=True)


def main() -> None:
    thread = threading.Thread(target=monitor.run, name="apple-stock-monitor", daemon=True)
    thread.start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)

    def stop_service(*_: object) -> None:
        monitor.stop.set()
        monitor.wake.set()
        server.shutdown()

    signal.signal(signal.SIGINT, stop_service)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop_service)
    print(f"香港 iPhone 库存服务已启动：http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        monitor.stop.set()
        monitor.wake.set()
        server.server_close()
        thread.join(timeout=10)


if __name__ == "__main__":
    main()
