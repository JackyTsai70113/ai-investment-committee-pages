import { loadDashboardPayload } from "./data.js";
import { bootstrapDashboard } from "./dashboard.js";
import { registerDashboardWebMCP } from "./webmcp.js";

const root = document.getElementById("dashboard-root");
const base = (root?.dataset.base || ".").replace(/\/$/, "");

loadDashboardPayload(base)
  .then((payload) => {
    bootstrapDashboard(root, payload, base);
    registerDashboardWebMCP(root);
  })
  .catch((error) => {
    const message = String(error.message);
    const retry = message.includes("資料版本不一致")
      ? '<button type="button" data-retry-dashboard>重新載入</button>'
      : "";
    root.innerHTML = `<section class="error-state" role="alert"><span class="section-kicker">資料載入失敗</span><h1>無法載入投資委員會資料</h1><p>${message.includes("資料版本不一致") ? "網站資料正在更新，請重新載入後再查看。" : "靜態資料未完成或格式驗證失敗。"}</p>${retry}<pre>${message}</pre></section>`;
    root.querySelector("[data-retry-dashboard]")?.addEventListener("click", () => window.location.reload());
  });
