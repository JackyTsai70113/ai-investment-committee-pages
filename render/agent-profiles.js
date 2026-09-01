export const asList = (value) => (Array.isArray(value) ? value : []);

export function createAgentProfileRenderers({
  profiles,
  escapeHtml,
  normalizeAgentName,
  dateTime,
}) {
  const formatRegionLabel = (value) => String(value || "Global").trim();

  const isInternational = (evidence) =>
    String(evidence.region || "").toLowerCase() !== "us";

  const evidenceToRegionalItem = (item) => `${formatRegionLabel(item.region)}｜${item.title}`;

  const profileOrder = Object.keys(profiles);

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

  const agentLink = (value) => {
    const key = normalizeAgentName(value);
    const profile = profiles[key];
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

  const renderAgentDirectory = (market) => `
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
                  <div><dt>負責內容</dt><dd>${escapeHtml(profile.responsibility)}</dd></div>
                  <div><dt>目前國際對位</dt><dd>${escapeHtml((insight.globalPulse || []).slice(0, 4).join("；") || "尚未產生可用跨區脈絡")}</dd></div>
                  <div><dt>使用資訊</dt><dd>${escapeHtml(profile.inputs)}</dd></div>
                  <div><dt>存在原因</dt><dd>${escapeHtml(profile.purpose)}</dd></div>
                  <div><dt>目標</dt><dd>${escapeHtml(profile.goal)}</dd></div>
                  <div><dt>不負責</dt><dd>${escapeHtml(profile.boundary)}</dd></div>
                </dl>
                <a class="agent-profile-back" href="#committee">返回委員會內容</a>
              </article>`;
          })
          .join("")}
      </div>
    </section>`;

  const renderAgentIntelligencePanel = (market) => {
    const cards = profileOrder
      .map((role) => {
        const profile = profiles[role];
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
            <div class="agent-intel-signal"><h4>本輪快照解讀</h4><ul>${evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
            <div class="agent-intel-global"><h4>國際情勢對位</h4><ul>${globalPulse.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>目前尚未看到明確全球對位。</li>"}</ul></div>
            <p class="agent-intel-focus"><strong>對應重點：</strong>${escapeHtml(insight.focus)}</p>
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
        <div class="panel-intro"><p>每位角色先有白話自介，再依「近期市況＋政策＋國際情勢」做責任邊界內的切片解讀。資料不補述歷史假設，僅以可追溯欄位判斷。</p></div>
        <div class="agent-intel-grid">${cards}</div>
      </section>`;
  };

  return { agentLink, renderAgentDirectory, renderAgentIntelligencePanel };
}
