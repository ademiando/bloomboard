import { NextResponse } from "next/server";
export async function GET(req){
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get('symbols')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const key = process.env.NEWS_API_KEY;
  if(!key) return NextResponse.json({ articles: [] });
  try{
    const q = encodeURIComponent(symbols.slice(0,5).join(' OR '));
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${key}`;
    const r = await fetch(url); const data = await r.json();
    return NextResponse.json({ articles: data.articles||[] });
  }catch(e){ return NextResponse.json({ articles: [] }); }
}
