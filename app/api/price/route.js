// app/api/price/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "Missing symbols query param" }, { status: 400 });
  }

  try {
    // Fetch from Yahoo Finance
    const yfRes = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`, {
      // no-store to always get fresh
      cache: "no-store",
    });

    if (!yfRes.ok) {
      const text = await yfRes.text();
      return NextResponse.json({ error: "Yahoo fetch failed", detail: text }, { status: 502 });
    }
    const data = await yfRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}