import { escapeHtml, dateTime } from "../formatters.js";

const metrics = [
  ["treasury_nominal_3m", "美國3個月名目公債", "percent_per_annum", "nominal_par_bond_equivalent"],
  ["treasury_nominal_2y", "美國2年名目公債", "percent_per_annum", "nominal_par_bond_equivalent"],
  ["treasury_nominal_10y", "美國10年名目公債", "percent_per_annum", "nominal_par_bond_equivalent"],
  ["treasury_real_10y", "美國10年實質公債", "percent_per_annum", "real_par_tips"],
  ["fed_target_lower", "Fed政策目標下限", "percent_per_annum", "fed_target"],
  ["fed_target_upper", "Fed政策目標上限", "percent_per_annum", "fed_target"],
  ["cpi_all_items_mom", "CPI月增（季調）", "percent_change", "inflation_change"],
  ["cpi_all_items_yoy", "CPI年增（未季調）", "percent_change", "inflation_change"],
  ["cpi_core_mom", "核心CPI月增（季調）", "percent_change", "inflation_change"],
  ["cpi_core_yoy", "核心CPI年增（未季調）", "percent_change", "inflation_change"],
];
const allowedSymbols = new Set(["NVDA", "AVGO", "META", "PLTR", "GLD", "CASH"]);
const scenarios = { rates_inflation: "升息與通膨壓力", cuts_recession: "降息但衰退", rates_earnings_improvement: "利率上升但獲利改善" };
const instant = (value) => {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const valueDate = value.slice(0, 10);
  const day = new Date(`${valueDate}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== valueDate
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  return Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
};
const finiteValue = (value) => value !== null && value !== undefined && value !== ""
  && ["string", "number"].includes(typeof value) && Number.isFinite(Number(value));
const number = (value, suffix) => finiteValue(value) ? `${escapeHtml(Number(value).toFixed(2))} ${suffix}` : "未知";
const sourceLink = (url) => {
  try {
    const source = new URL(url);
    if (source.protocol !== "https:" || source.username || source.password || source.hash
      || !["", "443"].includes(source.port)) return "來源待確認";
    const query = [...source.searchParams.entries()];
    const treasury = source.hostname === "home.treasury.gov"
      && source.pathname === "/resource-center/data-chart-center/interest-rates/pages/xml"
      && query.length === 2 && query[0][0] === "data"
      && ["daily_treasury_yield_curve", "daily_treasury_real_yield_curve"].includes(query[0][1])
      && query[1][0] === "field_tdr_date_value" && /^(?:(?:19|20)\d{2}|2100)$/.test(query[1][1]);
    const cpi = source.hostname === "www.bls.gov" && !source.search
      && /^\/news\.release\/(cpi\.htm|archives\/cpi_\d{8}\.htm)$/.test(source.pathname);
    const fed = source.hostname === "www.federalreserve.gov" && !source.search
      && /^\/newsevents\/pressreleases\/monetary\d{8}a\.htm$/.test(source.pathname);
    if (!treasury && !cpi && !fed) return "來源待確認";
    return `<a href="${escapeHtml(source.href)}" target="_blank" rel="noopener noreferrer">官方來源</a>`;
  } catch { return "來源待確認"; }
};
const trustedObservation = (observation, spec, cutoff) => {
  const available = instant(observation?.available_at);
  const seen = instant(observation?.first_observed_at);
  const cpi = spec[0].startsWith("cpi_");
  const treasury = spec[0].startsWith("treasury_");
  return observation?.schema_version === "1.1" && observation.quality === "known"
    && observation.unit === spec[2] && observation.rate_basis === spec[3]
    && observation.validation_method === (treasury ? "official_series_cell_v1" : "official_release_sentence_v1")
    && finiteValue(observation.value) && sourceLink(observation.source_url).startsWith("<a ")
    && available !== null && seen !== null
    && available <= seen && seen <= cutoff && /^\d{4}-\d\d-\d\d$/.test(observation.effective_date || "")
    && instant(`${observation.effective_date}T00:00:00Z`) !== null
    && Date.parse(`${observation.effective_date}T00:00:00Z`) <= cutoff
    && Math.floor(cutoff / 86400000) - Math.floor(Date.parse(`${observation.effective_date}T00:00:00Z`) / 86400000)
      <= (cpi ? 62 : treasury ? 7 : 120)
    && (!cpi || (observation.observation_period_kind === "month"
      && observation.change_basis === (spec[0].endsWith("mom") ? "MoM" : "YoY")
      && observation.seasonal_adjustment === (spec[0].endsWith("mom") ? "seasonally_adjusted" : "not_seasonally_adjusted")));
};

export function renderMacroState(state, { asOf, renderSymbol = escapeHtml } = {}) {
  const cutoff = instant(asOf);
  const stateCutoff = instant(state?.data_cutoff);
  const validState = state?.schema_version === "1.0" && state?.mode === "shadow"
    && cutoff !== null && stateCutoff !== null && stateCutoff === cutoff;
  const observations = validState && Array.isArray(state.observations) ? state.observations : [];
  const known = new Map();
  const cards = metrics.map((spec) => {
    const candidates = observations.filter((item) => item.metric === spec[0]);
    const item = candidates.length === 1 && trustedObservation(candidates[0], spec, cutoff) ? candidates[0] : null;
    if (item) known.set(spec[0], item);
    return `<article class="position-risk-card macro-observation"><h3>${spec[1]}</h3>
      <p class="macro-value">${item ? number(item.value, spec[2] === "percent_per_annum" ? "% 年率" : "% 變化") : "未知"}</p>
      ${item ? `<p>觀測期間：${escapeHtml(item.period_label)}<br>有效日期：${escapeHtml(item.effective_date)}</p>
      <p>可用時間：${escapeHtml(dateTime(item.available_at))}<br>首次取得：${escapeHtml(dateTime(item.first_observed_at))}</p>
      <p>${sourceLink(item.source_url)}</p>` : "<p>來源缺失、過期或點時證明不足，不補零。</p>"}</article>`;
  }).join("");
  const nominal = known.get("treasury_nominal_10y");
  const real = known.get("treasury_real_10y");
  const two = known.get("treasury_nominal_2y");
  const aligned = nominal && real && nominal.effective_date === real.effective_date;
  const curveAligned = nominal && two && nominal.effective_date === two.effective_date;
  const validChange = nominal && finiteValue(state.nominal_10y_change_bps)
    && instant(`${state.nominal_10y_change_start_date}T00:00:00Z`) !== null
    && instant(`${state.nominal_10y_change_end_date}T00:00:00Z`) !== null
    && state.nominal_10y_change_start_date < state.nominal_10y_change_end_date
    && state.nominal_10y_change_end_date === nominal.effective_date;
  const comparisons = validState && Array.isArray(state.scenarios) ? state.scenarios : [];
  const scenarioCards = Object.entries(scenarios).map(([name, label]) => {
    const candidates = comparisons.filter((item) => item.scenario === name && item.mode === "shadow");
    const comparison = candidates.length === 1 ? candidates[0] : null;
    const effects = Object.entries(comparison?.active_asset_effects || {}).filter(([symbol]) => allowedSymbols.has(symbol));
    return `<details class="macro-scenario"><summary>${label}</summary>
      ${effects.length ? `<ul>${effects.map(([symbol, effect]) => `<li>${renderSymbol(symbol)}：${escapeHtml(effect)}</li>`).join("")}</ul>` : "<p>此版本缺少可驗證條件比較。</p>"}
      <p>影子條件分析，不宣稱已發生、預期報酬或自動買賣。</p></details>`;
  }).join("");
  return `<section class="panel" id="macro-state" data-tab-section="overview" aria-labelledby="macro-state-title">
    <header class="panel-header"><h2 id="macro-state-title">利率、通膨與條件情境</h2><span class="panel-meta">影子研究</span></header>
    <p>官方觀測與舊 ^TNX proxy 分開；不改正式交易規則。${validState ? "以本輪資料截止時間驗證可用版本。" : "此版本尚無相同截止時間的總體資料。"}</p>
    <div class="position-risk-cards macro-observations">${cards}</div>
    <dl class="macro-derived"><dt>10年−2年名目曲線</dt><dd>${curveAligned ? number(state.curve_10y_minus_2y_bps, "bps") : "未知"}</dd>
      <dt>10年名目殖利率絕對變動</dt><dd>${validChange ? number(state.nominal_10y_change_bps, "bps") : "未知"}${validChange ? `（${escapeHtml(state.nominal_10y_change_start_date)} 至 ${escapeHtml(state.nominal_10y_change_end_date)}）` : ""}</dd>
      <dt>10年近似通膨補償</dt><dd>${aligned ? number(state.breakeven_10y_percent, "%") : "未知"}</dd>
      <dt>信用條件</dt><dd>未知：尚無授權可靠信用利差來源。</dd></dl>
    <p>Treasury 是年化 par curve 參考，包含名目與 TIPS 實質口徑；不是 APY、可成交價格或券商現金收益。名目減實質包含流動性與風險溢酬，並非純預期通膨。CPI月增／年增不是年化利率。</p>
    <h3>可調整部位的三種條件比較</h3>${scenarioCards}
    <p>固定核心不產生交易建議；黃金並非必然避險，現金正式零息假設不變，缺值不構成硬性清倉理由。</p>
  </section>`;
}
