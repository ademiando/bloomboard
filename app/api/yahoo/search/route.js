// app/api/yahoo/search/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    if (!q) return NextResponse.json({ quotes: [] });

    // fetch Yahoo search server-side (no CORS problem)
    const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ quotes: [] }, { status: 502 });
    }
    const json = await res.json();
    // return raw Yahoo payload (client will parse)
    return NextResponse.json(json);
  } catch (err) {
    console.error("API /api/yahoo/search error:", err);
    return NextResponse.json({ quotes: [] }, { status: 500 });
  }
}