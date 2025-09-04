// app/api/yahoo/quote/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const symbols = url.searchParams.get("symbols") || "";
    if (!symbols) return NextResponse.json({ quoteResponse: { result: [] } });

    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ quoteResponse: { result: [] } }, { status: 502 });
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("API /api/yahoo/quote error:", err);
    return NextResponse.json({ quoteResponse: { result: [] } }, { status: 500 });
  }
}