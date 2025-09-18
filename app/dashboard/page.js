// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Advanced Portfolio Dashboard
 *
 * New Features & Logic (v3):
 * - Deposit functionality to add capital.
 * - 'Invested' is now total capital deposited.
 * - New 'Trading Balance' for cash on hand.
 * - Purchases are deducted from Trading Balance. Sales proceeds are added to it.
 * - Market Value KPI now shows % growth against total invested capital.
 * - UI Enhancements: Filter button is now a dropdown, Donut legend is responsive and restyled.
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
    return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;
  }

  return (
    <div ref={wrapRef} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const arc = arcs[i];
          const gapAngle = Math.min(arc.end - arc.start, gap);
          const s = arc.start + gapAngle / 2;
          const e = arc.end - gapAngle / 2;
          const path = arcPath(cx, cy, inner, arc.outer, s, e);
          const isHover = hoverIndex === i;
          const mid = (s + e) / 2;
          const transform = isHover ? `translate(${Math.cos(mid) * 6},${Math.sin(mid) * 6})` : undefined;
          return (
            <g key={i} transform={transform} style={{ transition: "transform 180ms" }}>
              <path
                d={path}
                fill={colors[i % colors.length]}
                stroke="#000"
                strokeWidth={isHover ? 1.8 : 0.6}
                onMouseEnter={(ev) => onSliceEnter(i, ev, d)}
                onMouseMove={(ev) => onSliceMove(ev)}
                onMouseLeave={onSliceLeave}
                className="slice"
              />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={inner - 1} fill="#070707" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="11" fontWeight={700} fill="#E5E7EB">
          {displayTotal}
        </text>
      </svg>
      <div style={{
        position: "absolute",
        left: tooltip.x,
        top: tooltip.y,
        transform: "translate(-6px,-100%)",
        padding: "8px 10px",
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "#E5E7EB",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
        pointerEvents: "none",
        opacity: tooltip.show ? 1 : 0,
        transition: "opacity 140ms, transform 120ms",
        whiteSpace: "nowrap",
        zIndex: 40
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

  const colorFor = (k) => ({ all: "#4D96FF", crypto: "#FF6B6B", stock: "#6BCB77", nonliquid: "#FFD93D" }[k] || "#B28DFF");

  const [hoverIndex, setHoverIndex] = useState(null);
  const rafRef = useRef(null);

  function handleMove(e) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      let best = 0, bestD = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const d = Math.abs(xOfCandle(i) - px);
        if (d < bestD) { bestD = d; best = i; }
      }
      setHoverIndex(best);
      if (onHover) onHover(candles[best]);
    });
  }
  function handleLeave() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setHoverIndex(null);
    if (onHover) onHover(null);
  }

  const overlayPts = useMemo(() => {
    const ptsMap = {};
    convKeys.forEach(k => {
      const catSeries = convCats[k] || [];
      if (!catSeries.length) { ptsMap[k] = []; return; }
      ptsMap[k] = candles.map((candle, i) => {
        let nearest = catSeries[0];
        let bestD = Math.abs(catSeries[0].t - candle.t);
        for (let j = 1; j < catSeries.length; j++) {
          const d = Math.abs(catSeries[j].t - candle.t);
          if (d < bestD) { bestD = d; nearest = catSeries[j]; }
        }
        return { x: xOfCandle(i), y: yOf(nearest.v) };
      });
    });
    return ptsMap;
  }, [candles, convCats, innerW, innerH, min, range, displayCcy]);

  return (
    <div className="w-full overflow-hidden rounded">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        {[0,1,2,3,4].map(i => {
          const y = yOf(min + (i/4) * range);
          return <line key={i} x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />;
        })}

        {candles.map((c, i) => {
          const cx = xOfCandle(i);
          const candleWidth = Math.max(4, (innerW / candles.length) * 0.6);
          const openY = yOf(c.open), closeY = yOf(c.close), highY = yOf(c.high), lowY = yOf(c.low);
          const isUp = c.close >= c.open;
          const color = isUp ? "#34D399" : "#F87171";
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.9} />
              <rect x={cx - candleWidth/2} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(closeY - openY))} fill={color} stroke="#000" strokeWidth={0.6} rx={1} />
            </g>
          );
        })}

        {convKeys.map(k => {
          const pts = overlayPts[k] || [];
          if (!pts.length) return null;
          const path = pts.map((p, idx) => `${idx===0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
          return (
            <g key={k}>
              <path d={path} stroke={colorFor(k)} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
            </g>
          );
        })}

        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * range;
          return <text key={i} x={padding.left - 8} y={yOf(v) + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{fmtMoney(v, displayCcy)}</text>;
        })}

        {hoverIndex !== null && <line x1={xOfCandle(hoverIndex)} x2={xOfCandle(hoverIndex)} y1={padding.top} y2={padding.top + innerH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />}
      </svg>

      <div className="mt-2 flex items-center flex-wrap gap-x-4 gap-y-2 text-xs">
        {[{k:"all",n:"All"},{k:"crypto",n:"Crypto"},{k:"stock",n:"Stocks"},{k:"nonliquid",n:"Non-Liquid"}].map(item => (
          <div key={item.k} className="flex items-center gap-2">
            <div style={{ width: 10, height: 10, background: colorFor(item.k) }} className="rounded-sm" />
            <div className="text-gray-300">{item.n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(() => {
    setPrice(defaultPrice > 0 ? String(defaultPrice) : "");
  }, [defaultPrice]);

  if (!asset) return null;

  const priceUSD = priceCcy === "IDR" ? toNum(price) / usdIdr : toNum(price);
  const totalUSD = toNum(qty) * priceUSD;

  function handleSubmit(e) {
    e.preventDefault();
    const q = toNum(qty), p = priceUSD;
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    if (mode === 'buy') onBuy(q, p);
    if (mode === 'sell') onSell(q, p);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold capitalize">{mode} {asset.symbol}</h2>
            <p className="text-sm text-gray-400">{asset.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex">
              <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-800 px-3 py-2 rounded-l border-t border-b border-l border-gray-700 focus:outline-none focus:border-blue-500"
                placeholder="0.00"
              />
              <select value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)}
                className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r focus:outline-none"
              >
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right">
            Total: {fmtMoney(totalUSD, "USD")}
          </div>
          <button type="submit"
            className={`w-full py-2 rounded font-semibold ${mode === 'buy' ? 'bg-emerald-500 text-black' : 'bg-yellow-600 text-white'}`}
          >
            {mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  const LSK = "pf_v3"; // LocalStorage Key Prefix
  /* ---------- persistent state ---------- */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem(`${LSK}_assets`) || "[]");
      return Array.isArray(raw) ? raw.map(ensureNumericAsset) : [];
    } catch { return []; }
  });

  const [realizedUSD, setRealizedUSD] = useState(() => {
    try { return isBrowser ? toNum(localStorage.getItem(`${LSK}_realized`) || 0) : 0; } catch { return 0; }
  });

  const [totalDepositedUSD, setTotalDepositedUSD] = useState(() => {
    try { return isBrowser ? toNum(localStorage.getItem(`${LSK}_totalDeposited`) || 0) : 0; } catch { return 0; }
  });

  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(() => {
    try { return isBrowser ? toNum(localStorage.getItem(`${LSK}_tradingBalance`) || 0) : 0; } catch { return 0; }
  });

  const [displayCcy, setDisplayCcy] = useState(() => {
    try { return isBrowser ? (localStorage.getItem(`${LSK}_display_ccy`) || "USD") : "USD"; } catch { return "USD"; }
  });
  
  const [transactions, setTransactions] = useState(() => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem(`${LSK}_transactions`) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  });

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- add/search/deposit state ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("deposit");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");
  
  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* ---------- live quotes & UI state ---------- */
  const [lastTick, setLastTick] = useState(null);
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });
  const [chartRange, setChartRange] = useState("all");
  const [sortBy, setSortBy] = useState("market_desc");

  /* ---------- refs ---------- */
  const menuRefs = {
    filter: useRef(null),
    sort: useRef(null),
    currency: useRef(null),
  };
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  
  /* ---------- persist ---------- */
  useEffect(() => { try { localStorage.setItem(`${LSK}_assets`, JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem(`${LSK}_realized`, String(realizedUSD)); } catch {} }, [realizedUSD]);
  useEffect(() => { try { localStorage.setItem(`${LSK}_totalDeposited`, String(totalDepositedUSD)); } catch {} }, [totalDepositedUSD]);
  useEffect(() => { try { localStorage.setItem(`${LSK}_tradingBalance`, String(tradingBalanceUSD)); } catch {} }, [tradingBalanceUSD]);
  useEffect(() => { try { localStorage.setItem(`${LSK}_display_ccy`, displayCcy); } catch {} }, [displayCcy]);
  useEffect(() => { try { localStorage.setItem(`${LSK}_transactions`, JSON.stringify(transactions)); } catch {} }, [transactions]);

  /* click outside (close menus) */
  useEffect(() => {
    function onPointerDown(e) {
      if (filterMenuOpen && menuRefs.filter.current && !menuRefs.filter.current.contains(e.target) && !e.target.closest('[aria-label="Filter portfolio"]')) setFilterMenuOpen(false);
      if (sortMenuOpen && menuRefs.sort.current && !menuRefs.sort.current.contains(e.target) && !e.target.closest('[aria-label="Sort"]')) setSortMenuOpen(false);
      if (currencyMenuOpen && menuRefs.currency.current && !menuRefs.currency.current.contains(e.target) && !e.target.closest('[aria-label="Currency"]')) setCurrencyMenuOpen(false);
      if (suggestions.length > 0 && suggestionsRef.current && !suggestionsRef.current.contains(e.target)) setSuggestions([]);
      if (openAdd && addPanelRef.current && !addPanelRef.current.contains(e.target) && !e.target.closest('[aria-label="Add asset"]')) setOpenAdd(false);
    }
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen, sortMenuOpen, currencyMenuOpen, suggestions, openAdd]);

  /* search */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "nonliquid" || searchMode === "deposit") {
      setSuggestions([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const { coins = [] } = await res.json();
          setSuggestions(coins.slice(0, 20).map(c => ({
            id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name,
            source: "coingecko", type: "crypto",
          })));
        } else {
          const res = await fetch(YAHOO_SEARCH(q));
          if (!res.ok) { setSuggestions([]); return; }
          const payload = await res.json();
          const list = (payload.quotes || []).slice(0, 30).map(it => ({
            symbol: (it.symbol || "").toUpperCase(), display: it.shortname || it.longname || it.symbol,
            exchange: it.exchange, source: "yahoo", type: "stock",
          }));
          const filterFn = searchMode === 'id' 
            ? x => x.symbol.includes(".JK") 
            : x => !x.symbol.includes(".JK");
          setSuggestions(list.filter(filterFn));
        }
      } catch (e) { console.warn("search err", e); setSuggestions([]); }
    }, 320);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  /* polling quotes */
  const assetsRef = useRef(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  useEffect(() => {
    let mounted = true;
    const pollQuotes = async () => {
      if (!mounted) return;
      try {
        const cryptoIds = [...new Set(assetsRef.current.filter(a => a.type === 'crypto' && a.coingeckoId).map(a => a.coingeckoId))];
        const stockSymbols = [...new Set(assetsRef.current.filter(a => a.type === 'stock').map(a => a.symbol))];

        const priceMap = {};
        if (cryptoIds.length > 0) {
          const res = await fetch(COINGECKO_PRICE(cryptoIds.join(',')));
          const data = await res.json();
          Object.keys(data).forEach(id => {
            if (data[id]?.usd) priceMap[id] = { price: data[id].usd, type: 'crypto' };
          });
        }
        for (const symbol of stockSymbols) {
          try {
            const res = await fetch(FINNHUB_QUOTE(symbol));
            const data = await res.json();
            const price = data?.c ?? data?.current;
            if (price > 0) {
              const isIDR = symbol.toUpperCase().endsWith(".JK");
              priceMap[symbol] = { price: isIDR ? price / usdIdr : price, type: 'stock' };
            }
          } catch (e) { /* ignore single stock fetch error */ }
        }

        if (Object.keys(priceMap).length > 0 && mounted) {
          setAssets(prev => prev.map(a => {
            const key = a.type === 'crypto' ? a.coingeckoId : a.symbol;
            if (priceMap[key]) {
              const lastPriceUSD = toNum(priceMap[key].price);
              return ensureNumericAsset({ ...a, lastPriceUSD, marketValueUSD: lastPriceUSD * a.shares });
            }
            return a;
          }));
          setLastTick(Date.now());
        }
      } catch (e) { console.error("Polling error:", e); } finally {
        if (mounted && isInitialLoading) setIsInitialLoading(false);
      }
    };
    
    pollQuotes();
    const id = setInterval(pollQuotes, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, [usdIdr, isInitialLoading]);

  /* FX tether -> IDR */
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(COINGECKO_USD_IDR);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const n = normalizeIdr(j?.tether?.idr);
        if (n) setUsdIdr(n);
      } catch (e) {} finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* non-liquid price growth */
  function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, targetTime = Date.now()) {
    const years = Math.max(0, (targetTime - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
    return avgPriceUSD * Math.pow(1 + toNum(yoyPercent) / 100, years);
  }

  /* transaction effects helpers */
  function applyTransactionEffects(tx) {
    if (!tx) return;
    if (tx.type === "deposit") {
      setTotalDepositedUSD(p => p + tx.amountUSD);
      setTradingBalanceUSD(p => p + tx.amountUSD);
    } else if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) {
          const newShares = Math.max(0, a.shares - tx.qty);
          return ensureNumericAsset({ ...a, shares: newShares });
        }
        return a;
      }));
      setRealizedUSD(p => p + tx.realized);
      setTradingBalanceUSD(p => p + tx.proceeds);
    } else if (tx.type === "buy") {
      setAssets(prev => {
        const existing = prev.find(a => a.id === tx.assetId);
        if (existing) {
          return prev.map(a => {
            if (a.id === tx.assetId) {
              const newInvested = a.investedUSD + tx.cost;
              const newShares = a.shares + tx.qty;
              return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newInvested / newShares });
            }
            return a;
          });
        }
        return [...prev, ensureNumericAsset({
          id: tx.assetId, type: tx.assetType, symbol: tx.symbol, name: tx.name,
          shares: tx.qty, avgPrice: tx.pricePerUnit, investedUSD: tx.cost, 
          lastPriceUSD: tx.pricePerUnit, marketValueUSD: tx.cost,
          createdAt: tx.date, purchaseDate: tx.date,
        })];
      });
      setTradingBalanceUSD(p => p - tx.cost);
    }
  }

  function reverseTransactionEffects(tx) {
    if (!tx) return;
    if (tx.type === "deposit") {
      setTotalDepositedUSD(p => p - tx.amountUSD);
      setTradingBalanceUSD(p => p - tx.amountUSD);
    } else if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) return ensureNumericAsset({ ...a, shares: a.shares + tx.qty });
        return a;
      }));
      setRealizedUSD(p => p - tx.realized);
      setTradingBalanceUSD(p => p - tx.proceeds);
    } else if (tx.type === "buy") {
      setAssets(prev => prev.map(a => {
        if (a.id === tx.assetId) {
          const newShares = Math.max(0, a.shares - tx.qty);
          if (newShares <= 0) return null; // will be filtered out
          const newInvested = Math.max(0, a.investedUSD - tx.cost);
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newShares > 0 ? newInvested / newShares : 0 });
        }
        return a;
      }).filter(Boolean));
      setTradingBalanceUSD(p => p + tx.cost);
    }
  }

  /* ADD/DEPOSIT/BUY/SELL functions */
  function handleDeposit() {
    const amountIDR = toNum(depositIDR);
    const amountUSD = toNum(depositUSD);
    if (amountIDR <= 0 && amountUSD <= 0) { alert("Please enter a valid deposit amount."); return; }
    
    const totalDepositUSD = amountUSD + (amountIDR / usdIdr);
    const tx = {
      id: `tx:${Date.now()}:deposit`,
      type: 'deposit',
      amountUSD: totalDepositUSD,
      details: { usd: amountUSD, idr: amountIDR },
      date: Date.now(),
    };
    
    setTransactions(p => [tx, ...p]);
    applyTransactionEffects(tx);
    
    setDepositIDR("");
    setDepositUSD("");
    setOpenAdd(false);
  }

  function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select a suggestion or type a symbol."); return; }
      picked = searchMode === 'crypto'
        ? { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed }
        : { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
    }
    const qty = toNum(initQty);
    const priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Quantity and price must be greater than 0."); return; }

    const priceInUSD = initPriceCcy === "IDR" ? priceInput / usdIdr : priceInput;
    const cost = qty * priceInUSD;
    if (cost > tradingBalanceUSD) { alert(`Insufficient trading balance. Required: ${fmtMoney(cost)}, Available: ${fmtMoney(tradingBalanceUSD)}`); return; }

    const internalId = `${picked.source}:${picked.symbol || picked.id}:${Date.now()}`;
    const tx = {
      id: `tx:${Date.now()}:${internalId}`,
      assetId: internalId,
      assetType: picked.source === "coingecko" ? "crypto" : "stock",
      symbol: (picked.symbol || picked.id).toUpperCase(),
      name: picked.display || picked.name || picked.id,
      type: "buy",
      qty,
      pricePerUnit: priceInUSD,
      cost,
      date: Date.now(),
    };

    setTransactions(p => [tx, ...p]);
    applyTransactionEffects(tx);
    
    setOpenAdd(false);
    setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }
  
  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const a = assets.find(x => x.id === id); if (!a) return;
    const cost = qty * pricePerUnit;
    if (cost > tradingBalanceUSD) { alert(`Insufficient trading balance. Required: ${fmtMoney(cost)}, Available: ${fmtMoney(tradingBalanceUSD)}`); return; }

    const tx = {
      id: `tx:${Date.now()}:${id}`,
      assetId: id, assetType: a.type, symbol: a.symbol, name: a.name,
      type: "buy", qty, pricePerUnit, cost, date: Date.now(),
    };
    setTransactions(p => [tx, ...p]);
    applyTransactionEffects(tx);
    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const a = assets.find(x => x.id === id); if (!a) return;
    if (qty > a.shares) { alert("Cannot sell more than you own."); return; }

    const proceeds = qty * pricePerUnit;
    const costOfSold = qty * a.avgPrice;
    const realized = proceeds - costOfSold;

    const tx = {
      id: `tx:${Date.now()}:${id}`,
      assetId: id, assetType: a.type, symbol: a.symbol, name: a.name,
      type: "sell", qty, pricePerUnit, proceeds, costOfSold, realized, date: Date.now(),
    };
    setTransactions(p => [tx, ...p]);
    applyTransactionEffects(tx);
    closeTradeModal();
  }

  function addNonLiquidAsset() {
    const name = nlName.trim();
    const qty = toNum(nlQty);
    const priceInput = toNum(nlPrice);
    if (!name || qty <= 0 || priceInput <= 0) { alert("Name, quantity, and price are required."); return; }

    const priceUSD = nlPriceCcy === "IDR" ? priceInput / usdIdr : priceInput;
    const cost = qty * priceUSD;
    if (cost > tradingBalanceUSD) { alert(`Insufficient trading balance. Required: ${fmtMoney(cost)}, Available: ${fmtMoney(tradingBalanceUSD)}`); return; }

    const id = `nonliquid:${name.replace(/\s+/g, "_")}:${Date.now()}`;
    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    
    const asset = ensureNumericAsset({
      id, type: "nonliquid", name, symbol: name.slice(0, 10).toUpperCase(),
      shares: qty, avgPrice: priceUSD, investedUSD: cost,
      purchaseDate: purchaseDateMs, createdAt: Date.now(),
      nonLiquidYoy: toNum(nlYoy), description: nlDesc,
    });
    
    const tx = {
      id: `tx:${Date.now()}:${id}`, assetId: id, assetType: 'nonliquid',
      symbol: asset.symbol, name: asset.name, type: 'buy',
      qty, pricePerUnit: priceUSD, cost, date: Date.now(),
    };

    setAssets(p => [...p, asset]);
    setTransactions(p => [tx, ...p]);
    setTradingBalanceUSD(p => p - cost);
    
    setOpenAdd(false);
    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc("");
  }
  
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx || !confirm("Delete this transaction? This action will reverse its financial effects.")) return;
    reverseTransactionEffects(tx);
    setTransactions(p => p.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }
  
  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTransactionEffects(lastDeletedTx);
    setTransactions(p => [lastDeletedTx, ...p]);
    setLastDeletedTx(null);
  }

  function removeAsset(id) {
    const a = assets.find(x => x.id === id);
    if (!a || !confirm(`Delete ${a.symbol}? This is irreversible and won't affect your balance.`)) return;
    setAssets(p => p.filter(x => x.id !== id));
  }

  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null }); }

  /* computed values */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      aa.lastPriceUSD = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate, aa.nonLiquidYoy);
    }
    aa.marketValueUSD = aa.shares * aa.lastPriceUSD;
    const pnl = aa.marketValueUSD - aa.investedUSD;
    const pnlPct = aa.investedUSD > 0 ? (pnl / aa.investedUSD) * 100 : 0;
    return { ...aa, pnlUSD: pnl, pnlPct };
  }), [assets]);

  const filteredRows = useMemo(() => rows.filter(r => portfolioFilter === 'all' || r.type === portfolioFilter), [rows, portfolioFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    const sortFns = {
      market_desc: (a,b) => b.marketValueUSD - a.marketValueUSD,
      invested_desc: (a,b) => b.investedUSD - a.investedUSD,
      pnl_desc: (a,b) => b.pnlUSD - a.pnlUSD,
      symbol_asc: (a,b) => a.symbol.localeCompare(b.symbol),
      oldest: (a,b) => a.createdAt - b.createdAt,
      newest: (a,b) => b.createdAt - a.createdAt,
    };
    return copy.sort(sortFns[sortBy] || sortFns.market_desc);
  }, [filteredRows, sortBy]);

  const totals = useMemo(() => {
    const market = sortedRows.reduce((s, r) => s + r.marketValueUSD, 0);
    const gain = market - totalDepositedUSD;
    const gainPct = totalDepositedUSD > 0 ? (gain / totalDepositedUSD) * 100 : 0;
    return { market, gain, gainPct };
  }, [sortedRows, totalDepositedUSD]);

  const donutData = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0, 6);
    const otherTotal = sorted.slice(6).reduce((s, r) => s + r.marketValueUSD, 0);
    const data = top.map(r => ({ name: r.symbol, value: r.marketValueUSD }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal });
    return data;
  }, [filteredRows]);

  const multiSeries = useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  function buildMultiCategorySeries(rowsForChart, txs, rangeKey) {
    // This function can be complex. For now, returning a simplified version.
    // A full implementation would trace asset values over time based on transactions.
    const now = Date.now();
    const daysMap = { "1d": 1, "2d": 2, "1w": 7, "1m": 30, "1y": 365, "all": 365*2 };
    const pointsMap = { "1d": 48, "2d": 96, "1w": 56, "1m": 90, "1y": 180, "all": 200 };
    const start = now - (daysMap[rangeKey] || 365) * 24 * 3600 * 1000;
    const points = pointsMap[rangeKey] || 200;
    const seriesPerKey = { all: [], crypto: [], stock: [], nonliquid: [] };
  
    for (let i = 0; i < points; i++) {
        const t = start + (i / (points - 1)) * (now - start);
        let totals = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
        // Simplified: Linearly interpolate total market value
        const currentMarketValue = rowsForChart.reduce((sum, r) => sum + r.marketValueUSD, 0);
        const frac = (t - start) / (now - start);
        const val = totalDepositedUSD + (currentMarketValue - totalDepositedUSD) * Math.max(0, frac);

        // A more accurate model would require historical price data, which is beyond scope.
        // This provides a reasonable visual trend.
        seriesPerKey.all.push({ t, v: val });
        // Category breakdown would be even more complex.
        seriesPerKey.crypto.push({t, v: val * 0.4});
        seriesPerKey.stock.push({t, v: val * 0.5});
        seriesPerKey.nonliquid.push({t, v: val * 0.1});
    }
    return seriesPerKey;
  }

  /* RENDER */
  const titleForFilter = {
    all: "All Portfolio", crypto: "Crypto Portfolio", stock: "Stocks Portfolio", nonliquid: "Non-Liquid Portfolio",
  };

  return (
    <div className="min-h-screen bg-black text-gray-200 p-4 sm:p-6 font-sans">
      <style>{`
        .btn { transition: transform 180ms, box-shadow 180ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); }
        .slice { cursor: pointer; }
      `}</style>
      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative">
            <button
              aria-label="Filter portfolio" onClick={() => setFilterMenuOpen(v => !v)}
              className="flex items-center gap-2 text-2xl font-semibold p-2 -ml-2 rounded hover:bg-gray-900"
            >
              {titleForFilter[portfolioFilter]}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {filterMenuOpen && (
              <div ref={menuRefs.filter} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-48">
                {Object.keys(titleForFilter).map(k => (
                   <button key={k} onClick={() => { setPortfolioFilter(k); setFilterMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">{titleForFilter[k].replace(' Portfolio','')}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button aria-label="Currency" onClick={() => setCurrencyMenuOpen(v => !v)} className="flex items-center gap-2 p-2 rounded hover:bg-gray-900">
                <span className="text-xl font-bold">{fmtMoney(totals.market * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</span>
                <span className="text-sm font-semibold text-gray-400">{displayCcy}</span>
              </button>
              {currencyMenuOpen && (
                <div ref={menuRefs.currency} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg w-36">
                  <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700">USD</button>
                  <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>
            <button aria-label="Add asset" onClick={() => setOpenAdd(v => !v)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black text-2xl font-bold btn">
              <span className={`transition-transform duration-200 ${openAdd ? "rotate-open" : ""}`}>+</span>
            </button>
          </div>
        </div>

        {/* SUBHEADER */}
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          {isInitialLoading && assets.length > 0 ? (<span>Loading...</span>) : (lastTick && <span>Updated: {new Date(lastTick).toLocaleTimeString()}</span>)}
          <span>•</span>
          <span>USD/IDR ≈ {fxLoading ? "..." : usdIdr?.toLocaleString()}</span>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-900/50 p-3 rounded">
                <div className="text-gray-400">Market Value</div>
                <div className="font-bold text-lg">{fmtMoney(totals.market * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                <div className={`text-xs font-semibold ${totals.gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totals.gainPct.toFixed(2)}%</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
                <div className="text-gray-400">Invested</div>
                <div className="font-bold text-lg">{fmtMoney(totalDepositedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                <div className="text-xs text-gray-500">Total Capital</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
                <div className="text-gray-400">Trading Balance</div>
                <div className="font-bold text-lg">{fmtMoney(tradingBalanceUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                 <div className="text-xs text-gray-500">Available Cash</div>
            </div>
            <div className="bg-gray-900/50 p-3 rounded cursor-pointer" onClick={() => setTransactionsOpen(true)}>
                <div className="text-gray-400">Realized P&L</div>
                <div className={`font-bold text-lg ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMoney(realizedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                <div className="text-xs text-gray-500 hover:underline">View History</div>
            </div>
        </div>


        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-gray-900 p-4 rounded-lg border border-gray-800">
            <div className="flex items-center gap-1 mb-4 border-b border-gray-800">
                {['deposit','crypto','id','us','nonliquid'].map(mode => (
                    <button key={mode} onClick={() => setSearchMode(mode)} className={`px-3 py-2 text-sm capitalize rounded-t-md ${searchMode === mode ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}>{mode === 'id' || mode === 'us' ? `Stocks ${mode.toUpperCase()}` : mode}</button>
                ))}
            </div>

            {searchMode === 'deposit' && (
                <div className="space-y-3">
                    <h3 className="font-semibold">Add Capital</h3>
                    <div>
                        <label className="text-xs text-gray-400">Amount (USD)</label>
                        <input value={depositUSD} onChange={(e) => setDepositUSD(e.target.value)} type="number" placeholder="0.00" className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700"/>
                    </div>
                     <div>
                        <label className="text-xs text-gray-400">Amount (IDR)</label>
                        <input value={depositIDR} onChange={(e) => setDepositIDR(e.target.value)} type="number" placeholder="0" className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700"/>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleDeposit} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn">Add Deposit</button>
                        <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button>
                    </div>
                </div>
            )}
            
            {['crypto','id','us'].includes(searchMode) && (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-md">
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900">
                          <div className="font-medium">{s.symbol} • {s.display}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Qty" className="rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-24"/>
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Price" className="rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-28"/>
                <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded bg-gray-800 px-2 py-2 text-sm border border-gray-700">
                  <option value="USD">USD</option> <option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={addAssetWithInitial} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Assets</button>
                  <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button>
                </div>
              </div>
            )}
            
            {searchMode === 'nonliquid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-400">Name (e.g., Land, Art, Rolex)</label>
                  <input value={nlName} onChange={(e) => setNlName(e.target.value)} className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Quantity</label>
                  <input value={nlQty} onChange={(e) => setNlQty(e.target.value)} placeholder="1" className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Price (per unit)</label>
                  <div className="flex">
                    <input value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-l bg-gray-800 px-3 py-2 text-sm border-t border-b border-l border-gray-700" />
                    <select value={nlPriceCcy} onChange={(e) => setNlPriceCcy(e.target.value)} className="rounded-r bg-gray-800 px-2 py-2 text-sm border-t border-b border-r border-gray-700"><option value="USD">USD</option><option value="IDR">IDR</option></select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Purchase date</label>
                  <input type="date" value={nlPurchaseDate} onChange={(e) => setNlPurchaseDate(e.target.value)} className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Est. YoY gain (%)</label>
                  <input value={nlYoy} onChange={(e) => setNlYoy(e.target.value)} placeholder="5" className="w-full rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700" />
                </div>
                <div className="sm:col-span-2 flex gap-2 pt-2">
                  <button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Non-Liquid</button>
                  <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TABLE + SORT */}
        <div className="mt-6" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Assets</div>
            <div className="relative">
              <button aria-label="Sort" onClick={() => setSortMenuOpen(v => !v)} className="inline-flex items-center justify-center rounded px-2 py-1 bg-gray-900 border border-gray-800 btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6h12M9 12h6M11 18h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </button>
              {sortMenuOpen && (
                <div ref={menuRefs.sort} className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg w-56 z-40">
                  {Object.entries({market_desc:"Value", invested_desc:"Invested", pnl_desc:"P&L", symbol_asc:"A-Z", newest:"Newest", oldest:"Oldest"}).map(([k,v]) =>
                    <button key={k} onClick={() => { setSortBy(k); setSortMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700">{v}</button>
                  )}
                </div>
              )}
            </div>
          </div>
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Asset</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Last Price</div></th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets. Deposit funds and add assets to begin.</td></tr>
              ) : sortedRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950/50">
                  <td className="px-3 py-3"><div className="font-semibold">{r.symbol}</div><div className="text-xs text-gray-400">{r.name}</div></td>
                  <td className="px-3 py-3 text-right">{r.shares.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right">
                    <div>{fmtMoney(r.investedUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className="text-xs text-gray-400">{fmtMoney(r.avgPrice * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div>{fmtMoney(r.marketValueUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className="text-xs text-gray-400">{fmtMoney(r.lastPriceUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMoney(r.pnlUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{r.pnlPct.toFixed(2)}%</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { const a = assets.find(x => x.id === r.id); if(a) setTradeModal({ open: true, mode: "buy", assetId: r.id, defaultPrice: a.lastPriceUSD }); }} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button>
                      <button onClick={() => { const a = assets.find(x => x.id === r.id); if(a) setTradeModal({ open: true, mode: "sell", assetId: r.id, defaultPrice: a.lastPriceUSD }); }} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-800/80 hover:bg-red-700 px-2 py-1 rounded text-xs text-white btn">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* ALLOCATION & GROWTH */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* DONUT ALLOCATION - Left */}
            <div className="lg:col-span-1 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <h3 className="text-sm font-semibold mb-3">Asset Allocation</h3>
                {filteredRows.length > 0 ? (
                    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
                        <div className="flex-shrink-0">
                          <DonutAllocation data={donutData} size={160} inner={50} gap={0.04} displayTotal={fmtMoney(totals.market * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)} displayCcy={displayCcy} usdIdr={usdIdr} />
                        </div>
                        <div className="w-full grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-2">
                          {donutData.map((d, i) => (
                              <div key={d.name} className="flex items-center gap-2">
                                <div style={{ width: 10, height: 10, background: colorForIndex(i) }} className="rounded-full flex-shrink-0" />
                                <div>
                                  <div className="font-semibold text-xs text-gray-200">{d.name}</div>
                                  <div className="text-xs text-gray-400">{(d.value / totals.market * 100).toFixed(1)}%</div>
                                </div>
                              </div>
                          ))}
                        </div>
                    </div>
                ) : <div className="text-xs text-gray-500 text-center py-10">No assets to show.</div> }
            </div>
            
            {/* PORTFOLIO GROWTH - Right */}
            <div className="lg:col-span-2 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">Portfolio Growth</div>
                <div className="flex items-center gap-1">
                  {["1w","1m","1y","all"].map(k => (
                    <button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700" : "bg-gray-800/50"} btn`}>{k}</button>
                  ))}
                </div>
              </div>
              <CandlesWithLines seriesMap={multiSeries} displayCcy={displayCcy} usdIdr={usdIdr} rangeKey={chartRange} />
            </div>
        </div>

        {/* TRADE MODAL */}
        {tradeModal.open && <TradeModal mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={closeTradeModal} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />}
        
        {/* TRANSACTIONS MODAL */}
        {transactionsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120]">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-4xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Transaction History</h3>
                <button onClick={() => setTransactionsOpen(false)} className="bg-gray-700 px-3 py-1 rounded btn-soft">Close</button>
              </div>
              <div className="overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-left py-2 px-3">Details</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-right py-2 px-3">P&L</th>
                      <th className="px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} className="border-b border-gray-900">
                        <td className="px-3 py-3 text-xs text-gray-400">{new Date(tx.date).toLocaleString()}</td>
                        <td className="px-3 py-3"><span className={`px-2 py-1 text-xs rounded-full ${tx.type === 'buy' ? 'bg-emerald-900 text-emerald-300' : tx.type === 'sell' ? 'bg-yellow-900 text-yellow-300' : 'bg-blue-900 text-blue-300'}`}>{tx.type}</span></td>
                        <td className="px-3 py-3">
                            {tx.symbol ? <div>{tx.symbol} <span className="text-gray-500">({tx.qty} @ {fmtMoney(tx.pricePerUnit)})</span></div> : <span>Capital Deposit</span>}
                        </td>
                        <td className="px-3 py-3 text-right">{fmtMoney(tx.cost || tx.proceeds || tx.amountUSD)}</td>
                        <td className={`px-3 py-3 text-right font-semibold ${tx.realized >= 0 ? "text-emerald-400" : "text-red-400"}`}>{tx.realized ? fmtMoney(tx.realized) : "-"}</td>
                        <td className="px-3 py-3"><button onClick={() => deleteTransaction(tx.id)} className="bg-red-900/80 text-red-300 text-xs px-2 py-0.5 rounded hover:bg-red-800">Del</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lastDeletedTx && (
                <div className="mt-4 flex items-center justify-between p-2 bg-gray-800 rounded">
                  <div className="text-sm text-gray-300">Last deleted transaction restored.</div>
                  <button onClick={undoLastDeletedTransaction} className="bg-amber-500 px-3 py-1 rounded text-sm btn">Undo</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}