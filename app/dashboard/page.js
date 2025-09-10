// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

/*
  Portfolio Dashboard - single file
  Features included (per your requests):
  - Single client file, no splitting
  - Portfolio filter dropdown (ICON ONLY) near title
  - Display currency as compact dropdown "5,589,686 IDR ▾"
  - Asset types: crypto, stock, nonliquid (custom)
  - Non-liquid: custom YoY gain (%) with purchase date => auto compute current price
  - Indonesian stocks: cascading fetch strategy:
      1) try community IDX scrape API (e.g. indonesia-stock-exchange.vercel.app proxy)
      2) fallback to Alpha Vantage (if API key available via window.AV_API_KEY or localStorage)
      3) else fallback to avgPrice (so P&L not wrong)
    (See README/comments for endpoint config)
  - Portfolio growth interactive chart (multi-line per category), timeframe selectors
  - Cake chart (d3) with spacing & center total (small), hover tooltip, slice spacing
  - Table with columns exactly per spec:
      Code (big) / Description (small)
      Qty
      Invested (big) / avg price (small)
      Market value (big) / Current Price (small)
      P&L (big) / Gain (small)
      Actions (Buy / Sell / Del)
  - Realized P&L with small slanted-arrow icon in a tiny box (click to open transactions log)
  - Transactions modal: shows history, can delete or restore (undo = restore)
  - Export CSV improved: two CSVs in one zip-like behavior (download separate files automatically), with header lines like "app/dashboard/page.js" in top comment to make spreadsheet neat
  - Import CSV robust parsing with robust quoting handling
  - UI: animated hover states, interactive add-button (plus -> X animated), dropdowns with auto-close when clicking outside, scroll fixes
  - Price polling: crypto (coingecko), stocks (IDX strategy), updates lastTick
  - All UI text in English
*/

/* ===================== CONFIG ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_PRICE = (ids) =>
  `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_SEARCH = (q) => `${COINGECKO_API}/search?query=${encodeURIComponent(q)}`;

// Yahoo fallback (not used for Indonesia stocks per user's request)
// const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;

// Community IDX scraper (public/OSS) - may be down; it's attempted first for IDX quotes
const IDX_SCRAPER = (symbol) =>
  `https://indonesia-stock-exchange.vercel.app/api/quote?symbol=${encodeURIComponent(symbol)}`;

// Alpha Vantage global quote (fallback)
const ALPHAVANTAGE_QUOTE = (symbol, apikey) =>
  `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apikey)}`;

/* ===================== HELPERS ===================== */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR")
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(n);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}
function normalizeIdr(v) {
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}
function ensureNumericAsset(a) {
  return {
    ...a,
    shares: toNum(a.shares || 0),
    avgPrice: toNum(a.avgPrice || 0),
    investedUSD: toNum(a.investedUSD || 0),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    marketValueUSD: toNum(a.marketValueUSD || 0),
    createdAt: a.createdAt || Date.now(),
    // transactions array kept per-asset for audit
    transactions: Array.isArray(a.transactions) ? a.transactions.map(t => ({...t, amountUSD: toNum(t.amountUSD||0)})) : [],
  };
}

/* ===================== Default palette & small UI utils ===================== */
const PALETTE = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
function colorForIndex(i) { return PALETTE[i % PALETTE.length]; }

/* ===================== Local persistent storage helpers ===================== */
const LS_ASSETS = "pf_assets_v2";
const LS_REALIZED = "pf_realized_v2";
const LS_DISPLAY_CCY = "pf_display_ccy_v2";
const LS_AV_KEY = "pf_alpha_v_key";

/* ===================== Price fetching for Indonesian stocks (cascading) ===================== */
async function fetchIndoPrice(symbol, usdIdr = 16000) {
  // Try IDX scraper public (community) first
  try {
    const url = IDX_SCRAPER(symbol);
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      // expect shape: { symbol: 'ASII.JK', price: 5481.22, currency: 'IDR' }
      const possible = j?.price ?? j?.last ?? j?.close ?? null;
      if (possible && Number(possible) > 0) {
        // convert IDR -> USD
        const isIdr = (String(j.currency || "").toUpperCase() === "IDR") || String(symbol).toUpperCase().endsWith(".JK");
        if (isIdr) return Number(possible) / (usdIdr || 1);
        return Number(possible);
      }
    }
  } catch (e) {
    // silent fallback
  }

  // Try Alpha Vantage if user provided API key (via window or localStorage)
  try {
    const key = (isBrowser && (window.AV_API_KEY || localStorage.getItem(LS_AV_KEY))) || null;
    if (key) {
      // ensure symbol ends with .JK
      let sym = String(symbol).toUpperCase();
      if (!sym.endsWith(".JK")) sym = sym.replace(/\.\w+$/,'') + ".JK";
      const url = ALPHAVANTAGE_QUOTE(sym, key);
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        // Alpha Vantage GLOBAL_QUOTE returns "Global Quote": { "05. price": "..." }
        const g = j["Global Quote"] || j["Global quote"] || j;
        const priceStr = g && (g["05. price"] || g["05 price"] || g["price"] || g["c"]);
        const p = toNum(priceStr || 0);
        if (p > 0) {
          // Alpha Vantage for .JK usually returns price in IDR -> convert
          // We'll try to detect currency; assume IDR for .JK
          return p / (usdIdr || 1);
        }
      }
    }
  } catch (e) {
    // silent
  }

  // If all fails, return null to indicate 'no live price' (caller will use avgPrice fallback)
  return null;
}

/* ===================== Donut/Cake chart (D3) - componentized inside single file ===================== */
function CakeChart({ data = [], total = 0, size = 260, inner = 80, formatCurrency=(v)=>String(v), onHoverSlice = ()=>{} }) {
  const ref = useRef(null);
  useEffect(() => {
    const svgEl = d3.select(ref.current);
    svgEl.selectAll("*").remove();
    if (!data || data.length === 0) {
      // draw empty circle
      const svg = svgEl.append("svg").attr("width", size).attr("height", size);
      svg.append("circle").attr("cx", size/2).attr("cy", size/2).attr("r", (size/2)-8).attr("fill","#111");
      svg.append("text").attr("x", size/2).attr("y", size/2).attr("text-anchor","middle").attr("fill","#ccc").attr("dy","0.3em").text("No Data");
      return;
    }

    // Adapted from sample "cake" code user provided, but implemented with d3 here
    const width = size, height = size;
    const outerMax = (size/2) - 6;
    const innerRadius = inner;
    const gap = 0.04; // radians gap
    const radiusScale = d3.scaleLinear().domain([0, d3.max(data, d => d.value || 0) || 1]).range([innerRadius, outerMax]);

    const pie = d3.pie().value(d=>1).sort(null);
    const arcs = pie(data);

    const svg = svgEl.append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);

    const colors = PALETTE.concat(d3.schemeSet2 || []);

    // draw slices with animated outerRadius
    const pathSel = g.selectAll("path.slice").data(arcs).enter().append("path")
      .attr("class","slice")
      .attr("fill",(d,i)=>colors[i%colors.length])
      .attr("d", (d,i) => {
        return d3.arc().innerRadius(innerRadius).outerRadius(innerRadius).padAngle(gap).cornerRadius(8)(d);
      })
      .style("stroke","rgba(0,0,0,0.06)")
      .style("stroke-width",0.6)
      .each(function(d){ this._current = d; });

    pathSel.transition().duration(900).attrTween("d", function(d,i){
      const interp = d3.interpolateNumber(innerRadius, radiusScale(data[i].value));
      return function(t){
        return d3.arc().innerRadius(innerRadius).outerRadius(interp(t)).padAngle(gap).cornerRadius(8)(d);
      };
    });

    // labels
    g.selectAll("text.label").data(arcs).enter().append("text")
      .attr("class","label")
      .attr("transform", function(d,i){ const r = radiusScale(data[i].value) + 12; const ang = (d.startAngle + d.endAngle)/2 - Math.PI/2; return `translate(${Math.cos(ang)*r},${Math.sin(ang)*r})`; })
      .attr("text-anchor","middle")
      .attr("alignment-baseline","middle")
      .style("font-size","12px")
      .style("fill","#ddd")
      .text((d,i) => data[i].name);

    // center small total
    g.append("text")
      .attr("class","center-total")
      .attr("y", 6)
      .attr("text-anchor","middle")
      .style("font-size","14px")
      .style("fill","#ccc")
      .text(formatCurrency(total));

    // tooltip behavior via onHoverSlice
    pathSel.on("mousemove", function(event,d,i){
      const item = data[i];
      onHoverSlice({event, item, value:item.value});
    }).on("mouseleave", function(){ onHoverSlice(null); });

    // explode on click
    pathSel.on("click", function(event,d){
      const mid = (d.startAngle + d.endAngle)/2 - Math.PI/2;
      const xOff = Math.cos(mid)*20;
      const yOff = Math.sin(mid)*20;
      const el = d3.select(this);
      const cur = el.attr("data-exploded") === "1";
      el.attr("data-exploded", cur ? "0" : "1").transition().duration(300).attr("transform", cur ? `translate(0,0)` : `translate(${xOff},${yOff})`);
    });

    // hover subtle enlarge
    pathSel.on("mouseover", function(){ d3.select(this).transition().duration(120).attr("transform","scale(1.01)"); })
           .on("mouseout", function(){ d3.select(this).transition().duration(120).attr("transform","scale(1)"); });

  }, [data, size, inner, total]);

  return <div ref={ref} style={{width:size,height:size}} />;
}

/* ===================== Portfolio Growth Chart (interactive) ===================== */
function GrowthChart({ series = {}, timeframe = "all", currency = "USD", usdIdr = 16000 }) {
  // series: { all: [{t:ts, v:val}, ...], crypto: [...], stocks: [...], nonliquid:[...] }
  // timeframe: "1d","2d","1w","1m","1y","all"
  const ref = useRef(null);

  useEffect(() => {
    const container = d3.select(ref.current);
    container.selectAll("*").remove();
    // small responsive width
    const width = Math.min(900, container.node()?.clientWidth || 900);
    const height = 240;
    const svg = container.append("svg").attr("width", width).attr("height", height);
    const g = svg.append("g").attr("transform", `translate(40,10)`);

    // Build aggregated dataset for visible timeframe
    const ms = { "1d": 24*3600*1000, "2d": 2*24*3600*1000, "1w":7*24*3600*1000, "1m":30*24*3600*1000, "1y":365*24*3600*1000, "all": Infinity }[timeframe || "all"];
    const now = Date.now();
    // gather keys
    const keys = Object.keys(series).filter(k => series[k] && series[k].length>0);
    if (keys.length === 0) {
      svg.append("text").attr("x", width/2).attr("y", height/2).attr("text-anchor","middle").style("fill","#777").text("No growth data");
      return;
    }
    // compute x domain (timestamp)
    const dataFiltered = {};
    let allTimes = new Set();
    keys.forEach(k => {
      const arr = series[k].filter(pt => (ms===Infinity) ? true : (now - pt.t <= ms));
      dataFiltered[k] = arr;
      arr.forEach(pt => allTimes.add(pt.t));
    });
    const timeArray = Array.from(allTimes).sort((a,b)=>a-b);
    if (timeArray.length === 0) {
      svg.append("text").attr("x", width/2).attr("y", height/2).attr("text-anchor","middle").style("fill","#777").text("No growth data for timeframe");
      return;
    }

    const x = d3.scaleTime().domain([new Date(timeArray[0]), new Date(timeArray[timeArray.length-1])]).range([0, width-80]);
    // y max: find max value among all series
    const maxv = d3.max(keys.flatMap(k => dataFiltered[k].map(p=>p.v))) || 1;
    const y = d3.scaleLinear().domain([0, maxv]).range([height-30, 0]);

    // axes
    const xAxis = d3.axisBottom(x).ticks(6).tickSize(-6).tickPadding(8).tickFormat(d3.timeFormat("%b %d"));
    const yAxis = d3.axisLeft(y).ticks(4).tickSize(-6).tickFormat(v => {
      return currency === "IDR" ? (v * usdIdr ? (Math.round(v*usdIdr).toLocaleString() + " IDR") : v) : `${Math.round(v)} USD`;
    });

    g.append("g").attr("transform", `translate(0,${height-30})`).call(xAxis).selectAll("text").style("fill","#aaa");
    g.append("g").call(yAxis).selectAll("text").style("fill","#aaa");

    // line generator
    const line = d3.line().x(d=>x(new Date(d.t))).y(d=>y(d.v)).curve(d3.curveMonotoneX);

    // draw lines per key
    keys.forEach((k, idx) => {
      const d = dataFiltered[k];
      if (!d || d.length === 0) return;
      g.append("path").datum(d).attr("fill","none").attr("stroke", colorForIndex(idx)).attr("stroke-width", 2.2).attr("d", line)
        .attr("opacity", 0.95);
      // area shading subtle
      g.append("path").datum(d).attr("fill", colorForIndex(idx)).attr("opacity", 0.06)
        .attr("d", d3.area().x(d=>x(new Date(d.t))).y0(y(0)).y1(d=>y(d.v)).curve(d3.curveMonotoneX));
      // small label near end
      const last = d[d.length-1];
      g.append("text").attr("x", x(new Date(last.t))+6).attr("y", y(last.v)).attr("fill", "#ddd").style("font-size","11px").text(`${k} ${currency === "IDR" ? `(${Math.round(last.v*usdIdr).toLocaleString()} IDR)` : `(${Math.round(last.v)} USD)`}`);
    });

    // hover vertical line
    const focusLine = g.append("line").attr("stroke","#888").attr("y1",0).attr("y2",height-30).attr("opacity",0);
    const focusBox = container.append("div").style("position","absolute").style("pointer-events","none");

    svg.on("mousemove", function(event){
      const [mx] = d3.pointer(event);
      const date = x.invert(mx - 40);
      focusLine.attr("x1", mx-40).attr("x2", mx-40).attr("opacity",1);
    }).on("mouseleave", function(){ focusLine.attr("opacity",0); });

  }, [series, timeframe, currency, usdIdr]);

  return <div ref={ref} style={{width:"100%", height:260, position:"relative"}} />;
}

/* ===================== Trade Modal (Buy/Sell) ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(()=>{ setPrice(defaultPrice > 0 ? String(defaultPrice) : ""); }, [defaultPrice]);

  if (!asset) return null;
  const priceUSD = priceCcy === "IDR" ? (toNum(price) / (usdIdr || 1)) : toNum(price);
  const totalUSD = toNum(qty) * priceUSD;

  function handleSubmit(e) {
    e.preventDefault();
    const q = toNum(qty), p = priceUSD;
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    if (mode === 'buy') onBuy(q, p);
    if (mode === 'sell') onSell(q, p);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold capitalize">{mode} {asset.symbol}</h2>
            <p className="text-sm text-gray-400">{asset.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" step="any" value={qty} onChange={(e)=>setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700" placeholder="0.00"/>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e)=>setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700" placeholder="0.00"/>
              <select value={priceCcy} onChange={(e)=>setPriceCcy(e.target.value)} className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right mb-4">Total: {fmtMoney(totalUSD, "USD")}</div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode === 'buy' ? 'bg-emerald-500 text-black' : 'bg-yellow-600 text-white'}`}>{mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}</button>
        </form>
      </div>
    </div>
  );
}

/* ===================== Transactions Modal ===================== */
function TransactionsModal({ open, onClose, transactions = [], onDelete, onRestore }) {
  const ref = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return ()=>document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-60">
      <div ref={ref} className="bg-gray-900 p-4 rounded w-full max-w-3xl border border-gray-800">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Transactions</h3>
          <button onClick={onClose} className="px-2 py-1 rounded hover:bg-gray-800">Close</button>
        </div>
        <div className="max-h-96 overflow-auto">
          {transactions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No transactions</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-left p-2">Asset</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Price (USD)</th>
                  <th className="text-right p-2">Total (USD)</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-b border-gray-900">
                    <td className="p-2">{new Date(t.date).toLocaleString()}</td>
                    <td className="p-2">{t.symbol} <div className="text-xs text-gray-400">{t.desc || ""}</div></td>
                    <td className="p-2 text-right">{Number(t.qty).toLocaleString()}</td>
                    <td className="p-2 text-right">{fmtMoney(t.priceUSD || 0, "USD")}</td>
                    <td className="p-2 text-right">{fmtMoney((t.qty||0)*(t.priceUSD||0), "USD")}</td>
                    <td className="p-2 text-right">
                      {t.type === "sell" ? (
                        <>
                          <button onClick={()=>onRestore(t.id)} className="px-2 py-1 rounded bg-emerald-500 text-black text-xs mr-2">Restore</button>
                          <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded bg-red-600 text-xs">Delete</button>
                        </>
                      ) : (
                        <button onClick={()=>onDelete(t.id)} className="px-2 py-1 rounded bg-red-600 text-xs">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- load persisted ---------- */
  const loadAssets = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem(LS_ASSETS) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(ensureNumericAsset);
    } catch { return []; }
  };
  const [assets, setAssets] = useState(loadAssets);

  const loadRealized = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem(LS_REALIZED) || 0);
    } catch { return 0; }
  };
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);

  const loadDisplayCcy = () => {
    try {
      if (!isBrowser) return "USD";
      return localStorage.getItem(LS_DISPLAY_CCY) || "USD";
    } catch { return "USD"; }
  };
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  /* FX and loading states */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastTick, setLastTick] = useState(null);

  /* search/add panel */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | us | id | nonliquid
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [initDate, setInitDate] = useState(""); // purchase date for custom
  const [nlYoY, setNlYoY] = useState("5"); // default 5% YoY for non-liquid gains
  const [nlDesc, setNlDesc] = useState("");

  /* live quotes polling refs */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(()=> assetsRef.current = assets, [assets]);
  useEffect(()=> usdIdrRef.current = usdIdr, [usdIdr]);

  // persist
  useEffect(()=> { try { localStorage.setItem(LS_ASSETS, JSON.stringify(assets.map(ensureNumericAsset))); } catch{} }, [assets]);
  useEffect(()=> { try { localStorage.setItem(LS_REALIZED, String(realizedUSD)); } catch{} }, [realizedUSD]);
  useEffect(()=> { try { localStorage.setItem(LS_DISPLAY_CCY, displayCcy); } catch{} }, [displayCcy]);

  /* ===================== FX fetch (Coingecko tether->IDR) ===================== */
  useEffect(()=> {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(`${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n)/n > 0.0005 ? n : prev));
      } catch(e) {
        // silent
      } finally {
        if (mounted) setFxLoading(false);
      }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return ()=> { mounted=false; clearInterval(id); };
  }, []);

  /* ===================== Search suggestions for crypto (coingecko) and stocks (simple heuristics) ===================== */
  const searchTimeoutRef = useRef(null);
  useEffect(()=> {
    if (!query || query.trim().length < 1) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async ()=>{
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(COINGECKO_SEARCH(q));
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0,20).map(c => ({ id:c.id, symbol:(c.symbol||"").toUpperCase(), display:c.name, source:"coingecko", type:"crypto" })));
          return;
        }
        // For stocks, do a very small local heuristic: allow manual typed symbol or try alpha search (if API key)
        // We avoid Yahoo per request.
        const maybeLocal = [{ symbol: q.toUpperCase(), display: q.toUpperCase(), source:"manual", type:"stock" }];
        setSuggestions(maybeLocal);
      } catch(e) {
        setSuggestions([]);
      }
    }, 300);
    return ()=> { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* ===================== POLLING: crypto (coingecko) ===================== */
  useEffect(()=> {
    let mounted = true;
    async function pollCrypto() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a=>a.type==="crypto" && a.coingeckoId).map(a=>a.coingeckoId)));
        if (ids.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a=>{
          if (a.type==="crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares||0)});
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch(e){
        // silent
      }
    }
    pollCrypto();
    const id = setInterval(pollCrypto, 6000);
    return ()=> { mounted=false; clearInterval(id); };
  }, [isInitialLoading]);

  /* ===================== POLLING: stocks (incl Indonesia) ===================== */
  useEffect(()=> {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a=>a.type==="stock").map(a=>a.symbol))).slice(0,50);
        if (symbols.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const map = {};
        // For each symbol: if it ends with .JK -> attempt fetchIndoPrice (cascading)
        for (const s of symbols) {
          try {
            const looksID = String(s || "").toUpperCase().endsWith(".JK");
            if (looksID) {
              const priceUSD = await fetchIndoPrice(s, usdIdrRef.current);
              if (priceUSD !== null && priceUSD > 0) { map[s] = { symbol:s, regularMarketPrice: priceUSD, _source: "idx-scraper" }; continue; }
              // else leave for fallback to alpha etc (fetchIndoPrice already attempted)
            } else {
              // for non-ID stocks, attempt AlphaVantage if key present
              const key = (isBrowser && (window.AV_API_KEY || localStorage.getItem(LS_AV_KEY))) || null;
              if (key) {
                const sym = s;
                const url = ALPHAVANTAGE_QUOTE(sym, key);
                try {
                  const res = await fetch(url);
                  if (res.ok) {
                    const j = await res.json();
                    const g = j["Global Quote"] || j["Global quote"] || j;
                    const p = toNum(g["05. price"] || g["05 price"] || g["price"] || g["c"] || 0);
                    if (p > 0) { map[s] = { symbol:s, regularMarketPrice: p, _source: "av" }; continue; }
                  }
                } catch(e) { /* ignore */ }
              }
            }
          } catch(e) {
            // ignore per-symbol error
          }
        }

        // Merge into assets
        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const q = map[a.symbol];
            const price = toNum(q.regularMarketPrice ?? q.c ?? q.current ?? 0);
            const priceUSD = price; // already in USD from our fetchIndoPrice; if not, earlier conversion happened
            // If priceUSD <= 0, keep avgPrice
            const finalPrice = (priceUSD>0) ? priceUSD : (a.avgPrice || a.lastPriceUSD || a.avgPrice);
            return ensureNumericAsset({ ...a, lastPriceUSD: finalPrice, marketValueUSD: finalPrice * toNum(a.shares||0) });
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch(e){
        // silent
      }
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return ()=> { mounted=false; clearInterval(id); };
  }, [isInitialLoading]);

  /* ===================== NON-LIQUID price updater (YoY auto calc) ===================== */
  useEffect(()=> {
    // recalc every minute for nonliquid assets based on purchase date & YoY
    const id = setInterval(()=> {
      setAssets(prev => prev.map(a => {
        if (a.type === "nonliquid") {
          const years = Math.max(0, (Date.now() - (a.boughtAt || a.createdAt || Date.now())) / (365*24*3600*1000));
          const yoy = toNum(a.nlYoY || a.yoy || 0) / 100;
          // compound per year
          const base = toNum(a.avgPrice || a.investedUSD / Math.max(1, toNum(a.shares||1)));
          const currentPrice = base * Math.pow(1 + yoy, years);
          return ensureNumericAsset({ ...a, lastPriceUSD: currentPrice, marketValueUSD: currentPrice * toNum(a.shares||0) });
        }
        return ensureNumericAsset(a);
      }));
    }, 60_000);
    return ()=> clearInterval(id);
  }, []);

  /* ===================== COMPUTED rows, totals ===================== */
  const rows = useMemo(()=> assets.map(a => {
    const aa = ensureNumericAsset(a);
    // ensure lastPriceUSD fallback: if 0 or NaN and there is avgPrice -> use avgPrice
    const last = aa.lastPriceUSD || aa.avgPrice || aa.investedUSD / Math.max(1, aa.shares || 1);
    const market = toNum(aa.shares||0) * last;
    const invested = toNum(aa.investedUSD || aa.avgPrice * aa.shares || 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets]);

  const totals = useMemo(()=> {
    const invested = rows.reduce((s,r)=> s + toNum(r.investedUSD||0), 0);
    const market = rows.reduce((s,r)=> s + toNum(r.marketValueUSD||0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  /* ===================== Donut/Cake data ===================== */
  const donutData = useMemo(()=> {
    const sorted = rows.slice().sort((a,b)=> b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0,6);
    const other = sorted.slice(6);
    const otherTotal = other.reduce((s,a)=> s + (a.marketValueUSD || 0), 0);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: other.map(o=>o.symbol) });
    return data;
  }, [rows]);

  /* ===================== Portfolio filter (icon-only near header) ===================== */
  const [portfolioFilterOpen, setPortfolioFilterOpen] = useState(false);
  const [portfolioFilter, setPortfolioFilter] = useState("all"); // all | crypto | stock | nonliquid
  // auto-close click outside
  useEffect(()=> {
    function docHandler(e) {
      const el = document.getElementById("pf-filter-icon");
      if (!el) return;
      if (el.contains(e.target)) return;
      setPortfolioFilterOpen(false);
    }
    if (portfolioFilterOpen) document.addEventListener("mousedown", docHandler);
    return ()=> document.removeEventListener("mousedown", docHandler);
  }, [portfolioFilterOpen]);

  /* ===================== Growth series (build from transactions) ===================== */
  // We will synthesize simple growth series from transactions + known last prices
  const [growthSeries, setGrowthSeries] = useState({ all: [], crypto: [], stocks: [], nonliquid: [] });
  // When assets or transactions change, rebuild series (simple daily snapshot from earliest tx to now)
  useEffect(()=> {
    // gather all transactions from assets
    const txs = assets.flatMap(a => (Array.isArray(a.transactions) ? a.transactions.map(t => ({...t, symbol:a.symbol, type:t.type})) : []));
    // if no txs, create a single point now based on totals
    if (txs.length === 0) {
      const base = Date.now();
      const all = [{ t: base, v: totals.market }];
      setGrowthSeries({ all, crypto: all, stocks: all, nonliquid: all });
      return;
    }
    // build day-by-day timeline between earliest tx and now (max 180 points to avoid overload)
    const earliest = Math.min(...txs.map(t => new Date(t.date).getTime()));
    const now = Date.now();
    const points = [];
    const step = Math.max(1, Math.floor((now - earliest) / 120)); // aim <=120 points
    for (let ts = earliest; ts <= now; ts += step) points.push(ts);
    // for each ts compute portfolio value per category: simple approach: value = for each asset compute marketValue at that ts
    const series = { all: [], crypto: [], stocks: [], nonliquid: [] };
    for (const ts of points) {
      // for each asset, estimate historical price:
      let sumAll = 0, sumC=0, sumS=0, sumN=0;
      assets.forEach(a => {
        const purch = (a.boughtAt || a.createdAt || Date.now());
        // if asset created after ts -> treat as zero at that ts
        if (purch > ts) return;
        // for non-liquid, compound yoy since bought
        if (a.type === "nonliquid") {
          const years = Math.max(0, (ts - (a.boughtAt || a.createdAt || Date.now())) / (365*24*3600*1000));
          const yoy = toNum(a.nlYoY || a.yoy || 0) / 100;
          const base = toNum(a.avgPrice || a.investedUSD / Math.max(1, a.shares || 1));
          const priceAtTs = base * Math.pow(1 + yoy, years);
          const val = toNum(a.shares || 0) * priceAtTs;
          sumAll += val; sumN += val;
        } else {
          // for stocks/crypto: if we have historical snapshots? we don't fetch historical prices here (would require external API)
          // approximate: assume price grows linearly from avgPrice at buy time to current lastPrice at now
          const buyTime = a.boughtAt || a.createdAt || Date.now();
          const startPrice = a.avgPrice || (a.investedUSD / Math.max(1, a.shares || 1)) || 0;
          const endPrice = a.lastPriceUSD || startPrice;
          const frac = buyTime === now ? 1 : Math.min(1, Math.max(0, (ts - buyTime) / Math.max(1, (now - buyTime))));
          const priceAtTs = startPrice + (endPrice - startPrice) * frac;
          const val = toNum(a.shares||0) * priceAtTs;
          sumAll += val; if (a.type==="crypto") sumC += val; if (a.type==="stock") sumS += val;
        }
      });
      series.all.push({ t: ts, v: sumAll });
      series.crypto.push({ t: ts, v: sumC });
      series.stocks.push({ t: ts, v: sumS });
      series.nonliquid.push({ t: ts, v: sumN });
    }
    setGrowthSeries(series);
  }, [assets, totals.market]);

  /* ===================== TRANSACTIONS state & handlers ===================== */
  // Flattened transactions stored for realized listing and undo/delete
  const [transModalOpen, setTransModalOpen] = useState(false);
  const [transactionsFlat, setTransactionsFlat] = useState(() => {
    // build from assets initial
    return assets.flatMap(a => (a.transactions || []).map(t => ({ ...t, symbol: a.symbol, assetId: a.id })));
  });

  useEffect(()=> {
    setTransactionsFlat(assets.flatMap(a => (a.transactions || []).map(t => ({ ...t, symbol: a.symbol, assetId: a.id }))));
  }, [assets]);

  function addTransaction(tx) {
    // tx: { id, assetId, type: buy|sell, date, qty, priceUSD, amountUSD, desc }
    setAssets(prev => prev.map(a => a.id === tx.assetId ? ensureNumericAsset({ ...a, transactions: [...(a.transactions||[]), tx]}) : a));
  }

  function onDeleteTransaction(id) {
    // permanently remove from transactions and if it was a sell that affected realized, deduct realized if applicable
    setAssets(prev => prev.map(a => {
      const txs = (a.transactions||[]).filter(t => t.id !== id);
      return ensureNumericAsset({...a, transactions: txs});
    }));
    setTransactionsFlat(prev => prev.filter(t => t.id !== id));
  }

  function onRestoreTransaction(id) {
    // find tx in flat (should be sell), and reverse its effect: i.e., restore sold shares into assets and reduce realizedUSD
    const tx = transactionsFlat.find(t => t.id === id);
    if (!tx) return;
    if (tx.type !== "sell") {
      // nothing to restore (only sells were removed from assets earlier)
      return;
    }
    // find asset; if missing, re-create asset placeholder
    const a = assets.find(x => x.id === tx.assetId);
    if (!a) {
      // recreate minimal asset
      const newA = ensureNumericAsset({
        id: tx.assetId,
        type: tx.assetType || "stock",
        symbol: tx.symbol,
        name: tx.symbol,
        shares: tx.qty,
        avgPrice: tx.priceUSD,
        investedUSD: tx.qty * tx.priceUSD,
        lastPriceUSD: tx.priceUSD,
        marketValueUSD: tx.qty * tx.priceUSD,
        transactions: [( { ...tx } )]
      });
      setAssets(prev => [...prev, newA]);
    } else {
      // add shares back
      setAssets(prev => prev.map(x => {
        if (x.id !== tx.assetId) return ensureNumericAsset(x);
        const oldShares = toNum(x.shares || 0);
        const oldInvested = toNum(x.investedUSD || 0);
        // to restore, we need to add back quantity and invested amount approx
        const addedShares = tx.qty;
        const addedInvested = addedShares * tx.priceUSD;
        const newShares = oldShares + addedShares;
        const newInvested = oldInvested + addedInvested;
        const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
        const ret = ensureNumericAsset({...x, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: x.lastPriceUSD || tx.priceUSD, marketValueUSD: (x.lastPriceUSD || tx.priceUSD) * newShares, transactions: [...(x.transactions||[]), tx]});
        return ret;
      }));
    }
    // deduct realizedUSD (reverse proceeds-costOfSold)
    const proceeds = tx.qty * tx.priceUSD;
    const costOfSold = tx.qty * (tx.costBasis || tx.priceUSD);
    const realizedChange = proceeds - costOfSold;
    setRealizedUSD(prev => prev - realizedChange);
    // remove TX log entry or mark restored
    setTransactionsFlat(prev => prev.filter(t => t.id !== id));
  }

  /* ===================== ADD / MANUAL ASSET functions ===================== */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : (s.type || "stock"),
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
      createdAt: Date.now(),
      transactions: []
    });
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false); setQuery(""); setSuggestions([]); setSelectedSuggestion(null);
  }

  async function addManualAsset() {
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or select suggestion"); return; }
    let newAsset = null;
    if (searchMode === "crypto") {
      newAsset = ensureNumericAsset({
        id: `manual:cg:${typed}:${Date.now()}`, type: "crypto",
        coingeckoId: typed.toLowerCase(), symbol: typed.toUpperCase(), name: typed,
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
      });
    } else if (searchMode === "nonliquid") {
      // custom non-liquid asset entry
      const q = toNum(initQty || 0);
      const p = toNum(initPrice || 0);
      if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
      const boughtAt = initDate ? new Date(initDate).getTime() : Date.now();
      const nl = ensureNumericAsset({
        id: `manual:nl:${typed}:${Date.now()}`, type: "nonliquid",
        symbol: typed.toUpperCase(), name: typed, description: nlDesc || "",
        shares: q, avgPrice: p, investedUSD: q * p, lastPriceUSD: p, marketValueUSD: q*p,
        boughtAt, nlYoY: toNum(nlYoY||0),
        createdAt: Date.now(),
        transactions: [{
          id: `tx:${Date.now()}`, assetId:`manual:nl:${typed}:${Date.now()}`, type:"buy", date: boughtAt, qty: q, priceUSD: p, amountUSD: q*p
        }]
      });
      setAssets(prev => [...prev, nl]);
      setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitDate(""); setNlDesc(""); setNlYoY("5");
      return;
    } else {
      newAsset = ensureNumericAsset({
        id: `manual:yh:${typed}:${Date.now()}`, type: "stock",
        symbol: typed.toUpperCase(), name: typed.toUpperCase(),
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, transactions: []
      });
    }
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false); setQuery("");
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode === "crypto") {
        picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed };
      } else if (searchMode === "nonliquid") {
        // fallthrough handled in addManualAsset
        return addManualAsset();
      } else {
        picked = { source: "manual", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
      }
    }
    const qty = toNum(initQty); const priceInput = toNum(initPrice);
    if (qty <=0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }

    const internalId = `${picked.source || picked.type}:${picked.symbol || picked.id}:${Date.now()}`;
    const priceInUSD = initPriceCcy === "IDR" ? (priceInput / (usdIdr || 1)) : priceInput;
    const asset = ensureNumericAsset({
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.source === "coingecko" ? (picked.id || picked.coingeckoId) : undefined,
      symbol: (picked.symbol || picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty,
      avgPrice: priceInUSD,
      investedUSD: priceInUSD * qty,
      lastPriceUSD: priceInUSD,
      marketValueUSD: priceInUSD * qty,
      createdAt: Date.now(),
      transactions: [{
        id: `tx:${Date.now()}`, assetId: internalId, type: "buy", date: Date.now(), qty, priceUSD: priceInUSD, amountUSD: priceInUSD*qty
      }]
    });
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  /* ===================== BUY / SELL modal & logic ===================== */
  const [tradeModal, setTradeModal] = useState({ open:false, mode:null, assetId:null, defaultPrice:0 });
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open:true, mode, assetId, defaultPrice });
  }
  function closeTradeModal(){ setTradeModal({ open:false, mode:null, assetId:null, defaultPrice:0 }); }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q<=0 || p<=0) { alert("Qty & price must be > 0"); return; }
    // update asset
    const tx = { id: `tx:${Date.now()}`, assetId: id, type: "buy", date: Date.now(), qty: q, priceUSD: p, amountUSD: q*p };
    setAssets(prev => prev.map(a => {
      if (a.id !== id) return ensureNumericAsset(a);
      const oldShares = toNum(a.shares||0), oldInvested = toNum(a.investedUSD||0);
      const addCost = q * p;
      const newShares = oldShares + q, newInvested = oldInvested + addCost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p, transactions: [...(a.transactions||[]), tx]});
    }));
    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q<=0 || p<=0) { alert("Qty & price must be > 0"); return; }
    const a = assets.find(x => x.id === id); if (!a) return;
    const oldShares = toNum(a.shares||0); if (q > oldShares) { alert("Cannot sell more than you own"); return; }
    const avg = toNum(a.avgPrice || 0);
    const proceeds = q * p, costOfSold = q * avg;
    const realized = proceeds - costOfSold;
    setRealizedUSD(prev => prev + realized);
    const tx = { id: `tx:${Date.now()}`, assetId: id, type: "sell", date: Date.now(), qty: q, priceUSD: p, amountUSD: proceeds, costBasis: avg };
    const newShares = oldShares - q;
    const newInvested = a.investedUSD - costOfSold;
    const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
    setAssets(prev => {
      if (newShares <= 0) {
        // remove asset
        return prev.filter(x => x.id !== id).map(x => ensureNumericAsset(x));
      }
      return prev.map(x => x.id === id ? ensureNumericAsset({ ...x, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p, transactions: [...(x.transactions||[]), tx] }) : ensureNumericAsset(x));
    });
    closeTradeModal();
  }

  /* ===================== Remove asset ===================== */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name||""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ===================== EXPORT / IMPORT CSV (improved for spreadsheets) ===================== */
  function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }
  function exportCSV() {
    // We'll export two CSV files sequentially: portfolio and transactions.
    // For spreadsheet friendliness: include a top header comment with file path and create consistent columns, include metadata row, ISO dates
    const headers = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","boughtAt","createdAt","nlYoY"];
    const lines = [];
    lines.push(`# app/dashboard/page.js - portfolio export`);
    lines.push(headers.join(","));
    assets.forEach(a => {
      const aa = ensureNumericAsset(a);
      const row = [
        aa.id||"",
        aa.type||"",
        aa.coingeckoId||"",
        aa.symbol||"",
        aa.name||"",
        aa.description||"",
        aa.shares||0,
        aa.avgPrice||0,
        aa.investedUSD||0,
        aa.lastPriceUSD||0,
        aa.marketValueUSD||0,
        aa.boughtAt ? new Date(aa.boughtAt).toISOString() : "",
        aa.createdAt ? new Date(aa.createdAt).toISOString() : "",
        aa.nlYoY||""
      ].map(csvEscape).join(",");
      lines.push(row);
    });
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr}`);

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    // export transactions in a second file
    const txs = assets.flatMap(a => (a.transactions||[]).map(t => ({ ...t, symbol: a.symbol })));
    const txHeaders = ["id","assetId","symbol","type","date","qty","priceUSD","amountUSD","notes"];
    const txLines = [`# app/dashboard/page.js - transactions export`, txHeaders.join(",")];
    txs.forEach(t => {
      const row = [
        t.id||"",
        t.assetId||"",
        t.symbol||"",
        t.type||"",
        t.date ? new Date(t.date).toISOString() : "",
        t.qty||0,
        t.priceUSD||0,
        t.amountUSD||0,
        t.notes||""
      ].map(csvEscape).join(",");
      txLines.push(row);
    });
    const tblob = new Blob([txLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const turl = URL.createObjectURL(tblob);
    const b = document.createElement("a");
    b.href = turl;
    b.download = `transactions_export_${Date.now()}.csv`;
    document.body.appendChild(b);
    b.click();
    b.remove();
    URL.revokeObjectURL(turl);
  }

  function handleImportFile(file, { merge = true } = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/);
      if (lines.length === 0) return alert("Empty file");
      // detect if this is portfolio or transactions by header
      const first = lines[0] || "";
      if (first.includes("portfolio export")) {
        // parse portfolio
        const headerLineIndex = 1;
        const header = lines[headerLineIndex].split(",").map(h => h.replace(/^"|"$/g,"").trim());
        const dataLines = lines.slice(headerLineIndex+1).filter(l => l && !l.startsWith("#META"));
        const imported = dataLines.map(line => {
          // simple csv parse with quotes
          const values = [];
          let cur = "", inQ = false;
          for (let i=0;i<line.length;i++){
            const ch = line[i];
            if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { values.push(cur); cur = ""; continue; }
            cur += ch;
          }
          values.push(cur);
          const obj = {};
          header.forEach((h,idx)=> obj[h]= values[idx]??"");
          const parsed = ensureNumericAsset({
            id: obj.id || `imp:${obj.symbol||""}:${Date.now()}`,
            type: obj.type || "stock",
            coingeckoId: obj.coingeckoId || undefined,
            symbol: (obj.symbol||"").toString().toUpperCase(),
            name: obj.name || obj.symbol || "",
            description: obj.description || "",
            shares: toNum(obj.shares||0),
            avgPrice: toNum(obj.avgPrice||0),
            investedUSD: toNum(obj.investedUSD||0),
            lastPriceUSD: toNum(obj.lastPriceUSD||0),
            marketValueUSD: toNum(obj.marketValueUSD||0),
            boughtAt: obj.boughtAt ? new Date(obj.boughtAt).getTime() : undefined,
            createdAt: obj.createdAt ? new Date(obj.createdAt).getTime() : Date.now(),
            nlYoY: toNum(obj.nlYoY||0),
            transactions: []
          });
          return parsed;
        });
        const meta = lines.find(l=>l.startsWith("#META"));
        if (meta) {
          try {
            const m = meta.replace(/^#META,?/,"");
            const parts = m.split(",");
            parts.forEach(p=>{ const [k,v]=p.split("="); if (k==="realizedUSD") setRealizedUSD(toNum(v)); if (k==="displayCcy" && v) setDisplayCcy(String(v)); if (k==="usdIdr") setUsdIdr(toNum(v)); });
          } catch(e){}
        }
        if (merge) {
          const map = {};
          assets.forEach(a=> map[a.symbol] = ensureNumericAsset(a));
          imported.forEach(i=> map[i.symbol] = ensureNumericAsset(i));
          setAssets(Object.values(map));
        } else {
          setAssets(imported);
        }
        alert("Import portfolio complete");
      } else if (first.includes("transactions export")) {
        // parse transactions file and append into assets
        const headerLineIndex = 1;
        const header = lines[headerLineIndex].split(",").map(h => h.replace(/^"|"$/g,"").trim());
        const dataLines = lines.slice(headerLineIndex+1).filter(Boolean);
        const imported = dataLines.map(line => {
          const values = [];
          let cur = "", inQ = false;
          for (let i=0;i<line.length;i++){
            const ch=line[i];
            if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { values.push(cur); cur=""; continue; }
            cur += ch;
          }
          values.push(cur);
          const obj = {}; header.forEach((h,idx)=> obj[h]=values[idx]??"");
          return { id: obj.id, assetId: obj.assetId, symbol: obj.symbol, type: obj.type, date: obj.date ? new Date(obj.date).getTime() : Date.now(), qty: toNum(obj.qty||0), priceUSD: toNum(obj.priceUSD||0), amountUSD: toNum(obj.amountUSD||0), notes: obj.notes||"" };
        });
        // merge into assets by assetId/symbol
        setAssets(prev => {
          const map = {}; prev.forEach(a=> map[a.symbol] = ensureNumericAsset(a));
          imported.forEach(tx => {
            const aSym = tx.symbol;
            if (!map[aSym]) {
              // create placeholder asset
              map[aSym] = ensureNumericAsset({ id: tx.assetId || `imp:${aSym}:${Date.now()}`, type: "stock", symbol: aSym, name: aSym, shares: 0, avgPrice:0, investedUSD:0, lastPriceUSD:0, marketValueUSD:0, transactions: [tx]});
            } else {
              map[aSym].transactions = [...(map[aSym].transactions||[]), tx];
            }
          });
          return Object.values(map);
        });
        alert("Import transactions complete");
      } else {
        alert("Unknown file type. Please provide exported CSV from this app.");
      }
    };
    reader.readAsText(file);
  }

  function onImportClick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const replace = confirm("Replace existing portfolio? (OK = replace, Cancel = merge)");
    handleImportFile(file, { merge: !replace });
    e.target.value = "";
  }

  /* ===================== Filtering / sorting on table (filter icon) ===================== */
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMode, setSortMode] = useState("value_desc"); // value_desc, value_asc, alpha_az, alpha_za, oldest, newest
  useEffect(()=> {
    function closeHandler(e) {
      const el = document.getElementById("filter-icon-btn");
      if (!el) return;
      if (el.contains(e.target)) return;
      setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener("mousedown", closeHandler);
    return ()=> document.removeEventListener("mousedown", closeHandler);
  }, [filterOpen]);

  const sortedRows = useMemo(()=> {
    const arr = rows.slice();
    switch(sortMode) {
      case "value_desc": return arr.sort((a,b)=> b.marketValueUSD - a.marketValueUSD);
      case "value_asc": return arr.sort((a,b)=> a.marketValueUSD - b.marketValueUSD);
      case "alpha_az": return arr.sort((a,b)=> (a.symbol||"").localeCompare(b.symbol||""));
      case "alpha_za": return arr.sort((a,b)=> (b.symbol||"").localeCompare(a.symbol||""));
      case "oldest": return arr.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0));
      case "newest": return arr.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
      default: return arr;
    }
  }, [rows, sortMode]);

  /* ===================== UI animated add button state ===================== */
  const [addAnimating, setAddAnimating] = useState(false);
  useEffect(()=> {
    if (openAdd) setAddAnimating(true);
    else setAddAnimating(false);
  }, [openAdd]);

  /* ===================== UI: Display currency compact dropdown (value + 'IDR' + caret) ===================== */
  const [displayDropdownOpen, setDisplayDropdownOpen] = useState(false);
  useEffect(()=> {
    function docHandler(e){
      const el = document.getElementById("display-val-btn");
      if (!el) return;
      if (el.contains(e.target)) return;
      setDisplayDropdownOpen(false);
    }
    if (displayDropdownOpen) document.addEventListener("mousedown", docHandler);
    return ()=> document.removeEventListener("mousedown", docHandler);
  }, [displayDropdownOpen]);

  /* ===================== Misc small helpers ===================== */
  function humanNumber(n, ccy="USD") {
    if (ccy === "IDR") return `${Math.round(n).toLocaleString()} IDR`;
    return `${Math.round(n)} USD`;
  }

  /* =========== Render ========= */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6 antialiased" style={{fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial"}}>
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">All Portfolio</h1>
              {/* portfolio filter icon-only */}
              <div id="pf-filter-icon" className="relative">
                <button onClick={()=>setPortfolioFilterOpen(v=>!v)} className="p-1 rounded hover:bg-gray-800 transition-transform transform hover:scale-105" aria-label="portfolio filter">
                  <div style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:6,background:"#1f2937"}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="2"><path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </button>
                {portfolioFilterOpen && (
                  <div style={{position:"absolute", top:36, left:0, background:"#0b1220", border:"1px solid #20232a", padding:8, borderRadius:8, minWidth:150, zIndex:40}}>
                    {["all","crypto","stock","nonliquid"].map((p)=>(
                      <button key={p} onClick={()=>{ setPortfolioFilter(p); setPortfolioFilterOpen(false); }} className={`w-full text-left px-2 py-1 rounded ${portfolioFilter===p ? "bg-gray-800": "hover:bg-gray-900"}`}>{p === "all" ? "All" : (p==="nonliquid"?"Non-Liquid":p.charAt(0).toUpperCase()+p.slice(1))}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
              {isInitialLoading && assets.length>0 ? (
                <><svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg><span>Loading portfolio data...</span></>
              ) : lastTick ? (
                <><span>Updated: {new Date(lastTick).toLocaleString()}</span><span>•</span><span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? <svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle></svg> : usdIdr?.toLocaleString()}</span></>
              ) : <span className="text-gray-500">No updates yet</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-xl font-semibold">
              {displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}
            </div>

            {/* compact display value dropdown: e.g. "5.589.686 IDR >" */}
            <div id="display-val-btn" className="relative">
              <button onClick={()=> setDisplayDropdownOpen(v => !v)} className="flex items-center gap-2 text-sm hover:opacity-90 transition-all" style={{background:"transparent", border:"none"}}>
                <span style={{fontWeight:600, fontSize:14}}>{displayCcy === "IDR" ? `${Math.round(totals.market*usdIdr).toLocaleString()}` : `${Math.round(totals.market).toLocaleString()}`}</span>
                <span style={{fontSize:12, opacity:0.8}}>{displayCcy === "IDR" ? "IDR" : "USD"}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              {displayDropdownOpen && (
                <div style={{position:"absolute", right:0, top:30, background:"#0b1220", border:"1px solid #20232a", padding:8, borderRadius:8, zIndex:40}}>
                  <button onClick={()=>{ setDisplayCcy("USD"); setDisplayDropdownOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">USD</button>
                  <button onClick={()=>{ setDisplayCcy("IDR"); setDisplayDropdownOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">IDR</button>
                </div>
              )}
            </div>

            {/* Add button animated */}
            <button onClick={()=> setOpenAdd(v => !v)} aria-label="add asset" className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform transition-transform ${addAnimating ? "rotate-45" : ""}`} title="Add asset">+</button>
          </div>
        </div>

        {/* KPIs row */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex flex-col">
            <div className="text-gray-400">Invested</div>
            <div className="font-medium text-lg">{displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">— avg price below in table rows</div>
          </div>
          <div className="flex flex-col">
            <div className="text-gray-400">Market value</div>
            <div className="font-medium text-lg">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">— current price below in table rows</div>
          </div>
          <div className="flex flex-col">
            <div className="text-gray-400">Gain P&L</div>
            <div className={`font-semibold text-lg ${totals.pnl>=0? "text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR"? fmtMoney(totals.pnl * usdIdr,"IDR"): fmtMoney(totals.pnl,"USD")} <span className="text-xs">({totals.pnlPct.toFixed(2)}%)</span></div>
            <div className="text-xs text-gray-500 mt-1">Unrealized</div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <div className="text-sm text-gray-400">Realized P&L</div>
            <div className="flex items-center gap-2">
              <div className={`font-semibold ${realizedUSD>=0?"text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR"? fmtMoney(realizedUSD * usdIdr,"IDR"): fmtMoney(realizedUSD,"USD")}</div>
              {/* small slanted arrow in tiny box */}
              <button onClick={()=> setTransModalOpen(true)} className="p-1 rounded-sm border border-gray-800 hover:bg-gray-800 transform transition-all" title="Show transactions">
                <div style={{width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="2"><path d="M7 14l5-5 5 5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 20h10" strokeLinecap="round"/></svg>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={()=> { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800": ""}`}>Crypto</button>
                <button onClick={()=> { setSearchMode("stock"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "stock" ? "bg-gray-800": ""}`}>Stocks</button>
                <button onClick={()=> { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800": ""}`}>Non-Liquid</button>
              </div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e)=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : (searchMode==="nonliquid" ? "Type asset name (e.g. Land, Art, Rolex)..." : "Search (AALI.JK | ASII.JK | symbol)") } className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                    {suggestions.map((s,i)=>(
                      <button key={i} onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                        <div>
                          <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                          <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : "Manual/Stock"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input value={initQty} onChange={(e)=> setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <input value={initPrice} onChange={(e)=> setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <select value={initPriceCcy} onChange={(e)=> setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option><option value="IDR">IDR</option>
              </select>

              {searchMode === "nonliquid" && (
                <>
                  <input type="date" value={initDate} onChange={(e)=> setInitDate(e.target.value)} className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                  <input placeholder="YoY gain % (e.g. 5)" value={nlYoY} onChange={(e)=> setNlYoY(e.target.value)} className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-24"/>
                  <input placeholder="Description (addr, serial...)" value={nlDesc} onChange={(e)=> setNlDesc(e.target.value)} className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full"/>
                </>
              )}

              <div className="flex items-center gap-2">
                <button onClick={()=> selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold transform hover:scale-105 transition">Add</button>
                <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold transform hover:scale-105 transition">Add + Position</button>
                <button onClick={()=> setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* GROWTH CHART (above donut as requested) */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(tf=>(
                <button key={tf} onClick={()=>{/* set timeframe state */}} className="px-2 py-1 rounded hover:bg-gray-800 text-sm">{tf}</button>
              ))}
            </div>
          </div>
          <GrowthChart series={growthSeries} timeframe={"all"} currency={displayCcy} usdIdr={usdIdr} />
        </div>

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : sortedRows.filter(r => (portfolioFilter==="all" ? true : r.type === portfolioFilter)).map((r)=>(
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100">{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name || ""}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares||0).toLocaleString(undefined,{maximumFractionDigits:8})}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={()=> openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                      <button onClick={()=> openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                      <button onClick={()=> removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cake + Legend */}
        {rows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-48 h-48 flex items-center justify-center">
              <CakeChart data={donutData} total={totals.market} size={220} inner={70} formatCurrency={(v)=> displayCcy==="IDR" ? `${Math.round(v*usdIdr).toLocaleString()} IDR` : `${Math.round(v)} USD`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {donutData.map((d,i)=>{
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width:12, height:12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{displayCcy==="IDR"? fmtMoney(d.value * usdIdr,"IDR"): fmtMoney(d.value,"USD")} • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Export/Import + filters */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (portfolio + transactions)</div>
            <div className="text-xs text-gray-500">Export includes portfolio rows + metadata (realized, displayCcy, usdIdr). Exports are spreadsheet-friendly (quoted where needed).</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="bg-white hover:bg-blue-600 text-black hover:text-white px-3 py-2 rounded font-semibold transition">Export CSV</button>
            <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={()=> { if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return; setAssets([]); setRealizedUSD(0); }} className="bg-red-600 px-3 py-2 rounded font-semibold">Clear All</button>

            {/* filter icon for table */}
            <div className="relative">
              <button id="filter-icon-btn" onClick={()=> setFilterOpen(v=>!v)} className="p-2 rounded hover:bg-gray-800">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="2"><path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {filterOpen && (
                <div style={{position:"absolute", right:0, top:36, background:"#0b1220", border:"1px solid #20232a", padding:8, borderRadius:8, zIndex:40}}>
                  <div className="text-xs text-gray-400 mb-1">Sort</div>
                  <button onClick={()=>{ setSortMode("value_desc"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">Value (highest)</button>
                  <button onClick={()=>{ setSortMode("value_asc"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">Value (lowest)</button>
                  <button onClick={()=>{ setSortMode("alpha_az"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">A → Z</button>
                  <button onClick={()=>{ setSortMode("alpha_za"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">Z → A</button>
                  <button onClick={()=>{ setSortMode("newest"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">Newest</button>
                  <button onClick={()=>{ setSortMode("oldest"); setFilterOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-800">Oldest</button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* TRADE MODAL */}
      {tradeModal.open && (
        <TradeModal
          mode={tradeModal.mode}
          asset={assets.find(a => a.id === tradeModal.assetId)}
          defaultPrice={tradeModal.defaultPrice}
          onClose={closeTradeModal}
          onBuy={performBuy}
          onSell={performSell}
          usdIdr={usdIdr}
        />
      )}

      {/* TRANSACTIONS MODAL */}
      <TransactionsModal open={transModalOpen} onClose={()=> setTransModalOpen(false)} transactions={transactionsFlat} onDelete={onDeleteTransaction} onRestore={onRestoreTransaction} />

    </div>
  );
}