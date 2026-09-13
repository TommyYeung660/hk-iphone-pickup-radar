"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Store = {
  store_number: string;
  store_name: string;
  status: string;
  available: boolean;
  quote?: string;
  address?: string;
  distance?: string;
};

type TargetResult = {
  sku: string;
  label: string;
  color: "burgundy" | "glacier";
  checked_at?: string;
  available_count: number;
  stores: Store[];
};

type StockPayload = {
  ok: boolean;
  checked_at?: string;
  targets?: TargetResult[];
  code?: string;
  message?: string;
};

const CHECKOUT_URL =
  "https://secure.store.apple.com/hk-zh/shop/checkout?_s=Fulfillment-init";
const PRODUCT_URL = "https://www.apple.com/hk-zh/shop/buy-iphone/iphone-18-pro";
const INTERVALS = [30, 60, 120];

function shortTime(value?: string) {
  if (!value) return "尚未检查";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusLabel(store: Store) {
  if (store.available) return "可以取货";
  if (store.status === "unavailable") return "暂时无货";
  return "状态未知";
}

export default function Home() {
  const [monitoring, setMonitoring] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(60);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<StockPayload | null>(null);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [nextCheck, setNextCheck] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const previousAvailable = useRef<Set<string>>(new Set());
  const checkingRef = useRef(false);

  const notify = useCallback((newlyAvailable: string[]) => {
    if (!newlyAvailable.length) return;
    if ("vibrate" in navigator) navigator.vibrate([220, 100, 420]);
    try {
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.65);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.7);
    } catch {
      // Sound is an enhancement; the visible alert still works.
    }
    if (notifications && "Notification" in window && Notification.permission === "granted") {
      new Notification("香港 Apple Store 有货", { body: newlyAvailable.join("、") });
    }
  }, [notifications]);

  const checkStock = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/stock", { cache: "no-store" });
      const data = (await response.json()) as StockPayload;
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "库存查询暂时不可用");
      }
      setPayload(data);
      const current = new Set<string>();
      const newItems: string[] = [];
      for (const target of data.targets || []) {
        for (const store of target.stores) {
          if (!store.available) continue;
          const key = `${target.sku}:${store.store_number}`;
          current.add(key);
          if (!previousAvailable.current.has(key)) {
            newItems.push(`${target.label} · ${store.store_name}`);
          }
        }
      }
      if (previousAvailable.current.size || current.size) notify(newItems);
      previousAvailable.current = current;
      setNextCheck(Date.now() + intervalSeconds * 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "库存查询失败");
      setNextCheck(Date.now() + intervalSeconds * 1000);
    } finally {
      checkingRef.current = false;
      setLoading(false);
    }
  }, [intervalSeconds, notify]);

  useEffect(() => {
    try {
      setMonitoring(localStorage.getItem("hk-stock:monitoring") === "true");
      const savedInterval = Number(localStorage.getItem("hk-stock:interval"));
      if (INTERVALS.includes(savedInterval)) setIntervalSeconds(savedInterval);
      setNotifications("Notification" in window && Notification.permission === "granted");
    } catch {
      // Local preferences are optional.
    }
  }, []);

  useEffect(() => {
    if (!monitoring) return;
    void checkStock();
    const timer = window.setInterval(() => void checkStock(), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [monitoring, intervalSeconds, checkStock]);

  useEffect(() => {
    if (!nextCheck || !monitoring) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [nextCheck, monitoring]);

  const availableTotal = useMemo(
    () => payload?.targets?.reduce((sum, target) => sum + target.available_count, 0) || 0,
    [payload],
  );

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("当前浏览器不支持网页通知；有货时仍会在页面内高亮并尝试震动。 ");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifications(permission === "granted");
    if (permission !== "granted") setError("通知没有开启。你仍可保持页面打开查看和接收页面内提醒。");
  }

  function toggleMonitoring() {
    const next = !monitoring;
    setMonitoring(next);
    localStorage.setItem("hk-stock:monitoring", String(next));
    if (!next) setNextCheck(null);
  }

  function changeInterval(value: number) {
    setIntervalSeconds(value);
    localStorage.setItem("hk-stock:interval", String(value));
    setNextCheck(Date.now() + value * 1000);
  }

  const secondsRemaining = nextCheck
    ? Math.max(0, Math.ceil((nextCheck - now) / 1000))
    : null;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">HK</span>
          <span>Pickup Radar</span>
        </div>
        <a className="apple-link" href={PRODUCT_URL} target="_blank" rel="noreferrer">
          Apple 香港官网 ↗
        </a>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> 香港零售店实时监控</div>
        <h1>等到你要的<br /><span>iPhone 18 Pro Max</span></h1>
        <p>只监控 1TB 冰川色与布根地红色。检测到任意香港 Apple Store 可以到店取货，就立即提醒你。</p>
      </section>

      <section className={`monitor-card ${monitoring ? "is-on" : ""}`}>
        <div>
          <div className="monitor-status">
            <span className="pulse" />
            <strong>{monitoring ? "监控运行中" : "监控已暂停"}</strong>
          </div>
          <p>{monitoring ? `每 ${intervalSeconds} 秒检查一次${secondsRemaining !== null ? ` · ${secondsRemaining} 秒后再查` : ""}` : "开启后会立即检查库存"}</p>
        </div>
        <button className="switch" role="switch" aria-checked={monitoring} onClick={toggleMonitoring}>
          <span />
          <b>{monitoring ? "停止" : "开始"}</b>
        </button>
      </section>

      <section className="toolbar" aria-label="监控设置">
        <div className="interval-control">
          <span>页面刷新频率</span>
          <div className="segments">
            {INTERVALS.map((value) => (
              <button key={value} className={value === intervalSeconds ? "active" : ""} onClick={() => changeInterval(value)}>
                {value < 60 ? `${value} 秒` : `${value / 60} 分钟`}
              </button>
            ))}
          </div>
        </div>
        <button className="notify-button" onClick={enableNotifications}>
          {notifications ? "✓ 通知已开启" : "开启有货通知"}
        </button>
      </section>

      {error && (
        <aside className="error-card" role="alert">
          <span>连接提示</span>
          <p>{error}</p>
          <button onClick={() => void checkStock()} disabled={loading}>{loading ? "连接中…" : "重新连接"}</button>
        </aside>
      )}

      <section className="results-head">
        <div>
          <span className="section-label">目标配置</span>
          <h2>{availableTotal ? `${availableTotal} 个有货结果` : "等待库存出现"}</h2>
        </div>
        <button className="refresh" onClick={() => void checkStock()} disabled={loading}>
          {loading ? "检查中…" : `立即检查 · ${shortTime(payload?.checked_at)}`}
        </button>
      </section>

      <section className="target-grid">
        {(payload?.targets || [
          { sku: "MJY14ZA/A", label: "冰川色", color: "glacier", available_count: 0, stores: [] },
          { sku: "MJY04ZA/A", label: "布根地红色", color: "burgundy", available_count: 0, stores: [] },
        ]).map((target) => (
          <article className={`target-card ${target.available_count ? "available" : ""}`} key={target.sku}>
            <div className={`phone-swatch ${target.color}`} aria-hidden="true"><i /><i /><i /></div>
            <div className="target-copy">
              <div className="target-title">
                <div><h3>{target.label}</h3><p>iPhone 18 Pro Max · 1TB</p></div>
                <span className={target.available_count ? "stock yes" : "stock"}>
                  {target.available_count ? `${target.available_count} 店有货` : "暂无可取货"}
                </span>
              </div>
              <p className="sku">Apple 商品编号 {target.sku}</p>
              <div className="stores">
                {target.stores.length ? target.stores.map((store) => (
                  <div className={`store-row ${store.available ? "available" : ""}`} key={`${target.sku}-${store.store_number}`}>
                    <div><strong>{store.store_name}</strong><span>{store.quote || statusLabel(store)}</span></div>
                    <em>{statusLabel(store)}</em>
                  </div>
                )) : <div className="store-placeholder">连接库存服务后，将显示香港全部 6 家 Apple Store。</div>}
              </div>
              {target.available_count > 0 && (
                <a className="checkout" href={CHECKOUT_URL} target="_blank" rel="noreferrer">打开 Apple 结账</a>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="order-note">
        <div className="number">01</div>
        <div><strong>先在 Apple 官方页准备好购物袋</strong><p>提前登录 Apple ID、加入目标机型并设置付款方式。有货提醒出现后，点“打开 Apple 结账”，由 Apple 再次确认门店库存并由你完成最终付款。</p></div>
        <a href={CHECKOUT_URL} target="_blank" rel="noreferrer">打开结账页</a>
      </section>

      <footer>
        <span>非 Apple 官方工具 · 不保存账户或付款资料</span>
        <span>库存以 Apple 结账页最终结果为准</span>
      </footer>
    </main>
  );
}
