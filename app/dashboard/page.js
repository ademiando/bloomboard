// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Portfolio Dashboard — single-file page.js (final rewrite)
 *
 * Features implemented (focused and robust):
 * - Single-file React client component (Next.js app route friendly: "use client" top)
 * - Persistent assets & transactions in localStorage
 * - Price polling:
 *   - Crypto: CoinGecko (bulk)
 *   - Stocks: Alphavantage for .JK (if API key provided), then Finnhub proxy, then Yahoo fallback
 * - Asset charts: TradingView embedded widget for assets when possible.
 *   - For cryptos: try TradingView symbol mapping first (e.g., BINANCE:BTCUSD, COINBASE:BTCUSD).
 *   - If TradingView is not available for a crypto, fallback to a CoinGecko mini chart.
 * - Non-liquid assets support (custom assets like Land, Art, Rolex) with YoY growth projection
 * - Toggle values (eye) to hide numeric values but keep percent returns visible
 * - Share button generates a downloadable PNG that respects eye state (value suppressed or included)
 * - Cake-like allocation chart (interactive hover) showing proportion and total in center
 * - Portfolio growth chart (candlestick-like simplified + multi-line series) with timeframes
 * - Export/Import combined CSV (assets + transactions) with BOM and ISO dates for spreadsheet friendliness
 * - Transactions log with restore (undo) and delete
 * - UI: filter/sort dropdowns, animated add button (+ -> ×), hover effects
 *
 * Notes:
 * - For Alphavantage: set `window.ALPHA_VANTAGE_KEY` or localStorage 'alpha_vantage_key'
 * - For Finnhub / Yahoo proxies: URLs assume server proxy routes exist as in original file (/api/finnhub/quote, /api/yahoo/quote)
 *
 * This file is intended to replace your existing page.js — upload manually to GitHub as requested.
 */

/* ===================== CONFIG/ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_PRICE = (ids) =>
  `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_SEARCH = (q) => `${COINGECKO_API}/search?query=${encodeURIComponent(q)}`;
const COINGECKO_COIN_CHART = (id, days = 30) =>
  `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;

// Server-side proxy endpoints (same as original project)
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const ALPHAVANTAGE_GLOBAL_QUOTE = (symbol, key) =>
  `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;

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
const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
function colorForIndex(i){ return palette[i % palette.length]; }

/* ===================== SMALL UI & MATH UTILITIES ===================== */
function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent, targetTime = Date.now()) {
  const years = Math.max(0, (targetTime - (purchaseDateMs || Date.now())) / (365.25 * 24 * 3600 * 1000));
  const r = toNum(yoyPercent) / 100;
  const last = avgPriceUSD * Math.pow(1 + r, years);
  return last;
}

/* ===================== CAKE ALLOCATION (interactive) ===================== */
function CakeAllocation({ data = [], size = 220, inner = 56, gap = 0.04, displayTotal = "", displayCcy = "USD", usdIdr = 16000 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const maxOuter = size / 2 - 6;
  const minOuter = inner + 8;
  const maxValue = Math.max(...data.map(d => Math.max(0, d.value || 0)), 1);
  const scaleOuter = (v) => {
    if (!v || v <= 0) return inner + 6;
    const frac = v / maxValue;
    return Math.round(minOuter + frac * (maxOuter - minOuter));
  };

  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, html: "" });
  const wrapRef = useRef(null);

  const formatForDisplayCcy = (v) => {
    if (displayCcy === "IDR") return fmtMoney((v || 0) * usdIdr, "IDR");
    return fmtMoney(v || 0, "USD");
  };

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

  let start = -Math.PI / 2;
  const arcs = data.map((d) => {
    const portion = Math.max(0, d.value || 0) / total;
    const angle = portion * Math.PI * 2;
    const end = start + angle;
    const rOuter = scaleOuter(d.value || 0);
    const arc = { start, end, outer: rOuter };
    start = end;
    return arc;
  });

  const onMouseEnter = (i, ev, d) => {
    setHoverIndex(i);
    const rect = wrapRef.current?.getBoundingClientRect();
    const px = (ev.clientX - (rect?.left || 0)) + 12;
    const py = (ev.clientY - (rect?.top || 0)) - 12;
    setTooltip({ show: true, x: px, y: py, html: `${d.name} • ${formatForDisplayCcy(d.value)}` });
  };
  const onMouseMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const px = (e.clientX - (rect?.left || 0)) + 12;
    setTooltip(t => ({ ...t, x: px }));
  };
  const onMouseLeave = () => { setHoverIndex(null); setTooltip({ show:false, x:0,y:0, html:"" }); };

  return (
    <div ref={wrapRef} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const arc = arcs[i];
          const gapAngle = Math.min(arc.end - arc.start, gap);
          const s = arc.start + gapAngle/2;
          const e = arc.end - gapAngle/2;
          const path = arcPath(cx, cy, inner, arc.outer, s, e);
          const isHover = hoverIndex === i;
          const mid = (s + e) / 2;
          const transform = isHover ? `translate(${Math.cos(mid) * 6},${Math.sin(mid) * 6})` : undefined;
          return (
            <g key={i} transform={transform}>
              <path
                d={path}
                fill={colorForIndex(i)}
                stroke="#000"
                strokeWidth={isHover ? 1.6 : 0.6}
                onMouseEnter={(ev) => onMouseEnter(i, ev, d)}
                onMouseMove={(ev) => onMouseMove(ev)}
                onMouseLeave={onMouseLeave}
                className="slice"
                style={{ transition: "transform 160ms ease, stroke-width 120ms" }}
              />
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r={inner - 6} fill="#070707" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="12" fontWeight={700} fill="#E5E7EB">
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
        transition: "opacity 140ms",
        whiteSpace: "nowrap",
        zIndex: 40
      }}>
        {tooltip.html}
      </div>
    </div>
  );
}

/* ===================== SIMPLE CANDLES & MULTILINE (GROWTH) ===================== */
function CandlesWithLines({ seriesMap = {}, displayCcy = "USD", usdIdr = 16000, rangeKey = "all", onHover }) {
  const padding = { left: 56, right: 12, top: 12, bottom: 28 };
  const width = Math.min(1100, Math.max(700, typeof window !== "undefined" ? window.innerWidth - 160 : 900));
  const height = 320;
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

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
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * (range);
          const y = yOf(v);
          return <line key={i} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />;
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

/* ===================== TRADINGVIEW & COINGECKO CHART HELPERS ===================== */
function TradingViewWidget({ symbol = "AAPL", height = 420 }) {
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2,9)}`);
  useEffect(() => {
    if (!isBrowser) return;
    function mount() {
      try {
        if (window.TradingView && window.TradingView.widget) {
          // clear any previous widget content
          const ct = document.getElementById(idRef.current);
          if (ct) ct.innerHTML = "";
          // try to create widget
          new window.TradingView.widget({
            container_id: idRef.current,
            width: "100%",
            height,
            symbol,
            interval: "D",
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "en",
            toolbar_bg: "#1f2937",
            hide_side_toolbar: false,
          });
        }
      } catch (e) {
        // ignore
      }
    }
    if (!window.TradingView) {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = mount;
      document.body.appendChild(s);
    } else {
      mount();
    }
  }, [symbol, height]);
  return <div id={idRef.current} style={{ width: "100%", minHeight: height }} />;
}

function CryptoMiniChart({ coinId = "bitcoin", displayCcy="USD", usdIdr=16000, days = 30 }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let mounted = true;
    async function fetchChart() {
      try {
        const res = await fetch(COINGECKO_COIN_CHART(coinId, days));
        if (!res.ok) return;
        const j = await res.json();
        if (!mounted) return;
        const arr = (j.prices || []).map(p => ({ t: p[0], v: p[1] }));
        setData(arr);
      } catch (e) {}
    }
    fetchChart();
    return () => { mounted = false; };
  }, [coinId, days]);

  if (!data || data.length === 0) return <div className="text-xs text-gray-500">No chart</div>;

  const w = 700, h = 300, pad = 8;
  const vs = data.map(d => d.v);
  const min = Math.min(...vs), max = Math.max(...vs), range = Math.max(1e-8, max-min);
  const xOf = (i) => pad + (i/(data.length-1)) * (w - pad*2);
  const yOf = (v) => pad + (1 - (v - min)/range) * (h - pad*2);
  const path = data.map((p,i) => `${i===0 ? "M" : "L"} ${xOf(i).toFixed(2)} ${yOf(p.v).toFixed(2)}`).join(" ");
  const last = vs[vs.length-1];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <rect x="0" y="0" width={w} height={h} fill="#0b1220" />
        <path d={path} stroke="#FF6B6B" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 text-sm">{displayCcy==="IDR" ? fmtMoney(last*usdIdr,"IDR") : fmtMoney(last,"USD")}</div>
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
    } catch { return []; }
  };
  const [assets, setAssets] = useState(loadAssets);

  const loadTransactions = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_transactions_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw;
    } catch { return []; }
  };
  const [transactions, setTransactions] = useState(loadTransactions);

  const loadRealized = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem("pf_realized_v2") || 0);
    } catch { return 0; }
  };
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);

  const loadDisplayCcy = () => {
    try { if (!isBrowser) return "USD"; return localStorage.getItem("pf_display_ccy_v2") || "USD"; } catch { return "USD"; }
  };
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [valuesHidden, setValuesHidden] = useState(false);

  /* ---------- add/search ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  /* non-liquid fields */
  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* ---------- charts & asset chart modal ---------- */
  const [chartRange, setChartRange] = useState("all");
  const [assetChartOpen, setAssetChartOpen] = useState({ open: false, asset: null });

  /* ---------- filters & sorting ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [sortBy, setSortBy] = useState("market_desc");

  /* refs */
  const suggestionsRef = useRef(null);

  /* persist changes */
  useEffect(() => { try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions || [])); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {} }, [realizedUSD]);
  useEffect(() => { try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {} }, [displayCcy]);

  /* close suggestions when outside clicked */
  useEffect(() => {
    function onPointerDown(e) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) setSuggestions([]);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  /* ===================== SEARCH LOGIC ===================== */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "nonliquid") { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(COINGECKO_SEARCH(q));
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map((c) => ({
            id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name, source: "coingecko", type: "crypto"
          })));
          return;
        }
        // stocks: try yahoo proxy as before
        try {
          const res = await fetch(YAHOO_SEARCH(q));
          if (!res.ok) { setSuggestions([]); return; }
          const payload = await res.json();
          const rawList = payload.quotes || payload.result || payload.items || [];
          const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map(it => {
            const symbol = it.symbol || it.ticker || it.id || "";
            const display = it.shortname || it.shortName || it.longname || it.name || symbol;
            return { symbol: (symbol||"").toString().toUpperCase(), display, exchange: it.exchange || it.fullExchangeName || "", source: "yahoo", type: "stock" };
          });
          setSuggestions(list.slice(0, 30));
        } catch (e) { setSuggestions([]); }
      } catch (e) { setSuggestions([]); }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* ===================== FX (USD/IDR) via CoinGecko tether->idr ===================== */
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

  /* ===================== POLLING PRICES: COINGECKO for crypto, Alphavantage/Finnhub/Yahoo for stocks ===================== */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  // Poll crypto prices
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) return;
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
      } catch (e) {}
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Poll stocks
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 50);
        if (symbols.length === 0) return;

        let alphaKey = (isBrowser && (window.ALPHA_VANTAGE_KEY || localStorage.getItem('alpha_vantage_key'))) || null;
        const map = {};

        // Alphavantage for .JK symbols
        if (alphaKey) {
          const jkSymbols = symbols.filter(s => String(s||"").toUpperCase().endsWith(".JK"));
          for (const s of jkSymbols) {
            try {
              const url = ALPHAVANTAGE_GLOBAL_QUOTE(s.replace(".JK","") + ".JK", alphaKey);
              const r = await fetch(url);
              if (!r.ok) continue;
              const js = await r.json();
              const gq = js["Global Quote"] || js["Global_Quote"] || null;
              if (gq) {
                const priceRaw = toNum(gq["05. price"] ?? gq["05 price"] ?? gq["price"] ?? 0);
                if (priceRaw > 0) map[s] = { symbol: s, priceRaw, currency: "IDR", _source: "alphavantage" };
              }
            } catch (e) {}
          }
        }

        // Finnhub per-symbol
        for (const s of symbols) {
          if (map[s]) continue;
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) continue;
            const js = await res.json();
            const current = toNum(js?.c ?? js?.current ?? 0);
            if (current > 0) {
              const looksLikeId = String(s || "").toUpperCase().endsWith(".JK");
              let priceUSD = current;
              if (looksLikeId) {
                const fx = usdIdrRef.current || 1;
                priceUSD = fx > 0 ? (current / fx) : current;
              }
              map[s] = { symbol: s, priceRaw: current, priceUSD, _source: "finnhub", currency: looksLikeId ? "IDR" : js?.currency || "USD", fullExchangeName: js?.exchange || "" };
            }
          } catch (e) {}
        }

        // Yahoo fallback for missing
        const missing = symbols.filter(s => !map[s]);
        if (missing.length > 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(missing.join(",")));
            if (res.ok) {
              const j = await res.json();
              if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
                j.quoteResponse.result.forEach(q => {
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: price, currency: q.currency || "USD", fullExchangeName: q.fullExchangeName, _source: "yahoo" };
                });
              }
            }
          } catch (e) {}
        }

        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const q = map[a.symbol];
            const price = toNum(q.priceUSD ?? q.priceRaw ?? q.c ?? q.current ?? 0);
            const looksLikeId = (String(q.currency || "").toUpperCase() === "IDR") || String(a.symbol || "").toUpperCase().endsWith(".JK") || String(q.fullExchangeName || "").toUpperCase().includes("JAKARTA");
            let priceUSD = price;
            if (looksLikeId && price > 0) {
              const fx = usdIdrRef.current || 1;
              priceUSD = fx > 0 ? (price / fx) : price;
            }
            if (!(priceUSD > 0)) priceUSD = a.avgPrice || a.lastPriceUSD || 0;
            if (!priceUSD || priceUSD <= 0) priceUSD = a.avgPrice || a.lastPriceUSD || 0;
            return ensureNumericAsset({ ...a, lastPriceUSD: priceUSD, marketValueUSD: priceUSD * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
      } catch (e) {}
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ===================== ROWS / TOTALS / FILTER / SORT ===================== */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares || 0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || 0) || aa.avgPrice || 0;
      aa.marketValueUSD = toNum(aa.shares || 0) * aa.lastPriceUSD;
    }
    const invested = toNum(aa.investedUSD || 0);
    const market = aa.marketValueUSD || 0;
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: aa.lastPriceUSD, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets]);

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

  const totals = useMemo(() => {
    const invested = filteredRows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows]);

  const donutData = useMemo(() => {
    const sorted = filteredRows.slice().sort((a,b) => b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0,6);
    const other = sorted.slice(6);
    const otherTotal = other.reduce((s,r) => s + (r.marketValueUSD || 0), 0);
    const otherSymbols = other.map(r => r.symbol);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: otherSymbols });
    return data;
  }, [filteredRows]);

  /* ===================== ADD ASSET & NON-LIQUID ===================== */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId, type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(), name: s.display || s.name || s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, createdAt: Date.now(),
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
      if (searchMode === "crypto") picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed };
      else picked = { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
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

  /* ===================== BUY / SELL (modal) ===================== */
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
    // apply effects to assets
    setAssets(prev => prev.map(a => {
      if (a.id !== id) return ensureNumericAsset(a);
      const oldShares = toNum(a.shares || 0), oldInvested = toNum(a.investedUSD || 0);
      const newShares = oldShares + q, newInvested = oldInvested + cost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p });
    }));
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

    // apply sell effects
    setRealizedUSD(prev => prev + realized);
    setAssets(prev => {
      if (oldShares - q <= 0) return prev.filter(x => x.id !== id);
      return prev.map(x => x.id === id ? ensureNumericAsset({ ...x, shares: oldShares - q, investedUSD: Math.max(0, x.investedUSD - costOfSold), avgPrice: (oldShares - q) > 0 ? ((x.investedUSD - costOfSold)/(oldShares - q)) : 0, lastPriceUSD: p, marketValueUSD: (oldShares - q) * p }) : ensureNumericAsset(x));
    });
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    closeTradeModal();
  }

  /* ===================== TRANSACTION RESTORE / DELETE ===================== */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Delete transaction ${tx.symbol} ${tx.type} ${tx.qty}? This will reverse its effect.`)) return;
    // reverse effect
    if (tx.type === "buy") {
      setAssets(prev => prev.flatMap(a => {
        if (a.id !== tx.assetId) return [a];
        const oldShares = toNum(a.shares || 0);
        const newShares = Math.max(0, oldShares - tx.qty);
        const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.cost);
        if (newShares <= 0) return [];
        const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
        return [ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, marketValueUSD: newShares * (a.lastPriceUSD || newAvg) })];
      }));
    } else if (tx.type === "sell") {
      // for sells, reinstate shares and decrease realized
      setAssets(prev => {
        const found = prev.find(a => a.id === tx.assetId);
        if (found) {
          return prev.map(a => {
            if (a.id !== tx.assetId) return a;
            const newShares = toNum(a.shares || 0) + tx.qty;
            const newInvested = toNum(a.investedUSD || 0) + tx.costOfSold;
            const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
            return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, marketValueUSD: newShares * (a.lastPriceUSD || newAvg) });
          });
        } else {
          const asset = ensureNumericAsset({
            id: tx.assetId,
            type: tx.assetType || "stock",
            symbol: tx.symbol,
            name: tx.name || tx.symbol,
            shares: tx.qty,
            avgPrice: tx.costOfSold / (tx.qty || 1),
            investedUSD: tx.costOfSold,
            lastPriceUSD: tx.pricePerUnit || (tx.costOfSold / (tx.qty || 1)),
            marketValueUSD: tx.qty * (tx.pricePerUnit || (tx.costOfSold / (tx.qty || 1))),
            createdAt: Date.now(),
          });
          return [...prev, asset];
        }
      });
      setRealizedUSD(prev => prev - toNum(tx.realized || 0));
    }
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  function restoreTransaction(tx) {
    if (!tx) return;
    // re-apply the transaction (if deleted earlier)
    if (tx.type === "buy") {
      setAssets(prev => prev.map(a => {
        if (a.id !== tx.assetId) return a;
        const oldShares = toNum(a.shares || 0), oldInvested = toNum(a.investedUSD || 0);
        const newShares = oldShares + tx.qty, newInvested = oldInvested + tx.cost;
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, marketValueUSD: newShares * (tx.pricePerUnit || a.lastPriceUSD || newAvg) });
      }));
    } else if (tx.type === "sell") {
      setAssets(prev => prev.map(a => {
        if (a.id !== tx.assetId) return a;
        const oldShares = toNum(a.shares || 0);
        const newShares = Math.max(0, oldShares - tx.qty);
        const newInvested = Math.max(0, toNum(a.investedUSD || 0) - tx.costOfSold);
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, marketValueUSD: newShares * (tx.pricePerUnit || a.lastPriceUSD || newAvg) });
      }));
      setRealizedUSD(prev => prev + toNum(tx.realized || 0));
    }
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
  }

  /* ===================== EXPORT / IMPORT CSV (combined, spreadsheet-friendly) ===================== */
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
    const txHeaders = ["id","type","assetId","assetType","symbol","name","qty","pricePerUnit","cost","proceeds","costOfSold","realized","date"];

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
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr},assets=${assets.length},transactions=${transactions.length}`);

    const csv = "\uFEFF" + lines.join("\n");
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

  /* ===================== SHARE (PNG) generation respects eye state ===================== */
  function generateShareImage() {
    try {
      const allocation = donutData.map((d, i) => {
        return { name: d.name, pct: (totals.market > 0 ? (d.value / totals.market) * 100 : 0).toFixed(2), value: valuesHidden ? null : d.value };
      });
      const payload = {
        totals: { invested: (valuesHidden? null : totals.invested), market: (valuesHidden? null : totals.market), pnl: (valuesHidden? null : totals.pnl), pnlPct: totals.pnlPct },
        allocation,
        asOf: Date.now(),
        displayCcy,
      };
      const txt = JSON.stringify(payload);
      const canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 600;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#E5E7EB";
      ctx.font = "18px Inter, Arial, serif";
      ctx.fillText("Portfolio Share", 28, 36);
      ctx.font = "12px monospace";
      ctx.fillText(`AsOf: ${new Date(payload.asOf).toLocaleString()}`, 28, 56);
      ctx.fillText(`Ccy: ${payload.displayCcy}`, 28, 74);
      ctx.fillText("Allocation (pct)", 28, 100);
      let y = 120;
      payload.allocation.slice(0,8).forEach(a => {
        ctx.fillText(`${a.name}: ${a.pct}%${a.value ? " • " + (displayCcy==="IDR"? fmtMoney(a.value*usdIdr,"IDR"): fmtMoney(a.value,"USD")) : ""}`, 28, y); y+=20;
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `portfolio_share_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { alert("Share failed"); }
  }

  /* ===================== ASSET CLICK -> CHART LOGIC
     - Prefer TradingView for all assets (if tradingview supports).
     - heuristics: for stocks map to IDX:SYM for .JK, otherwise keep symbol.
     - for crypto, try BINANCE:SYMUSD or COINBASE:SYMUSD or CRYPTO:SYMUSD; TradingView supports many pairs.
     - if TradingView widget fails to load the symbol (can't detect), fallback to CoinGecko mini chart by coinId.
  ===================== */
  function mapSymbolForTradingView(asset) {
    if (!asset) return null;
    if (asset.type === "stock") {
      // If .JK convert to IDX:<ticker> (TradingView expects exchange prefix)
      if (String(asset.symbol || "").toUpperCase().endsWith(".JK")) {
        const t = asset.symbol.replace(".JK", "");
        return `IDX:${t}`;
      }
      // For common US tickers, assume direct
      return asset.symbol;
    }
    if (asset.type === "crypto") {
      const sym = (asset.symbol || "").replace(/^@/, "").toUpperCase();
      // Try common provider pairs
      return `BINANCE:${sym}USDT`;
    }
    return asset.symbol;
  }

  async function openAssetChart(asset) {
    if (!asset) return;
    // open modal and provide info
    setAssetChartOpen({ open: true, asset });
  }
  function closeAssetChart() { setAssetChartOpen({ open: false, asset: null }); }

  /* ===================== BUILD GROWTH SERIES (simplified) ===================== */
  function buildSeries(rows, txs, rangeKey) {
    const now = Date.now();
    let earliest = now;
    txs.forEach(t => { if (t.date && t.date < earliest) earliest = t.date; });
    rows.forEach(r => { if (r.purchaseDate && r.purchaseDate < earliest) earliest = r.purchaseDate; });
    const defaultDays = rangeKey === "1d" ? 1 : rangeKey === "2d" ? 2 : rangeKey === "1w" ? 7 : rangeKey === "1m" ? 30 : rangeKey === "1y" ? 365 : 365 * 2;
    const start = (earliest < now) ? earliest : (now - defaultDays * 24 * 3600 * 1000);
    let points = 180;
    if (rangeKey === "1d") points = 48;
    if (rangeKey === "2d") points = 96;
    if (rangeKey === "1w") points = 56;
    if (rangeKey === "1m") points = 90;
    if (rangeKey === "1y") points = 180;
    if (rangeKey === "all") points = 200;
    const times = [];
    const step = Math.max(1, Math.floor((Date.now() - start) / points));
    for (let t = start; t <= Date.now(); t += step) times.push(t);

    const series = { all: [], crypto: [], stock: [], nonliquid: [] };
    for (const ts of times) {
      let total = 0, totalCrypto = 0, totalStock = 0, totalNon = 0;
      rows.forEach(r => {
        let priceAtT = r.lastPriceUSD || r.avgPrice || 0;
        if (r.type === "nonliquid") {
          priceAtT = computeNonLiquidLastPrice(r.avgPrice, r.purchaseDate || r.createdAt, r.nonLiquidYoy || 0, ts);
        } else {
          const assetTxs = transactions.filter(tx => tx.assetId === r.id && tx.date <= ts);
          if (assetTxs.length > 0) {
            const lastTx = assetTxs[assetTxs.length - 1];
            priceAtT = lastTx.pricePerUnit || priceAtT;
          }
        }
        const qty = (() => {
          const txsForAsset = transactions.filter(tx => tx.assetId === r.id && tx.date <= ts);
          let s = 0;
          txsForAsset.forEach(tx => { if (tx.type === "buy") s += toNum(tx.qty); if (tx.type === "sell") s -= toNum(tx.qty); });
          if (txsForAsset.length === 0) s = toNum(r.shares || 0);
          return s;
        })();
        const v = priceAtT * qty;
        total += v;
        if (r.type === "crypto") totalCrypto += v;
        else if (r.type === "stock") totalStock += v;
        else if (r.type === "nonliquid") totalNon += v;
      });
      series.all.push({ t: ts, v: total });
      series.crypto.push({ t: ts, v: totalCrypto });
      series.stock.push({ t: ts, v: totalStock });
      series.nonliquid.push({ t: ts, v: totalNon });
    }
    return series;
  }
  const growthSeries = useMemo(() => buildSeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  /* ===================== RENDER ===================== */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">All Portfolio
              <button onClick={() => {
                const next = portfolioFilter === "all" ? "crypto" : portfolioFilter === "crypto" ? "stock" : portfolioFilter === "stock" ? "nonliquid" : "all";
                setPortfolioFilter(next);
              }} className="ml-2 inline-block transform transition-transform duration-200 hover:scale-105">v</button>
            </h1>
            <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
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
                  <span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? (<svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : usdIdr?.toLocaleString()}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{ displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD") }</div>
            <button onClick={() => setValuesHidden(v => !v)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform transition-transform hover:rotate-12">
              {valuesHidden ? "👁‍🗨" : "👁"}
            </button>
            <button onClick={() => setOpenAdd(v => !v)} className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform transition-transform ${openAdd ? 'rotate-45' : ''}`}>+</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex flex-col">
            <div className="text-gray-400 text-sm">Invested</div>
            <div className="font-medium text-base">{ valuesHidden ? "*****" : (displayCcy==="IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")) }</div>
            <div className="text-xs text-gray-500">avg price</div>
          </div>

          <div className="flex flex-col">
            <div className="text-gray-400 text-sm">Market value</div>
            <div className="font-medium text-base">{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(totals.market * usdIdr,"IDR") : fmtMoney(totals.market,"USD")) }</div>
            <div className="text-xs text-gray-500">current price</div>
          </div>

          <div className="flex flex-col">
            <div className="text-gray-400 text-sm">Gain P&L</div>
            <div className={`font-semibold text-base ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(totals.pnl * usdIdr,"IDR"): fmtMoney(totals.pnl,"USD")) }</div>
            <div className="text-xs text-gray-500">{totals.pnlPct.toFixed(2)}%</div>
          </div>

          <div className="flex flex-col">
            <div className="text-gray-400 text-sm">Realized P&L <span style={{display:"inline-block", marginLeft:6, border:"1px solid rgba(255,255,255,0.06)", padding:"2px 4px", borderRadius:4}} title="Transactions">↗</span></div>
            <div className={`font-semibold text-base ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(realizedUSD * usdIdr,"IDR") : fmtMoney(realizedUSD,"USD")) }</div>
            <div className="text-xs text-gray-500">Transactions</div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Stocks ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""}`}>Non-Liquid</button>
              </div>
            </div>

            {searchMode !== "nonliquid" ? (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={(e)=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode==="crypto"?"Search crypto (BTC, ethereum)...":"Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s,i)=>(
                        <button key={i} onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                          <div>
                            <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                            <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange || ''}`}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e)=>setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <input value={initPrice} onChange={(e)=>setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <select value={initPriceCcy} onChange={(e)=>setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option><option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={()=> selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add</button>
                  <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold">Add + Position</button>
                  <button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400">Name (Land, Art, Rolex)</label><input value={nlName} onChange={(e)=>setNlName(e.target.value)} placeholder="e.g. Land" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Quantity</label><input value={nlQty} onChange={(e)=>setNlQty(e.target.value)} placeholder="1" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Price (per unit)</label><input value={nlPrice} onChange={(e)=>setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">Currency</label><select value={nlPriceCcy} onChange={(e)=>setNlPriceCcy(e.target.value)} className="w-full rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800"><option value="USD">USD</option><option value="IDR">IDR</option></select></div>
                <div><label className="text-xs text-gray-400">Purchase date</label><input type="date" value={nlPurchaseDate} onChange={(e)=>setNlPurchaseDate(e.target.value)} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div><label className="text-xs text-gray-400">YoY gain (%)</label><input value={nlYoy} onChange={(e)=>setNlYoy(e.target.value)} placeholder="5" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div className="sm:col-span-2"><label className="text-xs text-gray-400">Description (optional)</label><input value={nlDesc} onChange={(e)=>setNlDesc(e.target.value)} placeholder="Address, serial..." className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" /></div>
                <div className="sm:col-span-2 flex gap-2"><button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add Non-Liquid</button><button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button></div>
              </div>
            )}
          </div>
        )}

        {/* GROWTH CHART (above donut) */}
        <div className="mt-6 bg-transparent p-3 rounded">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-400">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(k=>(
                <button key={k} onClick={()=>setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? 'bg-gray-800' : 'bg-transparent'}`}>{k}</button>
              ))}
            </div>
          </div>
          <div>
            <CandlesWithLines seriesMap={growthSeries} displayCcy={displayCcy} usdIdr={usdIdr} rangeKey={chartRange} />
          </div>
        </div>

        {/* ASSET TABLE */}
        <div className="mt-6 overflow-x-auto">
          <div style={{ minWidth: 940 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-gray-400">Assets</div>
              <div className="flex items-center gap-2">
                <div style={{ position: "relative" }}>
                  <button onClick={() => setSortBy(sortBy === "market_desc" ? "symbol_asc" : "market_desc")} className="px-2 py-1 rounded">⚙</button>
                </div>
                <div>
                  <button onClick={exportAllCSV} className="bg-white text-black px-3 py-1 rounded">Export</button>
                </div>
                <label className="bg-white text-black px-3 py-1 rounded cursor-pointer">
                  Import
                  <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
                </label>
                <button onClick={() => generateShareImage()} className="bg-white text-black px-3 py-1 rounded">Share</button>
              </div>
            </div>

            <table className="min-w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                  <th className="text-right py-2 px-3">Qty</th>
                  <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">avg price</div></th>
                  <th className="text-right py-2 px-3">Market <div className="text-xs text-gray-500">current price</div></th>
                  <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
                ) : sortedRows.map(r => (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-gray-100">{r.symbol}</div>
                      <div className="text-xs text-gray-400">{r.name}{r.description ? ` • ${r.description}` : ""}</div>
                    </td>
                    <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(r.investedUSD * usdIdr,"IDR") : fmtMoney(r.investedUSD,"USD")) }</div>
                      <div className="text-xs text-gray-400">{ displayCcy==="IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice,"USD") }</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(r.marketValueUSD * usdIdr,"IDR") : fmtMoney(r.marketValueUSD,"USD")) }</div>
                      <div className="text-xs text-gray-400">{ displayCcy==="IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD,"USD") }</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ valuesHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(r.pnlUSD * usdIdr,"IDR") : fmtMoney(r.pnlUSD,"USD")) }</div>
                      <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                        <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                        <button onClick={() => removeAssetDialog(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Del</button>
                        <button onClick={() => openAssetChart(r)} className="bg-gray-700 px-2 py-1 rounded text-xs">Chart</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* CAKE ALLOCATION */}
        {filteredRows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-44 h-44 flex items-center justify-center">
              <CakeAllocation data={donutData} size={220} inner={58} gap={0.02} displayTotal={ displayCcy === "IDR" ? (valuesHidden ? "*****" : fmtMoney(totals.market * usdIdr, "IDR")) : (valuesHidden ? "*****" : fmtMoney(totals.market, "USD")) } displayCcy={displayCcy} usdIdr={usdIdr} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {donutData.map((d,i)=> {
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{ displayCcy==="IDR" ? (valuesHidden ? "*****" : fmtMoney(d.value * usdIdr, "IDR")) : (valuesHidden ? "*****" : fmtMoney(d.value,"USD")) } • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ASSET CHART MODAL (TradingView preferred, fallback to CoinGecko for cryptos) */}
        {assetChartOpen.open && assetChartOpen.asset && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[110]">
            <div className="bg-gray-900 p-4 rounded-lg w-full max-w-4xl border border-gray-800">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{assetChartOpen.asset.symbol} · {assetChartOpen.asset.name}</h3>
                  <div className="text-xs text-gray-400">{assetChartOpen.asset.description || ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => generateShareImage()} className="bg-white text-black px-3 py-1 rounded">Share</button>
                  <button onClick={() => closeAssetChart()} className="text-gray-400 hover:text-white">Close</button>
                </div>
              </div>

              <div className="mt-4">
                {/* Try TradingView; for cryptos fallback to CoinGecko mini chart when tradingview symbol may not be available */}
                {assetChartOpen.asset.type === "crypto" ? (
                  // Try TradingView symbol heuristics, but also include Coingecko fallback
                  <AssetChartForCrypto asset={assetChartOpen.asset} displayCcy={displayCcy} usdIdr={usdIdr} />
                ) : (
                  <TradingViewWidget symbol={mapSymbolForTradingView(assetChartOpen.asset)} height={420} />
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* TRADE MODAL */}
      {tradeModal.open && (
        <TradeModal mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={() => setTradeModal({ open:false })} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />
      )}
    </div>
  );

  /* Helper inside component: remove asset with confirm */
  function removeAssetDialog(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }
}

/* ===================== AssetChartForCrypto: try TradingView mapping then fallback to CoinGecko ===================== */
function AssetChartForCrypto({ asset, displayCcy = "USD", usdIdr = 16000 }) {
  const [preferTv, setPreferTv] = useState(true);
  const [tvSymbol, setTvSymbol] = useState(null);
  useEffect(() => {
    if (!asset) return;
    // Heuristic mapping: try BINANCE:<SYMBOL>USDT, COINBASE:<SYMBOL>USD
    const sym = (asset.symbol || "").replace(/^@/,"").replace(/-USD$/i,"").toUpperCase();
    const candidates = [
      `BINANCE:${sym}USDT`,
      `COINBASE:${sym}USD`,
      `${sym}USD`,
      `CRYPTO:${sym}USD`,
    ];
    // choose first candidate (TV widget may still not support it; widget will fail gracefully)
    setTvSymbol(candidates[0]);
  }, [asset]);

  if (!asset) return null;
  return (
    <div>
      {preferTv ? (
        <div>
          <TradingViewWidget symbol={tvSymbol || asset.symbol} height={420} />
          <div className="mt-2 flex gap-2">
            <button onClick={() => setPreferTv(false)} className="px-2 py-1 rounded bg-gray-800">Use CoinGecko chart</button>
          </div>
        </div>
      ) : (
        <div>
          <CryptoMiniChart coinId={(asset.coingeckoId || asset.symbol || "").toLowerCase()} displayCcy={displayCcy} usdIdr={usdIdr} days={90} />
          <div className="mt-2 flex gap-2">
            <button onClick={() => setPreferTv(true)} className="px-2 py-1 rounded bg-gray-800">Try TradingView</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== TradeModal component (kept near original) ===================== */
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
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold capitalize">{mode} {asset.symbol}</h2>
            <p className="text-sm text-gray-400">{asset.name}</p>
          </div>
          <button onClick={() => onClose && onClose()} className="text-gray-500 hover:text-white">×</button>
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
          <div className="text-sm text-gray-400 text-right mb-4">Total: {fmtMoney(totalUSD, "USD")}</div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode === 'buy' ? 'bg-emerald-500 text-black' : 'bg-yellow-600 text-white'}`}>{mode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}</button>
        </form>
      </div>
    </div>
  );
}
```0