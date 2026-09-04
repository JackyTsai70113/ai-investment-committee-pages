const sections = Object.freeze({
  overview: "總覽",
  committee: "委員會實際內容",
  "agent-intel": "角色觀點",
  glossary: "術語表",
});

const toolResponse = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const pageText = (element) =>
  element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 4000) || "目前沒有可讀內容。";

export function registerDashboardWebMCP(root) {
  const modelContext = globalThis.navigator?.modelContext;
  if (!root || !modelContext?.registerTool || root.dataset.webmcpRegistered === "true") return;

  const register = (tool) => {
    try {
      modelContext.registerTool(tool);
      return true;
    } catch {
      return false;
    }
  };

  const registered = [
    register({
      name: "get_investment_dashboard_overview",
      description: "讀取投資研究儀表板的目前分頁、可用區段與頁面摘要。只讀，不會變更研究配置。",
      inputSchema: { type: "object", properties: {} },
      execute: async () =>
        toolResponse({
          active_section:
            root.querySelector("[data-tab-trigger][aria-selected=true]")?.getAttribute("aria-label") ||
            sections.overview,
          available_sections: sections,
          headline: pageText(root.querySelector(".hero h1")),
        }),
    }),
    register({
      name: "open_investment_dashboard_section",
      description: "切換投資研究儀表板的既有區段。可選總覽、委員會實際內容、角色觀點或術語表。只改變目前畫面，不會修改任何資料或配置。",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: Object.keys(sections),
            description: "要開啟的區段識別值。",
          },
        },
        required: ["section"],
      },
      execute: async ({ section }) => {
        const trigger = root.querySelector(`[data-tab-trigger][data-tab-target="${section}"]`);
        if (!trigger) {
          return {
            isError: true,
            content: [{ type: "text", text: "找不到指定的儀表板區段。" }],
          };
        }
        trigger.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return toolResponse({ opened_section: sections[section], section });
      },
    }),
    register({
      name: "read_current_investment_dashboard_section",
      description: "讀取目前開啟的投資研究儀表板區段文字摘要。只讀，不會修改資料或配置。",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        const activeTab = root.querySelector("[data-tab-trigger][aria-selected=true]");
        const panelId = activeTab?.getAttribute("aria-controls");
        return toolResponse({
          section: activeTab?.getAttribute("aria-label") || sections.overview,
          content: pageText(panelId ? root.querySelector(`#${panelId}`) : null),
        });
      },
    }),
    register({
      name: "set_investment_dashboard_sidebar",
      description: "展開或收合儀表板側欄，讓使用者以完整導覽或窄圖示欄瀏覽。只改變介面顯示，不會修改資料或配置。",
      inputSchema: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["expanded", "collapsed"],
            description: "側欄顯示模式。",
          },
        },
        required: ["mode"],
      },
      execute: async ({ mode }) => {
        const shell = root.querySelector(".app-shell");
        const isCollapsed = shell?.classList.contains("sidebar-collapsed") || false;
        const shouldCollapse = mode === "collapsed";
        if (isCollapsed !== shouldCollapse) root.querySelector("[data-sidebar-toggle]")?.click();
        return toolResponse({ sidebar: shouldCollapse ? "已收合" : "已展開" });
      },
    }),
  ].some(Boolean);

  if (registered) root.dataset.webmcpRegistered = "true";
}
