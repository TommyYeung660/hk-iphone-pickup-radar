from __future__ import annotations

import json
import os
import random
import sys
import time
from datetime import datetime
from pathlib import Path

VENDOR = Path(__file__).resolve().parent / "vendor"
sys.path.insert(0, str(VENDOR))

from apple_store_stock.core import AppleStockClient  # noqa: E402


# 8 個候選：256GB/512GB/1TB/2TB × 布根地紅/冰川（iPhone 18 Pro Max, HK ZA/A）
TARGETS = (
    {"sku": "MJXQ4ZA/A", "label": "布根地紅色 256GB", "color": "burgundy"},
    {"sku": "MJXR4ZA/A", "label": "冰川色 256GB", "color": "glacier"},
    {"sku": "MJXV4ZA/A", "label": "布根地紅色 512GB", "color": "burgundy"},
    {"sku": "MJXW4ZA/A", "label": "冰川色 512GB", "color": "glacier"},
    {"sku": "MJY04ZA/A", "label": "布根地紅色 1TB", "color": "burgundy"},
    {"sku": "MJY14ZA/A", "label": "冰川色 1TB", "color": "glacier"},
    {"sku": "MJY44ZA/A", "label": "布根地紅色 2TB", "color": "burgundy"},
    {"sku": "MJY54ZA/A", "label": "冰川色 2TB", "color": "glacier"},
)

# Apple pickup-message 單次請求 >3 part 容易 541，與手機端 StockRepo 同一紅線
CHUNK = 3


def main() -> None:
    output = Path(sys.argv[1] if len(sys.argv) > 1 else "site/stock.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    channel = os.getenv("APPLE_BROWSER_CHANNEL", "").strip() or None
    client = AppleStockClient(chrome_channel=channel)
    checked_at = datetime.now().astimezone().isoformat(timespec="seconds")
    targets: list[dict] = []
    errors: list[str] = []
    try:
        for i in range(0, len(TARGETS), CHUNK):
            chunk = TARGETS[i : i + CHUNK]
            try:
                results = client.query_skus(
                    tuple(target["sku"] for target in chunk)
                )
                targets.extend(
                    {**result, **target}
                    for target, result in zip(chunk, results, strict=True)
                )
            except Exception as exc:  # 某批失敗不犧牲其他批
                errors.append(f"{chunk[0]['sku']}…批: {exc}")
            if i + CHUNK < len(TARGETS):
                time.sleep(random.uniform(2.5, 5.0))
    finally:
        client.close()
    if targets:
        payload = {
            "ok": True,
            "checked_at": checked_at,
            "targets": targets,
        }
        if errors:
            payload["message"] = "部分批次失敗：" + "；".join(errors)
    else:
        payload = {
            "ok": False,
            "checked_at": checked_at,
            "message": f"本次云端库存检查失败：{'；'.join(errors) or 'no results'}",
            "targets": [],
        }
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
        "targets": len(payload.get("targets", [])),
        "errors": len(errors),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
