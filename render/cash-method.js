import { dateTime, escapeHtml } from "../formatters.js";

const hasNumber = (value) => (typeof value === "number" || typeof value === "string")
  && String(value).trim() !== "" && Number.isFinite(Number(value));
const percent = (value) => hasNumber(value) ? `${(Number(value) * 100).toFixed(4)}%` : "未知";
const modes = { non_interest: "無息現金假設", specified_simulated_yield: "指定模擬收益率", treasury_reference: "短期國債影子參考" };
const source = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">利率參考來源</a>` : "假設引用已記錄";
  } catch { return "尚無可點擊的利率來源"; }
};

export function renderCashMethod(performance = {}) {
  const points = Array.isArray(performance?.cash_carry_points) ? performance.cash_carry_points : [];
  const latest = points.filter((point) => ["1.0", "2.0"].includes(point.version) && point.mode === "shadow"
    && typeof point.as_of === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(point.as_of)
    && Number.isFinite(Date.parse(point.as_of)))
    .sort((left, right) => Date.parse(left.as_of) - Date.parse(right.as_of)).at(-1);
  const segments = Array.isArray(latest?.segments) ? latest.segments : [];
  const segment = segments.at(-1);
  const context = latest?.gold_context;
  const realRate = context?.version === "1.0" && context.mode === "shadow"
    && context.real_status === "known" && hasNumber(context.real_10y_percent_per_annum)
    ? `${Number(context.real_10y_percent_per_annum).toFixed(4)}%` : "未知";
  return `<section class="panel" id="cash-method" aria-label="現金收益與黃金比較方法">
    <h3>現金收益與黃金比較方法</h3>
    <p>正式模擬現金採明示零息假設；既有績效不重寫。短期國債收益僅供影子機會成本比較，不代表券商實得利率，也不把現金換成國債或基金。</p>
    ${latest ? `<p>${escapeHtml(modes[latest.parallel_mode] || "待確認模擬方法")} · 研究版本 ${escapeHtml(latest.version)}<br>
      評價時間 ${escapeHtml(dateTime(latest.as_of))}</p>
      <p>本期現金參考假設收益比例 ${percent(latest.cash_return_fraction)}；名義權重參考貢獻 ${percent(latest.cash_contribution_fraction)}。持倉實際應計相對期初標準化組合的貢獻 ${percent(latest.cash_accrual_contribution_fraction)}。</p>
      <p>${latest.version === "2.0" && latest.accrual_state ? "評價只標記尚未再投資的應計利息，跨UTC日才計入本金；同日多次評價不提前複利。權重或價格路徑改變會另記錄影子持倉假設。" : "舊版估算未保存跨評價應計狀態；新方法另建起點，不猜重建或銜接原收益。"}</p>
      ${latest.accrual_state?.holding_path_notes?.length ? `<p>${latest.accrual_state.holding_path_notes.map(escapeHtml).join("；")}</p>` : ""}
      <p>新方法影子全組合報酬率：${hasNumber(latest.shadow_return_percent) ? `${Number(latest.shadow_return_percent).toFixed(4)}%` : "未知"}。以新方法指數100起算，不能拼接為原歷史績效。</p>
      <p>本期末年利率 ${segment?.status === "measured" ? percent(segment.annual_rate_fraction) : "無可靠來源利率，保留毛收益零息假設"}；明示年費 ${percent(segment?.annual_fee_fraction)}，有息、零息及資料缺口區間皆扣已知年費。日數慣例 ${segment?.day_count === "ACT/ACT" ? "按各年實際日數" : "按365日換算"}，逐日再投資。這些是模型假設，${escapeHtml(latest.max_observation_age_days ?? "未提供")}日新鮮度假設並非國債發行規定。</p>
      ${latest.gap_reasons?.length ? `<p>資料缺口：${latest.gap_reasons.map(escapeHtml).join("；")}</p>` : ""}
      <p>${escapeHtml(latest.product_assumption)}<br>${segment?.source_url ? source(segment.source_url) : "未取得合格利率來源時不暗補收益。"}</p>`
      : "<p>此版本尚無平行收益序列；未提供可靠利率，不暗補利息或倒灌歷史。</p>"}
    <p>同一資料截止的10年期實質利率參考：${realRate}。名目短率與實質長率各別列示，不跨期間相減。</p>
    <p>黃金沒有票息。<a class="symbol-link" href="https://www.google.com/finance/quote/GLD:NYSEARCA" target="_blank" rel="noopener noreferrer">GLD</a>與現金的比較需連同實質利率、能源、美元及流動性情境；實質利率資料不足時保留未知，不能宣稱黃金必然避險或預測報酬。</p>
  </section>`;
}
