(() => {
  "use strict";

  const root = document.getElementById("dashboard-root");
  const base = (root?.dataset.base || ".").replace(/\/$/, "");
  const colors = ["#c7f15b", "#67b7ff", "#ae91ff", "#ff9864", "#7ecb83", "#f3f0d8"];

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const money = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const preciseMoney = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  const percent = (value, signed = false) => {
    const numeric = Number(value || 0) * 100;
    const sign = signed && numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(0)}%`;
  };

  const assetTypeLabel = (value) => {
    const labels = {
      stock: "個股",
      etf: "ETF",
      leveraged_etf: "槓桿 ETF",
      inverse_etf: "反向 ETF",
      commodity_etf: "商品 ETF",
      cash: "現金",
    };
    return labels[value] || String(value || "未分類").replaceAll("_", " ");
  };

  const dateTime = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Unavailable";
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Taipei",
    }).format(parsed);
  };

  const fetchJson = async (name) => {
    const response = await fetch(`${base}/data/${name}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
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

  const renderList = (items, emptyMessage = "未提供") => {
    const values = Array.isArray(items) ? items : [];
    if (values.length === 0) return `<li class="empty-item">${escapeHtml(emptyMessage)}</li>`;
    return values.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
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

  const researchStatusLabel = (value) => {
    const labels = {
      untested: "尚未驗證",
      partially_tested: "部分驗證",
      supported: "暫時支持",
      challenged: "受到挑戰",
      invalidated: "已失效",
      mixed: "證據混合",
      too_early: "樣本太早",
      insufficient: "樣本不足",
      provisional: "暫定",
      usable: "可評估",
    };
    return labels[value] || String(value || "未分類");
  };

  const pipelineFailureLabel = (value) => {
    const labels = {
      provider_rate_limited: "模型配額／限速",
      provider_rpm_limit: "每分鐘請求數（RPM）",
      provider_tpm_limit: "每分鐘 Token 數（TPM）",
      provider_daily_quota: "當日模型配額",
      provider_model_capacity: "模型容量不足",
      provider_auth: "模型驗證／權限",
      provider_invalid_request: "無效模型請求",
      provider_unavailable: "模型服務不可用",
      credential_missing: "憑證未設定",
      committee_error: "委員會執行錯誤",
    };
    return labels[value] || String(value || "未知");
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
                      <ul>${renderList(review.assessment?.supported_points)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>挑戰原決策的證據</h3>
                      <ul>${renderList(review.assessment?.challenged_points)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>公開方法與限制</h3>
                      <ul>${renderList(review.methodology?.warnings)}</ul>
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
                            <strong>${escapeHtml(proposal.agent)}</strong>
                            <span>${escapeHtml(proposal.stance)} · ${escapeHtml(proposal.confidence)}/100</span>
                          </header>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>論點</h3>
                              <ol>${renderList(proposal.arguments)}</ol>
                            </section>
                            <section class="committee-block">
                              <h3>風險</h3>
                              <ul>${renderList(proposal.risks)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>失效條件</h3>
                              <ul>${renderList(proposal.invalidation_conditions)}</ul>
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
                            <strong>${escapeHtml(critique.reviewer)}</strong>
                            <span>${critique.veto_recommended ? "建議否決" : "不否決"}</span>
                          </header>
                          <p>${escapeHtml(critique.strongest_objection)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>隱含假設</h3>
                              <ul>${renderList(critique.hidden_assumptions)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>要求修正</h3>
                              <ul>${renderList(critique.required_changes)}</ul>
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
    pipelineHealth,
    researchJournal,
    dashboardAnalytics,
    providerTelemetry,
  }) => {
    const isLive = recommendation.status === "live";
    const statusLabel = isLive ? "CURRENT RESEARCH" : "RESEARCH REVIEW";
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
    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark">AIC</span>
            <span class="brand-copy">
              <strong>AI Investment Committee</strong>
              <span>GitOps Portfolio Research</span>
            </span>
          </div>
          <div class="topbar-meta">
            <span class="pill ${isLive ? "live" : "review"}">${statusLabel}</span>
            <span class="pill">${escapeHtml(system.version)}</span>
          </div>
        </header>

        <section class="hero">
          <div class="hero-main">
            <span class="eyebrow">Investment brief / ${escapeHtml(recommendation.run_id)}</span>
            <h1>6,000 美元，<br /><span>一個可稽核的決策。</span></h1>
            <p class="hero-lede">
              十個專業研究角色、兩位批判者與一位 CIO，把市場觀點壓縮成一份
              可驗證、不可自動執行的目標配置。
            </p>
            <div class="hero-strip">
              <span class="pill">資料截止 ${escapeHtml(dateTime(recommendation.data_cutoff))}</span>
              <span class="pill">風險 ${escapeHtml(recommendation.risk_level)}</span>
              <span class="pill">研究建議 · 尚未執行</span>
            </div>
          </div>
          <aside class="hero-side">
            <div
              class="score-orbit"
              style="--score-angle:${escapeHtml(scoreAngle)}"
              aria-label="Model Score ${escapeHtml(recommendation.model_score)} out of 100"
            >
              <span class="score-number">${escapeHtml(modelScore)}<small>/100</small></span>
              <span class="score-caption">委員共識度<br />不是成功機率</span>
            </div>
            <div class="score-explainer">
              <strong>${escapeHtml(scoreBand)}</strong>
              <p>${escapeHtml(scoreReason)}</p>
              <small>100 代表方向高度一致且無批判者否決；0 代表方向高度衝突。與報酬、勝率及「配置有多好」無關。</small>
            </div>
            <p class="side-note">建議重新驗證期：${escapeHtml(recommendation.expected_horizon)}</p>
          </aside>
        </section>

        <aside class="execution-notice" role="status">
          <strong>READ-ONLY RESEARCH</strong>
          <p>
            研究建議／尚未執行／不自動下單。
            ${escapeHtml(recommendation.disclaimer)}
          </p>
        </aside>

        <aside class="policy-notice" role="status">
          <strong>HARD EXCLUSION POLICY</strong>
          <p>
            不得購買或推薦：
            ${dashboardAnalytics.excluded_symbols
              .map((symbol) => `<span>${escapeHtml(symbol)}</span>`)
              .join("")}
          </p>
        </aside>

        <aside class="pipeline-notice ${pipelineHealth.status}" role="status">
          <div>
            <strong>${pipelineHealth.status === "healthy" ? "PIPELINE HEALTHY" : "PIPELINE FAILED · 沿用前次決策"}</strong>
            <p>${escapeHtml(pipelineHealth.message)}</p>
          </div>
          <div class="pipeline-facts">
            <span>最近嘗試 ${escapeHtml(dateTime(pipelineHealth.attempted_at))}</span>
            <span>最近成功 ${escapeHtml(pipelineHealth.last_successful_run_id)}</span>
            ${
              pipelineHealth.status === "failed"
                ? `<span>原因 ${escapeHtml(pipelineFailureLabel(pipelineHealth.failure_kind))}</span>`
                : ""
            }
            ${
              safeExternalUrl(pipelineHealth.run_url)
                ? `<a href="${escapeHtml(pipelineHealth.run_url)}" target="_blank" rel="noopener noreferrer">查看執行紀錄</a>`
                : ""
            }
          </div>
        </aside>

        <section class="metrics" aria-label="Portfolio overview">
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
            <span class="metric-foot">${escapeHtml(committee.proposals.length)} Agent · ${escapeHtml(committee.critiques.length)} 批判 · 1 CIO</span>
          </article>
        </section>

        <section class="terminal-grid" aria-label="Bloomberg-style strategy analytics">
          <article class="terminal-card health-terminal">
            <div class="terminal-card-head">
              <div>
                <span class="section-kicker">Portfolio Health Score</span>
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
                <span class="section-kicker">Risk-adjusted Analytics</span>
                <h2>績效統計</h2>
              </div>
              <span class="research-status ${escapeHtml(analyticsPerformance.sample_status)}">${escapeHtml(researchStatusLabel(analyticsPerformance.sample_status))}</span>
            </div>
            <div class="terminal-stats">
              <div><span>累積報酬</span><strong>${statistic(analyticsPerformance.total_return_percent, "%")}</strong></div>
              <div><span>最大回撤</span><strong>${statistic(analyticsPerformance.maximum_drawdown_percent, "%")}</strong></div>
              <div><span>Sharpe</span><strong>${statistic(analyticsPerformance.sharpe_ratio)}</strong></div>
              <div><span>勝率</span><strong>${statistic(analyticsPerformance.win_rate_percent, "%")}</strong></div>
            </div>
            <p>${escapeHtml(analyticsPerformance.methodology)}</p>
            <div class="telemetry-strip">
              <span>最近模型執行 ${escapeHtml(providerTelemetry.status)}</span>
              <span>${escapeHtml(providerTelemetry.total_requests)} requests</span>
              <span>${escapeHtml(providerTelemetry.total_retries)} retries</span>
              <span>${escapeHtml(providerTelemetry.total_estimated_input_tokens)} estimated input tokens</span>
              <span>failure ${escapeHtml(providerTelemetry.terminal_failure_category)}</span>
            </div>
          </article>
        </section>

        <div class="dashboard-grid">
          <section class="panel leaderboard" id="leaderboard">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Agent Leaderboard</span>
                <h2>各 Agent 命中率排行榜</h2>
              </div>
              <span class="panel-meta">SHADOW TEST<br />NOT VOTE WEIGHTS</span>
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
                    <th>Agent</th>
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
                          <td><span class="symbol">${escapeHtml(item.agent)}</span></td>
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

          <section class="panel strategy" id="portfolio">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Short-term Allocation</span>
                <h2>6,000 美元短線建議配置</h2>
              </div>
              <span class="panel-meta">RESEARCH ONLY<br />NOT EXECUTED</span>
            </header>
            <div class="strategy-layout">
              <div class="allocation-visual">
                <div class="donut" style="--donut:${escapeHtml(donut)}">
                  <div class="donut-center">
                    <strong>${money(recommendation.capital_usd)}</strong>
                    <span>strategy capital</span>
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
                            <td data-label="標的"><span class="symbol">${escapeHtml(item.symbol)}</span></td>
                            <td data-label="建議金額">${money(item.target_amount_usd)}</td>
                            <td data-label="佔 6,000 比例">${percent(item.target_weight)}</td>
                            <td data-label="類型"><span class="asset-type">${escapeHtml(assetTypeLabel(item.asset_type))}</span></td>
                            <td data-label="研究／風控備註" class="allocation-note">${escapeHtml(item.note)}</td>
                          </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section class="panel" id="reasons">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Committee Rationale</span>
                <h2>十大理由</h2>
              </div>
              <span class="panel-meta">10 / 10<br />STRUCTURED</span>
            </header>
            <div class="reasons-grid">
              ${recommendation.top_reasons
                .map(
                  (reason) => `
                    <article class="reason-card">
                      <span class="reason-number">${String(reason.id).padStart(2, "0")}</span>
                      <h3>${escapeHtml(reason.title)}</h3>
                      <p>${escapeHtml(reason.summary)}</p>
                      <div class="reason-meta">
                        <span>${escapeHtml(reason.category)}</span>
                        <span>score ${escapeHtml(reason.confidence)}</span>
                      </div>
                      ${renderSourceLinks(reason.source_urls)}
                    </article>`,
                )
                .join("")}
            </div>
          </section>

          <section class="panel committee" id="committee">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Committee Replay / Full Record</span>
                <h2>委員會實際內容</h2>
              </div>
              <span class="panel-meta">${escapeHtml(committee.mode)}<br />${escapeHtml(committee.agent_model)}</span>
            </header>
            <div class="committee-intro">
              <p>
                每位 Agent 的觀點、理由、風險與失效條件均完整保留。
                以下是結構化研究摘要，不包含隱藏推理過程。
              </p>
            </div>
            ${
              committee.decision_origin === "policy_override"
                ? `
                  <div class="policy-override-note">
                    <strong>本輪最終配置已套用使用者硬限制</strong>
                    <ul>${renderList(committee.policy_override_notes)}</ul>
                  </div>`
                : ""
            }
            <div class="committee-replay" aria-label="Committee replay">
              <article>
                <span>01</span>
                <strong>資料封存</strong>
                <small>${escapeHtml(dateTime(recommendation.data_cutoff))}</small>
              </article>
              <article>
                <span>02</span>
                <strong>獨立提案</strong>
                <small>${escapeHtml(committee.proposals.length)} 位 Agent</small>
              </article>
              <article>
                <span>03</span>
                <strong>反方批判</strong>
                <small>${escapeHtml(committee.critiques.length)} 份 Critique</small>
              </article>
              <article>
                <span>04</span>
                <strong>否決協商</strong>
                <small>${escapeHtml((committee.critique_resolutions || []).length)} 次裁決</small>
              </article>
              <article>
                <span>05</span>
                <strong>CIO 決策</strong>
                <small>${escapeHtml(committee.final_decision.market_stance)}</small>
              </article>
            </div>
            <div class="committee-list proposal-list">
              ${committee.proposals
                .map(
                  (proposal) => `
                    <details class="committee-card">
                      <summary>
                        <span class="agent-name">
                          <strong>${escapeHtml(proposal.agent)}</strong>
                          <span>${escapeHtml((proposal.arguments || [])[0] || "查看完整內容")}</span>
                        </span>
                        <span class="stance">${escapeHtml(proposal.stance.replaceAll("_", " "))}</span>
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
                            <ol>${renderList(proposal.arguments)}</ol>
                          </section>
                          <section class="committee-block">
                            <h3>主要風險</h3>
                            <ul>${renderList(proposal.risks)}</ul>
                          </section>
                          <section class="committee-block">
                            <h3>失效條件</h3>
                            <ul>${renderList(proposal.invalidation_conditions)}</ul>
                          </section>
                        </div>
                      </div>
                    </details>`,
                )
                .join("")}
            </div>

            <div class="committee-subsection">
              <header class="subsection-header">
                <span class="section-kicker">Cross Examination</span>
                <h3>Risk 與 Devil's Advocate 批判</h3>
              </header>
              <div class="critique-grid">
                ${committee.critiques
                  .map(
                    (critique) => `
                      <article class="critique-card">
                        <div class="critique-heading">
                          <strong>${escapeHtml(critique.reviewer)}</strong>
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
                          <ul>${renderList(critique.hidden_assumptions)}</ul>
                        </section>
                        <section class="committee-block">
                          <h3>要求修正</h3>
                          <ul>${renderList(critique.required_changes)}</ul>
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
                        <span class="section-kicker">Reconciliation Gate</span>
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
                                  <strong>${escapeHtml(response.reviewer)}</strong>
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
                                    <ul>${renderList(response.conceded_points)}</ul>
                                    <ul>${renderList(response.proposed_changes)}</ul>
                                  </section>
                                  <section class="committee-block">
                                    <h3>證據式反駁</h3>
                                    <ul>${renderList(response.rebuttals)}</ul>
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
                  <span class="section-kicker">CIO Synthesis</span>
                  <h3>最終結論</h3>
                </div>
                <div class="cio-score">
                  <strong>${escapeHtml(committee.final_decision.model_score)}</strong>
                  <span>委員共識度</span>
                </div>
              </header>
              <div class="decision-facts">
                <span>市場立場 <strong>${escapeHtml(committee.final_decision.market_stance)}</strong></span>
                <span>風險 <strong>${escapeHtml(committee.final_decision.risk_level)}</strong></span>
                <span>Risk Gate <strong>${escapeHtml(committee.final_decision.risk_veto ? "VETO" : "PASSED")}</strong></span>
              </div>
              <p class="decision-horizon">${escapeHtml(committee.final_decision.expected_horizon)}</p>
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
                        <small>${escapeHtml(item.note)}</small>
                      </article>`,
                  )
                  .join("")}
              </div>
            </div>
          </section>

          <section class="panel rebalance" id="rebalance">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Research Rebalance Brief</span>
                <h2>本輪建議如何調整</h2>
              </div>
              <span class="panel-meta">${escapeHtml(rebalance.pricing_session)} 收盤<br />RESEARCH ONLY</span>
            </header>
            <p class="methodology-note">${escapeHtml(rebalance.basis)}</p>
            <div class="table-wrap strategy-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>標的</th>
                    <th>方向</th>
                    <th>建議金額變化</th>
                    <th>估算股數變化</th>
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
                          <td data-label="估算股數變化">
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
            <ul class="rebalance-warnings">${renderList(rebalance.warnings)}</ul>
          </section>

          <section class="panel performance" id="performance">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Hypothetical Strategy Index</span>
                <h2>USD 6,000 假設策略走勢</h2>
              </div>
              <span class="panel-meta">${escapeHtml(performance.points.length)}<br />VALUATIONS</span>
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
              <article class="provisional">
                <span>盤中暫估</span>
                <strong>${preciseMoney(researchJournal.performance.provisional_intraday_value_usd)}</strong>
                <small>${escapeHtml(researchJournal.performance.provisional_intraday_return_percent)}% · ${escapeHtml(dateTime(researchJournal.performance.provisional_intraday_at))}</small>
              </article>
              <article>
                <span>前一配置短窗</span>
                <strong>+${escapeHtml(researchJournal.performance.provisional_period_return_percent)}%</strong>
                <small>${escapeHtml(researchStatusLabel(researchJournal.performance.sample_assessment))}</small>
              </article>
            </div>
            <p class="methodology-note provisional-note">
              盤中暫估會隨市場變動，不是正式收盤績效。${escapeHtml(researchJournal.performance.methodology)}
            </p>
          </section>

          <section class="panel evidence" id="evidence">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Evidence Engine</span>
                <h2>市場、財報與來源證據</h2>
              </div>
              <span class="panel-meta">${escapeHtml((market.features || []).length)} FEATURES<br />${escapeHtml((market.filing_events || []).length)} FILINGS</span>
            </header>
            ${
              market.regime
                ? `
                  <div class="regime-grid">
                    <article><span>趨勢狀態</span><strong>${escapeHtml(market.regime.trend)}</strong></article>
                    <article><span>波動狀態</span><strong>${escapeHtml(market.regime.volatility)}</strong></article>
                    <article><span>利率狀態</span><strong>${escapeHtml(market.regime.rates)}</strong></article>
                  </div>
                  <ul class="evidence-notes">${renderList(market.regime.evidence)}</ul>`
                : `<p class="methodology-note">這份舊資料尚未包含 deterministic 市場狀態；下一次正式委員會會開始產生。</p>`
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
                                <td>${escapeHtml(item.symbol)}</td>
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
                            <span>${escapeHtml(event.symbol)} · ${escapeHtml(event.form)}</span>
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
                                  <td>${escapeHtml(fact.symbol)}</td>
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
                          (source) => `
                            <article class="source-card">
                              <header>
                                <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.name)}</a>
                                <span>${source.active ? "引擎支援" : "候選來源"}</span>
                              </header>
                              <p>${escapeHtml(source.intended_use)}</p>
                              <small>${escapeHtml(source.cadence)} · ${escapeHtml(source.typical_latency)}</small>
                              <ul>${renderList(source.limitations)}</ul>
                            </article>`,
                        )
                        .join("")}
                    </div>
                  </details>`
                : ""
            }
            <ul class="rebalance-warnings">${renderList(market.warnings)}</ul>
          </section>

          <section class="panel learning" id="learning">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Learning Loop</span>
                <h2>這次假設驗證，我們學到什麼？</h2>
              </div>
              <span class="panel-meta">${escapeHtml(learning.verdict)}<br />${escapeHtml(dateTime(learning.evaluation_cutoff))}</span>
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
                        <span>confidence ${escapeHtml(lesson.confidence)}</span>
                        <span>${escapeHtml(lesson.affected_assets.join(" · "))}</span>
                      </div>
                    </article>`,
                )
                .join("")}
            </div>
            <div class="committee-columns learning-decisions">
              <section class="committee-block">
                <h3>委員會修正</h3>
                <ul>${renderList(learning.committee_changes)}</ul>
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

          <section class="panel research-journal" id="research-journal">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Daily AI Journal</span>
                <h2>每日 AI 投資日誌：假設、驗證與學習</h2>
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
                            <strong>Evidence</strong>
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
            <ul class="rebalance-warnings">${renderList(researchJournal.warnings)}</ul>
          </section>

          <section class="panel decision-compare" id="decision-compare">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Decision Diff Terminal</span>
                <h2>比較任兩輪配置與十大理由</h2>
              </div>
              <span class="panel-meta">${escapeHtml(comparableRecommendations.length)} RUNS<br />PUBLIC RESEARCH</span>
            </header>
            <div class="privacy-boundary">
              <strong>Recommendation vs Actual：私人資料，不在公開網站發布</strong>
              <p>${escapeHtml(dashboardAnalytics.actual_comparison_message)}</p>
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

          <section class="panel archive" id="archive">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Public Decision Archive</span>
                <h2>歷史決策、討論與驗證</h2>
              </div>
              <span class="panel-meta">${escapeHtml(history.length)}<br />PUBLIC RECORDS</span>
            </header>
            <div class="committee-intro">
              <p>
                公開資訊與非個人資料會保留在此。內容包含結構化提案、批判、CIO 決策與
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

          <section class="panel" id="risk">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Risk Gate</span>
                <h2>風險與失效條件</h2>
              </div>
              <span class="panel-meta">${escapeHtml(committee.final_decision.risk_veto ? "VETO" : "PASSED")}<br />RISK REVIEW</span>
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
          <span>${escapeHtml(system.execution_policy)} · broker access ${escapeHtml(system.broker_access)}</span>
          <span>市場資料 ${escapeHtml(market.source)}</span>
          <span>最後更新 ${escapeHtml(dateTime(system.updated_at))}</span>
          <span>每日收盤後重新驗證與決策</span>
        </footer>
      </div>
    `;
    installPerformanceChart(performance.points);
    installDecisionComparison(comparableRecommendations);
  };

  Promise.all([
    fetchJson("recommendation.json"),
    fetchJson("committee.json"),
    fetchJson("market_snapshot.json"),
    fetchJson("system.json"),
    fetchJson("history.json"),
    fetchJson("learning.json"),
    fetchJson("performance.json"),
    fetchJson("rebalance.json"),
    fetchJson("pipeline_health.json"),
    fetchJson("research_journal.json"),
    fetchJson("dashboard_analytics.json"),
    fetchJson("provider_telemetry.json"),
  ])
    .then(
      ([
        recommendation,
        committee,
        market,
        system,
        history,
        learning,
        performance,
        rebalance,
        pipelineHealth,
        researchJournal,
        dashboardAnalytics,
        providerTelemetry,
      ]) =>
        render({
          recommendation,
          committee,
          market,
          system,
          history,
          learning,
          performance,
          rebalance,
          pipelineHealth,
          researchJournal,
          dashboardAnalytics,
          providerTelemetry,
        }),
    )
    .catch((error) => {
      root.innerHTML = `
        <section class="error-state" role="alert">
          <span class="section-kicker">Data Load Failed</span>
          <h1>無法載入投資委員會資料</h1>
          <p>靜態資料未完成或格式驗證失敗。</p>
          <pre>${escapeHtml(error.message)}</pre>
        </section>`;
    });
})();
