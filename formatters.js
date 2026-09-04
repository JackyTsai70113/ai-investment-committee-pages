export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const DISPLAY_TRANSLATIONS = [
  ["固定每週檢驗（5 個交易日）", "每次資料更新後重新檢視"],
  ["固定週度驗證：每 5 個交易日（週一至週五）更新一次", "每次資料更新後重新檢視"],
  ["3 日與 7 日", "短期"],
  ["3日與7日", "短期"],
  ["3日及7日", "短期"],
  ["3 日、7 日", "短期"],
  ["3 日或 7 日", "短期"],
  ["完整 3 日視窗", "完整短期視窗"],
  ["完整 7 日視窗", "完整短期視窗"],
  ["3 日滾動報酬", "短期滾動報酬"],
  ["7 日滾動報酬", "短期滾動報酬"],
  ["3 日視窗", "短期視窗"],
  ["7 日視窗", "短期視窗"],
  ["官方事件限制期間啟動", "官方事件資料完整性提示"],
  ["政策限制", "研究警示"],
  ["任何風險曝險都不合規，故目前只適合 100% 現金 的研究狀態", "不對短期報酬作保證，配置由最新委員會研究結果決定"],
  ["所有市場風險部位都必須歸零", "依最新委員會研究結果調整市場風險部位"],
  ["政策已將保證模式下的風險資產上限設為 0%，並由程式驗證，不依賴模型自行遵守。", "短期報酬與配置，由最新委員會研究結果決定。"],
  ["本輪逐標的風險權重不得高於上一份研究建議，上一份風險資產合計為 0%；目前提案未增加風險，因此配置權重維持不變。", "事件資料缺口僅影響事件時間與因果解讀，不直接限制配置方向或權重。"],
  ["官方事件限制期間阻止新增風險", "官方事件資料完整性提示"],
  ["現金配置維持至下一個完成交易日檢視；任何非現金曝險須在補齊3/7日完成交易日證據後重新審核。", "每次取得新資料後重新檢視配置；短期證據只作研究評估，不設定固定持有天數限制。"],
  ["研究建議維持全部資金為現金，不代表交易已執行；在短窗統計、事件對齊與跳空檢查未完成前，不新增方向性曝險。", "目前快照的研究建議為現金配置；重新執行委員會後更新方向。"],
  ["只能維持 CASH/觀察", "可維持現金或觀察"],
  ["只能維持 現金/觀察", "可維持現金或觀察"],
  ["不可更新的配置欄位", "需要後續研究確認的配置欄位"],
  ["缺資料欄位鎖定", "缺資料研究警示"],
  ["3／7日", "短期"],
  ["3/7日", "短期"],
  ["3／7", "短期"],
  ["3/7", "短期"],
  ["completed_windows", "已完成區間"],
  ["positive_windows", "正報酬區間"],
  ["latest_return_percent", "最近報酬率"],
  ["short_window_evidence", "短期證據"],
  ["point-in-time", "特定時間點"],
  ["close-to-close", "收盤至收盤"],
  ["forward-fill", "向前填補"],
  ["not_applicable", "不適用"],
  ["not_ready", "尚未具備"],
  ["unavailable", "無法取得"],
  ["provider_invalid_response", "資料供應商回應無效"],
  ["gross_below_both_hurdles", "毛報酬低於兩項門檻"],
  ["gross_meets_return_target_only", "毛報酬僅達到報酬目標"],
  ["gross_beats_benchmark_only", "毛報酬僅超越基準"],
  ["gross_meets_dual_hurdle", "毛報酬同時達到兩項門檻"],
  ["gross", "毛報酬"],
  ["proxy", "代理值"],
  ["tax", "稅務"],
  ["FX", "外匯"],
  ["excluded", "未納入"],
  ["partial", "部分"],
  ["error", "錯誤"],
  ["failure", "失敗"],
  ["failed", "失敗"],
  ["missing", "缺失"],
  ["ready", "可比較"],
  ["provisional", "暫定"],
  ["too_early", "尚未開始"],
  ["coverage", "覆蓋範圍"],
  ["cutoff", "截止時間"],
  ["benchmark", "基準"],
  ["challenge set", "比較組"],
  ["performance", "績效"],
  ["daily bars", "每日行情"],
  ["regular session", "正常交易時段"],
  ["look-through coverage", "穿透式持倉覆蓋"],
  ["Look-through coverage", "穿透式持倉覆蓋"],
  ["correlation coverage", "相關性資料覆蓋"],
  ["provider", "資料供應商"],
  ["invalidation", "失效條件"],
  ["earnings", "財報"],
  ["Sharpe", "夏普"],
  ["Cboe", "芝加哥選擇權交易所"],
  ["curve: level=", "曲線：水準為 "],
  ["shape=", "形狀為 "],
  ["contango_like", "近月低於遠月"],
  ["mixed", "混合"],
  ["normal", "一般"],
  ["holdings", "持倉"],
  ["issuer", "發行人"],
  ["sector", "產業"],
  ["delayed", "延遲"],
  ["stop order", "交易指令"],
  ["exempt", "免估算"],
  ["regime", "市場狀態"],
  ["trend", "趨勢"],
  ["rates", "利率"],
  ["rising", "上升"],
  ["features", "特徵"],
  ["bid-ask", "買賣報價"],
  ["spread", "價差"],
  ["complete", "完整"],
  ["supported", "暫時支持"],
  ["challenged", "受到挑戰"],
  ["volatility_curve", "波動率期限結構"],
  ["curve_", "曲線"],
  ["level_bucket", "水準分類"],
  ["fail_closed", "保守停用"],
  ["next-complete-day", "下一個完成交易日"],
  ["event_calendar", "事件日曆"],
  ["hypothetical", "假設"],
  ["via", "透過"],
  ["yfinance", "行情資料服務"],
  ["latest", "最近"],
  ["next-完整-day", "下一個完成交易日"],
  ["ValueError", "資料格式錯誤"],
  ["All required", "所有必要"],
  ["observations", "觀測值"],
  ["aligned", "已對齊"],
  ["fresh", "最新"],
  ["bullish/bearish", "多空"],
  ["investor intent", "投資人意圖"],
  ["OHLCV", "開高低收與成交量"],
  ["US_ECONOMY", "美國經濟"],
  ["Fed", "聯準會"],
  ["minutes/press release", "會議紀要／記者會資料"],
  ["FEDERAL RESERVE", "聯邦準備制度"],
  ["CALENDAR", "日曆"],
  ["MEETINGS", "會議"],
  ["STATEMENTS", "聲明"],
  ["Employment Situation", "就業情勢"],
  ["CPI/PPI", "消費者物價／生產者物價"],
  ["LABOR", "勞動"],
  ["BUREAU OF STATISTICS", "統計局"],
  ["RELEASE SCHEDULE", "發布日程"],
  ["DEPARTMENT OF THE TREASURY", "美國財政部"],
  ["DAILY YIELD CURVE", "每日殖利率曲線"],
  ["GLOBAL FOREIGN EXCHANGE", "全球外匯"],
  ["FULL TEXT SEARCH", "全文檢索"],
  ["NEWS & REPORTS", "新聞與報告"],
  ["World Economic Outlook", "世界經濟展望"],
  ["NEWSRELEASE / DATA", "新聞稿／資料"],
  ["next- day", "下一個完成交易日"],
  ["fiscal_year", "財政年度"],
  ["filed", "已申報"],
  ["hard", "硬性"],
  ["evidence", "證據"],
  ["distance_from_ma20_percent", "距20日移動平均線百分比"],
  ["return_5d_percent", "5日報酬率"],
  ["return_20d_percent", "20日報酬率"],
  ["fundamental_facts", "基本面資料"],
  ["directionality", "方向性"],
  ["gap", "跳空"],
  ["vs.", "相較於"],
  ["execution_governance", "執行治理"],
  ["liquidity", "流動性"],
  ["portfolio", "組合配置"],
  ["learning", "績效學習"],
  ["macro", "總體經濟"],
  ["technical", "技術分析"],
  ["ownership", "持有人結構"],
  ["momentum", "動能"],
  ["latest_return_percent", "最近報酬率"],
  ["latest_return_per", "最近報酬率欄位"],
  ["return_per", "報酬率欄位"],
  ["next-complete-day", "下一個完成交易日"],
  ["All required observations are aligned and fresh.", "所有必要觀測值均已對齊且為最新資料。"],
  ["observations are aligned and fresh.", "觀測值均已對齊且為最新資料。"],
  ["Aggregate OCC volume and open interest do not identify investor intent or bullish/bearish direction.", "OCC 彙總成交量與未平倉量無法辨識投資人意圖或多空方向。"],
  ["reference price", "參考價格"],
  ["regular-session", "正常交易時段"],
  ["daily bar", "日線資料"],
  ["unresolved_gaps", "未解決缺口"],
  ["weighted_contribution_percent", "加權貢獻率"],
  ["deterministic", "確定性"],
  ["blackout", "管制時段"],
  ["window", "區間"],
  ["level", "水準"],
  ["level=", "水準為 "],
  ["etf", "交易所交易基金"],
  ["verdict", "評估結論"],
  ["data_session", "資料交易日"],
  ["point-in-time", "特定時間點"],
  ["FOMC", "聯邦公開市場委員會"],
  ["BLS", "美國勞工統計局"],
  ["NYSE", "紐約證券交易所"],
  ["ETF", "交易所交易基金"],
  ["VIX9D", "9日波動率指數"],
  ["VIX3M", "3個月波動率指數"],
  ["VIX", "波動率指數"],
  ["MA20", "20日移動平均線"],
  ["MA50", "50日移動平均線"],
  ["RSI14", "14日相對強弱指標"],
  ["RSI", "相對強弱指標"],
  ["CASH", "現金"],
];

export const localizeText = (value) => DISPLAY_TRANSLATIONS.reduce(
  (result, [source, target]) => result.replaceAll(source, target),
  String(value ?? ""),
);

export const localizeRenderedText = (root) => {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }
  textNodes.forEach((textNode) => {
    textNode.nodeValue = localizeText(textNode.nodeValue);
  });
};

export const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const preciseMoney = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const percent = (value, signed = false) => {
  const numeric = Number(value || 0) * 100;
  const sign = signed && numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(0)}%`;
};

export const assetTypeLabel = (value) => {
  const labels = {
    stock: "個股",
    etf: "交易所交易基金",
    leveraged_etf: "槓桿型交易所交易基金",
    inverse_etf: "反向型交易所交易基金",
    commodity_etf: "商品型交易所交易基金",
    cash: "現金",
  };
  return labels[value] || localizeText(String(value || "未分類").replaceAll("_", " "));
};

export const dateTime = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "無法取得";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(parsed);
};
