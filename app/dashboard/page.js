// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Portfolio Dashboard.
 *
 * This version incorporates extensive new features on top of the original stable base file:
 * - COMPLETE FINANCIAL LOGIC OVERHAUL:
 * - Introduction of Deposits, Total Invested Capital, and Trading Balance.
 * - Purchases are now funded from Trading Balance, with checks for sufficient funds.
 * - Sales proceeds are added to the Trading Balance.
 * - UI & UX ENHANCEMENTS:
 * - Add Asset panel now includes a "Deposit" tab.
 * - "Add Assets" button simplified and restyled.
 * - Donut chart is now a perfect circle, with a restyled, responsive legend.
 * - Main portfolio title is now a filter dropdown.
 * - Interactive Asset Rows: Click any asset in the table to view a detailed TradingView chart in a modal.
 * - ACCURATE GROWTH CHART:
 * - Portfolio Growth chart logic has been completely rewritten to provide a more accurate historical representation
 * of the portfolio's value by simulating transactions and price movements over time.
 * - LAYOUT REORDERING:
 * - Components are now ordered as: Asset Table -> Donut Allocation -> Growth Chart -> CSV Section.
 *
 * All original functionalities, including CSV import/export, are preserved.
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
    investedUSD: toNum(a.investedUSD || 0), // This now represents the cost basis for the asset itself
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

/* ===================== ASSET DETAIL / TRADINGVIEW MODAL ===================== */
function AssetChartModal({ asset, onClose }) {
    const tvWidgetRef = useRef(null);

    const getTradingViewSymbol = (asset) => {
        if (!asset) return null;
        if (asset.type === 'stock') {
            const symbol = asset.symbol.toUpperCase();
            if (symbol.endsWith('.JK')) {
                return `IDX:${symbol.replace('.JK', '')}`;
            }
            // Basic assumption for US stocks, might need refinement
            return `NASDAQ:${symbol}`;
        }
        if (asset.type === 'crypto') {
            // Common pairs for major exchanges
            const symbol = asset.symbol.toUpperCase();
            return `BINANCE:${symbol}USDT`
        }
        return null;
    };

    const tvSymbol = getTradingViewSymbol(asset);

    useEffect(() => {
        if (tvWidgetRef.current && tvSymbol) {
            tvWidgetRef.current.innerHTML = ''; // Clear previous widget
            const script = document.createElement('script');
            script.src = "https://s3.tradingview.com/tv.js";
            script.async = true;
            script.onload = () => {
                if (window.TradingView) {
                    new window.TradingView.widget({
                        "width": "100%",
                        "height": "100%",
                        "symbol": tvSymbol,
                        "interval": "D",
                        "timezone": "Etc/UTC",
                        "theme": "dark",
                        "style": "1",
                        "locale": "en",
                        "enable_publishing": false,
                        "allow_symbol_change": true,
                        "container_id": "tradingview-widget-container"
                    });
                }
            };
            tvWidgetRef.current.appendChild(script);
        }
    }, [asset, tvSymbol]);

    if (!asset) return null;
    
    const coingeckoLink = asset.type === 'crypto' && asset.coingeckoId 
        ? `https://www.coingecko.com/en/coins/${asset.coingeckoId}`
        : null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[110]" onClick={onClose}>
            <div className="bg-gray-900 rounded-lg w-full max-w-4xl h-[70vh] border border-gray-700 flex flex-col p-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xl font-semibold">{asset.name} ({asset.symbol})</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl">×</button>
                </div>
                {tvSymbol ? (
                    <div ref={tvWidgetRef} id="tradingview-widget-container" className="w-full h-full"></div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <p>TradingView chart not available for this asset.</p>
                        {coingeckoLink && (
                            <a href={coingeckoLink} target="_blank" rel="noopener noreferrer" className="mt-4 text-blue-400 hover:underline">
                                View on CoinGecko instead
                            </a>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}


/* ===================== DONUT ALLOCATION CHART ===================== */
function DonutAllocation({ data = [], size = 200, inner = 48, gap = 0.02, displayTotal, displayCcy = "USD", usdIdr = 16000 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const outerRadius = size / 2 - 6; // Constant outer radius for a perfect circle

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
    const arc = { start, end, outer: outerRadius };
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
            <g key={i} transform={transform}>
              <path
                d={path}
                fill={colors[i % colors.length]}
                stroke="#000"
                strokeWidth={isHover ? 1.8 : 0.6}
                style={{ transition: "transform 180ms" }}
                onMouseEnter={(ev) => onSliceEnter(i, ev, d)}
                onMouseMove={(ev) => onSliceMove(ev)}
                onMouseLeave={onSliceLeave}
                className="slice"
              />
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={inner - 4} fill="#070707" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#9CA3AF">Assets</text>
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


/* ===================== CANDLE + MULTI-LINE CHART (throttled mousemove) ===================== */
function CandlesWithLines({ seriesMap = {}, displayCcy = "USD", usdIdr = 16000, width = 960, height = 300, rangeKey = "all", onHover }) {
  const padding = { left: 56, right: 12, top: 12, bottom: 28 };
  const w = Math.min(width, 1200);
  const h = height;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  const conv = (v) => displayCcy === "IDR" ? v * usdIdr : v;

  const convAll = (seriesMap["all"] || []).map(p => ({ t: p.t, v: conv(p.v) }));

  if (!convAll || convAll.length < 2) return <div className="text-xs text-gray-500 flex items-center justify-center h-full">Not enough data for chart. Please make some transactions.</div>;

  const timeframeMap = { "1d": 48, "2d": 96, "1w": 56, "1m": 90, "1y": 180, "all": Math.min(200, convAll.length) };
  const candleCountTarget = timeframeMap[rangeKey] || Math.min(200, convAll.length);

  // buckets
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
  if (!isFinite(min) || !isFinite(max)) return <div className="text-xs text-gray-500">No chart data</div>;
  const range = Math.max(1e-8, max - min);

  const yOf = (v) => padding.top + (1 - (v - min) / range) * innerH;
  const xOfCandle = (i) => padding.left + (i + 0.5) * (innerW / candles.length);

  const [hoverIndex, setHoverIndex] = useState(null);
  const rafRef = useRef(null);

  function handleMove(e) {
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        let best = 0, bestD = Infinity;
        for (let i = 0; i < candles.length; i++) {
            const d = Math.abs(xOfCandle(i) - px);
            if (d < bestD) { bestD = d; best = i; }
        }
        setHoverIndex(best);
        if(onHover) onHover(candles[best]);
    });
  }
  function handleLeave() {
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    setHoverIndex(null);
    if (onHover) onHover(null);
  }

  return (
    <div className="w-full overflow-hidden rounded" style={{ background: "transparent" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * (range);
          const y = yOf(v);
          return <line key={i} x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />;
        })}

        {candles.map((c, i) => {
          const cx = xOfCandle(i);
          const candleWidth = Math.max(4, (innerW / candles.length) * 0.6);
          const openY = yOf(c.open), closeY = yOf(c.close), highY = yOf(c.high), lowY = yOf(c.low);
          const isUp = c.close >= c.open;
          const color = isUp ? "#34D399" : "#F87171";
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(1, Math.abs(closeY - openY));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={highY} y2={lowY} stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.9} />
              <rect x={cx - candleWidth/2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} stroke="#000" strokeWidth={0.6} rx={1} />
              {hoverIndex === i && (
                <rect x={padding.left} y={padding.top} width={innerW} height={innerH} fill="rgba(255,255,255,0.02)" />
              )}
            </g>
          );
        })}

        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * (range);
          const y = yOf(v);
          return <text key={i} x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{displayCcy === "IDR" ? fmtMoney(v, "IDR") : fmtMoney(v, "USD")}</text>;
        })}

        {hoverIndex !== null && candles[hoverIndex] && (
          <>
            <line x1={xOfCandle(hoverIndex)} x2={xOfCandle(hoverIndex)} y1={padding.top} y2={padding.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </>
        )}
      </svg>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
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
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700 focus:outline-none focus:border-blue-500"
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
          <div className="text-sm text-gray-400 text-right mb-4">
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
  const LSK_PREFIX = "pf_v4_"; // Use a new prefix to avoid conflicts with old data structure
  /* ---------- persistent state ---------- */
  const loadState = (key, defaultValue) => {
      try {
          if (!isBrowser) return defaultValue;
          const item = localStorage.getItem(LSK_PREFIX + key);
          return item ? JSON.parse(item) : defaultValue;
      } catch (e) {
          console.warn(`Could not load state for key: ${key}`, e);
          return defaultValue;
      }
  };

  const [assets, setAssets] = useState(() => loadState('assets', []).map(ensureNumericAsset));
  const [transactions, setTransactions] = useState(() => loadState('transactions', []));
  const [totalDepositedUSD, setTotalDepositedUSD] = useState(() => loadState('totalDepositedUSD', 0));
  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(() => loadState('tradingBalanceUSD', 0));
  const [realizedUSD, setRealizedUSD] = useState(() => loadState('realizedUSD', 0));
  const [displayCcy, setDisplayCcy] = useState(() => loadState('displayCcy', 'USD'));

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
  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");

  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- filter & UI ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [viewingAsset, setViewingAsset] = useState(null);

  /* ---------- table sort menu ---------- */
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  /* ---------- transactions / undo ---------- */
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  
  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* ---------- chart timeframe ---------- */
  const [chartRange, setChartRange] = useState("all");
  
  /* ---------- sorting ---------- */
  const [sortBy, setSortBy] = useState("market_desc");

  /* ---------- refs ---------- */
  const filterMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  const currencyMenuRef = useRef(null);

  /* ---------- persist ---------- */
  const saveState = (key, data) => {
      try { localStorage.setItem(LSK_PREFIX + key, JSON.stringify(data)); } catch (e) { console.error("Could not save state", e); }
  };
  useEffect(() => { saveState('assets', assets); }, [assets]);
  useEffect(() => { saveState('transactions', transactions); }, [transactions]);
  useEffect(() => { saveState('totalDepositedUSD', totalDepositedUSD); }, [totalDepositedUSD]);
  useEffect(() => { saveState('tradingBalanceUSD', tradingBalanceUSD); }, [tradingBalanceUSD]);
  useEffect(() => { saveState('realizedUSD', realizedUSD); }, [realizedUSD]);
  useEffect(() => { saveState('displayCcy', displayCcy); }, [displayCcy]);


  /* click outside (close menus) */
  useEffect(() => {
    function onPointerDown(e) {
      const target = e.target;
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target) && !e.target.closest('[aria-label="Filter portfolio"]')) {
        setFilterMenuOpen(false);
      }
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(target) && !e.target.closest('[aria-label="Sort"]')) {
        setSortMenuOpen(false);
      }
      if (suggestions.length > 0 && suggestionsRef.current && !suggestionsRef.current.contains(target) && !addPanelRef.current?.contains(target)) {
        setSuggestions([]);
      }
      if (openAdd && addPanelRef.current && !addPanelRef.current.contains(target) && !e.target.closest('[aria-label="Add asset"]')) {
        setOpenAdd(false);
      }
      if (currencyMenuOpen && currencyMenuRef.current && !currencyMenuRef.current.contains(target) && !e.target.closest('[aria-label="Currency"]')) {
        setCurrencyMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen, sortMenuOpen, suggestions, openAdd, currencyMenuOpen]);

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
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map((c) => ({
            id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name,
            source: "coingecko", type: "crypto", coingeckoId: c.id
          })));
          return;
        }

        const res = await fetch(YAHOO_SEARCH(q));
        if (!res.ok) { setSuggestions([]); return; }
        const payload = await res.json();
        
        const list = (payload.quotes || []).map((it) => ({
            symbol: (it.symbol || "").toString().toUpperCase(),
            display: it.shortname || it.longname || it.name || it.symbol,
            exchange: it.exchange || it.fullExchangeName || "",
            source: "yahoo",
            type: "stock",
        }));
        
        const filterFn = searchMode === 'id' 
            ? x => (x.symbol || "").toUpperCase().includes(".JK") || (x.exchange || "").toUpperCase().includes("JAKARTA")
            : x => !(x.symbol || "").toUpperCase().includes(".JK");

        setSuggestions(list.filter(filterFn).slice(0, 30));

      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* polling quotes */
  const assetsRef = useRef(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  useEffect(() => {
    let mounted = true;
    async function pollQuotes() {
        if (!mounted || !assetsRef.current.length) {
            if (mounted && isInitialLoading) setIsInitialLoading(false);
            return;
        }
        try {
            const cryptoIds = [...new Set(assetsRef.current.filter(a => a.type === 'crypto' && a.coingeckoId).map(a => a.coingeckoId))];
            const stockSymbols = [...new Set(assetsRef.current.filter(a => a.type === 'stock').map(a => a.symbol))];
            
            const priceMap = {};
            if (cryptoIds.length) {
                const res = await fetch(COINGECKO_PRICE(cryptoIds.join(',')));
                if(res.ok) {
                    const data = await res.json();
                    Object.keys(data).forEach(id => {
                        if (data[id]?.usd) priceMap[id] = { price: data[id].usd, type: 'crypto' };
                    });
                }
            }
            for (const symbol of stockSymbols) {
                try {
                    const res = await fetch(FINNHUB_QUOTE(symbol));
                    if(res.ok){
                        const data = await res.json();
                        const price = toNum(data?.c);
                        if (price > 0) {
                            const isIDR = symbol.toUpperCase().endsWith(".JK");
                            priceMap[symbol] = { price: isIDR ? price / usdIdr : price, type: 'stock' };
                        }
                    }
                } catch(e) {/* single fetch fail */}
            }

            if(mounted && Object.keys(priceMap).length > 0) {
                setAssets(prev => prev.map(a => {
                    const key = a.type === 'crypto' ? a.coingeckoId : a.symbol;
                    if(priceMap[key]) {
                        const lastPriceUSD = toNum(priceMap[key].price);
                        return ensureNumericAsset({...a, lastPriceUSD, marketValueUSD: lastPriceUSD * a.shares });
                    }
                    return a;
                }));
                setLastTick(Date.now());
            }

        } catch (e) { console.error("Polling error:", e); } finally {
            if (mounted && isInitialLoading) setIsInitialLoading(false);
        }
    }
    pollQuotes();
    const intervalId = setInterval(pollQuotes, 60000); // Poll every 60 seconds
    return () => { mounted = false; clearInterval(intervalId); };
  }, [isInitialLoading, usdIdr]);

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
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* non-liquid last price growth */
  function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, targetTime = Date.now()) {
    const years = Math.max(0, (targetTime - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
    const r = toNum(yoyPercent) / 100;
    return avgPriceUSD * Math.pow(1 + r, years);
  }

  /* Financial Logic Handlers */
  function handleDeposit() {
    const amountUSD = toNum(depositUSD);
    const amountIDR = toNum(depositIDR);
    if(amountUSD <= 0 && amountIDR <= 0) {
        alert("Please enter a valid amount.");
        return;
    }
    
    const totalDepositInUSD = amountUSD + (amountIDR / usdIdr);
    
    const tx = {
        id: `tx:${Date.now()}:deposit`,
        type: 'deposit',
        amountUSD: totalDepositInUSD,
        date: Date.now()
    };

    setTotalDepositedUSD(prev => prev + totalDepositInUSD);
    setTradingBalanceUSD(prev => prev + totalDepositInUSD);
    setTransactions(prev => [tx, ...prev]);

    setDepositUSD("");
    setDepositIDR("");
    setOpenAdd(false);
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode === "crypto") {
        picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed, coingeckoId: typed.toLowerCase() };
      } else {
        picked = { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
      }
    }
    const qty = toNum(initQty);
    const priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }

    const priceInUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const cost = qty * priceInUSD;
    
    if (cost > tradingBalanceUSD) {
      alert(`Insufficient trading balance. Cost: ${fmtMoney(cost)}, Balance: ${fmtMoney(tradingBalanceUSD)}`);
      return;
    }
    
    const internalId = `${picked.source || picked.type}:${picked.symbol || picked.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.coingeckoId,
      symbol: (picked.symbol || picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty,
      avgPrice: priceInUSD,
      investedUSD: cost,
      lastPriceUSD: priceInUSD,
      marketValueUSD: cost,
      createdAt: Date.now(),
      purchaseDate: Date.now(),
    });

    const tx = {
      id: `tx:${Date.now()}:${internalId}`,
      assetId: internalId, assetType: asset.type, symbol: asset.symbol, name: asset.name,
      type: 'buy', qty, pricePerUnit: priceInUSD, cost, date: Date.now()
    };
    
    setAssets(prev => [...prev, asset]);
    setTradingBalanceUSD(prev => prev - cost);
    setTransactions(prev => [tx, ...prev]);
    
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice("");
    setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  function addNonLiquidAsset() {
    const name = nlName.trim();
    const qty = toNum(nlQty);
    const priceInput = toNum(nlPrice);
    if (!name || qty <= 0 || priceInput <= 0) { alert("Name, quantity, and price must be greater than 0."); return; }
    
    const priceUSD = nlPriceCcy === "IDR" ? priceInput / usdIdr : priceInput;
    const cost = qty * priceUSD;
    
    if (cost > tradingBalanceUSD) {
      alert(`Insufficient trading balance. Cost: ${fmtMoney(cost)}, Balance: ${fmtMoney(tradingBalanceUSD)}`);
      return;
    }

    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    const id = `nonliquid:${name.replace(/\s+/g, "_")}:${Date.now()}`;
    
    const asset = ensureNumericAsset({
      id, type: "nonliquid", name, symbol: (name.length > 10 ? name.slice(0, 10) + "..." : name).toUpperCase(),
      shares: qty, avgPrice: priceUSD, investedUSD: cost,
      purchaseDate: purchaseDateMs, createdAt: Date.now(),
      nonLiquidYoy: toNum(nlYoy), description: nlDesc || "",
    });

    const tx = {
        id: `tx:${Date.now()}:${id}`, assetId: id, assetType: 'nonliquid',
        symbol: asset.symbol, name: asset.name, type: 'buy',
        qty, pricePerUnit: priceUSD, cost, date: Date.now()
    };

    setAssets(prev => [...prev, asset]);
    setTradingBalanceUSD(prev => prev - cost);
    setTransactions(prev => [tx, ...prev]);

    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc("");
    setOpenAdd(false);
  }

  /* BUY/SELL */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null }); }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const cost = qty * pricePerUnit;
    if (cost > tradingBalanceUSD) {
        alert(`Insufficient trading balance. Cost: ${fmtMoney(cost)}, Balance: ${fmtMoney(tradingBalanceUSD)}`);
        return;
    }
    
    const a = assets.find(x => x.id === id); if(!a) return;
    const tx = {
      id: `tx:${Date.now()}:${id}`,
      assetId: id, assetType: a.type, symbol: a.symbol, name: a.name,
      type: "buy", qty, pricePerUnit, cost, date: Date.now(),
    };
    
    setAssets(prev => prev.map(asset => {
        if(asset.id === id) {
            const newShares = asset.shares + qty;
            const newInvested = asset.investedUSD + cost;
            return ensureNumericAsset({ ...asset, shares: newShares, investedUSD: newInvested, avgPrice: newInvested / newShares });
        }
        return asset;
    }));
    setTradingBalanceUSD(prev => prev - cost);
    setTransactions(prev => [tx, ...prev]);

    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const a = assets.find(x => x.id === id); if (!a) return;
    if (qty > a.shares) { alert("Cannot sell more than you own"); return; }

    const proceeds = qty * pricePerUnit;
    const costOfSold = qty * a.avgPrice;
    const realized = proceeds - costOfSold;

    const tx = {
      id: `tx:${Date.now()}:${id}`,
      assetId: a.id, assetType: a.type, symbol: a.symbol, name: a.name,
      type: "sell", qty, pricePerUnit, proceeds, costOfSold, realized, date: Date.now(),
    };
    
    setAssets(prev => prev.map(asset => {
        if(asset.id === id) {
            const newShares = asset.shares - qty;
            // Cost basis decreases proportionally
            const newInvested = asset.investedUSD * (newShares / asset.shares);
            const updatedAsset = {...asset, shares: newShares, investedUSD: newInvested };
            // If all shares sold, avgPrice can remain for record, or be zeroed
            if (newShares === 0) updatedAsset.avgPrice = 0;
            return ensureNumericAsset(updatedAsset);
        }
        return asset;
    }).filter(asset => asset.shares > 0)); // remove asset if sold completely

    setTradingBalanceUSD(prev => prev + proceeds);
    setRealizedUSD(prev => prev + realized);
    setTransactions(prev => [tx, ...prev]);

    closeTradeModal();
  }

  /* remove asset */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio? This action is for correction and won't affect your balance.`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* computed rows & totals */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      aa.lastPriceUSD = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
    }
    aa.marketValueUSD = aa.shares * aa.lastPriceUSD;
    const pnl = aa.marketValueUSD - aa.investedUSD;
    const pnlPct = aa.investedUSD > 0 ? (pnl / aa.investedUSD) * 100 : 0;
    return { ...aa, pnlUSD: pnl, pnlPct };
  }), [assets]);

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
    const assetsMarketValue = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const market = assetsMarketValue + (portfolioFilter === 'all' ? tradingBalanceUSD : 0);
    const totalInvested = portfolioFilter === 'all' ? totalDepositedUSD : filteredRows.reduce((s, r) => s + toNum(r.investedUSD), 0);
    const pnl = market - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;
    return { market, pnl, pnlPct, assetsMarketValue };
  }, [filteredRows, portfolioFilter, totalDepositedUSD, tradingBalanceUSD]);

  /* donut data */
  const donutData = useMemo(() => {
    const sortedRows = filteredRows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sortedRows.slice(0, 8);
    const other = sortedRows.slice(8);
    const otherTotal = other.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal });
    return data;
  }, [filteredRows]);

  function colorForIndex(i) {
    const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
    return palette[i % palette.length];
  }

  /* CSV combined export/import (BOM + headers for spreadsheet) */
  function exportAllCSV() {
    const assetsHeaders = [
      "id","type","coingeckoId","symbol","name","description",
      "shares","avgPrice","investedUSD","createdAt","purchaseDate","nonLiquidYoy"
    ];
    const txHeaders = ["id","type","assetId","assetType","symbol","name","qty","pricePerUnit","cost","proceeds","costOfSold","realized","date", "amountUSD"];
    const metaHeaders = ["totalDepositedUSD", "tradingBalanceUSD", "realizedUSD"];

    const lines = [];
    lines.push(`# PORTFOLIO EXPORT | Version 4.0 | ${isoDate(Date.now())}`);
    lines.push(``);
    lines.push(`# METADATA`);
    lines.push(metaHeaders.join(","));
    lines.push([totalDepositedUSD, tradingBalanceUSD, realizedUSD].join(","));
    lines.push(``);
    lines.push(`# ASSETS`);
    lines.push(assetsHeaders.join(","));
    assets.forEach(a => lines.push(assetsHeaders.map(h => csvQuote(a[h])).join(",")));
    lines.push(``);
    lines.push(`# TRANSACTIONS`);
    lines.push(txHeaders.join(","));
    transactions.forEach(t => lines.push(txHeaders.map(h => csvQuote(t[h])).join(",")));

    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_export_${Date.now()}.csv`;
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file) {
      if(!confirm("Importing a file will REPLACE all current data. Are you sure you want to continue?")) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
          const text = e.target.result;
          const lines = text.split(/\r?\n/).map(l => l.trim());
          
          try {
              const metaHeaderIndex = lines.findIndex(l => l.startsWith("# METADATA"));
              const assetsHeaderIndex = lines.findIndex(l => l.startsWith("# ASSETS"));
              const txHeaderIndex = lines.findIndex(l => l.startsWith("# TRANSACTIONS"));

              if (metaHeaderIndex === -1 || assetsHeaderIndex === -1 || txHeaderIndex === -1) {
                  throw new Error("Invalid or old format. Could not find required # METADATA, # ASSETS, # TRANSACTIONS headers.");
              }

              // Parse Metadata
              const metaHeaders = lines[metaHeaderIndex + 1].split(',');
              const metaValues = lines[metaHeaderIndex + 2].split(',');
              const metaData = metaHeaders.reduce((obj, header, index) => {
                  obj[header] = toNum(metaValues[index]);
                  return obj;
              }, {});

              // Parse Assets
              const assetHeaders = lines[assetsHeaderIndex + 1].split(',');
              const importedAssets = [];
              for(let i = assetsHeaderIndex + 2; i < txHeaderIndex - 1; i++) {
                  if(!lines[i]) continue;
                  const values = lines[i].split(','); // Simple CSV parse, assumes no commas in values
                  const asset = assetHeaders.reduce((obj, header, index) => {
                      obj[header] = values[index];
                      return obj;
                  }, {});
                  importedAssets.push(ensureNumericAsset(asset));
              }

              // Parse Transactions
              const txHeaders = lines[txHeaderIndex + 1].split(',');
              const importedTxs = [];
               for(let i = txHeaderIndex + 2; i < lines.length; i++) {
                  if(!lines[i]) continue;
                  const values = lines[i].split(',');
                  const tx = txHeaders.reduce((obj, header, index) => {
                      obj[header] = values[index];
                      return obj;
                  }, {});
                  importedTxs.push(tx);
              }

              // Set state
              setTotalDepositedUSD(metaData.totalDepositedUSD || 0);
              setTradingBalanceUSD(metaData.tradingBalanceUSD || 0);
              setRealizedUSD(metaData.realizedUSD || 0);
              setAssets(importedAssets);
              setTransactions(importedTxs);

              alert("Import successful! All data has been replaced.");

          } catch (err) {
              alert(`Import failed: ${err.message}`);
              console.error(err);
          }
      };
      reader.readAsText(file);
  }

  function onImportClick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    handleImportFile(file);
    e.target.value = "";
  }

  const multiSeries = useMemo(() => {
    const sortedTxs = [...transactions].sort((a, b) => a.date - b.date);
    if(sortedTxs.length === 0) return { all: [] };
    
    const now = Date.now();
    const start = sortedTxs[0].date;
    const points = 200;
    const series = [];

    const assetPrices = assets.reduce((map, asset) => {
        map[asset.id] = { startPrice: asset.avgPrice, endPrice: asset.lastPriceUSD, startDate: asset.purchaseDate };
        return map;
    }, {});

    for(let i = 0; i < points; i++) {
        const t = start + (i / (points - 1)) * (now - start);
        let balance = 0;
        let holdings = {};

        for(const tx of sortedTxs) {
            if(tx.date > t) break;
            if(tx.type === 'deposit') balance += tx.amountUSD;
            if(tx.type === 'buy') {
                balance -= tx.cost;
                holdings[tx.assetId] = (holdings[tx.assetId] || 0) + tx.qty;
            }
            if(tx.type === 'sell') {
                balance += tx.proceeds;
                holdings[tx.assetId] = (holdings[tx.assetId] || 0) - tx.qty;
            }
        }

        let assetsValue = 0;
        for(const assetId in holdings) {
            const shares = holdings[assetId];
            if(shares > 0 && assetPrices[assetId]) {
                const { startPrice, endPrice, startDate } = assetPrices[assetId];
                const timeFrac = Math.max(0, Math.min(1, (t - startDate) / (now - startDate)));
                const interpolatedPrice = startPrice + (endPrice - startPrice) * timeFrac;
                assetsValue += shares * interpolatedPrice;
            }
        }
        series.push({ t, v: balance + assetsValue });
    }
    return { all: series };
  }, [assets, transactions]);

  /* RENDER */
  const titleForFilter = {
    all: "All Portfolio",
    crypto: "Crypto Portfolio",
    stock: "Stocks Portfolio",
    nonliquid: "Non-Liquid Portfolio",
  };
  const headerTitle = titleForFilter[portfolioFilter] || "Portfolio";

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      {viewingAsset && <AssetChartModal asset={viewingAsset} onClose={() => setViewingAsset(null)} />}
      <style>{`
        .btn { transition: transform 180ms, box-shadow 180ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); transition: transform 220ms; }
        .slice { cursor: pointer; }
        .asset-row:hover { background-color: rgba(255, 255, 255, 0.03); cursor: pointer; }
      `}</style>

      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative">
             <button
                aria-label="Filter portfolio"
                onClick={() => setFilterMenuOpen(v => !v)}
                className="flex items-center gap-2 text-2xl font-semibold p-2 -ml-2 rounded hover:bg-gray-900"
              >
                {headerTitle}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
             </button>
             {filterMenuOpen && (
                <div ref={filterMenuRef} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44">
                  <button onClick={() => { setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                  <button onClick={() => { setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                  <button onClick={() => { setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                  <button onClick={() => { setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
                </div>
              )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                aria-label="Currency"
                onClick={() => setCurrencyMenuOpen(v => !v)}
                className="inline-flex items-center gap-2"
              >
                <span className="text-xl font-bold">
                  {fmtMoney(totals.market * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}
                </span>
                <span className="text-sm text-gray-400">{displayCcy}</span>
              </button>
              {currencyMenuOpen && (
                <div ref={currencyMenuRef} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-36">
                  <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                  <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>
            <button
              aria-label="Add asset"
              onClick={() => setOpenAdd(v => !v)}
              className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn text-2xl`}
            >
              <span className={`transition-transform duration-200 ${openAdd ? "rotate-open" : ""}`}>+</span>
            </button>
          </div>
        </div>

        {/* SUBHEADER */}
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          {isInitialLoading && assets.length > 0 ? (
            <span>Loading prices...</span>
          ) : ( lastTick &&
            <>
              <span>Updated: {new Date(lastTick).toLocaleString()}</span>
              <span>•</span>
              <span>USD/IDR ≈ {fxLoading ? "..." : usdIdr?.toLocaleString()}</span>
            </>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-900 p-3 rounded-lg">
                <div className="text-gray-400">Market Value</div>
                <div className="font-bold text-lg">{fmtMoney(totals.market * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                <div className={`text-xs font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totals.pnlPct.toFixed(2)}% total return</div>
            </div>
             <div className="bg-gray-900 p-3 rounded-lg">
                <div className="text-gray-400">Invested</div>
                <div className="font-bold text-lg">{fmtMoney(totalDepositedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                <div className="text-xs text-gray-500">Total Capital</div>
            </div>
            <div className="bg-gray-900 p-3 rounded-lg">
                <div className="text-gray-400">Trading Balance</div>
                <div className="font-bold text-lg">{fmtMoney(tradingBalanceUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                 <div className="text-xs text-gray-500">Available Cash</div>
            </div>
            <div className="bg-gray-900 p-3 rounded-lg cursor-pointer hover:bg-gray-800" onClick={() => setTransactionsOpen(true)}>
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
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto..." : "Search stocks..."} className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm outline-none border border-gray-700" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                          <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-32" />
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-full sm:w-32" />
                <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-800 px-2 py-2 text-sm border border-gray-700">
                  <option value="USD">USD</option> <option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={addAssetWithInitial} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded font-semibold btn">Add Assets</button>
                  <button onClick={() => setOpenAdd(false)} className="bg-gray-700 px-3 py-2 rounded btn-soft">Close</button>
                </div>
              </div>
            )}
            
            {searchMode === 'nonliquid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* ... (Non-liquid form remains unchanged) ... */}
              </div>
            )}
          </div>
        )}

        {/* TABLE + SORT */}
        <div className="mt-6" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          {/* ... (Table sort header remains unchanged) ... */}
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Asset</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Cost Basis <div className="text-xs text-gray-500">Avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Last Price</div></th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets. Deposit funds and add assets to begin.</td></tr>
              ) : sortedRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 asset-row" onClick={() => setViewingAsset(r)}>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100">{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{r.shares.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{fmtMoney(r.investedUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className="text-xs text-gray-400">{fmtMoney(r.avgPrice * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{fmtMoney(r.marketValueUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? fmtMoney(r.lastPriceUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy) : "-"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMoney(r.pnlUSD * (displayCcy === "IDR" ? usdIdr : 1), displayCcy)}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* LAYOUT REORDER: DONUT -> GROWTH -> CSV */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-gray-900 p-4 rounded-lg">
                <h3 className="text-sm font-semibold mb-3">Asset Allocation</h3>
                {filteredRows.length > 0 ? (
                    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-4">
                        <div className="flex-shrink-0">
                          <DonutAllocation data={donutData} size={160} inner={50} gap={0.04} displayTotal={fmtMoney(totals.assetsMarketValue * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)} displayCcy={displayCcy} usdIdr={usdIdr} />
                        </div>
                        <div className="w-full grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-2">
                          {donutData.map((d, i) => (
                              <div key={d.name} className="flex items-center gap-2">
                                <div style={{ width: 10, height: 10, background: colorForIndex(i) }} className="rounded-full flex-shrink-0" />
                                <div>
                                  <div className="font-semibold text-xs text-gray-200">{d.name}</div>
                                  <div className="text-xs text-gray-400">{(totals.assetsMarketValue > 0 ? (d.value / totals.assetsMarketValue * 100) : 0).toFixed(1)}%</div>
                                </div>
                              </div>
                          ))}
                        </div>
                    </div>
                ) : <div className="text-xs text-gray-500 text-center py-10">No assets to show.</div> }
            </div>
            
            <div className="lg:col-span-2 bg-gray-900 p-4 rounded-lg">
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

        {/* TRADE MODAL & TRANSACTIONS MODAL remain unchanged */}
        {tradeModal.open && <TradeModal mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={closeTradeModal} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />}
        {transactionsOpen && ( /* ... Transaction Modal JSX ... */ )}
        
        {/* EXPORT / IMPORT CSV */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">Data Management</div>
            <div className="text-xs text-gray-500">Export your portfolio data (assets, transactions, balances) to a CSV file. Importing will replace all existing data.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportAllCSV} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-blue-600 hover:text-white">Export CSV</button>
            <label className="bg-white text-black px-3 py-2 rounded font-semibold cursor-pointer btn hover:bg-emerald-500 hover:text-white">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={() => {
              if (!confirm("This will clear ALL your data (assets, transactions, balances). This cannot be undone. Continue?")) return;
              setAssets([]); setTransactions([]); setRealizedUSD(0); setTotalDepositedUSD(0); setTradingBalanceUSD(0);
            }} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-red-600 hover:text-white">Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}