const AGENT_BASE = process.env.STOCK_AGENT_URL || "http://127.0.0.1:8765";

export async function GET() {
  try {
    const response = await fetch(`${AGENT_BASE}/api/status`, {
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const result = await response.json() as Record<string, unknown>;
    return Response.json(result, {
      status: response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : "未知错误";
    return Response.json({
      ok: false,
      code: "AGENT_OFFLINE",
      message: "电脑端库存服务尚未启动。启动后，这个页面就会自动读取香港 Apple Store 实时库存。",
      detail,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function POST() {
  try {
    const response = await fetch(`${AGENT_BASE}/api/refresh`, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const result = await response.json();
    return Response.json(result, { status: response.status });
  } catch {
    return Response.json({ ok: false, message: "电脑端库存服务尚未启动。" }, { status: 503 });
  }
}
