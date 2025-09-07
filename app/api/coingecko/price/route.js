// app/api/coingecko/price/route.js
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");
    const vs_currencies = searchParams.get("vs_currencies") || "usd";

    if (!ids) {
      return NextResponse.json({ error: "Missing ids param" }, { status: 400 });
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${encodeURIComponent(vs_currencies)}`;
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
