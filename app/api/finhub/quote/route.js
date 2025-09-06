import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol)
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const apiKey = process.env.FINNHUB_API_KEY;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
        symbol
      )}&token=${apiKey}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: "Finnhub fetch failed", detail: text }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data); // data.c = current price
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}