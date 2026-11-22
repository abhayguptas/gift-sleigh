const SHOPIFY_MCP_URL = "https://catalog.shopify.com/api/ucp/mcp";
const SHOPIFY_PROFILE_URL =
  "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json";

function parseJsonOrSse(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {}
  }
  let lastObj = null;
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload);
      lastObj = obj;
      if (obj?.result || obj?.error) return obj;
    } catch {}
  }
  return lastObj;
}

export async function queryShopifyCatalog(query, limit = 1, withShipsToFilter = true) {
  const catalog = {
    query: String(query || "").trim() || "gift",
    view: "compact",
    pagination: { limit: Math.min(5, Math.max(1, Number(limit) || 1)) },
    context: { address_country: "AU", currency: "AUD" },
  };
  if (withShipsToFilter) {
    catalog.filters = { ships_to: { country: "AU" } };
  }

  const rpcBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "search_catalog",
      arguments: {
        meta: {
          "ucp-agent": {
            profile: SHOPIFY_PROFILE_URL,
          },
        },
        catalog,
      },
    },
  };

  const res = await fetch(SHOPIFY_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(rpcBody),
    signal: AbortSignal.timeout(12000),
  });

  const text = await res.text();
  const parsed = parseJsonOrSse(text);
  const rawProducts = parsed?.result?.structuredContent?.products || [];

  const qLower = String(query || "").toLowerCase();
  const audience = qLower.includes("kid")
    ? "kids"
    : qLower.includes("teen") || qLower.includes("desk")
      ? "teens"
      : qLower.includes("blanket") || qLower.includes("grand")
        ? "grandparents"
        : qLower.includes("pet") || qLower.includes("dog") || qLower.includes("cat")
          ? "pets"
          : "adults";

  const items = [];
  for (const p of rawProducts) {
    const v = Array.isArray(p?.variants) && p.variants.length > 0 ? p.variants[0] : null;
    if (!v || !v.url) continue;
    const rawAmount = v.price?.amount;
    const isAud = !v.price?.currency || String(v.price.currency).toUpperCase() === "AUD";
    const parsedPrice =
      typeof rawAmount === "number"
        ? Number((rawAmount / 100).toFixed(2))
        : typeof rawAmount === "string" && !Number.isNaN(Number(rawAmount))
          ? Number((Number(rawAmount) / 100).toFixed(2))
          : null;
    const price = isAud ? parsedPrice : null;
    const title = String(p.title || v.title || "").replace(/["\\\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    const store = String(v.seller?.name || "").replace(/["\\\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    items.push({
      name: title,
      url: String(v.url),
      price_aud: price,
      store,
      audience,
      description: title,
      reason: "Great Christmas gift",
    });
  }

  if (items.length === 0 && withShipsToFilter) {
    return queryShopifyCatalog(query, limit, false);
  }

  return items.length === 1 ? items[0] : items;
}
