import { escapeHtml } from "../formatters.js";

const stateCopy = {
  confirmed: "已確認",
  not_announced: "尚未公告時間",
  unavailable: "暫時取不到資料",
  stale: "資料已過期，待更新",
};
const validTime = (value) => typeof value === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
const sourceLink = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">官方來源</a>`
      : "來源待確認";
  } catch { return "來源待確認"; }
};
const formatTime = (value, zone) => new Intl.DateTimeFormat("zh-TW", {
  timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value)).replace(/\s+/g, " ");
const eventName = (event) => {
  if (event.category === "earnings") return "公司財報公告";
  if (event.category === "fomc") return "美國利率決議";
  if (event.category === "nyse") return "美股休市或提早收盤";
  if (/Consumer Price Index/i.test(event.title)) return "美國消費者物價公告";
  if (/Producer Price Index/i.test(event.title)) return "美國生產者物價公告";
  if (/Employment Situation/i.test(event.title)) return "美國就業公告";
  return "官方重要事件";
};
const ticker = (symbol) => {
  const exchange = { NVDA: "NASDAQ", AVGO: "NASDAQ", META: "NASDAQ", PLTR: "NASDAQ", GLD: "NYSEARCA" }[symbol];
  if (symbol === "CASH") return `<strong>${escapeHtml(symbol)}</strong>`;
  return exchange ? `<a class="symbol-link" href="https://www.google.com/finance/quote/${encodeURIComponent(symbol)}:${exchange}" target="_blank" rel="noopener noreferrer">${escapeHtml(symbol)}</a>` : escapeHtml(symbol || "");
};

export function renderEventCalendar(calendar, { asOf, renderSymbol = ticker } = {}) {
  const symbol = (value) => `<span class="ticker-chip">${renderSymbol(value)}</span>`;
  const cutoff = validTime(asOf) ? Date.parse(asOf) : null;
  const events = (calendar?.events || []).filter((event) => validTime(event.starts_at)
    && validTime(event.source_as_of) && cutoff !== null
    && Date.parse(event.source_as_of) <= cutoff && Date.parse(event.starts_at) >= cutoff
    && ((event.category === "earnings" && event.authority === "primary_issuer")
      || (event.category !== "earnings" && event.authority === "official")))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, 6);
  const symbols = calendar?.coverage?.find((item) => item.category === "earnings")?.symbol_coverage || [];
  const cards = events.map((event) => `<article class="position-risk-card">
    <h3>${(event.affected_symbols || []).map(symbol).join(" ")} ${eventName(event)}</h3>
    <p>台北 ${escapeHtml(formatTime(event.starts_at, "Asia/Taipei"))}<br>
    美東 ${escapeHtml(formatTime(event.starts_at, "America/New_York"))}</p>
    <p>${sourceLink(event.source_url)}</p></article>`).join("");
  const states = symbols.map((item) => `<li>${symbol(item.symbol)} ${stateCopy[item.status] || "覆蓋待確認"}${item.cache_used ? "（保留上次確認資料）" : ""} · ${sourceLink(item.source_url)}
    ${validTime(item.data_cutoff) ? ` · 資料截止：台北 ${escapeHtml(formatTime(item.data_cutoff, "Asia/Taipei"))}` : ""}
    ${validTime(item.expires_at) ? ` · 有效至：台北 ${escapeHtml(formatTime(item.expires_at, "Asia/Taipei"))}` : ""}</li>`).join("");
  const gaps = (calendar?.coverage || []).some((item) => item.status !== "complete");
  return `<section class="panel" id="event-calendar" data-tab-section="overview" aria-labelledby="event-calendar-title">
    <header class="panel-header"><h2 id="event-calendar-title">下一個重要事件</h2></header>
    <p class="panel-meta">${gaps || !calendar ? "部分官方資料尚待確認。" : "官方事件已確認。"}資料缺口僅供提醒；已確認事件仍依原有風控時窗處理。</p>
    ${cards ? `<div class="position-risk-cards">${cards}</div>` : "<p>目前沒有可驗證的下一事件時間，不估造日期。</p>"}
    ${states ? `<h3>公司財報覆蓋</h3><ul>${states}</ul>` : "<p>此版本尚未提供逐公司覆蓋狀態。</p>"}
  </section>`;
}
