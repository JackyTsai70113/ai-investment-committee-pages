import { escapeHtml } from "../formatters.js";

const statusLabels = {
  supported: "證據足夠",
  insufficient: "證據不足",
  constraint: "政策限制",
  unverified: "尚未驗證",
};

const actionLabels = {
  increase: "加碼",
  hold: "維持",
  reduce: "減碼",
  exit: "退出",
};

const text = (value, fallback = "未提供") => escapeHtml(value || fallback);

const statusLabel = (value) => statusLabels[value] || "狀態待確認";
const actionLabel = (value) => actionLabels[value] || "檢視";

function evidenceText(tradeoff) {
  const observations = (tradeoff.evidence_observations || []).filter(Boolean);
  if (!observations.length) return "本輪沒有可驗證的新證據；共識度不代表交易訊號。";
  return observations.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function detailBlock(label, value, { list = false } = {}) {
  const body = list ? `<ul>${value}</ul>` : `<p>${value}</p>`;
  return `<div class="decision-evidence-detail"><dt>${label}</dt><dd>${body}</dd></div>`;
}

function sourceLinks(tradeoff, recommendation) {
  const refs = new Set((tradeoff.evidence_refs || []).filter(Boolean));
  const urls = (recommendation?.top_reasons || [])
    .filter((reason) => (reason.evidence_refs || []).some((ref) => refs.has(ref)))
    .flatMap((reason) => reason.source_urls || [])
    .filter((url, index, values) => values.indexOf(url) === index)
    .filter((url) => {
      try { return new URL(url).protocol === "https:"; } catch { return false; }
    });
  if (!urls.length) return "未保存可點擊來源。";
  return `<ul>${urls.map((url) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">查看來源</a></li>`).join("")}</ul>`;
}

function comparisonText(current, previous) {
  if (!previous) return "上一輪沒有同一標的的可比較紀錄。";
  const currentStatus = statusLabel(current.evidence_status);
  const previousStatus = statusLabel(previous.evidence_status);
  return [
    `<p>上一輪：${escapeHtml(actionLabel(previous.decision))}，${escapeHtml(previousStatus)}。</p>`,
    `<p>本輪：${escapeHtml(actionLabel(current.decision))}，${escapeHtml(currentStatus)}。</p>`,
    detailBlock("上一輪維持的論點", text(previous.expected_return_driver)),
    detailBlock("本輪維持的論點", text(current.expected_return_driver)),
    detailBlock("上一輪反方證據", text(previous.downside)),
    detailBlock("本輪反方證據", text(current.downside)),
  ].join("");
}

export function renderDecisionEvidencePanel(recommendation, { renderSymbol } = {}) {
  const symbol = renderSymbol || ((value) => `<strong>${escapeHtml(value)}</strong>`);
  const tradeoffs = Array.isArray(recommendation?.active_sleeve_tradeoffs)
    ? recommendation.active_sleeve_tradeoffs
    : [];
  const supported = tradeoffs.filter((item) => item.evidence_status === "supported").length;
  const score = Number.isFinite(Number(recommendation?.model_score))
    ? Number(recommendation.model_score)
    : null;
  const cards = tradeoffs.map((tradeoff) => `
    <article class="decision-evidence-card" data-decision-evidence-card data-symbol="${escapeHtml(tradeoff.symbol)}">
      <details>
        <summary>
          <span class="ticker-chip">${escapeHtml(tradeoff.symbol)}</span>
          <span>${escapeHtml(actionLabel(tradeoff.decision))}</span>
          <span class="evidence-status status-${escapeHtml(tradeoff.evidence_status || "unverified")}">${escapeHtml(statusLabel(tradeoff.evidence_status))}</span>
        </summary>
        <dl class="decision-evidence-details">
          ${detailBlock("新事實與採用證據", evidenceText(tradeoff), { list: true })}
          ${detailBlock("報價頁", symbol(tradeoff.symbol))}
          ${detailBlock("來源連結", sourceLinks(tradeoff, recommendation))}
          ${detailBlock("維持的論點", text(tradeoff.expected_return_driver))}
          ${detailBlock("反方證據", text(tradeoff.downside))}
          ${detailBlock("採用或排除原因", text(tradeoff.advantage_over_hold || tradeoff.cost_tradeoff))}
          ${detailBlock("下一檢視條件", text(tradeoff.invalidation))}
        </dl>
        <button type="button" class="decision-comparison-button" data-decision-compare>展開上一輪比較</button>
        <div class="decision-comparison" data-decision-comparison hidden aria-live="polite"></div>
      </details>
    </article>`).join("");
  const empty = "<p>本輪沒有逐檔證據摘要；資料不足時不把共識度解讀為交易訊號。</p>";
  return `<section class="panel decision-evidence" id="decision-evidence" data-tab-section="overview" aria-labelledby="decision-evidence-title">
    <header class="panel-header">
      <div><span class="section-kicker">逐檔決策證據</span><h2 id="decision-evidence-title">共識度、資料品質與不交易原因</h2></div>
      <span class="panel-meta">${supported}/${tradeoffs.length} 檔證據足夠</span>
    </header>
    <p class="decision-evidence-summary">本輪共識度 ${score === null ? "未知" : `${score}/100`}；逐檔證據覆蓋與政策限制分開顯示。證據不足時維持未知，不自行推導買賣方向。</p>
    <div class="decision-evidence-grid">${cards || empty}</div>
  </section>`;
}

export function installDecisionEvidence(root, recommendation, loadComparison) {
  const panel = root.querySelector("#decision-evidence");
  if (!panel) return;
  let comparisonPromise;
  panel.querySelectorAll("[data-decision-compare]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-decision-evidence-card]");
      const output = card?.querySelector("[data-decision-comparison]");
      const symbol = card?.dataset.symbol;
      if (!output || !symbol) return;
      output.hidden = false;
      button.disabled = true;
      button.textContent = "載入上一輪比較中…";
      try {
        comparisonPromise ||= loadComparison?.();
        const comparison = await comparisonPromise;
        if (!comparison || comparison.current_run_id !== recommendation?.run_id) {
          throw new Error("比較資料與本輪決策版本不一致");
        }
        const current = (recommendation.active_sleeve_tradeoffs || []).find((item) => item.symbol === symbol);
        const previous = (comparison.previous_tradeoffs || []).find((item) => item.symbol === symbol);
        output.innerHTML = `<div class="decision-comparison-copy"><p>比較版本：${text(comparison.previous_run_id, "沒有上一輪")}</p>${comparisonText(current || {}, previous)}</div>`;
        button.textContent = "已載入上一輪比較";
      } catch (error) {
        output.innerHTML = `<p role="alert">${escapeHtml(error.message || "比較資料無法取得")}</p>`;
        button.textContent = "上一輪比較無法取得";
      }
    });
  });
}
