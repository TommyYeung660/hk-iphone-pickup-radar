const CHECKOUT_URL = "https://secure.store.apple.com/hk-zh/shop/checkout?_s=Fulfillment-init";
const defaults = [
  { sku: "MJY14ZA/A", label: "冰川色", color: "glacier", available_count: 0, stores: [] },
  { sku: "MJY04ZA/A", label: "布根地红色", color: "burgundy", available_count: 0, stores: [] },
];

let monitoring = localStorage.getItem("hk-stock:monitoring") === "true";
let intervalSeconds = Number(localStorage.getItem("hk-stock:interval")) || 60;
let timer = null;
let ticker = null;
let nextRead = null;
let previousAvailable = new Set();
let firstResult = true;

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

function formatTime(value) {
  if (!value) return "尚未检查";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

function statusLabel(store) {
  if (store.available) return "可以取货";
  if (store.status === "unavailable") return "暂时无货";
  return "状态未知";
}

function renderTargets(targets) {
  $("targets").innerHTML = targets.map((target) => {
    const stores = target.stores?.length ? target.stores.map((store) => `
      <div class="store-row ${store.available ? "available" : ""}">
        <div><strong>${escapeHtml(store.store_name)}</strong><span>${escapeHtml(store.quote || statusLabel(store))}</span></div>
        <em>${escapeHtml(statusLabel(store))}</em>
      </div>`).join("") : '<div class="store-placeholder">开启监控后，将显示香港全部 6 家 Apple Store。</div>';
    return `<article class="target-card ${target.available_count ? "available" : ""}">
      <div class="phone-swatch ${escapeHtml(target.color)}"><i></i><i></i><i></i></div>
      <div class="target-copy"><div class="target-title"><div><h3>${escapeHtml(target.label)}</h3><p>iPhone 18 Pro Max · 1TB</p></div>
      <span class="stock ${target.available_count ? "yes" : ""}">${target.available_count ? `${target.available_count} 店有货` : "暂无可取货"}</span></div>
      <p class="sku">Apple 商品编号 ${escapeHtml(target.sku)}</p><div class="stores">${stores}</div>
      ${target.available_count ? `<a class="checkout" href="${CHECKOUT_URL}" target="_blank" rel="noreferrer">打开 Apple 结账</a>` : ""}</div></article>`;
  }).join("");
}

function showError(message) {
  $("error").classList.remove("hidden");
  $("error").querySelector("p").textContent = message;
}

function clearError() { $("error").classList.add("hidden"); }

function notifyAvailable(items) {
  if (!items.length || firstResult) return;
  if (navigator.vibrate) navigator.vibrate([220, 100, 420]);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("香港 Apple Store 有货", { body: items.join("、") });
  }
}

async function readStock() {
  $("refresh").disabled = true;
  $("refresh").textContent = "读取中…";
  try {
    const response = await fetch(`stock.json?t=${Date.now()}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "云端库存检查暂时不可用");
    clearError();
    const current = new Set();
    const newItems = [];
    for (const target of data.targets || []) for (const store of target.stores || []) if (store.available) {
      const key = `${target.sku}:${store.store_number}`;
      current.add(key);
      if (!previousAvailable.has(key)) newItems.push(`${target.label} · ${store.store_name}`);
    }
    notifyAvailable(newItems);
    previousAvailable = current;
    firstResult = false;
    const total = (data.targets || []).reduce((sum, target) => sum + Number(target.available_count || 0), 0);
    $("result-title").textContent = total ? `${total} 个有货结果` : "等待库存出现";
    $("refresh").textContent = `立即读取 · 云端 ${formatTime(data.checked_at)}`;
    renderTargets(data.targets?.length ? data.targets : defaults);
  } catch (error) {
    showError(error instanceof Error ? error.message : "库存读取失败");
    $("refresh").textContent = "立即读取 · 失败";
  } finally {
    $("refresh").disabled = false;
    nextRead = Date.now() + intervalSeconds * 1000;
  }
}

function updateCountdown() {
  if (!monitoring || !nextRead) return;
  const seconds = Math.max(0, Math.ceil((nextRead - Date.now()) / 1000));
  $("monitor-subtitle").textContent = `页面每 ${intervalSeconds} 秒读取 · ${seconds} 秒后再读（云端约 5 分钟更新）`;
}

function applyMonitoring() {
  $("monitor-card").classList.toggle("is-on", monitoring);
  $("monitor-title").textContent = monitoring ? "监控运行中" : "监控已暂停";
  $("toggle").setAttribute("aria-checked", String(monitoring));
  $("toggle").querySelector("b").textContent = monitoring ? "停止" : "开始";
  clearInterval(timer); clearInterval(ticker);
  if (monitoring) {
    readStock();
    timer = setInterval(readStock, intervalSeconds * 1000);
    ticker = setInterval(updateCountdown, 1000);
  } else {
    $("monitor-subtitle").textContent = "开启后会读取最新云端结果";
  }
  localStorage.setItem("hk-stock:monitoring", String(monitoring));
}

$("toggle").addEventListener("click", () => { monitoring = !monitoring; applyMonitoring(); });
$("refresh").addEventListener("click", readStock);
$("retry").addEventListener("click", readStock);
$("notify").addEventListener("click", async () => {
  if (!("Notification" in window)) return showError("当前浏览器不支持网页通知，请保持页面打开查看。");
  const permission = await Notification.requestPermission();
  $("notify").textContent = permission === "granted" ? "✓ 通知已开启" : "通知未开启";
});
document.querySelectorAll("[data-seconds]").forEach((button) => button.addEventListener("click", () => {
  intervalSeconds = Number(button.dataset.seconds);
  localStorage.setItem("hk-stock:interval", String(intervalSeconds));
  document.querySelectorAll("[data-seconds]").forEach((item) => item.classList.toggle("active", item === button));
  applyMonitoring();
}));

document.querySelectorAll("[data-seconds]").forEach((button) => button.classList.toggle("active", Number(button.dataset.seconds) === intervalSeconds));
renderTargets(defaults);
applyMonitoring();
