import { NextResponse } from "next/server";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("symbol");
  if (!ticker) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}