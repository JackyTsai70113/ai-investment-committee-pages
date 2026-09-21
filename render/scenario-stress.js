import { escapeHtml } from "../formatters.js";

const percentage = (value) => value !== null && value !== undefined && value !== ""
  && Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : "未知";
const validPoint = (point) => point?.schema_version === "1.0"
  && point.mode === "shadow" && point.unit === "return_fraction";
const sourceLabel = (value) => {
  if (!value) return "尚未提供";
  if (value.startsWith("config/policy.json")) return "既有政策研究假設";
  if (value.startsWith("fixture:")) return "明示人工測試假設";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) {
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">研究假設來源</a>`;
    }
  } catch { /* 非網址引用只呈現短標籤，完整追溯保留在資料契約。 */ }
  return "研究假設已有追溯紀錄";
};
const safeSymbol = (value) => `<span class="ticker-chip">${escapeHtml(value)}</span>`;

export function renderScenarioStress(recommendation, { renderSymbol = safeSymbol } = {}) {
  const plans = Array.isArray(recommendation?.position_risk_plans) ? recommendation.position_risk_plans : [];
  const totals = Array.isArray(recommendation?.scenario_stress) ? recommendation.scenario_stress : [];
  const bounds = plans.map((plan) => {
    const bound = plan.v1_loss_bound;
    const point = plan.v1_gap_stress;
    const base = bound?.schema_version === "1.0"
      ? bound.status === "quantified" ? percentage(bound.loss_fraction)
        : bound.status === "exempt" ? "價格曝險免估算" : "未知"
      : "此版本尚未提供分離評估";
    const stress = validPoint(point) && point.status === "measured"
      ? `假設衝擊 ${percentage(point.shock_return_fraction)}；組合損失貢獻 ${percentage(point.loss_contribution_fraction)}`
      : validPoint(point) && point.status === "exempt" ? "價格衝擊免估算；不代表現金收益為零" : "未知，不能補零";
    return `<article class="position-risk-card"><h3>${renderSymbol(plan.symbol)}</h3>
      <p>價格失效界線的基本損失：${base}</p>
      <p>外生跳空壓力：${stress}</p>
      <p>${escapeHtml(bound?.reason || "缺少分離契約，舊值不能視為已量測的零風險。")}</p>
      ${validPoint(point) ? `<p>${escapeHtml(point.assumption_label)}<br>${escapeHtml(point.reason)}<br>研究假設引用：${sourceLabel(point.source_ref)}</p>` : ""}
    </article>`;
  }).join("");
  const cards = totals.map((scenario) => {
    const qualified = scenario?.schema_version === "1.0" && scenario.mode === "shadow"
      && scenario.unit === "portfolio_loss_fraction";
    const complete = qualified && scenario.status === "complete" && scenario.weights_valid
      && !(scenario.unknown_symbols || []).length && percentage(scenario.total_loss_fraction) !== "未知";
    const unknown = (scenario.unknown_symbols || []).map(renderSymbol).join("、");
    return `<article class="position-risk-card"><h3>${escapeHtml(scenario.title || "待確認研究情境")}</h3>
      <p>版本 ${escapeHtml(scenario.version || "未知")} · 影子研究</p>
      <p>全組合假設損失比例：${complete ? percentage(scenario.total_loss_fraction) : "未知，不能以已知收益抵銷缺口"}</p>
      <p>已量測部分的損失貢獻：${qualified ? percentage(scenario.known_downside_fraction) : "未知"}<br>
      已量測部分的收益貢獻：${qualified ? percentage(scenario.known_upside_fraction) : "未知"}</p>
      ${unknown ? `<p>未知風險部位：${unknown}；未知權重 ${percentage(scenario.unknown_weight_fraction)}</p>` : ""}
      ${!scenario.weights_valid ? "<p>配置權重不完整或不合格，不能宣稱全組合總量。</p>" : ""}
      <p>${escapeHtml(scenario.assumption_label || "情境研究假設尚未提供")}</p>
      <p>研究假設引用：${(scenario.source_refs || []).length ? scenario.source_refs.map(sourceLabel).join("；") : "尚未提供"}</p>
    </article>`;
  }).join("");
  return `<section id="scenario-stress" class="panel" data-tab-section="overview" aria-label="模擬壓力情境">
    <header class="panel-header"><h2>模擬壓力情境</h2></header>
    <p class="panel-meta">價格失效界線與外生衝擊各自評估。壓力比例不受展示本金影響；這是研究假設，不是預期報酬、最大損失預測或停損成交保證。</p>
    ${bounds ? `<h3>失效界線與獨立跳空假設</h3><div class="position-risk-cards">${bounds}</div>` : "<p>此版本尚未提供分離風險評估，缺值保持未知。</p>"}
    ${cards ? `<h3>外生衝擊與未知風險</h3><div class="position-risk-cards">${cards}</div>` : "<p>此版本尚未提供情境聚合，不估造衝擊或總風險。</p>"}
  </section>`;
}
