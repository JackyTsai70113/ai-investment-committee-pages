export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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
    etf: "ETF",
    leveraged_etf: "槓桿 ETF",
    inverse_etf: "反向 ETF",
    commodity_etf: "商品 ETF",
    cash: "現金",
  };
  return labels[value] || String(value || "未分類").replaceAll("_", " ");
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
