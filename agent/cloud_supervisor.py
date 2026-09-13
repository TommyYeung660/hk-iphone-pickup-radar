from __future__ import annotations

import signal
import subprocess
import sys
from pathlib import Path

import gateway


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    children = [
        subprocess.Popen([sys.executable, str(ROOT / "agent" / "server.py")], cwd=ROOT),
        subprocess.Popen(
            [
                "node",
                str(ROOT / "node_modules" / "vinext" / "dist" / "cli.js"),
                "start",
                "--port",
                "3001",
                "--hostname",
                "127.0.0.1",
            ],
            cwd=ROOT,
        ),
    ]

    def stop_children(*_: object) -> None:
        for child in children:
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop_children)
    try:
        gateway.main()
    finally:
        stop_children()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()


if __name__ == "__main__":
    main()
