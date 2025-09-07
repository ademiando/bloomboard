// app/api/finnhub/quote/route.js
import { NextResponse } from "next/server";

/**
 * GET /api/finnhub/quote?symbol=AAPL
 * Supports comma-separated symbols: ?symbol=AAPL,MSFT
 *
 * Requires FINNHUB_API_KEY in server environment.
 */

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("symbol");
    if (!raw) {
      return NextResponse.json({ error: "Missing symbol query param" }, { status: 400 });
    }

    const apiKey = process.env.FINNHUB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing FINNHUB_API_KEY environment variable" }, { status: 500 });
    }

    // Accept single or comma-separated symbols
    const symbols = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (symbols.length === 0) {
      return NextResponse.json({ error: "No valid symbol provided" }, { status: 400 });
    }

    // Helper to call Finnhub for one symbol
    const fetchFor = async (symbol) => {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

      if (!res.ok) {
        return { symbol, ok: false, status: res.status, detail: payload };
      }
      // Finnhub returns shape like: { c: current, h, l, o, pc, t }
      return { symbol, ok: true, status: res.status, data: payload };
    };

    if (symbols.length === 1) {
      const out = await fetchFor(symbols[0]);
      if (!out.ok) {
        return NextResponse.json({ error: "Finnhub fetch failed", detail: out.detail }, { status: out.status || 502 });
      }
      // return the Finnhub object directly for single-symbol calls (keeps frontend code simple)
      return NextResponse.json(out.data);
    }

    // multiple symbols -> return array of results
    const results = await Promise.all(symbols.map(s => fetchFor(s)));
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
