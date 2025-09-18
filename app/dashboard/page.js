// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Portfolio Dashboard — updated with new logic:
 * - Added Deposit functionality.
 * - Separated "Invested Capital" (from deposits) from "Trading Balance" (cash).
 * - Asset purchases now use the Trading Balance.
 * - Market Value KPI now shows percentage growth against Invested Capital.
 * - UI/UX improvements for the portfolio filter and donut chart legend.
 *
 * Keep everything in this single file as requested.
 */

/* ===================== CONFIG/ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const COINGECKO_PRICE = (ids) =>
  `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;

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

/* seeded RNG for synthetic growth chart noise */
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

/* ===================== DONUT ALLOCATION CHART ===================== */
function DonutAllocation({ data = [], size = 200, inner = 48, gap = 0.02, displayTotal, displayCcy = "USD", usdIdr = 16000 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const maxOuter = size / 2 - 6;

  const colors = [
    "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF9CEE",
    "#B28DFF", "#FFB26B", "#6BFFA0", "#FF6BE5", "#00C49F",
  ];

  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, html: "" });
  const wrapRef = useRef(null);

  const formatForDisplayCcy = (v) => {
    if (displayCcy === "IDR") return fmtMoney((v || 0) * usdIdr, "IDR");
    return fmtMoney(v || 0, "USD");
  };

  const onSliceEnter = (i, event, d) => {
    setHoverIndex(i);
    const rect = wrapRef.current?.getBoundingClientRect();
    const px = (event.clientX - (rect?.left || 0)) + 12;
    const py = (event.clientY - (rect?.top || 0)) - 12;
    setTooltip({ show: true, x: px, y: py, html: `${d.name} • ${formatForDisplayCcy(d.value)}` });
  };
  const onSliceMove = (event) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const px = (event.clientX - (rect?.left || 0)) + 12;
    setTooltip(t => ({ ...t, x: px }));
  };
  const onSliceLeave = () => {
    setHoverIndex(null);
    setTooltip({ show: false, x: 0, y: 0, html: "" });
  };

  let start = -Math.PI / 2;
  const arcs = data.map((d) => {
    const portion = Math.max(0, d.value || 0) / total;
    const angle = portion * Math.PI * 2;
    const end = start + angle;
    const arc = { start, end, outer: maxOuter };
    start = end;
    return arc;
  });

  function arcPath(cx, cy, rInner, rOuter, startAngle, endAngle) {
    const large = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(startAngle);
    const y1 = cy + rOuter * Math.sin(startAngle);
    const x2 = cx + rOuter * Math.cos(endAngle);
    const y2 = cy + rOuter * Math.sin(endAngle);
    const xi2 = cx + rInner * Math.cos(endAngle);
    const yi2 = cy + rInner * Math.sin(endAngle);
    const xi1 = cx + rInner * Math.cos(startAngle);
    const yi1 = cy + rInner * Math.sin(startAngle);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;
  }

  return (
    <div ref={wrapRef} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const arc = arcs[i];
          const gapAngle = Math.min(arc.end - arc.start, 0.02);
          const s = arc.start + gapAngle / 2;
          const e = arc.end - gapAngle / 2;
          const path = arcPath(cx, cy, inner, arc.outer, s, e);
          const isHover = hoverIndex === i;
          const mid = (s + e) / 2;
          const transform = isHover ? `translate(${Math.cos(mid) * 6},${Math.sin(mid) * 6})` : undefined;
          return (
            <g key={i} transform={transform}>
              <path
                d={path}
                fill={colors[i % colors.length]}
                stroke="#000"
                strokeWidth={isHover ? 1.8 : 0.6}
                style={{ transition: "transform 180ms, filter 160ms, stroke-width 160ms" }}
                onMouseEnter={(ev) => onSliceEnter(i, ev, d)}
                onMouseMove={(ev) => onSliceMove(ev)}
                onMouseLeave={onSliceLeave}
                className="slice"
              />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={inner - 4} fill="#070707" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="11" fontWeight={700} fill="#E5E7EB">
          {displayTotal}
        </text>
      </svg>
      <div style={{
        position: "absolute", left: tooltip.x, top: tooltip.y, transform: "translate(-6px,-100%)",
        padding: "8px 10px", background: "#111827", border: "1px solid rgba(255,255,255,0.06)",
        color: "#E5E7EB", borderRadius: 8, fontSize: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
        pointerEvents: "none", opacity: tooltip.show ? 1 : 0, transition: "opacity 140ms, transform 120ms",
        whiteSpace: "nowrap", zIndex: 40
      }}>
        {tooltip.html}
      </div>
    </div>
  );
}

/* ===================== CANDLE + MULTI-LINE CHART ===================== */
function CandlesWithLines({ seriesMap = {}, displayCcy = "USD", usdIdr = 16000, width = 960, height = 300, rangeKey = "all", onHover }) {
  const padding = { left: 56, right: 12, top: 12, bottom: 28 };
  const w = Math.min(width, 1200);
  const h = height;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;
  const conv = (v) => displayCcy === "IDR" ? v * usdIdr : v;
  const convAll = (seriesMap["all"] || []).map(p => ({ t: p.t, v: conv(p.v) }));
  const convKeys = ["crypto","stock","nonliquid"];
  const convCats = {};
  convKeys.forEach(k => convCats[k] = (seriesMap[k] || []).map(p => ({ t: p.t, v: conv(p.v) })));
  if (!convAll || convAll.length < 2) return <div className="text-xs text-gray-500">Not enough data for chart</div>;
  const timeframeMap = { "1d": 48, "2d": 96, "1w": 56, "1m": 90, "1y": 180, "all": Math.min(200, convAll.length) };
  const candleCountTarget = timeframeMap[rangeKey] || Math.min(200, convAll.length);
  const buckets = Array.from({ length: Math.max(4, candleCountTarget) }, () => []);
  for (let i = 0; i < convAll.length; i++) {
    const idx = Math.floor((i / convAll.length) * buckets.length);
    buckets[Math.min(buckets.length - 1, idx)].push(convAll[i]);
  }
  const candles = buckets.map(arr => {
    if (!arr || arr.length === 0) return null;
    const open = arr[0].v;
    const close = arr[arr.length - 1].v;
    let high = -Infinity, low = Infinity;
    arr.forEach(p => { if (p.v > high) high = p.v; if (p.v < low) low = p.v; });
    const t = arr[Math.floor(arr.length / 2)].t;
    return { t, open, high, low, close, count: arr.length };
  }).filter(Boolean);
  let min = Infinity, max = -Infinity;
  candles.forEach(c => { if (c.low < min) min = c.low; if (c.high > max) max = c.high; });
  convKeys.forEach(k => (convCats[k] || []).forEach(p => { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }));
  if (!isFinite(min) || !isFinite(max)) return <div className="text-xs text-gray-500">No chart data</div>;
  const range = Math.max(1e-8, max - min);
  const yOf = (v) => padding.top + (1 - (v - min) / range) * innerH;
  const xOfCandle = (i) => padding.left + (i + 0.5) * (innerW / candles.length);
  const colorFor = (k) => {
    if (k === "all") return "#4D96FF"; if (k === "crypto") return "#FF6B6B";
    if (k === "stock") return "#6BCB77"; if (k === "nonliquid") return "#FFD93D";
    return "#B28DFF";
  };
  const [hoverIndex, setHoverIndex] = useState(null);
  const rafRef = useRef(null); const lastXRef = useRef(null);
  function scheduleHover(x, rect) {
    lastXRef.current = { x, rect }; if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      const info = lastXRef.current; rafRef.current = null; if (!info) return;
      const px = info.x - (info.rect.left || 0);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const cx = xOfCandle(i); const d = Math.abs(cx - px);
        if (d < bestD) { bestD = d; best = i; }
      }
      setHoverIndex(best);
      if (onHover) { const c = candles[best]; onHover({ t: c.t, o: c.open, h: c.high, l: c.low, c: c.close }); }
    });
  }
  function handleMove(e) { const rect = e.currentTarget.getBoundingClientRect(); scheduleHover(e.clientX, rect); }
  function handleLeave() { setHoverIndex(null); if (onHover) onHover(null); }
  function seriesToLinePoints(catSeries) {
    if (!catSeries || catSeries.length === 0) return [];
    const pts = [];
    for (let i = 0; i < candles.length; i++) {
      const midT = candles[i].t;
      let nearest = catSeries[0]; let bestD = Math.abs(catSeries[0].t - midT);
      for (let j = 1; j < catSeries.length; j++) {
        const d = Math.abs(catSeries[j].t - midT);
        if (d < bestD) { bestD = d; nearest = catSeries[j]; }
      }
      const x = xOfCandle(i); const y = yOf(nearest.v);
      pts.push({ x, y, v: nearest.v, t: nearest.t });
    }
    return pts;
  }
  const overlayPts = {};
  convKeys.forEach(k => overlayPts[k] = seriesToLinePoints(convCats[k]));
  return (
    <div className="w-full overflow-hidden rounded" style={{ background: "transparent" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        {[0,1,2,3,4].map(i => { const v = min + (i/4) * (range); const y = yOf(v); return <line key={i} x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />; })}
        {candles.map((c, i) => {
          const cx = xOfCandle(i); const candleWidth = Math.max(4, (innerW / candles.length) * 0.6);
          const openY = yOf(c.open), closeY = yOf(c.close), highY = yOf(c.high), lowY = yOf(c.low);
          const isUp = c.close >= c.open; const color = isUp ? "#34D399" : "#F87171";
          const bodyTop = Math.min(openY, closeY); const bodyHeight = Math.max(1, Math.abs(closeY - openY));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.9} />
              <rect x={cx - candleWidth/2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} stroke="#000" strokeWidth={0.6} rx={1} />
              {hoverIndex === i && (<rect x={padding.left} y={padding.top} width={innerW} height={innerH} fill="rgba(255,255,255,0.02)" />)}
            </g>
          );
        })}
        {["crypto","stock","nonliquid"].map(k => {
          const pts = overlayPts[k] || []; if (!pts.length) return null;
          const path = pts.map((p, idx) => `${idx===0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
          return (
            <g key={k}>
              <path d={path} stroke={colorFor(k)} strokeWidth={k==="stock"?1.8:1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
              {pts.map((p, idx) => <circle key={idx} cx={p.x} cy={p.y} r={2} fill={colorFor(k)} stroke="#000" strokeWidth={0.4} />)}
            </g>
          );
        })}
        {[0,1,2,3,4].map(i => { const v = min + (i/4) * (range); const y = yOf(v); return <text key={i} x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{displayCcy === "IDR" ? fmtMoney(v, "IDR") : fmtMoney(v, "USD")}</text>; })}
        {hoverIndex !== null && candles[hoverIndex] && (<line x1={xOfCandle(hoverIndex)} x2={xOfCandle(hoverIndex)} y1={padding.top} y2={padding.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />)}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2"><div style={{ width: 10, height: 10, background: "#4D96FF" }} className="rounded-sm" /><div className="text-xs text-gray-300">All</div></div>
        <div className="flex items-center gap-2"><div style={{ width: 10, height: 10, background: "#FF6B6B" }} className="rounded-sm" /><div className="text-xs text-gray-300">Crypto</div></div>
        <div className="flex items-center gap-2"><div style={{ width: 10, height: 10, background: "#6BCB77" }} className="rounded-sm" /><div className="text-xs text-gray-300">Stocks</div></div>
        <div className="flex items-center gap-2"><div style={{ width: 10, height: 10, background: "#FFD93D" }} className="rounded-sm" /><div className="text-xs text-gray-300">Non-Liquid</div></div>
      </div>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr, tradingBalanceUSD }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");
  useEffect(() => { setPrice(defaultPrice > 0 ? String(defaultPrice) : ""); }, [defaultPrice]);
  if (!asset) return null;
  const priceUSD = priceCcy === "IDR" ? toNum(price) / usdIdr : toNum(price);
  const totalUSD = toNum(qty) * priceUSD;
  function handleSubmit(e) {
    e.preventDefault();
    const q = toNum(qty), p = priceUSD;
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    if (mode === 'buy') {
        if (totalUSD > tradingBalanceUSD) {
            alert("Trading balance not sufficient.");
            return;
        }
        onBuy(q, p);
    }
    if (mode === 'sell') onSell(q, p);
  }
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div><h2 className="text-xl font-semibold capitalize">{mode} {asset.symbol}</h2><p className="text-sm text-gray-400">{asset.name}</p></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-blue-500" placeholder="0.00" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700 focus:outline-none focus:border-blue-500" placeholder="0.00" />
              <select value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)} className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r focus:outline-none"><option value="USD">USD</option><option value="IDR">IDR</option></select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right mb-4">Total: {fmtMoney(totalUSD, "USD")}</div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode === 'buy' ? 'bg-emerald-500 text-black' : 'bg-yellow-600 text-white'}`}>{mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}</button>
        </form>
      </div>
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- persistent state ---------- */
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v3") || "[]").map(ensureNumericAsset) : []);
  const [realizedUSD, setRealizedUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_realized_v3") || 0) : 0);
  const [investedCapitalUSD, setInvestedCapitalUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_invested_capital_v3") || 0) : 0);
  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_trading_balance_v3") || 0) : 0);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_transactions_v3") || "[]") : []);
  const [displayCcy, setDisplayCcy] = useState(() => isBrowser ? (localStorage.getItem("pf_display_ccy_v3") || "USD") : "USD");

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- add/search state ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("deposit");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositCcy, setDepositCcy] = useState("USD");

  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* ---------- live quotes, filter, sort, modals, etc. ---------- */
  const [lastTick, setLastTick] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });
  const [chartRange, setChartRange] = useState("all");
  const [chartHover, setChartHover] = useState(null);
  const [sortBy, setSortBy] = useState("market_desc");

  /* ---------- refs ---------- */
  const filterMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  const currencyMenuRef = useRef(null);

  /* ---------- persist to localStorage ---------- */
  useEffect(() => { localStorage.setItem("pf_assets_v3", JSON.stringify(assets.map(ensureNumericAsset))); }, [assets]);
  useEffect(() => { localStorage.setItem("pf_realized_v3", String(realizedUSD)); }, [realizedUSD]);
  useEffect(() => { localStorage.setItem("pf_invested_capital_v3", String(investedCapitalUSD)); }, [investedCapitalUSD]);
  useEffect(() => { localStorage.setItem("pf_trading_balance_v3", String(tradingBalanceUSD)); }, [tradingBalanceUSD]);
  useEffect(() => { localStorage.setItem("pf_display_ccy_v3", displayCcy); }, [displayCcy]);
  useEffect(() => { localStorage.setItem("pf_transactions_v3", JSON.stringify(transactions || [])); }, [transactions]);

  /* click outside (close menus) */
  useEffect(() => {
    function onPointerDown(e) {
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(e.target) && !e.target.closest('[aria-label="Filter Portfolio"]')) setFilterMenuOpen(false);
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(e.target) && !e.target.closest('[aria-label="Sort"]')) setSortMenuOpen(false);
      if (suggestions.length > 0 && suggestionsRef.current && !suggestionsRef.current.contains(e.target) && !addPanelRef.current?.contains(e.target)) setSuggestions([]);
      if (openAdd && addPanelRef.current && !addPanelRef.current.contains(e.target) && !e.target.closest('[aria-label="Add asset"]')) setOpenAdd(false);
      if (currencyMenuOpen && currencyMenuRef.current && !currencyMenuRef.current.contains(e.target) && !e.target.closest('[aria-label="Currency"]')) setCurrencyMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen, sortMenuOpen, suggestions, openAdd, currencyMenuOpen]);

  /* search */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "nonliquid") { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`); if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map((c) => ({ id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name, source: "coingecko", type: "crypto" })));
          return;
        }
        let payload = null;
        try { const res = await fetch(YAHOO_SEARCH(q)); if (res.ok) payload = await res.json(); } catch (e) {}
        if (!payload) { setSuggestions([]); return; }
        const rawList = payload.quotes || [];
        const list = rawList.slice(0, 120).map((it) => ({
            symbol: (it.symbol || "").toString().toUpperCase(), display: it.shortname || it.longname || it.name || it.symbol,
            exchange: it.exchange || "", currency: it.currency || "", source: "yahoo", type: "stock",
        }));
        if (searchMode === "id") setSuggestions(list.filter((x) => (x.symbol || "").toUpperCase().includes(".JK") || String(x.exchange || "").toUpperCase().includes("JAKARTA")).slice(0, 30));
        else setSuggestions(list.filter((x) => !(x.symbol || "").toUpperCase().endsWith(".JK")).slice(0, 30));
      } catch (e) { console.warn("search err", e); setSuggestions([]); }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* polling data */
  const assetsRef = useRef(assets); const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  useEffect(() => {
    let mounted = true;
    async function pollData() {
        if (!mounted) return;
        const cgIds = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        const stockSymbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol)));
        
        let prices = {};
        if (cgIds.length > 0) {
            try {
                const res = await fetch(COINGECKO_PRICE(cgIds.join(",")));
                if (res.ok) {
                    const j = await res.json();
                    Object.keys(j).forEach(id => {
                        if (j[id] && typeof j[id].usd === 'number') prices[id] = j[id].usd;
                    });
                }
            } catch(e) {}
        }

        if (stockSymbols.length > 0) {
            try {
                const res = await fetch(YAHOO_QUOTE(stockSymbols.join(",")));
                if (res.ok) {
                    const j = await res.json();
                    if (j?.quoteResponse?.result) {
                        j.quoteResponse.result.forEach(q => {
                            const price = toNum(q?.regularMarketPrice);
                            if (price > 0 && q.symbol) {
                                let priceUSD = price;
                                if (q.currency === 'IDR') priceUSD = price / (usdIdrRef.current || 1);
                                prices[q.symbol] = priceUSD;
                            }
                        });
                    }
                }
            } catch(e) {}
        }
        
        if (Object.keys(prices).length > 0 && mounted) {
            setAssets(prev => prev.map(a => {
                const priceKey = a.type === 'crypto' ? a.coingeckoId : a.symbol;
                if (prices[priceKey]) {
                    const last = toNum(prices[priceKey]);
                    return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
                }
                return ensureNumericAsset(a);
            }));
            setLastTick(Date.now());
        }
        if (isInitialLoading && mounted) setIsInitialLoading(false);
    }
    pollData();
    const id = setInterval(pollData, 60000); // Poll every minute
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(COINGECKO_USD_IDR); if (!mounted || !res.ok) return;
        const j = await res.json(); const raw = j?.tether?.idr; const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
      } catch (e) {} finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, targetTime = Date.now()) {
    const years = Math.max(0, (targetTime - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
    return avgPriceUSD * Math.pow(1 + (toNum(yoyPercent) / 100), years);
  }

  /* transaction effects */
  function applyTransactionEffects(tx) {
    if (!tx) return;
    if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) {
          const oldShares = toNum(a.shares || 0);
          const newShares = Math.max(0, oldShares - tx.qty);
          const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.costOfSold);
          const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg });
        }
        return a;
      }));
      setRealizedUSD(prev => prev + toNum(tx.realized || 0));
      setTradingBalanceUSD(prev => prev + toNum(tx.proceeds || 0));
    } else if (tx.type === "buy") {
      setAssets(prev => {
          const existing = prev.find(a => a.id === tx.assetId);
          if (existing) {
              return prev.map(a => {
                  if (a.id === tx.assetId) {
                      const oldShares = toNum(a.shares || 0); const oldInvested = toNum(a.investedUSD || 0);
                      const newShares = oldShares + tx.qty; const newInvested = oldInvested + tx.cost;
                      const newAvg = newShares > 0 ? newInvested / newShares : 0;
                      return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg });
                  }
                  return a;
              });
          }
          const avg = tx.cost / (tx.qty || 1);
          const newAsset = ensureNumericAsset({
            id: tx.assetId, type: tx.assetType, coingeckoId: tx.coingeckoId, symbol: tx.symbol, name: tx.name,
            shares: tx.qty, avgPrice: avg, investedUSD: tx.cost, lastPriceUSD: tx.pricePerUnit || avg,
            createdAt: Date.now(), purchaseDate: Date.now()
          });
          return [...prev, newAsset];
      });
      setTradingBalanceUSD(prev => prev - toNum(tx.cost || 0));
    } else if (tx.type === "deposit") {
        setInvestedCapitalUSD(prev => prev + toNum(tx.cost || 0));
        setTradingBalanceUSD(prev => prev + toNum(tx.cost || 0));
    }
  }

  function reverseTransactionEffects(tx) {
    if (!tx) return;
    if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) {
          const oldShares = toNum(a.shares || 0);
          const newShares = oldShares + tx.qty;
          const newInvested = toNum(a.investedUSD || 0) + tx.costOfSold;
          const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg });
        }
        return a;
      }));
      setRealizedUSD(prev => prev - toNum(tx.realized || 0));
      setTradingBalanceUSD(prev => prev - toNum(tx.proceeds || 0));
    } else if (tx.type === "buy") {
      setAssets(prev => prev.flatMap(a => {
        if (a.id === tx.assetId) {
          const oldShares = toNum(a.shares || 0);
          const newShares = Math.max(0, oldShares - tx.qty);
          if (newShares <= 1e-9) return []; // Remove asset if shares are virtually zero
          const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.cost);
          const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
          return [ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg })];
        }
        return [a];
      }));
      setTradingBalanceUSD(prev => prev + toNum(tx.cost || 0));
    } else if (tx.type === "deposit") {
        setInvestedCapitalUSD(prev => prev - toNum(tx.cost || 0));
        setTradingBalanceUSD(prev => prev - toNum(tx.cost || 0));
    }
  }

  /* main actions */
  function handleDeposit() {
    const amount = toNum(depositAmount);
    if (amount <= 0) { alert("Deposit amount must be > 0"); return; }
    const amountUSD = depositCcy === "IDR" ? amount / usdIdr : amount;
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, type: 'deposit',
      symbol: depositCcy, qty: amount, cost: amountUSD, date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev]);
    applyTransactionEffects(tx);
    setDepositAmount("");
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim(); if (!typed) { alert("Select suggestion or type symbol"); return; }
      picked = searchMode === "crypto" 
        ? { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed }
        : { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
    }
    const qty = toNum(initQty), priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const priceInUSD = initPriceCcy === "IDR" ? priceInput / usdIdr : priceInput;
    const cost = qty * priceInUSD;
    if (cost > tradingBalanceUSD) { alert("Trading balance not sufficient."); return; }
    
    const internalId = `${picked.source || picked.type}:${picked.symbol || picked.id}`;
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, assetId: internalId,
      assetType: picked.source === "coingecko" ? "crypto" : "stock", coingeckoId: picked.id,
      symbol: picked.symbol || picked.id, name: picked.display, type: "buy",
      qty, pricePerUnit: priceInUSD, cost, date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev]);
    applyTransactionEffects(tx);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  function addNonLiquidAsset() {
    const name = nlName.trim(), qty = toNum(nlQty), priceInput = toNum(nlPrice);
    if (!name || qty <= 0 || priceInput <= 0) { alert("Name, Qty & price must be valid"); return; }
    const priceUSD = nlPriceCcy === "IDR" ? priceInput / usdIdr : priceInput;
    const cost = qty * priceUSD;
    if (cost > tradingBalanceUSD) { alert("Trading balance not sufficient."); return; }
    
    const id = `nonliquid:${name.replace(/\s+/g, "_")}`;
    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    const asset = ensureNumericAsset({
      id, type: "nonliquid", symbol: (name.length > 12 ? name.slice(0, 12) + "…" : name).toUpperCase(), name,
      shares: qty, avgPrice: priceUSD, investedUSD: cost, purchaseDate: purchaseDateMs, nonLiquidYoy: toNum(nlYoy), description: nlDesc || "",
    });

    const tx = {
      id: `tx:${Date.now()}`, assetId: id, assetType: 'nonliquid', symbol: asset.symbol, name: asset.name,
      type: 'buy', qty, pricePerUnit: priceUSD, cost, date: Date.now(),
    };

    setTradingBalanceUSD(prev => prev - cost);
    setAssets(prev => [...prev, asset]);
    setTransactions(prev => [tx, ...prev]);

    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc("");
    setOpenAdd(false);
  }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const asset = assets.find(a => a.id === id); if (!asset) return;
    const cost = qty * pricePerUnit;
    const tx = {
      id: `tx:${Date.now()}`, assetId: id, assetType: asset.type, symbol: asset.symbol, name: asset.name,
      type: "buy", qty, pricePerUnit, cost, date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev]);
    applyTransactionEffects(tx);
    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const a = assets.find(x => x.id === id); if (!a) return;
    const oldShares = toNum(a.shares || 0); if (qty > oldShares) { alert("Cannot sell more than you own"); return; }
    const avg = toNum(a.avgPrice || 0); const proceeds = qty * pricePerUnit;
    const costOfSold = qty * avg; const realized = proceeds - costOfSold;
    const tx = {
      id: `tx:${Date.now()}`, assetId: a.id, assetType: a.type, symbol: a.symbol, name: a.name, type: "sell",
      qty, pricePerUnit, proceeds, costOfSold, realized, date: Date.now(),
    };
    applyTransactionEffects(tx);
    setTransactions(prev => [tx, ...prev]);
    closeTradeModal();
  }
  
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx || !confirm(`Delete & reverse this transaction?`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }

  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTransactionEffects(lastDeletedTx);
    setTransactions(prev => [lastDeletedTx, ...prev]);
    setLastDeletedTx(null);
  }

  /* computed values */
  const rows = useMemo(() => assets.map(a => {
    let aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
      aa = {...aa, lastPriceUSD: last, marketValueUSD: last * aa.shares};
    }
    const market = aa.marketValueUSD; const invested = aa.investedUSD;
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, pnlUSD: pnl, pnlPct };
  }), [assets, lastTick]);

  const filteredRows = useMemo(() => {
    if (portfolioFilter === "all") return rows;
    return rows.filter(r => r.type === portfolioFilter);
  }, [rows, portfolioFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    switch (sortBy) {
      case "market_desc": copy.sort((a,b) => b.marketValueUSD - a.marketValueUSD); break;
      case "invested_desc": copy.sort((a,b) => b.investedUSD - a.investedUSD); break;
      case "pnl_desc": copy.sort((a,b) => (b.pnlUSD || 0) - (a.pnlUSD || 0)); break;
      case "symbol_asc": copy.sort((a,b) => (a.symbol||"").localeCompare(b.symbol||"")); break;
      case "oldest": copy.sort((a,b) => (a.createdAt||0) - (b.createdAt||0)); break;
      case "newest": copy.sort((a,b) => (b.createdAt||0) - (a.createdAt||0)); break;
      default: break;
    }
    return copy;
  }, [filteredRows, sortBy]);

  const totals = useMemo(() => {
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    return { market };
  }, [filteredRows]);
  
  const marketGrowthPct = investedCapitalUSD > 0 ? ((totals.market - investedCapitalUSD) / investedCapitalUSD) * 100 : 0;
  
  const donutData = useMemo(() => {
    const sorted = filteredRows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0, 6);
    const other = sorted.slice(6);
    const otherTotal = other.reduce((s, r) => s + r.marketValueUSD, 0);
    const data = top.map(r => ({ name: r.symbol, value: r.marketValueUSD }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: other.map(r=>r.symbol) });
    return data;
  }, [filteredRows]);

  /* other helpers */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId); if (!asset) return;
    setTradeModal({ open: true, mode, assetId, defaultPrice: asset.lastPriceUSD || asset.avgPrice || 0 });
  }
  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null }); }
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (a.shares > 1e-9) { alert("Cannot delete asset with a balance. Please sell all shares first."); return; }
    if (!confirm(`Delete ${a.symbol} from portfolio? This cannot be undone.`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  const titleForFilter = { all: "All Portfolio", crypto: "Crypto Portfolio", stock: "Stocks Portfolio", nonliquid: "Non-Liquid Portfolio" };

  return (
    <div className="min-h-screen bg-black text-gray-200 p-4 sm:p-6">
      <style>{`
        .btn { transition: transform 180ms, box-shadow 180ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); }
        .menu-scroll { max-height: 16rem; overflow:auto; overscroll-behavior: contain; scrollbar-width: thin; }
      `}</style>
      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative">
            <div aria-label="Filter Portfolio" onClick={() => setFilterMenuOpen(v => !v)} className="flex items-center gap-2 cursor-pointer">
                <h1 className="text-2xl font-semibold">{titleForFilter[portfolioFilter]}</h1>
                <svg width="14" height="14" viewBox="0 0 24 24" className="mt-1" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            {filterMenuOpen && (
              <div ref={filterMenuRef} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44 menu-scroll">
                <button onClick={() => { setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                <button onClick={() => { setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                <button onClick={() => { setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                <button onClick={() => { setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button aria-label="Currency" onClick={() => setCurrencyMenuOpen(v => !v)} className="inline-flex items-center gap-2" style={{ background: "transparent", border: 0, padding: "6px 8px" }} title="Currency">
                <span style={{ whiteSpace: "nowrap", fontSize: 20, fontWeight: 700 }}>
                  {displayCcy === "IDR" ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(totals.market * usdIdr)} IDR` : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(totals.market)} USD`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" className="ml-1" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {currencyMenuOpen && (<div ref={currencyMenuRef} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-36"><button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">USD</button><button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">IDR</button></div>)}
            </div>
            <button aria-label="Add asset" onClick={() => setOpenAdd(v => !v)} className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black text-xl font-bold btn`} title="Add asset">
              <span style={{ transition: "transform 220ms" }} className={openAdd ? "rotate-open" : ""}>+</span>
            </button>
          </div>
        </div>

        {/* SUBHEADER & KPIs */}
        <div className="mt-2 text-xs text-gray-400">
          {isInitialLoading && assets.length > 0 ? (<span>Loading portfolio data...</span>) : (lastTick && <span>Updated: {new Date(lastTick).toLocaleString()}</span>)}
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-gray-400">Market Value</div><div className={`font-semibold text-lg ${marketGrowthPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")} <span className="text-sm">({marketGrowthPct.toFixed(2)}%)</span></div></div>
            <div><div className="text-gray-400">Invested Capital</div><div className="font-medium text-lg">{displayCcy === "IDR" ? fmtMoney(investedCapitalUSD * usdIdr, "IDR") : fmtMoney(investedCapitalUSD, "USD")}</div></div>
            <div><div className="text-gray-400">Trading Balance</div><div className="font-medium text-lg">{displayCcy === "IDR" ? fmtMoney(tradingBalanceUSD * usdIdr, "IDR") : fmtMoney(tradingBalanceUSD, "USD")}</div></div>
            <div onClick={() => setTransactionsOpen(true)} className="cursor-pointer"><div className="text-gray-400">Realized P&L</div><div className={`font-semibold text-lg ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}</div></div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
            <div className="flex items-center gap-1 mb-3 border-b border-gray-800">
                {['deposit', 'crypto', 'id', 'us', 'nonliquid'].map(mode => (
                    <button key={mode} onClick={() => setSearchMode(mode)} className={`px-3 py-2 text-sm capitalize rounded-t-md ${searchMode === mode ? "bg-gray-800" : "hover:bg-gray-800/50"}`}>{mode === 'id' ? 'Stocks ID' : mode === 'us' ? 'Stocks US' : mode}</button>
                ))}
            </div>
            {searchMode === "deposit" && (
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                    <div className="flex-1">
                        <label className="text-xs text-gray-400">Amount</label>
                        <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} type="number" placeholder="0.00" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400">Currency</label>
                        <select value={depositCcy} onChange={e => setDepositCcy(e.target.value)} className="w-full rounded-md bg-gray-800 px-2 py-2 text-sm border border-gray-700 h-[42px]">
                            <option value="USD">USD</option><option value="IDR">IDR</option>
                        </select>
                    </div>
                    <button onClick={handleDeposit} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md font-semibold btn h-[42px]">Add Deposit</button>
                    <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded-md btn-soft h-[42px]">Close</button>
                </div>
            )}
            { (searchMode === "crypto" || searchMode === "id" || searchMode === "us") && (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto..." : "Search stocks..."} className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                  {suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">{suggestions.map((s, i) => (<button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between"><div><div className="font-medium text-gray-100">{s.symbol} • {s.display}</div><div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange || ''}`}</div></div></button>))}</div>)}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-24" />
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-24" />
                <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-800 px-2 py-2 text-sm border border-gray-700"><option value="USD">USD</option><option value="IDR">IDR</option></select>
                <div className="flex items-center gap-2">
                  <button onClick={addAssetWithInitial} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Asset</button>
                  <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button>
                </div>
              </div>
            )}
            {searchMode === "nonliquid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400">Name</label><input value={nlName} onChange={(e) => setNlName(e.target.value)} placeholder="e.g. Land, Art, Rolex" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div><label className="text-xs text-gray-400">Quantity</label><input value={nlQty} onChange={(e) => setNlQty(e.target.value)} placeholder="1" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div><label className="text-xs text-gray-400">Price (per unit)</label><input value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div><label className="text-xs text-gray-400">Currency</label><select value={nlPriceCcy} onChange={(e) => setNlPriceCcy(e.target.value)} className="w-full rounded-md bg-gray-800 px-2 py-2 text-sm border border-gray-700"><option value="USD">USD</option><option value="IDR">IDR</option></select></div>
                    <div><label className="text-xs text-gray-400">Purchase date</label><input type="date" value={nlPurchaseDate} onChange={(e) => setNlPurchaseDate(e.target.value)} className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div><label className="text-xs text-gray-400">YoY gain (%)</label><input value={nlYoy} onChange={(e) => setNlYoy(e.target.value)} placeholder="5" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div className="sm:col-span-2"><label className="text-xs text-gray-400">Description</label><input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} placeholder="Optional" className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700" /></div>
                    <div className="sm:col-span-2 flex gap-2"><button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Non-Liquid</button><button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button></div>
                </div>
            )}
          </div>
        )}
        
        {/* ASSET TABLE */}
        <div className="mt-6" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Assets</div>
            <div className="flex items-center gap-2 relative">
              <button aria-label="Sort" onClick={() => setSortMenuOpen(v => !v)} className="inline-flex items-center justify-center rounded px-2 py-1 bg-gray-900 border border-gray-800 text-gray-200 btn" title="Sort assets"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6h12" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" /><path d="M9 12h6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" /><path d="M11 18h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
              {sortMenuOpen && (<div ref={sortMenuRef} className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-56 z-40 menu-scroll"><button onClick={() => { setSortBy("market_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">Value (high → low)</button><button onClick={() => { setSortBy("pnl_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">P&L (high → low)</button><button onClick={() => { setSortBy("symbol_asc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">A → Z</button><button onClick={() => { setSortBy("newest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700">Newest</button></div>)}
            </div>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800"><tr><th className="text-left py-2 px-3">Asset</th><th className="text-right py-2 px-3">Qty</th><th className="text-right py-2 px-3">Avg price</th><th className="text-right py-2 px-3">Market value</th><th className="text-right py-2 px-3">P&L</th><th className="py-2 px-3"></th></tr></thead>
            <tbody>
              {sortedRows.length === 0 ? (<tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets. Deposit funds and add an asset to begin.</td></tr>) : sortedRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3"><div className="font-semibold text-gray-100">{r.symbol}</div><div className="text-xs text-gray-400">{r.name}</div></td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums"><div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div></td>
                  <td className="px-3 py-3 text-right tabular-nums"><div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div><div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? (displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")) : "-"}</div></td>
                  <td className="px-3 py-3 text-right"><div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div><div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div></td>
                  <td className="px-3 py-3 text-right"><div className="flex items-center justify-end gap-2"><button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button><button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button><button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* DONUT ALLOCATION & PORTFOLIO GROWTH */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
                <div className="text-sm font-semibold mb-3">Asset Allocation</div>
                {filteredRows.length > 0 ? (
                    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
                        <div className="flex-shrink-0"><DonutAllocation data={donutData} size={160} inner={48} gap={0.06} displayTotal={displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")} displayCcy={displayCcy} usdIdr={usdIdr} /></div>
                        <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-2">
                            {donutData.map((d, i) => {
                                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                                return (<div key={d.name} className="flex items-center gap-2"><div style={{ width: 10, height: 10, background: colorForIndex(i) }} className="rounded-full flex-shrink-0" /><div><div className="font-semibold text-gray-100 text-xs">{d.name}</div><div className="text-xs text-gray-400">{pct.toFixed(1)}%</div></div></div>);
                            })}
                        </div>
                    </div>
                ) : <div className="text-xs text-gray-500">No assets to show.</div>}
            </div>
            <div className="lg:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold">Portfolio Growth</div>
                    <div className="flex items-center gap-1 sm:gap-2">
                        {["1d","1w","1m","1y","all"].map(k => (<button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700 text-white" : "bg-gray-800 text-gray-300"} btn`}>{k}</button>))}
                    </div>
                </div>
                <CandlesWithLines seriesMap={useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange])} displayCcy={displayCcy} usdIdr={usdIdr} width={900} height={280} rangeKey={chartRange} onHover={setChartHover} />
            </div>
        </div>

        {/* MODALS & CSV */}
        {tradeModal.open && <TradeModal mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={closeTradeModal} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} tradingBalanceUSD={tradingBalanceUSD} />}
        {transactionsOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120]">
                <div className="bg-gray-900 p-4 sm:p-6 rounded-lg w-full max-w-4xl border border-gray-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-lg font-semibold">Transactions</div>
                        <div className="flex items-center gap-2">
                            {lastDeletedTx && (<button onClick={undoLastDeletedTransaction} className="bg-amber-500 px-3 py-1 rounded text-sm btn">Undo Delete</button>)}
                            <button onClick={() => { setTransactionsOpen(false); }} className="bg-gray-800 px-3 py-1 rounded btn-soft">Close</button>
                        </div>
                    </div>
                    {transactions.length === 0 ? (<div className="text-sm text-gray-500">No transactions yet.</div>) : (
                        <div className="overflow-auto max-h-96">
                            <table className="min-w-full text-sm">
                                <thead className="text-gray-400 border-b border-gray-800"><tr><th className="text-left py-2 px-3">Date</th><th className="text-left py-2 px-3">Type</th><th className="text-left py-2 px-3">Asset</th><th className="text-right py-2 px-3">Qty</th><th className="text-right py-2 px-3">Value</th><th className="py-2 px-3"></th></tr></thead>
                                <tbody>{transactions.map(tx => (<tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                                    <td className="px-3 py-3 text-xs">{new Date(tx.date).toLocaleString()}</td>
                                    <td className="px-3 py-3 capitalize">{tx.type}</td>
                                    <td className="px-3 py-3">{tx.symbol}</td>
                                    <td className="px-3 py-3 text-right">{Number(tx.qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                                    <td className="px-3 py-3 text-right">{fmtMoney(tx.type === 'sell' ? tx.proceeds : tx.cost, "USD")}</td>
                                    <td className="px-3 py-3 text-right"><button onClick={() => deleteTransaction(tx.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button></td>
                                </tr>))}</tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        )}
        <div className="mt-8 p-4 rounded bg-gray-900/50 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
                <div className="text-sm text-gray-300">Data Management</div>
                <div className="text-xs text-gray-500">Export or clear all your portfolio data.</div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => { if(!confirm("Clear all data?")) return; setAssets([]); setRealizedUSD(0); setTransactions([]); setLastDeletedTx(null); setInvestedCapitalUSD(0); setTradingBalanceUSD(0); }} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-red-600 hover:text-white">Clear All</button>
            </div>
        </div>

      </div>
    </div>
  );
}

// NOTE: This is a simplified series builder for demonstration.
// A real-world implementation would fetch historical price data.
function buildMultiCategorySeries(rowsForChart, txs, rangeKey) {
    const now = Date.now();
    let earliest = now;
    txs.forEach(t => { if (t.date && t.date < earliest) earliest = t.date; });
    rowsForChart.forEach(r => { if (r.purchaseDate && r.purchaseDate < earliest) earliest = r.purchaseDate; });
    const rangeMap = { "1d": 1, "1w": 7, "1m": 30, "1y": 365, "all": (now - earliest) / (24*3600*1000) };
    const days = rangeMap[rangeKey] || 365;
    const start = now - days * 24 * 3600 * 1000;
    const points = 120;
    
    const allTxs = txs.slice().sort((a,b) => (a.date||0) - (b.date||0));

    function sharesUpTo(assetId, t) {
      let s = 0;
      for (const tx of allTxs) {
        if (tx.assetId !== assetId) continue;
        if ((tx.date || 0) <= t) {
          if (tx.type === "buy") s += toNum(tx.qty || 0);
          else if (tx.type === "sell") s -= toNum(tx.qty || 0);
        }
      }
      return s;
    }

    function priceAtTime(asset, t) {
      if (asset.type === "nonliquid") {
        return (new Function('avg', 'pDate', 'yoy', 't', 'toNum', `const years = Math.max(0, (t - (pDate || Date.now())) / (365.25 * 24 * 3600 * 1000)); return avg * Math.pow(1 + (toNum(yoy) / 100), years);`))(asset.avgPrice, asset.purchaseDate, asset.nonLiquidYoy, t, toNum);
      }
      const pd = asset.purchaseDate || asset.createdAt || now;
      const avg = asset.avgPrice || 0; const last = asset.lastPriceUSD || avg;
      if (t <= pd) return avg; if (t >= now) return last;
      const frac = (t - pd) / Math.max(1, (now - pd));
      return avg + (last - avg) * frac; // Simplified linear interpolation
    }

    const seriesPerKey = { all: [], crypto: [], stock: [], nonliquid: [] };
    for (let i = 0; i < points; i++) {
      const t = start + (i / (points - 1)) * (now - start);
      let totals = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
      rowsForChart.forEach(asset => {
        const s = sharesUpTo(asset.id, t);
        if (s <= 0) return;
        const price = priceAtTime(asset, t);
        const val = s * price;
        totals.all += val;
        if (asset.type === "crypto") totals.crypto += val;
        else if (asset.type === "stock") totals.stock += val;
        else if (asset.type === "nonliquid") totals.nonliquid += val;
      });
      Object.keys(totals).forEach(k => seriesPerKey[k].push({ t, v: totals[k] }));
    }
    return seriesPerKey;
  }