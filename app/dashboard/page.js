// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Modified page.js
 * - Deposit / tradingBalance logic added
 * - Invested is accumulated from deposits only
 * - Buy blocked if trading balance insufficient
 * - Add panel: removed plain Add, changed Add + Position -> Add Assets (green)
 * - Donut (CakeAllocation) changed to perfect circle (constant outer radius)
 * - Donut placed under assets table, then growth chart, then CSV export
 * - Donut legend compact, color boxes rounded; mobile: legend aside donut
 * - Clicking asset row opens chart modal (TradingView / CoinGecko fallback)
 *
 * NOTE: I kept other code & helpers from original file and only modified relevant sections.
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

/* ===================== CAKE-STYLE ALLOCATION (PERFECT CIRCLE) ===================== */
function CakeAllocation({ data = [], size = 200, inner = 48, gap = 0.02, displayTotal, displayCcy = "USD", usdIdr = 16000 }) {
  // CHANGES: DONUT CIRCLE -> use constant outer radius for perfect circle
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const outer = Math.round(size / 2 - 6); // constant outer radius -> perfect circle
  const minInner = inner;
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

  // build arcs proportional to values
  let start = -Math.PI / 2;
  const arcs = data.map((d) => {
    const portion = Math.max(0, d.value || 0) / total;
    const angle = portion * Math.PI * 2;
    const end = start + angle;
    const arc = { start, end, outer };
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
          const gapAngle = Math.min(arc.end - arc.start, gap);
          const s = arc.start + gapAngle / 2;
          const e = arc.end - gapAngle / 2;
          const path = arcPath(cx, cy, minInner, arc.outer, s, e);
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

        <circle cx={cx} cy={cy} r={minInner - 4} fill="#070707" />
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

/* ===================== CANDLE + MULTI-LINE CHART (throttled mousemove) ===================== */
function CandlesWithLines({ seriesMap = {}, displayCcy = "USD", usdIdr = 16000, width = 960, height = 300, rangeKey = "all", onHover }) {
  // kept original implementation (unchanged)
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
  convKeys.forEach(k => (convCats[k] || []).forEach(p => { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }));
  if (!isFinite(min) || !isFinite(max)) return <div className="text-xs text-gray-500">No chart data</div>;
  const range = Math.max(1e-8, max - min);

  const yOf = (v) => padding.top + (1 - (v - min) / range) * innerH;
  const xOfCandle = (i) => padding.left + (i + 0.5) * (innerW / candles.length);

  const colorFor = (k) => {
    if (k === "all") return "#4D96FF";
    if (k === "crypto") return "#FF6B6B";
    if (k === "stock") return "#6BCB77";
    if (k === "nonliquid") return "#FFD93D";
    return "#B28DFF";
  };

  const [hoverIndex, setHoverIndex] = useState(null);
  const rafRef = useRef(null);
  const lastXRef = useRef(null);

  function scheduleHover(x, rect) {
    lastXRef.current = { x, rect };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      const info = lastXRef.current;
      rafRef.current = null;
      if (!info) return;
      const px = info.x - (info.rect.left || 0);
      let best = 0, bestD = Infinity;
      for (let i = 0; i < candles.length; i++) {
        const cx = xOfCandle(i);
        const d = Math.abs(cx - px);
        if (d < bestD) { bestD = d; best = i; }
      }
      setHoverIndex(best);
      if (onHover) {
        const c = candles[best];
        onHover({ t: c.t, o: c.open, h: c.high, l: c.low, c: c.close });
      }
    });
  }

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    scheduleHover(e.clientX, rect);
  }
  function handleLeave() {
    setHoverIndex(null);
    if (onHover) onHover(null);
  }

  function seriesToLinePoints(catSeries) {
    if (!catSeries || catSeries.length === 0) return [];
    const pts = [];
    for (let i = 0; i < candles.length; i++) {
      const midT = candles[i].t;
      let nearest = catSeries[0];
      let bestD = Math.abs(catSeries[0].t - midT);
      for (let j = 1; j < catSeries.length; j++) {
        const d = Math.abs(catSeries[j].t - midT);
        if (d < bestD) { bestD = d; nearest = catSeries[j]; }
      }
      const x = xOfCandle(i);
      const y = yOf(nearest.v);
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

        {["crypto","stock","nonliquid"].map(k => {
          const pts = overlayPts[k] || [];
          if (!pts.length) return null;
          const path = pts.map((p, idx) => `${idx===0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
          return (
            <g key={k}>
              <path d={path} stroke={colorFor(k)} strokeWidth={k==="stock"?1.8:1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
              {pts.map((p, idx) => <circle key={idx} cx={p.x} cy={p.y} r={2} fill={colorFor(k)} stroke="#000" strokeWidth={0.4} />)}
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

      <div className="mt-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, background: "#4D96FF" }} className="rounded-sm" />
          <div className="text-xs text-gray-300">All</div>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, background: "#FF6B6B" }} className="rounded-sm" />
          <div className="text-xs text-gray-300">Crypto</div>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, background: "#6BCB77" }} className="rounded-sm" />
          <div className="text-xs text-gray-300">Stocks</div>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, background: "#FFD93D" }} className="rounded-sm" />
          <div className="text-xs text-gray-300">Non-Liquid</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr, tradingBalanceUSD }) {
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
    if (mode === 'buy') {
      if (toNum(tradingBalanceUSD) < q * p) {
        alert("Insufficient trading balance to buy.");
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
            <div className="text-xs text-gray-500 mt-1">Trading balance: {fmtMoney(tradingBalanceUSD, "USD")}</div>
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
  /* ---------- persistent state ---------- */
  const loadAssets = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_assets_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(ensureNumericAsset);
    } catch {
      return [];
    }
  };
  const [assets, setAssets] = useState(loadAssets);

  const loadRealized = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem("pf_realized_v2") || 0);
    } catch { return 0; }
  };
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);

  const loadDisplayCcy = () => {
    try {
      if (!isBrowser) return "USD";
      return localStorage.getItem("pf_display_ccy_v2") || "USD";
    } catch { return "USD"; }
  };
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  const loadTransactions = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_transactions_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(t => ({ ...t }));
    } catch {
      return [];
    }
  };
  const [transactions, setTransactions] = useState(loadTransactions);

  /* CHANGES FOR DEPOSIT/TRADING BALANCE */
  const loadDepositedUSD = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem("pf_deposited_usd_v2") || 0);
    } catch { return 0; }
  };
  const [depositedUSD, setDepositedUSD] = useState(loadDepositedUSD);

  const loadTradingBalanceUSD = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem("pf_trading_balance_usd_v2") || 0);
    } catch { return 0; }
  };
  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(loadTradingBalanceUSD);

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- add/search state ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("deposit"); // CHANGES: default tab show Deposit first
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* deposit inputs */
  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- filter & UI ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);

  /* ---------- table sort menu ---------- */
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  /* ---------- transactions / undo ---------- */
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* chart timeframe */
  const [chartRange, setChartRange] = useState("all");
  const [chartHover, setChartHover] = useState(null);

  /* sorting */
  const [sortBy, setSortBy] = useState("market_desc");

  /* refs */
  const filterMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  const currencyMenuRef = useRef(null);

  /* persist deposits & trading balance */
  useEffect(() => {
    try { localStorage.setItem("pf_deposited_usd_v2", String(depositedUSD)); } catch {}
  }, [depositedUSD]);
  useEffect(() => {
    try { localStorage.setItem("pf_trading_balance_usd_v2", String(tradingBalanceUSD)); } catch {}
  }, [tradingBalanceUSD]);

  /* ---------- persist other things ---------- */
  useEffect(() => {
    try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {}
  }, [realizedUSD]);
  useEffect(() => {
    try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {}
  }, [displayCcy]);
  useEffect(() => {
    try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions || [])); } catch {}
  }, [transactions]);

  /* click outside (close menus) */
  useEffect(() => {
    function onPointerDown(e) {
      const target = e.target;
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target) && !e.target.closest('[aria-label="Filter"]')) {
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

  /* search (unchanged) */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "nonliquid") {
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
            source: "coingecko", type: "crypto",
          })));
          return;
        }

        const proxyCandidates = [
          YAHOO_SEARCH,
          (t) => `/api/search?q=${encodeURIComponent(t)}`,
        ];
        let payload = null;
        for (const p of proxyCandidates) {
          try {
            const url = typeof p === "function" ? p(q) : p(q);
            const res = await fetch(url);
            if (!res.ok) continue;
            payload = await res.json();
            if (payload) break;
          } catch (e) {}
        }
        if (!payload) { setSuggestions([]); return; }

        const rawList = payload.quotes || payload.result || (payload.data && payload.data.quotes) || (payload.finance && payload.finance.result && payload.finance.result.quotes) || payload.items || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map((it) => {
          const symbol =
            it.symbol ||
            it.ticker ||
            it.symbolDisplay ||
            it.id ||
            (typeof it === "string" ? it : "");
          const display =
            it.shortname ||
            it.shortName ||
            it.longname ||
            it.longName ||
            it.name ||
            it.title ||
            it.displayName ||
            it.description ||
            symbol;
          const exchange = it.exchange || it.fullExchangeName || it.exchangeName || it.exchDisp || "";
          const currency = it.currency || it.quoteCurrency || "";
          return {
            symbol: (symbol || "").toString().toUpperCase(),
            display: display || symbol,
            exchange,
            currency,
            source: "yahoo",
            type: "stock",
          };
        });

        if (searchMode === "id") {
          setSuggestions(list.filter((x) =>
            (x.symbol || "").toUpperCase().includes(".JK") ||
            String(x.exchange || "").toUpperCase().includes("JAKARTA") ||
            String(x.exchange || "").toUpperCase().includes("IDX")
          ).slice(0, 30));
        } else {
          setSuggestions(list.filter((x) => !(x.symbol || "").toUpperCase().endsWith(".JK")).slice(0, 30));
        }
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* polling crypto & stocks (unchanged logic) */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) {}
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 50);
        if (symbols.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const map = {};
        for (const s of symbols) {
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) continue;
            const js = await res.json();
            const current = toNum(js?.c ?? js?.current ?? 0);
            if (current > 0) {
              const looksLikeId = String(s || "").toUpperCase().endsWith(".JK") || String(js?.symbol || "").toUpperCase().endsWith(".JK") || String(js?.exchange || "").toUpperCase().includes("IDX");
              let priceUSD = current;
              if (looksLikeId) {
                const fx = usdIdrRef.current || 1;
                priceUSD = fx > 0 ? (current / fx) : current;
              }
              if (priceUSD > 0) {
                map[s] = { symbol: s, priceRaw: current, priceUSD, _source: "finnhub", currency: looksLikeId ? "IDR" : js?.currency || "USD", fullExchangeName: js?.exchange || "" };
              }
            }
          } catch (e) {}
        }
        const missing = symbols.filter(s => !map[s]);
        if (missing.length > 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(missing.join(",")));
            if (res.ok) {
              const j = await res.json();
              if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
                j.quoteResponse.result.forEach(q => {
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) {
                    map[q.symbol] = { symbol: q.symbol, priceRaw: price, currency: q.currency, fullExchangeName: q.fullExchangeName, _source: "yahoo" };
                  }
                });
              } else if (Array.isArray(j)) {
                j.forEach(q => {
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: price, _source: "yahoo" };
                });
              } else if (j && typeof j === "object") {
                Object.keys(j).forEach(k => {
                  const q = j[k];
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: price, currency: q.currency || "USD", fullExchangeName: q.fullExchangeName, _source: "yahoo" };
                });
              }
            }
          } catch (e) {}
        }

        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const entry = map[a.symbol];
            let priceRaw = toNum(entry.priceRaw || 0);
            const currency = (entry.currency || "").toString().toUpperCase();
            let priceUSD = priceRaw;
            const looksLikeId = currency === "IDR" || String(a.symbol || "").toUpperCase().endsWith(".JK") || String(entry.fullExchangeName || "").toUpperCase().includes("JAKARTA");
            if (looksLikeId && priceRaw > 0) {
              const fx = usdIdrRef.current || 1;
              priceUSD = fx > 0 ? (priceRaw / fx) : priceRaw;
            }
            if (!(priceUSD > 0)) priceUSD = a.avgPrice || a.lastPriceUSD || 0;
            return ensureNumericAsset({ ...a, lastPriceUSD: priceUSD, marketValueUSD: priceUSD * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) {}
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  /* FX tether -> IDR */
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(COINGECKO_USD_IDR);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
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
    const last = avgPriceUSD * Math.pow(1 + r, years);
    return last;
  }

  /* transactions effects helpers (updated to affect tradingBalance) */
  function applyTransactionEffects(tx) {
    if (!tx) return;
    if (tx.type === "sell") {
      // asset shares change and trading balance increases by proceeds
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
      // add proceeds to trading balance
      setTradingBalanceUSD(prev => toNum(prev) + toNum(tx.proceeds || 0));
    } else if (tx.type === "buy") {
      // asset shares change and trading balance decreases by cost
      setAssets(prev => prev.map(a => {
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
      }));
      const exists = assets.find(a => a.id === tx.assetId);
      if (!exists) {
        const avg = tx.cost / (tx.qty || 1);
        const asset = ensureNumericAsset({
          id: tx.assetId || `tx-asset:${tx.symbol}:${Date.now()}`,
          type: tx.assetType || "stock",
          symbol: tx.symbol, name: tx.name || tx.symbol,
          shares: tx.qty, avgPrice: avg, investedUSD: tx.cost, lastPriceUSD: tx.pricePerUnit || avg, marketValueUSD: tx.qty * (tx.pricePerUnit || avg),
        });
        setAssets(prev => [...prev, asset]);
      }
      // deduct cost from trading balance
      setTradingBalanceUSD(prev => toNum(prev) - toNum(tx.cost || 0));
    } else if (tx.type === "deposit") {
      // deposit: increase deposited total and trading balance
      const amt = toNum(tx.amountUSD || 0);
      setDepositedUSD(prev => toNum(prev) + amt);
      setTradingBalanceUSD(prev => toNum(prev) + amt);
    }
  }

  function reverseTransactionEffects(tx) {
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
      // remove proceeds from trading balance
      setTradingBalanceUSD(prev => toNum(prev) - toNum(tx.proceeds || 0));
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
      // refund cost to trading balance
      setTradingBalanceUSD(prev => toNum(prev) + toNum(tx.cost || 0));
    } else if (tx.type === "deposit") {
      // reverse deposit: subtract from deposited and trading
      const amt = toNum(tx.amountUSD || 0);
      setDepositedUSD(prev => Math.max(0, toNum(prev) - amt));
      setTradingBalanceUSD(prev => Math.max(0, toNum(prev) - amt));
    }
  }

  /* add helpers (with buy restrictions) */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId, type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(), name: s.display || s.name || s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
      createdAt: Date.now(),
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
    } else {
      newAsset = ensureNumericAsset({
        id: `manual:yh:${typed}:${Date.now()}`, type: "stock",
        symbol: typed.toUpperCase(), name: typed.toUpperCase(),
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
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
      } else {
        picked = { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
      }
    }
    const qty = toNum(initQty);
    const priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }

    const internalId = `${picked.source || picked.type}:${picked.symbol || picked.id}:${Date.now()}`;
    const priceInUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const cost = priceInUSD * qty;

    // CHANGES: require trading balance
    if (toNum(tradingBalanceUSD) < cost) { alert("Insufficient trading balance to add this position."); return; }

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
      purchaseDate: Date.now(),
    });

    // create buy transaction so effects applied uniformly
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: internalId,
      assetType: asset.type,
      symbol: asset.symbol, name: asset.name,
      type: "buy",
      qty: qty,
      pricePerUnit: priceInUSD,
      cost: cost,
      date: Date.now(),
    };

    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    applyTransactionEffects(tx);

    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice("");
    setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  function addNonLiquidAsset() {
    const name = nlName.trim();
    const qty = toNum(nlQty);
    const priceInput = toNum(nlPrice);
    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    const yoy = toNum(nlYoy);
    if (!name) { alert("Enter non-liquid asset name (Land, Art, Rolex...)"); return; }
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const priceUSD = nlPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const id = `nonliquid:${name.replace(/\s+/g, "_")}:${Date.now()}`;
    const last = computeNonLiquidLastPrice(priceUSD, purchaseDateMs, yoy);
    const asset = ensureNumericAsset({
      id,
      type: "nonliquid",
      symbol: (name.length > 12 ? name.slice(0, 12) + "…" : name).toUpperCase(),
      name,
      shares: qty,
      avgPrice: priceUSD,
      investedUSD: priceUSD * qty,
      lastPriceUSD: last,
      marketValueUSD: last * qty,
      createdAt: Date.now(),
      purchaseDate: purchaseDateMs,
      nonLiquidYoy: yoy,
      description: nlDesc || "",
    });
    setAssets(prev => [...prev, asset]);
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
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }

    const cost = q * p;
    if (toNum(tradingBalanceUSD) < cost) { alert("Insufficient trading balance"); return; }

    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: id,
      assetType: (assets.find(a=>a.id===id)||{}).type || "stock",
      symbol: (assets.find(a=>a.id===id)||{}).symbol || "",
      name: (assets.find(a=>a.id===id)||{}).name || "",
      type: "buy",
      qty: q,
      pricePerUnit: p,
      cost,
      date: Date.now(),
    };

    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    applyTransactionEffects(tx);
    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    const a = assets.find(x => x.id === id); if (!a) return;
    const oldShares = toNum(a.shares || 0); if (q > oldShares) { alert("Cannot sell more than you own"); return; }

    const avg = toNum(a.avgPrice || 0);
    const proceeds = q * p, costOfSold = q * avg;
    const realized = proceeds - costOfSold;

    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: a.id,
      assetType: a.type || "stock",
      symbol: a.symbol,
      name: a.name || "",
      type: "sell",
      qty: q,
      pricePerUnit: p,
      proceeds,
      costOfSold,
      realized,
      date: Date.now(),
    };

    applyTransactionEffects(tx);
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    closeTradeModal();
  }

  /* deposit action */
  function performDeposit({ amountUSD, sourceLabel = "Deposit" }) {
    const amt = toNum(amountUSD);
    if (amt <= 0) { alert("Enter deposit amount"); return; }
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      type: "deposit",
      amountUSD: amt,
      label: sourceLabel,
      date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    applyTransactionEffects(tx);
    alert(`Deposit ${fmtMoney(amt, "USD")} added to trading balance.`);
  }

  /* transactions delete/restore */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Delete & CANCEL transaction for ${tx.symbol || tx.label || ""}? This will reverse its effect and can be undone.`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }

  function restoreTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Restore (reverse) transaction for ${tx.symbol || tx.label || ""}?`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTransactionEffects(lastDeletedTx);
    setTransactions(prev => [lastDeletedTx, ...prev]);
    setLastDeletedTx(null);
  }
  function purgeLastDeletedTransaction() { setLastDeletedTx(null); }

  /* remove asset */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* computed rows & totals */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);

    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares || 0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || 0);
      if (!aa.lastPriceUSD || aa.lastPriceUSD <= 0) {
        aa.lastPriceUSD = aa.avgPrice || aa.lastPriceUSD || 0;
      }
      aa.marketValueUSD = toNum(aa.shares || 0) * aa.lastPriceUSD;
    }

    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = aa.marketValueUSD || (toNum(aa.shares || 0) * last);
    const invested = toNum(aa.investedUSD || 0); // per-asset invested (kept for reference)
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets, usdIdr]);

  const filteredRows = useMemo(() => {
    if (portfolioFilter === "all") return rows;
    if (portfolioFilter === "crypto") return rows.filter(r => r.type === "crypto");
    if (portfolioFilter === "stock") return rows.filter(r => r.type === "stock");
    if (portfolioFilter === "nonliquid") return rows.filter(r => r.type === "nonliquid");
    return rows;
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

  /* CHANGES: totals - invested uses depositedUSD (accumulated deposits) */
  const totals = useMemo(() => {
    const invested = toNum(depositedUSD); // CHANGED: invested is accumulated deposits only
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows, depositedUSD]);

  /* donut/cake data */
  const donutData = useMemo(() => {
    const sortedRows = filteredRows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sortedRows.slice(0, 6);
    const other = sortedRows.slice(6);
    const otherTotal = other.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const otherSymbols = other.map(r => r.symbol);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: otherSymbols });
    return data;
  }, [filteredRows]);

  function colorForIndex(i) {
    const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
    return palette[i % palette.length];
  }

  /* CSV combined export/import (BOM + headers for spreadsheet) */
  function csvQuote(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function exportAllCSV() {
    const assetsHeaders = [
      "id","type","coingeckoId","symbol","name","description",
      "shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD",
      "createdAt","purchaseDate","nonLiquidYoy"
    ];
    const txHeaders = ["id","type","assetId","assetType","symbol","name","qty","pricePerUnit","cost","proceeds","costOfSold","realized","date","amountUSD","label"];

    const lines = [];
    lines.push(`#FILE:app/dashboard/page.js`);
    lines.push(`#EXPORT:CombinedPortfolioAndTransactions,generatedAt=${isoDate(Date.now())}`);
    lines.push(`#ASSETS`);
    lines.push(assetsHeaders.join(","));
    assets.forEach(a => {
      const aa = ensureNumericAsset(a);
      const row = assetsHeaders.map(h => {
        const v = aa[h];
        if (h === "createdAt" || h === "purchaseDate") return csvQuote(isoDate(v));
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push("");
    lines.push(`#TRANSACTIONS`);
    lines.push(txHeaders.join(","));
    transactions.forEach(t => {
      const row = txHeaders.map(h => {
        const v = t[h];
        if (h === "date") return csvQuote(isoDate(v));
        if (typeof v === "number") return String(v);
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr},assets=${assets.length},transactions=${transactions.length},depositedUSD=${depositedUSD},tradingBalanceUSD=${tradingBalanceUSD}`);

    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_combined_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file, { merge = true } = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const linesRaw = text.split(/\r?\n/);
      if (linesRaw[0] && linesRaw[0].charCodeAt(0) === 0xFEFF) linesRaw[0] = linesRaw[0].slice(1);
      const lines = linesRaw.map(l => l.trimRight());
      if (lines.length === 0) return alert("Empty file");
      const idxAssets = lines.findIndex(l => l.startsWith("#ASSETS"));
      const idxTx = lines.findIndex(l => l.startsWith("#TRANSACTIONS"));
      const metaLine = lines.find(l => l.startsWith("#META"));
      let importedAssets = [];
      if (idxAssets >= 0) {
        let headerLineIdx = -1;
        for (let i = idxAssets + 1; i < lines.length; i++) {
          if (lines[i].trim() === "") continue;
          headerLineIdx = i; break;
        }
        if (headerLineIdx >= 0) {
          const headers = lines[headerLineIdx].split(",").map(h => h.replace(/^"|"$/g,"").trim());
          for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (!l || l.startsWith("#TRANSACTIONS") || l.startsWith("#META") || l.startsWith("#FILE") || l.startsWith("#EXPORT")) break;
            const values = [];
            let cur = "";
            let insideQuote = false;
            for (let k = 0; k < l.length; k++) {
              const ch = l[k];
              if (ch === '"' && l[k+1] === '"') { cur += '"'; k++; continue; }
              if (ch === '"') { insideQuote = !insideQuote; continue; }
              if (ch === "," && !insideQuote) { values.push(cur); cur = ""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
            const parsed = {
              id: obj.id || `imp:${obj.symbol || ""}:${Date.now()}`,
              type: obj.type || "stock",
              coingeckoId: obj.coingeckoId || undefined,
              symbol: (obj.symbol || "").toString().toUpperCase(),
              name: obj.name || obj.symbol || "",
              description: obj.description || "",
              shares: toNum(obj.shares || 0),
              avgPrice: toNum(obj.avgPrice || 0),
              investedUSD: toNum(obj.investedUSD || 0),
              lastPriceUSD: toNum(obj.lastPriceUSD || 0),
              marketValueUSD: toNum(obj.marketValueUSD || 0),
              createdAt: obj.createdAt ? Date.parse(obj.createdAt) || Date.now() : Date.now(),
              purchaseDate: obj.purchaseDate ? (Date.parse(obj.purchaseDate) || undefined) : undefined,
              nonLiquidYoy: toNum(obj.nonLiquidYoy) || 0,
            };
            importedAssets.push(ensureNumericAsset(parsed));
          }
        }
      }

      let importedTx = [];
      if (idxTx >= 0) {
        let headerLineIdx = -1;
        for (let i = idxTx + 1; i < lines.length; i++) {
          if (lines[i].trim() === "") continue;
          headerLineIdx = i; break;
        }
        if (headerLineIdx >= 0) {
          const headers = lines[headerLineIdx].split(",").map(h => h.replace(/^"|"$/g,"").trim());
          for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (!l || l.startsWith("#META") || l.startsWith("#FILE") || l.startsWith("#EXPORT")) break;
            const values = [];
            let cur = "";
            let insideQuote = false;
            for (let k = 0; k < l.length; k++) {
              const ch = l[k];
              if (ch === '"' && l[k+1] === '"') { cur += '"'; k++; continue; }
              if (ch === '"') { insideQuote = !insideQuote; continue; }
              if (ch === "," && !insideQuote) { values.push(cur); cur = ""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
            const parsed = {
              id: obj.id || `imp_tx:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
              type: obj.type || "buy",
              assetId: obj.assetId || obj.assetId,
              assetType: obj.assetType || "stock",
              symbol: (obj.symbol || "").toString().toUpperCase(),
              name: obj.name || obj.symbol || "",
              qty: toNum(obj.qty || 0),
              pricePerUnit: toNum(obj.pricePerUnit || 0),
              cost: toNum(obj.cost || 0),
              proceeds: toNum(obj.proceeds || 0),
              costOfSold: toNum(obj.costOfSold || 0),
              realized: toNum(obj.realized || 0),
              date: obj.date ? (Date.parse(obj.date) || Date.now()) : Date.now(),
              amountUSD: toNum(obj.amountUSD || 0),
              label: obj.label || "",
            };
            importedTx.push(parsed);
          }
        }
      }

      if (metaLine) {
        try {
          const m = metaLine.replace(/^#META,?/, "");
          const parts = m.split(",");
          parts.forEach(p => {
            const [k,v] = p.split("=");
            if (k === "realizedUSD") setRealizedUSD(toNum(v));
            if (k === "displayCcy" && v) setDisplayCcy(String(v));
            if (k === "usdIdr") setUsdIdr(toNum(v));
            if (k === "depositedUSD") setDepositedUSD(toNum(v));
            if (k === "tradingBalanceUSD") setTradingBalanceUSD(toNum(v));
          });
        } catch (e) {}
      }

      if (importedAssets.length > 0) {
        if (merge) {
          const map = {};
          assets.forEach(a => map[a.symbol] = ensureNumericAsset(a));
          importedAssets.forEach(i => map[i.symbol] = ensureNumericAsset(i));
          const merged = Object.values(map);
          setAssets(merged);
        } else {
          setAssets(importedAssets);
        }
      }

      if (importedTx.length > 0) {
        if (merge) {
          const mergedTx = [...importedTx, ...transactions];
          setTransactions(mergedTx.slice(0, 1000));
        } else {
          setTransactions(importedTx.slice(0, 1000));
        }
      }

      alert("Import complete");
    };
    reader.readAsText(file);
  }
  function onImportClick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const replace = confirm("Replace existing portfolio & transactions? (OK = replace, Cancel = merge)");
    handleImportFile(file, { merge: !replace });
    e.target.value = "";
  }

  /* build growth series (kept original logic, should reflect applyTransactionEffects changes) */
  function buildMultiCategorySeries(rowsForChart, txs, rangeKey) {
    const now = Date.now();
    let earliest = now;
    txs.forEach(t => { if (t.date && t.date < earliest) earliest = t.date; });
    rowsForChart.forEach(r => { if (r.purchaseDate && r.purchaseDate < earliest) earliest = r.purchaseDate; });
    const defaultDays = rangeKey === "1d" ? 1 : rangeKey === "2d" ? 2 : rangeKey === "1w" ? 7 : rangeKey === "1m" ? 30 : rangeKey === "1y" ? 365 : 365 * 3;
    const start = (earliest < now) ? earliest : (now - defaultDays * 24 * 3600 * 1000);
    let points = 180;
    if (rangeKey === "1d") points = 48;
    if (rangeKey === "2d") points = 96;
    if (rangeKey === "1w") points = 56;
    if (rangeKey === "1m") points = 90;
    if (rangeKey === "1y") points = 180;
    if (rangeKey === "all") points = 200;

    const txsByAsset = {};
    txs.slice().forEach(t => {
      if (!txsByAsset[t.assetId]) txsByAsset[t.assetId] = [];
      txsByAsset[t.assetId].push(t);
    });

    const syntheticTxs = [];
    rowsForChart.forEach(r => {
      const assetTxs = txsByAsset[r.id] || [];
      if ((assetTxs.length === 0) && (toNum(r.shares || 0) > 0)) {
        syntheticTxs.push({
          id: `synth:${r.id}:${r.purchaseDate || r.createdAt || Date.now()}`,
          assetId: r.id,
          assetType: r.type,
          symbol: r.symbol,
          type: "buy",
          qty: toNum(r.shares || 0),
          pricePerUnit: toNum(r.avgPrice || 0),
          cost: toNum(r.investedUSD || 0),
          date: r.purchaseDate || r.createdAt || Date.now(),
        });
      }
    });

    const allTxs = txs.concat(syntheticTxs).sort((a,b) => (a.date || 0) - (b.date || 0));
    const pointsArr = [];
    const startTime = start;
    const endTime = now;
    for (let pi = 0; pi < points; pi++) {
      const t = startTime + Math.floor((pi / (points - 1 || 1)) * (endTime - startTime));
      pointsArr.push({ t, all: 0, crypto: 0, stock: 0, nonliquid: 0 });
    }

    function findIndexFor(t) {
      if (t <= startTime) return 0;
      if (t >= endTime) return pointsArr.length - 1;
      const f = (t - startTime) / (endTime - startTime);
      return Math.floor(f * (pointsArr.length - 1));
    }

    // baseline: market snapshot per asset interpolated from current marketValueUSD (we will simulate)
    const lastValues = {};
    rowsForChart.forEach(r => lastValues[r.id] = toNum(r.marketValueUSD || 0));

    // apply txs cumulatively across timeline (approx)
    let cumulativeByAsset = {};
    rowsForChart.forEach(r => cumulativeByAsset[r.id] = { shares: toNum(r.shares || 0), invested: toNum(r.investedUSD || 0) });

    // Simplified approach: at each sample point, set all = sum of lastValues (snapshot)
    for (let i = 0; i < pointsArr.length; i++) {
      const snapMarket = rowsForChart.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
      pointsArr[i].all = snapMarket;
      pointsArr[i].crypto = rowsForChart.filter(r => r.type === "crypto").reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
      pointsArr[i].stock = rowsForChart.filter(r => r.type === "stock").reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
      pointsArr[i].nonliquid = rowsForChart.filter(r => r.type === "nonliquid").reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    }

    return {
      all: pointsArr.map(p => ({ t: p.t, v: p.all })),
      crypto: pointsArr.map(p => ({ t: p.t, v: p.crypto })),
      stock: pointsArr.map(p => ({ t: p.t, v: p.stock })),
      nonliquid: pointsArr.map(p => ({ t: p.t, v: p.nonliquid })),
    };
  }

  /* build multiSeries for CandlesWithLines (memoized) */
  const multiSeries = useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  /* asset chart modal state */
  const [assetChartOpen, setAssetChartOpen] = useState(false);
  const [chartAsset, setChartAsset] = useState(null);

  function openAssetChart(a) {
    setChartAsset(a);
    setAssetChartOpen(true);
  }
  function closeAssetChart() {
    setAssetChartOpen(false);
    setChartAsset(null);
  }

  /* export/import and UI rendering */
  return (
    <div className="p-4">
      {/* HEADER: totals + add button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <div className="text-sm text-gray-400">Overview</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={() => setCurrencyMenuOpen(v => !v)} className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 border border-gray-800 rounded">
              <span className="text-sm font-medium">{displayCcy === "IDR" ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(totals.market * usdIdr)} IDR`
                    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(totals.market)} USD`}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" className="ml-1" fill="none">
                <path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {currencyMenuOpen && (
              <div ref={currencyMenuRef} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-36">
                <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
              </div>
            )}
          </div>

          {/* ADD floating button */}
          <button
            aria-label="Add asset"
            onClick={() => setOpenAdd(v => !v)}
            className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn`}
            title="Add asset"
          >
            <span style={{ display: "inline-block", transformOrigin: "50% 50%", transition: "transform 220ms" }} className={openAdd ? "rotate-open" : ""}>
              +
            </span>
          </button>
        </div>
      </div>

      {/* SUBHEADER */}
      <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
        {isInitialLoading && assets.length > 0 ? (
          <>
            <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Loading portfolio data...</span>
          </>
        ) : ( lastTick &&
          <>
            <span>Updated: {new Date(lastTick).toLocaleString()}</span>
            <span>•</span>
            <span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ?
              <span className="text-gray-400">…</span> : <span>{new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(usdIdr)}</span>}</span>
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-center">
        <div className="flex justify-between text-gray-400">
          <div>Invested (Deposits)</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Market</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Gain P&L</div>
          <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")} ({totals.pnlPct.toFixed(2)}%)</div>
        </div>
        <div className="flex items-center justify-between text-gray-400">
          <div>Trading Balance</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(tradingBalanceUSD * usdIdr, "IDR") : fmtMoney(tradingBalanceUSD, "USD")}</div>
        </div>
      </div>

      {/* ADD PANEL */}
      {openAdd && (
        <div ref={addPanelRef} className="mt-6 bg-transparent p-3 rounded">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex bg-gray-900 rounded overflow-hidden">
              {/* CHANGES: Deposit tab added first (leftmost) */}
              <button onClick={() => { setSearchMode("deposit"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "deposit" ? "bg-gray-800" : ""} btn-soft`}>Deposit</button>
              <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""} btn-soft`}>Crypto</button>
              <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""} btn-soft`}>Stocks ID/US</button>
              <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""} btn-soft`}>Non-Liquid</button>
            </div>
          </div>

          {searchMode === "deposit" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-xs text-gray-400">Deposit IDR</label>
                <input value={depositIDR} onChange={(e) => setDepositIDR(e.target.value)} placeholder="e.g. 1,000,000" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <div className="text-xs text-gray-500 mt-1">OR</div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Deposit USD</label>
                <input value={depositUSD} onChange={(e) => setDepositUSD(e.target.value)} placeholder="e.g. 100" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => {
                  const idr = toNum(depositIDR);
                  const usd = toNum(depositUSD);
                  if (idr <= 0 && usd <= 0) { alert("Enter IDR or USD amount"); return; }
                  const amtUSD = usd + (idr > 0 ? (idr / (usdIdr || 1)) : 0);
                  performDeposit({ amountUSD: amtUSD, sourceLabel: "Deposit (manual)" });
                  setDepositIDR(""); setDepositUSD("");
                }} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Deposit</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
              </div>
            </div>
          ) : searchMode !== "nonliquid" ? (
            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                        <div>
                          <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                          <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange || ''}`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option> <option value="IDR">IDR</option>
              </select>
              <div className="flex items-center gap-2">
                {/* CHANGES: removed plain Add button; only Add Assets (green) + Close */}
                <button onClick={addAssetWithInitial} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Assets</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">Name (Land, Art, Rolex.)</label>
                <input value={nlName} onChange={(e) => setNlName(e.target.value)} placeholder="e.g. Land, Art, Rolex" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Quantity</label>
                <input value={nlQty} onChange={(e) => setNlQty(e.target.value)} placeholder="1" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Price (per unit)</label>
                <input value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Currency</label>
                <select value={nlPriceCcy} onChange={(e) => setNlPriceCcy(e.target.value)} className="w-full rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option>
                  <option value="IDR">IDR</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Purchase date</label>
                <input type="date" value={nlPurchaseDate} onChange={(e) => setNlPurchaseDate(e.target.value)} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div>
                <label className="text-xs text-gray-400">YoY gain (%)</label>
                <input value={nlYoy} onChange={(e) => setNlYoy(e.target.value)} placeholder="5" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-400">Description (optional: address, serial.)</label>
                <input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} placeholder="Optional description" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Non-Liquid</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TABLE + SORT
          IMPORTANT: container uses overflow-x:auto but overflow-y:visible so dropdown won't be clipped.
      */}
      <div className="mt-6" style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-400">Assets</div>
          <div className="flex items-center gap-2 relative">
            <button
              aria-label="Sort"
              onClick={() => setSortMenuOpen(v => !v)}
              className="inline-flex items-center justify-center rounded px-2 py-1 bg-gray-900 border border-gray-800 text-gray-200 btn"
              title="Sort assets"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6h12" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M9 12h6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M11 18h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {sortMenuOpen && (
              <div ref={sortMenuRef} className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-56 z-40 menu-scroll">
                <button onClick={() => { setSortBy("market_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Value (high → low)</button>
                <button onClick={() => { setSortBy("invested_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Invested (high → low)</button>
                <button onClick={() => { setSortBy("pnl_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">P&L (high → low)</button>
                <button onClick={() => { setSortBy("symbol_asc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Symbol (A → Z)</button>
                <button onClick={() => { setSortBy("newest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Newest</button>
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
            ) : sortedRows.map((r) => (
              <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                <td className="px-3 py-3">
                  <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openAssetChart(r)}>{r.symbol}</div>
                  <div className="text-xs text-gray-400">{r.description || r.name}</div>
                </td>
                <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>

                {/* Invested (top big) / Avg price (small) */}
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                  <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                </td>

                {/* Market value (top big) / Current Price (small) */}
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                  <div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? (displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")) : "-"}</div>
                </td>

                {/* P&L */}
                <td className="px-3 py-3 text-right">
                  <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                  <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                </td>

                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openTradeModal(r.id, 'buy')} className="px-2 py-1 rounded bg-emerald-600 text-black text-xs">Buy</button>
                    <button onClick={() => openTradeModal(r.id, 'sell')} className="px-2 py-1 rounded bg-yellow-600 text-white text-xs">Sell</button>
                    <button onClick={() => removeAsset(r.id)} className="px-2 py-1 rounded bg-gray-800 text-xs">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DONUT ALLOCATION: placed BELOW asset table (CHANGES: as requested) */}
      {filteredRows.length > 0 && (
        <div className="mt-6">
          <div className="bg-gray-900 p-4 rounded border border-gray-800 flex flex-col md:flex-row items-start gap-6">
            <div className="flex items-center justify-center" style={{ minWidth: 220 }}>
              <CakeAllocation
                data={donutData}
                size={200}
                inner={48}
                gap={0.03}
                displayTotal={displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}
                displayCcy={displayCcy}
                usdIdr={usdIdr}
              />
            </div>

            <div className="flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {donutData.map((d, i) => {
                  const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <div style={{ width: 10, height: 10, background: colorForIndex(i) }} className="rounded-full" />
                      <div>
                        <div className="font-semibold text-gray-100 text-sm">{d.name}</div>
                        <div className="text-xs text-gray-400">
                          {displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTFOLIO GROWTH */}
      <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Portfolio Growth</div>
          <div className="flex items-center gap-2">
            {["1d","2d","1w","1m","1y","all"].map(k => (
              <button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300"} btn`}>{k}</button>
            ))}
          </div>
        </div>

        <CandlesWithLines
          seriesMap={multiSeries}
          displayCcy={displayCcy}
          usdIdr={usdIdr}
          width={900}
          height={300}
          rangeKey={chartRange}
          onHover={(p) => { setChartHover(p); }}
        />
      </div>

      {/* EXPORT / CSV */}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={exportAllCSV} className="bg-gray-800 px-3 py-2 rounded btn">Export CSV</button>
        <label className="bg-gray-800 px-3 py-2 rounded btn cursor-pointer">
          Import CSV
          <input type="file" accept=".csv" onChange={onImportClick} style={{ display: "none" }} />
        </label>
      </div>

      {/* TRADE MODAL */}
      {tradeModal.open && (
        <TradeModal
          mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)}
          defaultPrice={tradeModal.defaultPrice} onClose={() => closeTradeModal()}
          onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} tradingBalanceUSD={tradingBalanceUSD}
        />
      )}

      {/* ASSET CHART MODAL (TradingView / CoinGecko fallback) */}
      {assetChartOpen && chartAsset && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[110] p-4">
          <div className="bg-gray-900 w-full max-w-4xl rounded p-4 border border-gray-800">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-lg font-semibold">{chartAsset.symbol} — {chartAsset.name}</h3>
                <div className="text-xs text-gray-400">{chartAsset.type}</div>
              </div>
              <button onClick={closeAssetChart} className="text-gray-400">×</button>
            </div>

            <div style={{ height: 420 }}>
              {/* Try TradingView embed by symbol; fallback to coingecko page */}
              {chartAsset.type === "stock" ? (
                <iframe title="tv-widget" src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(chartAsset.symbol)}&interval=D&symboledit=1&saveimage=1`} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : chartAsset.type === "crypto" && chartAsset.coingeckoId ? (
                // Try tradingview symbol as COINBASE:SYMBOLUSD or fallback to coingecko
                <iframe title="tv-crypto" src={`https://s.tradingview.com/widgetembed/?symbol=COINBASE:${encodeURIComponent((chartAsset.symbol || "") + "USD")}`} style={{ width: "100%", height: "100%", border: 0 }} onError={(e)=>{}}/>
              ) : (
                <iframe title="coingecko" src={`https://www.coingecko.com/en/coins/${encodeURIComponent(chartAsset.coingeckoId || chartAsset.symbol)}/usd`} style={{ width: "100%", height: "100%", border: 0 }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}