// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Single-file Portfolio Dashboard (page.js)
 * - Full single-file client component
 * - Crypto history: CoinGecko
 * - Stocks: Finnhub -> AlphaVantage -> Yahoo fallback
 * - Portfolio growth: interactive canvas (candles + multi-line), timeframe buttons
 * - Cake allocation with spacing and center total (small)
 * - Non-liquid assets (custom) with YoY auto growth
 * - Transactions modal: restore/delete (undo = restore)
 * - Export/Import CSV improved for spreadsheets
 *
 * Notes:
 * - Server proxies expected:
 *    /api/finnhub/quote?symbol=SYMBOL
 *    /api/alpha/quote?symbol=SYMBOL
 *    /api/alpha/history?symbol=SYMBOL    (optional but will be attempted)
 *    /api/yahoo/quote?symbol=SYMBOL1,SYMBOL2
 * - If an API returns a different shape, tell me the exact payload and I'll adapt parsing.
 */

/* ===================== CONFIG ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const ALPHAVANTAGE_QUOTE = (symbol) => `/api/alpha/quote?symbol=${encodeURIComponent(symbol)}`;
const ALPHAVANTAGE_HISTORY = (symbol) => `/api/alpha/history?symbol=${encodeURIComponent(symbol)}`; // optional proxy
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_MARKET_CHART = (id, days = 365) => `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`; // daily

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
function isoDate(ms) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
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
    purchaseDate: a.purchaseDate || a.createdAt || Date.now(),
    nonLiquidYoy: toNum(a.nonLiquidYoy || 0),
    description: a.description || "",
    type: a.type || "stock",
  };
}

/* seeded RNG for synthetic noise */
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

/* ===================== STYLES (inline) ===================== */
const styles = `
  .btn { transition: transform .18s cubic-bezier(.2,.9,.2,1), box-shadow .18s, background-color .12s; }
  .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
  .rotate-open { transform: rotate(45deg); transition: transform .22s; display:inline-block; }
  .icon-box { transition: transform .16s, background .12s; }
  .slice { cursor:pointer; transition: transform .12s, filter .12s; }
  .menu-scroll { max-height:16rem; overflow:auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .fade-in { animation: fadeIn .18s ease-out; }
  @keyframes fadeIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }
`;

/* ===================== CAKE (spaced slices) ===================== */
function Cake({ data = [], size = 180, inner = 50, gap = 0.06, displayTotal, displayCcy, usdIdr }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const maxOuter = size / 2 - 6;
  const minOuter = inner + 6;
  const maxValue = Math.max(...data.map(d => Math.max(0, d.value || 0)), 1);
  const scaleOuter = (v) => minOuter + (maxOuter - minOuter) * ((v || 0) / maxValue);
  const colors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  let start = -Math.PI/2;
  const arcs = data.map(d => {
    const portion = Math.max(0, d.value || 0) / total;
    const angle = portion * Math.PI * 2;
    const end = start + angle;
    const outer = scaleOuter(d.value || 0);
    const arc = { start, end, outer };
    start = end;
    return arc;
  });

  const formatVal = (v) => displayCcy === "IDR" ? fmtMoney((v||0)*usdIdr,"IDR") : fmtMoney(v||0,"USD");

  return (
    <div style={{ width: size, height: size, position: "relative" }} ref={ref}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d,i)=>{
          const arc = arcs[i];
          const s = arc.start + Math.min((arc.end - arc.start), gap)/2;
          const e = arc.end - Math.min((arc.end - arc.start), gap)/2;
          const large = (e - s) > Math.PI ? 1 : 0;
          const x1 = cx + arc.outer * Math.cos(s), y1 = cy + arc.outer * Math.sin(s);
          const x2 = cx + arc.outer * Math.cos(e), y2 = cy + arc.outer * Math.sin(e);
          const xi2 = cx + inner * Math.cos(e), yi2 = cy + inner * Math.sin(e);
          const xi1 = cx + inner * Math.cos(s), yi1 = cy + inner * Math.sin(s);
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${arc.outer} ${arc.outer} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`;
          const mid = (s + e) / 2;
          const transform = hover === i ? `translate(${Math.cos(mid)*6},${Math.sin(mid)*6})` : undefined;
          return (
            <g key={i} transform={transform}>
              <path d={path} fill={colors[i%colors.length]} stroke="#000" strokeWidth={hover===i?1.2:0.6}
                onMouseEnter={(ev)=>setHover(i)} onMouseLeave={()=>setHover(null)}
                onMouseMove={(ev)=>{ /* could show tooltip — handled in parent */ }} className="slice"/>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={inner-6} fill="#070707" />
        <text x={cx} y={cy-6} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize="12" fontWeight="700" fill="#E5E7EB">{displayTotal}</text>
      </svg>
    </div>
  );
}

/* ===================== SIMPLE Sparkline / fallback chart (canvas) ===================== */
function SparklineCanvas({ data = [], width = 900, height = 220, color = "#4D96FF" }) {
  const ref = useRef(null);
  useEffect(()=>{
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = c.width = width * dpr;
    const h = c.height = height * dpr;
    c.style.width = `${width}px`; c.style.height = `${height}px`;
    ctx.clearRect(0,0,w,h);
    if (!data || data.length===0) return;
    const arr = data.map(p=>p.v);
    const min = Math.min(...arr), max = Math.max(...arr);
    const range = (max - min) || 1;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i=0;i<arr.length;i++){
      const x = (i/(arr.length-1)) * w;
      const y = ((max - arr[i]) / range) * (h - 20*dpr) + 10*dpr;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(77,150,255,0.08)";
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }, [data, width, height]);
  return <canvas ref={ref} style={{ width, height }} />;
}

/* ===================== CANDLES + LINES (interactive canvas) ===================== */
function GrowthChart({ series = {}, range = "all", displayCcy = "USD", usdIdr = 16000 }) {
  // series: { all: [{t:ms,v:number}], crypto: [...], stock: [...], nonliquid: [...] }
  const canvasRef = useRef(null);
  const hoverRef = useRef({ x: null, idx: null });
  const [hoverInfo, setHoverInfo] = useState(null);

  // build merged timeline: choose shortest/selected series length
  const timeline = useMemo(()=>{
    // find the longest series among 'all' or whichever exists
    const base = series.all && series.all.length > 0 ? series.all : (series.crypto || series.stock || series.nonliquid || []);
    return base || [];
  }, [series]);

  useEffect(()=>{
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth * dpr;
    const H = c.clientHeight * dpr;
    c.width = W; c.height = H;
    ctx.clearRect(0,0,W,H);
    if (!timeline || timeline.length === 0) {
      ctx.fillStyle = "#374151"; ctx.font = `${14*dpr}px sans-serif`; ctx.fillText("No growth data available", 20*dpr, 30*dpr);
      return;
    }

    // Determine visible range based on 'range' parameter (simple mapping)
    let fromIdx = 0;
    if (range === "1d") fromIdx = Math.max(0, timeline.length - 2);
    else if (range === "2d") fromIdx = Math.max(0, timeline.length - 3);
    else if (range === "1w") fromIdx = Math.max(0, timeline.length - 8);
    else if (range === "1m") fromIdx = Math.max(0, timeline.length - 31);
    else if (range === "1y") fromIdx = Math.max(0, timeline.length - 365);
    else fromIdx = 0;

    const visible = timeline.slice(fromIdx);
    if (visible.length < 2) { // draw single point
      ctx.fillStyle = "#374151"; ctx.font = `${14*dpr}px sans-serif`; ctx.fillText("Not enough data", 20*dpr, 30*dpr);
      return;
    }

    // collect per-category lines
    const categories = ["all","crypto","stock","nonliquid"];
    const colors = { all:"#60A5FA", crypto:"#7C3AED", stock:"#34D399", nonliquid:"#F59E0B" };
    const lines = {};
    categories.forEach(cat=>{
      const arr = (series[cat] || []).slice(fromIdx);
      if (!arr || arr.length === 0) return;
      lines[cat] = arr;
    });

    // compute value range (Y)
    const lastVals = Object.values(lines).flatMap(arr => arr.map(p=>p.v));
    const minV = Math.min(...lastVals);
    const maxV = Math.max(...lastVals);
    const pad = (maxV - minV) * 0.12 || Math.max(1, Math.abs(maxV)*0.05);
    const low = minV - pad, high = maxV + pad;

    // helper to map
    const mapX = (i) => (i/(visible.length-1)) * (W - 120*dpr) + 60*dpr;
    const mapY = (v) => ((high - v) / (high - low)) * (H - 60*dpr) + 30*dpr;

    // draw grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1 * dpr;
    for (let i=0;i<4;i++){
      const y = 30*dpr + (i/3)*(H - 60*dpr);
      ctx.beginPath(); ctx.moveTo(60*dpr, y); ctx.lineTo(W - 60*dpr, y); ctx.stroke();
    }

    // draw category lines (multi-line)
    Object.keys(lines).forEach(cat=>{
      const arr = lines[cat];
      if (!arr || arr.length<2) return;
      ctx.beginPath();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = colors[cat] || "#9CA3AF";
      for (let i=0;i<arr.length;i++){
        const x = mapX(i);
        const y = mapY(arr[i].v);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      // area under line subtle
      ctx.lineTo(mapX(arr.length-1), H - 30*dpr);
      ctx.lineTo(mapX(0), H - 30*dpr);
      ctx.closePath();
      ctx.fillStyle = (ctx.strokeStyle + "17") || "rgba(96,165,250,0.06)";
      ctx.fill();
    });

    // draw X-axis date labels every N
    ctx.fillStyle = "rgba(229,231,235,0.8)";
    ctx.font = `${11*dpr}px sans-serif`;
    const step = Math.max(1, Math.floor(visible.length / 6));
    for (let i=0;i<visible.length;i+=step){
      const p = visible[i];
      const dt = new Date(p.t);
      const label = `${dt.getMonth()+1}/${dt.getDate()}`; // M/D
      ctx.fillText(label, mapX(i) - 12*dpr, H - 8*dpr);
    }

    // draw Y-axis label (right)
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(229,231,235,0.9)";
    ctx.font = `${12*dpr}px sans-serif`;
    ctx.fillText(displayCcy === "IDR" ? fmtMoney((visible[visible.length-1].v||0)*usdIdr, "IDR") : fmtMoney(visible[visible.length-1].v||0, "USD"), W - 12*dpr, mapY(visible[visible.length-1].v));

    // interaction: pointermove capturing index
    function onPointerMove(e){
      const rect = c.getBoundingClientRect();
      const x = (e.clientX - rect.left) * dpr;
      let nearest = 0; let minD = Infinity;
      for (let i=0;i<visible.length;i++){ const dx = Math.abs(mapX(i) - x); if (dx < minD) { minD = dx; nearest = i; } }
      hoverRef.current = { x, idx: nearest };
      const pv = visible[nearest];
      setHoverInfo({ index: nearest, point: pv, x: mapX(nearest), y: mapY(pv.v) });
    }
    function onLeave(){
      hoverRef.current = { x: null, idx: null }; setHoverInfo(null);
    }
    c.removeEventListener("pointermove", onPointerMove);
    c.removeEventListener("pointerleave", onLeave);
    c.addEventListener("pointermove", onPointerMove);
    c.addEventListener("pointerleave", onLeave);

    // draw hover crosshair if any
    if (hoverRef.current && hoverRef.current.idx !== null) {
      const i = hoverRef.current.idx;
      if (i >= 0 && i < visible.length) {
        const x = mapX(i);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath(); ctx.moveTo(x, 20*dpr); ctx.lineTo(x, H - 30*dpr); ctx.stroke();
        // dot
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, mapY(visible[i].v), 3*dpr, 0, Math.PI*2); ctx.fill();
      }
    }

    // cleanup on unmount not needed here
  }, [series, range, displayCcy, usdIdr]);

  return (
    <div style={{ position: "relative", width: "100%", height: 320 }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
      {hoverInfo && (
        <div style={{ position: "absolute", left: hoverInfo.x/ (window.devicePixelRatio||1) + 8, top: hoverInfo.y/ (window.devicePixelRatio||1) - 40, background:"#111827", padding:"8px 10px", borderRadius:8, border:"1px solid rgba(255,255,255,0.04)", color:"#E5E7EB", fontSize:12 }}>
          <div style={{ fontWeight:700 }}>{displayCcy==="IDR"?fmtMoney(hoverInfo.point.v * usdIdr,"IDR"):fmtMoney(hoverInfo.point.v,"USD")}</div>
          <div style={{ fontSize:11, color:"#9CA3AF" }}>{new Date(hoverInfo.point.t).toLocaleString()}</div>
        </div>
      )}
      {!hoverInfo && <div style={{ position:"absolute", right:12, top:12, background:"rgba(255,255,255,0.02)", padding:"6px 10px", borderRadius:8, fontSize:12 }}>{displayCcy==="IDR"?fmtMoney((series.all && series.all.length?series.all[series.all.length-1].v:0)*usdIdr,"IDR"):fmtMoney((series.all && series.all.length?series.all[series.all.length-1].v:0),"USD")}</div>}
    </div>
  );
}

/* ===================== ASSET CHART MODAL (TradingView fallback -> sparkline) ===================== */
function AssetChartModal({ asset, onClose, displayCcy = "USD", usdIdr = 16000 }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [tvOk, setTvOk] = useState(false);
  const [sparkData, setSparkData] = useState([]);
  useEffect(()=>{
    let mounted = true;
    async function load(){
      // try CoinGecko if crypto
      if (asset.type === "crypto" && asset.coingeckoId) {
        try {
          const res = await fetch(COINGECKO_MARKET_CHART(asset.coingeckoId, 365));
          if (res.ok) {
            const j = await res.json();
            const prices = (j.prices || []).map(p => ({ t: p[0], v: p[1] }));
            if (mounted) setSparkData(prices);
          }
        } catch(e){}
      }
      // try TradingView
      try {
        if (!window.TradingView) {
          const s = document.createElement("script");
          s.src = "https://s3.tradingview.com/tv.js";
          s.async = true;
          document.head.appendChild(s);
          await new Promise(res=>{ s.onload = res; s.onerror = res; setTimeout(res, 1500); });
        }
        if (window.TradingView) {
          // try guess symbol
          const sym = asset.symbol || asset.name;
          const guess = asset.type==="crypto" ? `COINBASE:${sym.replace(/[^A-Z0-9]/gi,"")}USD` : (sym.toUpperCase().endsWith(".JK") ? `IDX:${sym.toUpperCase().replace(".JK","")}` : `NASDAQ:${sym}`);
          const id = `tv_${Math.random().toString(36).slice(2,8)}`;
          const div = document.createElement("div"); div.id = id; div.style.width = "100%"; div.style.height = "420px";
          containerRef.current.innerHTML = ""; containerRef.current.appendChild(div);
          try {
            new window.TradingView.widget({
              autosize: true, symbol: guess, interval: "D", timezone: "Etc/UTC",
              theme: "dark", style: "1", locale: "en", toolbar_bg: "#222629",
              enable_publishing: false, container_id: id,
            });
            setTvOk(true);
          } catch(e) { setTvOk(false); }
        } else setTvOk(false);
      } catch(e){ setTvOk(false); }
      setReady(true);
    }
    load();
    return ()=> mounted = false;
  }, [asset]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[140]">
      <div className="bg-gray-900 p-4 rounded-lg w-full max-w-4xl border border-gray-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-semibold">{asset.symbol} — {asset.name}</h3>
            <div className="text-xs text-gray-400">{asset.description}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="font-semibold">{displayCcy==="IDR"?fmtMoney((asset.lastPriceUSD||0)*usdIdr,"IDR"):fmtMoney(asset.lastPriceUSD||0,"USD")}</div>
              <div className="text-xs text-gray-400">{asset.type}</div>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-gray-800 rounded flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>

        <div className="mt-4" ref={containerRef}>
          {!ready && <div className="text-sm text-gray-400">Loading chart...</div>}
          {ready && !tvOk && <div><div className="text-sm text-gray-400 mb-2">TradingView not available — fallback chart shown.</div><SparklineCanvas data={sparkData.length?sparkData:[{t:Date.now(),v:asset.lastPriceUSD||asset.avgPrice||0}]} width={820} height={300} /></div>}
        </div>
      </div>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");
  useEffect(()=> setPrice(defaultPrice > 0 ? String(defaultPrice) : ""), [defaultPrice]);

  const priceUSD = priceCcy === "IDR" ? toNum(price) / (usdIdr || 1) : toNum(price);
  function submit(e){
    e.preventDefault();
    const q = toNum(qty), p = priceUSD;
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    if (mode === "buy") onBuy(q, p); else onSell(q, p);
  }
  if (!asset) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[150]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div><h2 className="text-xl font-semibold capitalize">{mode} {asset.symbol}</h2><p className="text-sm text-gray-400">{asset.name}</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <form onSubmit={submit} className="mt-4">
          <div className="mb-4"><label className="block text-sm font-medium mb-1">Quantity</label><input type="number" step="any" value={qty} onChange={e=>setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700"/></div>
          <div className="mb-4"><label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex">
              <input type="number" step="any" value={price} onChange={e=>setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700"/>
              <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right mb-4">Total: {fmtMoney(priceUSD * toNum(qty), "USD")}</div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode==="buy"?"bg-emerald-500 text-black":"bg-yellow-600 text-white"}`}>{mode==="buy"?"Confirm Buy":"Confirm Sell"}</button>
        </form>
      </div>
    </div>
  );
}

/* ===================== MAIN PAGE ===================== */
export default function PortfolioDashboard() {
  /* persistent storage loaders */
  const loadAssets = () => { try { if (!isBrowser) return []; const raw = JSON.parse(localStorage.getItem("pf_assets_v3") || "[]"); if (!Array.isArray(raw)) return []; return raw.map(ensureNumericAsset); } catch { return []; } };
  const loadTx = () => { try { if (!isBrowser) return []; const raw = JSON.parse(localStorage.getItem("pf_txs_v3") || "[]"); if (!Array.isArray(raw)) return []; return raw; } catch { return []; } };
  const loadRealized = () => { try { if (!isBrowser) return 0; return toNum(localStorage.getItem("pf_realized_v3") || 0); } catch { return 0; } };
  const loadCcy = () => { try { if (!isBrowser) return "USD"; return localStorage.getItem("pf_display_ccy_v3") || "USD"; } catch { return "USD"; } };

  const [assets, setAssets] = useState(loadAssets);
  const [transactions, setTransactions] = useState(loadTx);
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);
  const [displayCcy, setDisplayCcy] = useState(loadCcy);

  /* UI & FX */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ADD panel state */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  /* non-liquid inputs */
  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* misc UI */
  const [lastTick, setLastTick] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [tradeModal, setTradeModal] = useState({ open:false, mode:null, assetId:null, defaultPrice:null });
  const [chartRange, setChartRange] = useState("all");
  const [sortBy, setSortBy] = useState("market_desc");
  const [assetChartOpen, setAssetChartOpen] = useState(null);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* refs for outside click */
  const filterRef = useRef(null);
  const sortRef = useRef(null);
  const suggestionRef = useRef(null);
  const addPanelRef = useRef(null);
  const currencyRef = useRef(null);

  /* persist */
  useEffect(()=>{ try{ localStorage.setItem("pf_assets_v3", JSON.stringify(assets.map(ensureNumericAsset))); }catch{} }, [assets]);
  useEffect(()=>{ try{ localStorage.setItem("pf_txs_v3", JSON.stringify(transactions)); }catch{} }, [transactions]);
  useEffect(()=>{ try{ localStorage.setItem("pf_realized_v3", String(realizedUSD)); }catch{} }, [realizedUSD]);
  useEffect(()=>{ try{ localStorage.setItem("pf_display_ccy_v3", displayCcy); }catch{} }, [displayCcy]);

  /* click outside to close menus */
  useEffect(()=>{
    function onPointerDown(e){
      const t = e.target;
      if (filterMenuOpen && filterRef.current && !filterRef.current.contains(t) && !e.target.closest('[aria-label="Filter"]')) setFilterMenuOpen(false);
      if (sortMenuOpen && sortRef.current && !sortRef.current.contains(t) && !e.target.closest('[aria-label="Sort"]')) setSortMenuOpen(false);
      if (suggestions.length > 0 && suggestionRef.current && !suggestionRef.current.contains(t) && !addPanelRef.current?.contains(t)) setSuggestions([]);
      if (openAdd && addPanelRef.current && !addPanelRef.current.contains(t) && !e.target.closest('[aria-label="Add asset"]')) setOpenAdd(false);
      if (currencyMenuOpen && currencyRef.current && !currencyRef.current.contains(t) && !e.target.closest('[aria-label="Currency"]')) setCurrencyMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return ()=>document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen, sortMenuOpen, suggestions, openAdd, currencyMenuOpen]);

  /* SEARCH logic */
  const searchTimeout = useRef(null);
  useEffect(()=>{
    if (!query || query.trim().length < 1 || searchMode === "nonliquid") { setSuggestions([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async ()=>{
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0,20).map(c=>({ id:c.id, symbol:(c.symbol||"").toUpperCase(), display:c.name, source:"coingecko", type:"crypto" })));
          return;
        }
        // For stocks try proxies (Finnhub -> Alpha -> Yahoo)
        const proxyCandidates = [(t)=>FINNHUB_QUOTE(t),(t)=>ALPHAVANTAGE_QUOTE(t), YAHOO_QUOTE];
        let payload = null;
        for (const p of proxyCandidates) {
          try {
            const url = typeof p === "function" ? p(q) : p(q);
            const res = await fetch(url);
            if (!res.ok) continue;
            payload = await res.json();
            if (payload) break;
          } catch(e){}
        }
        if (!payload) { setSuggestions([]); return; }
        const rawList = payload.quotes || payload.result || payload.items || payload.data || payload.finance || payload["bestMatches"] || [];
        const arr = Array.isArray(rawList) ? rawList : (payload.result || []);
        const list = arr.slice(0,120).map(it=>{
          const symbol = it.symbol || it.ticker || it["1. symbol"] || it["symbol"] || (typeof it === "string" ? it : "");
          const display = it.shortname || it.name || it["2. name"] || it.longname || symbol;
          const exchange = it.exchange || it.fullExchangeName || it["4. region"] || "";
          return { symbol: (symbol||"").toString().toUpperCase(), display, exchange, source: "yahoo", type: "stock" };
        });
        if (searchMode === "id") {
          setSuggestions(list.filter(x=> (x.symbol||"").includes(".JK") || String(x.exchange||"").toUpperCase().includes("JAKARTA") || String(x.exchange||"").toUpperCase().includes("IDX")).slice(0,30));
        } else {
          setSuggestions(list.filter(x=> !(x.symbol||"").toUpperCase().endsWith(".JK")).slice(0,30));
        }
      } catch(e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return ()=>{ if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, searchMode]);

  /* POLLING prices: crypto (CoinGecko) and stocks (Finnhub -> Alpha -> Yahoo) */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(()=> assetsRef.current = assets, [assets]);
  useEffect(()=> usdIdrRef.current = usdIdr, [usdIdr]);

  useEffect(()=>{
    let mounted = true;
    async function pollCrypto(){
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a=>a.type==="crypto" && a.coingeckoId).map(a=>a.coingeckoId)));
        if (ids.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && a.coingeckoId && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares||0) });
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch(e){}
    }
    pollCrypto();
    const id = setInterval(pollCrypto, 6000);
    return ()=>{ mounted=false; clearInterval(id); };
  }, [isInitialLoading]);

  useEffect(()=>{
    let mounted = true;
    async function pollStocks(){
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a=>a.type==="stock").map(a=>a.symbol))).slice(0, 50);
        if (symbols.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const map = {};
        // Finnhub per-symbol
        for (const s of symbols) {
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) throw new Error("finnhub fail");
            const js = await res.json();
            const current = toNum(js?.c ?? js?.current ?? 0);
            if (current > 0) {
              const looksLikeId = String(s||"").toUpperCase().endsWith(".JK");
              let priceUSD = current;
              if (looksLikeId) { const fx = usdIdrRef.current || 1; priceUSD = fx>0 ? (current / fx) : current; }
              map[s] = { symbol: s, priceRaw: current, priceUSD, _source: "finnhub", currency: looksLikeId ? "IDR" : js?.currency || "USD", fullExchangeName: js?.exchange || "" };
            }
          } catch(e){}
        }
        // AlphaVantage single-symbol fallback for missing
        const missing = symbols.filter(s => !map[s]);
        for (const s of missing) {
          try {
            const res = await fetch(ALPHAVANTAGE_QUOTE(s));
            if (!res.ok) throw new Error("alpha fail");
            const j = await res.json();
            // parse Global Quote if present
            const g = j && (j["Global Quote"] || j["globalQuote"] || j["Global"] || j) ;
            const rawPrice = toNum(g && (g["05. price"] || g["price"] || g["05_price"] || g["05. Price"]) || 0);
            if (rawPrice > 0) {
              map[s] = { symbol: s, priceRaw: rawPrice, priceUSD: rawPrice, _source: "alpha", currency: j?.currency || "USD", fullExchangeName: j?.exchange || "" };
            }
          } catch(e){}
        }
        // Yahoo bulk fallback
        const stillMissing = symbols.filter(s => !map[s]);
        if (stillMissing.length > 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(stillMissing.join(",")));
            if (res.ok) {
              const j = await res.json();
              if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
                j.quoteResponse.result.forEach(q => {
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: price, priceUSD: price, currency: q.currency || "USD", _source: "yahoo", fullExchangeName: q.fullExchangeName };
                });
              } else if (Array.isArray(j)) {
                j.forEach(q => { const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0); if (price>0 && q?.symbol) map[q.symbol] = { symbol:q.symbol, priceRaw:price, _source:"yahoo" }; });
              }
            }
          } catch(e){}
        }

        // apply
        setAssets(prev => prev.map(a => {
          if (a.type === "stock") {
            const q = map[a.symbol];
            if (q) {
              let price = toNum(q.priceRaw || q.priceUSD || 0);
              const currency = (q.currency || "").toString().toUpperCase();
              const looksLikeId = currency === "IDR" || String(a.symbol||"").toUpperCase().endsWith(".JK") || String(q.fullExchangeName||"").toUpperCase().includes("JAKARTA");
              if (looksLikeId && price > 0) {
                const fx = usdIdrRef.current || 1;
                price = fx > 0 ? (price / fx) : price;
              }
              if (!(price > 0)) price = a.avgPrice || a.lastPriceUSD || 0;
              return ensureNumericAsset({ ...a, lastPriceUSD: price, marketValueUSD: price * toNum(a.shares||0) });
            } else {
              // fallback: keep previous but ensure not zero — fallback to avgPrice
              const fallback = a.lastPriceUSD || a.avgPrice || 0;
              return ensureNumericAsset({ ...a, lastPriceUSD: fallback, marketValueUSD: fallback * toNum(a.shares||0) });
            }
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch(e){}
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return ()=>{ mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  /* FX tether -> IDR via CoinGecko */
  useEffect(()=>{
    let mounted = true;
    async function fetchFx(){
      try {
        setFxLoading(true);
        const res = await fetch(`${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
      } catch(e){} finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return ()=>{ mounted = false; clearInterval(id); };
  }, []);

  /* compute non-liquid last price via YoY */
  function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, now = Date.now()) {
    const years = Math.max(0, (now - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
    const r = toNum(yoyPercent) / 100;
    const last = avgPriceUSD * Math.pow(1 + r, years);
    return last;
  }

  /* transactions apply/reverse */
  function applyTxEffects(tx) {
    if (!tx) return;
    if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) {
          const oldShares = toNum(a.shares || 0);
          const newShares = Math.max(0, oldShares - tx.qty);
          const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.costOfSold);
          const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
          const lastPriceUSD = tx.pricePerUnit || a.lastPriceUSD || newAvg;
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD, marketValueUSD: newShares * lastPriceUSD });
        }
        return ensureNumericAsset(a);
      }));
      setRealizedUSD(prev => prev + toNum(tx.realized || 0));
    } else if (tx.type === "buy") {
      setAssets(prev => {
        const found = prev.find(a => a.id === tx.assetId);
        if (found) {
          return prev.map(a => {
            if (a.id === tx.assetId) {
              const oldShares = toNum(a.shares || 0);
              const oldInvested = toNum(a.investedUSD || 0);
              const newShares = oldShares + tx.qty;
              const newInvested = oldInvested + tx.cost;
              const newAvg = newShares > 0 ? newInvested / newShares : 0;
              const lastPriceUSD = tx.pricePerUnit || a.lastPriceUSD || newAvg;
              return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD, marketValueUSD: newShares * lastPriceUSD });
            }
            return ensureNumericAsset(a);
          });
        } else {
          const avg = tx.cost / (tx.qty || 1);
          const asset = ensureNumericAsset({
            id: tx.assetId || `tx-asset:${tx.symbol}:${Date.now()}`,
            type: tx.assetType || "stock",
            symbol: tx.symbol, name: tx.name || tx.symbol,
            shares: tx.qty, avgPrice: avg, investedUSD: tx.cost, lastPriceUSD: tx.pricePerUnit || avg, marketValueUSD: tx.qty * (tx.pricePerUnit || avg),
          });
          return [...prev, asset];
        }
      });
    }
  }
  function reverseTxEffects(tx) {
    if (!tx) return;
    if (tx.type === "sell") {
      setAssets(prev => {
        const found = prev.find(a => a.id === tx.assetId);
        if (found) {
          return prev.map(a => {
            if (a.id === tx.assetId) {
              const oldShares = toNum(a.shares || 0);
              const newShares = oldShares + tx.qty;
              const newInvested = toNum(a.investedUSD || 0) + tx.costOfSold;
              const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
              const lastPriceUSD = a.lastPriceUSD || newAvg;
              return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD, marketValueUSD: newShares * lastPriceUSD });
            }
            return ensureNumericAsset(a);
          });
        } else {
          const avg = tx.costOfSold / (tx.qty || 1);
          const asset = ensureNumericAsset({
            id: tx.assetId || `restored:${tx.symbol}:${Date.now()}`,
            type: tx.assetType || "stock",
            symbol: tx.symbol, name: tx.name || tx.symbol,
            shares: tx.qty, avgPrice: avg, investedUSD: tx.costOfSold, lastPriceUSD: tx.pricePerUnit || avg, marketValueUSD: tx.qty * (tx.pricePerUnit || avg),
          });
          return [...prev, asset];
        }
      });
      setRealizedUSD(prev => prev - toNum(tx.realized || 0));
    } else if (tx.type === "buy") {
      setAssets(prev => {
        const found = prev.find(a => a.id === tx.assetId);
        if (!found) return prev;
        return prev.flatMap(a => {
          if (a.id === tx.assetId) {
            const oldShares = toNum(a.shares || 0);
            const newShares = Math.max(0, oldShares - tx.qty);
            const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.cost);
            if (newShares <= 0) return [];
            const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
            const lastPriceUSD = a.lastPriceUSD || newAvg;
            return [ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD, marketValueUSD: newShares * lastPriceUSD })];
          }
          return [ensureNumericAsset(a)];
        });
      });
    }
  }

  /* add asset helpers */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source||s.type}:${s.symbol||s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId, type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol||s.id).toString().toUpperCase(), name: s.display||s.name||s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, createdAt: Date.now(),
    });
    setAssets(prev=>[...prev, asset]); setOpenAdd(false); setQuery(""); setSuggestions([]); setSelectedSuggestion(null);
  }
  async function addManualAsset(){
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or select suggestion"); return; }
    let newAsset = ensureNumericAsset({ id:`manual:${typed}:${Date.now()}`, type: searchMode==="crypto"?"crypto":"stock", symbol:typed.toUpperCase(), name:typed, shares:0, avgPrice:0, investedUSD:0, lastPriceUSD:0, marketValueUSD:0 });
    setAssets(prev=>[...prev, newAsset]); setOpenAdd(false); setQuery("");
  }
  async function addAssetWithInitial(){
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode==="crypto") picked = { source:"coingecko", id:typed.toLowerCase(), symbol:typed.toUpperCase(), display:typed };
      else picked = { source:"yahoo", symbol:typed.toUpperCase(), display:typed.toUpperCase() };
    }
    const qty = toNum(initQty), priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const internalId = `${picked.source||picked.type}:${picked.symbol||picked.id}:${Date.now()}`;
    const priceInUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr||1) : priceInput;
    const asset = ensureNumericAsset({
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.source === "coingecko" ? (picked.id||picked.coingeckoId) : undefined,
      symbol: (picked.symbol||picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty, avgPrice: priceInUSD, investedUSD: priceInUSD * qty, lastPriceUSD: priceInUSD, marketValueUSD: priceInUSD * qty,
      createdAt: Date.now(), purchaseDate: Date.now()
    });
    setAssets(prev=>[...prev, asset]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  function addNonLiquidAsset(){
    const name = nlName.trim();
    const qty = toNum(nlQty); const priceInput = toNum(nlPrice);
    if (!name) { alert("Enter name (Land, Art, Rolex...)"); return; }
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    const priceUSD = nlPriceCcy === "IDR" ? priceInput / (usdIdr||1) : priceInput;
    const id = `nonliquid:${name.replace(/\s+/g,"_")}:${Date.now()}`;
    const last = computeNonLiquidLastPrice(priceUSD, purchaseDateMs, nlYoy);
    const asset = ensureNumericAsset({
      id, type: "nonliquid", symbol:(name.length>12?name.slice(0,12)+"…":name).toUpperCase(),
      name, shares: qty, avgPrice: priceUSD, investedUSD: priceUSD*qty, lastPriceUSD: last, marketValueUSD: last*qty,
      createdAt: Date.now(), purchaseDate: purchaseDateMs, nonLiquidYoy: toNum(nlYoy), description: nlDesc||""
    });
    setAssets(prev=>[...prev, asset]);
    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc(""); setOpenAdd(false);
  }

  /* buy/sell handlers */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId); if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open:true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open:false, mode:null, assetId:null, defaultPrice:null }); }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit); if (q<=0||p<=0){ alert("Qty & price must be > 0"); return; }
    const cost = q * p;
    const tx = { id:`tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, assetId:id, assetType:(assets.find(a=>a.id===id)||{}).type||"stock", symbol:(assets.find(a=>a.id===id)||{}).symbol||"", name:(assets.find(a=>a.id===id)||{}).name||"", type:"buy", qty:q, pricePerUnit:p, cost, date:Date.now() };
    setTransactions(prev => [tx, ...prev].slice(0,1200));
    applyTxEffects(tx);
    closeTradeModal();
  }
  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit); if (q<=0||p<=0){ alert("Qty & price must be > 0"); return; }
    const a = assets.find(x=>x.id===id); if (!a) return;
    const oldShares = toNum(a.shares||0); if (q>oldShares){ alert("Cannot sell more than you own"); return; }
    const avg = toNum(a.avgPrice||0);
    const proceeds = q * p, costOfSold = q * avg;
    const realized = proceeds - costOfSold;
    const tx = { id:`tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, assetId: a.id, assetType: a.type||"stock", symbol: a.symbol, name: a.name||"", type:"sell", qty:q, pricePerUnit:p, proceeds, costOfSold, realized, date:Date.now() };
    applyTxEffects(tx);
    setTransactions(prev=>[tx,...prev].slice(0,1200));
    closeTradeModal();
  }

  /* transactions delete/restore */
  function deleteTransaction(txId) {
    const tx = transactions.find(t=>t.id===txId); if (!tx) return;
    if (!confirm(`Delete & reverse transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit|| (tx.cost/tx.qty||0))})?`)) return;
    reverseTxEffects(tx);
    setTransactions(prev => prev.filter(t=>t.id!==txId));
    setLastDeletedTx(tx);
  }
  function restoreTransaction(txId) {
    const tx = transactions.find(t=>t.id===txId); if (!tx) return;
    if (!confirm(`Restore (reverse) transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit|| (tx.cost/tx.qty||0))})?`)) return;
    reverseTxEffects(tx);
    setTransactions(prev => prev.filter(t=>t.id!==txId));
  }
  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTxEffects(lastDeletedTx);
    setTransactions(prev => [lastDeletedTx, ...prev]);
    setLastDeletedTx(null);
  }
  function purgeLastDeletedTransaction() { setLastDeletedTx(null); }

  /* remove asset */
  function removeAsset(id) {
    const a = assets.find(x=>x.id===id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name||""}) from portfolio?`)) return;
    setAssets(prev=>prev.filter(x=>x.id!==id));
  }

  /* computed rows & totals */
  const rows = useMemo(()=> assets.map(a=>{
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate||aa.createdAt, aa.nonLiquidYoy||0);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares||0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || 0);
      if (!aa.lastPriceUSD || aa.lastPriceUSD <= 0) aa.lastPriceUSD = aa.avgPrice || aa.lastPriceUSD || 0;
      aa.marketValueUSD = toNum(aa.shares||0) * aa.lastPriceUSD;
    }
    const market = aa.marketValueUSD || (toNum(aa.shares||0) * aa.lastPriceUSD);
    const invested = toNum(aa.investedUSD || 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets, usdIdr]);

  const filteredRows = useMemo(()=> {
    if (portfolioFilter==="all") return rows;
    if (portfolioFilter==="crypto") return rows.filter(r=>r.type==="crypto");
    if (portfolioFilter==="stock") return rows.filter(r=>r.type==="stock");
    if (portfolioFilter==="nonliquid") return rows.filter(r=>r.type==="nonliquid");
    return rows;
  }, [rows, portfolioFilter]);

  const sortedRows = useMemo(()=> {
    const copy = [...filteredRows];
    switch (sortBy) {
      case "market_desc": copy.sort((a,b)=>b.marketValueUSD - a.marketValueUSD); break;
      case "invested_desc": copy.sort((a,b)=>b.investedUSD - a.investedUSD); break;
      case "pnl_desc": copy.sort((a,b)=> (b.pnlUSD||0) - (a.pnlUSD||0)); break;
      case "symbol_asc": copy.sort((a,b)=> (a.symbol||"").localeCompare(b.symbol||"")); break;
      case "oldest": copy.sort((a,b)=> (a.createdAt||0) - (b.createdAt||0)); break;
      case "newest": copy.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0)); break;
      default: break;
    }
    return copy;
  }, [filteredRows, sortBy]);

  const totals = useMemo(()=> {
    const invested = filteredRows.reduce((s,r)=>s + toNum(r.investedUSD||0),0);
    const market = filteredRows.reduce((s,r)=>s + toNum(r.marketValueUSD||0),0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows]);

  /* donut/cake data */
  const cakeData = useMemo(()=> {
    const sorted = filteredRows.slice().sort((a,b)=>b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0,6);
    const other = sorted.slice(6);
    const otherTotal = other.reduce((s,r)=>s + (r.marketValueUSD||0),0);
    const otherSymbols = other.map(r=>r.symbol);
    const data = top.map(r=>({ name:r.symbol, value: Math.max(0, r.marketValueUSD||0) }));
    if (otherTotal>0) data.push({ name:"Other", value: otherTotal, symbols: otherSymbols });
    return data;
  }, [filteredRows]);

  /* CSV improved: combined assets + transactions */
  function csvQuote(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }
  function exportCombinedCSV() {
    const assetH = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","createdAt","purchaseDate","nonLiquidYoy"];
    const txH = ["id","type","assetId","assetType","symbol","name","qty","pricePerUnit","cost","proceeds","costOfSold","realized","date"];
    const lines = [];
    lines.push(`#FILE:app/dashboard/page.js`);
    lines.push(`#EXPORT:CombinedPortfolioAndTransactions,generatedAt=${isoDate(Date.now())}`);
    lines.push(`#ASSETS`); lines.push(assetH.join(","));
    assets.forEach(a=>{
      const aa = ensureNumericAsset(a);
      const row = assetH.map(h=>{
        const v = aa[h];
        if (h==="createdAt"||h==="purchaseDate") return csvQuote(isoDate(v));
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push(""); lines.push(`#TRANSACTIONS`); lines.push(txH.join(","));
    transactions.forEach(t=>{
      const row = txH.map(h=>{
        const v = t[h];
        if (h==="date") return csvQuote(isoDate(v));
        if (typeof v === "number") return String(v);
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr}`);
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `portfolio_combined_export_${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function handleImportFile(file, { merge = true } = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).map(l=>l.trimRight());
      if (lines.length === 0) return alert("Empty file");
      const idxAssets = lines.findIndex(l => l.startsWith("#ASSETS"));
      const idxTx = lines.findIndex(l => l.startsWith("#TRANSACTIONS"));
      const meta = lines.find(l => l.startsWith("#META"));
      const importedAssets = [];
      const importedTx = [];
      if (idxAssets >= 0) {
        let headerIdx = -1;
        for (let i = idxAssets+1; i < lines.length; i++) { if (lines[i].trim()==="") continue; headerIdx = i; break; }
        if (headerIdx >= 0) {
          const headers = lines[headerIdx].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
          for (let i = headerIdx+1; i < lines.length; i++) {
            const l = lines[i]; if (!l || l.startsWith("#TRANSACTIONS") || l.startsWith("#META")) break;
            const values=[]; let cur=""; let inside=false;
            for (let k=0;k<l.length;k++){
              const ch = l[k];
              if (ch==='"' && l[k+1]==='"') { cur+='"'; k++; continue; }
              if (ch==='"') { inside = !inside; continue; }
              if (ch === "," && !inside) { values.push(cur); cur=""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj={}; headers.forEach((h,idx)=>{ obj[h] = values[idx] ?? ""; });
            const parsed = {
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
              createdAt: obj.createdAt ? (Date.parse(obj.createdAt)||Date.now()) : Date.now(),
              purchaseDate: obj.purchaseDate ? (Date.parse(obj.purchaseDate)||undefined) : undefined,
              nonLiquidYoy: toNum(obj.nonLiquidYoy||0),
            };
            importedAssets.push(ensureNumericAsset(parsed));
          }
        }
      }
      if (idxTx >= 0) {
        let headerIdx = -1;
        for (let i = idxTx+1; i<lines.length; i++){ if (lines[i].trim()==="") continue; headerIdx = i; break; }
        if (headerIdx >= 0) {
          const headers = lines[headerIdx].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
          for (let i = headerIdx+1; i<lines.length; i++){
            const l = lines[i]; if (!l || l.startsWith("#META") || l.startsWith("#FILE")) break;
            const values=[]; let cur=""; let inside=false;
            for (let k=0;k<l.length;k++){
              const ch = l[k];
              if (ch==='"' && l[k+1]==='"') { cur+='"'; k++; continue; }
              if (ch==='"') { inside=!inside; continue; }
              if (ch === "," && !inside) { values.push(cur); cur=""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj={}; headers.forEach((h,idx)=>{ obj[h] = values[idx] ?? ""; });
            const parsed = {
              id: obj.id || `imp_tx:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
              type: obj.type || "buy",
              assetId: obj.assetId || undefined,
              assetType: obj.assetType || "stock",
              symbol: (obj.symbol||"").toString().toUpperCase(),
              name: obj.name || obj.symbol || "",
              qty: toNum(obj.qty||0),
              pricePerUnit: toNum(obj.pricePerUnit||0),
              cost: toNum(obj.cost||0),
              proceeds: toNum(obj.proceeds||0),
              costOfSold: toNum(obj.costOfSold||0),
              realized: toNum(obj.realized||0),
              date: obj.date ? (Date.parse(obj.date) || Date.now()) : Date.now(),
            };
            importedTx.push(parsed);
          }
        }
      }
      if (meta) {
        try {
          const m = meta.replace(/^#META,?/, "");
          const parts = m.split(",");
          parts.forEach(p=>{ const [k,v] = p.split("="); if (k==="realizedUSD") setRealizedUSD(toNum(v)); if (k==="displayCcy" && v) setDisplayCcy(String(v)); if (k==="usdIdr") setUsdIdr(toNum(v)); });
        } catch(e){}
      }
      if (importedAssets.length>0) {
        if (merge) { const map={}; assets.forEach(a=>map[a.symbol]=ensureNumericAsset(a)); importedAssets.forEach(i=>map[i.symbol]=ensureNumericAsset(i)); setAssets(Object.values(map)); }
        else setAssets(importedAssets);
      }
      if (importedTx.length>0) {
        if (merge) setTransactions(prev=>[...importedTx,...prev].slice(0,1200));
        else setTransactions(importedTx.slice(0,1200));
      }
      alert("Import complete");
    };
    reader.readAsText(file);
  }
  function onImportChange(e) { const file = e.target.files && e.target.files[0]; if (!file) return; const replace = confirm("Replace existing portfolio & transactions? (OK = replace, Cancel = merge)"); handleImportFile(file, { merge: !replace }); e.target.value = ""; }

  /* Build multi-category series for growth chart (generate daily points) */
  function buildSeries(rowsInput, txsInput) {
    // Determine timeline: earliest purchase/tx date -> today, daily steps
    const now = Date.now();
    const allDates = [];
    rowsInput.forEach(r => {
      const pd = r.purchaseDate || r.createdAt || Date.now();
      allDates.push(pd);
    });
    txsInput.forEach(t => { if (t.date) allDates.push(t.date); });
    const earliest = allDates.length ? Math.min(...allDates) : now - 30*24*3600*1000;
    const start = new Date(earliest);
    start.setHours(0,0,0,0);
    const days = Math.max(10, Math.ceil((now - start.getTime())/(24*3600*1000)));
    const timeline = [];
    for (let i=0;i<=days;i++){ timeline.push(start.getTime() + i*24*3600*1000); }

    // For each asset, create synthetic historical price series if API not available:
    // We'll linearly interpolate from known 'avgPrice' at purchaseDate to 'lastPriceUSD' at now, with seeded noise.
    const perAssetSeries = {};
    rowsInput.forEach(a=>{
      const seed = hashStringToSeed(a.symbol || a.id || String(Math.random()));
      const rng = seededRng(seed);
      const purchase = a.purchaseDate || a.createdAt || now;
      const pPrice = a.avgPrice || 0;
      const last = a.lastPriceUSD || a.avgPrice || 0;
      const arr = timeline.map(t => {
        const frac = Math.min(1, Math.max(0, (t - purchase) / Math.max(1, now - purchase)));
        // linear + small noise scaled to price
        const base = pPrice + (last - pPrice) * frac;
        const noise = (rng() - 0.5) * 0.025 * Math.max(1, Math.abs(base));
        const v = Math.max(0.0000001, base + noise);
        return { t, v };
      });
      perAssetSeries[a.id] = arr;
    });

    // Now compute holdings over time using transactions
    // holdings[assetId][dateIndex] = shares at that day (end of day)
    const holdings = {};
    rowsInput.forEach(a => {
      holdings[a.id] = new Array(timeline.length).fill(0);
      // initial: if asset existed before first date, might have shares via 'shares' current; we will reconstruct via transactions if possible
    });
    // Apply transactions chronologically to compute holdings
    const txsSorted = txsInput.slice().sort((a,b)=>a.date - b.date);
    // start with zero holdings
    for (let i=0;i<timeline.length;i++) {
      const t = timeline[i];
      // copy previous day
      if (i>0) {
        Object.keys(holdings).forEach(id => holdings[id][i] = holdings[id][i-1]);
      }
      // apply transactions on that day
      txsSorted.forEach(tx => {
        if (tx.date >= t && tx.date < t + 24*3600*1000) {
          if (!holdings[tx.assetId]) return;
          if (tx.type === "buy") holdings[tx.assetId][i] += tx.qty;
          if (tx.type === "sell") holdings[tx.assetId][i] = Math.max(0, holdings[tx.assetId][i] - tx.qty);
        }
      });
    }

    // If no transactions, use current shares across all days (assume held since purchaseDate)
    Object.keys(holdings).forEach(id=>{
      const anyNonZero = holdings[id].some(v=>v>0);
      if (!anyNonZero) {
        // use asset.shares from rowsInput if exists
        const a = rowsInput.find(r=>r.id===id);
        if (a) {
          for (let i=0;i<timeline.length;i++) {
            if (timeline[i] >= (a.purchaseDate || a.createdAt || 0)) holdings[id][i] = a.shares || 0;
          }
        }
      }
    });

    // For each day compute category totals and overall total
    const allSeries = [];
    const cryptoSeries = []; const stockSeries = []; const nonliquidSeries = [];
    for (let i=0;i<timeline.length;i++){
      const t = timeline[i];
      let totalAll = 0, totalCrypto = 0, totalStock = 0, totalNon = 0;
      Object.keys(perAssetSeries).forEach(id=>{
        const asset = rowsInput.find(r=>r.id===id);
        if (!asset) return;
        const pricePoint = perAssetSeries[id][i] || perAssetSeries[id][perAssetSeries[id].length-1] || {v: asset.lastPriceUSD || asset.avgPrice || 0};
        const shares = holdings[id][i] || 0;
        const val = shares * pricePoint.v;
        totalAll += val;
        if (asset.type === "crypto") totalCrypto += val;
        else if (asset.type === "stock") totalStock += val;
        else if (asset.type === "nonliquid") totalNon += val;
      });
      allSeries.push({ t, v: totalAll });
      cryptoSeries.push({ t, v: totalCrypto });
      stockSeries.push({ t, v: totalStock });
      nonliquidSeries.push({ t, v: totalNon });
    }

    return { all: allSeries, crypto: cryptoSeries, stock: stockSeries, nonliquid: nonliquidSeries };
  }

  const multiSeries = useMemo(()=> buildSeries(rows, transactions), [rows, transactions]);

  /* palette for legend */
  const colors = { all:"#60A5FA", crypto:"#7C3AED", stock:"#34D399", nonliquid:"#F59E0B" };

  /* UI rendering */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <style>{styles}</style>
      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 relative">
            <h1 className="text-2xl font-semibold">All Portfolio</h1>
            <button aria-label="Filter" onClick={()=>setFilterMenuOpen(v=>!v)} className="ml-2 inline-flex items-center justify-center text-gray-200" style={{ fontSize:18, padding:6 }} title="Filter portfolio">
              {/* small dropdown icon (no box) */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
            {filterMenuOpen && (
              <div ref={filterRef} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44 menu-scroll fade-in">
                <button onClick={()=>{ setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                <button onClick={()=>{ setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                <button onClick={()=>{ setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                <button onClick={()=>{ setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button aria-label="Currency" onClick={()=>setCurrencyMenuOpen(v=>!v)} className="inline-flex items-center gap-2" style={{ background:"transparent", border:0, padding:"6px 8px" }} title="Currency">
                <span style={{ whiteSpace: "nowrap", fontSize:20, fontWeight:700 }}>
                  {displayCcy==="IDR" ? `${new Intl.NumberFormat("id-ID",{ maximumFractionDigits:0 }).format(totals.market*usdIdr)} IDR` : `${new Intl.NumberFormat("en-US",{ maximumFractionDigits:2 }).format(totals.market)} USD`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" className="ml-1" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {currencyMenuOpen && (
                <div ref={currencyRef} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-36 fade-in">
                  <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                  <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>

            <button aria-label="Add asset" onClick={()=>setOpenAdd(v=>!v)} className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn`} title="Add asset">
              <span style={{ display:"inline-block", transformOrigin:"50% 50%", transition:"transform .22s" }} className={openAdd ? "rotate-open" : ""}>+</span>
            </button>
          </div>
        </div>

        {/* Subheader */}
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          {isInitialLoading && assets.length>0 ? (<><svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Loading portfolio data...</span></>) :
            ( lastTick && <><span>Updated: {new Date(lastTick).toLocaleString()}</span><span>•</span><span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? (<svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : usdIdr?.toLocaleString()}</span></>)}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-center">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy==="IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{displayCcy==="IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Gain P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy==="IDR"?fmtMoney(totals.pnl*usdIdr,"IDR"):fmtMoney(totals.pnl,"USD")} ({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex items-center justify-between text-gray-400 cursor-pointer" onClick={()=>setTransactionsOpen(true)}>
            <div className="flex items-center gap-2"><div>Realized P&L</div></div>
            <div className="flex items-center gap-2">
              <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy==="IDR"?fmtMoney(realizedUSD*usdIdr,"IDR"):fmtMoney(realizedUSD,"USD")}</div>
              <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center icon-box">
                {/* small tilted arrow inside box */}
                <svg width="12" height="12" viewBox="0 0 24 24"><path d="M7 17 L17 7" stroke={realizedUSD >= 0 ? "#34D399" : "#F87171"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 7h3v3" stroke={realizedUSD >= 0 ? "#34D399" : "#F87171"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              </div>
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={()=>{ setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="crypto" ? "bg-gray-800" : ""} btn-soft`}>Crypto</button>
                <button onClick={()=>{ setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="id" ? "bg-gray-800" : ""} btn-soft`}>Stocks ID</button>
                <button onClick={()=>{ setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="us" ? "bg-gray-800" : ""} btn-soft`}>Stocks US</button>
                <button onClick={()=>{ setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="nonliquid" ? "bg-gray-800" : ""} btn-soft`}>Non-Liquid</button>
              </div>
            </div>

            {searchMode !== "nonliquid" ? (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={e=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode==="crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s,i)=>(
                        <button key={i} onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                          <div><div className="font-medium text-gray-100">{s.symbol} • {s.display}</div><div className="text-xs text-gray-500">{s.source==="coingecko" ? "Crypto" : `Security • ${s.exchange||''}`}</div></div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={e=>setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <input value={initPrice} onChange={e=>setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <select value={initPriceCcy} onChange={e=>setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option><option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={()=> selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add</button>
                  <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn">Add + Position</button>
                  <button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400">Name (Land, Art, Rolex...)</label><input value={nlName} onChange={e=>setNlName(e.target.value)} placeholder="e.g. Land" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Quantity</label><input value={nlQty} onChange={e=>setNlQty(e.target.value)} placeholder="1" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Price (per unit)</label><input value={nlPrice} onChange={e=>setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Currency</label><select value={nlPriceCcy} onChange={e=>setNlPriceCcy(e.target.value)} className="w-full rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800"><option value="USD">USD</option><option value="IDR">IDR</option></select></div>
                <div><label className="text-xs text-gray-400">Purchase date</label><input type="date" value={nlPurchaseDate} onChange={e=>setNlPurchaseDate(e.target.value)} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">YoY gain (%)</label><input value={nlYoy} onChange={e=>setNlYoy(e.target.value)} placeholder="5" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-gray-400">Description (optional: address, serial...)</label><input value={nlDesc} onChange={e=>setNlDesc(e.target.value)} placeholder="Optional description" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div className="sm:col-span-2 flex gap-2"><button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Non-Liquid</button><button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button></div>
              </div>
            )}
          </div>
        )}

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Assets</div>
            <div className="flex items-center gap-2">
              <button aria-label="Sort" onClick={()=>setSortMenuOpen(v=>!v)} className="inline-flex items-center justify-center rounded px-2 py-1 bg-gray-900 border border-gray-800 text-gray-200 btn" title="Sort assets">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6h12" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round"/><path d="M9 12h6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round"/><path d="M11 18h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
              {sortMenuOpen && (
                <div ref={sortRef} className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-56 z-40 menu-scroll fade-in">
                  <button onClick={()=>{ setSortBy("market_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Value (high → low)</button>
                  <button onClick={()=>{ setSortBy("invested_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Invested (high → low)</button>
                  <button onClick={()=>{ setSortBy("pnl_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">P&L (high → low)</button>
                  <button onClick={()=>{ setSortBy("symbol_asc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">A → Z</button>
                  <button onClick={()=>{ setSortBy("oldest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Oldest</button>
                  <button onClick={()=>{ setSortBy("newest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Newest</button>
                </div>
              )}
            </div>
          </div>

          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : sortedRows.map(r=>(
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <button onClick={()=>setAssetChartOpen(r)} className="font-semibold text-gray-100 hover:underline">{r.symbol}</button>
                        <div className="text-xs text-gray-400">{r.description || r.name}</div>
                      </div>
                      {/* moved info 'i' into chart modal area as requested; here only show small source dot */}
                      <div className="flex items-center gap-2">
                        <div title={`Source: ${r.type === "crypto" ? "CoinGecko / API" : "Finnhub/Alpha/Yahoo (fallback)"}`} className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center text-xs">{r.type[0].toUpperCase()}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares||0).toLocaleString(undefined,{ maximumFractionDigits:8 })}</td>

                  {/* Invested (big) / Avg price (small) */}
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy==="IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy==="IDR"?fmtMoney(r.avgPrice*usdIdr,"IDR"):fmtMoney(r.avgPrice,"USD")}</div>
                  </td>

                  {/* Market value (big) / Current Price (small) */}
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy==="IDR"?fmtMoney(r.marketValueUSD*usdIdr,"IDR"):fmtMoney(r.marketValueUSD,"USD")}</div>
                    <div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? (displayCcy==="IDR"?fmtMoney(r.lastPriceUSD*usdIdr,"IDR"):fmtMoney(r.lastPriceUSD,"USD")) : "-"}</div>
                  </td>

                  {/* P&L */}
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD>=0?"text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR"?fmtMoney(r.pnlUSD*usdIdr,"IDR"):fmtMoney(r.pnlUSD,"USD")}</div>
                    <div className={`text-xs ${r.pnlUSD>=0?"text-emerald-400":"text-red-400"}`}>{isFinite(r.pnlPct)?`${r.pnlPct.toFixed(2)}%`:"0.00%"}</div>
                  </td>

                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={()=>openTradeModal(r.id,"buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button>
                      <button onClick={()=>openTradeModal(r.id,"sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button>
                      <button onClick={()=>removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PORTFOLIO GROWTH (above donut) */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(k=>(
                <button key={k} onClick={()=>setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300"} btn`}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <GrowthChart series={multiSeries} range={chartRange} displayCcy={displayCcy} usdIdr={usdIdr} />
            <div className="mt-2 flex items-center gap-4">
              {/* show small per-category latest values under chart (no duplicate labels) */}
              <div className="text-xs text-gray-400">Values:</div>
              <div className="text-xs"><span style={{color:colors.all,fontWeight:700}}>●</span> All: <span className="font-semibold">{displayCcy==="IDR"?fmtMoney((multiSeries.all && multiSeries.all.length?multiSeries.all[multiSeries.all.length-1].v:0)*usdIdr,"IDR"):fmtMoney((multiSeries.all && multiSeries.all.length?multiSeries.all[multiSeries.all.length-1].v:0),"USD")}</span></div>
              <div className="text-xs"><span style={{color:colors.crypto,fontWeight:700}}>●</span> Crypto: <span className="font-semibold">{displayCcy==="IDR"?fmtMoney((multiSeries.crypto && multiSeries.crypto.length?multiSeries.crypto[multiSeries.crypto.length-1].v:0)*usdIdr,"IDR"):fmtMoney((multiSeries.crypto && multiSeries.crypto.length?multiSeries.crypto[multiSeries.crypto.length-1].v:0),"USD")}</span></div>
              <div className="text-xs"><span style={{color:colors.stock,fontWeight:700}}>●</span> Stocks: <span className="font-semibold">{displayCcy==="IDR"?fmtMoney((multiSeries.stock && multiSeries.stock.length?multiSeries.stock[multiSeries.stock.length-1].v:0)*usdIdr,"IDR"):fmtMoney((multiSeries.stock && multiSeries.stock.length?multiSeries.stock[multiSeries.stock.length-1].v:0),"USD")}</span></div>
              <div className="text-xs"><span style={{color:colors.nonliquid,fontWeight:700}}>●</span> Non-Liquid: <span className="font-semibold">{displayCcy==="IDR"?fmtMoney((multiSeries.nonliquid && multiSeries.nonliquid.length?multiSeries.nonliquid[multiSeries.nonliquid.length-1].v:0)*usdIdr,"IDR"):fmtMoney((multiSeries.nonliquid && multiSeries.nonliquid.length?multiSeries.nonliquid[multiSeries.nonliquid.length-1].v:0),"USD")}</span></div>
            </div>
          </div>
        </div>

        {/* CAKE allocation & legend */}
        {filteredRows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-44 h-44 flex items-center justify-center">
              <Cake data={cakeData} size={176} inner={48} gap={0.06} displayTotal={displayCcy==="IDR"?fmtMoney(totals.market*usdIdr,"IDR"):fmtMoney(totals.market,"USD")} displayCcy={displayCcy} usdIdr={usdIdr} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cakeData.map((d,i)=>{
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width:12, height:12, background: ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF"][i%6] }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{displayCcy==="IDR"?fmtMoney(d.value*usdIdr,"IDR"):fmtMoney(d.value,"USD")} • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trade modal */}
        {tradeModal.open && <TradeModal mode={tradeModal.mode} asset={assets.find(a=>a.id===tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={()=>closeTradeModal()} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />}

        {/* Asset Chart modal */}
        {assetChartOpen && <AssetChartModal asset={assetChartOpen} onClose={()=>setAssetChartOpen(null)} displayCcy={displayCcy} usdIdr={usdIdr} />}

        {/* Transactions modal */}
        {transactionsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[200]">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-3xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">Transactions</div>
                  <div className="text-xs text-gray-400">{transactions.length} records</div>
                </div>
                <div className="flex items-center gap-2">
                  {lastDeletedTx && <button onClick={()=>undoLastDeletedTransaction()} className="bg-amber-500 px-3 py-1 rounded text-sm btn">Undo Delete</button>}
                  <button onClick={()=>setTransactionsOpen(false)} className="bg-gray-800 px-3 py-1 rounded btn-soft">Close</button>
                </div>
              </div>

              {transactions.length === 0 ? (<div className="text-sm text-gray-500">No transactions yet.</div>) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="min-w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Asset</th>
                        <th className="text-right py-2 px-3">Qty</th>
                        <th className="text-right py-2 px-3">Proceeds / Cost</th>
                        <th className="text-right py-2 px-3">Realized</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx=>(
                        <tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                          <td className="px-3 py-3">{new Date(tx.date).toLocaleString()}</td>
                          <td className="px-3 py-3">{tx.symbol} <div className="text-xs text-gray-400">{tx.name}</div></td>
                          <td className="px-3 py-3 text-right">{Number(tx.qty).toLocaleString(undefined,{ maximumFractionDigits:8 })}</td>
                          <td className="px-3 py-3 text-right">{tx.type==="sell" ? (displayCcy==="IDR"?fmtMoney(tx.proceeds*usdIdr,"IDR"):fmtMoney(tx.proceeds,"USD")) : (displayCcy==="IDR"?fmtMoney(tx.cost*usdIdr,"IDR"):fmtMoney(tx.cost,"USD"))}<div className="text-xs">{tx.pricePerUnit?`${displayCcy==="IDR"?fmtMoney(tx.pricePerUnit*usdIdr,"IDR"):fmtMoney(tx.pricePerUnit,"USD")} / unit`:""}</div></td>
                          <td className="px-3 py-3 text-right">{tx.type==="sell" ? (displayCcy==="IDR"?fmtMoney(tx.realized*usdIdr,"IDR"):fmtMoney(tx.realized,"USD")) : "-"}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={()=>{ reverseTxEffects(tx); setTransactions(prev=>prev.filter(t=>t.id!==tx.id)); setLastDeletedTx(tx); }} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Restore</button>
                              <button onClick={()=>{ deleteTransaction(tx.id); }} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {lastDeletedTx && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-300">Last deleted: {lastDeletedTx.symbol} ({new Date(lastDeletedTx.date).toLocaleString()})</div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>undoLastDeletedTransaction()} className="bg-emerald-500 px-3 py-1 rounded text-sm btn">Undo</button>
                    <button onClick={()=>purgeLastDeletedTransaction()} className="bg-gray-700 px-3 py-1 rounded text-sm btn-soft">Forget</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXPORT / IMPORT */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (combined)</div>
            <div className="text-xs text-gray-500">Export contains ASSETS and TRANSACTIONS; ISO dates and markers help spreadsheet apps parse cleanly.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCombinedCSV} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-blue-600 hover:text-white">Export CSV</button>
            <label className="bg-white text-black px-3 py-2 rounded font-semibold cursor-pointer btn hover:bg-emerald-500 hover:text-white">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportChange} className="hidden" />
            </label>
            <button onClick={() => { if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return; setAssets([]); setRealizedUSD(0); setTransactions([]); setLastDeletedTx(null); }} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-red-600 hover:text-white">Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}