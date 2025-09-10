// app/api/alpha/route.js
import { NextResponse } from "next/server";

const CACHE = {};
const TTL = 8000;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });

    const key = process.env.ALPHA_VANTAGE_KEY;
    if (!key) return NextResponse.json({ error: "ALPHA_VANTAGE_KEY not set" }, { status: 500 });

    const cacheKey = `alpha:${symbol}`;
    const now = Date.now();
    if (CACHE[cacheKey] && (CACHE[cacheKey].expires > now)) {
      return NextResponse.json(CACHE[cacheKey].data);
    }

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "alpha fetch failed", status: res.status, body: text }, { status: 502 });
    }
    const json = await res.json();

    // parse price if available
    const g = json["Global Quote"] || json["Global quote"] || {};
    const rawPrice = parseFloat(g["05. price"] || g["05. Price"] || g["05. price"] || 0);
    const out = { raw: json, price: isFinite(rawPrice) ? rawPrice : null };

    CACHE[cacheKey] = { data: out, expires: now + TTL };
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}