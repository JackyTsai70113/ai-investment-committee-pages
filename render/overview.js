import { installFreshness } from "./freshness.js";
import {
  assetTypeLabel,
  dateTime,
  escapeHtml,
  localizeRenderedText,
  money,
  percent,
} from "../formatters.js";
import { asList, createAgentProfileRenderers } from "./agent-profiles.js";
import { createGlossaryRenderer } from "./glossary.js";
import { installTabNavigation } from "./navigation.js";
import { createPerformanceRenderer } from "./performance.js";
import { installDecisionEvidence, renderDecisionEvidencePanel } from "./decision-evidence.js";
import { createDataLoader } from "../data.js";
import { renderEventCalendar } from "./event-calendar.js";
import { renderScenarioStress } from "./scenario-stress.js";
import { renderMacroState } from "./macro-state.js";

export function allocationScopeNote(recommendation) {
  return recommendation.allocation_scope
    ? "可調整部位：固定核心不納入本輪配置分母，也不產生交易建議。"
    : "本輪為未記錄可調整範圍的舊制建議，不代表現行可調整部位政策。";
}


const colors = ["#c7f15b", "#67b7ff", "#ae91ff", "#ff9864", "#7ecb83", "#f3f0d8"];
const LEADERBOARD_VISIBLE_LIMIT = 5;

function createOverviewModel({ dashboardAnalytics, committee, recommendation }) {
  const investedWeight = recommendation.allocations
    .filter((item) => item.symbol !== "CASH")
    .reduce((total, item) => total + Number(item.target_weight), 0);
  const cash = recommendation.allocations.find((item) => item.symbol === "CASH");
  const modelScore = Math.max(0, Math.min(100, Number(recommendation.model_score) || 0));
  const scoreBand =
    modelScore >= 80
      ? "高度共識"
      : modelScore >= 60
        ? "中度共識"
        : modelScore >= 40
          ? "明顯分歧"
          : "低共識／高不確定";
  let cursor = 0;
  const segments = recommendation.allocations.map((item, index) => {
    const start = cursor;
    cursor += Number(item.target_weight) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return {
    analyticsPerformance: dashboardAnalytics.performance,
    cash,
    committeeSize:
      (committee.summary_counts?.proposals ?? committee.proposals.length) +
      (committee.summary_counts?.critiques ?? committee.critiques.length),
    donut: `conic-gradient(${segments.join(",")})`,
    health: dashboardAnalytics.portfolio_health,
    investedWeight,
    isLive: recommendation.status === "live",
    modelScore,
    returnObjective: dashboardAnalytics.return_objective,
    scoreAngle: `${modelScore * 3.6}deg`,
    scoreBand,
    scoreReason:
      recommendation.model_score_reason ||
      "舊制資料沒有保存評分理由；不可用這個數字判斷配置好壞。",
  };
}

export function bootstrapDashboard(root, payload, base) {
  "use strict";

  const dataBase = base || ".";

  const { agentProfiles: loadedAgentProfiles, committeeRendererFactory } = payload;
  const agentProfiles = loadedAgentProfiles || {};
  const simulationCapitalExamples = [4000, 6000, 10000];
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const simulationCapital = (value) => {
    const parsed = toNumber(value);
    return parsed && parsed > 0 ? parsed : null;
  };
  const simulatedMoney = (fraction, capital) => {
    const parsed = toNumber(fraction);
    return parsed === null || capital === null ? "輸入本金後換算" : money(parsed * capital);
  };

  const findQuote = (market, symbol) =>
    (market.quotes || []).find((item) => item.symbol === symbol);

  const findFeature = (market, symbol) =>
    (market.features || []).find((item) => item.symbol === symbol);

  const classifyQuoteTrend = (changePercent) => {
    if (changePercent === null || changePercent === undefined) return "觀察中";
    const value = toNumber(changePercent);
    if (value === null) return "觀察中";
    if (value > 0.8) return "偏多";
    if (value < -0.8) return "偏空";
    return "盤整";
  };

  const regimeCopy = (value) =>
    value === "risk_on"
      ? "偏風險偏好"
      : value === "risk_off"
        ? "風險收斂"
        : value === "stressed"
          ? "壓力上升"
      : value || "未足夠";

  const latestResearchForCategory = (market, categories, limit = 3) =>
    (market.research_evidence || [])
      .filter((item) => categories.includes(item.category))
      .slice(0, limit);

  const sortByAbsChange = (items) =>
    [...items].sort((left, right) => {
      const leftChange = Math.abs(toNumber(left.change_percent) || 0);
      const rightChange = Math.abs(toNumber(right.change_percent) || 0);
      return rightChange - leftChange;
    });

  const topActiveQuotes = (market, symbols, limit = 3) =>
    sortByAbsChange(
      (market.quotes || []).filter((item) => symbols.includes(item.symbol)),
    ).slice(0, limit);

  const tablePercent = (value) => {
    const parsed = toNumber(value);
    return parsed === null ? "—" : `${parsed.toFixed(1)}%`;
  };

  const tableNumber = (value, digits = 1) => {
    const parsed = toNumber(value);
    return parsed === null ? "—" : parsed.toFixed(digits);
  };

  const { buildChart: buildPerformanceChart, installChart: installPerformanceChart } = createPerformanceRenderer();

  const safeExternalUrl = (value) => {
    try {
      const parsed = new URL(String(value));
      return parsed.protocol === "https:" ? parsed.href : null;
    } catch {
      return null;
    }
  };

  const googleFinanceExchange = {
    AMD: "NASDAQ",
    AVGO: "NASDAQ",
    DIA: "NYSEARCA",
    IWM: "NYSEARCA",
    META: "NASDAQ",
    NVDA: "NASDAQ",
    PLTR: "NASDAQ",
    QQQ: "NASDAQ",
    TQQQ: "NASDAQ",
    SPY: "NYSEARCA",
    SMH: "NASDAQ",
    SOXL: "NYSEARCA",
    ERX: "NYSEARCA",
    GLD: "NYSEARCA",
    TLT: "NASDAQ",
    SQQQ: "NASDAQ",
  };

  const symbolLink = (symbol) => {
    if (symbol === "CASH") return `<strong>${escapeHtml(symbol)}</strong>`;
    const exchange = googleFinanceExchange[symbol];
    if (!exchange) return `<strong>${escapeHtml(symbol)}</strong>`;
    const url = `https://www.google.com/finance/beta/quote/${encodeURIComponent(symbol)}:${exchange}`;
    return `
      <a class="symbol-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
        ${escapeHtml(symbol)}
      </a>`;
  };

  const renderTickerText = (value) => {
    const symbols = Object.keys(googleFinanceExchange).sort((left, right) => right.length - left.length);
    const pattern = new RegExp(`\\b(${symbols.join("|")})\\b`, "g");
    return String(value ?? "")
      .split(pattern)
      .map((part) => (googleFinanceExchange[part] ? symbolLink(part) : escapeHtml(part)))
      .join("");
  };

  const { applyLinks: glossaryText, render: renderGlossary } = createGlossaryRenderer(escapeHtml);
  const renderList = (items, emptyMessage = "未提供", transform = escapeHtml) => {
    const values = Array.isArray(items) ? items : [];
    if (values.length === 0) return `<li class="empty-item">${escapeHtml(emptyMessage)}</li>`;
    const renderItem = typeof transform === "function" ? transform : escapeHtml;
    return values.map((item) => `<li>${renderItem(item)}</li>`).join("");
  };

  const renderAssetTags = (items) => {
    const values = Array.isArray(items) ? items : [];
    if (values.length === 0) return `<span class="asset-tag muted">未指定</span>`;
    return values.map((item) => `<span class="asset-tag">${escapeHtml(item)}</span>`).join("");
  };

  const renderSourceLinks = (urls) => {
    const safeUrls = (Array.isArray(urls) ? urls : [])
      .map((url) => safeExternalUrl(url))
      .filter(Boolean);
    if (safeUrls.length === 0) return "";
    return `
      <div class="reason-sources" aria-label="資料來源">
        ${safeUrls
          .map(
            (url, index) => `
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                來源 ${index + 1}
              </a>`,
          )
          .join("")}
      </div>`;
  };

  const normalizeAgentName = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll("’", "'")
      .replaceAll("devil's advocate", "devil_advocate")
      .replaceAll(" ", "_");

  const { agentLink, renderAgentDirectory, renderAgentIntelligencePanel } =
    createAgentProfileRenderers({
      profiles: agentProfiles,
      escapeHtml,
      normalizeAgentName,
      dateTime,
    });

  const decisionLabel = (value) => {
    const labels = {
      bullish: "偏多",
      bearish: "偏空",
      neutral: "中立",
      strong_bullish: "強烈偏多",
      strong_bearish: "強烈偏空",
      risk_on: "風險偏好",
      risk_off: "風險趨避",
      high: "高",
      moderate: "中等",
      low: "低",
      live: "研究建議",
      review: "補充驗證",
      research_only: "補充中",
      structured: "結構化",
      policy_override: "政策覆寫",
      buy: "買入",
      hold: "維持",
      reduce: "減少",
      exit: "退出",
      increase: "增加",
      technical: "技術面",
      momentum: "動能",
      macro: "總體經濟",
      diversification: "分散配置",
      policy: "政策",
      valuation: "估值",
      news: "新聞",
      risk: "風險",
      none: "無",
      success: "成功",
      failure: "失敗",
      healthy: "正常",
      failed: "失敗",
      provider_invalid_response: "模型回應無效",
      model_capacity: "模型容量不足",
      rpm: "每分鐘請求額度",
      tpm: "每分鐘 Token 額度",
      daily_quota: "每日額度",
      normal: "一般",
      elevated: "偏高",
      stressed: "壓力",
      rising: "上升",
      falling: "下降",
      stable: "穩定",
      concerned: "擔心",
      firm: "堅定",
      cautious: "謹慎",
      conflicted: "拉扯",
      convinced: "被說服",
    };
    return labels[value] || String(value || "未分類").replaceAll("_", " ");
  };

  const sourceCatalogCopy = {
    sec_edgar: {
      name: "美國證券交易委員會 EDGAR 申報與公司財務資料",
      cadence: "申報發布時即時更新",
      latency: "結構化財務資料通常少於一分鐘",
      use: "查核 10-K、10-Q、8-K 與標準化公司財務數據。",
      limits: ["公司原始申報可能含錯誤或後續修正。", "不同公司的會計概念與期間不一定能直接比較。"],
    },
    sec_form4: {
      name: "美國證券交易委員會表格 3、4、5",
      cadence: "事件發生時更新",
      latency: "多數內部人交易須在兩個工作日內申報",
      use: "理解內部人持股變化與公開市場買賣背景。",
      limits: ["必須區分買賣、獎酬、執行、贈與與稅款扣繳。", "申報本身不能證明內部人交易能預測未來報酬。"],
    },
    sec_13f: {
      name: "美國證券交易委員會 13F 資料集",
      cadence: "每季更新",
      latency: "季末後最長可延遲 45 天",
      use: "追蹤機構持股、集中度與季對季變化。",
      limits: ["不是即時機構資金流訊號。", "無法涵蓋所有資產、空頭部位、避險或季中交易。"],
    },
    company_ir: {
      name: "公司投資人關係公告",
      cadence: "事件發生時更新",
      latency: "公司正式發布時",
      use: "交叉核對財報、財測、簡報與重大公司事件。",
      limits: ["公司資料可能偏重有利敘事。", "與正式申報不同時，以監管申報為準。"],
    },
    fred_alfred: {
      name: "聖路易聯邦準備銀行 FRED 與 ALFRED",
      cadence: "依各資料序列而定",
      latency: "依序列而定，許多數值後續會修正",
      use: "查核利率、信用利差、就業、通膨、流動性與金融情勢。",
      limits: ["各原始發布單位的時間表不同。", "回測應使用 ALFRED 歷史版本，避免後見偏誤。"],
    },
    us_treasury_rates: {
      name: "美國財政部每日殖利率曲線",
      cadence: "每個工作日更新",
      latency: "交易日結束後公布官方曲線",
      use: "衡量無風險利率水位、曲線斜率與利率衝擊。",
      limits: ["票面殖利率為模型推導曲線點，不是可直接成交價格。"],
    },
    federal_reserve: {
      name: "美國聯邦準備理事會政策資料",
      cadence: "依排程與政策事件更新",
      latency: "官方發布時",
      use: "評估政策事件、利率決議、會議紀錄與經濟預測。",
      limits: ["經濟預測帶有條件且不確定性高。"],
    },
    nyse_calendar: {
      name: "紐約證券交易所交易與休市日曆",
      cadence: "依交易日曆更新",
      latency: "交易所公布排程時",
      use: "判斷正常交易日、休市、提早收盤與日線是否完整。",
      limits: ["日曆不提供價格，也不能保證資料商日線已定稿。"],
    },
    cboe_vix: {
      name: "芝加哥選擇權交易所 VIX 指數與方法",
      cadence: "盤中及每日更新",
      latency: "公開顯示可能延遲",
      use: "判斷標普 500 選擇權隱含波動與尾端風險環境。",
      limits: ["VIX 不是投資組合損失的直接預測。", "VIX 相關產品還受均值回歸與期貨期限結構影響。"],
    },
    cboe_vix_term_structure: {
      name: "芝加哥選擇權交易所 VIX 期限結構",
      cadence: "盤中更新",
      latency: "公開顯示可能延遲",
      use: "比較不同天期波動指數，判讀事件壓力與波動曲線環境。",
      limits: ["指數水位不等於可直接成交的避險成本。", "不同天期資料必須與決策時間對齊。"],
    },
    occ_options_open_interest: {
      name: "美國選擇權結算公司成交量與未平倉量",
      cadence: "每日更新",
      latency: "依報告時程而定",
      use: "分析選擇權活動、擁擠程度、避險需求與事件風險。",
      limits: ["彙總成交量無法辨認投資人意圖或方向。", "未平倉量必須搭配履約價、到期日與標的判讀。"],
    },
    finra_short: {
      name: "美國金融業監管局空頭資料",
      cadence: "放空成交量每日更新；空頭餘額每月兩次",
      latency: "依資料集而定",
      use: "理解空頭背景與場外放空成交活動。",
      limits: ["每日放空成交量不等於空頭餘額。", "資料未整合所有交易所，且可能包含當日已平倉部位。"],
    },
    cftc_cot: {
      name: "美國商品期貨交易委員會交易人持倉報告",
      cadence: "每週更新",
      latency: "通常週五公布週二持倉",
      use: "分析股指、利率、能源、金屬與匯率期貨持倉。",
      limits: ["彙總分類不是個別股票資金流。", "週二至週五的延遲限制短線時點用途。"],
    },
    eia: {
      name: "美國能源資訊署開放資料",
      cadence: "依序列每日、每週、每月或每年更新",
      latency: "依資料序列而定",
      use: "查核油價、庫存、生產、進出口與煉油廠利用率。",
      limits: ["每週估計可能修正，且不一定與股市決策時間對齊。"],
    },
    geopolitical_official: {
      name: "美國財政部制裁、貿易代表署與聯邦公報",
      cadence: "事件發生時更新",
      latency: "官方發布時",
      use: "追蹤直接影響公司或產業的制裁、關稅與監管措施。",
      limits: ["官方措施不能涵蓋所有地緣政治發展與市場解讀。", "公司曝險仍須用已查核的地區與供應鏈資料對照。"],
    },
    yahoo_market: {
      name: "Yahoo Finance 市場資料",
      cadence: "本系統每日更新",
      latency: "可能延遲",
      use: "取得價格、成交量與可重現的趨勢或波動特徵。",
      limits: ["不是交易所官方行情。", "公司行動調整與偶發缺漏需要再次驗證。"],
    },
  };

  const localizedSource = (source) =>
    sourceCatalogCopy[source.source_id] || {
      name: "未分類外部資料來源",
      cadence: "更新頻率請參考原始來源",
      latency: "資料延遲尚未建立繁體中文摘要",
      use: "此來源的用途尚未建立繁體中文摘要，請查閱原始頁面。",
      limits: ["來源限制尚未建立繁體中文摘要，不應單獨用於投資判斷。"],
    };

  const renderCommitteeChat = committeeRendererFactory
    ? committeeRendererFactory({
        agentLink,
        agentProfiles,
        dateTime,
        decisionLabel,
        escapeHtml,
        glossaryText,
        normalizeAgentName,
        percent,
        renderAssetTags,
        renderList,
        symbolLink,
      })
    : () => '<p class="methodology-note" role="status">完整委員會內容將在開啟此分頁時載入。</p>';


  const researchStatusLabel = (value) => {
  const labels = {
    untested: "尚未驗證",
    partially_tested: "部分驗證",
    supported: "暫時支持",
    challenged: "受到挑戰",
    invalidated: "已失效",
    mixed: "證據混合",
    too_early: "尚未開始",
    no_evidence: "尚無可驗證結果",
    accumulating: "結果累積中",
    insufficient: "樣本不足",
    provisional: "暫定",
    usable: "可評估",
    review: "補充驗證",
    research_only: "補充中",
  };

    return labels[value] || String(value || "未分類");
  };

  const leaderboardStatusLabel = (item) => {
    const pending = Math.max(Number(item.participation_calls) - Number(item.evaluated_calls), 0);
    if (item.evaluated_calls) {
      return `評估樣本累積中（已評估 ${item.evaluated_calls}，待評估 ${pending}）`;
    }
    return `尚無可驗證結果（待評估 ${pending}）`;
  };

  const info = (label, description) => `
    <details class="info-popover">
      <summary aria-label="${escapeHtml(label)}說明"><span aria-hidden="true">ⓘ</span></summary>
      <span class="info-popover-content" role="tooltip">${escapeHtml(description)}</span>
    </details>`;

  const performanceSampleLabel = (status, intervals) => {
    if (status === "provisional") return `短期觀察中（${intervals} 個完成區間）`;
    return "樣本已具可評估範圍";
  };

  const readinessLabel = (value) => {
    const labels = {
      not_ready_for_event_driven_trading: "每日研究可用 · 即時事件不足",
      ready_for_daily_research: "每日研究可用",
      ready_for_event_driven_trading: "事件驅動已通過",
    };
    return labels[value] || String(value || "未評估");
  };

  const healthGradeLabel = (value) => {
    const labels = {
      strong: "強健",
      stable: "穩定",
      caution: "需警戒",
      fragile: "脆弱",
    };
    return labels[value] || String(value || "未評估");
  };

  const statistic = (value, suffix = "") =>
    value === null || value === undefined
      ? "—"
      : `${Number(value).toFixed(2)}${suffix}`;

  const render = ({
    recommendation,
    committee,
    market,
    system,
    learning,
    performance,
    rebalance,
    researchJournal,
    dashboardAnalytics,
    freshnessCalendar,
    healthSignal,
    thesisBook,
    earningsReviews,
    marketIntelligence,
    extensionStatus,
  }) => {
    const overview = createOverviewModel({ dashboardAnalytics, committee, recommendation });
    const { isLive, investedWeight, cash, modelScore, scoreBand, scoreReason, scoreAngle, donut, committeeSize, health, analyticsPerformance, returnObjective } = overview;
    const exposureSnapshot = recommendation.exposure_snapshot;
    const exposureStatusLabel = (status) => ({
      ready: "已量測",
      insufficient: "資料不足",
      partial: "部分資料",
      stale: "資料過期",
      unavailable: "無法量測",
    }[status] || "未提供");
    const exposurePercent = (value) => value == null ? "—" : percent(value);
    const renderExposurePanel = () => {
      if (!exposureSnapshot) return "";
      const coverage = exposureSnapshot.coverage || {};
      const clusters = Array.isArray(exposureSnapshot.correlation_clusters)
        ? exposureSnapshot.correlation_clusters
        : [];
      const measuredClusters = clusters.filter((cluster) => cluster.status === "ready");
      const unknownClusters = clusters.filter((cluster) => cluster.status !== "ready");
      const issuerItems = (exposureSnapshot.issuer_exposures || []).slice(0, 3);
      const sectorItems = (exposureSnapshot.sector_exposures || []).slice(0, 3);
      const exposureItems = (items) => items.length
        ? items.map((item) => `<li><span>${escapeHtml(item.factor)}</span><strong>${exposurePercent(item.weight)}</strong></li>`).join("")
        : '<li><span>沒有可用資料</span><strong>—</strong></li>';
      const measuredItems = measuredClusters.length
        ? measuredClusters.map((cluster) => `
            <li>
              <div><span>${cluster.symbols.map((symbol) => symbolLink(symbol)).join("、")}</span><strong>${cluster.correlation == null ? "—" : Number(cluster.correlation).toFixed(2)}</strong></div>
              <small>樣本 ${escapeHtml(cluster.sample_size)} · 窗口 ${escapeHtml(cluster.window_sessions)} 日 · 下跌期 ${cluster.downside_correlation == null ? "未足夠" : Number(cluster.downside_correlation).toFixed(2)}（${escapeHtml(cluster.downside_sample_size)} 筆）</small>
            </li>`).join("")
        : '<li><span>目前沒有達門檻的已量測群組</span><strong>—</strong></li>';
      const unknownItems = unknownClusters.length
        ? unknownClusters.map((cluster) => `
            <li>
              <div><span>${cluster.symbols.map((symbol) => symbolLink(symbol)).join("、")}</span><strong>${escapeHtml(exposureStatusLabel(cluster.status))}</strong></div>
              <small>需要至少 ${escapeHtml(cluster.window_sessions || 60)} 個完成交易日；缺值 ${escapeHtml((cluster.missing_symbols || []).length)}，波動極小 ${escapeHtml((cluster.constant_symbols || []).length)}。</small>
            </li>`).join("")
        : '<li><span>沒有未量測標的</span><strong>—</strong></li>';
      return `
        <section class="panel exposure-panel" id="exposure" data-tab-section="overview" aria-labelledby="exposure-title">
          <header class="panel-header">
            <div>
              <span class="section-kicker">共同曝險拆解</span>
              <h2 id="exposure-title">已知集中、未知曝險與實際相關性</h2>
            </div>
            <span class="panel-meta">相關性資料：${escapeHtml(exposureStatusLabel(coverage.correlation_status))}</span>
          </header>
          <p class="exposure-note">只使用不晚於決策截止時間的完成交易日調整後收盤價；樣本不足不補零，也不把未知資料當成相關性違規。</p>
          <div class="exposure-grid">
            <article class="exposure-card">
              <h3>已知發行人集中</h3>
              <ul>${exposureItems(issuerItems)}</ul>
              <h3>已知產業集中</h3>
              <ul>${exposureItems(sectorItems)}</ul>
            </article>
            <article class="exposure-card">
              <h3>已量測相關性</h3>
              <ul>${measuredItems}</ul>
            </article>
            <article class="exposure-card exposure-card-unknown">
              <h3>未量測共同曝險</h3>
              <ul>${unknownItems}</ul>
            </article>
          </div>
        </section>`;
    };
    const renderKpiPanel = () => {
      const reviews = Array.isArray(earningsReviews?.reviews) ? earningsReviews.reviews : [];
      if (!reviews.length) return "";
      const targetSymbols = ["NVDA", "AVGO", "META", "PLTR"];
      const latest = new Map();
      for (const review of reviews) {
        if (!targetSymbols.includes(review.symbol) || latest.has(review.symbol)) continue;
        latest.set(review.symbol, review);
      }
      const statusLabel = (status) => ({
        available: "已取得",
        not_comparable: "不可比",
        missing: "缺失",
      }[status] || "缺失");
      const statusClass = (status) => status === "available" ? "kpi-available" : status === "not_comparable" ? "kpi-not-comparable" : "kpi-missing";
      const rows = targetSymbols.map((symbol) => {
        const review = latest.get(symbol);
        const coverage = review?.kpi_coverage || [];
        const available = coverage.filter((item) => item.status === "available").length;
        const counter = (review?.quality_signals || []).filter((item) => item.direction === "counterevidence");
        const period = coverage.flatMap((item) => item.period_labels || []).filter(Boolean).slice(0, 2).join("、") || "未提供期間";
        const basis = [...new Set(coverage.flatMap((item) => item.accounting_bases || []))].join("、") || "未提供口徑";
        const detail = review
          ? `${available}/${coverage.length} 項可用 · ${period} · ${basis}`
          : "尚無可核對的財報事件";
        return `<tr>
          <th scope="row">${symbolLink(symbol)}</th>
          <td>${escapeHtml(detail)}</td>
          <td><span class="kpi-status ${review ? "kpi-available" : "kpi-missing"}">${review ? "已建立" : "缺失"}</span></td>
          <td>${counter.length ? counter.map((item) => escapeHtml(item.summary)).join("；") : "目前沒有可核對的反方證據"}</td>
        </tr>`;
      }).join("");
      return `<section class="panel kpi-panel" id="earnings-kpi" data-tab-section="overview" aria-labelledby="earnings-kpi-title">
        <header class="panel-header">
          <div>
            <span class="section-kicker">公司營運品質</span>
            <h2 id="earnings-kpi-title">四家公司 KPI 覆蓋與現金流檢查</h2>
          </div>
          <span class="panel-meta">只呈現已核對資料；缺口不補值</span>
        </header>
        <p class="exposure-note">季度、YTD 與 GAAP 口徑分開保存；自由現金流、資本支出與融資租賃付款不跨公司直接混用。反方證據只供審查，不會自動減碼。</p>
        <div class="table-wrap">
          <table class="kpi-table">
            <thead><tr><th scope="col">公司</th><th scope="col">覆蓋範圍</th><th scope="col">事件</th><th scope="col">可追溯反方證據</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="kpi-legend"><span class="kpi-status kpi-available">已取得</span> 可用資料　<span class="kpi-status kpi-not-comparable">不可比</span> 口徑不同　<span class="kpi-status kpi-missing">缺失</span> 尚未取得</p>
      </section>`;
    };
    const renderPhysicalRiskPanel = () => {
      const risks = Array.isArray(marketIntelligence?.physical_risks)
        ? marketIntelligence.physical_risks.slice(0, 8)
        : [];
      if (!risks.length) return "";
      const hazardLabel = {
        weather: "天候",
        power: "電力",
        water: "用水",
        facility: "設施",
        supply: "供應節點",
      };
      const statusLabel = {
        outlook: "展望",
        warning: "警示",
        disruption: "中斷",
        recovery: "恢復",
        unknown: "未知",
      };
      const dataStatusLabel = { current: "目前", stale: "過期", unknown: "未知" };
      const rows = risks.map((risk) => {
        const symbols = (risk.affected_symbols || []).map((symbol) => symbolLink(symbol)).join("、");
        const period = `${dateTime(risk.valid_from)}${risk.valid_to ? ` 至 ${dateTime(risk.valid_to)}` : " 起"}`;
        const assumptions = (risk.scenario_assumptions || []).slice(0, 3).map(escapeHtml).join("；") || "未提供情境假設";
        return `<article class="physical-risk-card">
          <div class="physical-risk-heading"><span class="section-kicker">${escapeHtml(hazardLabel[risk.hazard] || "營運")}</span><span class="kpi-status ${risk.data_status === "current" ? "kpi-available" : "kpi-not-comparable"}">${escapeHtml(dataStatusLabel[risk.data_status] || "未知")}</span></div>
          <h3>${escapeHtml(risk.location)}</h3>
          <p>${escapeHtml(statusLabel[risk.status] || "未知")} · 信心 ${escapeHtml(risk.confidence)} · ${escapeHtml(period)}</p>
          <p>受影響：${symbols || "未標示"}</p>
          <small>情境假設：${assumptions}</small>
        </article>`;
      }).join("");
      return `<section class="panel physical-risk-panel" id="physical-risks" data-tab-section="overview" aria-labelledby="physical-risks-title">
        <header class="panel-header"><div><span class="section-kicker">環境與供應限制</span><h2 id="physical-risks-title">目前模擬部位的實體營運風險</h2></div><span class="panel-meta">僅列有定位與官方來源的事件</span></header>
        <p class="exposure-note">天候機率不是確定損失或交易訊號；成本增加、營收延遲與供應恢復只在列出的假設下成立。未知與過期資料會保留標示。</p>
        <div class="physical-risk-grid">${rows}</div>
      </section>`;
    };
    const renderGeopoliticalRiskPanel = () => {
      const events = Array.isArray(marketIntelligence?.geopolitical_risks)
        ? marketIntelligence.geopolitical_risks.slice(0, 8)
        : [];
      if (!events.length) return "";
      const statusLabel = {
        proposed: "提案／尚未生效",
        effective: "已生效",
        suspended: "暫停",
        court_limited: "法院限制",
        expired: "已失效",
        unknown: "未知",
      };
      const topicLabel = {
        energy: "能源",
        shipping: "航運",
        tariff: "關稅",
        export_control: "出口限制",
        geopolitical: "地緣事件",
        rates: "折現率",
      };
      const rows = events.map((event) => {
        const source = safeExternalUrl(event.source_urls?.[0]);
        const sourceLink = source
          ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">官方來源</a>`
          : "來源未提供";
        const scenarioText = (event.scenarios || []).slice(0, 3).map((scenario) =>
          `${escapeHtml(scenario.label)}（${escapeHtml(scenario.direction)}）：${escapeHtml(scenario.assumptions[0] || "未知假設")}`,
        ).join("；");
        const evidence = (event.evidence_ids || []).slice(0, 3).map(escapeHtml).join("、") || "未提供";
        const conditions = (event.observation_conditions || []).slice(0, 2).map(escapeHtml).join("；") || "未提供";
        return `<article class="geo-risk-card">
          <div class="physical-risk-heading"><span class="section-kicker">${escapeHtml(topicLabel[event.topic] || "事件")}</span><span class="kpi-status ${event.status === "effective" ? "kpi-not-comparable" : "kpi-missing"}">${escapeHtml(statusLabel[event.status] || "未知")}</span></div>
          <h3>${escapeHtml(event.summary)}</h3>
          <p>區域：${escapeHtml(event.region)} · 公告：${escapeHtml(dateTime(event.announcement_at))}${event.effective_at ? ` · 生效：${escapeHtml(dateTime(event.effective_at))}` : ""}</p>
          <p>受影響：${(event.affected_symbols || []).map((symbol) => symbolLink(symbol)).join("、")}</p>
          <p>情境：${scenarioText || "未知"}</p>
          <small>觀察／失效條件：${conditions} · evidence：${evidence} · ${sourceLink}</small>
        </article>`;
      }).join("");
      return `<section class="panel physical-risk-panel" id="geopolitical-risks" data-tab-section="overview" aria-labelledby="geopolitical-risks-title">
        <header class="panel-header"><div><span class="section-kicker">政策與地緣傳導</span><h2 id="geopolitical-risks-title">能源、航運與政策情境</h2></div><span class="panel-meta">情境研究摘要，不改變正式配置</span></header>
        <p class="exposure-note">持續、緩解與二次通膨方向分開保存；公告不等於生效，沒有曝險證據的事件不會擴大標的範圍。</p>
        <div class="physical-risk-grid">${rows}</div>
      </section>`;
    };
    const investmentReasons = (recommendation.top_reasons || []).filter(
      (reason) => reason.reason_type !== "policy_explanation",
    );
    const policyReasons = (recommendation.top_reasons || []).filter(
      (reason) => reason.reason_type === "policy_explanation",
    );
    const actionLabel = (action) =>
      ({ increase: "加碼", hold: "維持", reduce: "減碼", exit: "退出" }[action] || "檢視");
    const reasonActions = (reason) => Object.entries(reason.final_action || {}).map(
      ([symbol, action]) => {
        const weight = (reason.final_weight || {})[symbol];
        const weightLabel = weight == null ? "權重未提供" : percent(weight);
        return `${symbolLink(symbol)} ${escapeHtml(actionLabel(action))} ${escapeHtml(weightLabel)}`;
      },
    ).join("、");
    const reasonSourceLabel = (reason) => reason.reason_type === "investment_evidence"
      ? "來源觀測"
      : reason.reason_type === "policy_explanation"
        ? "風控紀錄"
        : "歷史理由／未保存可核對來源";
    const reasonCard = (reason) => `
      <article class="reason-card">
        <span class="reason-number">${String(reason.id).padStart(2, "0")}</span>
        <h3>${escapeHtml(reason.title)}</h3>
        <p>${glossaryText(reason.summary)}</p>
        ${Object.keys(reason.final_action || {}).length ? `<p>最終配置：${reasonActions(reason)}</p>` : ""}
        <div class="reason-meta"><span>${escapeHtml(decisionLabel(reason.category))}</span><span>${reasonSourceLabel(reason)}</span></div>
        ${renderSourceLinks(reason.source_urls)}
      </article>`;
    const artifactSource = (artifactRef) => {
      const policyMatch = String(artifactRef || "").match(/committee\.json#\/policy_override_notes\/(\d+)/);
      if (policyMatch) {
        const index = Number(policyMatch[1]);
        return {
          label: `來源：風控紀錄 ${index + 1}`,
          note: committee.policy_override_notes?.[index] || "",
          href: `${dataBase}/data/committee_summary.json`,
        };
      }
      if (String(artifactRef || "").includes("effective_risk_profile")) {
        return {
          label: "來源：有效風險設定",
          note: "",
          href: `${dataBase}/data/committee_summary.json`,
        };
      }
      return {
        label: `來源：${String(artifactRef || "未標示")}`,
        note: "",
        href: `${dataBase}/data/committee_summary.json`,
      };
    };
    const policyReasonSource = (reason) =>
      (reason.artifact_refs || [])
        .map(artifactSource)
        .find((source) => source.note) ||
      (reason.artifact_refs || []).map(artifactSource)[0] ||
      { label: "來源：最終推薦", note: "", href: `${dataBase}/data/recommendation.json` };
    const readablePolicyNote = (note) => {
      const raw = String(note || "");
      const positionMatch = raw.match(/(?:Position-risk shadow(?: warning)?:|部位風險影子紀錄：?)\s*(\d+)\s*個風險部位/i);
      if (positionMatch) {
        return `${positionMatch[1]} 個模擬風險部位尚未量化或超過單筆研究損失預算。`;
      }
      const exposureMatch = raw.match(/(?:Exposure shadow(?: warning)?:|共同曝險影子警示：?)\s*correlation cluster\s+([^\s]+)\s+weight\s+([0-9.]+)\s+exceeds\s+([0-9.]+)/i);
      if (exposureMatch) {
        const symbols = exposureMatch[1].split(",").join("、");
        return `相關性群組 ${symbols} 的目標比例為 ${percent(exposureMatch[2])}，高於政策門檻 ${percent(exposureMatch[3])}。`;
      }
      return raw
        .replace("Position-risk shadow:", "部位風險監測紀錄：")
        .replace("Position-risk shadow warning:", "部位風險監測警示：")
        .replace("Exposure shadow warning:", "共同曝險監測警示：")
        .replace("Exposure shadow:", "共同曝險監測紀錄：")
        .replace("correlation cluster", "相關性群組")
        .replace("weight", "目標比例")
        .replace("exceeds", "高於");
    };
    const affectedPolicyAssets = (reason) => {
      const symbols = reason.affected_assets?.length
        ? reason.affected_assets
        : Object.keys(reason.final_action || {});
      return symbols.length
        ? symbols.map((symbol) => `<span class="ticker-chip">${symbolLink(symbol)}</span>`).join("")
        : '<span class="muted-copy">未標示特定標的，視為整體配置風險。</span>';
    };
    const policyImpact = (reason) => {
      const entries = Object.entries(reason.final_action || {});
      if (!entries.length) return "本輪沒有記錄配置動作；以最終推薦權重為準。";
      const changed = entries.filter(([, action]) => action !== "hold");
      if (!changed.length) return "本輪沒有新增買賣動作；受影響配置維持在最終目標比例。";
      return `本輪動作：${changed.map(([symbol, action]) => {
        const weight = (reason.final_weight || {})[symbol];
        const weightText = weight == null ? "權重未提供" : percent(weight);
        return `${symbolLink(symbol)} ${escapeHtml(actionLabel(action))} ${escapeHtml(weightText)}`;
      }).join("、")}。`;
    };
    const policyActionTaken = (reason, sourceNote) => {
      const text = `${reason.title || ""} ${reason.summary || ""} ${sourceNote || ""}`.toLowerCase();
      if (text.includes("shadow") || text.includes("影子") || text.includes("監測")) {
        return "列為風險監測紀錄，未啟用硬性限制；這表示資料或政策尚未達到阻擋條件，不代表風險為零。";
      }
      if (text.includes("硬性") || text.includes("binding")) {
        return "列入硬性限制或可檢查約束；最終配置必須遵守這項條件。";
      }
      return "列為風控檢查紀錄；是否交易仍以最終配置與再平衡指示為準。";
    };
    const policyDisplayTitle = (reason, sourceNote) => {
      const original = (reason.title || "本輪風控檢查紀錄").replace("影子", "監測");
      if (!["本輪研究風險警示", "本輪風控檢查紀錄"].includes(original)) return original;
      if (sourceNote.includes("部位風險")) return "部位風險監測警示";
      if (sourceNote.includes("共同曝險")) return "共同曝險監測警示";
      if (sourceNote.includes("硬性") || sourceNote.toLowerCase().includes("binding")) {
        return "風控硬性限制";
      }
      return original;
    };
    const policyResidualRisk = (sourceNote) =>
      sourceNote
        ? "未量化、超出門檻或缺少同口徑資料的部分仍存在；沒有啟用硬性限制不代表風險為零。"
        : "來源未提供完整量化輸入；未顯示限制不代表沒有風險。";
    const policyReviewCondition = (reason) => {
      const invalidations = recommendation.invalidation_conditions || [];
      if (invalidations.length) return invalidations.slice(0, 2).map(escapeHtml).join("；");
      return "下一輪資料更新、風控政策觸發或來源證據改變時重新檢視。";
    };
    const policyReasonKey = (reason) => {
      const source = policyReasonSource(reason);
      return JSON.stringify([
        reason.title || "",
        reason.summary || "",
        source.note || "",
        Object.entries(reason.final_action || {}),
        Object.entries(reason.final_weight || {}),
      ]);
    };
    const uniquePolicyReasons = [];
    const seenPolicyReasons = new Set();
    for (const reason of policyReasons) {
      const key = policyReasonKey(reason);
      if (seenPolicyReasons.has(key)) continue;
      seenPolicyReasons.add(key);
      uniquePolicyReasons.push(reason);
    }
    const renderArtifactLinks = (reason) => {
      const sources = (reason.artifact_refs || []).map(artifactSource);
      const unique = [];
      const seen = new Set();
      for (const source of sources) {
        const key = `${source.label}|${source.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(source);
      }
      if (!unique.length) return '<span class="muted-copy">來源未標示</span>';
      return unique.map((source) => (
        `<a href="${escapeHtml(source.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
      )).join("");
    };
    const policyReasonCard = (reason, index) => {
      const source = policyReasonSource(reason);
      const sourceNote = readablePolicyNote(source.note);
      const trigger = sourceNote || reason.summary || "本輪有風控紀錄，但缺少可讀來源摘要。";
      return `
        <article class="reason-card risk-policy-card">
          <span class="reason-number">${String(index + 1).padStart(2, "0")}</span>
          <h3>${escapeHtml(policyDisplayTitle(reason, sourceNote))}</h3>
          <dl class="risk-policy-list">
            <div>
              <dt>風險／觸發原因</dt>
              <dd>${glossaryText(trigger)}</dd>
            </div>
            <div>
              <dt>受影響標的或配置</dt>
              <dd class="ticker-chip-list">${affectedPolicyAssets(reason)}</dd>
            </div>
            <div>
              <dt>對本輪決策的實際影響</dt>
              <dd>${policyImpact(reason)}</dd>
            </div>
            <div>
              <dt>已採取動作</dt>
              <dd>${escapeHtml(policyActionTaken(reason, sourceNote))}</dd>
            </div>
            <div>
              <dt>未消除的剩餘風險</dt>
              <dd>${escapeHtml(policyResidualRisk(sourceNote))}</dd>
            </div>
            <div>
              <dt>重新檢視條件</dt>
              <dd>${policyReviewCondition(reason)}</dd>
            </div>
          </dl>
          <details class="risk-policy-details">
            <summary>查看來源與完整配置</summary>
            <p>${escapeHtml(reason.summary || "未提供補充摘要。")}</p>
            <p class="risk-policy-source-links">${renderArtifactLinks(reason)}</p>
            ${Object.keys(reason.final_action || {}).length ? `<p>最終配置：${reasonActions(reason)}</p>` : ""}
          </details>
        </article>`;
    };
    const riskPlans = recommendation.position_risk_plans || [];
    const allocationBySymbol = new Map(
      (recommendation.allocations || []).map((item) => [item.symbol, item]),
    );
    const rebalanceBySymbol = new Map(
      (rebalance.instructions || []).map((item) => [item.symbol, item]),
    );
    const hasNewTrade = (rebalance.instructions || []).some(
      (instruction) => instruction.action !== "hold",
    );
    const signedPercent = (value) => {
      const parsed = toNumber(value);
      if (parsed === null) return "未提供";
      if (Math.abs(parsed) < 0.0000001) return "0%";
      return `${parsed > 0 ? "+" : ""}${percent(parsed)}`;
    };
    const riskActionLabel = (action) => ({
      add: "加碼",
      increase: "加碼",
      hold: "維持",
      reduce: "減碼",
      exit: "退出",
    }[action] || "檢視");
    const riskMethodology = (plan) => {
      const methodology = String(plan.methodology || "");
      if (plan.status === "exempt") {
        return {
          reason: "現金不適用價格失效估算。",
          requirement: "若現金轉為風險資產，才需要報價與失效條件。",
        };
      }
      if (methodology.includes("Zero target allocation")) {
        return {
          reason: "本輪目標比例為 0%，沒有新增風險預算。",
          requirement: "若重新配置為風險資產，需提供報價與失效條件。",
        };
      }
      if (methodology.includes("Missing or non-positive market quote")) {
        return {
          reason: "缺少可用市場報價或報價不是正數。",
          requirement: "需要同一資料截止時間的有效參考價。",
        };
      }
      if (methodology.includes("stale")) {
        return {
          reason: "報價逾時，不符合 position_risk_gate 的新鮮度要求。",
          requirement: "需要未逾時的參考價與時間戳。",
        };
      }
      if (methodology.includes("Event/thesis")) {
        return {
          reason: "失效條件為事件或論點，尚無可檢查價格界線。",
          requirement: "需要明確失效價或保守價格代理，才會計算基本損失。",
        };
      }
      if (plan.v1_loss_bound?.schema_version === "1.0") {
        return {
          reason: plan.v1_loss_bound.reason,
          requirement: "價格失效界線與外生假設各自評估，不保證停損成交。",
        };
      }
      if (methodology.includes("not below")) {
        return {
          reason: "失效價未低於多頭參考價，不能形成保守損失估算。",
          requirement: "需要低於參考價的失效價或改列非價格型失效。",
        };
      }
      if (plan.status === "quantified") {
        return {
          reason: "已使用參考價、失效價與政策跳空壓力估算。",
          requirement: "若報價或失效價改變，下一輪重新計算。",
        };
      }
      return {
        reason: "資料不足，維持 fail-closed。",
        requirement: "需要可驗證報價、時間戳與失效條件。",
      };
    };
    const riskInputSummary = (plan) => {
      if (plan.status === "exempt") return "現金不需要價格失效輸入。";
      if (plan.status !== "quantified") return `尚缺：${riskMethodology(plan).reason}`;
      return `參考價 ${money(plan.reference_price)}，失效價 ${money(plan.invalidation_price)}，資料 ${dateTime(plan.reference_timestamp)}`;
    };
    const riskStatusLabel = (plan) => {
      if (plan.status === "quantified") return "已量化";
      if (plan.status === "exempt") return "免估算";
      return "未量化";
    };
    const riskPlanCard = (plan) => {
      const allocation = allocationBySymbol.get(plan.symbol) || {};
      const instruction = rebalanceBySymbol.get(plan.symbol) || {};
      const previousWeight = toNumber(instruction.previous_target_weight);
      const currentWeight = toNumber(allocation.target_weight);
      const change = previousWeight === null || currentWeight === null ? null : currentWeight - previousWeight;
      const methodology = riskMethodology(plan);
      const statusClass = plan.status === "quantified" ? "quantified" : plan.status === "exempt" ? "exempt" : "unquantified";
      const invalidation = plan.invalidation_type === "price" && plan.invalidation_price
        ? `價格低於 ${money(plan.invalidation_price)} 時重新檢視。`
        : plan.invalidation_type === "cash"
          ? "現金配置不使用價格失效條件。"
          : "事件或研究論點失效時重新檢視；目前沒有價格界線。";
      const baseFraction = plan.status === "quantified" ? plan.base_loss_fraction : "";
      const gap = plan.v1_gap_stress;
      const independentGap = gap?.schema_version === "1.0" && gap.mode === "shadow" && gap.unit === "return_fraction";
      const measuredGap = independentGap && ["measured", "exempt"].includes(gap.status)
        && gap.loss_contribution_fraction !== null && gap.loss_contribution_fraction !== undefined
        && Number.isFinite(Number(gap.loss_contribution_fraction));
      const stressFraction = gap ? measuredGap ? gap.loss_contribution_fraction : ""
        : plan.status === "quantified" ? plan.portfolio_contribution : "";
      const stressCopy = gap ? stressFraction !== "" && stressFraction !== null
        ? `${(Number(stressFraction) * 100).toFixed(2)}%（外生價格假設；不保證停損成交）` : "未知，不能補零"
        : plan.status === "quantified" ? `${percent(plan.portfolio_contribution)}（政策壓力 ${percent(plan.stress_gap_percent)}）` : "未量化";
      const statusSummary = plan.status === "quantified"
        ? "已量化；資料、失效價或配置變動時會重新計算。"
        : plan.status === "exempt"
          ? "免估算；現金沒有價格失效曝險。"
          : `未量化：${methodology.reason} 可量化所需資料：${methodology.requirement}`;
      return `
        <article class="position-risk-card ${statusClass}">
          <header>
            <div>
              <span class="section-kicker">${symbolLink(plan.symbol)}</span>
              <h3>${escapeHtml(riskActionLabel(instruction.action || allocation.action || "hold"))}</h3>
            </div>
            <span class="risk-status">${plan.v1_loss_bound ? "失效界線：" : ""}${escapeHtml(riskStatusLabel(plan))}</span>
          </header>
          <dl class="position-risk-grid">
            <div><dt>前一輪目標 ${info("前一輪目標", "前一輪公開模擬研究的目標比例；不是券商或使用者實際持倉。")}</dt><dd>${previousWeight === null ? "未提供" : percent(previousWeight)}</dd></div>
            <div><dt>本輪目標 ${info("本輪目標", "本輪公開模擬研究建議的目標比例；可用上方所選本金換算金額。")}</dt><dd>${currentWeight === null ? "未提供" : percent(currentWeight)}</dd></div>
            <div><dt>配置變化 ${info("配置變化", "本輪目標比例減去前一輪目標比例。正數為加碼、負數為減碼，不代表已執行真實交易。")}</dt><dd>${signedPercent(change)}</dd></div>
            <div><dt>失效條件 ${info("失效條件", "若此條件成立，原研究論點要重新檢視。只有價格型失效條件才能計算基本損失。")}</dt><dd>${escapeHtml(invalidation)}</dd></div>
            <div><dt>風險輸入 ${info("風險輸入", "量化基本損失需要同一資料截止時間的參考價、失效價與時間戳；缺少任何一項就保持未知。")}</dt><dd>${escapeHtml(riskInputSummary(plan))}</dd></div>
            <div><dt>基本損失比例 ${info("基本損失比例", "以本輪目標比例、參考價與失效價估算到達失效價前的損失比例；不是最大可能損失，也不保證停損成交。")}</dt><dd>${plan.status === "quantified" ? percent(plan.base_loss_fraction) : `未量化：${escapeHtml(methodology.reason)}`}</dd></div>
            <div><dt>跳空壓力比例 ${info("跳空壓力比例", "以政策設定的外生跳空假設估算隔夜或事件衝擊；不是預測，也不假設停損一定成交。")}</dt><dd>${stressCopy}</dd></div>
            <div><dt>狀態 ${info("狀態", "說明此部位是否已量化；未量化不等於零風險，並會指出可量化所需資料。")}</dt><dd>${escapeHtml(statusSummary)}</dd></div>
            <div><dt>所選本金換算 ${info("所選本金換算", "只依瀏覽器中的模擬本金換算，不會上傳、不會讀取或揭露真實帳戶本金。")}</dt><dd data-sim-risk data-base-fraction="${escapeHtml(baseFraction)}" data-stress-fraction="${escapeHtml(stressFraction)}">${baseFraction !== "" || stressFraction !== "" ? "輸入本金後換算" : "需要量化後才換算"}</dd></div>
          </dl>
          <details class="position-risk-details">
            <summary>為什麼是這個狀態</summary>
            <p>${escapeHtml(methodology.reason)}</p>
            <p>${escapeHtml(methodology.requirement)}</p>
            <p>這是模擬組合風險摘要，不代表真實帳戶，也不保證停損一定成交。</p>
          </details>
        </article>`;
    };
    const statusLabel = "研究建議 · 研究用途";
    root.innerHTML = `
      <div class="app-shell">
        <a class="skip-link" href="#dashboard-main">跳到主要內容</a>
        <aside class="app-sidebar">
          <header class="topbar">
            <span class="sidebar-project-name">研究平台</span>
            <div class="brand">
              <span class="brand-copy">
                <strong>投資委員會</strong>
                <span>組合研究與短線追蹤</span>
              </span>
            </div>
          </header>

          <nav class="tab-controls" aria-label="區段切換" data-tab-controls>
            <button
              type="button"
              class="tab-menu-toggle"
              data-tab-menu-toggle
              aria-expanded="false"
              aria-controls="main-tab-strip"
              aria-label="切換區段"
            >
              <span class="menu-icon" aria-hidden="true">☰</span>
              <span>導覽</span>
            </button>
            <div class="sidebar-section-label" aria-hidden="true">已釘選</div>
            <div class="tab-strip" id="main-tab-strip" data-tab-strip role="tablist" aria-label="儀表板內容">
              <button type="button" class="tab-trigger active" data-tab-trigger data-tab-target="overview" id="tab-overview" role="tab" aria-label="總覽" aria-controls="panel-overview" aria-selected="true" tabindex="0"><span class="tab-icon" aria-hidden="true">⌂</span><span class="tab-label">總覽</span></button>
              <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="committee" id="tab-committee" role="tab" aria-label="委員會內容" aria-controls="panel-committee" aria-selected="false" tabindex="-1"><span class="tab-icon" aria-hidden="true">▤</span><span class="tab-label">委員會內容</span></button>
              <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="agent-intel" id="tab-agent-intel" role="tab" aria-label="角色觀點" aria-controls="panel-agent-intel" aria-selected="false" tabindex="-1"><span class="tab-icon" aria-hidden="true">♙</span><span class="tab-label">角色觀點</span></button>
              <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="glossary" id="tab-glossary" role="tab" aria-label="術語表" aria-controls="panel-glossary" aria-selected="false" tabindex="-1"><span class="tab-icon" aria-hidden="true">ⓘ</span><span class="tab-label">術語表</span></button>
            </div>
          </nav>
          <footer class="sidebar-footer">
            <span class="sidebar-footer-note">研究用途</span>
            <button
              type="button"
              class="sidebar-toggle"
              data-sidebar-toggle
              aria-expanded="true"
              aria-label="收合側欄"
            >
              <span aria-hidden="true">←</span><span class="sidebar-toggle-label">收合側欄</span>
            </button>
          </footer>
        </aside>

        <div class="app-content">
        <main id="dashboard-main" tabindex="-1">
        <div id="panel-overview" class="tab-panel" role="tabpanel" aria-labelledby="tab-overview" data-tab-panel="overview" tabindex="-1">
        <section id="freshness-banner" class="freshness-banner" aria-label="研究資料更新狀態" data-tab-section="overview"></section>
        <section class="hero" data-tab-section="overview">
          <div class="hero-main">
            <span class="eyebrow">投資摘要 / ${escapeHtml(recommendation.run_id)}</span>
            <h1>市場研究，<span>一個可稽核的決策。</span></h1>
            <p class="hero-lede">
              十個專業研究角色與兩位批判者，把市場觀點壓縮成一份
              可驗證的目標配置。
            </p>
            <div class="hero-strip">
              <span class="pill">資料截止 ${escapeHtml(dateTime(recommendation.data_cutoff))}</span>
              <span class="pill">風險 ${escapeHtml(decisionLabel(recommendation.risk_level))}</span>
              <span class="pill">主動研究配置 ${escapeHtml(percent(investedWeight))}</span>
              <span class="pill">${escapeHtml(hasNewTrade ? "本輪含調整建議" : "本輪無新交易建議")}</span>
              <span class="pill">定價基準 ${escapeHtml(rebalance.pricing_session || "未提供")}</span>
            </div>
          </div>
          <aside class="hero-side">
            <div
              class="score-orbit"
              style="--score-angle:${escapeHtml(scoreAngle)}"
              aria-label="委員立場共識 ${escapeHtml(recommendation.model_score)}，滿分 100"
            >
              <span class="score-number">${escapeHtml(modelScore)}<small>/100</small></span>
              <span class="score-caption">委員方向共識度</span>
            </div>
            <div class="score-explainer">
              <strong>${escapeHtml(scoreBand)}</strong>
              <p>${escapeHtml(scoreReason)}</p>
              <small>分數越高，代表委員方向越一致，且沒有維持中的批判否決。</small>
            </div>
          </aside>
        </section>

        <section class="metrics" aria-label="投資組合總覽" data-tab-section="overview">
          <article class="metric">
            <span class="metric-label">本輪市場立場</span>
            <strong class="metric-value">${escapeHtml(decisionLabel(recommendation.market_stance))}</strong>
            <span class="metric-foot">研究方向，不代表交易指令</span>
          </article>
          <article class="metric">
            <span class="metric-label">風險資產</span>
            <strong class="metric-value">${percent(investedWeight)}</strong>
            <span class="metric-foot">本輪研究配置比例</span>
          </article>
          <article class="metric">
            <span class="metric-label">預留現金</span>
            <strong class="metric-value">${percent(cash?.target_weight || 0)}</strong>
            <span class="metric-foot">可依下一輪研究調整</span>
          </article>
          <article class="metric">
            <span class="metric-label">委員會</span>
            <strong class="metric-value">${escapeHtml(committeeSize)}</strong>
            <span class="metric-foot">${escapeHtml(committee.summary_counts?.proposals ?? committee.proposals.length)} 位研究員 · ${escapeHtml(committee.summary_counts?.critiques ?? committee.critiques.length)} 份批判</span>
          </article>
        </section>

        <section class="terminal-grid" aria-label="彭博風格策略分析" data-tab-section="overview">
          <article class="terminal-card health-terminal">
            <div class="terminal-card-head">
              <div>
                <span class="section-kicker">配置風險重點</span>
                <h2>配置防護評估</h2>
              </div>
              <div class="health-score grade-${escapeHtml(health.grade)}">
                <strong>${escapeHtml(health.score)}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <p>${escapeHtml(healthGradeLabel(health.grade))}</p>
            <div class="health-components">
              ${health.components
                .map(
                  (item) => `
                    <div>
                      <span>${escapeHtml(item.component)}</span>
                      <div class="health-bar"><i style="--health-width:${escapeHtml((Number(item.score) / Number(item.maximum)) * 100)}%"></i></div>
                      <strong>${escapeHtml(item.score)} / ${escapeHtml(item.maximum)}</strong>
                    </div>`,
                )
                .join("")}
            </div>
          </article>

          <article class="terminal-card performance-terminal">
            <div class="terminal-card-head">
              <div>
                <span class="section-kicker">風險調整分析</span>
                <h2>績效統計 ${info("績效統計", "本區是模擬策略的完成交易日觀察值，不是實際交易結果或未來報酬保證。")}</h2>
              </div>
              <span class="research-status ${escapeHtml(analyticsPerformance.sample_status)}">${escapeHtml(performanceSampleLabel(analyticsPerformance.sample_status, analyticsPerformance.completed_intervals))}</span>
            </div>
            <div class="terminal-stats">
              <div><span>淨累積報酬（估計成本後）${info("淨累積報酬", "從起始模擬淨值到目前的變動，扣除已建模的估計交易摩擦；稅務與未建模成本不包含在內。")}</span><strong>${statistic(analyticsPerformance.net_total_return_percent, "%")}</strong></div>
              <div><span>累積報酬（未扣成本）${info("累積報酬", "從起始模擬淨值到目前的毛報酬率，尚未扣除交易摩擦。")}</span><strong>${statistic(analyticsPerformance.total_return_percent, "%")}</strong></div>
              <div><span>淨最大回撤${info("淨最大回撤", "觀察期間內，淨模擬淨值從先前高點到後續低點的最大跌幅；不是最大可能損失。")}</span><strong>${statistic(analyticsPerformance.net_maximum_drawdown_percent, "%")}</strong></div>
              <div><span>同步 SPY／最強基準${info("同步 SPY／最強基準", "SPY 是主要比較基準；最強基準是 SPY、QQQ、IWM、DIA、VTI 中同期報酬最高者。只使用與每個模擬評價點同日封存的收盤資料，缺少任一端資料就不比較。")}</span><strong>${statistic(returnObjective.primary_benchmark_return_percent, "%")} / ${statistic(returnObjective.strongest_benchmark_return_percent, "%")}</strong></div>
              <div><span>超越最強基準${info("超越最強基準", "同期淨模擬報酬減去比較組內最強基準的報酬。這是當前觀察期的相對結果，並非未來超額報酬的保證。")}</span><strong>${statistic(returnObjective.excess_return_vs_strongest_benchmark_percent, "%")}</strong></div>
              <div><span>年化報酬／24%目標${info("年化報酬／24%目標", "把目前同步完成交易日的淨模擬報酬換算為每年速度；24% 是研究目標，不是預測或承諾。短樣本的年化換算波動很大，不應視為年度結果。")}</span><strong>${statistic(returnObjective.latest_annual_strategy_return_percent, "%")} / ${statistic(returnObjective.annualized_target_percent, "%")}</strong></div>
              <div><span>基準資料狀態${info("基準資料狀態", "「可比較」表示 SPY 至少有兩個與模擬評價同日封存的收盤資料，且比較組可計算；「部分資料」表示不足以做完整同期比較，數值會保留為不可用而非補零。")}</span><strong>${escapeHtml(returnObjective.benchmark_status === "ready" ? "可比較" : returnObjective.benchmark_status === "missing" ? "尚無同步資料" : "部分資料")}</strong></div>
              <div><span>完成交易日區間${info("完成交易日區間", "相鄰兩個已完成市場交易日形成一個報酬區間；同日的重複評價與連續相同估值不重複計入。區間越少，統計數字越容易受單日波動影響。")}</span><strong>${escapeHtml(analyticsPerformance.completed_intervals)}</strong></div>
              <div><span>夏普比率／日區間勝率${info("夏普比率／日區間勝率", "夏普比率以每日區間平均報酬、每日區間波動與一年 252 個交易日換算；勝率是正報酬區間除以全部完成區間。兩者只反映目前短樣本觀察，樣本不足或波動為零時會顯示不可用。")}</span><strong>${statistic(analyticsPerformance.sharpe_ratio)} / ${statistic(analyticsPerformance.win_rate_percent, "%")}</strong></div>
            </div>
            <p class="methodology-note">${escapeHtml(analyticsPerformance.methodology)}</p>
          </article>
        </section>

        ${renderExposurePanel()}
        ${renderKpiPanel()}
        ${renderPhysicalRiskPanel()}
        ${renderGeopoliticalRiskPanel()}

        <div class="dashboard-grid">
          <section class="panel leaderboard" id="leaderboard" data-tab-section="overview">
            <header class="panel-header leaderboard-header">
              <div>
                <span class="section-kicker">研究員判斷追蹤</span>
                <h2>研究員判斷與結果追蹤</h2>
              </div>
              ${dashboardAnalytics.agent_leaderboard.length > LEADERBOARD_VISIBLE_LIMIT
                ? `<button type="button" class="leaderboard-more" data-leaderboard-more aria-expanded="false">
                    顯示更多
                  </button>`
                : ""}
            </header>
            <div class="table-wrap leaderboard-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>研究員</th>
                    <th>提案數${info("提案數", "提交結構化研究提案的累計次數；它不等於已產生市場結果的次數。")}</th>
                    <th>方向命中／已評估${info("方向命中／已評估", "以相鄰研究期的市場方向評估，左側是方向判斷符合的次數，右側是已有後續市場快照可評估的次數；不是個別標的或實際交易的獲利勝率。")}</th>
                    <th>方向命中率${info("方向命中率", "方向命中數除以已評估次數。尚無後續市場快照時無法計算，會顯示不可用而不是 0%。")}</th>
                    <th>平均自評信心${info("平均自評信心", "研究員提交提案時的平均自評信心；它不是機率預測，也不代表已驗證的績效。")}</th>
                    <th>評估狀態${info("評估狀態", "「待評估」是已有提案但尚未有下一個相鄰市場快照的次數。狀態只說明樣本累積，不會改變投票權重或配置決策。")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboardAnalytics.agent_leaderboard
                    .map(
                      (item, index) => `
                        <tr${index >= LEADERBOARD_VISIBLE_LIMIT ? ' hidden data-leaderboard-extra="true"' : ""}>
                          <td>${escapeHtml(item.rank)}</td>
                          <td>${agentLink(item.agent)}</td>
                          <td>${escapeHtml(item.participation_calls)}</td>
                          <td>${item.evaluated_calls ? `${escapeHtml(item.correct_calls)} / ${escapeHtml(item.evaluated_calls)}` : "尚無可驗證結果"}</td>
                          <td>${statistic(item.hit_rate_percent, "%")}</td>
                          <td>${statistic(item.average_confidence)}</td>
                          <td><span class="research-status ${escapeHtml(item.status)}">${escapeHtml(leaderboardStatusLabel(item))}</span></td>
                        </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </section>

          <section class="panel strategy" id="portfolio" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">短期配置</span>
                <h2>本輪研究配置</h2>
              </div>
              <span class="panel-meta">建議版本 ${escapeHtml(recommendation.run_id)}</span>
            </header>
            <p class="panel-meta">${allocationScopeNote(recommendation)}</p>
            <div class="simulation-capital-panel" aria-labelledby="simulation-capital-title">
              <div>
                <span class="section-kicker">本機換算</span>
                <h3 id="simulation-capital-title">選擇模擬本金</h3>
                <p>
                  配置、報酬、回撤與風控判斷都以比例為準；本金只在瀏覽器中換算顯示金額，不寫入公開資料。
                </p>
              </div>
              <label class="simulation-capital-input">
                <span>模擬本金（USD）</span>
                <input
                  type="number"
                  inputmode="decimal"
                  min="1"
                  step="100"
                  placeholder="例如 10000"
                  data-simulation-capital
                  aria-describedby="simulation-capital-help"
                />
              </label>
              <div class="simulation-capital-actions" aria-label="常用模擬本金">
                ${simulationCapitalExamples
                  .map(
                    (value) => `
                      <button type="button" data-simulation-capital-choice="${escapeHtml(value)}">
                        ${escapeHtml(money(value))}
                      </button>`,
                  )
                  .join("")}
              </div>
              <p id="simulation-capital-help" class="simulation-capital-help">
                變更本金只改變本頁金額換算，不改變任何標的權重或研究結論。
              </p>
            </div>
            <div class="strategy-layout">
              <div class="allocation-visual">
                <div class="donut" style="--donut:${escapeHtml(donut)}">
                  <div class="donut-center">
                    <strong>100%</strong>
                    <span>配置比例</span>
                  </div>
                </div>
                <div class="legend">
                  ${recommendation.allocations
                    .map(
                      (item, index) => `
                        <div class="legend-row">
                          <span class="swatch" style="--swatch:${colors[index % colors.length]}"></span>
                          <strong>${escapeHtml(item.symbol)}</strong>
                          <span>${percent(item.target_weight)}</span>
                        </div>`,
                    )
                    .join("")}
                </div>
              </div>
              <div class="table-wrap strategy-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>標的</th>
                      <th>目標比例</th>
                      <th>所選本金換算</th>
                      <th>類型</th>
                      <th>研究／風控備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recommendation.allocations
                      .map(
                        (item) => `
                          <tr>
                            <td data-label="標的">${symbolLink(item.symbol)}</td>
                            <td data-label="目標比例">${percent(item.target_weight)}</td>
                            <td data-label="所選本金換算" data-sim-amount data-weight="${escapeHtml(item.target_weight)}">輸入本金後換算</td>
                            <td data-label="類型"><span class="asset-type">${escapeHtml(assetTypeLabel(item.asset_type))}</span></td>
                            <td data-label="研究／風控備註" class="allocation-note">${glossaryText(item.note)}</td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
            ${riskPlans.length
              ? `<section class="position-risk-summary" aria-label="模擬配置轉換與部位風險摘要">
                  <header>
                    <div>
                      <span class="section-kicker">模擬配置轉換</span>
                      <h3>部位風險摘要 ${info("部位風險摘要", "本區比較前一輪與本輪模擬目標比例，並列出可量化與不可量化的風險輸入；不是實際券商持倉。")}</h3>
                    </div>
                    <p>金額只依上方所選模擬本金換算；核心判斷保存為比例與百分比。</p>
                  </header>
                  <div class="position-risk-cards">${riskPlans.map(riskPlanCard).join("")}</div>
                </section>`
              : ""}
          </section>

          ${renderEventCalendar(market.event_calendar, { asOf: recommendation.data_cutoff, renderSymbol: symbolLink })}
          ${renderMacroState(market.macro_state, { asOf: recommendation.data_cutoff, renderSymbol: symbolLink })}

          <section class="panel" id="reasons" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">委員會理由</span>
                <h2>投資理由</h2>
              </div>
              <span class="panel-meta">${investmentReasons.length} 項</span>
            </header>
            <div class="reasons-grid">
              ${investmentReasons.length ? investmentReasons.map(reasonCard).join("") : '<p>本輪沒有可追溯的投資理由；資料不足不代表偏多或偏空。</p>'}
            </div>
          </section>
          ${renderDecisionEvidencePanel(recommendation, { renderSymbol: symbolLink })}
          ${uniquePolicyReasons.length ? `
          <section class="panel" id="policy-explanations" data-tab-section="overview">
            <header class="panel-header">
              <div><span class="section-kicker">風控紀錄</span><h2>風控與動作說明</h2></div>
              <span class="panel-meta">${uniquePolicyReasons.length} 項</span>
            </header>
            <div class="reasons-grid risk-policy-grid">${uniquePolicyReasons.map(policyReasonCard).join("")}</div>
          </section>` : ""}
          ${renderScenarioStress(recommendation, { renderSymbol: symbolLink })}


        </div>
        </div>

        <div id="panel-agent-intel" class="tab-panel" role="tabpanel" aria-labelledby="tab-agent-intel" data-tab-panel="agent-intel" tabindex="-1" hidden>
          ${renderAgentIntelligencePanel(committee, market)}
        </div>

        <div id="panel-glossary" class="tab-panel" role="tabpanel" aria-labelledby="tab-glossary" data-tab-panel="glossary" tabindex="-1" hidden>
          ${renderGlossary()}
        </div>

        <div id="panel-committee" class="tab-panel" role="tabpanel" aria-labelledby="tab-committee" data-tab-panel="committee" tabindex="-1" hidden>

          <section class="panel committee" id="committee" data-tab-section="committee">
          <header class="panel-header">
            <div>
              <span class="section-kicker">委員會重播 / 完整紀錄</span>
              <h2>委員會內容</h2>
            </div>
            <span class="panel-meta">${escapeHtml(decisionLabel(committee.mode))}</span>
          </header>
            <div class="committee-intro">
              <p>
                每位研究員的觀點、理由、風險與失效條件均完整保留。
                點擊研究員名稱可查看其職責、資訊範圍、存在目的與目標。
              </p>
            </div>
            ${
              committee.decision_origin === "policy_override"
                ? `
                  <div class="policy-override-note">
                    <strong>本輪決策備註</strong>
                    <ul>${renderList(committee.policy_override_notes, "未提供", glossaryText)}</ul>
                  </div>`
                : ""
            }
            <div class="committee-replay" aria-label="委員會重播">
              <article>
                <span>01</span>
                <strong>資料封存</strong>
                <small>${escapeHtml(dateTime(recommendation.data_cutoff))}</small>
              </article>
              <article>
                <span>02</span>
                <strong>獨立提案</strong>
                <small>${escapeHtml(committee.proposals.length)} 位研究員</small>
              </article>
              <article>
                <span>03</span>
                <strong>反方批判</strong>
                <small>${escapeHtml(committee.critiques.length)} 份批判</small>
              </article>
              <article>
                <span>04</span>
                <strong>點名回應</strong>
                <small>
                  ${escapeHtml((committee.cross_examination_responses || []).length)} 則回應 ·
                  ${escapeHtml((committee.critique_resolutions || []).length)} 次裁決
                </small>
              </article>
              <article>
                <span>05</span>
                <strong>最終決策</strong>
                <small>${escapeHtml(decisionLabel(committee.final_decision.market_stance))}</small>
              </article>
            </div>
            ${renderCommitteeChat(committee, recommendation)}
            <div class="committee-list proposal-list">
              ${committee.proposals
                .map(
                  (proposal) => `
                    <details class="committee-card">
                      <summary>
                        <span class="agent-name">
                          ${agentLink(proposal.agent)}
                          <span>${escapeHtml((proposal.arguments || [])[0] || "查看完整內容")}</span>
                        </span>
                        <span class="stance">${escapeHtml(decisionLabel(proposal.stance))}</span>
                        <span class="confidence">${escapeHtml(proposal.confidence)}/100</span>
                      </summary>
                      <div class="committee-card-body">
                        <section class="committee-block">
                          <h3>偏好標的</h3>
                          <div class="asset-tags">${renderAssetTags(proposal.preferred_assets)}</div>
                        </section>
                        <div class="committee-columns">
                          <section class="committee-block">
                            <h3>完整論點</h3>
                            <ol>${renderList(proposal.arguments, "未提供", glossaryText)}</ol>
                          </section>
                          <section class="committee-block">
                            <h3>主要風險</h3>
                            <ul>${renderList(proposal.risks, "未提供", glossaryText)}</ul>
                          </section>
                          <section class="committee-block">
                            <h3>失效條件</h3>
                            <ul>${renderList(proposal.invalidation_conditions, "未提供", glossaryText)}</ul>
                          </section>
                        </div>
                      </div>
                    </details>`,
                )
                .join("")}
            </div>

            <div class="committee-subsection">
              <header class="subsection-header">
                <span class="section-kicker">交叉質詢</span>
                <h3>${agentLink("risk")} 與 ${agentLink("devil_advocate")} 批判</h3>
              </header>
              <div class="critique-grid">
                ${committee.critiques
                  .map(
                    (critique) => `
                      <article class="critique-card">
                        <div class="critique-heading">
                          ${agentLink(critique.reviewer)}
                          <span class="veto-chip ${critique.veto_recommended ? "veto" : ""}">
                            ${critique.veto_recommended ? "建議否決" : "不否決"}
                          </span>
                        </div>
                        <div class="asset-tags">${renderAssetTags(critique.challenged_agents)}</div>
                        <section class="committee-block emphasis">
                          <h3>最強反對意見</h3>
                          <p>${escapeHtml(critique.strongest_objection)}</p>
                        </section>
                        <section class="committee-block">
                          <h3>隱含假設</h3>
                          <ul>${renderList(critique.hidden_assumptions, "未提供", glossaryText)}</ul>
                        </section>
                        <section class="committee-block">
                          <h3>要求修正</h3>
                          <ul>${renderList(critique.required_changes, "未提供", glossaryText)}</ul>
                        </section>
                      </article>`,
                  )
                  .join("")}
              </div>
              ${
                (committee.reconciliation_responses || []).length
                  ? `
                    <div class="reconciliation-section">
                      <header class="subsection-header">
                        <span class="section-kicker">協商關卡</span>
                        <h3>否決後協商與第二次裁決</h3>
                      </header>
                      <div class="reconciliation-grid">
                        ${(committee.reconciliation_responses || [])
                          .map((response, index) => {
                            const resolution = (committee.critique_resolutions || [])[index];
                            const audit = (committee.final_decision_audits || []).find(
                              (item) => item.reviewer === response.reviewer,
                            );
                            return `
                              <article class="critique-card reconciliation-card">
                                <div class="critique-heading">
                                  ${agentLink(response.reviewer)}
                                  <span class="veto-chip ${resolution?.veto_maintained ? "veto" : ""}">
                                    ${
                                      resolution?.consensus_reached
                                        ? "已取得共識"
                                        : resolution?.veto_maintained
                                          ? "維持否決"
                                          : "等待裁決"
                                    }
                                  </span>
                                </div>
                                <div class="committee-columns">
                                  <section class="committee-block">
                                    <h3>提案者承認與修正</h3>
                                    <ul>${renderList(response.conceded_points, "未提供", glossaryText)}</ul>
                                    <ul>${renderList(response.proposed_changes, "未提供", glossaryText)}</ul>
                                  </section>
                                  <section class="committee-block">
                                    <h3>證據式反駁</h3>
                                    <ul>${renderList(response.rebuttals, "未提供", glossaryText)}</ul>
                                  </section>
                                  <section class="committee-block">
                                    <h3>第二次裁決</h3>
                                    <p>${escapeHtml(resolution?.resolution_summary || "尚無裁決")}</p>
                                    <ul>${renderList(resolution?.binding_constraints, "沒有未解除的硬性限制")}</ul>
                                  </section>
                                </div>
                                ${
                                  audit
                                    ? `<p class="final-audit ${audit.decision_acceptable ? "accepted" : "rejected"}">
                                        最終審核：${escapeHtml(audit.audit_summary)}
                                      </p>`
                                    : ""
                                }
                              </article>`;
                          })
                          .join("")}
                      </div>
                    </div>`
                  : ""
              }
            </div>

            <div class="cio-decision">
              <header class="cio-header">
                <div>
                  <span class="section-kicker">最終整合</span>
                  <h3>${agentLink("cio")} · 最終結論</h3>
                </div>
                <div class="cio-score">
                  <strong>${escapeHtml(committee.final_decision.model_score)}</strong>
                  <span>委員共識度</span>
                </div>
              </header>
              <div class="decision-facts">
                <span>市場立場 <strong>${escapeHtml(decisionLabel(committee.final_decision.market_stance))}</strong></span>
                <span>風險 <strong>${escapeHtml(decisionLabel(committee.final_decision.risk_level))}</strong></span>
                <span>風險關卡 <strong>${escapeHtml(committee.final_decision.risk_veto ? "否決" : "通過")}</strong></span>
              </div>
              <p class="decision-horizon">每次取得新資料後重新檢視，不設定固定持有天數限制。</p>
              ${
                committee.final_decision.veto_reason
                  ? `<p class="veto-reason">${escapeHtml(committee.final_decision.veto_reason)}</p>`
                  : ""
              }
              <div class="final-allocation-grid">
                ${committee.final_decision.allocations
                  .map(
                    (item) => `
                      <article class="final-allocation">
                        ${symbolLink(item.symbol)}
                        <span>${percent(item.target_weight)}</span>
                        <small>${glossaryText(item.note)}</small>
                      </article>`,
                  )
                  .join("")}
              </div>
            </div>
            ${renderAgentDirectory()}
          </section>

          <section class="panel performance" id="performance" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">研究走勢</span>
                <h2>假設策略報酬率走勢：研究配置後，結果怎麼變化？</h2>
              </div>
            </header>
            ${buildPerformanceChart(performance.points, performance)}
          </section>

          <section class="panel evidence" id="evidence" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">證據引擎</span>
                <h2>市場、財報與來源證據</h2>
              </div>
            </header>
            ${
              market.regime
                ? `
                  <div class="regime-grid">
                    <article><span>趨勢狀態</span><strong>${escapeHtml(decisionLabel(market.regime.trend))}</strong></article>
                    <article><span>波動狀態</span><strong>${escapeHtml(decisionLabel(market.regime.volatility))}</strong></article>
                    <article><span>利率狀態</span><strong>${escapeHtml(decisionLabel(market.regime.rates))}</strong></article>
                  </div>`
                : `<p class="methodology-note">這份舊資料尚未包含確定性市場狀態；下一次正式委員會會開始產生。</p>`
            }
            ${
              (market.features || []).length
                ? `
                  <div class="table-wrap evidence-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>標的</th>
                          <th>短線動能<br /><small>5日</small></th>
                          <th>月度趨勢<br /><small>20日</small></th>
                          <th>趨勢位置<br /><small>距20日均線</small></th>
                          <th>波動風險<br /><small>20日年化</small></th>
                          <th>成交確認<br /><small>20日量比</small></th>
                          <th>動能狀態<br /><small>RSI 14日</small></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${market.features
                          .map(
                            (item) => `
                              <tr>
                                <td>${symbolLink(item.symbol)}</td>
                                <td class="numeric">${escapeHtml(tablePercent(item.return_5d_percent))}</td>
                                <td class="numeric">${escapeHtml(tablePercent(item.return_20d_percent))}</td>
                                <td class="numeric">${escapeHtml(tablePercent(item.distance_from_ma20_percent))}</td>
                                <td class="numeric">${escapeHtml(tablePercent(item.volatility_20d_annualized_percent))}</td>
                                <td class="numeric">${escapeHtml(tableNumber(item.volume_ratio_20d, 1))}×</td>
                                <td class="numeric">${escapeHtml(tableNumber(item.rsi14, 0))}</td>
                              </tr>`,
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>`
                : ""
            }
            ${
              (market.fundamental_facts || []).length
                ? `
                  <details class="evidence-details">
                    <summary>查看 SEC 結構化財務事實</summary>
                    <div class="table-wrap">
                      <table>
                        <thead><tr><th>標的</th><th>指標</th><th>數值</th><th>期間</th><th>申報</th></tr></thead>
                        <tbody>
                          ${market.fundamental_facts
                            .map(
                              (fact) => `
                                <tr>
                                  <td>${symbolLink(fact.symbol)}</td>
                                  <td><a href="${escapeHtml(fact.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(fact.metric)}</a></td>
                                  <td>${escapeHtml(fact.value)} ${escapeHtml(fact.unit)}</td>
                                  <td>${escapeHtml(fact.period_end)}</td>
                                  <td>${escapeHtml(fact.form)} · ${escapeHtml(fact.filed_at)}</td>
                                </tr>`,
                            )
                            .join("")}
                        </tbody>
                      </table>
                    </div>
                  </details>`
                : ""
            }
          </section>

          <section class="panel learning" id="market-survey" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">有來源市場調查</span>
                <h2>本輪市場與全球情勢調查</h2>
              </div>
              <span class="panel-meta">${escapeHtml(
                market.research_mode === "non_trading_day_survey"
                  ? "休市日全面調查"
                  : market.research_mode === "completed_session_review"
                    ? "完成交易日複核"
                    : "等待下一輪調查",
              )}<br />${escapeHtml(dateTime(market.research_generated_at || market.generated_at))}</span>
            </header>
            ${
              (market.research_evidence || []).length
                ? `
                  <div class="learning-grid">
                    ${market.research_evidence
                      .slice(0, 3)
                      .map(
                        (item) => `
                          <article class="learning-card market-survey-card">
                            <h3>${escapeHtml(item.title)}</h3>
                            <p class="market-survey-summary">${escapeHtml(item.summary)}</p>
                            <a class="market-survey-source" href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">查看來源</a>
                          </article>`,
                      )
                      .join("")}
                  </div>`
                : `
                  <div class="readiness-verdict research_only">
                    <strong>尚無完成的即時網路調查</strong>
                    <p>目前顯示上一份成功配置；下一輪端到端流程完成後才會加入可驗證來源。</p>
                  </div>`
            }
          </section>

          <section class="panel learning" id="learning" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">白話研究回顧</span>
                <h2>這輪研究，我們知道了什麼？</h2>
              </div>
              <span class="panel-meta">${escapeHtml(researchStatusLabel(learning.verdict))}<br />${escapeHtml(dateTime(learning.evaluation_cutoff))}</span>
            </header>
            <p class="methodology-note">這裡不是技術檢查表，而是把研究過程翻成白話：先看市場出現了什麼，再說明目前能得出的結論，以及下一次會怎麼把答案變得更可靠。</p>
            <div class="learning-grid">
              ${learning.lessons
                .map(
                  (lesson) => `
                    <article class="learning-card">
                      <h3>${escapeHtml(lesson.title)}</h3>
                      <p><strong>我們看到什麼</strong>${escapeHtml(lesson.evidence)}</p>
                      <p><strong>接下來怎麼做</strong>${escapeHtml(lesson.implication)}</p>
                      <div class="reason-meta">
                        <span>信心 ${escapeHtml(lesson.confidence)}</span>
                        <span>${escapeHtml(lesson.affected_assets.join(" · "))}</span>
                      </div>
                    </article>`,
                )
                .join("")}
            </div>
          </section>

          <section class="panel research-journal" id="research-journal" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">研究怎麼累積</span>
                <h2>用白話看：想法、觀察與下一步</h2>
              </div>
              <span class="panel-meta">${escapeHtml(readinessLabel(researchJournal.readiness))}<br />${escapeHtml(dateTime(researchJournal.data_cutoff))}</span>
            </header>
            <div class="readiness-verdict ${researchJournal.readiness}">
              <strong>本輪研究重點：走勢、配置與風險</strong>
              <p>${escapeHtml(researchJournal.readiness_summary)}</p>
            </div>
            <div class="journal-layout">
              <section class="journal-column">
                <header>
                  <span>01</span>
                  <h3>我們想確認什麼</h3>
                </header>
                <div class="journal-cards">
                  ${researchJournal.assumptions
                    .map(
                      (item) => `
                        <article class="journal-card">
                          <div class="journal-card-head">
                            <strong>${escapeHtml(item.hypothesis_id)}</strong>
                            <span class="research-status ${escapeHtml(item.status)}">${escapeHtml(researchStatusLabel(item.status))}</span>
                          </div>
                          <p>${escapeHtml(item.statement)}</p>
                          <small><strong>我們會怎麼看</strong>${escapeHtml(item.observable_test)}</small>
                          <small><strong>目前看到的情況</strong>${escapeHtml(item.evidence)}</small>
                        </article>`,
                    )
                    .join("")}
                </div>
              </section>
              <section class="journal-column">
                <header>
                  <span>02</span>
                  <h3>目前看到什麼</h3>
                </header>
                <div class="journal-cards">
                  ${researchJournal.validations
                    .map(
                      (item) => `
                        <article class="journal-card">
                          <div class="journal-card-head">
                            <strong>證據</strong>
                            <span class="research-status ${escapeHtml(item.result)}">${escapeHtml(researchStatusLabel(item.result))}</span>
                          </div>
                          <p>${escapeHtml(item.claim)}</p>
                          <small>${escapeHtml(item.evidence)}</small>
                          ${renderSourceLinks(item.source_urls)}
                        </article>`,
                    )
                    .join("")}
                </div>
              </section>
              <section class="journal-column lessons">
                <header>
                  <span>03</span>
                  <h3>這次帶走的重點</h3>
                </header>
                <ol class="journal-list">
                  ${researchJournal.lessons
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join("")}
                </ol>
              </section>
            </div>
          </section>

          <section class="panel" id="risk" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">風險提醒</span>
                <h2>什麼情況需要重新看？</h2>
              </div>
              <span class="panel-meta">${escapeHtml(committee.final_decision.risk_veto ? "暫停調整" : "目前可執行")}<br />風險檢查</span>
            </header>
            <div class="risk-grid">
              <div class="risk-box">
                <h3>要先知道的風險</h3>
                <ul>${recommendation.major_risks.map((item) => `<li>${renderTickerText(item)}</li>`).join("")}</ul>
              </div>
              <div class="risk-box">
                <h3>何時重新檢查</h3>
                <ul>${recommendation.invalidation_conditions.map((item) => `<li>${renderTickerText(item)}</li>`).join("")}</ul>
              </div>
            </div>
          </section>
        </div>
        </main>

    <footer class="footer">
      <span>資料更新 ${escapeHtml(dateTime(system.updated_at))}</span>
      <a href="https://github.com/JackyTsai70113/ai-investment-committee/commit/${escapeHtml(system.latest_commit)}" target="_blank" rel="noopener noreferrer">
        來源提交 ${escapeHtml(String(system.latest_commit || "").slice(0, 7))}
      </a>
    </footer>
    </div>
  </div>
    `;
    const overviewPanel = root.querySelector('[data-tab-panel="overview"]');
    const committeePanel = root.querySelector('[data-tab-panel="committee"]');
    if (overviewPanel && committeePanel) {
      [...committeePanel.children]
        .filter((child) => child.dataset.tabSection === "overview")
        .forEach((section) => overviewPanel.append(section));
    }
    localizeRenderedText(root);
  root.querySelectorAll(".info-popover").forEach((element) => {
    let openedByHover = false;
    element.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && !element.open) {
        openedByHover = true;
        element.open = true;
      }
    });
    element.addEventListener("pointerleave", () => {
      if (openedByHover) {
        element.open = false;
        openedByHover = false;
      }
    });
    element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && element.open) {
        element.open = false;
        openedByHover = false;
        element.querySelector("summary")?.focus();
      }
      });
    });
    root.querySelectorAll(".table-wrap").forEach((tableWrap) => {
      tableWrap.tabIndex = 0;
    });
    root.querySelectorAll("[data-leaderboard-more]").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") === "true";
        root.querySelectorAll("[data-leaderboard-extra]").forEach((row) => {
          row.hidden = expanded;
        });
        button.setAttribute("aria-expanded", String(!expanded));
        button.textContent = expanded ? "顯示更多" : "顯示更少";
      });
    });
    const capitalInput = root.querySelector("[data-simulation-capital]");
    const updateSimulationAmounts = () => {
      const capital = simulationCapital(capitalInput?.value);
      root.querySelectorAll("[data-sim-amount]").forEach((node) => {
        node.textContent = simulatedMoney(node.dataset.weight, capital);
      });
      root.querySelectorAll("[data-sim-risk]").forEach((node) => {
        if (!node.dataset.baseFraction && !node.dataset.stressFraction) {
          node.textContent = "需要量化後才換算";
          return;
        }
        const base = node.dataset.baseFraction ? simulatedMoney(node.dataset.baseFraction, capital) : "未知";
        const stress = node.dataset.stressFraction ? simulatedMoney(node.dataset.stressFraction, capital) : "未知";
        node.textContent = capital === null ? "輸入本金後換算" : `基本 ${base}／跳空 ${stress}`;
      });
    };
    capitalInput?.addEventListener("input", updateSimulationAmounts);
    root.querySelectorAll("[data-simulation-capital-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!capitalInput) return;
        capitalInput.value = button.dataset.simulationCapitalChoice || "";
        updateSimulationAmounts();
      });
    });
    updateSimulationAmounts();
    installPerformanceChart(root, performance.points);
    localizeRenderedText(root);
    const loader = createDataLoader(dataBase);
    installDecisionEvidence(root, recommendation, loader.loadDecisionComparison);
    installFreshness(root, recommendation, freshnessCalendar, healthSignal, loader.loadHealthSignal);
    const showLazyTabError = (target, error) => {
      const section = root.querySelector(`[data-tab-section="${target}"]`);
      if (!section) return;
      section.hidden = false;
      section.innerHTML = `<section class="error-state" role="alert"><span class="section-kicker">資料載入失敗</span><h2>無法載入此區段</h2><p>${escapeHtml(error.message)}</p><button type="button" data-retry-lazy-tab="${target}">重試</button></section>`;
      section.querySelector("[data-retry-lazy-tab]")?.addEventListener("click", () => {
        root.querySelector(`[data-tab-target="${target}"]`)?.click();
      });
    };
    const restoreLazyTab = (target) => {
      const trigger = root.querySelector(`[data-tab-target="${target}"]`);
      trigger?.click();
      if (!window.matchMedia("(max-width: 640px)").matches) trigger?.focus();
    };
    const activateLazyTab = (target) => {
      if (target === "committee" && committee.summary_counts) {
        Promise.all([loader.loadCommitteePayload(), import("./committee.js")])
          .then(([fullCommittee, module]) => {
            bootstrapDashboard(
              root,
              {
                ...payload,
                committee: {
                  ...fullCommittee,
                  role_insights: committee.role_insights,
                  review_outcomes: committee.review_outcomes,
                },
                committeeRendererFactory: module.createCommitteeRenderer,
              },
              dataBase,
            );
            restoreLazyTab("committee");
          })
          .catch((error) => showLazyTabError("committee", error));
      }
      if (target === "agent-intel" && Object.keys(agentProfiles).length === 0) {
        loader
          .loadAgentProfiles()
          .then((profiles) => {
            bootstrapDashboard(root, { ...payload, agentProfiles: profiles }, dataBase);
            restoreLazyTab("agent-intel");
          })
          .catch((error) => showLazyTabError("agent-intel", error));
      }
    };
    installTabNavigation(root, { onActivate: activateLazyTab });
  };

  render(payload);
}
