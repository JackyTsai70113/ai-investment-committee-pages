export const asList = (value) => (Array.isArray(value) ? value : []);

export function createAgentProfileRenderers({
  profiles,
  escapeHtml,
  normalizeAgentName,
  dateTime,
}) {
  const profileOrder = Object.keys(profiles);
  const roleLabels = {
    macro: "總體經濟",
    technical: "技術分析",
    momentum: "動能",
    news: "新聞事件",
    etf: "交易所交易基金分析",
    earnings: "財報分析",
    portfolio: "組合配置",
    liquidity: "流動性",
    ownership: "持有人結構",
    learning: "績效學習",
    risk: "風險審查",
    devil_advocate: "反方審查",
    cio: "最終決策",
    execution_governance: "執行治理",
    trading_stress: "交易壓力",
  };
  const roleLabel = (value) => roleLabels[normalizeAgentName(value)] || String(value || "角色");

  const agentLink = (value) => {
    const key = normalizeAgentName(value);
    const profile = profiles[key];
    if (!profile) return `<strong>${escapeHtml(roleLabel(key))}</strong>`;
    return `
      <a
        class="agent-profile-link"
        href="#agent-profile-${escapeHtml(key)}"
        title="查看 ${escapeHtml(profile.title)} 的角色說明"
        aria-label="查看 ${escapeHtml(profile.title)} 的角色說明"
        onclick="event.stopPropagation()"
      >ⓘ ${escapeHtml(roleLabel(key))}</a>`;
  };

  const renderAgentDirectory = () => `
    <section class="agent-directory" id="agent-directory" aria-labelledby="agent-directory-title">
        <header class="agent-directory-header">
          <div>
            <span class="section-kicker">角色目錄</span>
            <h3 id="agent-directory-title">認識投資委員會</h3>
          </div>
          <p>點擊委員會紀錄中的研究員名稱，可直接跳到角色說明；每位角色都提供白話定位與當前國際脈絡對位。</p>
        </header>
      <div class="agent-profile-grid">
        ${profileOrder
          .map((key) => {
            const profile = profiles[key];
            return `
              <article class="agent-profile-card" id="agent-profile-${escapeHtml(key)}">
                <header>
                  <span>ⓘ ${escapeHtml(roleLabel(key))}</span>
                  <h4>${escapeHtml(roleLabel(key))}</h4>
                  <p>${escapeHtml(profile.summary)}</p>
                </header>
                <p class="agent-profile-intro">白話版定位：本頁僅說明角色責任；實際本輪觀點請看下方角色卡。</p>
                <dl>
                  <div><dt>負責內容</dt><dd>${escapeHtml(profile.responsibility)}</dd></div>
                  <div><dt>使用資訊</dt><dd>${escapeHtml(profile.inputs)}</dd></div>
                  <div><dt>存在原因</dt><dd>${escapeHtml(profile.purpose)}</dd></div>
                  <div><dt>目標</dt><dd>${escapeHtml(profile.goal)}</dd></div>
                  <div><dt>範圍界線</dt><dd>${escapeHtml(profile.boundary)}</dd></div>
                </dl>
                <a class="agent-profile-back" href="#committee">返回委員會內容</a>
              </article>`;
          })
          .join("")}
      </div>
    </section>`;

  const stanceLabels = {
    strong_bullish: "明確偏多",
    bullish: "偏多",
    neutral: "中性",
    bearish: "偏空",
    strong_bearish: "明確偏空",
  };

  const renderAgentIntelligencePanel = (committee, market) => {
    const insights = asList(committee?.role_insights);
    const reviewOutcomes = asList(committee?.review_outcomes);
    const cards = insights
      .map((insight) => {
        const role = normalizeAgentName(insight.agent);
        const preferredAssets = asList(insight.preferred_assets)
          .map((asset) => String(asset || "").trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 5);
        const cashPreference = Number(insight.cash_preference);
        const cashPreferenceLabel = Number.isFinite(cashPreference)
          ? `${(cashPreference * 100).toFixed(0)}%`
          : "未提供";
        const observations = asList(insight.observations).slice(0, 2);
        const risks = asList(insight.risks).slice(0, 1);
        const invalidations = asList(insight.invalidation_conditions).slice(0, 1);
        const questions = asList(insight.questions).slice(0, 2);
        const responses = asList(insight.responses).slice(0, 2);
        return `
          <article class="agent-intel-card">
            <header class="agent-intel-header">
              <div>
                <span class="agent-intel-role">${escapeHtml(roleLabel(role))}</span>
                <strong>${escapeHtml(roleLabel(role))}</strong>
              </div>
              <span class="agent-intel-stance">${escapeHtml(stanceLabels[insight.stance] || "未判定")} · 信心 ${escapeHtml(insight.confidence ?? "—")}</span>
            </header>
            <p class="agent-intel-summary">${escapeHtml(insight.opening_statement || "本輪未提供可公開的角色結論。")}</p>
            <div class="agent-intel-focus"><strong>配置取向：</strong>優先留意 ${escapeHtml(preferredAssets.join("、") || "未提供")}；現金偏好 ${escapeHtml(cashPreferenceLabel)}。這是角色研究取向，不是實際帳戶持倉。</div>
            <div class="agent-intel-signal"><h4>實際觀察</h4><ul>${observations.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>本輪未產出可公開觀察。</li>"}</ul></div>
            <div class="agent-intel-global"><h4>主要風險／失效條件</h4><ul>${[...risks, ...invalidations].map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>本輪未產出可公開風險條件。</li>"}</ul></div>
            ${questions.length ? `<div class="agent-intel-focus"><strong>已被質詢：</strong>${questions.map((item) => `${escapeHtml(roleLabel(item.reviewer))}：${escapeHtml(item.question)}`).join("；")}</div>` : ""}
            ${responses.length ? `<div class="agent-intel-focus"><strong>質詢後回應：</strong>${responses.map((item) => `${escapeHtml(roleLabel(item.reviewer))}：${escapeHtml(item.answer)}${asList(item.conceded_points).length ? `（承認限制：${escapeHtml(item.conceded_points[0])}）` : ""}${asList(item.proposed_changes).length ? `（調整：${escapeHtml(item.proposed_changes[0])}）` : ""}`).join("；")}</div>` : ""}
            <div class="agent-intel-link">${agentLink(role)}</div>
          </article>`;
      })
      .join("");

    return `
      <section class="panel agent-intel" data-tab-section="agent-intel" id="agent-intel">
        <header class="panel-header">
          <div><span class="section-kicker">交易角色觀點</span><h2>交易/研究角色市場情境導覽</h2></div>
          <span class="panel-meta">${escapeHtml(dateTime(market.research_generated_at || market.generated_at))}<br />以目前快照為主</span>
        </header>
        <div class="panel-intro"><p>每張卡只顯示該角色本輪實際輸出的觀察與風險條件；共同市場事實不會冒充為多位角色各自的結論。公開內容不包含提示詞或隱藏思考鏈。</p></div>
        <div class="agent-intel-grid">${cards || "<p>本輪未產出可公開的角色觀點。</p>"}</div>
        ${reviewOutcomes.length ? `<section class="agent-intel-outcomes" aria-label="本輪質詢結論"><h3>本輪質詢結論</h3><ul>${reviewOutcomes.map((item) => `<li><strong>${escapeHtml(roleLabel(item.reviewer))}：${escapeHtml(item.outcome)}</strong>。${escapeHtml(item.summary)}${asList(item.unresolved_objections).length ? ` 未解保留：${escapeHtml(item.unresolved_objections[0])}` : ""}</li>`).join("")}</ul></section>` : ""}
      </section>`;
  };

  return { agentLink, renderAgentDirectory, renderAgentIntelligencePanel };
}
