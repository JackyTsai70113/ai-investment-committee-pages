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

  const percent = (value, signed = false) => {
    const numeric = Number(value || 0) * 100;
    const sign = signed && numeric > 0 ? "+" : "";
    return `${sign}${numeric.toFixed(0)}%`;
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

  const allocationRows = (actual, recommendation) => {
    const actualBySymbol = new Map(
      actual.positions.map((position) => [position.symbol, Number(position.weight)]),
    );
    return recommendation.allocations.map((allocation) => {
      const current = actualBySymbol.get(allocation.symbol) || 0;
      return {
        ...allocation,
        current,
        delta: Number(allocation.target_weight) - current,
      };
    });
  };

  const render = ({ actual, recommendation, committee, activity, market, system }) => {
    const isDemo = recommendation.status !== "live";
    const rows = allocationRows(actual, recommendation);
    const invested = recommendation.allocations
      .filter((item) => item.symbol !== "CASH")
      .reduce((total, item) => total + Number(item.target_amount_usd), 0);
    const cash = recommendation.allocations.find((item) => item.symbol === "CASH");
    const scoreAngle = `${recommendation.model_score * 3.6}deg`;
    const donut = buildDonut(recommendation.allocations);
    const latestEvent = activity.at(-1);

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
            <span class="pill ${isDemo ? "demo" : "live"}">${isDemo ? "DEMO DATA" : "LIVE RUN"}</span>
            <span class="pill">${escapeHtml(system.version)}</span>
          </div>
        </header>

        <section class="hero">
          <div class="hero-main">
            <span class="eyebrow">Investment brief / ${escapeHtml(recommendation.run_id)}</span>
            <h1>6,000 美元，<br /><span>一個可稽核的決策。</span></h1>
            <p class="hero-lede">
              八位獨立研究 Agent、兩位批判者與一位 CIO，把市場觀點壓縮成一份
              可驗證、不可自動執行的目標配置。
            </p>
            <div class="hero-strip">
              <span class="pill">資料截止 ${escapeHtml(dateTime(recommendation.data_cutoff))}</span>
              <span class="pill">風險 ${escapeHtml(recommendation.risk_level)}</span>
              <span class="pill">人工執行限定</span>
            </div>
          </div>
          <aside class="hero-side">
            <div
              class="score-orbit"
              style="--score-angle:${escapeHtml(scoreAngle)}"
              aria-label="Model Score ${escapeHtml(recommendation.model_score)} out of 100"
            >
              <span class="score-number">${escapeHtml(recommendation.model_score)}<small>/100</small></span>
              <span class="score-caption">Model Score<br />不是成功機率</span>
            </div>
            <p class="side-note">${escapeHtml(recommendation.expected_horizon)}</p>
          </aside>
        </section>

        ${
          isDemo
            ? `<aside class="alert" role="status">
                <strong>DEMO DATA</strong>
                <p>${escapeHtml(recommendation.disclaimer)}</p>
              </aside>`
            : ""
        }

        <section class="metrics" aria-label="Portfolio overview">
          <article class="metric">
            <span class="metric-label">實際資產</span>
            <strong class="metric-value">${money(actual.total_value_usd)}</strong>
            <span class="metric-foot">使用者確認 · ${escapeHtml(actual.source)}</span>
          </article>
          <article class="metric">
            <span class="metric-label">建議投入</span>
            <strong class="metric-value">${money(invested)}</strong>
            <span class="metric-foot">建議，不代表已成交</span>
          </article>
          <article class="metric">
            <span class="metric-label">建議現金</span>
            <strong class="metric-value">${money(cash?.target_amount_usd || 0)}</strong>
            <span class="metric-foot">${percent(cash?.target_weight || 0)} 流動性緩衝</span>
          </article>
          <article class="metric">
            <span class="metric-label">委員會</span>
            <strong class="metric-value">${escapeHtml(committee.proposals.length + committee.critiques.length + 1)}</strong>
            <span class="metric-foot">${escapeHtml(committee.proposals.length)} Agent · 2 批判 · 1 CIO</span>
          </article>
        </section>

        <div class="dashboard-grid">
          <section class="panel allocation" id="portfolio">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Target Allocation</span>
                <h2>建議配置</h2>
              </div>
              <span class="panel-meta">${money(recommendation.capital_usd)}<br />TOTAL</span>
            </header>
            <div class="allocation-layout">
              <div class="donut" style="--donut:${escapeHtml(donut)}">
                <div class="donut-center">
                  <strong>${recommendation.allocations.length}</strong>
                  <span>assets</span>
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
          </section>

          <section class="panel delta" id="delta">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Actual vs Recommended</span>
                <h2>部位差異</h2>
              </div>
              <span class="panel-meta">ONLY EXECUTIONS<br />CHANGE ACTUAL</span>
            </header>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>標的</th>
                    <th>實際</th>
                    <th>建議</th>
                    <th>差異</th>
                    <th>金額</th>
                    <th>動作</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (item) => `
                        <tr>
                          <td><span class="symbol">${escapeHtml(item.symbol)}</span></td>
                          <td>${percent(item.current)}</td>
                          <td>${percent(item.target_weight)}</td>
                          <td class="${item.delta >= 0 ? "delta-positive" : "delta-negative"}">
                            ${percent(item.delta, true)}
                          </td>
                          <td>${money(item.target_amount_usd)}</td>
                          <td><span class="action-chip ${escapeHtml(item.action)}">${escapeHtml(item.action)}</span></td>
                        </tr>`,
                    )
                    .join("")}
                </tbody>
              </table>
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
                    </article>`,
                )
                .join("")}
            </div>
          </section>

          <section class="panel committee" id="committee">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Independent Views</span>
                <h2>委員會投票</h2>
              </div>
              <span class="panel-meta">${escapeHtml(committee.mode)}<br />${escapeHtml(committee.agent_model)}</span>
            </header>
            <div class="committee-list">
              ${committee.proposals
                .map(
                  (proposal) => `
                    <div class="agent-row">
                      <span class="agent-name">
                        <strong>${escapeHtml(proposal.agent)}</strong>
                        <span>${escapeHtml(proposal.arguments[0])}</span>
                      </span>
                      <span class="stance">${escapeHtml(proposal.stance.replaceAll("_", " "))}</span>
                      <span class="confidence">${escapeHtml(proposal.confidence)}/100</span>
                    </div>`,
                )
                .join("")}
            </div>
          </section>

          <section class="panel activity" id="activity">
            <header class="panel-header">
              <div>
                <span class="section-kicker">Append-only Audit</span>
                <h2>操作紀錄</h2>
              </div>
              <span class="panel-meta">${escapeHtml(activity.length)}<br />EVENTS</span>
            </header>
            <div class="timeline">
              ${activity
                .slice()
                .reverse()
                .map(
                  (event) => `
                    <article class="timeline-item">
                      <strong>${escapeHtml(event.event_type.replaceAll("_", " "))}</strong>
                      <p>${escapeHtml(event.summary)}</p>
                      <time datetime="${escapeHtml(event.occurred_at)}">${escapeHtml(dateTime(event.occurred_at))}</time>
                    </article>`,
                )
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
          <span>${escapeHtml(latestEvent?.summary || "")}</span>
        </footer>
      </div>
    `;
  };

  Promise.all([
    fetchJson("actual_portfolio.json"),
    fetchJson("recommendation.json"),
    fetchJson("committee.json"),
    fetchJson("activity.json"),
    fetchJson("market_snapshot.json"),
    fetchJson("system.json"),
  ])
    .then(([actual, recommendation, committee, activity, market, system]) =>
      render({ actual, recommendation, committee, activity, market, system }),
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
