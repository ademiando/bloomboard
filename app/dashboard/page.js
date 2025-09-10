// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
/*
  Single-file Portfolio Dashboard (client)
  - Fetch stocks from Finnhub first (via server proxy /api/finnhub/quote & /api/finnhub/candle)
  - Fallbacks: Yahoo / Coingecko as needed
  - TradingView widget embed on asset click (modal)
  - Lightweight Charts for portfolio growth
  - Non-liquid custom assets with YoY growth compounding
  - Transaction log modal with restore/delete
  - Cake allocation chart with spacing and center total
  - Improved CSV import/export (UTF-8 BOM, headers)
  - Interactive hover/animations for buttons/dropdowns
*/

/* ========================= CONFIG ========================= */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`; // server proxy expected
const FINNHUB_CANDLE = (symbol, resolution, from, to) =>
  `/api/finnhub/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${from}&to=${to}`;

/* ========================= HELPERS ========================= */
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
  };
}
function daysBetween(tsFrom, tsTo = Date.now()) {
  return Math.max(0, Math.floor((tsTo - tsFrom) / (24 * 3600 * 1000)));
}
function compoundGrowth(value, annualPct, days) {
  if (!annualPct || days <= 0) return value;
  const years = days / 365.25;
  return value * Math.pow(1 + annualPct / 100, years);
}

/* ========================= ANIMATIONS / STYLES (simple in-file) ========================= */
const globalButtonClass =
  "inline-flex items-center justify-center px-3 py-2 rounded transition-transform duration-250 ease-out transform hover:-translate-y-0.5 active:scale-95 focus:outline-none";

const iconBtnClass = "inline-flex items-center gap-2 " + globalButtonClass;

/* ========================= DONUT->CAKE COMPONENT (SVG) ========================= */
function CakeChart({ data = [], size = 220, inner = 56, totalLabel = "", displayCcy = "USD", usdIdr = 16000 }) {
  // data: [{ name, value, color, symbols }]
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2,
    cy = size / 2,
    baseR = size / 2 - 8;
  // radiusScale based on value relative to max
  const maxVal = Math.max(1, ...data.map(d => d.value || 0));
  const rFor = (v) => inner + ((baseR - inner) * (v / maxVal || 0.1));
  let start = -Math.PI/2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Allocation chart">
      {data.map((d, i) => {
        const portion = Math.max(0, d.value || 0) / total;
        const angle = portion * Math.PI * 2;
        const end = start + angle;
        const r = rFor(d.value || 0);
        const large = angle > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
        // slice path with gap: we inset angles slightly
        const gap = 0.009; // radian gap
        const s = start + gap;
        const e = end - gap;
        const xs1 = cx + r * Math.cos(s), ys1 = cy + r * Math.sin(s);
        const xe1 = cx + r * Math.cos(e), ye1 = cy + r * Math.sin(e);
        const path = `M ${cx} ${cy} L ${xs1} ${ys1} A ${r} ${r} 0 ${large} 1 ${xe1} ${ye1} Z`;
        start = end;
        return (
          <g key={i} className="slice-group" cursor="pointer">
            <path d={path} fill={d.color || (["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF"][i%6])}
              stroke="#0b0b0b" strokeWidth="0.6" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
      <text x={cx} y={cy-6} textAnchor="middle" fontSize="10" fill="#aaa">{totalLabel}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="700">
        {displayCcy === "IDR" ? fmtMoney(total * usdIdr, "IDR") : fmtMoney(total, "USD")}
      </text>
    </svg>
  );
}

/* ========================= CHART: Lightweight (portfolio growth) ========================= */
let LightweightCharts; // lazy import to avoid SSR issues

async function ensureLightweight() {
  if (!LightweightCharts) {
    // dynamic import (client-only)
    const mod = await import("lightweight-charts");
    LightweightCharts = mod;
  }
}

/* ========================= MAIN COMPONENT ========================= */
export default function PortfolioDashboardPage() {
  /* ---------- local persistent state ---------- */
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
    try {
      if (!isBrowser) return "USD";
      return localStorage.getItem("pf_display_ccy_v2") || "USD";
    } catch { return "USD"; }
  };
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  /* ---------- FX + ui ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- UI / selections ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [portfolioFilter, setPortfolioFilter] = useState("all"); // all|crypto|stock|nonliquid

  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });
  const [tvModal, setTvModal] = useState({ open: false, symbol: null, name: null });

  /* ---------- graph state ---------- */
  const [growthTimeframe, setGrowthTimeframe] = useState("all"); // 1d,2d,1w,1m,1y,all
  const growthChartRef = useRef(null);
  const growthChartInstance = useRef(null);
  const [growthLoading, setGrowthLoading] = useState(false);

  /* ---------- persist to localStorage ---------- */
  useEffect(() => { try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions || [])); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {} }, [realizedUSD]);
  useEffect(() => { try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {} }, [displayCcy]);

  /* ========================= FX FETCH (Coingecko tether->IDR) ========================= */
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(`${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
      } catch (e) {
        // silent
      } finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ========================= SEARCH (crypto / stock suggestions) ========================= */
  // (omitted heavy search debounce code for brevity — keep suggestion mechanism if needed)
  useEffect(() => {
    if (!query || query.trim().length < 1) { setSuggestions([]); return; }
    let mounted = true;
    const q = query.trim();
    (async () => {
      try {
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!mounted || !res.ok) return;
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map(c => ({ id: c.id, symbol: (c.symbol||"").toUpperCase(), display: c.name, source: "coingecko", type: "crypto" })));
          return;
        }
        // stock: try yahoo proxy
        const res = await fetch(YAHOO_SEARCH(q));
        if (!mounted || !res.ok) { setSuggestions([]); return; }
        const j = await res.json();
        const rawList = j.quotes || j.result || j.items || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map(it => {
          const symbol = it.symbol || it.ticker || it.id || "";
          const display = it.shortname || it.longname || it.name || symbol;
          const exchange = it.exchange || it.exchangeName || "";
          return { symbol: (symbol||"").toString().toUpperCase(), display: display || symbol, exchange, source: "yahoo", type: "stock" };
        });
        setSuggestions(list.slice(0,30));
      } catch (e) { setSuggestions([]); }
    })();
    return () => { mounted = false; };
  }, [query, searchMode]);

  /* ========================= POLLING PRICES (crypto via coingecko, stocks via finnhub first) ========================= */
  // Use refs to prevent stale closures
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  // crypto polling
  useEffect(() => {
    let mounted = true;
    async function pollCrypto() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const res = await fetch(`${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));
      } catch (e) { /* silent */ }
    }
    pollCrypto();
    const id = setInterval(pollCrypto, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // stocks polling (Finnhub first per symbol)
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 80);
        if (symbols.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const map = {};
        // Finnhub per-symbol
        for (const s of symbols) {
          try {
            // Map to Finnhub symbol: many clients use 'BBCA.JK' or 'BBCA' depending on proxy implementation.
            // We'll pass the stored symbol as-is and rely on server proxy to map/attach API key correctly.
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) throw new Error("finnhub fail");
            const js = await res.json();
            // Finnhub quote returns { c: current, pc: prev close, ... }
            const current = toNum(js?.c ?? js?.current ?? 0);
            if (current > 0) {
              // detect IDX-like tickers (user may store with .JK suffix or exchange field)
              const looksLikeId = String(s || "").toUpperCase().endsWith(".JK") || String(js?.currency || "").toUpperCase() === "IDR";
              let priceUSD = current;
              if (looksLikeId) {
                const fx = usdIdrRef.current || 1;
                priceUSD = fx > 0 ? (current / fx) : current;
              }
              map[s] = { symbol: s, regularMarketPrice: priceUSD, _source: "finnhub", raw: js };
            }
          } catch (e) {
            // ignore per-symbol error
          }
        }
        // If map empty -> fallback to Yahoo bulk
        if (Object.keys(map).length === 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(symbols.join(",")));
            if (res.ok) {
              const j = await res.json();
              if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
                j.quoteResponse.result.forEach(q => { if (q && q.symbol) map[q.symbol] = q; });
              } else if (Array.isArray(j)) {
                j.forEach(q => { if (q && q.symbol) map[q.symbol] = q; });
              }
            }
          } catch (e) { /* ignore */ }
        }

        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const q = map[a.symbol];
            const price = toNum(q.regularMarketPrice ?? q.c ?? q.current ?? q.postMarketPrice ?? q.preMarketPrice ?? q.regularMarketPreviousClose ?? 0);
            const looksLikeId = (String(q.currency || "").toUpperCase() === "IDR") || String(a.symbol || "").toUpperCase().endsWith(".JK") || String(q.fullExchangeName || "").toUpperCase().includes("JAKARTA");
            let priceUSD = price;
            if (looksLikeId) {
              const fx = usdIdrRef.current || 1;
              priceUSD = fx > 0 ? (price / fx) : price;
            }
            // if Finnhub returned 0 or NaN -> fallback to avgPrice to avoid negative P&L
            const finalPrice = priceUSD > 0 ? priceUSD : (a.avgPrice || a.lastPriceUSD || a.investedUSD / Math.max(1, a.shares || 1));
            return ensureNumericAsset({ ...a, lastPriceUSD: finalPrice, marketValueUSD: finalPrice * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));
      } catch (e) {
        // silent
      }
    }
    pollStocks();
    const id = setInterval(pollStocks, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading, usdIdr]);

  /* ========================= Non-liquid logic when computing rows ========================= */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      // if nonliquid and has yearlyGainPct and dateBought -> compute lastPriceUSD via compounding
      const created = aa.createdAt || Date.now();
      const days = daysBetween(created, Date.now());
      const invested = toNum(aa.investedUSD || aa.shares * aa.avgPrice || 0);
      const annualPct = toNum(aa.yearlyGainPct || 0);
      const currentValue = compoundGrowth(invested, annualPct, days);
      const marketValueUSD = currentValue; // treat invested amount grown to current value
      const lastPriceUSD = aa.shares > 0 ? marketValueUSD / aa.shares : aa.avgPrice || 0;
      const pnl = marketValueUSD - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return { ...aa, lastPriceUSD, marketValueUSD, investedUSD: invested, pnlUSD: pnl, pnlPct };
    }
    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = toNum(aa.shares || 0) * last;
    const invested = toNum(aa.investedUSD || 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets, usdIdr]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s,r)=> s + toNum(r.investedUSD || 0), 0);
    const market = rows.reduce((s,r)=> s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  /* ========================= Donut/Cake data ========================= */
  const cakeData = useMemo(() => {
    const filtered = rows.filter(r => {
      if (portfolioFilter === "all") return true;
      return r.type === portfolioFilter;
    }).slice().sort((a,b)=> b.marketValueUSD - a.marketValueUSD);
    const top = filtered.slice(0,6);
    const others = filtered.slice(6);
    const items = top.map((r,i)=> ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0), color: ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF"][i%6], symbols: [r.symbol] }));
    const otherSum = others.reduce((s,x)=> s + (x.marketValueUSD||0), 0);
    if (otherSum > 0) items.push({ name: "Other", value: otherSum, color: "#777", symbols: others.map(x=>x.symbol) });
    return items;
  }, [rows, portfolioFilter]);

  /* ========================= Add Asset flows (including non-liquid full custom) ========================= */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source||s.type}:${s.symbol||s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, createdAt: Date.now(),
    });
    setAssets(prev=> [...prev, asset]);
    setOpenAdd(false); setQuery(""); setSuggestions([]); setSelectedSuggestion(null);
  }

  async function addManualAsset(manual = {type:"stock"}) {
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or select suggestion"); return; }
    let newAsset = null;
    if (manual.type === "nonliquid") {
      // special non liquid full-custom
      const name = typed;
      const desc = manual.description || "";
      const qty = toNum(initQty || 1);
      const priceInput = toNum(initPrice || 0);
      const invested = qty * priceInput;
      const yearlyGainPct = toNum(manual.yearlyGainPct || 0);
      newAsset = ensureNumericAsset({
        id: `manual:nl:${name.replace(/\s+/g,"_").toLowerCase()}:${Date.now()}`,
        type: "nonliquid",
        symbol: (name || "NONLIQ").toUpperCase(),
        name,
        description: desc,
        shares: qty,
        avgPrice: priceInput,
        investedUSD: invested,
        lastPriceUSD: priceInput,
        marketValueUSD: invested,
        yearlyGainPct,
        createdAt: manual.createdAt || Date.now(),
      });
    } else if (searchMode === "crypto") {
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
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice("");
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
    const internalId = `${picked.source||picked.type}:${picked.symbol||picked.id}:${Date.now()}`;
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
    });
    setAssets(prev => [...prev, asset]);
    // record transaction: buy
    const tx = { id: `tx:${Date.now()}`, type: "buy", assetId: asset.id, symbol: asset.symbol, qty, priceUSD: priceInUSD, timestamp: Date.now() };
    setTransactions(prev => [tx, ...prev]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice("");
    setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  /* ========================= Trade: buy / sell ========================= */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open:false, mode:null, assetId:null, defaultPrice:null }); }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    setAssets(prev => prev.map(a => {
      if (a.id !== id) return ensureNumericAsset(a);
      const oldShares = toNum(a.shares || 0), oldInvested = toNum(a.investedUSD || 0);
      const addCost = q * p;
      const newShares = oldShares + q, newInvested = oldInvested + addCost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p });
    }));
    // record tx
    const tx = { id: `tx:${Date.now()}`, type: "buy", assetId: id, qty: q, priceUSD: p, timestamp: Date.now() };
    setTransactions(prev => [tx, ...prev]);
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
    setRealizedUSD(prev => prev + realized);
    const newShares = oldShares - q;
    const newInvested = a.investedUSD - costOfSold;
    const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
    setAssets(prev => {
      if (newShares <= 0) return prev.filter(x => x.id !== id);
      return prev.map(x => x.id === id ? ensureNumericAsset({ ...x, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p }) : ensureNumericAsset(x));
    });
    // record tx: sell
    const tx = { id: `tx:${Date.now()}`, type: "sell", assetId: id, symbol: a.symbol, qty: q, priceUSD: p, realizedUSD: realized, timestamp: Date.now() };
    setTransactions(prev => [tx, ...prev]);
    closeTradeModal();
  }

  /* ========================= Transaction log: delete / restore ========================= */
  function deleteTransaction(txId) {
    if (!confirm("Delete this transaction permanently?")) return;
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }
  function restoreTransaction(txId) {
    // For sell transactions: undo the sell -> re-add shares and reduce realized P&L
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return alert("Transaction not found");
    if (!confirm("Restore this transaction (undo)?")) return;
    if (tx.type === "sell") {
      // find asset by symbol or assetId; if not exists, recreate asset entry minimal
      let asset = assets.find(a => a.id === tx.assetId || a.symbol === tx.symbol);
      if (!asset) {
        asset = ensureNumericAsset({ id: tx.assetId || `restored:${tx.symbol}:${Date.now()}`, type: "stock", symbol: tx.symbol, name: tx.symbol, shares: 0, avgPrice: tx.priceUSD, investedUSD: 0, lastPriceUSD: tx.priceUSD, marketValueUSD: 0, createdAt: Date.now() });
        setAssets(prev => [asset, ...prev]);
      }
      // add back shares
      setAssets(prev => prev.map(a => {
        if (a.id !== asset.id) return a;
        const newShares = toNum(a.shares || 0) + toNum(tx.qty || 0);
        const newInvested = toNum(a.investedUSD || 0) + (toNum(tx.qty || 0) * toNum(tx.priceUSD || 0)); // naive restoration
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: tx.priceUSD, marketValueUSD: newShares * tx.priceUSD });
      }));
      setRealizedUSD(prev => prev - (toNum(tx.realizedUSD) || 0));
    } else if (tx.type === "buy") {
      // undo buy => remove bought qty
      setAssets(prev => prev.map(a => {
        if (a.id !== tx.assetId) return a;
        const oldShares = toNum(a.shares || 0);
        const removal = toNum(tx.qty || 0);
        const newShares = Math.max(0, oldShares - removal);
        const newInvested = toNum(a.investedUSD || 0) - (removal * toNum(tx.priceUSD || 0));
        if (newShares <= 0) return null;
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: a.lastPriceUSD });
      }).filter(Boolean));
    }
    // remove the transaction from log (restored)
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  /* ========================= TradingView embed modal (asset detail) ========================= */
  function openTvModalForSymbol(symbol, displayName) {
    // map 'BBCA.JK' or 'BBCA.JK' -> 'IDX:BBCA' for TradingView use
    let tvSymbol = symbol;
    if (String(symbol).toUpperCase().endsWith(".JK")) {
      const base = String(symbol).toUpperCase().replace(/\.JK$/i, "");
      tvSymbol = `IDX:${base}`;
    } else {
      // fallback: try prefixing exchange hints if stock
      tvSymbol = symbol;
    }
    setTvModal({ open: true, symbol: tvSymbol, name: displayName || symbol });
  }
  function closeTvModal() { setTvModal({ open: false, symbol: null, name: null }); }

  // inject TradingView widget script and create widget when modal opens
  useEffect(() => {
    if (!tvModal.open || !tvModal.symbol) return;
    // inject tv.js if not present
    if (!document.querySelector("#tv-widget-script")) {
      const s = document.createElement("script");
      s.id = "tv-widget-script";
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      document.body.appendChild(s);
      s.onload = () => {
        // instantiate
        tryCreateTvWidget();
      };
    } else {
      tryCreateTvWidget();
    }
    function tryCreateTvWidget() {
      try {
        if (!window.TradingView) return;
        // create a container element
        const container = document.getElementById("tv-widget-root");
        if (!container) return;
        container.innerHTML = "";
        new window.TradingView.widget({
          container_id: "tv-widget-root",
          autosize: true,
          symbol: tvModal.symbol,
          interval: "D",
          timezone: "Asia/Jakarta",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#222",
          hide_side_toolbar: false,
          enable_publishing: false,
          allow_symbol_change: true,
          details: true,
          studies: ["MASimple@tv-basicstudies"],
        });
      } catch (e) {
        // fallback: show message
        const container = document.getElementById("tv-widget-root");
        if (container) container.innerHTML = "<div style='color:#fff;padding:12px'>TradingView widget failed to load</div>";
      }
    }
    return () => {
      // cleanup widget root
      const container = document.getElementById("tv-widget-root");
      if (container) container.innerHTML = "";
    };
  }, [tvModal.open, tvModal.symbol]);

  /* ========================= Portfolio Growth Chart (Lightweight Charts) ========================= */
  async function fetchSeriesForAsset(a, timeframe) {
    // timeframe: 1d,2d,1w,1m,1y,all -> map to resolution & from/to
    const now = Math.floor(Date.now() / 1000);
    let from;
    switch (timeframe) {
      case "1d": from = now - 24*3600; break;
      case "2d": from = now - 2*24*3600; break;
      case "1w": from = now - 7*24*3600; break;
      case "1m": from = now - 30*24*3600; break;
      case "1y": from = now - 365*24*3600; break;
      default: from = now - 3*365*24*3600; // 3 years default for 'all'
    }
    // For stocks: use FINNHUB /stock/candle with resolution D or 60 etc. Our server proxy should provide this.
    if (a.type === "stock") {
      try {
        // choose resolution
        const res = (timeframe === "1d" || timeframe === "2d") ? "60" : (timeframe === "1w" ? "60" : "D");
        const r = await fetch(FINNHUB_CANDLE(a.symbol, res, from, now));
        if (!r.ok) throw new Error("candle fail");
        const j = await r.json();
        // expected j: {c:[],h:[],l:[],o:[],t:[],s:"ok"}
        if (j && Array.isArray(j.t) && j.t.length > 0) {
          return j.t.map((t, idx) => ({ time: t, value: toNum(j.c[idx] || j.h[idx] || j.o[idx]) }));
        }
      } catch (e) {
        // fallback: return flat series at avgPrice
        const price = a.lastPriceUSD || a.avgPrice || (a.investedUSD / Math.max(1, a.shares || 1));
        const pts = [];
        for (let t = from; t <= now; t += Math.max(3600, Math.floor((now - from) / 50))) pts.push({ time: t, value: price });
        return pts;
      }
    }
    if (a.type === "crypto") {
      // coingecko market_chart endpoint requires id & days param
      try {
        const daysParam = timeframe === "1d" ? 1 : timeframe === "2d" ? 2 : timeframe === "1w" ? 7 : timeframe === "1m" ? 30 : timeframe === "1y" ? 365 : "max";
        const id = a.coingeckoId || a.symbol?.toLowerCase();
        const res = await fetch(`${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${daysParam}`);
        if (!res.ok) throw new Error("cg fail");
        const j = await res.json();
        if (j && Array.isArray(j.prices)) {
          return j.prices.map(p => ({ time: Math.floor(p[0]/1000), value: p[1] }));
        }
      } catch (e) {
        const price = a.lastPriceUSD || a.avgPrice || 0;
        return [{ time: Math.floor(Date.now()/1000), value: price }];
      }
    }
    if (a.type === "nonliquid") {
      // generate a synthetic series from buy date to now using yearlyGainPct
      const created = a.createdAt || Date.now();
      const start = Math.floor(created / 1000);
      const pts = [];
      const days = daysBetween(created, Date.now());
      const steps = Math.min(60, Math.max(5, Math.floor(days / 7)));
      for (let i=0;i<=steps;i++) {
        const t = start + Math.floor((i/steps) * (Math.floor(Date.now()/1000) - start));
        const daysSoFar = Math.floor((t*1000 - created)/(24*3600*1000));
        const value = compoundGrowth(a.investedUSD || (a.shares*a.avgPrice||0), (a.yearlyGainPct||0), daysSoFar);
        pts.push({ time: t, value: value / Math.max(1, a.shares || 1) });
      }
      return pts;
    }
    return [];
  }

  // renders aggregated growth lines into lightweight chart container
  async function renderGrowthChart(container, timeframe = "all") {
    if (!container) return;
    setGrowthLoading(true);
    await ensureLightweight();
    try {
      if (growthChartInstance.current) {
        // destroy previous
        try { growthChartInstance.current?.chart?.remove(); } catch(e) {}
        growthChartInstance.current = null;
      }
      const chart = LightweightCharts.createChart(container, { width: container.clientWidth, height: 320, layout: { background: { color: '#0b0b0b'}, textColor: '#ddd' }, rightPriceScale: { visible: true }});
      const colorPalette = ["#4D96FF","#6BCB77","#FFD93D","#FF6B6B","#B28DFF","#FFB26B"];
      const categories = ["all", "crypto", "stock", "nonliquid"];
      // For each category, build series aggregated value over time
      const lines = [];
      for (let ci=0;ci<categories.length;ci++) {
        const cat = categories[ci];
        const subset = rows.filter(r => cat==="all" ? true : r.type === cat);
        if (subset.length === 0) continue;
        // fetch per-asset series and sum by timestamp (time alignment naive -> align by nearest)
        const perAssetSeries = await Promise.all(subset.map(a => fetchSeriesForAsset(a, timeframe)));
        // merge timestamps: collect unique times
        const timesSet = new Set();
        perAssetSeries.forEach(s => s.forEach(p => timesSet.add(p.time)));
        const times = Array.from(timesSet).sort((a,b)=>a-b);
        const aggregated = times.map(t => {
          let sum = 0;
          perAssetSeries.forEach((s, idx) => {
            // find nearest point
            if (!s || s.length===0) return;
            // find last point <= t
            const p = s.reduce((acc,cur)=> (cur.time<=t?cur:acc), s[0]);
            if (p) {
              // multiply by shares to get asset USD value
              const asset = subset[perAssetSeries.indexOf(s)];
              const valPerUnit = p.value || 0;
              const assetValueUSD = (asset.shares || 0) * valPerUnit;
              sum += assetValueUSD;
            }
          });
          return { time: t, value: sum };
        });
        // create price series (convert to display currency)
        const series = chart.addLineSeries({ color: colorPalette[ci%colorPalette.length], lineWidth: 2 });
        const data = aggregated.map(pt => ({ time: pt.time, value: displayCcy === "IDR" ? pt.value * usdIdr : pt.value }));
        series.setData(data);
        lines.push({ cat, series, color: colorPalette[ci%colorPalette.length] });
      }
      growthChartInstance.current = { chart, lines };
      // responsive
      const resizeObserver = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
      resizeObserver.observe(container);
      setGrowthLoading(false);
    } catch (e) {
      setGrowthLoading(false);
      // fallback: show nothing
    }
  }

  useEffect(() => {
    // render growth chart when rows, timeframe, or displayCcy changes
    const el = growthChartRef.current;
    if (!el) return;
    renderGrowthChart(el, growthTimeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, growthTimeframe, displayCcy, usdIdr]);

  /* ========================= CSV Export / Import (improved) ========================= */
  function exportCSVAll() {
    const headers = [
      "source_file:app/dashboard/page.js",
      "exported_at:" + new Date().toISOString()
    ];
    // Build CSV with two sheets-like sections separated by blank line and header comment lines.
    const rowsHeader = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","yearlyGainPct","createdAt"];
    const rowsLines = [rowsHeader.join(",")];
    assets.forEach(a => {
      const aa = ensureNumericAsset(a);
      const values = [
        aa.id || "",
        aa.type || "",
        aa.coingeckoId || "",
        aa.symbol || "",
        (aa.name||"").replace(/"/g,'""'),
        (aa.description||"").replace(/"/g,'""'),
        aa.shares || 0,
        aa.avgPrice || 0,
        aa.investedUSD || 0,
        aa.lastPriceUSD || 0,
        aa.marketValueUSD || 0,
        aa.yearlyGainPct || "",
        aa.createdAt || ""
      ].map(v => typeof v === "string" && v.includes(",") ? `"${v}"` : String(v || ""));
      rowsLines.push(values.join(","));
    });
    const txHeader = ["tx_id","type","assetId","symbol","qty","priceUSD","realizedUSD","timestamp"];
    const txLines = [txHeader.join(",")];
    transactions.forEach(tx => {
      const vals = [
        tx.id || "",
        tx.type || "",
        tx.assetId || "",
        tx.symbol || "",
        tx.qty || "",
        tx.priceUSD || "",
        tx.realizedUSD || "",
        tx.timestamp || ""
      ].map(v => String(v || ""));
      txLines.push(vals.join(","));
    });
    const metaLine = `#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr}`;
    // join with separation lines to make spreadsheet nicer
    const csvParts = [];
    csvParts.push("\uFEFF"); // UTF-8 BOM
    csvParts.push(headers.join(","));
    csvParts.push("");
    csvParts.push("#ASSETS");
    csvParts.push(rowsLines.join("\n"));
    csvParts.push("");
    csvParts.push("#TRANSACTIONS");
    csvParts.push(txLines.join("\n"));
    csvParts.push("");
    csvParts.push(metaLine);
    const csv = csvParts.join("\n");
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
      const lines = text.split(/\r?\n/);
      // find #ASSETS block
      const assetsIdx = lines.findIndex(l => l.startsWith("#ASSETS"));
      const txIdx = lines.findIndex(l => l.startsWith("#TRANSACTIONS"));
      const metaIdx = lines.findIndex(l => l.startsWith("#META"));
      let assetSection = [];
      if (assetsIdx >= 0) {
        const start = assetsIdx + 1;
        const end = txIdx >= 0 ? txIdx : (metaIdx >= 0 ? metaIdx : lines.length);
        assetSection = lines.slice(start, end).filter(Boolean);
      }
      if (assetSection.length === 0) return alert("No asset data found");
      const header = assetSection[0].split(",").map(h => h.trim());
      const imported = assetSection.slice(1).map(line => {
        // basic CSV parse - handle quoted fields
        const values = [];
        let cur = "";
        let inQ = false;
        for (let i=0;i<line.length;i++) {
          const ch = line[i];
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === "," && !inQ) { values.push(cur); cur = ""; continue; }
          cur += ch;
        }
        values.push(cur);
        const obj = {};
        header.forEach((h, idx) => obj[h] = values[idx] ?? "");
        const parsed = {
          id: obj.id || `imp:${obj.symbol||""}:${Date.now()}`,
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
          yearlyGainPct: toNum(obj.yearlyGainPct || 0),
          createdAt: toNum(obj.createdAt) || Date.now(),
        };
        return ensureNumericAsset(parsed);
      });
      // transactions section
      let importedTx = [];
      if (txIdx >= 0) {
        const start = txIdx + 1;
        const end = metaIdx >= 0 ? metaIdx : lines.length;
        const txSection = lines.slice(start, end).filter(Boolean);
        const txHeader = txSection[0]?.split(",") || [];
        importedTx = txSection.slice(1).map(line => {
          const parts = line.split(",");
          const obj = {};
          txHeader.forEach((h, idx) => obj[h] = parts[idx] ?? "");
          return obj;
        });
      }
      // meta parse
      if (metaIdx >= 0) {
        const m = lines[metaIdx].replace(/^#META,?/, "");
        const parts = m.split(",");
        parts.forEach(p => {
          const [k,v] = p.split("=");
          if (k === "realizedUSD") setRealizedUSD(toNum(v));
          if (k === "displayCcy" && v) setDisplayCcy(String(v));
          if (k === "usdIdr") setUsdIdr(toNum(v));
        });
      }
      if (merge) {
        const map = {};
        assets.forEach(a => map[a.symbol] = ensureNumericAsset(a));
        imported.forEach(i => map[i.symbol] = ensureNumericAsset(i));
        const merged = Object.values(map);
        setAssets(merged);
        setTransactions(prev => [...(importedTx || []), ...prev]);
      } else {
        setAssets(imported);
        setTransactions(importedTx);
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

  /* ========================= Filters / sorting for table ========================= */
  const [assetSort, setAssetSort] = useState({ key: "value", dir: "desc" }); // value | invested | symbol | age
  function sortedRows() {
    const filtered = rows.filter(r => portfolioFilter === "all" ? true : r.type === portfolioFilter);
    const sorted = filtered.slice().sort((a,b) => {
      if (assetSort.key === "value") return (b.marketValueUSD || 0) - (a.marketValueUSD || 0);
      if (assetSort.key === "invested") return (b.investedUSD||0) - (a.investedUSD||0);
      if (assetSort.key === "symbol") return a.symbol.localeCompare(b.symbol) * (assetSort.dir === "asc" ? 1 : -1);
      if (assetSort.key === "age") return (a.createdAt||0) - (b.createdAt||0);
      return 0;
    });
    return sorted;
  }

  /* ========================= UI: small helpers ========================= */
  function colorForIndex(i) {
    const palette = ["#4D96FF","#6BCB77","#FFD93D","#FF6B6B","#B28DFF","#FFB26B"];
    return palette[i % palette.length];
  }

  /* ========================= RENDER ========================= */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER: title + portfolio filter dropdown icon (no box, just icon) */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">All Portfolio
              <button
                title="Switch portfolio"
                onClick={() => {
                  // cycle filter: all -> crypto -> stock -> nonliquid
                  const order = ["all","crypto","stock","nonliquid"];
                  const idx = order.indexOf(portfolioFilter);
                  const next = order[(idx+1)%order.length];
                  setPortfolioFilter(next);
                }}
                className="ml-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 transition-transform duration-200"
                style={{ transform: "translateY(0)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </h1>
            <div className="text-xs text-gray-400 mt-1">Updated: {new Date().toLocaleString()}</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>

            {/* value dropdown (show just "amount IDR >" with icon, not boxed) */}
            <div className="flex items-center gap-2 cursor-pointer select-none" title="Change display currency">
              <div className="text-sm font-medium" onClick={() => setDisplayCcy(prev => prev === "USD" ? "IDR" : "USD")} style={{ fontSize: 14 }}>
                {displayCcy === "IDR" ? `${Math.round(totals.market * usdIdr).toLocaleString()} IDR` : `${Math.round(totals.market).toLocaleString()} USD`}
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>

            <button onClick={() => setOpenAdd(v => !v)} title="Add asset"
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform transition-transform duration-300 hover:rotate-90"
            >+</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex flex-col text-gray-400">
            <div className="text-sm">Invested</div>
            <div className="font-semibold text-lg">{displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">avg price</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-sm">Market value</div>
            <div className="font-semibold text-lg">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">current price</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-sm">Gain P&L</div>
            <div className={`font-semibold text-lg ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="flex items-center gap-2">
              <div className="text-sm">Realized P&L</div>
              <div style={{ width:18, height:18, borderRadius:4, border:"1px solid #333", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <div className={`font-semibold text-lg ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}</div>
            <div className="text-xs text-gray-500 mt-1">Transactions</div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("stock"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "stock" ? "bg-gray-800" : ""}`}>Stocks</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""}`}>Non-liquid</button>
              </div>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e)=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : (searchMode==="nonliquid" ? "e.g. Land, Art, Rolex" : "Search (AAPL | BBCA.JK)")} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && ( <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                  {suggestions.map((s,i)=>(
                    <button key={i} onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange||''}`}</div>
                      </div>
                    </button>
                  ))}
                </div>)}
              </div>

              <input value={initQty} onChange={(e)=>setInitQty(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <input value={initPrice} onChange={(e)=>setInitPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <select value={initPriceCcy} onChange={(e)=>setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option><option value="IDR">IDR</option>
              </select>

              <div className="flex items-center gap-2">
                {searchMode === "nonliquid" ? (
                  <button onClick={() => {
                    // open modal to capture non-liquid details (for brevity we use prompt)
                    const name = query || prompt("Name (e.g. Land, Art, Rolex)") || "";
                    const desc = prompt("Description (optional)") || "";
                    const qty = prompt("Quantity", initQty || "1") || "1";
                    const price = prompt("Price per unit", initPrice || "0") || "0";
                    const ccy = prompt("Currency (USD/IDR)", initPriceCcy || "USD") || "USD";
                    const yPct = prompt("Yearly gain % (optional)", "5") || "0";
                    const boughtStr = prompt("Bought date (YYYY-MM-DD) (optional)", "") || "";
                    const createdAt = boughtStr ? (new Date(boughtStr).getTime() || Date.now()) : Date.now();
                    // set initial fields
                    setQuery(name);
                    setInitQty(qty);
                    setInitPrice(price);
                    setInitPriceCcy(ccy);
                    // call addManualAsset with details
                    addManualAsset({ type:"nonliquid", description: desc, yearlyGainPct: yPct, createdAt });
                  }} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add Non-liquid</button>
                ) : (
                  <>
                    <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add</button>
                    <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold">Add + Position</button>
                  </>
                )}
                <button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* GROWTH CHART */}
        <div className="mt-6 p-4 rounded bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="font-medium">Portfolio Growth</div>
              <div className="text-xs text-gray-400">interactive</div>
            </div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(tf=>(
                <button key={tf} onClick={()=>setGrowthTimeframe(tf)} className={`px-3 py-1 text-xs rounded ${growthTimeframe===tf? "bg-blue-600 text-white":"bg-gray-800 text-gray-300"}`}>{tf.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <div ref={growthChartRef} id="growth-chart-container" style={{ width: "100%", minHeight: 320 }} />
            {growthLoading && <div className="text-xs text-gray-400 mt-2">Loading chart...</div>}
          </div>
        </div>

        {/* ASSET TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">current price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows().length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : sortedRows().map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openTvModalForSymbol(r.symbol, r.name)}>{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">avg {displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">cur {displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={()=>openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                      <button onClick={()=>openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                      <button onClick={()=>{ if (confirm(`Delete ${r.symbol}?`)) setAssets(prev=>prev.filter(x=>x.id!==r.id)); }} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cake chart + legend */}
        {rows.length>0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-40 h-40 flex items-center justify-center">
              <CakeChart data={cakeData} size={180} inner={48} totalLabel="Total" displayCcy={displayCcy} usdIdr={usdIdr} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
              {cakeData.map((d,i)=> {
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width:12, height:12, background: d.color }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TRANSACTION LOG (collapsible modal) */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">Transactions</div>
            <div className="text-xs text-gray-500">Click a tx to restore or delete</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSVAll} className="bg-white text-black px-3 py-2 rounded font-semibold hover:scale-105">Export CSV</button>
            <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={()=>{ if (!confirm("Clear portfolio and transactions?")) return; setAssets([]); setTransactions([]); setRealizedUSD(0); }} className="bg-red-600 px-3 py-2 rounded font-semibold">Clear All</button>
          </div>
        </div>

        {/* Transaction list (inline, small) */}
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded p-3">
          <div className="text-sm text-gray-200 font-semibold mb-2">Recent Transactions</div>
          <div className="max-h-52 overflow-auto">
            {transactions.length === 0 ? (
              <div className="text-xs text-gray-500">No transactions</div>
            ) : transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-800">
                <div>
                  <div className="text-sm">{tx.type.toUpperCase()} • {tx.symbol || tx.assetId}</div>
                  <div className="text-xs text-gray-400">{new Date(tx.timestamp || Date.now()).toLocaleString()} • qty {tx.qty || ""} • {displayCcy === "IDR" ? fmtMoney((tx.priceUSD || 0) * usdIdr, "IDR") : fmtMoney(tx.priceUSD || 0, "USD")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>restoreTransaction(tx.id)} className="text-xs px-2 py-1 rounded bg-blue-600">Restore</button>
                  <button onClick={()=>deleteTransaction(tx.id)} className="text-xs px-2 py-1 rounded bg-red-600">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Trade Modal */}
      {tradeModal.open && <TradeModal mode={tradeModal.mode} asset={assets.find(a=>a.id===tradeModal.assetId)} defaultPrice={tradeModal.defaultPrice} onClose={closeTradeModal} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />}

      {/* TradingView Modal */}
      {tvModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-4 rounded-lg w-full max-w-4xl border border-gray-800">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">{tvModal.name} • {tvModal.symbol}</h2>
              </div>
              <button onClick={closeTvModal} className="text-gray-400">×</button>
            </div>
            <div id="tv-widget-root" style={{ width: "100%", height: 520 }} className="mt-3 bg-black" />
          </div>
        </div>
      )}

    </div>
  );
}

/* ========================= TRADE MODAL COMPONENT ========================= */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(() => {
    setPrice(defaultPrice > 0 ? String(defaultPrice) : "");
  }, [defaultPrice]);

  if (!asset) return null;

  const priceUSD = priceCcy === "IDR" ? toNum(price) / (usdIdr || 1) : toNum(price);
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
            <input type="number" step="any" value={qty} onChange={(e)=>setQty(e.target.value)}
              className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none" placeholder="0.00" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e)=>setPrice(e.target.value)}
                className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700 focus:outline-none" placeholder="0.00" />
              <select value={priceCcy} onChange={(e)=>setPriceCcy(e.target.value)}
                className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r focus:outline-none">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right mb-4">Total: {fmtMoney(totalUSD, "USD")}</div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode==='buy'?'bg-emerald-500 text-black':'bg-yellow-600 text-white'}`}>{mode==='buy' ? 'Confirm Buy' : 'Confirm Sell'}</button>
        </form>
      </div>
    </div>
  );
}