const cache = new Map();
const MIXED_GENERATION_MESSAGE = "資料版本不一致，請重新整理後重試。";

function assertDecisionIdentity(snapshot, recommendation, committee) {
  const expectedRun = snapshot?.recommendation_run_id;
  if (
    typeof snapshot?.generation_id !== "string" ||
    !expectedRun ||
    recommendation?.run_id !== expectedRun ||
    committee?.run_id !== expectedRun
  ) {
    throw new Error(MIXED_GENERATION_MESSAGE);
  }
  return snapshot;
}

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

  const fetchOptionalJson = async (name) => {
    try {
      return await fetchJson(name);
    } catch (error) {
      if (String(error?.message || "").includes("HTTP 404")) return null;
      throw error;
    }
  };

  const loadOverviewPayload = async () => {

  const [
    recommendation,
    committee,
    market,
    system,
    learning,
    performance,
    rebalance,
    researchJournal,
    dashboardAnalytics,
    decisionSnapshot,
  ] = await Promise.all([
    fetchJson("recommendation.json"),
    fetchJson("committee_summary.json"),
    fetchJson("market_snapshot.json"),
    fetchJson("system.json"),
    fetchJson("learning.json"),
    fetchJson("performance.json"),
    fetchJson("rebalance.json"),
    fetchJson("research_journal.json"),
    fetchJson("dashboard_analytics.json"),
    fetchJson("decision_snapshot.json"),
  ]);

    const decisionIdentity = assertDecisionIdentity(decisionSnapshot, recommendation, committee);
    return { recommendation, committee, market, system, learning, performance, rebalance, researchJournal, dashboardAnalytics, decisionIdentity, agentProfiles: {} };
  };

  const loadCommitteePayload = () => fetchJson("committee.json");
  const loadAgentProfiles = () => fetchJson("agent_profiles.json");
  const loadResearchExtensions = async (expectedIdentity) => {
    const [thesisBook, earningsReviews, marketIntelligence, extensionStatus, decisionSnapshot] = await Promise.all([
      fetchOptionalJson("thesis_book.json"),
      fetchOptionalJson("extension_earnings_reviews.json"),
      fetchOptionalJson("market_intelligence.json"),
      fetchOptionalJson("research_extension_status.json"),
      fetchJson("decision_snapshot.json"),
    ]);
    if (
      decisionSnapshot?.generation_id !== expectedIdentity?.generation_id ||
      decisionSnapshot?.recommendation_run_id !== expectedIdentity?.recommendation_run_id
    ) {
      throw new Error(MIXED_GENERATION_MESSAGE);
    }
    return { thesisBook, earningsReviews, marketIntelligence, extensionStatus };
  };

  return { loadOverviewPayload, loadCommitteePayload, loadAgentProfiles, loadResearchExtensions };
}

export function loadDashboardPayload(base) {
  return createDataLoader(base).loadOverviewPayload();
}
