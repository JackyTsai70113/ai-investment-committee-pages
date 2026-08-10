export async function loadDashboardPayload(base) {
  const fetchJson = async (name) => {
    const response = await fetch(`${base}/data/${name}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  };

  const [
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
    agentProfiles,
  ] = await Promise.all([
    fetchJson("recommendation.json"),
    fetchJson("committee.json"),
    fetchJson("market_snapshot.json"),
    fetchJson("system.json"),
    fetchJson("history.json"),
    fetchJson("learning.json"),
    fetchJson("performance.json"),
    fetchJson("rebalance.json"),
    fetchJson("research_journal.json"),
    fetchJson("dashboard_analytics.json"),
    fetchJson("agent_profiles.json"),
  ]);

  return { recommendation, committee, market, system, history, learning, performance, rebalance, researchJournal, dashboardAnalytics, agentProfiles };
}
