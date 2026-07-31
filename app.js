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

  const safeExternalUrl = (value) => {
    try {
      const parsed = new URL(String(value));
      return parsed.protocol === "https:" ? parsed.href : null;
    } catch {
      return null;
    }
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

  const render = ({ recommendation, committee, activity, market, system }) => {
    const isLive = recommendation.status === "live";
    const statusLabel = isLive ? "CURRENT RESEARCH" : "RESEARCH REVIEW";
    const invested = recommendation.allocations
      .filter((item) => item.symbol !== "CASH")
      .reduce((total, item) => total + Number(item.target_amount_usd), 0);
    const cash = recommendation.allocations.find((item) => item.symbol === "CASH");
    const modelScore = Math.max(0, Math.min(100, Number(recommendation.model_score) || 0));
    const scoreAngle = `${modelScore * 3.6}deg`;
    const donut = buildDonut(recommendation.allocations);
    const latestEvent = activity.at(-1);
    const committeeSize = committee.proposals.length + committee.critiques.length + 1;

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
              八個專業研究角色、兩位批判者與一位 CIO，把市場觀點壓縮成一份
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
              <span class="score-caption">Model Score<br />不是成功機率</span>
            </div>
            <p class="side-note">${escapeHtml(recommendation.expected_horizon)}</p>
          </aside>
        </section>

        <aside class="execution-notice" role="status">
          <strong>READ-ONLY RESEARCH</strong>
          <p>
            研究建議／尚未執行／不自動下單。
            ${escapeHtml(recommendation.disclaimer)}
          </p>
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

        <div class="dashboard-grid">
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
                <span class="section-kicker">Full Committee Record</span>
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
            </div>

            <div class="cio-decision">
              <header class="cio-header">
                <div>
                  <span class="section-kicker">CIO Synthesis</span>
                  <h3>最終結論</h3>
                </div>
                <div class="cio-score">
                  <strong>${escapeHtml(committee.final_decision.model_score)}</strong>
                  <span>Model Score</span>
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
                        <strong>${escapeHtml(item.symbol)}</strong>
                        <span>${percent(item.target_weight)}</span>
                        <small>${escapeHtml(item.note)}</small>
                      </article>`,
                  )
                  .join("")}
              </div>
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
    .then(([, recommendation, committee, activity, market, system]) =>
      render({ recommendation, committee, activity, market, system }),
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
