from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

VENDOR = Path(__file__).resolve().parent / "vendor"
sys.path.insert(0, str(VENDOR))

from apple_store_stock.core import AppleStockClient  # noqa: E402


TARGETS = (
    {"sku": "MJY14ZA/A", "label": "冰川色", "color": "glacier"},
    {"sku": "MJY04ZA/A", "label": "布根地红色", "color": "burgundy"},
)


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "site/stock.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    channel = os.getenv("APPLE_BROWSER_CHANNEL", "").strip() or None
    client = AppleStockClient(chrome_channel=channel)
    checked_at = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        results = client.query_skus(tuple(target["sku"] for target in TARGETS))
        payload = {
            "ok": True,
            "checked_at": checked_at,
            "targets": [
                {**result, **target}
                for target, result in zip(TARGETS, results, strict=True)
            ],
        }
    except Exception as exc:
        payload = {
            "ok": False,
            "checked_at": checked_at,
            "message": f"本次云端库存检查失败：{exc}",
            "targets": [],
        }
    finally:
        client.close()
    output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps({
        "ok": payload["ok"],
        "checked_at": checked_at,
        "available": sum(
            int(target.get("available_count", 0))
            for target in payload.get("targets", [])
        ),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
