import {
  assetTypeLabel,
  dateTime,
  escapeHtml,
  money,
  percent,
  preciseMoney,
} from "./formatters.js";

export function bootstrapDashboard(root, payload) {
  "use strict";

  let agentProfiles = {};
  let agentProfileOrder = [];
  const { agentProfiles: loadedAgentProfiles } = payload;
  agentProfiles = loadedAgentProfiles;
  agentProfileOrder = Object.keys(agentProfiles);
  const colors = ["#c7f15b", "#67b7ff", "#ae91ff", "#ff9864", "#7ecb83", "#f3f0d8"];
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const asList = (value) => (Array.isArray(value) ? value : []);

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

  const formatRegionLabel = (value) => String(value || "Global").trim();

  const isInternational = (evidence) =>
    String(evidence.region || "").toLowerCase() !== "us";

  const evidenceToRegionalItem = (item) => `${formatRegionLabel(item.region)}｜${item.title}`;

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

  const portfolioMix = (recommendation) => {
    const invested = recommendation.allocations
      .filter((item) => item.symbol !== "CASH")
      .reduce((total, item) => total + Number(item.target_weight), 0);
    const cash = recommendation.allocations.find((item) => item.symbol === "CASH");
    return {
      investedWeight: invested,
      cashWeight: Number(cash?.target_weight || 0),
      cashAmount: Number(cash?.target_amount_usd || 0),
    };
  };

  const buildMarketInsight = (market) => {
    const evidence = asList(market?.research_evidence);
    const international = evidence
      .filter(isInternational)
      .slice(0, 5)
      .map(evidenceToRegionalItem);
    return {
      stance: "公開資料摘要",
      summary: "以下內容來自本輪已驗證的公開市場與研究資料。",
      signals: evidence.slice(0, 5).map((item) => item.title).filter(Boolean),
      globalPulse: international,
      focus: "角色職責與資料範圍請以公開角色介紹為準。",
    };
  };

  const buildDonut = (allocations) => {
    let cursor = 0;
    const segments = allocations.map((item, index) => {
      const start = cursor;
      cursor += Number(item.target_weight) * 100;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(",")})`;
  };

  const buildPerformanceChart = (points) => {
    const safePoints = points.length
      ? points
      : [{ as_of: new Date().toISOString(), value_usd: 6000, profit_loss_usd: 0 }];
    const values = safePoints.map((item) => Number(item.value_usd));
    const timestamps = safePoints.map((item) => new Date(item.as_of).getTime());
    const valueMinimum = Math.min(...values);
    const valueMaximum = Math.max(...values);
    const valuePadding = Math.max((valueMaximum - valueMinimum) * 0.22, valueMaximum * 0.0025, 10);
    const minimum = Math.floor((valueMinimum - valuePadding) / 10) * 10;
    const maximum = Math.ceil((valueMaximum + valuePadding) / 10) * 10;
    const spread = Math.max(maximum - minimum, 1);
    const timeMinimum = Math.min(...timestamps);
    const timeMaximum = Math.max(...timestamps);
    const timeSpread = Math.max(timeMaximum - timeMinimum, 1);
    const width = 960;
    const height = 380;
    const padding = { top: 34, right: 24, bottom: 56, left: 84 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const coordinates = safePoints.map((item, index) => {
      const timestamp = timestamps[index];
      const x =
        safePoints.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + ((timestamp - timeMinimum) / timeSpread) * plotWidth;
      const y =
        padding.top + ((maximum - Number(item.value_usd)) / spread) * plotHeight;
      return { item, x, y };
    });
    const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
    const baseline = padding.top + plotHeight;
    const areaPoints = `${coordinates[0].x},${baseline} ${linePoints} ${coordinates.at(-1).x},${baseline}`;
    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      return {
        value: maximum - spread * ratio,
        y: padding.top + plotHeight * ratio,
      };
    });
    const xTickIndexes = [...new Set([0, Math.floor((safePoints.length - 1) / 2), safePoints.length - 1])];
    const latestIndex = safePoints.length - 1;
    return `
      <div class="performance-chart-shell" data-performance-chart>
        <div class="chart-tooltip" data-chart-tooltip role="status" aria-live="polite">
          <span data-chart-date>${escapeHtml(dateTime(safePoints[latestIndex].as_of))}</span>
          <strong data-chart-value>${escapeHtml(preciseMoney(safePoints[latestIndex].value_usd))}</strong>
          <small data-chart-change>${escapeHtml(signedMoney(safePoints[latestIndex].profit_loss_usd))} vs. 起始資金</small>
        </div>
        <svg class="performance-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="performance-chart-title performance-chart-description">
          <title id="performance-chart-title">USD 6,000 假設策略資金走勢</title>
          <desc id="performance-chart-description">橫軸為評價時間，縱軸為策略資金總額。可使用滑鼠、觸控或鍵盤查看每一個評價點。</desc>
          <defs>
            <linearGradient id="performance-area-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#c7f15b" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#c7f15b" stop-opacity="0.015" />
            </linearGradient>
          </defs>
          ${yTicks
            .map(
              ({ value, y }) => `
                <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-gridline" />
                <text x="${padding.left - 14}" y="${y + 5}" text-anchor="end" class="chart-axis-label">${escapeHtml(money(value))}</text>`,
            )
            .join("")}
          <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${baseline}" class="chart-axis" />
          <line x1="${padding.left}" y1="${baseline}" x2="${width - padding.right}" y2="${baseline}" class="chart-axis" />
          <polygon points="${areaPoints}" class="chart-area" />
          <polyline points="${linePoints}" class="chart-line" />
          ${coordinates
            .map(
              ({ x, y }, index) => `
                <circle cx="${x}" cy="${y}" r="5" class="chart-dot${index === latestIndex ? " latest" : ""}" />`,
            )
            .join("")}
          ${xTickIndexes
            .map((index) => {
              const coordinate = coordinates[index];
              const label = new Intl.DateTimeFormat("zh-TW", {
                month: "numeric",
                day: "numeric",
                timeZone: "Asia/Taipei",
              }).format(new Date(coordinate.item.as_of));
              return `<text x="${coordinate.x}" y="${height - 20}" text-anchor="middle" class="chart-axis-label">${escapeHtml(label)}</text>`;
            })
            .join("")}
          <line x1="${coordinates[latestIndex].x}" y1="${padding.top}" x2="${coordinates[latestIndex].x}" y2="${baseline}" class="chart-crosshair" data-chart-crosshair />
          <circle cx="${coordinates[latestIndex].x}" cy="${coordinates[latestIndex].y}" r="8" class="chart-active-dot" data-chart-active-dot />
          <rect x="${padding.left}" y="${padding.top}" width="${plotWidth}" height="${plotHeight}" class="chart-hit-area" data-chart-hit-area tabindex="0" role="slider" aria-label="策略資金評價點" aria-valuemin="1" aria-valuemax="${safePoints.length}" aria-valuenow="${safePoints.length}" />
        </svg>
      </div>`;
  };

  const installPerformanceChart = (points) => {
    const shell = document.querySelector("[data-performance-chart]");
    if (!shell || points.length === 0) return;
    const svg = shell.querySelector("svg");
    const hitArea = shell.querySelector("[data-chart-hit-area]");
    const crosshair = shell.querySelector("[data-chart-crosshair]");
    const activeDot = shell.querySelector("[data-chart-active-dot]");
    const tooltip = shell.querySelector("[data-chart-tooltip]");
    const dateLabel = shell.querySelector("[data-chart-date]");
    const valueLabel = shell.querySelector("[data-chart-value]");
    const changeLabel = shell.querySelector("[data-chart-change]");
    const dots = [...shell.querySelectorAll(".chart-dot")];
    if (!svg || !hitArea || !crosshair || !activeDot || !tooltip) return;

    let activeIndex = points.length - 1;
    const selectPoint = (index) => {
      activeIndex = Math.max(0, Math.min(points.length - 1, index));
      const dot = dots[activeIndex];
      const point = points[activeIndex];
      if (!dot || !point) return;
      const x = Number(dot.getAttribute("cx"));
      const y = Number(dot.getAttribute("cy"));
      crosshair.setAttribute("x1", String(x));
      crosshair.setAttribute("x2", String(x));
      activeDot.setAttribute("cx", String(x));
      activeDot.setAttribute("cy", String(y));
      tooltip.style.left = `${(x / 960) * 100}%`;
      tooltip.classList.toggle("align-right", x > 720);
      dateLabel.textContent = dateTime(point.as_of);
      valueLabel.textContent = preciseMoney(point.value_usd);
      changeLabel.textContent = `${signedMoney(point.profit_loss_usd)} vs. 起始資金`;
      hitArea.setAttribute("aria-valuenow", String(activeIndex + 1));
      hitArea.setAttribute(
        "aria-valuetext",
        `${dateTime(point.as_of)}，資金總額 ${preciseMoney(point.value_usd)}`,
      );
      dots.forEach((item, dotIndex) => item.classList.toggle("selected", dotIndex === activeIndex));
    };

    const selectNearestPointer = (event) => {
      const bounds = svg.getBoundingClientRect();
      const pointerX = ((event.clientX - bounds.left) / bounds.width) * 960;
      const nearest = dots.reduce(
        (result, dot, index) => {
          const distance = Math.abs(Number(dot.getAttribute("cx")) - pointerX);
          return distance < result.distance ? { distance, index } : result;
        },
        { distance: Number.POSITIVE_INFINITY, index: 0 },
      );
      selectPoint(nearest.index);
    };

    hitArea.addEventListener("pointermove", selectNearestPointer);
    hitArea.addEventListener("pointerdown", selectNearestPointer);
    hitArea.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectPoint(activeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectPoint(activeIndex + 1);
      }
    });
    selectPoint(activeIndex);
  };

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

  const rebalanceActionLabel = (value) => {
    const labels = { add: "增加", hold: "維持", reduce: "減少", exit: "退出" };
    return labels[value] || String(value || "");
  };

  const signedMoney = (value) => {
    const numeric = Number(value || 0);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${money(numeric)}`;
  };

  const signedShares = (value) => {
    if (value === null || value === undefined) return "—";
    const numeric = Number(value);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(4)} 股`;
  };

  const REVIEW_WINDOW_DAYS = 5;

  const getPerformanceWindowDays = () => REVIEW_WINDOW_DAYS;

  const formatDateLabel = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "未提供";
    }
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeZone: "Asia/Taipei",
    }).format(parsed);
  };

  const performanceSeriesSummary = (points) => {
    const sorted = (Array.isArray(points) ? points : [])
      .filter((point) => Number.isFinite(Number(point?.value_usd)) && point?.as_of)
      .sort((left, right) => new Date(left.as_of) - new Date(right.as_of));
    return {
      first: sorted[0]?.as_of || "",
      last: sorted.at(-1)?.as_of || "",
      total: sorted.length,
    };
  };

  const deriveWindowPerformance = (points, windowDays = 5) => {
    const sorted = (Array.isArray(points) ? points : [])
      .map((point, index) => ({
        as_of: String(point?.as_of || ""),
        value_usd: Number(point?.value_usd),
        session: point?.price_session ? `session:${point.price_session}` : `initial:${index}`,
      }))
      .filter((point) => Number.isFinite(point.value_usd) && point.as_of)
      .sort((left, right) => new Date(left.as_of) - new Date(right.as_of));

    const deduped = [];
    for (const point of sorted) {
      if (deduped.length === 0 || deduped[deduped.length - 1].session !== point.session) {
        deduped.push(point);
      } else {
        deduped[deduped.length - 1] = point;
      }
    }

    const windows = [];
    for (let index = windowDays; index < deduped.length; index++) {
      const start = deduped[index - windowDays];
      const end = deduped[index];
      windows.push((end.value_usd / start.value_usd - 1) * 100);
    }

    return {
      completed_windows: windows.length,
      positive_windows: windows.filter((item) => item > 0).length,
      latest_return_percent: windows.length ? windows[windows.length - 1] : null,
      completed_sessions: Math.max(0, deduped.length - 1),
      method: windows.length > 0
        ? "採用每個收盤日最後一筆估值，固定以每週（5 個交易日）滾動計算。"
        : "目前評估資料未滿 5 個交易日；將在下一個可用收盤日遞延完成首輪完整回測。",
    };
  };

  const glossary = {
    volatility: {
      id: "volatility",
      title: "波動率（Volatility）",
      definition: "價格隨時間變動幅度；波動率越高，短線不確定性與回撤風險通常越高。",
      patterns: [/波動率/g, /Volatility/g, /Vol/g],
    },
    ma20_50: {
      id: "ma20_50",
      title: "MA20 / MA50",
      definition: "MA20 與 MA50 分別是 20 與 50 日移動平均線，常用於判斷短中期趨勢。",
      patterns: [/MA20/g, /MA50/g, /20日/g, /50日/g, /移動平均/g],
    },
    risk_off: {
      id: "risk_off",
      title: "risk_off / risk_on",
      definition: "risk_off 表示偏防守、偏好降低曝險；risk_on 則偏偏好承受風險擴張曝險。",
      patterns: [/risk_off/g, /risk on/g, /risk_on/g],
    },
  };

  const applyGlossaryLinks = (value) => {
    const glossaryEntries = Object.values(glossary);
    const safeValue = escapeHtml(String(value || ""));
    return glossaryEntries.reduce((result, entry) => {
      return entry.patterns.reduce((memo, pattern) => {
        return memo.replaceAll(
          pattern,
          (match) =>
            `<a class="glossary-term-link" href="#glossary-${escapeHtml(entry.id)}" data-tab="glossary">${match}</a>`,
        );
      }, result);
    }, safeValue);
  };

  const glossaryText = (value) => applyGlossaryLinks(value);

  const renderGlossary = () => {
    const glossaryEntries = Object.values(glossary);
    return `
      <section class="panel glossary" data-tab-section="glossary" id="glossary">
        <header class="panel-header">
          <div>
            <span class="section-kicker">術語表</span>
            <h2>術語與政策解釋</h2>
          </div>
          <span class="panel-meta">可點入</span>
        </header>
        <div class="glossary-grid">
          ${glossaryEntries
            .map(
              (entry) => `
                <article class="glossary-card" id="glossary-${escapeHtml(entry.id)}">
                  <h3>${escapeHtml(entry.title)}</h3>
                  <p>${escapeHtml(entry.definition)}</p>
                </article>`,
            )
            .join("")}
        </div>
      </section>`;
  };

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

  const agentLink = (value) => {
    const key = normalizeAgentName(value);
    const profile = agentProfiles[key];
    if (!profile) return `<strong>${escapeHtml(value)}</strong>`;
    return `
      <a
        class="agent-profile-link"
        href="#agent-profile-${escapeHtml(key)}"
        title="查看 ${escapeHtml(profile.title)} 的角色說明"
        aria-label="查看 ${escapeHtml(profile.title)} 的角色說明"
        onclick="event.stopPropagation()"
      >${escapeHtml(profile.title)}</a>`;
  };

  const renderAgentDirectory = (market, recommendation, learning) => `
    <section class="agent-directory" id="agent-directory" aria-labelledby="agent-directory-title">
        <header class="agent-directory-header">
          <div>
            <span class="section-kicker">角色目錄</span>
            <h3 id="agent-directory-title">認識投資委員會</h3>
          </div>
          <p>點擊委員會紀錄中的研究員名稱，可直接跳到角色說明；每位角色都提供白話定位與當前國際脈絡對位。</p>
        </header>
      <div class="agent-profile-grid">
        ${agentProfileOrder
          .map(
            (key) => {
              const profile = agentProfiles[key];
              const insight = buildMarketInsight(market);
              return `
              <article class="agent-profile-card" id="agent-profile-${escapeHtml(key)}">
                <header>
                  <span>${escapeHtml(profile.title)}</span>
                  <h4>${escapeHtml(profile.title)}</h4>
                  <p>${escapeHtml(profile.summary)}</p>
                </header>
                <p class="agent-profile-intro">白話版定位：${escapeHtml(insight.summary)}</p>
                <dl>
                  <div>
                    <dt>負責內容</dt>
                    <dd>${escapeHtml(profile.responsibility)}</dd>
                  </div>
                  <div>
                    <dt>目前國際對位</dt>
                    <dd>${escapeHtml((insight.globalPulse || []).slice(0, 4).join("；") || "尚未產生可用跨區脈絡")}</dd>
                  </div>
                  <div>
                    <dt>使用資訊</dt>
                    <dd>${escapeHtml(profile.inputs)}</dd>
                  </div>
                  <div>
                    <dt>存在原因</dt>
                    <dd>${escapeHtml(profile.purpose)}</dd>
                  </div>
                  <div>
                    <dt>目標</dt>
                    <dd>${escapeHtml(profile.goal)}</dd>
                  </div>
                  <div>
                    <dt>不負責</dt>
                    <dd>${escapeHtml(profile.boundary)}</dd>
                  </div>
                </dl>
                <a class="agent-profile-back" href="#committee">返回委員會內容</a>
              </article>`;
            },
          )
          .join("")}
      </div>
    </section>`;

  const renderAgentIntelligencePanel = (market, recommendation, learning) => {
    const cards = agentProfileOrder
      .map((role) => {
        const profile = agentProfiles[role];
        if (!profile) return "";
        const insight = buildMarketInsight(market);
        const signals = Array.isArray(insight.signals) ? insight.signals : [];
        const globalPulse = Array.isArray(insight.globalPulse) ? insight.globalPulse : [];
        const evidence = signals.slice(0, 5);
        return `
          <article class="agent-intel-card">
            <header class="agent-intel-header">
              <div>
                <span class="agent-intel-role">${escapeHtml(profile.title)}</span>
                <strong>${escapeHtml(profile.title)}</strong>
              </div>
              <span class="agent-intel-stance">${escapeHtml(insight.stance)}</span>
            </header>
            <p class="agent-intel-summary">${escapeHtml(insight.summary)}</p>
            <div class="agent-intel-signal">
              <h4>本輪快照解讀</h4>
              <ul>
                ${evidence
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("")}
              </ul>
            </div>
            <div class="agent-intel-global">
              <h4>國際情勢對位</h4>
              <ul>
                ${globalPulse
                  .map((item) => `<li>${escapeHtml(item)}</li>`)
                  .join("") || "<li>目前尚未看到明確全球對位。</li>"}
              </ul>
            </div>
            <p class="agent-intel-focus">
              <strong>對應重點：</strong>${escapeHtml(insight.focus)}
            </p>
            <div class="agent-intel-link">
              ${agentLink(role)}
            </div>
          </article>`;
      })
      .join("");

    return `
      <section class="panel agent-intel" data-tab-section="agent-intel" id="agent-intel">
        <header class="panel-header">
          <div>
            <span class="section-kicker">交易角色觀點</span>
            <h2>交易/研究角色市場情境導覽</h2>
          </div>
          <span class="panel-meta">${escapeHtml(dateTime(market.research_generated_at || market.generated_at))}<br />以目前快照為主</span>
        </header>
        <div class="panel-intro">
          <p>每位角色先有白話自介，再依「近期市況＋政策＋國際情勢」做責任邊界內的切片解讀。資料不補述歷史假設，僅以可追溯欄位判斷。</p>
        </div>
        <div class="agent-intel-grid">
          ${cards}
        </div>
      </section>`;
  };

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

  const renderCommitteeChat = (committee, recommendation) => {
    const proposals = Array.isArray(committee.proposals) ? committee.proposals : [];
    const critiques = Array.isArray(committee.critiques) ? committee.critiques : [];
    const crossExaminationResponses = Array.isArray(committee.cross_examination_responses)
      ? committee.cross_examination_responses
      : [];
    const responses = Array.isArray(committee.reconciliation_responses)
      ? committee.reconciliation_responses
      : [];
    const resolutions = Array.isArray(committee.critique_resolutions)
      ? committee.critique_resolutions
      : [];

    const proposalMessages = proposals
      .map(
        (proposal) => `
          <article class="chat-message">
            <div class="chat-avatar" aria-hidden="true">${escapeHtml(
              (agentProfiles[normalizeAgentName(proposal.agent)]?.title || proposal.agent).slice(0, 1),
            )}</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(proposal.agent)}</strong>
                <span>第一輪獨立提案</span>
              </header>
              <div class="chat-meta">
                <span>立場：${escapeHtml(decisionLabel(proposal.stance))}</span>
                <span>信心：${escapeHtml(proposal.confidence)}/100</span>
                <span>現金偏好：${percent(proposal.cash_preference)}</span>
                ${
                  proposal.tone
                    ? `<span>語氣：${escapeHtml(decisionLabel(proposal.tone))}</span>`
                    : ""
                }
              </div>
              <p class="chat-opening">${escapeHtml(
                proposal.opening_statement || (proposal.arguments || [])[0] || "本輪沒有可公開摘要。",
              )}</p>
              <div class="asset-tags">${renderAssetTags(proposal.preferred_assets)}</div>
              <details class="chat-details">
                <summary>查看完整論點、風險與失效條件</summary>
                <strong>完整論點</strong>
                <ol>${renderList(proposal.arguments, "未提供", glossaryText)}</ol>
                <strong>主要風險</strong>
                <ul>${renderList(proposal.risks, "未提供", glossaryText)}</ul>
                <strong>失效條件</strong>
                <ul>${renderList(proposal.invalidation_conditions, "未提供", glossaryText)}</ul>
              </details>
            </div>
          </article>`,
      )
      .join("");

    const critiqueThreads = critiques
      .map((critique) => {
        const questions = Array.isArray(critique.direct_questions)
          ? critique.direct_questions
          : [];
        const resolution = resolutions.find((item) => item.reviewer === critique.reviewer);
        const opening = critique.opening_statement || critique.strongest_objection;
        const questionThreads = questions
          .map((question) => {
            const answer = crossExaminationResponses.find(
              (item) =>
                item.reviewer === critique.reviewer &&
                item.responding_agent === question.target_agent &&
                item.question === question.question,
            );
            return `
              <article class="chat-message reviewer-message question-message">
                <div class="chat-avatar" aria-hidden="true">問</div>
                <div class="chat-bubble">
                  <header>
                    <strong>${agentLink(critique.reviewer)}</strong>
                    <span>點名 ${agentLink(question.target_agent)}</span>
                  </header>
                  <p class="chat-opening">${escapeHtml(question.question)}</p>
                  <small class="chat-why">${escapeHtml(question.why_it_matters)}</small>
                </div>
              </article>
              ${
                answer
                  ? `
                    <article class="chat-message answer-message">
                      <div class="chat-avatar" aria-hidden="true">${escapeHtml(
                        (
                          agentProfiles[normalizeAgentName(answer.responding_agent)]?.title ||
                          answer.responding_agent
                        ).slice(0, 1),
                      )}</div>
                      <div class="chat-bubble">
                        <header>
                          <strong>${agentLink(answer.responding_agent)}</strong>
                          <span>直接回應 ${agentLink(answer.reviewer)}</span>
                        </header>
                        <div class="chat-meta">
                          <span>語氣：${escapeHtml(decisionLabel(answer.tone))}</span>
                        </div>
                        <p class="chat-opening">${escapeHtml(answer.direct_answer)}</p>
                        <details class="chat-details">
                          <summary>查看證據、承認與修正</summary>
                          <strong>使用證據</strong>
                          <ul>${renderList(answer.evidence_used, "無使用證據", glossaryText)}</ul>
                          <strong>承認的盲點</strong>
                          <ul>${renderList(answer.conceded_points, "沒有承認新的盲點", glossaryText)}</ul>
                          <strong>提出修正</strong>
                          <ul>${renderList(answer.proposed_changes, "未提供", glossaryText)}</ul>
                          ${
                            answer.unresolved_disagreement
                              ? `<strong>仍有分歧</strong><p>${escapeHtml(
                                  answer.unresolved_disagreement,
                                )}</p>`
                              : ""
                          }
                        </details>
                      </div>
                    </article>`
                  : ""
              }`;
          })
          .join("");
        const resolutionMessage = resolution
          ? `
            <article class="chat-message reviewer-message resolution-message">
              <div class="chat-avatar" aria-hidden="true">裁</div>
              <div class="chat-bubble">
                <header>
                  <strong>${agentLink(resolution.reviewer)}</strong>
                  <span>第二次裁決</span>
                </header>
                ${
                  resolution.tone
                    ? `<div class="chat-meta"><span>語氣：${escapeHtml(
                        decisionLabel(resolution.tone),
                      )}</span></div>`
                    : ""
                }
                <p class="chat-opening">${escapeHtml(resolution.resolution_summary)}</p>
                <div class="chat-status ${resolution.veto_maintained ? "veto" : ""}">
                  ${resolution.veto_maintained ? "維持否決" : "接受修正"}
                </div>
                <details class="chat-details">
                  <summary>查看採納、分歧與硬性限制</summary>
                  <strong>採納修正</strong>
                  <ul>${renderList(resolution.accepted_changes, "未提供", glossaryText)}</ul>
                  <strong>尚未消除的疑慮</strong>
                  <ul>${renderList(resolution.unresolved_objections, "沒有未解疑慮", glossaryText)}</ul>
                  <strong>交給 CIO 的硬性限制</strong>
                  <ul>${renderList(resolution.binding_constraints, "沒有未解除的硬性限制", glossaryText)}</ul>
                </details>
              </div>
            </article>`
          : "";
        return `
          <article class="chat-message reviewer-message">
            <div class="chat-avatar" aria-hidden="true">審</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(critique.reviewer)}</strong>
                <span>交叉質詢</span>
              </header>
              ${
                critique.tone
                  ? `<div class="chat-meta"><span>語氣：${escapeHtml(
                      decisionLabel(critique.tone),
                    )}</span></div>`
                  : ""
              }
              <p class="chat-opening">${escapeHtml(opening)}</p>
              <div class="chat-status ${critique.veto_recommended ? "veto" : ""}">
                ${critique.veto_recommended ? "建議否決" : "本輪不否決"}
              </div>
              <details class="chat-details">
                <summary>查看最強反對、隱含假設與要求修正</summary>
                <strong>最強反對意見</strong>
                <p>${escapeHtml(critique.strongest_objection)}</p>
                <strong>隱含假設</strong>
                <ul>${renderList(critique.hidden_assumptions, "未提供", glossaryText)}</ul>
                <strong>要求修正</strong>
                <ul>${renderList(critique.required_changes, "未提供", glossaryText)}</ul>
              </details>
            </div>
          </article>
          ${questionThreads}
          ${resolutionMessage}`;
      })
      .join("");

    const reconciliationMessages = responses
      .map((response, index) => {
        const resolution = resolutions[index];
        return `
          <article class="chat-message reviewer-message">
            <div class="chat-avatar" aria-hidden="true">議</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(response.reviewer)}</strong>
                <span>協商與第二次裁決</span>
              </header>
              <strong>提案者承認與修正</strong>
              <ul>${renderList(response.conceded_points, "未提供", glossaryText)}</ul>
              <ul>${renderList(response.proposed_changes, "未提供", glossaryText)}</ul>
              <strong>證據式反駁</strong>
              <ul>${renderList(response.rebuttals, "未提供", glossaryText)}</ul>
              <p>${escapeHtml(resolution?.resolution_summary || "尚無第二次裁決")}</p>
            </div>
          </article>`;
      })
      .join("");

    const finalDecision = committee.final_decision;
    return `
      <section class="committee-chat" aria-label="投資委員會群組對話">
        <header class="chat-room-header">
          <div>
            <span class="live-dot" aria-hidden="true"></span>
            <strong>投資委員會群組</strong>
          </div>
          <span>研究編號 ${escapeHtml(committee.run_id)}</span>
        </header>
        <article class="chat-message system-message">
          <div class="chat-bubble">
            <strong>系統訊息</strong>
            <p>
              資料已封存至 ${escapeHtml(dateTime(recommendation.data_cutoff))}。
              以下內容是各角色公開提交的結構化摘要、批判與裁決，不包含隱藏思考鏈。
            </p>
          </div>
        </article>
        <div class="chat-stage-label">第一階段 · 獨立研究</div>
        ${proposalMessages}
        <div class="chat-stage-label">第二階段 · 質詢、回應與裁決</div>
        ${critiqueThreads}
        ${
          reconciliationMessages
            ? `<div class="chat-stage-label">第三階段 · 協商修正</div>${reconciliationMessages}`
            : ""
        }
        <div class="chat-stage-label">最終階段 · 整合裁決</div>
        <article class="chat-message cio-message">
          <div class="chat-avatar" aria-hidden="true">決</div>
          <div class="chat-bubble">
            <header>
              <strong>${agentLink("cio")}</strong>
              <span>最終決策</span>
            </header>
            <div class="chat-meta">
              <span>市場立場：${escapeHtml(decisionLabel(finalDecision.market_stance))}</span>
              <span>風險：${escapeHtml(decisionLabel(finalDecision.risk_level))}</span>
              <span>共識度：${escapeHtml(finalDecision.model_score)}/100</span>
              ${
                finalDecision.tone
                  ? `<span>語氣：${escapeHtml(decisionLabel(finalDecision.tone))}</span>`
                  : ""
              }
            </div>
            <p class="chat-opening">${escapeHtml(
              finalDecision.opening_statement || finalDecision.model_score_reason,
            )}</p>
            <details class="chat-details">
              <summary>查看共識度計算</summary>
              <p>${escapeHtml(finalDecision.model_score_reason)}</p>
            </details>
            <div class="final-allocation-grid">
              ${(finalDecision.allocations || [])
                .map(
                  (item) => `
                    <article class="final-allocation">
                      ${symbolLink(item.symbol)}
                      <span>${percent(item.target_weight)}</span>
                      <small>${escapeHtml(item.note)}</small>
                    </article>`,
                )
                .join("")}
            </div>
          </div>
        </article>
      </section>`;
  };

const researchStatusLabel = (value) => {
  const labels = {
    untested: "尚未驗證",
    partially_tested: "部分驗證",
    supported: "暫時支持",
    challenged: "受到挑戰",
    invalidated: "已失效",
    mixed: "證據混合",
    too_early: "追蹤期未完成",
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
      ? "N/A"
      : `${Number(value).toFixed(2)}${suffix}`;

  const comparisonRecords = (history, recommendation) => {
    const records = new Map();
    history.forEach((item) => {
      if (item.recommendation) {
        records.set(item.recommendation.run_id, item.recommendation);
      }
    });
    records.set(recommendation.run_id, recommendation);
    return [...records.values()].sort(
      (left, right) => new Date(left.generated_at) - new Date(right.generated_at),
    );
  };

  const buildComparisonRows = (fromRecommendation, toRecommendation) => {
    const from = new Map(
      fromRecommendation.allocations.map((item) => [item.symbol, item]),
    );
    const to = new Map(toRecommendation.allocations.map((item) => [item.symbol, item]));
    return [...new Set([...from.keys(), ...to.keys()])]
      .sort()
      .map((symbol) => {
        const previous = from.get(symbol);
        const current = to.get(symbol);
        const previousAmount = Number(previous?.target_amount_usd || 0);
        const currentAmount = Number(current?.target_amount_usd || 0);
        return {
          symbol,
          previousAmount,
          currentAmount,
          changeAmount: currentAmount - previousAmount,
          previousWeight: Number(previous?.target_weight || 0),
          currentWeight: Number(current?.target_weight || 0),
        };
      });
  };

  const installDecisionComparison = (records) => {
    const fromSelect = document.querySelector("[data-compare-from]");
    const toSelect = document.querySelector("[data-compare-to]");
    const result = document.querySelector("[data-compare-result]");
    if (!fromSelect || !toSelect || !result || records.length < 2) return;

    const renderComparison = () => {
      const fromRecommendation = records.find((item) => item.run_id === fromSelect.value);
      const toRecommendation = records.find((item) => item.run_id === toSelect.value);
      if (!fromRecommendation || !toRecommendation) return;
      const rows = buildComparisonRows(fromRecommendation, toRecommendation);
      const previousReasons = new Map(
        fromRecommendation.top_reasons.map((item) => [item.id, item.title]),
      );
      const changedReasons = toRecommendation.top_reasons.filter(
        (item) => previousReasons.get(item.id) !== item.title,
      );
      result.innerHTML = `
        <div class="comparison-summary">
          <span>${escapeHtml(fromRecommendation.run_id)}</span>
          <strong>→</strong>
          <span>${escapeHtml(toRecommendation.run_id)}</span>
          <small>${changedReasons.length} / 10 個理由標題改變</small>
        </div>
        <div class="comparison-grid">
          ${rows
            .map(
              (item) => `
                <article>
                  <strong>${escapeHtml(item.symbol)}</strong>
                  <span>${money(item.previousAmount)} → ${money(item.currentAmount)}</span>
                  <small>${signedMoney(item.changeAmount)} · ${percent(item.previousWeight)} → ${percent(item.currentWeight)}</small>
                </article>`,
            )
            .join("")}
        </div>
        <div class="changed-reasons">
          <strong>十大理由變化</strong>
          ${
            changedReasons.length
              ? `<ol>${changedReasons
                  .map(
                    (item) =>
                      `<li><span>${String(item.id).padStart(2, "0")}</span>${escapeHtml(item.title)}</li>`,
                  )
                  .join("")}</ol>`
              : "<p>兩輪理由標題沒有變化。</p>"
          }
        </div>`;
    };
    fromSelect.addEventListener("change", renderComparison);
    toSelect.addEventListener("change", renderComparison);
    renderComparison();
  };

  const installTabNavigation = () => {
    const controls = document.querySelector("[data-tab-controls]");
    const menuToggle = controls?.querySelector("[data-tab-menu-toggle]");
    const strip = controls?.querySelector("[data-tab-strip]");
    const triggers = [...document.querySelectorAll("[data-tab-trigger]")];
    const sections = [...document.querySelectorAll("[data-tab-section]")];
    if (!controls || triggers.length === 0 || sections.length === 0) {
      sections.forEach((section) => {
        section.hidden = false;
      });
      return;
    }

    const setTab = (target) => {
      triggers.forEach((trigger) => {
        const isActive = trigger.dataset.tabTarget === target;
        trigger.classList.toggle("active", isActive);
        trigger.setAttribute("aria-selected", String(isActive));
      });
      sections.forEach((section) => {
        section.hidden = section.dataset.tabSection !== target;
      });
      if (strip) {
        strip.classList.remove("is-open");
      }
      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const target = trigger.dataset.tabTarget;
        if (!target) return;
        setTab(target);
      });
    });

    if (menuToggle && strip) {
      menuToggle.addEventListener("click", () => {
        const shouldOpen = !strip.classList.contains("is-open");
        strip.classList.toggle("is-open", shouldOpen);
        menuToggle.setAttribute("aria-expanded", String(shouldOpen));
      });
    }

    document.querySelectorAll("[data-tab]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const target = link.getAttribute("data-tab");
        if (!target) return;
        event.preventDefault();
        setTab(target);
        const glossaryId = link.getAttribute("href")?.split("#")[1];
        if (glossaryId) {
          const targetSection = document.getElementById(glossaryId);
          if (targetSection) {
            targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            location.hash = `#${glossaryId}`;
          }
        }
      });
    });

    const defaultTarget = document.querySelector("[data-tab-trigger].active")?.dataset.tabTarget || "overview";
    setTab(defaultTarget);
  };

  const renderHistoricalRecord = (record) => {
    const archivedCommittee = record.committee;
    const archivedRecommendation = record.recommendation;
    const review = record.decision_review;
    const timestamp =
      review?.generated_at ||
      archivedCommittee?.generated_at ||
      archivedRecommendation?.generated_at;

    return `
      <details class="archive-card">
        <summary>
          <span>
            <strong>${escapeHtml(record.archive_id)}</strong>
            <small>${escapeHtml(dateTime(timestamp))}</small>
          </span>
          <span class="archive-types">
            ${review ? "績效驗證" : ""}
            ${archivedCommittee ? "委員會討論" : ""}
            ${archivedRecommendation ? "決策配置" : ""}
          </span>
        </summary>
        <div class="archive-body">
          ${
            review
              ? `
                <section class="archive-review">
                  <div class="archive-review-metrics">
                    <span>起始 <strong>${money(review.starting_value_usd)}</strong></span>
                    <span>期末 <strong>${money(review.ending_value_usd)}</strong></span>
                    <span>損益 <strong>${escapeHtml(review.profit_loss_usd)} USD</strong></span>
                    <span>報酬 <strong>${escapeHtml(review.return_percent)}%</strong></span>
                  </div>
                  <p>${escapeHtml(review.assessment?.summary)}</p>
                  <div class="committee-columns">
                    <section class="committee-block">
                      <h3>支持原決策的證據</h3>
                      <ul>${renderList(review.assessment?.supported_points, "未提供", glossaryText)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>挑戰原決策的證據</h3>
                      <ul>${renderList(review.assessment?.challenged_points, "未提供", glossaryText)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>公開方法與限制</h3>
                      <ul>${renderList(review.methodology?.warnings, "未提供", glossaryText)}</ul>
                    </section>
                  </div>
                </section>`
              : ""
          }
          ${
            archivedRecommendation
              ? `
                <section class="archive-allocation">
                  <h3>當時最終配置</h3>
                  <div class="final-allocation-grid">
                    ${archivedRecommendation.allocations
                      .map(
                        (item) => `
                          <article class="final-allocation">
                            <strong>${escapeHtml(item.symbol)}</strong>
                            <span>${money(item.target_amount_usd)} · ${percent(item.target_weight)}</span>
                            <small>${escapeHtml(item.note)}</small>
                          </article>`,
                      )
                      .join("")}
                  </div>
                </section>`
              : ""
          }
          ${
            archivedCommittee
              ? `
                <section class="archive-discussion">
                  <h3>完整結構化討論</h3>
                  ${archivedCommittee.proposals
                    .map(
                      (proposal) => `
                        <article class="archive-agent">
                          <header>
                            ${agentLink(proposal.agent)}
                            <span>${escapeHtml(proposal.stance)} · ${escapeHtml(proposal.confidence)}/100</span>
                          </header>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>論點</h3>
                              <ol>${renderList(proposal.arguments, "未提供", glossaryText)}</ol>
                            </section>
                            <section class="committee-block">
                              <h3>風險</h3>
                              <ul>${renderList(proposal.risks, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>失效條件</h3>
                              <ul>${renderList(proposal.invalidation_conditions, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${archivedCommittee.critiques
                    .map(
                      (critique) => `
                        <article class="archive-agent critique">
                          <header>
                            ${agentLink(critique.reviewer)}
                            <span>${critique.veto_recommended ? "建議否決" : "不否決"}</span>
                          </header>
                          <p>${escapeHtml(critique.strongest_objection)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>隱含假設</h3>
                              <ul>${renderList(critique.hidden_assumptions, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>要求修正</h3>
                              <ul>${renderList(critique.required_changes, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${(archivedCommittee.cross_examination_responses || [])
                    .map(
                      (response) => `
                        <article class="archive-agent response">
                          <header>
                            ${agentLink(response.responding_agent)}
                            <span>回應 ${agentLink(response.reviewer)} · ${escapeHtml(
                              decisionLabel(response.tone),
                            )}</span>
                          </header>
                          <p><strong>問題：</strong>${escapeHtml(response.question)}</p>
                          <p>${escapeHtml(response.direct_answer)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>使用證據</h3>
                              <ul>${renderList(response.evidence_used, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>承認的盲點</h3>
                              <ul>${renderList(response.conceded_points, "沒有承認新的盲點")}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>提出修正</h3>
                              <ul>${renderList(response.proposed_changes, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${(archivedCommittee.critique_resolutions || [])
                    .map(
                      (resolution) => `
                        <article class="archive-agent critique">
                          <header>
                            ${agentLink(resolution.reviewer)}
                            <span>${resolution.veto_maintained ? "維持否決" : "接受修正"}</span>
                          </header>
                          <p>${escapeHtml(resolution.resolution_summary)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>採納修正</h3>
                              <ul>${renderList(resolution.accepted_changes, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>尚未消除的疑慮</h3>
                              <ul>${renderList(resolution.unresolved_objections, "沒有未解疑慮", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>硬性限制</h3>
                              <ul>${renderList(
                                resolution.binding_constraints,
                                "沒有未解除的硬性限制",
                              )}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                </section>`
              : ""
          }
        </div>
      </details>`;
  };

  const render = ({
    recommendation,
    committee,
    market,
    system,
    history,
    learning,
    performance,
    rebalance,
    researchJournal,
    dashboardAnalytics,
  }) => {
    const isLive = recommendation.status === "live";
    const statusLabel = "研究建議 · 研究用途";
    const invested = recommendation.allocations
      .filter((item) => item.symbol !== "CASH")
      .reduce((total, item) => total + Number(item.target_amount_usd), 0);
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
    const scoreReason =
      recommendation.model_score_reason ||
      "舊制資料沒有保存評分理由；不可用這個數字判斷配置好壞。";
    const scoreAngle = `${modelScore * 3.6}deg`;
    const donut = buildDonut(recommendation.allocations);
    const committeeSize = committee.proposals.length + committee.critiques.length + 1;
    const comparableRecommendations = comparisonRecords(history, recommendation);
    const health = dashboardAnalytics.portfolio_health;
    const analyticsPerformance = dashboardAnalytics.performance;
    const performanceWindowDays = getPerformanceWindowDays();
    const performanceWindow = deriveWindowPerformance(performance.points, performanceWindowDays);
    const seriesSummary = performanceSeriesSummary(performance.points);
    const performanceSharpe = performanceWindow.completed_windows >= 20 ? analyticsPerformance.sharpe_ratio : null;
    const performanceWinRate = performanceWindow.completed_windows >= 20 ? analyticsPerformance.win_rate_percent : null;
    const showWindowSharpe = performanceWindow.completed_windows >= 20;
    const performanceSharpeStat = showWindowSharpe
      ? `<div><span>夏普比率／勝率</span><strong>${statistic(performanceSharpe)} / ${statistic(performanceWinRate, "%")}</strong></div>`
      : "";
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark">IC</span>
            <span class="brand-copy">
              <strong>投資委員會</strong>
              <span>GitOps 組合研究</span>
            </span>
          </div>
          <div class="topbar-meta">
            <span class="pill ${isLive ? "live" : "review"}">${statusLabel}</span>
            <span class="pill">${escapeHtml(system.version)}</span>
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
          <div class="tab-strip" id="main-tab-strip" data-tab-strip>
            <button type="button" class="tab-trigger active" data-tab-trigger data-tab-target="overview" aria-selected="true">總覽</button>
            <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="committee" aria-selected="false">委員會實際內容</button>
            <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="agent-intel" aria-selected="false">角色觀點</button>
            <button type="button" class="tab-trigger" data-tab-trigger data-tab-target="glossary" aria-selected="false">術語表</button>
          </div>
        </nav>

        <section class="hero" data-tab-section="overview">
          <div class="hero-main">
            <span class="eyebrow">投資摘要 / ${escapeHtml(recommendation.run_id)}</span>
            <h1>6,000 美元，<br /><span>一個可稽核的決策。</span></h1>
            <p class="hero-lede">
              十個專業研究角色、兩位批判者與一位 ${agentLink("cio")}，把市場觀點壓縮成一份
              可驗證、不可自動執行的目標配置。
            </p>
            <div class="hero-strip">
              <span class="pill">資料截止 ${escapeHtml(dateTime(recommendation.data_cutoff))}</span>
              <span class="pill">風險 ${escapeHtml(decisionLabel(recommendation.risk_level))}</span>
            </div>
          </div>
          <aside class="hero-side">
            <div
              class="score-orbit"
              style="--score-angle:${escapeHtml(scoreAngle)}"
              aria-label="模型評分 ${escapeHtml(recommendation.model_score)}，滿分 100"
            >
              <span class="score-number">${escapeHtml(modelScore)}<small>/100</small></span>
              <span class="score-caption">委員共識度<br />不是成功機率</span>
            </div>
            <div class="score-explainer">
              <strong>${escapeHtml(scoreBand)}</strong>
              <p>${escapeHtml(scoreReason)}</p>
              <small>100 代表方向高度一致且無批判者否決；0 代表方向高度衝突。與報酬、勝率及「配置有多好」無關。</small>
            </div>
            <p class="side-note">固定週度驗證：每 5 個交易日（週一至週五）更新一次</p>
          </aside>
        </section>

        <section class="metrics" aria-label="投資組合總覽" data-tab-section="overview">
          <article class="metric">
            <span class="metric-label">總策略資金</span>
            <strong class="metric-value">${money(recommendation.capital_usd)}</strong>
            <span class="metric-foot">本次委員會配置基準</span>
          </article>
          <article class="metric">
            <span class="metric-label">風險資產</span>
            <strong class="metric-value">${money(invested)}</strong>
            <span class="metric-foot">${percent(invested / Number(recommendation.capital_usd || 1))} 策略曝險</span>
          </article>
          <article class="metric">
            <span class="metric-label">預留現金</span>
            <strong class="metric-value">${money(cash?.target_amount_usd || 0)}</strong>
            <span class="metric-foot">${percent(cash?.target_weight || 0)} 流動性緩衝</span>
          </article>
          <article class="metric">
            <span class="metric-label">委員會</span>
            <strong class="metric-value">${escapeHtml(committeeSize)}</strong>
            <span class="metric-foot">${escapeHtml(committee.proposals.length)} 位研究員 · ${escapeHtml(committee.critiques.length)} 份批判 · 1 位${agentLink("cio")}</span>
          </article>
        </section>

        <section class="terminal-grid" aria-label="彭博風格策略分析" data-tab-section="overview">
          <article class="terminal-card health-terminal">
            <div class="terminal-card-head">
              <div>
                <span class="section-kicker">投資組合健康分數</span>
                <h2>組合健康度</h2>
              </div>
              <div class="health-score grade-${escapeHtml(health.grade)}">
                <strong>${escapeHtml(health.score)}</strong>
                <span>/ 100</span>
              </div>
            </div>
            <p>${escapeHtml(healthGradeLabel(health.grade))} · ${escapeHtml(health.summary)}</p>
            <div class="health-components">
              ${health.components
                .map(
                  (item) => `
                    <div>
                      <span>${escapeHtml(item.component)}</span>
                      <div class="health-bar"><i style="--health-width:${escapeHtml((Number(item.score) / Number(item.maximum)) * 100)}%"></i></div>
                      <strong>${escapeHtml(item.score)} / ${escapeHtml(item.maximum)}</strong>
                      <small>${escapeHtml(item.explanation)}</small>
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
              <div><span>累積報酬</span><strong>${statistic(analyticsPerformance.total_return_percent, "%")}</strong></div>
              <div><span>最大回撤</span><strong>${statistic(analyticsPerformance.maximum_drawdown_percent, "%")}</strong></div>
              <div><span>每週（5 交易日）滾動</span><strong>${statistic(performanceWindow.latest_return_percent, "%")}</strong></div>
              <div><span>完成收盤日</span><strong>${escapeHtml(performanceWindow.completed_sessions)}</strong></div>
              <div><span>每週正向視窗</span><strong>${escapeHtml(performanceWindow.positive_windows)} / ${escapeHtml(performanceWindow.completed_windows)}</strong></div>
              ${performanceSharpeStat}
            </div>
            <p>${escapeHtml(analyticsPerformance.methodology)}</p>
            <p class="methodology-note">${escapeHtml(performanceWindow.method)}</p>
          </article>
        </section>

        <div class="dashboard-grid">
          <section class="panel leaderboard" id="leaderboard" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">研究員表現排行</span>
                <h2>各研究員命中率排行榜</h2>
              </div>
              <span class="panel-meta">影子測試<br />不影響投票權重</span>
            </header>
            <p class="methodology-note">
              以相鄰決策點的 SPY 方向做粗略評價；樣本未滿 20 次前不得據此調整權重，
              命中率也不是獲利勝率。
            </p>
            <div class="table-wrap leaderboard-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>排名</th>
                    <th>研究員</th>
                    <th>命中</th>
                    <th>命中率</th>
                    <th>平均信心</th>
                    <th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboardAnalytics.agent_leaderboard
                    .map(
                      (item) => `
                        <tr>
                          <td>${escapeHtml(item.rank)}</td>
                          <td>${agentLink(item.agent)}</td>
                          <td>${escapeHtml(item.correct_calls)} / ${escapeHtml(item.evaluated_calls)}</td>
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
                <h2>6,000 美元短線建議配置</h2>
              </div>
              <span class="panel-meta">建議版本 ${escapeHtml(recommendation.run_id)}</span>
            </header>
            <div class="strategy-layout">
              <div class="allocation-visual">
                <div class="donut" style="--donut:${escapeHtml(donut)}">
                  <div class="donut-center">
                    <strong>${money(recommendation.capital_usd)}</strong>
                    <span>策略資金</span>
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
                      <th>建議金額</th>
                      <th>佔 6,000 比例</th>
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
                            <td data-label="建議金額">${money(item.target_amount_usd)}</td>
                            <td data-label="佔 6,000 比例">${percent(item.target_weight)}</td>
                            <td data-label="類型"><span class="asset-type">${escapeHtml(assetTypeLabel(item.asset_type))}</span></td>
                            <td data-label="研究／風控備註" class="allocation-note">${glossaryText(item.note)}</td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
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

          ${renderGlossary()}
          ${renderAgentIntelligencePanel(market, recommendation, learning)}

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
                    <strong>本輪最終配置已套用使用者硬限制</strong>
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
                <strong>${agentLink("cio")} 決策</strong>
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
              <p class="decision-horizon">固定每週檢驗（5 個交易日）</p>
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

          <section class="panel rebalance" id="rebalance" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">研究配置調整摘要</span>
                <h2>本輪建議如何調整</h2>
              </div>
              <span class="panel-meta">${escapeHtml(rebalance.pricing_session)} 收盤</span>
            </header>
            <p class="methodology-note">${escapeHtml(rebalance.basis)}</p>
            <div class="table-wrap strategy-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>標的</th>
                    <th>方向</th>
                    <th>建議金額變化</th>
                    <th>股數變化</th>
                    <th>調整後配置</th>
                  </tr>
                </thead>
                <tbody>
                  ${rebalance.instructions
                    .map(
                      (item) => `
                    <tr>
                          <td data-label="標的">${symbolLink(item.symbol)}</td>
                          <td data-label="方向">${escapeHtml(rebalanceActionLabel(item.action))}</td>
                          <td data-label="建議金額變化">${escapeHtml(signedMoney(item.change_usd))}</td>
                            <td data-label="股數變化">
                              ${escapeHtml(signedShares(item.estimated_share_change))}
                              ${
                                item.reference_close_usd
                                  ? `<small class="close-reference">@ ${money(item.reference_close_usd)}</small>`
                                  : ""
                              }
                            </td>
                          <td data-label="調整後配置">${money(item.new_target_usd)}</td>
                        </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            <ul class="rebalance-warnings">${renderList(rebalance.warnings, "無提醒", glossaryText)}</ul>
          </section>

          <section class="panel performance" id="performance" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">假設策略指數</span>
                <h2>USD 6,000 假設策略走勢</h2>
              </div>
              <span class="panel-meta">${escapeHtml(performance.points.length)}<br />評價點</span>
            </header>
            ${buildPerformanceChart(performance.points)}
            <div class="performance-dates">
              ${performance.points
                .map(
                  (point) => `
                    <span>
                      ${escapeHtml(dateTime(point.as_of))}
                      <strong>${money(point.value_usd)}</strong>
                    </span>`,
                )
                .join("")}
            </div>
            <p class="methodology-note">${escapeHtml(performance.methodology)}</p>
            <div class="performance-audit">
              <article>
                <span>最後完成評價</span>
                <strong>${preciseMoney(researchJournal.performance.last_completed_value_usd)}</strong>
                <small>${escapeHtml(researchJournal.performance.last_completed_return_percent)}% · ${escapeHtml(dateTime(researchJournal.performance.last_completed_evaluation_at))}</small>
              </article>
              <article>
                <span>每週（5 交易日）滾動淨績效</span>
                <strong>${statistic(performanceWindow.latest_return_percent, "%")}</strong>
                <small>${escapeHtml(performanceWindow.positive_windows)} / ${escapeHtml(performanceWindow.completed_windows)} 個 5 交易日窗口</small>
              </article>
              <article>
                <span>績效評估資料區間</span>
                <strong>${escapeHtml(formatDateLabel(seriesSummary.first))}</strong>
                <small>起訖：${escapeHtml(formatDateLabel(seriesSummary.last))}</small>
              </article>
              <article>
                <span>可回測收盤點</span>
                <strong>${escapeHtml(seriesSummary.total)}</strong>
                <small>不足 5 點前先維持樣本累積，不提前下結論。</small>
              </article>
            </div>
            <p class="methodology-note">
              ${escapeHtml(researchJournal.performance.methodology)}
            </p>
          </section>

          <section class="panel evidence" id="evidence" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">證據引擎</span>
                <h2>市場、財報與來源證據</h2>
              </div>
              <span class="panel-meta">${escapeHtml((market.features || []).length)} 項特徵<br />${escapeHtml((market.filing_events || []).length)} 份申報</span>
            </header>
            ${
              market.regime
                ? `
                  <div class="regime-grid">
                    <article><span>趨勢狀態</span><strong>${escapeHtml(decisionLabel(market.regime.trend))}</strong></article>
                    <article><span>波動狀態</span><strong>${escapeHtml(decisionLabel(market.regime.volatility))}</strong></article>
                    <article><span>利率狀態</span><strong>${escapeHtml(decisionLabel(market.regime.rates))}</strong></article>
                  </div>
                  <ul class="evidence-notes">${renderList(market.regime.evidence, "未提供", glossaryText)}</ul>`
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
                          <th>1D / 5D / 20D</th>
                          <th>20D 年化波動</th>
                          <th>相對 MA20 / MA50</th>
                          <th>RSI14</th>
                          <th>量比</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${market.features
                          .map(
                            (item) => `
                              <tr>
                                <td>${symbolLink(item.symbol)}</td>
                                <td>${escapeHtml(item.return_1d_percent ?? "—")}% / ${escapeHtml(item.return_5d_percent ?? "—")}% / ${escapeHtml(item.return_20d_percent ?? "—")}%</td>
                                <td>${escapeHtml(item.volatility_20d_annualized_percent ?? "—")}%</td>
                                <td>${escapeHtml(item.distance_from_ma20_percent ?? "—")}% / ${escapeHtml(item.distance_from_ma50_percent ?? "—")}%</td>
                                <td>${escapeHtml(item.rsi14 ?? "—")}</td>
                                <td>${escapeHtml(item.volume_ratio_20d ?? "—")}×</td>
                              </tr>`,
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>`
                : ""
            }
            ${
              (market.filing_events || []).length
                ? `
                  <div class="filing-grid">
                    ${market.filing_events
                      .slice(0, 24)
                      .map(
                        (event) => `
                          <a class="filing-card" href="${escapeHtml(event.source_url)}" target="_blank" rel="noopener noreferrer">
                            <span>${symbolLink(event.symbol)} · ${escapeHtml(event.form)}</span>
                            <strong>${escapeHtml(event.description)}</strong>
                            <small>${escapeHtml(event.filing_date)}</small>
                          </a>`,
                      )
                      .join("")}
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
            ${
              (market.source_catalog || []).length
                ? `
                  <details class="evidence-details">
                    <summary>查看資料來源、時效與限制</summary>
                    <div class="source-grid">
                      ${market.source_catalog
                        .map(
                          (source) => {
                            const localized = localizedSource(source);
                            return `
                            <article class="source-card">
                              <header>
                                <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localized.name)}</a>
                                <span>${source.active ? "引擎支援" : "候選來源"}</span>
                              </header>
                              <p>${escapeHtml(localized.use)}</p>
                              <small>${escapeHtml(localized.cadence)} · ${escapeHtml(localized.latency)}</small>
                              <ul>${renderList(localized.limits, "未提供", glossaryText)}</ul>
                            </article>`;
                          },
                        )
                        .join("")}
                    </div>
                  </details>`
                : ""
            }
            <ul class="rebalance-warnings">${renderList(market.warnings, "無警示", glossaryText)}</ul>
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
                      .map(
                        (item) => `
                          <article class="learning-card">
                            <h3>${escapeHtml(item.title)}</h3>
                            <p>${escapeHtml(item.summary)}</p>
                            <p><strong>市場關聯</strong>${escapeHtml(item.market_relevance)}</p>
                            <div class="reason-meta">
                              <span>${escapeHtml(item.category)} · ${escapeHtml(item.region)}</span>
                              <a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.source_title)}</a>
                            </div>
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
                <span class="section-kicker">學習循環</span>
                <h2>這次假設驗證，我們學到什麼？</h2>
              </div>
              <span class="panel-meta">${escapeHtml(researchStatusLabel(learning.verdict))}<br />${escapeHtml(dateTime(learning.evaluation_cutoff))}</span>
            </header>
            <div class="learning-grid">
              ${learning.lessons
                .map(
                  (lesson) => `
                    <article class="learning-card">
                      <h3>${escapeHtml(lesson.title)}</h3>
                      <p><strong>證據</strong>${escapeHtml(lesson.evidence)}</p>
                      <p><strong>下輪影響</strong>${escapeHtml(lesson.implication)}</p>
                      <div class="reason-meta">
                        <span>信心 ${escapeHtml(lesson.confidence)}</span>
                        <span>${escapeHtml(lesson.affected_assets.join(" · "))}</span>
                      </div>
                    </article>`,
                )
                .join("")}
            </div>
            <div class="committee-columns learning-decisions">
              <section class="committee-block">
                <h3>委員會修正</h3>
                <ul>${renderList(learning.committee_changes, "未提供", glossaryText)}</ul>
              </section>
              <section class="committee-block">
                <h3>是否新增委員</h3>
                <p>${escapeHtml(learning.member_assessment)}</p>
              </section>
              <section class="committee-block">
                <h3>是否需要 Skill</h3>
                <p>${escapeHtml(learning.skill_assessment)}</p>
              </section>
            </div>
          </section>

          <section class="panel research-journal" id="research-journal" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">每日研究日誌</span>
                <h2>每日研究：假設、驗證與學習</h2>
              </div>
              <span class="panel-meta">${escapeHtml(readinessLabel(researchJournal.readiness))}<br />${escapeHtml(dateTime(researchJournal.data_cutoff))}</span>
            </header>
            <div class="readiness-verdict ${researchJournal.readiness}">
              <strong>目前系統判定：不足以應付即時事件驅動盤勢</strong>
              <p>${escapeHtml(researchJournal.readiness_summary)}</p>
            </div>
            <div class="journal-layout">
              <section class="journal-column">
                <header>
                  <span>01</span>
                  <h3>我們假設什麼</h3>
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
                          <small><strong>怎麼驗證</strong>${escapeHtml(item.observable_test)}</small>
                          <small><strong>目前證據</strong>${escapeHtml(item.evidence)}</small>
                        </article>`,
                    )
                    .join("")}
                </div>
              </section>
              <section class="journal-column">
                <header>
                  <span>02</span>
                  <h3>我們驗證了什麼</h3>
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
                  <h3>我們學到了什麼</h3>
                </header>
                <ol class="journal-list">
                  ${researchJournal.lessons
                    .map((item) => `<li>${escapeHtml(item)}</li>`)
                    .join("")}
                </ol>
              </section>
              <section class="journal-column next">
                <header>
                  <span>04</span>
                  <h3>下一步怎麼精進</h3>
                </header>
                <div class="next-step-list">
                  ${researchJournal.next_steps
                    .map(
                      (item) => `
                        <article class="next-step">
                          <div class="next-step-head">
                            <span>${escapeHtml(item.priority)}</span>
                            <strong>${escapeHtml(item.gap)}</strong>
                          </div>
                          <p>${escapeHtml(item.action)}</p>
                          <small><strong>完成條件</strong>${escapeHtml(item.acceptance_test)}</small>
                          ${renderSourceLinks(item.source_urls)}
                        </article>`,
                    )
                    .join("")}
                </div>
              </section>
            </div>
            <ul class="rebalance-warnings">${renderList(researchJournal.warnings, "無提醒", glossaryText)}</ul>
          </section>

          <section class="panel decision-compare" id="decision-compare" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">決策差異終端</span>
                <h2>比較任兩輪配置與十大理由</h2>
              </div>
              <span class="panel-meta">${escapeHtml(comparableRecommendations.length)} 次建議<br />公開研究</span>
            </header>
            <div class="privacy-boundary">
              <strong>建議與實際部位比較：私人資料，不在公開網站發布</strong>
              <p>公開網站只比較相鄰兩輪研究建議；實際部位與成交紀錄僅能在私人環境中依使用者確認資料計算。</p>
            </div>
            ${
              comparableRecommendations.length >= 2
                ? `
                  <div class="comparison-controls">
                    <label>
                      <span>起始決策</span>
                      <select data-compare-from>
                        ${comparableRecommendations
                          .map(
                            (item, index) =>
                              `<option value="${escapeHtml(item.run_id)}"${index === comparableRecommendations.length - 2 ? " selected" : ""}>${escapeHtml(item.run_id)}</option>`,
                          )
                          .join("")}
                      </select>
                    </label>
                    <span class="comparison-arrow">→</span>
                    <label>
                      <span>目標決策</span>
                      <select data-compare-to>
                        ${comparableRecommendations
                          .map(
                            (item, index) =>
                              `<option value="${escapeHtml(item.run_id)}"${index === comparableRecommendations.length - 1 ? " selected" : ""}>${escapeHtml(item.run_id)}</option>`,
                          )
                          .join("")}
                      </select>
                    </label>
                  </div>
                  <div data-compare-result></div>`
                : `<p class="methodology-note">目前只有一輪可比較建議；累積第二輪後才會啟用差異檢視。</p>`
            }
          </section>

          <section class="panel archive" id="archive" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">公開決策封存</span>
                <h2>歷史決策、討論與驗證</h2>
              </div>
              <span class="panel-meta">${escapeHtml(history.length)}<br />公開紀錄</span>
            </header>
            <div class="committee-intro">
              <p>
                公開資訊與非個人資料會保留在此。內容包含結構化提案、批判、${agentLink("cio")} 決策與
                假設績效驗證；不包含實際帳戶、來源帳戶、個人識別、成交或隱藏推理。
              </p>
            </div>
            <div class="archive-list">
              ${history
                .slice()
                .reverse()
                .map((record) => renderHistoricalRecord(record))
                .join("")}
            </div>
          </section>

          <section class="panel" id="risk" data-tab-section="overview">
            <header class="panel-header">
              <div>
                <span class="section-kicker">風險關卡</span>
                <h2>風險與失效條件</h2>
              </div>
              <span class="panel-meta">${escapeHtml(committee.final_decision.risk_veto ? "否決" : "通過")}<br />風險審查</span>
            </header>
            <div class="risk-grid">
              <div class="risk-box">
                <h3>主要風險</h3>
                <ul>${recommendation.major_risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>
              <div class="risk-box">
                <h3>策略失效條件</h3>
                <ul>${recommendation.invalidation_conditions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
              </div>
            </div>
          </section>
    </div>

    <footer class="footer">
      <span>僅供研究參考 · 不含實際帳戶或下單流程</span>
      <span>市場資料 ${escapeHtml(market.source)}</span>
      <span>最後更新 ${escapeHtml(dateTime(system.updated_at))}</span>
      <span>每日收盤後重新驗證與決策</span>
    </footer>
  </div>
    `;
    installTabNavigation();
    installPerformanceChart(performance.points);
    installDecisionComparison(comparableRecommendations);
  };

  render(payload);
}
