const cache = new Map();
const historyId = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export function createDataLoader(base) {
  const fetchJson = (name, { immutable = false } = {}) => {
    const key = `${base}/data/${name}`;
    if (cache.has(key)) return cache.get(key);
    const request = (async () => {
      const response = await fetch(key, { cache: immutable ? "default" : "no-store" });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, request);
    return request;
  };

  const loadOverviewPayload = async () => {

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
  ] = await Promise.all([
    fetchJson("recommendation.json"),
    fetchJson("committee_summary.json"),
    fetchJson("market_snapshot.json"),
    fetchJson("system.json"),
    fetchJson("history/index.json"),
    fetchJson("learning.json"),
    fetchJson("performance.json"),
    fetchJson("rebalance.json"),
    fetchJson("research_journal.json"),
    fetchJson("dashboard_analytics.json"),
  ]);

    return { recommendation, committee, market, system, history, learning, performance, rebalance, researchJournal, dashboardAnalytics, agentProfiles: {} };
  };

  const loadCommitteePayload = () => fetchJson("committee.json");
  const loadHistoryIndex = () => fetchJson("history/index.json");
  const loadHistoryRecord = (id) => {
    if (!historyId.test(id)) throw new Error("invalid history archive id");
    return fetchJson(`history/${id}.json`, { immutable: true });
  };
  const loadAgentProfiles = () => fetchJson("agent_profiles.json");

  return { loadOverviewPayload, loadCommitteePayload, loadHistoryIndex, loadHistoryRecord, loadAgentProfiles };
}

export function loadDashboardPayload(base) {
  return createDataLoader(base).loadOverviewPayload();
}
