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
import { createDataLoader } from "../data.js";

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
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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
    thesisBook,
    earningsReviews,
    marketIntelligence,
    extensionStatus,
  }) => {
    const overview = createOverviewModel({ dashboardAnalytics, committee, recommendation });
    const { isLive, investedWeight, cash, modelScore, scoreBand, scoreReason, scoreAngle, donut, committeeSize, health, analyticsPerformance, returnObjective } = overview;
    const riskPlans = (recommendation.position_risk_plans || []).filter(
      (plan) => plan.status !== "exempt",
    );
    const hasNewTrade = (rebalance.instructions || []).some(
      (instruction) => instruction.action !== "hold",
    );
    const riskPlanStatus = (plan) =>
      plan.status === "quantified" ? "已量化" : "未量化（不可視為零風險）";
    const riskPlanValues = (plan) =>
      plan.status === "quantified"
        ? {
            base: `${money(plan.base_loss_usd)} (${percent(plan.base_loss_fraction)})`,
            reference: `${money(plan.reference_price)} / ${money(plan.invalidation_price)}`,
            stress: `${money(plan.stress_loss_usd)} (${percent(plan.stress_gap_percent)})`,
          }
        : { base: "未量化", reference: "未量化", stress: "未量化" };
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
              <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="committee" id="tab-committee" role="tab" aria-label="委員會實際內容" aria-controls="panel-committee" aria-selected="false" tabindex="-1"><span class="tab-icon" aria-hidden="true">▤</span><span class="tab-label">委員會實際內容</span></button>
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
              aria-label="模型評分 ${escapeHtml(recommendation.model_score)}，滿分 100"
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
                <h2>績效統計</h2>
              </div>
              <span class="research-status ${escapeHtml(analyticsPerformance.sample_status)}">${escapeHtml(researchStatusLabel(analyticsPerformance.sample_status))}</span>
            </div>
            <div class="terminal-stats">
              <div><span>淨累積報酬（估計成本後）</span><strong>${statistic(analyticsPerformance.net_total_return_percent, "%")}</strong></div>
              <div><span>累積報酬（未扣成本）</span><strong>${statistic(analyticsPerformance.total_return_percent, "%")}</strong></div>
              <div><span>淨最大回撤</span><strong>${statistic(analyticsPerformance.net_maximum_drawdown_percent, "%")}</strong></div>
              <div><span>同步 SPY／最強基準</span><strong>${statistic(returnObjective.primary_benchmark_return_percent, "%")} / ${statistic(returnObjective.strongest_benchmark_return_percent, "%")}</strong></div>
              <div><span>超越最強基準</span><strong>${statistic(returnObjective.excess_return_vs_strongest_benchmark_percent, "%")}</strong></div>
              <div><span>年化報酬／24%目標</span><strong>${statistic(returnObjective.latest_annual_strategy_return_percent, "%")} / ${statistic(returnObjective.annualized_target_percent, "%")}</strong></div>
              <div><span>基準資料狀態</span><strong>${escapeHtml(returnObjective.benchmark_status === "ready" ? "可比較" : "部分資料")}</strong></div>
              <div><span>完成交易日區間</span><strong>${escapeHtml(analyticsPerformance.distinct_completed_sessions)}</strong></div>
              <div><span>夏普比率／日區間勝率</span><strong>${statistic(analyticsPerformance.sharpe_ratio)} / ${statistic(analyticsPerformance.win_rate_percent, "%")}</strong></div>
            </div>
          </article>
        </section>

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
                    <th>參與</th>
                    <th>命中／已評估</th>
                    <th>命中率</th>
                    <th>平均信心</th>
                    <th>狀態</th>
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
                          <td>${item.evaluated_calls ? `${escapeHtml(item.correct_calls)} / ${escapeHtml(item.evaluated_calls)}` : "尚無結果"}</td>
                          <td>${statistic(item.hit_rate_percent, "%")}</td>
                          <td>${statistic(item.average_confidence)}</td>
                          <td><span class="research-status ${escapeHtml(item.status)}">${escapeHtml(researchStatusLabel(item.status))}</span></td>
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
              ? `<div class="table-wrap strategy-table-wrap risk-plan-table">
                  <table>
                    <thead><tr><th>部位風險</th><th>參考／失效價</th><th>基本損失</th><th>跳空壓力</th><th>狀態</th></tr></thead>
                    <tbody>${riskPlans.map((plan) => {
                      const values = riskPlanValues(plan);
                      return `
                      <tr>
                        <td data-label="部位風險">${symbolLink(plan.symbol)}</td>
                        <td data-label="參考／失效價">${escapeHtml(values.reference)}</td>
                        <td data-label="基本損失">${escapeHtml(values.base)}</td>
                        <td data-label="跳空壓力">${escapeHtml(values.stress)}</td>
                        <td data-label="狀態">${escapeHtml(riskPlanStatus(plan))}</td>
                      </tr>`;
                    }).join("")}</tbody>
                  </table>
                </div>`
              : ""}
          </section>

          <section class="panel" id="reasons" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">委員會理由</span>
                <h2>十大理由</h2>
              </div>
              <span class="panel-meta">10 / 10<br />結構化</span>
            </header>
            <div class="reasons-grid">
              ${recommendation.top_reasons
                .map(
                  (reason) => `
                    <article class="reason-card">
                      <span class="reason-number">${String(reason.id).padStart(2, "0")}</span>
                      <h3>${escapeHtml(reason.title)}</h3>
                      <p>${glossaryText(reason.summary)}</p>
                      <div class="reason-meta">
                        <span>${escapeHtml(decisionLabel(reason.category))}</span>
                        <span>信心 ${escapeHtml(reason.confidence)}</span>
                      </div>
                      ${renderSourceLinks(reason.source_urls)}
                    </article>`,
                )
                .join("")}
            </div>
          </section>

        </div>
        </div>

        <div id="panel-agent-intel" class="tab-panel" role="tabpanel" aria-labelledby="tab-agent-intel" data-tab-panel="agent-intel" tabindex="-1" hidden>
          ${renderAgentIntelligencePanel(market, recommendation, learning)}
        </div>

        <div id="panel-glossary" class="tab-panel" role="tabpanel" aria-labelledby="tab-glossary" data-tab-panel="glossary" tabindex="-1" hidden>
          ${renderGlossary()}
        </div>

        <div id="panel-committee" class="tab-panel" role="tabpanel" aria-labelledby="tab-committee" data-tab-panel="committee" tabindex="-1" hidden>

          <section class="panel committee" id="committee" data-tab-section="committee">
          <header class="panel-header">
            <div>
              <span class="section-kicker">委員會重播 / 完整紀錄</span>
              <h2>委員會實際內容</h2>
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
            ${renderAgentDirectory(market, recommendation, learning)}
          </section>

          <section class="panel performance" id="performance" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">研究走勢</span>
                <h2>假設策略走勢：研究配置後，結果怎麼變化？</h2>
              </div>
            </header>
            ${buildPerformanceChart(performance.points)}
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
    installPerformanceChart(root, performance.points);
    localizeRenderedText(root);
    const loader = createDataLoader(dataBase);
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
                committee: fullCommittee,
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
