// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 *
 * Single-file Portfolio Dashboard — FINAL update:
 * - Portfolio Growth chart above donut: more detailed, interactive, moving average, grid, axes, hover
 * - Stocks: try Finnhub per-symbol first, fallback to Yahoo bulk
 * - Keep all previous behaviors: transactions, non-liquid assets, export/import, etc.
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
    type: a.type || "stock", // crypto | stock | nonliquid
  };
}

/* deterministic hash -> number for reproducible noise per symbol */
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* seeded pseudo-random generator */
function seededRng(seed) {
  let s = seed >>> 0;
  return function () {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

/* ===================== DONUT SVG ===================== */
function Donut({ data = [], size = 180, inner = 60 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 6;
  let start = -90;
  const colors = [
    "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF9CEE",
    "#B28DFF", "#FFB26B", "#6BFFA0", "#FF6BE5", "#00C49F",
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const portion = Math.max(0, d.value || 0) / total;
        const angle = portion * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sRad = (Math.PI * start) / 180;
        const eRad = (Math.PI * end) / 180;
        const x1 = cx + r * Math.cos(sRad), y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad), y2 = cy + r * Math.sin(eRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return (
          <path
            key={i}
            d={path}
            fill={colors[i % colors.length]}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth="0.6"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ===================== ENHANCED PORTFOLIO CHART ===================== */
function EnhancedPortfolioChart({ series = [], width = 800, height = 200, onHover }) {
  // series: [{t, v}, ...] chronological
  const padding = { left: 48, right: 12, top: 12, bottom: 28 };
  const w = width;
  const h = height;
  if (!series || series.length === 0) return <div className="text-xs text-gray-500">No chart data</div>;
  const vals = series.map(s => s.v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = Math.max(1e-8, max - min);
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  // compute points
  const points = series.map((s, i) => {
    const x = padding.left + (i / (series.length - 1)) * innerW;
    const y = padding.top + (1 - (s.v - min) / range) * innerH;
    return { x, y, t: s.t, v: s.v };
  });

  // compute SMA (window 7)
  const smaWindow = Math.max(3, Math.round(points.length / 30));
  const sma = points.map((p, i) => {
    const start = Math.max(0, i - smaWindow + 1);
    const seg = points.slice(start, i + 1);
    const avg = seg.reduce((s, q) => s + q.v, 0) / seg.length;
    return { x: p.x, y: padding.top + (1 - (avg - min) / range) * innerH, v: avg, t: p.t };
  });

  const areaPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") +
    ` L ${points[points.length - 1].x.toFixed(2)} ${padding.top + innerH} L ${points[0].x.toFixed(2)} ${padding.top + innerH} Z`;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const smaPath = sma.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  // y ticks (5)
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const v = min + (i / 4) * range;
    const y = padding.top + (1 - (v - min) / range) * innerH;
    yTicks.push({ v, y });
  }

  // hover state
  const [hoverIndex, setHoverIndex] = useState(null);

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // find closest point
    let best = 0, bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHoverIndex(best);
    if (onHover) onHover(points[best]);
  }
  function handleLeave() {
    setHoverIndex(null);
    if (onHover) onHover(null);
  }

  return (
    <div className="w-full overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        onMouseMove={handleMove} onMouseLeave={handleLeave}>
        {/* background */}
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        {/* grid horizontal */}
        {yTicks.map((t, i) => (
          <line key={i} x1={padding.left} x2={w - padding.right} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        ))}
        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={padding.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{fmtMoney(t.v, "USD")}</text>
        ))}

        <defs>
          <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4D96FF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#4D96FF" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* area */}
        <path d={areaPath} fill="url(#areaGrad)" stroke="none" />

        {/* main line */}
        <path d={linePath} stroke="#4D96FF" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>

        {/* sma line */}
        <path d={smaPath} stroke="#FFD93D" strokeWidth="1.6" fill="none" strokeDasharray="6 4" />

        {/* points on hover */}
        {hoverIndex !== null && points[hoverIndex] && (
          <>
            <line x1={points[hoverIndex].x} y1={padding.top} x2={points[hoverIndex].x} y2={padding.top + innerH} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <circle cx={points[hoverIndex].x} cy={points[hoverIndex].y} r="4.5" fill="#fff" />
            <circle cx={points[hoverIndex].x} cy={points[hoverIndex].y} r="3.1" fill="#4D96FF" />
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
      return raw;
    } catch {
      return [];
    }
  };
  const [transactions, setTransactions] = useState(loadTransactions);

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- add/search state ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | id | us | nonliquid
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  // non-liquid add fields
  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5"); // percent per year
  const [nlDesc, setNlDesc] = useState("");

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- filter & UI ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all"); // all | crypto | stock | nonliquid
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  /* ---------- transactions / undo ---------- */
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* ---------- chart timeframe ---------- */
  const [chartRange, setChartRange] = useState("all"); // 1d,2d,1w,1m,1y,all
  const [chartHover, setChartHover] = useState(null);

  /* ---------- persist to localStorage ---------- */
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

  /* ===================== SEARCH (same) ===================== */
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
          } catch (e) {
            // continue
          }
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

  /* ===================== POLLING PRICES ===================== */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  // Crypto polling
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
      } catch (e) {
        // silent
      }
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // Stocks polling: FINNHUB per-symbol first, fallback to Yahoo bulk when missing
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

        // Try Finnhub per-symbol first
        for (const s of symbols) {
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) {
              // try variant without .JK or with IDX prefix might be attempted by server itself; we'll just skip here
              continue;
            }
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
                map[s] = { symbol: s, priceRaw: current, priceUSD, _source: "finnhub", currency: looksLikeId ? "IDR" : js?.currency || "USD" };
              }
            }
          } catch (e) {
            // ignore per-symbol error
          }
        }

        // If some symbols still missing, try Yahoo bulk for those
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
          } catch (e) {
            // ignore
          }
        }

        // Apply updates only for positive prices; convert IDR to USD when required
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
            if (priceUSD > 0 && Number.isFinite(priceUSD)) {
              return ensureNumericAsset({ ...a, lastPriceUSD: priceUSD, marketValueUSD: priceUSD * toNum(a.shares || 0) });
            }
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) {
        // silent
      }
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  /* FX for IDR */
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
      } catch (e) {
        // silent
      } finally {
        if (mounted) setFxLoading(false);
      }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ===================== NON-LIQUID helpers ===================== */
  function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, targetTime = Date.now()) {
    // Compute price at targetTime using compounding
    const years = Math.max(0, (targetTime - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
    const r = toNum(yoyPercent) / 100;
    const last = avgPriceUSD * Math.pow(1 + r, years);
    return last;
  }

  /* ===================== TRANSACTION EFFECTS HELPERS ===================== */
  function applyTransactionEffects(tx) {
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
      // if asset not present, create
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

  /* ===================== ADD ASSET ===================== */
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
    setAssets(prev => [...prev, asset]);
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

  /* ===================== BUY / SELL (record transactions) ===================== */
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

    applyTransactionEffects(tx); // this will decrease shares and increase realized
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    closeTradeModal();
  }

  /* ===================== TRANSACTIONS: delete / restore / undo ===================== */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Delete & CANCEL transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || (tx.cost/tx.qty))})? This will reverse its effect and can be undone.`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }

  function restoreTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Restore (reverse) transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || (tx.cost/tx.qty))})?`)) return;
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

  /* ===================== EDIT / DELETE ASSET ===================== */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ===================== computed rows & totals ===================== */
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
    const invested = toNum(aa.investedUSD || 0);
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

  const totals = useMemo(() => {
    const invested = filteredRows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows]);

  /* ===================== donut data ===================== */
  const donutData = useMemo(() => {
    const sortedRows = filteredRows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sortedRows.slice(0, 4);
    const other = sortedRows.slice(4);
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

  /* ===================== CSV export/import ===================== */
  function exportCSV() {
    const headers = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","createdAt","purchaseDate","nonLiquidYoy"];
    const lines = [headers.join(",")];
    assets.forEach(a => {
      const aa = ensureNumericAsset(a);
      const row = headers.map(h => {
        const v = aa[h];
        if (typeof v === "string" && v.includes(",")) return `"${v.replace(/"/g, '""')}"`;
        return (v === undefined || v === null) ? "" : String(v);
      }).join(",");
      lines.push(row);
    });
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr},transactions=${transactions.length}`);
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function handleImportFile(file, { merge = true } = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return alert("Empty file");
      const header = lines[0].split(",").map(h => h.replace(/^"|"$/g,"").trim());
      const dataLines = lines.slice(1).filter(l => !l.startsWith("#META"));
      const imported = dataLines.map(line => {
        const values = [];
        let cur = "";
        let insideQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
          if (ch === '"') { insideQuote = !insideQuote; continue; }
          if (ch === "," && !insideQuote) { values.push(cur); cur = ""; continue; }
          cur += ch;
        }
        values.push(cur);
        const obj = {};
        header.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
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
          createdAt: toNum(obj.createdAt) || Date.now(),
          purchaseDate: toNum(obj.purchaseDate) || undefined,
          nonLiquidYoy: toNum(obj.nonLiquidYoy) || 0,
        };
        return ensureNumericAsset(parsed);
      });
      const metaLine = lines.find(l => l.startsWith("#META"));
      if (metaLine) {
        try {
          const m = metaLine.replace(/^#META,?/, "");
          const parts = m.split(",");
          parts.forEach(p => {
            const [k,v] = p.split("=");
            if (k === "realizedUSD") setRealizedUSD(toNum(v));
            if (k === "displayCcy" && v) setDisplayCcy(String(v));
            if (k === "usdIdr") setUsdIdr(toNum(v));
          });
        } catch (e) { /* ignore */ }
      }
      if (merge) {
        const map = {};
        assets.forEach(a => map[a.symbol] = ensureNumericAsset(a));
        imported.forEach(i => map[i.symbol] = ensureNumericAsset(i));
        const merged = Object.values(map);
        setAssets(merged);
      } else {
        setAssets(imported);
      }
      alert("Import complete");
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

  /* ===================== CHART SERIES BUILD (enhanced, non-flat) ===================== */
  function buildChartSeries(rowsForChart, rangeKey) {
    let points = 180;
    let days = 365 * 3; // default all ~3y
    if (rangeKey === "1d") { points = 48; days = 1; } // half-hourish sampling
    if (rangeKey === "2d") { points = 96; days = 2; }
    if (rangeKey === "1w") { points = 56; days = 7; }
    if (rangeKey === "1m") { points = 90; days = 30; }
    if (rangeKey === "1y") { points = 180; days = 365; }
    if (rangeKey === "all") { points = 200; days = 365 * 3; }

    const now = Date.now();
    const start = now - days * 24 * 3600 * 1000;
    const series = [];

    // Precompute per-asset seed and price curve endpoints
    const assetCurves = rowsForChart.map((r) => {
      const seed = hashStringToSeed(r.symbol + String(r.createdAt || ""));
      const rng = seededRng(seed);
      const shares = toNum(r.shares || 0);
      const avg = toNum(r.avgPrice || 0);
      const last = toNum(r.lastPriceUSD || avg || 0);
      // volatility factor: crypto > stock > nonliquid
      const volBase = r.type === "crypto" ? 0.12 : (r.type === "stock" ? 0.04 : 0.01);
      return { symbol: r.symbol, shares, avg, last, rng, volBase, purchaseDate: r.purchaseDate || r.createdAt || now };
    });

    for (let i = 0; i < points; i++) {
      const t = start + (i / (points - 1)) * (now - start);
      let total = 0;
      assetCurves.forEach(ac => {
        if (ac.shares <= 0) return;
        // determine base price at time t: linear interpolation from avg(at purchaseDate) -> last (now)
        const pd = ac.purchaseDate || start;
        const progress = Math.min(1, Math.max(0, (t - start) / (now - start))); // global progress
        // incorporate age weighting: older assets should have more of last reflected earlier
        const ageWeight = Math.min(1, Math.max(0, (t - pd) / (now - pd + 1)));
        const base = ac.avg + (ac.last - ac.avg) * (ageWeight * progress);
        // deterministic noise: small sine + seeded random
        const noise = (Math.sin((i + ac.rng() * 100) / Math.max(6, 20 * ac.volBase)) * 0.3 + (ac.rng() - 0.5)) * ac.volBase;
        const priceT = Math.max(0, base * (1 + noise));
        total += ac.shares * priceT;
      });
      series.push({ t, v: total });
    }
    return series;
  }

  const chartSeries = useMemo(() => buildChartSeries(filteredRows, chartRange), [filteredRows, chartRange]);

  /* ===================== RENDER ===================== */
  const titleForFilter = {
    all: "All Portfolio",
    crypto: "Crypto Portfolio",
    stock: "Stocks Portfolio",
    nonliquid: "Non-Liquid Portfolio",
  };
  const headerTitle = titleForFilter[portfolioFilter] || "Portfolio";

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 relative">
            <h1 className="text-2xl font-semibold">{headerTitle}</h1>

            {/* styled dropdown box (non-transparent) */}
            <div className="relative">
              <button
                aria-label="Filter"
                onClick={() => setFilterMenuOpen(v => !v)}
                className="ml-2 inline-flex items-center justify-center rounded px-2 py-1 bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
                style={{ fontSize: 16, lineHeight: 1 }}
              >
                ▾
              </button>

              {filterMenuOpen && (
                <div className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-40">
                  <button onClick={() => { setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                  <button onClick={() => { setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                  <button onClick={() => { setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                  <button onClick={() => { setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Display</div>
            <div className="text-lg font-semibold">
              {displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}
            </div>
            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
            </select>
            <button onClick={() => setOpenAdd(v => !v)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold">+</button>
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
              <span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? (
                <svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : usdIdr?.toLocaleString()}</span>
            </>
          )}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-center">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
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
          <div className="flex items-center justify-between text-gray-400 cursor-pointer" onClick={() => setTransactionsOpen(true)}>
            <div className="flex items-center gap-2">
              <div>Realized P&L</div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}</div>
              {/* small slanted arrow inside small box to indicate clickable */}
              <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M6 14 L14 6" stroke={realizedUSD >= 0 ? "#34D399" : "#F87171"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M14 6 v8 h-8" stroke={realizedUSD >= 0 ? "#34D399" : "#F87171"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* PORTFOLIO GROWTH (above donut) */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(k => (
                <button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300"}`}>{k}</button>
              ))}
            </div>
          </div>

          <EnhancedPortfolioChart series={chartSeries} width={800} height={220} onHover={(p) => setChartHover(p)} />
          <div className="mt-2 text-xs text-gray-400 flex items-center justify-between">
            <div>{chartHover ? new Date(chartHover.t).toLocaleString() : ""}</div>
            <div className="font-medium">{chartHover ? (displayCcy === "IDR" ? fmtMoney((chartHover.v || 0) * usdIdr, "IDR") : fmtMoney(chartHover.v || 0, "USD")) : ""}</div>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
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
              {filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100">{r.symbol}</div>
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
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* DONUT + LEGEND */}
        {filteredRows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 flex items-center justify-center">
              <Donut data={donutData.map(d => ({ name: d.name, value: d.value }))} size={120} inner={40} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {donutData.map((d, i) => {
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      {d.name === "Other" ? (
                        <div className="text-xs text-gray-400">
                          {d.symbols.join(', ')} <br/>
                          {displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">
                          {displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TRADE MODAL */}
        {tradeModal.open && (
          <TradeModal
            mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)}
            defaultPrice={tradeModal.defaultPrice} onClose={() => closeTradeModal()}
            onBuy={performBuy} onSell={performSell} usdIdr={usdIdr}
          />
        )}

        {/* TRANSACTIONS MODAL */}
        {transactionsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120]">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-3xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">Transactions</div>
                  <div className="text-xs text-gray-400">{transactions.length} records</div>
                </div>
                <div className="flex items-center gap-2">
                  {lastDeletedTx && (
                    <button onClick={() => undoLastDeletedTransaction()} className="bg-amber-500 px-3 py-1 rounded text-sm">Undo Delete</button>
                  )}
                  <button onClick={() => { setTransactionsOpen(false); purgeLastDeletedTransaction(); }} className="bg-gray-800 px-3 py-1 rounded">Close</button>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="text-sm text-gray-500">No transactions yet.</div>
              ) : (
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
                      {transactions.map(tx => (
                        <tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                          <td className="px-3 py-3">{new Date(tx.date).toLocaleString()}</td>
                          <td className="px-3 py-3">{tx.symbol} <div className="text-xs text-gray-400">{tx.name}</div></td>
                          <td className="px-3 py-3 text-right">{Number(tx.qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td className="px-3 py-3 text-right">
                            {tx.type === "sell" ? (displayCcy === "IDR" ? fmtMoney(tx.proceeds * usdIdr, "IDR") : fmtMoney(tx.proceeds, "USD")) : (displayCcy === "IDR" ? fmtMoney(tx.cost * usdIdr, "IDR") : fmtMoney(tx.cost, "USD"))}
                            <div className="text-xs">{tx.pricePerUnit ? `${fmtMoney(tx.pricePerUnit, "USD")} / unit` : ""}</div>
                          </td>
                          <td className="px-3 py-3 text-right">{tx.type === "sell" ? (displayCcy === "IDR" ? fmtMoney(tx.realized * usdIdr, "IDR") : fmtMoney(tx.realized, "USD")) : "-"}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { restoreTransaction(tx.id); }} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Restore</button>
                              <button onClick={() => deleteTransaction(tx.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Delete</button>
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
                    <button onClick={() => undoLastDeletedTransaction()} className="bg-emerald-500 px-3 py-1 rounded text-sm">Undo</button>
                    <button onClick={() => purgeLastDeletedTransaction()} className="bg-gray-700 px-3 py-1 rounded text-sm">Forget</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXPORT / IMPORT CSV */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (merge or replace)</div>
            <div className="text-xs text-gray-500">Export includes portfolio rows + metadata (realized, displayCcy, usdIdr).</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="bg-blue-600 px-3 py-2 rounded font-semibold">Export CSV</button>
            <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={() => {
              if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return;
              setAssets([]); setRealizedUSD(0); setTransactions([]); setLastDeletedTx(null);
            }} className="bg-red-600 px-3 py-2 rounded font-semibold">Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}