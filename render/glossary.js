export function createGlossaryRenderer(escapeHtml) {
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

  const applyLinks = (value) => Object.values(glossary).reduce(
    (result, entry) => entry.patterns.reduce(
      (memo, pattern) => memo.replaceAll(
        pattern,
        (match) => `<a class="glossary-term-link" href="#glossary-${escapeHtml(entry.id)}" data-tab="glossary">${match}</a>`,
      ),
      result,
    ),
    escapeHtml(String(value || "")),
  );

  const render = () => `
    <section class="panel glossary" data-tab-section="glossary" id="glossary">
      <header class="panel-header">
        <div><span class="section-kicker">術語表</span><h2>術語與政策解釋</h2></div>
        <span class="panel-meta">可點入</span>
      </header>
      <div class="glossary-grid">${Object.values(glossary).map((entry) => `
        <article class="glossary-card" id="glossary-${escapeHtml(entry.id)}">
          <h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.definition)}</p>
        </article>`).join("")}</div>
    </section>`;

  return { applyLinks, render };
}
