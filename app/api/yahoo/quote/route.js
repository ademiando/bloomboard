// app/api/yahoo/quote/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json(
      { error: "Missing symbol query param" },
      { status: 400 }
    );
  }

  try {
    const yfRes = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );

    if (!yfRes.ok) {
      const text = await yfRes.text();
      return NextResponse.json(
        { error: "Yahoo fetch failed", detail: text },
        { status: 502 }
      );
    }

    const data = await yfRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}