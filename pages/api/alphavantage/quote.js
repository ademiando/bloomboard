// pages/api/alphavantage/quote.js
// Proxy to AlphaVantage: /api/alphavantage/quote?symbol=INCO.JK
// Requires ALPHAVANTAGE_API_KEY in environment variables

const CACHE_TTL = 12 * 1000; // cache 12s
const cache = new Map();

export default async function handler(req, res) {
  try {
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: "symbol required" });

    const key = `alphav:${symbol.toString().toUpperCase()}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && (now - cached.ts) < CACHE_TTL) {
      return res.status(200).json({ ...cached.data, _cached: true });
    }

    const apiKey = process.env.ALPHAVANTAGE_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ALPHAVANTAGE_API_KEY not configured" });

    // Use GLOBAL_QUOTE as standard
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: "alphavantage fetch failed", detail: text });
    }
    const json = await r.json();

    // normalize to make client parsing easier:
    // return the raw JSON but also expose a lightweight normalized object
    const normalized = {};
    const g = json["Global Quote"] || {};
    if (g && Object.keys(g).length) {
      normalized["05. price"] = g["05. price"] || g["05. price"];
      normalized.price = parseFloat(g["05. price"] || 0);
    }

    const out = { raw: json, normalized };
    cache.set(key, { ts: Date.now(), data: out });

    return res.status(200).json(out);
  } catch (err) {
    console.error("alphav proxy err", err);
    return res.status(500).json({ error: "internal_error", detail: String(err) });
  }
}