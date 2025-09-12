// app/dashboard/page.js
"use client";

/**
 * Portfolio Dashboard — single-file complete implementation
 *
 * Features:
 * - One file, no splitting
 * - CoinGecko for crypto prices & history
 * - AlphaVantage for Indonesian stocks (primary). Set ALPHA_VANTAGE_API_KEY below.
 * - TradingView embed for stock charts (when clicking asset)
 * - Non-liquid custom assets with YoY gain option
 * - Cake allocation chart (SVG cake with variable outer radii)
 * - Portfolio growth (line chart) with timeframe 1D 2D 1W 1M 1Y ALL
 * - Table with columns laid out exactly as requested:
 *   Code (big), Description (small)
 *   Invested (big), avg price (small)
 *   Market value (big), Current Price (small)
 *   P&L (Gain) (big), Gain (small)
 * - All Portfolio selector: icon-only dropdown (˅). Value display: "5,589,686 IDR ˅"
 * - Filter icon for sorting (scrollable dropdown). Closes on outside click.
 * - Export/Import CSV (single file: portfolio + transactions). CSV format spreadsheet-friendly.
 * - Transactions log for realized P&L with undo (restore) & delete.
 * - Animations & hover interactions (CSS transitions)
 *
 * IMPORTANT: Replace ALPHA_VANTAGE_API_KEY with a real key for production.
 */

// ----------------------------- CONFIG -----------------------------
const ALPHA_VANTAGE_API_KEY = process?.env?.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY || "demo"; // replace "demo"
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";

// ----------------------------- REACT / DEPENDENCIES -----------------------------
import React, { useEffect, useMemo, useRef, useState } from "react";

/* Chart.js dynamic import helper:
   If you have chart.js + react-chartjs-2 installed, these will be used for nicer charts.
   If not available, we fallback to minimal SVG polyline charts implemented below.
*/
let ChartJS = null;
let ReactChart = null;
async function loadChartLibs() {
  if (ChartJS) return { ChartJS, ReactChart };
  try {
    ChartJS = (await import("chart.js/auto")).default || (await import("chart.js/auto"));
    ReactChart = { Line: (await import("react-chartjs-2")).Line, Doughnut: (await import("react-chartjs-2")).Doughnut };
    return { ChartJS, ReactChart };
  } catch (e) {
    // chart libs not available — we'll use SVG fallbacks
    ChartJS = null;
    ReactChart = null;
    return { ChartJS, ReactChart };
  }
}

// ----------------------------- HELPERS -----------------------------
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const fmt = (n) => {
  if (n === null || n === undefined) return "0";
  return Number(n).toLocaleString();
};
function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR")
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// CSV escaping for spreadsheet-friendly output (RFC4180-ish)
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ----------------------------- STORAGE KEYS -----------------------------
const LS_ASSETS = "pf_assets_v2";
const LS_TX = "pf_tx_v2";
const LS_REALIZED = "pf_realized_v2";
const LS_DISPLAY_CCY = "pf_display_ccy_v2";
const LS_USD_IDR = "pf_usd_idr_v2";

// ----------------------------- DEFAULTS / BOOTSTRAP -----------------------------
const defaultExampleAssets = [
  // note: examples; real data loaded from localStorage if present
  {
    id: uid("asset:"),
    type: "crypto",
    symbol: "bitcoin",
    coingeckoId: "bitcoin",
    name: "Bitcoin",
    description: "BTC",
    shares: 0.05,
    avgPrice: 32000, // USD
    investedUSD: 32000 * 0.05,
    lastPriceUSD: 0,
    marketValueUSD: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 120,
  },
  {
    id: uid("asset:"),
    type: "stock",
    symbol: "ICBP.JK",
    name: "Indofood CBP",
    description: "Food producer, Indonesia",
    shares: 100,
    avgPrice: 4200, // IDR per share — avgPrice stored as USD in system, but we'll convert as needed
    investedUSD: 0, // computed
    lastPriceUSD: 0,
    marketValueUSD: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
  },
  {
    id: uid("asset:"),
    type: "non-liquid",
    symbol: "Land-Bali-01",
    name: "Land (Bali)",
    description: "Jl. Sunset - plot 12",
    shares: 1,
    avgPrice: 150000, // USD or indicates value depending on display ccy; we interpret as USD internally
    investedUSD: 150000,
    lastPriceUSD: 0,
    marketValueUSD: 0,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 365,
    nonLiquid: {
      yoyGainPct: 5, // percent gain per year default
      purchaseDate: Date.now() - 1000 * 60 * 60 * 24 * 365,
    }
  }
];

// ----------------------------- MAIN COMPONENT -----------------------------
export default function PortfolioDashboardPage() {
  // ---------- load from localStorage or defaults ----------
  const loadAssets = () => {
    try {
      if (!isBrowser) return defaultExampleAssets;
      const raw = JSON.parse(localStorage.getItem(LS_ASSETS) || "null");
      if (!raw || !Array.isArray(raw)) return defaultExampleAssets;
      return raw.map(ensureNumericAsset);
    } catch (e) { return defaultExampleAssets; }
  };
  const loadTx = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem(LS_TX) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  };
  const loadRealized = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem(LS_REALIZED) || 0);
    } catch { return 0; }
  };
  const loadDisplayCcy = () => {
    try {
      if (!isBrowser) return "USD";
      return localStorage.getItem(LS_DISPLAY_CCY) || "USD";
    } catch { return "USD"; }
  };
  const loadUsdIdr = () => {
    try {
      if (!isBrowser) return 16000;
      return toNum(localStorage.getItem(LS_USD_IDR) || 16000);
    } catch { return 16000; }
  };

  const [assets, setAssets] = useState(loadAssets);
  const [transactions, setTransactions] = useState(loadTx);
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);
  const [usdIdr, setUsdIdr] = useState(loadUsdIdr);

  // UI state
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // 'crypto' | 'id' | 'us' | 'non-liquid' (for manual)
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [addNonLiquidFields, setAddNonLiquidFields] = useState({ name: "", description: "", value: "", ccy: "USD", yoyPct: 5, purchaseDate: "" });

  const [lastTick, setLastTick] = useState(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // polling & refs
  const assetsRef = useRef(assets);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  // UI small
  const [openPortfolioDropdown, setOpenPortfolioDropdown] = useState(false); // icon-only dropdown state
  const [openValueDropdown, setOpenValueDropdown] = useState(false); // the value "5.589.686 IDR ˅"
  const [openSortMenu, setOpenSortMenu] = useState(false);
  const [sortCriteria, setSortCriteria] = useState("value-desc"); // default sort
  const sortMenuRef = useRef(null);
  const outsideRef = useRef(null);

  // trade modal
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  // chart UI
  const [growthTimeframe, setGrowthTimeframe] = useState("ALL"); // '1D','2D','1W','1M','1Y','ALL'
  const [growthChartData, setGrowthChartData] = useState(null);
  const [cakeData, setCakeData] = useState([]);
  const [selectedAssetForChart, setSelectedAssetForChart] = useState(null); // asset id active chart (tradingview/coin)
  const [chartLibReady, setChartLibReady] = useState(false);

  // initial localStorage persistence
  useEffect(() => {
    try { localStorage.setItem(LS_ASSETS, JSON.stringify(assets.map(ensureNumericAsset))); } catch {}
  }, [assets]);
  useEffect(() => { try { localStorage.setItem(LS_TX, JSON.stringify(transactions)); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem(LS_REALIZED, String(realizedUSD)); } catch {} }, [realizedUSD]);
  useEffect(() => { try { localStorage.setItem(LS_DISPLAY_CCY, displayCcy); } catch {} }, [displayCcy]);
  useEffect(() => { try { localStorage.setItem(LS_USD_IDR, String(usdIdr)); } catch {} }, [usdIdr]);

  // outside click handler to close menus
  useEffect(() => {
    function onDocClick(e) {
      if (outsideRef.current && !outsideRef.current.contains(e.target)) {
        setOpenPortfolioDropdown(false);
        setOpenValueDropdown(false);
        setOpenSortMenu(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // load chart libs if available
  useEffect(() => {
    (async () => {
      await loadChartLibs();
      setChartLibReady(true);
    })();
  }, []);

  // ----------------------------- ENSURE NUMERIC ASSET -----------------------------
  function ensureNumericAsset(a) {
    return {
      ...a,
      shares: toNum(a.shares || 0),
      avgPrice: toNum(a.avgPrice || 0),
      investedUSD: toNum(a.investedUSD || (toNum(a.shares || 0) * toNum(a.avgPrice || 0))),
      lastPriceUSD: toNum(a.lastPriceUSD || 0),
      marketValueUSD: toNum(a.marketValueUSD || 0),
      createdAt: a.createdAt || Date.now(),
    };
  }

  // ----------------------------- FX (USD/IDR) -----------------------------
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        setFxLoading(true);
        const res = await fetch(`${COINGECKO_API_BASE}/simple/price?ids=tether&vs_currencies=idr`);
        if (!res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n && mounted) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
      } catch (e) {
        // silent
      } finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // helper normalize idr returned
  function normalizeIdr(v) {
    const n = Number(v);
    if (!n || isNaN(n)) return null;
    if (n > 1000) return Math.round(n);
    return Math.round(n * 1000);
  }

  // ----------------------------- SEARCH LOGIC (suggestions) -----------------------------
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API_BASE}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map(c => ({ id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name, source: "coingecko", type: "crypto" })));
          return;
        }
        // stock search via Yahoo proxy assumed on server; fallback to alpha query not available
        const proxyCandidates = [
          (t) => `/api/yahoo/search?q=${encodeURIComponent(t)}`, // user's existing proxy when available
          (t) => `/api/search?q=${encodeURIComponent(t)}`,
        ];
        let payload = null;
        for (const p of proxyCandidates) {
          try {
            const url = typeof p === "function" ? p(q) : p;
            const res = await fetch(url);
            if (!res.ok) continue;
            const json = await res.json();
            payload = json;
            if (payload) break;
          } catch (e) { /* continue */ }
        }
        if (!payload) { setSuggestions([]); return; }
        const rawList = payload.quotes || payload.result || payload.items || payload.data || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map(it => {
          const symbol = it.symbol || it.ticker || it.id || (typeof it === "string" ? it : "");
          const display = it.shortname || it.shortName || it.longname || it.longName || it.name || it.displayName || symbol;
          const exchange = it.exchange || it.fullExchangeName || "";
          const currency = it.currency || "";
          return { symbol: (String(symbol || "")).toUpperCase(), display: display || symbol, exchange, currency, source: "yahoo", type: "stock" };
        });
        setSuggestions(list.slice(0, 30));
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  // ----------------------------- PRICES POLLING: CRYPTO via CoinGecko -----------------------------
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId))).filter(Boolean);
        if (ids.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const res = await fetch(`${COINGECKO_API_BASE}/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`);
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

  // ----------------------------- PRICES POLLING: STOCKS via AlphaVantage (INDO first), fallback to Yahoo -----------------------------
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const stockSymbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 50);
        if (stockSymbols.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const map = {};
        for (const s of stockSymbols) {
          try {
            // Prefer AlphaVantage for Indonesian stocks
            // If symbol endsWith .JK treat as IDX
            const looksLikeId = String(s || "").toUpperCase().endsWith(".JK");
            if (ALPHA_VANTAGE_API_KEY && ALPHA_VANTAGE_API_KEY !== "demo") {
              // Tweak: use GLOBAL_QUOTE endpoint for current price
              const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(s)}&apikey=${ALPHA_VANTAGE_API_KEY}`);
              const js = await res.json();
              const price = toNum(js?.["Global Quote"]?.["05. price"] ?? js?.["Global Quote"]?.price ?? 0);
              if (price > 0) {
                let priceUSD = price;
                // If looks like IDR (Indonesian), price is in IDR; convert to USD using usdIdrRef
                if (looksLikeId) {
                  const fx = usdIdrRef.current || 1;
                  priceUSD = fx > 0 ? (price / fx) : price;
                }
                map[s] = { symbol: s, regularMarketPrice: priceUSD, _source: "alphavantage" };
                continue; // go to next symbol
              }
            }
            // Fallback: Yahoo / server proxy if available
            try {
              const res2 = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(s)}`);
              if (res2.ok) {
                const j = await res2.json();
                // find price in j
                const price = toNum(j?.quoteResponse?.result?.[0]?.regularMarketPrice ?? j?.price?.regularMarketPrice?.raw ?? 0);
                if (price > 0) {
                  let priceUSD = price;
                  const looksLikeId = String(s || "").toUpperCase().endsWith(".JK");
                  if (looksLikeId) {
                    const fx = usdIdrRef.current || 1;
                    priceUSD = fx > 0 ? (price / fx) : price;
                  }
                  map[s] = { symbol: s, regularMarketPrice: priceUSD, _source: "yahoo" };
                }
              }
            } catch (e) { /* ignore */ }
          } catch (e) {
            // per-symbol ignore
          }
        }

        // apply to assets
        setAssets(prev => prev.map(a => {
          if (a.type === "stock") {
            const q = map[a.symbol];
            const price = toNum(q?.regularMarketPrice ?? q?.c ?? 0);
            const looksLikeId = String(a.symbol || "").toUpperCase().endsWith(".JK");
            let priceUSD = price;
            if (looksLikeId && price > 0) {
              const fx = usdIdrRef.current || 1;
              priceUSD = fx > 0 ? (price / fx) : price;
            }
            // Fallback rule: if price is 0 or NaN -> keep avgPrice as lastPrice to avoid negative PnL
            const effectiveLast = priceUSD > 0 ? priceUSD : (a.lastPriceUSD || a.avgPrice || 0);
            return ensureNumericAsset({ ...a, lastPriceUSD: effectiveLast, marketValueUSD: effectiveLast * toNum(a.shares || 0) });
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
    const id = setInterval(pollStocks, 7000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // ----------------------------- Non-liquid auto growth calculation -----------------------------
  // For non-liquid assets we compute marketValueUSD based on Y-o-Y percent growth since purchase date
  useEffect(() => {
    setAssets(prev => prev.map(a => {
      if (a.type === "non-liquid" && a.nonLiquid) {
        const purchaseDate = a.nonLiquid.purchaseDate ? new Date(a.nonLiquid.purchaseDate).getTime() : a.createdAt || Date.now();
        const years = Math.max(0, (Date.now() - purchaseDate) / (1000 * 60 * 60 * 24 * 365));
        const rate = toNum(a.nonLiquid.yoyGainPct || 0) / 100;
        const base = toNum(a.avgPrice || 0);
        const valueNow = base * Math.pow(1 + rate, years);
        return ensureNumericAsset({ ...a, lastPriceUSD: valueNow, marketValueUSD: valueNow * toNum(a.shares || 0) });
      }
      return a;
    }));
  }, [assets.map(a => a.nonLiquid ? JSON.stringify(a.nonLiquid) : "").join("|"), usdIdr]);

  // ----------------------------- Rows & totals computed -----------------------------
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = toNum(aa.shares || 0) * last;
    const invested = toNum(aa.investedUSD || (toNum(aa.shares || 0) * aa.avgPrice));
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  // ----------------------------- Cake (donut -> cake) data -----------------------------
  useEffect(() => {
    const sorted = rows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0, 4);
    const others = sorted.slice(4);
    const otherVal = others.reduce((s, x) => s + (x.marketValueUSD || 0), 0);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherVal > 0) data.push({ name: "Other", value: otherVal, symbols: others.map(o => o.symbol) });
    setCakeData(data);
  }, [rows]);

  // ----------------------------- Growth Chart Data (time series synthesis) -----------------------------
  // We'll build multi-line series: sum across categories per timestamp
  useEffect(() => {
    (async () => {
      try {
        // Decide timeframe to number-of-days mapping
        const tf = growthTimeframe;
        let days = 365 * 5; // ALL -> 5 years history cap
        if (tf === "1D") days = 1;
        if (tf === "2D") days = 2;
        if (tf === "1W") days = 7;
        if (tf === "1M") days = 30;
        if (tf === "1Y") days = 365;
        // Build per-asset historical series (coingecko for crypto, alphavantage for stocks if available)
        const labels = []; // timestamps daily
        const seriesByCategory = { crypto: {}, stock: {}, nonLiquid: {} }; // category -> assetId -> [values]
        const dateList = []; // epoch ms
        const now = Date.now();

        // generate dateList descending oldest->newest
        for (let i = days - 1; i >= 0; i--) {
          const dt = new Date(now - i * 24 * 3600 * 1000);
          const key = dt.toISOString().slice(0, 10);
          labels.push(key);
          dateList.push(dt.getTime());
        }

        // helper to fetch cg history for asset.coingeckoId
        async function fetchCGHistory(id) {
          try {
            const res = await fetch(`${COINGECKO_API_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`);
            if (!res.ok) return null;
            const j = await res.json();
            // j.prices is [[ts, price], ...]
            const map = {};
            (j.prices || []).forEach(([ts, price]) => {
              const d = new Date(ts).toISOString().slice(0, 10);
              map[d] = price;
            });
            return map;
          } catch (e) { return null; }
        }

        // helper AlphaVantage daily series fetch (per-symbol)
        async function fetchAVDaily(symbol) {
          try {
            if (!ALPHA_VANTAGE_API_KEY || ALPHA_VANTAGE_API_KEY === "demo") return null;
            const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${ALPHA_VANTAGE_API_KEY}`);
            if (!res.ok) return null;
            const j = await res.json();
            const series = j["Time Series (Daily)"] || {};
            return series; // keyed by YYYY-MM-DD
          } catch (e) { return null; }
        }

        // for every asset produce values for each label
        for (const a of assets) {
          if (a.type === "crypto" && a.coingeckoId) {
            const map = await fetchCGHistory(a.coingeckoId);
            const vals = labels.map(l => toNum(map?.[l] ?? a.avgPrice ?? 0) * toNum(a.shares || 0));
            seriesByCategory.crypto[a.id] = vals;
          } else if (a.type === "stock") {
            const series = await fetchAVDaily(a.symbol);
            const vals = labels.map(l => {
              let p = toNum(series?.[l]?.["4. close"] ?? null);
              if (!p || p <= 0) {
                // fallback to lastPriceUSD or avgPrice
                p = a.lastPriceUSD > 0 ? a.lastPriceUSD : a.avgPrice || 0;
              } else {
                // if symbol likely IDR (.JK), convert to USD
                if (String(a.symbol || "").toUpperCase().endsWith(".JK")) {
                  const fx = usdIdrRef.current || 1;
                  p = fx > 0 ? (p / fx) : p;
                }
              }
              return p * toNum(a.shares || 0);
            });
            seriesByCategory.stock[a.id] = vals;
          } else if (a.type === "non-liquid") {
            // compute value via yoy growth per label date relative to purchase date
            const baseDate = a.nonLiquid?.purchaseDate ? new Date(a.nonLiquid.purchaseDate).getTime() : a.createdAt || Date.now();
            const baseVal = toNum(a.avgPrice || 0) * toNum(a.shares || 0);
            const r = toNum(a.nonLiquid?.yoyGainPct || 0) / 100;
            const vals = labels.map(l => {
              const dms = new Date(l).getTime();
              const yrs = Math.max(0, (dms - baseDate) / (1000 * 60 * 60 * 24 * 365));
              const nowVal = baseVal * Math.pow(1 + r, yrs);
              return nowVal;
            });
            seriesByCategory.nonLiquid[a.id] = vals;
          }
        }

        // sum per category per label
        const catLabels = labels;
        const cryptoLine = labels.map((_, i) => Object.keys(seriesByCategory.crypto).reduce((s, k) => s + (seriesByCategory.crypto[k]?.[i] || 0), 0));
        const stockLine = labels.map((_, i) => Object.keys(seriesByCategory.stock).reduce((s, k) => s + (seriesByCategory.stock[k]?.[i] || 0), 0));
        const nonLiquidLine = labels.map((_, i) => Object.keys(seriesByCategory.nonLiquid).reduce((s, k) => s + (seriesByCategory.nonLiquid[k]?.[i] || 0), 0));

        setGrowthChartData({
          labels: catLabels,
          datasets: [
            { label: "Crypto", data: cryptoLine, borderColor: "#4D96FF", fill: false },
            { label: "Stocks", data: stockLine, borderColor: "#6BCB77", fill: false },
            { label: "Non-Liquid", data: nonLiquidLine, borderColor: "#FF6B6B", fill: false }
          ]
        });
      } catch (e) {
        // on failure, build a synthetic flat series (fallback)
        const now = new Date();
        const labels = [];
        for (let i = 29; i >= 0; i--) labels.push(new Date(now - i * 24 * 3600 * 1000).toISOString().slice(0, 10));
        setGrowthChartData({
          labels,
          datasets: [
            { label: "Crypto", data: labels.map(() => 0), borderColor: "#4D96FF", fill: false },
            { label: "Stocks", data: labels.map(() => 0), borderColor: "#6BCB77", fill: false },
            { label: "Non-Liquid", data: labels.map(() => 0), borderColor: "#FF6B6B", fill: false }
          ]
        });
      }
    })();
  }, [assets, growthTimeframe, usdIdr]);

  // ----------------------------- UI: ADD / IMPORT / EXPORT CSV -----------------------------
  function exportCSV() {
    // Build a CSV that is clean for spreadsheets: two sections: Portfolio and Transactions
    const headers = ["id", "type", "symbol", "name", "description", "shares", "avgPriceUSD", "investedUSD", "lastPriceUSD", "marketValueUSD", "createdAt", "nonLiquidYoyPct", "nonLiquidPurchaseDate"];
    const lines = [];
    lines.push(["Portfolio Export"].join(","));
    lines.push(headers.join(","));
    for (const a of assets) {
      const row = [
        csvEscape(a.id),
        csvEscape(a.type),
        csvEscape(a.symbol || ""),
        csvEscape(a.name || ""),
        csvEscape(a.description || ""),
        csvEscape(a.shares ?? ""),
        csvEscape(a.avgPrice ?? ""),
        csvEscape(a.investedUSD ?? ""),
        csvEscape(a.lastPriceUSD ?? ""),
        csvEscape(a.marketValueUSD ?? ""),
        csvEscape(a.createdAt ?? ""),
        csvEscape(a.nonLiquid?.yoyGainPct ?? ""),
        csvEscape(a.nonLiquid?.purchaseDate ?? "")
      ];
      lines.push(row.join(","));
    }
    lines.push(""); // blank line
    lines.push(["Transactions Export"].join(","));
    const th = ["txId", "assetId", "type", "qty", "priceUSD", "timestamp", "note"];
    lines.push(th.join(","));
    for (const t of transactions) {
      const r = [
        csvEscape(t.id),
        csvEscape(t.assetId),
        csvEscape(t.type),
        csvEscape(t.qty),
        csvEscape(t.price),
        csvEscape(t.timestamp),
        csvEscape(t.note || "")
      ];
      lines.push(r.join(","));
    }
    // create blob
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
      const lines = text.split(/\r?\n/);
      // naive but robust parser: find the Portfolio header and parse until blank line, then Transactions
      const idxPortfolio = lines.findIndex(l => l.toLowerCase().includes("portfolio"));
      const idxTx = lines.findIndex(l => l.toLowerCase().includes("transaction"));
      let portfolioBlock = [];
      let txBlock = [];
      if (idxPortfolio >= 0) {
        const start = idxPortfolio + 1;
        const end = idxTx >= 0 ? idxTx : lines.length;
        portfolioBlock = lines.slice(start, end).filter(l => typeof l === "string" && l.trim().length > 0);
      } else {
        // fallback: try parse header at top
        portfolioBlock = lines.slice(0, lines.length).filter(l => l.trim().length > 0);
      }
      // if portfolioBlock has header row (contains id,type,symbol) detect and parse
      let parsedAssets = [];
      if (portfolioBlock.length > 0) {
        let headerRow = portfolioBlock[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        const startRow = headerRow.includes("id") ? 1 : 0;
        for (let i = startRow; i < portfolioBlock.length; i++) {
          const line = portfolioBlock[i];
          if (line.toLowerCase().includes("transactions export")) break;
          // simple csv parser respecting quotes
          const vals = [];
          let cur = "";
          let inQ = false;
          for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            if (ch === '"' && line[c+1] === '"') { cur += '"'; c++; continue; }
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { vals.push(cur); cur = ""; continue; }
            cur += ch;
          }
          vals.push(cur);
          const obj = {};
          for (let k = 0; k < headerRow.length; k++) {
            const key = headerRow[k];
            obj[key] = vals[k] ?? "";
          }
          // build asset object
          const a = {
            id: obj.id || uid("imp:"),
            type: obj.type || "stock",
            symbol: obj.symbol || obj.name || "",
            name: obj.name || obj.symbol || "",
            description: obj.description || "",
            shares: toNum(obj.shares || 0),
            avgPrice: toNum(obj.avgPriceUSD || obj.avgPrice || 0),
            investedUSD: toNum(obj.investedUSD || 0),
            lastPriceUSD: toNum(obj.lastPriceUSD || 0),
            marketValueUSD: toNum(obj.marketValueUSD || 0),
            createdAt: toNum(obj.createdAt) || Date.now(),
            nonLiquid: (obj.nonLiquidYoyPct || obj.nonLiquidPurchaseDate) ? {
              yoyGainPct: toNum(obj.nonLiquidYoyPct || 0),
              purchaseDate: obj.nonLiquidPurchaseDate || Date.now()
            } : undefined
          };
          parsedAssets.push(ensureNumericAsset(a));
        }
      }

      // parse transactions
      if (idxTx >= 0) {
        const start = idxTx + 1;
        const block = lines.slice(start).filter(l => l.trim().length > 0);
        const headerRow = block[0].split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        for (let i = 1; i < block.length; i++) {
          const line = block[i];
          const vals = [];
          let cur = "";
          let inQ = false;
          for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            if (ch === '"' && line[c+1] === '"') { cur += '"'; c++; continue; }
            if (ch === '"') { inQ = !inQ; continue; }
            if (ch === "," && !inQ) { vals.push(cur); cur = ""; continue; }
            cur += ch;
          }
          vals.push(cur);
          const obj = {};
          for (let k = 0; k < headerRow.length; k++) { obj[headerRow[k]] = vals[k] ?? ""; }
          const t = {
            id: obj.txId || uid("tx:"),
            assetId: obj.assetId || null,
            type: obj.type || "sell",
            qty: toNum(obj.qty || 0),
            price: toNum(obj.priceUSD || obj.price || 0),
            timestamp: obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now(),
            note: obj.note || ""
          };
          txBlock.push(t);
        }
      }

      // merge or replace
      if (merge) {
        const map = {};
        assets.forEach(a => map[a.symbol || a.id] = ensureNumericAsset(a));
        parsedAssets.forEach(a => map[a.symbol || a.id] = ensureNumericAsset(a));
        const merged = Object.values(map);
        setAssets(merged);
        setTransactions(prev => [...prev, ...txBlock]);
      } else {
        setAssets(parsedAssets);
        setTransactions(txBlock);
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

  // ----------------------------- ADD ASSET FLOW -----------------------------
  // Add manual non-liquid asset full custom
  function addNonLiquidAsset() {
    const v = addNonLiquidFields;
    if (!v.name || !v.value) { alert("Please provide name and value"); return; }
    const price = toNum(v.value);
    const a = ensureNumericAsset({
      id: uid("asset:"),
      type: "non-liquid",
      symbol: v.name.replace(/\s+/g, "-"),
      name: v.name,
      description: v.description || "",
      shares: 1,
      avgPrice: price,
      investedUSD: price,
      lastPriceUSD: price,
      marketValueUSD: price,
      createdAt: v.purchaseDate ? new Date(v.purchaseDate).getTime() : Date.now(),
      nonLiquid: { yoyGainPct: toNum(v.yoyPct || 0), purchaseDate: v.purchaseDate ? new Date(v.purchaseDate).getTime() : Date.now() }
    });
    setAssets(prev => [...prev, a]);
    setAddNonLiquidFields({ name: "", description: "", value: "", ccy: "USD", yoyPct: 5, purchaseDate: "" });
    setOpenAdd(false);
  }

  // Add from suggestion or manual typed symbol
  function addAssetFromSuggestion(s) {
    const internalId = uid(`${s.source || s.type}:`);
    const asset = ensureNumericAsset({
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      description: s.exchange ? `${s.exchange}` : "",
      shares: 0,
      avgPrice: 0,
      investedUSD: 0,
      lastPriceUSD: 0,
      marketValueUSD: 0,
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
        id: uid("manual:cg:"),
        type: "crypto",
        coingeckoId: typed.toLowerCase(),
        symbol: typed.toUpperCase(),
        name: typed,
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0
      });
    } else if (searchMode === "non-liquid") {
      // open non-liquid add form instead
      setOpenAdd(true);
      return;
    } else {
      newAsset = ensureNumericAsset({
        id: uid("manual:yh:"),
        type: "stock",
        symbol: typed.toUpperCase(),
        name: typed.toUpperCase(),
        description: "",
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0
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

    const internalId = uid(`${picked.source || picked.type}:`);
    const priceInUSD = initPriceCcy === "IDR" ? (initPriceCcy === "IDR" ? (priceInput / (usdIdr || 1)) : priceInput) : priceInput;
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
      createdAt: Date.now()
    });
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  // ----------------------------- TRADE MODAL ACTIONS -----------------------------
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId); if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null }); }

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
    const tx = { id: uid("tx:"), assetId: id, type: "buy", qty: q, price: p, timestamp: Date.now(), note: "" };
    setTransactions(prev => [...prev, tx]);
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
    // update or remove asset
    const newShares = oldShares - q;
    const newInvested = a.investedUSD - costOfSold;
    const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
    setAssets(prev => {
      if (newShares <= 0) return prev.filter(x => x.id !== id);
      return prev.map(x => x.id === id ? ensureNumericAsset({ ...x, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p }) : ensureNumericAsset(x));
    });
    const tx = { id: uid("tx:"), assetId: id, type: "sell", qty: q, price: p, timestamp: Date.now(), realizedUsd: realized, note: "" };
    setTransactions(prev => [...prev, tx]);
    closeTradeModal();
  }

  // ----------------------------- DELETE / UNDO TX -----------------------------
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  function undoTransaction(txId) {
    // find tx
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    // if tx.type === sell -> restore quantity & deduct realizedUSD
    if (tx.type === "sell") {
      // find asset; if not present, re-create asset with qty
      const asset = assets.find(a => a.id === tx.assetId);
      if (asset) {
        // add back shares
        setAssets(prev => prev.map(a => a.id === asset.id ? ensureNumericAsset({ ...a, shares: toNum(a.shares || 0) + toNum(tx.qty || 0), investedUSD: toNum(a.investedUSD || 0) + (toNum(tx.qty || 0) * (a.avgPrice || 0)) }) : a));
      } else {
        // asset was removed on sell -> recreate minimal entry
        const newA = ensureNumericAsset({ id: tx.assetId, type: "stock", symbol: tx.symbol || "RESTORED", name: tx.symbol || "RESTORED", shares: toNum(tx.qty || 0), avgPrice: tx.price || 0, investedUSD: toNum(tx.qty || 0) * (tx.price || 0), lastPriceUSD: tx.price || 0, marketValueUSD: toNum(tx.qty || 0) * (tx.price || 0), createdAt: Date.now() });
        setAssets(prev => [...prev, newA]);
      }
      // adjust realized
      setRealizedUSD(prev => prev - (toNum(tx.realizedUsd || 0)));
    } else if (tx.type === "buy") {
      // undo buy -> subtract quantity & invested
      const asset = assets.find(a => a.id === tx.assetId);
      if (asset) {
        const newShares = Math.max(0, (toNum(asset.shares || 0) - toNum(tx.qty || 0)));
        const newInvested = Math.max(0, toNum(asset.investedUSD || 0) - (toNum(tx.qty || 0) * toNum(tx.price || 0)));
        if (newShares <= 0) {
          setAssets(prev => prev.filter(a => a.id !== asset.id));
        } else {
          setAssets(prev => prev.map(a => a.id === asset.id ? ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newShares > 0 ? (newInvested / newShares) : 0, marketValueUSD: newShares * (a.lastPriceUSD || a.avgPrice) }) : a));
        }
      }
    }
    // remove tx
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  // ----------------------------- SORT / FILTER (table) -----------------------------
  function applySort(rows) {
    const r = rows.slice();
    if (sortCriteria === "value-desc") {
      r.sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    } else if (sortCriteria === "value-asc") {
      r.sort((a, b) => a.marketValueUSD - b.marketValueUSD);
    } else if (sortCriteria === "alpha-asc") {
      r.sort((a, b) => String(a.symbol || a.name).localeCompare(String(b.symbol || b.name)));
    } else if (sortCriteria === "alpha-desc") {
      r.sort((a, b) => String(b.symbol || b.name).localeCompare(String(a.symbol || a.name)));
    } else if (sortCriteria === "newest") {
      r.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortCriteria === "oldest") {
      r.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }
    return r;
  }

  const visibleRows = useMemo(() => {
    let r = rows;
    // apply portfolio filter icon (All / Crypto / Stock / Non-Liquid)
    // openPortfolioDropdown toggles selection; for simplicity manage via openPortfolioDropdown -> not ideal but matches UI request: icon dropdown only
    // We'll keep separate state in openPortfolioDropdownSelected
    return applySort(r);
  }, [rows, sortCriteria]);

  // ----------------------------- UI small utilities -----------------------------
  function colorForIndex(i) {
    const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
    return palette[i % palette.length];
  }

  // ----------------------------- SMALL UI SUBCOMPONENTS -----------------------------
  function AddButton({ open, onToggle }) {
    return (
      <button
        onClick={onToggle}
        aria-label="Add asset"
        title="Add asset"
        className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform transition-transform ${open ? "rotate-45" : "rotate-0"} hover:scale-105`}
      >
        +
      </button>
    );
  }

  // ----------------------------- RENDER -----------------------------
  return (
    <div ref={outsideRef} className="min-h-screen bg-black text-gray-200 p-6" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">All Portfolio</h1>
              {/* portfolio icon-only dropdown (˅) */}
              <button
                onClick={() => setOpenPortfolioDropdown(v => !v)}
                className="ml-1 p-1 rounded hover:bg-white/5 transition"
                aria-label="Open portfolio selector"
                title="Portfolio selector"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {openPortfolioDropdown && (
                <div style={{ minWidth: 160 }} className="absolute bg-gray-900 border border-gray-800 rounded mt-10 p-2 z-50">
                  <button onClick={() => { /* set filter to All */ setOpenPortfolioDropdown(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-800 rounded">All</button>
                  <button onClick={() => { /* set filter to crypto */ setOpenPortfolioDropdown(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-800 rounded">Crypto</button>
                  <button onClick={() => { /* set filter to stock */ setOpenPortfolioDropdown(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-800 rounded">Stocks</button>
                  <button onClick={() => { /* set filter to non-liquid */ setOpenPortfolioDropdown(false); }} className="w-full text-left px-2 py-1 hover:bg-gray-800 rounded">Non-Liquid</button>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
              {isInitialLoading && assets.length > 0 ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  <span>Loading portfolio data...</span>
                </>
              ) : (lastTick &&
                <>
                  <span>Updated: {new Date(lastTick).toLocaleString()}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? (
                    <svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : usdIdr?.toLocaleString()}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">
              {displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}
            </div>

            {/* Value display as nominal + ccy + icon (no box) */}
            <div style={{ cursor: "pointer" }} className="text-sm px-2 py-1 rounded hover:bg-white/5 transition" onClick={() => setOpenValueDropdown(v => !v)}>
              <span className="text-lg font-semibold">{displayCcy === "IDR" ? fmt(Math.round(totals.market * usdIdr)) : fmt(Math.round(totals.market))}</span>
              <span className="ml-1">{displayCcy}</span>
              <span className="ml-2">˅</span>
              {openValueDropdown && (
                <div className="absolute mt-10 bg-gray-900 border border-gray-800 rounded p-2 z-50">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setDisplayCcy("USD"); setOpenValueDropdown(false); }} className="px-3 py-1 hover:bg-gray-800 rounded">USD</button>
                    <button onClick={() => { setDisplayCcy("IDR"); setOpenValueDropdown(false); }} className="px-3 py-1 hover:bg-gray-800 rounded">IDR</button>
                  </div>
                </div>
              )}
            </div>

            <AddButton open={openAdd} onToggle={() => setOpenAdd(v => !v)} />
          </div>
        </div>

        {/* KPI ROW */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market value</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Gain P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")} ({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex justify-between text-gray-400 items-center">
            <div>Realized P&L</div>
            <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}</div>
            {/* small slanted arrow icon to indicate clickable for transaction log */}
            <button
              onClick={() => { /* open transaction log */ const el = document.getElementById("txlog"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}
              title="View transactions"
              className="ml-2 p-1 rounded bg-white/5 hover:bg-white/10 transition"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                <path d="M4 12 L12 4 L20 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="16" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" fill="rgba(255,255,255,0.03)" />
              </svg>
            </button>
          </div>
        </div>

        {/* ADD PANEL (if open) */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Saham ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
                <button onClick={() => { setSearchMode("non-liquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "non-liquid" ? "bg-gray-800" : ""}`}>Non-Liquid</button>
              </div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row items-start">
              {searchMode === "non-liquid" ? (
                <div className="w-full sm:max-w-lg bg-gray-900 p-3 rounded">
                  <div className="mb-2 text-sm text-gray-400">Custom asset (non-liquid)</div>
                  <input placeholder="Name (e.g. Land, Art, Rolex)" value={addNonLiquidFields.name} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, name: e.target.value }))} className="w-full mb-2 rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700"/>
                  <input placeholder="Description (optional)" value={addNonLiquidFields.description} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, description: e.target.value }))} className="w-full mb-2 rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700"/>
                  <div className="flex gap-2">
                    <input placeholder="Value" value={addNonLiquidFields.value} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, value: e.target.value }))} className="rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-32"/>
                    <select value={addNonLiquidFields.ccy} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, ccy: e.target.value }))} className="rounded bg-gray-800 px-2 py-2 text-sm border border-gray-700">
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                    </select>
                    <input type="number" placeholder="YoY % (e.g. 5)" value={addNonLiquidFields.yoyPct} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, yoyPct: e.target.value }))} className="rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700 w-24"/>
                    <input type="date" value={addNonLiquidFields.purchaseDate} onChange={(e) => setAddNonLiquidFields(s => ({ ...s, purchaseDate: e.target.value }))} className="rounded bg-gray-800 px-3 py-2 text-sm border border-gray-700"/>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={addNonLiquidAsset} className="bg-emerald-500 text-black px-4 py-2 rounded font-semibold hover:scale-105 transition">Add Asset</button>
                    <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative w-full sm:max-w-lg">
                    <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                    {suggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
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
                    <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add</button>
                    <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold">Add + Position</button>
                    <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : applySort(visibleRows).map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => { setSelectedAssetForChart(r.id); }}>
                      {r.symbol}
                    </div>
                    <div className="text-xs text-gray-400">{r.name} {r.description ? `• ${r.description}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black hover:scale-105 transition">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs hover:scale-105 transition">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black hover:scale-105 transition">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PORTFOLIO GROWTH CHART (between table and cake) */}
        <div className="mt-6 bg-transparent p-3 rounded">
          <div className="bg-gray-900 p-4 rounded">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Portfolio Growth</h3>
              <div className="flex items-center gap-2">
                {["1D","2D","1W","1M","1Y","ALL"].map(tf => (
                  <button key={tf} onClick={() => setGrowthTimeframe(tf)} className={`px-2 py-1 rounded ${growthTimeframe===tf ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"} hover:scale-105 transition`}>{tf}</button>
                ))}
              </div>
            </div>
            <div className="bg-black/40 p-3 rounded">
              {/* Use Chart.js line if available, else SVG fallback */}
              {growthChartData && chartLibReady && typeof window !== "undefined" ? (
                // dynamic import of react-chartjs-2 Line if present
                <DynamicLineChart data={growthChartData} displayCcy={displayCcy} usdIdr={usdIdr} />
              ) : (
                // fallback simple SVG sparkline for each category
                <SimpleMultiLineSVG data={growthChartData} usdIdr={usdIdr} displayCcy={displayCcy} />
              )}
            </div>
          </div>
        </div>

        {/* Cake chart + legend */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
          <div className="w-full sm:w-48 h-48 flex items-center justify-center">
            <CakeChart data={cakeData} total={totals.market} usdIdr={usdIdr} displayCcy={displayCcy} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1">
            {cakeData.map((d, i) => {
              const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
              return (
                <div key={d.name} className="flex items-center gap-3">
                  <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-sm" />
                  <div>
                    <div className="font-semibold text-gray-100">{d.name}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TRANSATION LOG (Realized P&L) */}
        <div id="txlog" className="mt-8 p-4 rounded bg-gray-900 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-gray-300">Transactions / Realized</div>
              <div className="text-xs text-gray-500">Click Undo to restore a sale (restores shares and adjusts realized P&L)</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
                Import CSV
                <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
              </label>
              <button onClick={exportCSV} className="bg-blue-600 px-3 py-2 rounded font-semibold">Export CSV</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="text-left py-2 px-3">Asset</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-right py-2 px-3">Qty</th>
                  <th className="text-right py-2 px-3">Price</th>
                  <th className="text-right py-2 px-3">Realized</th>
                  <th className="py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-gray-500">No transactions yet</td></tr>
                ) : transactions.slice().reverse().map(tx => {
                  const asset = assets.find(a => a.id === tx.assetId) || {};
                  return (
                    <tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                      <td className="px-3 py-3">{asset.symbol || tx.assetId}</td>
                      <td className="px-3 py-3">{tx.type}</td>
                      <td className="px-3 py-3 text-right">{tx.qty}</td>
                      <td className="px-3 py-3 text-right">{displayCcy === "IDR" ? fmtMoney(tx.price * usdIdr, "IDR") : fmtMoney(tx.price, "USD")}</td>
                      <td className="px-3 py-3 text-right">{displayCcy === "IDR" ? fmtMoney((tx.realizedUsd || 0) * usdIdr, "IDR") : fmtMoney(tx.realizedUsd || 0, "USD")}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => undoTransaction(tx.id)} className="bg-yellow-500 px-2 py-1 rounded text-xs hover:scale-105 transition">Undo</button>
                          <button onClick={() => setTransactions(prev => prev.filter(t => t.id !== tx.id))} className="bg-red-600 px-2 py-1 rounded text-xs hover:scale-105 transition">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* TRADE MODAL */}
        {tradeModal.open && (
          <TradeModalComp
            mode={tradeModal.mode}
            asset={assets.find(a => a.id === tradeModal.assetId)}
            defaultPrice={tradeModal.defaultPrice}
            onClose={closeTradeModal}
            onBuy={performBuy}
            onSell={performSell}
            usdIdr={usdIdr}
            displayCcy={displayCcy}
          />
        )}

        {/* ASSET CHART MODAL (TradingView / CoinGecko) */}
        {selectedAssetForChart && (
          <AssetChartModal
            asset={assets.find(a => a.id === selectedAssetForChart)}
            onClose={() => setSelectedAssetForChart(null)}
            usdIdr={usdIdr}
            displayCcy={displayCcy}
          />
        )}

      </div>
    </div>
  );
}

// ----------------------------- COMPONENT: TRADE MODAL -----------------------------
function TradeModalComp({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr, displayCcy }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice > 0 ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(() => { setPrice(defaultPrice > 0 ? String(defaultPrice) : ""); }, [defaultPrice]);

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
            <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none" placeholder="0.00"/>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700 focus:outline-none" placeholder="0.00"/>
              <select value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)} className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r focus:outline-none">
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

// ----------------------------- COMPONENT: ASSET CHART MODAL -----------------------------
function AssetChartModal({ asset, onClose, usdIdr, displayCcy }) {
  const [cgHistory, setCgHistory] = useState(null);
  useEffect(() => {
    if (!asset) return;
    (async () => {
      try {
        if (asset.type === "crypto" && asset.coingeckoId) {
          const res = await fetch(`${COINGECKO_API_BASE}/coins/${encodeURIComponent(asset.coingeckoId)}/market_chart?vs_currency=usd&days=365`);
          const j = await res.json();
          setCgHistory(j);
        }
        // if stock -> TradingView embed approach below
      } catch (e) {
        // ignore
      }
    })();
  }, [asset]);

  // if stock, we will render TradingView embed script in effect
  useEffect(() => {
    if (!asset) return;
    if (asset.type === "stock") {
      // inject tradingview script if not present
      const id = `tv-widget-${asset.symbol}`;
      // create container refresh
      setTimeout(() => {
        // TradingView widget options
        try {
          // If TradingView script already exists, create widget
          if (window?.TradingView) {
            // render widget
            const widget = new window.TradingView.widget({
              width: "100%",
              height: 500,
              symbol: asset.symbol || "NASDAQ:AAPL",
              interval: "D",
              timezone: "Etc/UTC",
              theme: "dark",
              style: "1",
              locale: "en",
              toolbar_bg: "#1f2937",
              enable_publishing: false,
              allow_symbol_change: true,
              container_id: id
            });
          } else {
            // load script and then instantiate
            const scr = document.createElement("script");
            scr.src = "https://s3.tradingview.com/tv.js";
            scr.async = true;
            scr.onload = () => {
              try {
                if (window?.TradingView) {
                  new window.TradingView.widget({
                    width: "100%",
                    height: 500,
                    symbol: asset.symbol || "NASDAQ:AAPL",
                    interval: "D",
                    timezone: "Etc/UTC",
                    theme: "dark",
                    style: "1",
                    locale: "en",
                    toolbar_bg: "#1f2937",
                    enable_publishing: false,
                    allow_symbol_change: true,
                    container_id: id
                  });
                }
              } catch (e) { /* ignore */ }
            };
            document.body.appendChild(scr);
          }
        } catch (e) {
          // ignore
        }
      }, 250);
    }
  }, [asset]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl overflow-auto border border-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-semibold">{asset.name} — {asset.symbol}</h3>
            <div className="text-xs text-gray-400">{asset.description}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-2">Close</button>
        </div>

        <div className="p-4">
          {asset.type === "crypto" && cgHistory ? (
            <div>
              <div className="mb-2 text-sm text-gray-300">CoinGecko price chart (USD)</div>
              <SimpleAssetHistorySVG history={cgHistory} usdIdr={usdIdr} displayCcy={displayCcy} />
            </div>
          ) : asset.type === "stock" ? (
            <div>
              <div id={`tv-widget-${asset.symbol}`} style={{ minHeight: 400 }} />
              <div className="text-xs text-gray-400 mt-2">TradingView chart (embed)</div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-gray-300">Non-liquid asset projection</div>
              <div className="mt-2">
                <div>Estimated current value: {displayCcy === "IDR" ? fmtMoney(asset.lastPriceUSD * usdIdr, "IDR") : fmtMoney(asset.lastPriceUSD, "USD")}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------- SIMPLE SVG LINE CHART (fallback) -----------------------------
function SimpleMultiLineSVG({ data, usdIdr, displayCcy }) {
  if (!data) return <div className="text-gray-400">No chart data</div>;
  const width = 900, height = 260, pad = 20;
  const labels = data.labels || [];
  const datasets = data.datasets || [];
  const maxVal = Math.max(...datasets.flatMap(ds => ds.data), 1);
  const minVal = Math.min(...datasets.flatMap(ds => ds.data), 0);
  const scaleX = (i) => pad + (i / Math.max(1, labels.length - 1)) * (width - pad * 2);
  const scaleY = (v) => height - pad - ((v - minVal) / Math.max(1, (maxVal - minVal))) * (height - pad * 2);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {/* grid */}
      {[0,1,2,3,4].map(i => <line key={i} x1={pad} x2={width-pad} y1={pad + i*(height-2*pad)/4} y2={pad + i*(height-2*pad)/4} stroke="rgba(255,255,255,0.03)" />)}
      {datasets.map((ds, idx) => {
        const points = (ds.data || []).map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" ");
        return (
          <polyline key={idx} points={points} fill="none" stroke={ds.borderColor || "#888"} strokeWidth={2} strokeLinecap="round" />
        );
      })}
      <g>
        {/* tiny legend */}
        {datasets.map((ds, i) => (
          <g key={i} transform={`translate(${pad + i*120},${10})`}>
            <rect width="10" height="6" fill={ds.borderColor} rx="2" />
            <text x="14" y="6" fontSize="10" fill="#ccc">{ds.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ----------------------------- SIMPLE ASSET HISTORY SVG (crypto) -----------------------------
function SimpleAssetHistorySVG({ history, usdIdr, displayCcy }) {
  // history.prices: [[ts, price], ...]
  const arr = (history?.prices || []).slice(-120);
  if (!arr.length) return <div className="text-gray-400">No history</div>;
  const width = 900, height = 320, pad = 30;
  const vals = arr.map(([ts, p]) => p);
  const maxV = Math.max(...vals);
  const minV = Math.min(...vals);
  const scaleX = (i) => pad + (i / Math.max(1, vals.length - 1)) * (width - pad * 2);
  const scaleY = (v) => height - pad - ((v - minV) / Math.max(1, (maxV - minV))) * (height - pad * 2);
  const points = vals.map((v, i) => `${scaleX(i)},${scaleY(v)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={width} height={height} fill="transparent" />
      <polyline points={points} fill="none" stroke="#4D96FF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ----------------------------- CAKE CHART (SVG custom) -----------------------------
function CakeChart({ data = [], total = 0, usdIdr = 16000, displayCcy = "USD" }) {
  // data: [{name, value}]
  // We'll draw pie slices but with variable outer radius proportional to value (cake style)
  const size = 180;
  const cx = size / 2, cy = size / 2;
  const inner = 40;
  const rBase = size / 2 - 6;
  const totalVal = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  // colors
  const colors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];

  let start = -90;
  return (
    <div className="relative">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const portion = Math.max(0, d.value || 0) / totalVal;
          const angle = portion * 360;
          const end = start + angle;
          const large = angle > 180 ? 1 : 0;
          const sRad = (Math.PI * start) / 180;
          const eRad = (Math.PI * end) / 180;
          // outer radius scaled by sqrt of value to emphasize larger pieces a bit more
          const outer = inner + (rBase - inner) * Math.max(0.15, Math.sqrt(portion));
          const x1 = cx + outer * Math.cos(sRad), y1 = cy + outer * Math.sin(sRad);
          const x2 = cx + outer * Math.cos(eRad), y2 = cy + outer * Math.sin(eRad);
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} Z`;
          start = end;
          return <path key={i} d={path} fill={colors[i % colors.length]} stroke="#0b0b0b" strokeWidth="0.6" className="slice hover:opacity-90 transition-all" />;
        })}
        <circle cx={cx} cy={cy} r={inner - 2} fill="#070707" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="10" fill="#888">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="14" fill="#eee" fontWeight="700">
          {displayCcy === "IDR" ? fmt(Math.round(total * usdIdr)) + " IDR" : fmtMoney(total, "USD")}
        </text>
      </svg>
    </div>
  );
}

// ----------------------------- DYNAMIC LINE CHART (Chart.js if available) -----------------------------
function DynamicLineChart({ data, usdIdr, displayCcy }) {
  const [LineComp, setLineComp] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const { ReactChart } = await loadChartLibs();
        if (ReactChart?.Line) setLineComp(() => ReactChart.Line);
        else setLineComp(null);
      } catch { setLineComp(null); }
    })();
  }, []);
  if (!LineComp) return <SimpleMultiLineSVG data={data} usdIdr={usdIdr} displayCcy={displayCcy} />;

  const chartData = {
    labels: data.labels,
    datasets: data.datasets.map(ds => ({
      label: ds.label,
      data: ds.data,
      fill: false,
      borderColor: ds.borderColor,
      tension: 0.2
    }))
  };
  const options = {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: true } },
    scales: { x: { display: true }, y: { display: true } }
  };
  return <div style={{ width: "100%", height: 320 }}><LineComp data={chartData} options={options} /></div>;
}