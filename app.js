import { loadDashboardPayload } from "./data.js";
import { bootstrapDashboard } from "./dashboard.js";

const root = document.getElementById("dashboard-root");
const base = (root?.dataset.base || ".").replace(/\/$/, "");

loadDashboardPayload(base)
  .then((payload) => bootstrapDashboard(root, payload))
  .catch((error) => {
    root.innerHTML = `<section class="error-state" role="alert"><span class="section-kicker">資料載入失敗</span><h1>無法載入投資委員會資料</h1><p>靜態資料未完成或格式驗證失敗。</p><pre>${String(error.message)}</pre></section>`;
  });
