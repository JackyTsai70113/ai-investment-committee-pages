import { dateTime, escapeHtml } from "../formatters.js";

const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const validTime = (value) => typeof value === "string" && value.length <= 40 && Number(value.slice(11, 13)) <= 23 && Number(value.slice(14, 16)) <= 59 && Number(value.slice(17, 19)) <= 59 && validDate(value.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

function calendarUpdates(calendar, now) {
  if (calendar?.schema_version !== "1.0" || calendar.timezone !== "UTC" || calendar.hour !== 10 || calendar.minute !== 17 || calendar.grace_minutes !== 180 ||
      !validDate(calendar.valid_from) || !validDate(calendar.valid_until) || !Array.isArray(calendar.expected_updates) || !calendar.expected_updates.length || calendar.expected_updates.length > 366) return null;
  const start = Date.parse(`${calendar.valid_from}T00:00:00Z`);
  const end = Date.parse(`${calendar.valid_until}T23:59:59Z`);
  if (start > end || end - start > 366 * 86400000 || now < start || now > end) return null;
  const updates = calendar.expected_updates.map(validTime);
  if (updates.some((value, index) => {
    if (value === null || value < start || value > end || (index > 0 && value <= updates[index - 1])) return true;
    const date = new Date(value);
    return date.getUTCHours() !== 10 || date.getUTCMinutes() !== 17 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0 || date.getUTCDay() === 0 || date.getUTCDay() === 6;
  })) return null;
  return updates;
}

export function freshnessState(recommendation, calendar, signal, now = Date.now()) {
  const cutoff = validTime(recommendation?.data_cutoff);
  const generated = validTime(recommendation?.generated_at);
  const age = cutoff === null || cutoff > now + 300000 ? null : Math.max(0, Math.floor((now - cutoff) / 3600000));
  const updates = calendarUpdates(calendar, now);
  const knownCalendar = updates !== null;
  const expected = knownCalendar ? (updates.filter((value) => value + 180 * 60000 <= now).at(-1) ?? null) : null;
  const missed = expected != null && cutoff !== null && generated !== null && Math.min(cutoff, generated) < expected;
  const observed = validTime(signal?.observed_at);
  const attempt = validTime(signal?.research?.attempted_at);
  const successCutoff = validTime(signal?.last_successful_research?.data_cutoff);
  const successGenerated = validTime(signal?.last_successful_research?.generated_at);
  const publicationAt = validTime(signal?.publication?.attempted_at);
  const trusted = signal?.schema_version === "1.0" && observed !== null && observed <= now + 300000 && now - observed <= 86400000 &&
    ["success", "failure", "unknown"].includes(signal.research?.status) &&
    ["verified", "failed", "unknown"].includes(signal.publication?.status) &&
    attempt !== null && attempt <= observed && successCutoff !== null && successGenerated !== null &&
    successCutoff <= successGenerated && successGenerated <= observed &&
    (signal.publication.status === "unknown" ? (publicationAt === null || publicationAt <= observed) : publicationAt !== null && publicationAt <= observed);
  const newer = trusted && cutoff !== null && validTime(signal.last_successful_research?.data_cutoff) > cutoff && signal.last_successful_research?.run_id !== recommendation.run_id;
  let title = "最新執行狀態未知";
  let detail = "最新健康或更新時程的證據不足；不把網站仍能開啟視為研究與發布成功。";
  let state = "unknown";
  if (trusted && signal.research.status === "failure") {
    state = "research_failed"; title = "最新研究失敗，沿用先前成功建議";
    detail = "本頁的研究時間與資料截止沒有改成失敗時間；請依既有建議的資料年齡評估限制。";
  } else if (trusted && signal.publication.status === "failed") {
    state = "publication_failed"; title = "研究與發布狀態不同：最新網站發布失敗";
    detail = "研究結果可能已完成，但本頁尚未證實更新至最新一輪；請核對最後成功研究與資料截止。";
  } else if (newer) {
    state = "stale"; title = "已有較新研究，本頁仍是先前建議";
    detail = "最新健康訊號不代表本頁的建議已更新；請重新整理頁面後再核對時間。";
  } else if (missed) {
    state = "stale"; title = "已錯過預期更新，本頁可能過期";
    detail = "依交易日與每日排程計算，已超過更新寬限；尚無本頁更新至新資料的證據。";
  } else if (trusted && knownCalendar && expected !== null && signal.research.status === "success" && signal.publication.status === "verified" &&
             signal.publication.recommendation_run_id === recommendation.run_id && cutoff !== null && generated !== null && cutoff <= now + 300000 && generated <= now + 300000) {
    state = "current"; title = "最後已知研究與發布成功，尚未錯過預期更新";
    detail = "排程依美股交易日與休市日判斷；此狀態只表示研究與網站資料，不代表交易已執行。";
  }
  if (knownCalendar && expected === null) detail += " 有效日曆尚無已到更新寬限的排程，無法確認是否正常。";
  if (!knownCalendar) detail += " 缺少有效交易日曆，無法判定是否錯過預期更新。";
  if (!trusted && missed) detail += " 最新研究與發布健康訊號仍未知。";
  return { state, title, detail, age, expected, trusted };
}

const researchFailureCopy = {
  none: "無",
  credential_missing: "研究服務憑證未設定",
  provider_unavailable: "研究服務暫時無法使用",
  provider_rate_limited: "研究服務請求受到限制",
  provider_rpm_limit: "研究服務每分鐘請求額度已滿",
  provider_tpm_limit: "研究服務處理額度已滿",
  provider_daily_quota: "研究服務每日額度已滿",
  provider_plan_or_billing_quota: "研究服務方案或帳務額度不足",
  provider_model_capacity: "研究模型暫時沒有可用容量",
  provider_auth: "研究服務驗證失敗",
  provider_invalid_request: "研究服務拒絕本輪請求",
  provider_invalid_response: "研究服務回應格式無法採用",
  artifact_validation: "本輪資料驗證未通過",
  committee_error: "研究流程發生未分類錯誤",
  candidate_domain: "候選配置不符合資料或配置規則",
  candidate_validation: "候選配置驗證未通過",
  repair_timeout: "候選配置修復逾時",
  repair_provider: "候選配置修復服務失敗",
  repair_validation: "候選配置修復結果未通過驗證",
  repair_budget: "候選配置修復額度不足",
  research_extensions: "研究延伸資料的完整性檢查未通過",
};

function runLink(url, label) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.host !== "github.com" || parsed.search || parsed.hash || !/^\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(parsed.pathname)) return "";
    return `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${label}（可能需權限）</a>`;
  } catch { return ""; }
}

export function renderFreshness(recommendation, calendar, signal, now = Date.now()) {
  const result = freshnessState(recommendation, calendar, signal, now);
  const researchCopy = result.trusted ? {success: "成功", failure: "失敗", unknown: "未知"}[signal.research.status] : "未知";
  const failureCopy = result.trusted && signal.research.status === "failure"
    ? researchFailureCopy[signal.research.failure_kind] || "失敗原因尚未分類"
    : null;
  const publicationCopy = result.trusted ? {verified: "已核對發布", failed: "失敗", unknown: "未知"}[signal.publication.status] : "未知";
  const age = result.age === null ? "未知" : result.age < 1 ? "不到 1 小時" : result.age < 24 ? `${result.age} 小時` : `${Math.floor(result.age / 24)} 天 ${result.age % 24} 小時`;
  return `<div class="freshness-copy" role="status" aria-live="polite" aria-atomic="true">
    <h2>${escapeHtml(result.title)}</h2><p>${escapeHtml(result.detail)}</p>
    <dl><div><dt>本頁最後成功研究</dt><dd>${escapeHtml(dateTime(recommendation.generated_at))}</dd></div>
    <div><dt>本頁資料截至</dt><dd>${escapeHtml(dateTime(recommendation.data_cutoff))}</dd></div>
    <div><dt>資料年齡</dt><dd>${escapeHtml(age)}</dd></div>
    <div><dt>最新研究狀態</dt><dd>${researchCopy}${result.trusted ? `<br>${escapeHtml(dateTime(signal.research.attempted_at))}` : ""}</dd></div><div><dt>最新發布狀態</dt><dd>${publicationCopy}${result.trusted && signal.publication.attempted_at ? `<br>${escapeHtml(dateTime(signal.publication.attempted_at))}` : ""}</dd></div></dl>
    ${failureCopy ? `<p class="freshness-limits"><strong>已知原因：</strong>${escapeHtml(failureCopy)}</p>` : ""}
    <p class="freshness-limits">${result.trusted ? `健康訊號觀測於 ${escapeHtml(dateTime(signal.observed_at))}。` : "最新健康訊號未知。"}每日排程為世界標準時間 10:17，交易日寬限 3 小時；日曆有效至 ${escapeHtml(calendar?.valid_until || "未知")}。時間判斷依裝置時鐘，僅提示可能過期。</p>
    <div class="freshness-links">${result.trusted ? runLink(signal.research.run_url, "研究執行紀錄") + runLink(signal.publication.run_url, "網站發布紀錄") : ""}</div>
    </div><button type="button" data-refresh-health>重新檢查狀態</button>`;
}

export function installFreshness(root, recommendation, calendar, initialSignal, loadSignal) {
  const banner = root.querySelector("#freshness-banner");
  let signal = initialSignal;
  let previous = "";
  const paint = () => {
    const html = renderFreshness(recommendation, calendar, signal);
    if (html === previous) return;
    const button = banner.querySelector("[data-refresh-health]");
    const focused = banner.contains(document.activeElement);
    const href = document.activeElement?.getAttribute("href");
    banner.innerHTML = html;
    if (button) banner.querySelector("[data-refresh-health]").replaceWith(button);
    if (focused) {
      const link = [...banner.querySelectorAll("a")].find((item) => item.getAttribute("href") === href);
      (link || banner.querySelector("[data-refresh-health]")).focus();
    }
    previous = html;
  };
  paint();
  banner.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-refresh-health]");
    if (!button) return;
    button.disabled = true;
    signal = await loadSignal();
    button.disabled = false;
    paint();
    banner.querySelector("[data-refresh-health]").focus();
  });
  if (root.freshnessTimer) clearInterval(root.freshnessTimer);
  root.freshnessTimer = setInterval(paint, 60000);
}
