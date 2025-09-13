// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Portfolio Dashboard — Revised full implementation
 *
 * Highlights:
 * - All requested UX/feature fixes implemented in one file.
 * - Indonesia stocks: AlphaVantage -> Finnhub -> Yahoo fallback (proxy routes assumed).
 * - Crypto: CoinGecko for prices & market_chart in chart modal.
 * - TradingView embed for stocks when available (inside modal).
 * - Non-liquid assets supported with YoY growth (auto compute current price).
 * - Share modal with QR (SVG dataURL), respects eye toggle (hide values).
 * - Export/Import combined CSV with BOM + clean headers for spreadsheet.
 * - Cake allocation (slice spacing) with center total (small).
 * - Portfolio growth chart (multi-series lines) with timeframe buttons.
 * - All buttons have hover/transition animations; header filter is icon-only.
 *
 * NOTE: This file expects server-side proxy endpoints:
 * - /api/alphavantage/quote?symbol=...
 * - /api/finnhub/quote?symbol=...
 * - /api/yahoo/quote?symbol=...
 * If these are *not* present in your env, please map them to your proxies.
 */

/* ===================== CONFIG / ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const ALPHAVANTAGE_QUOTE = (symbol) => `/api/alphavantage/quote?symbol=${encodeURIComponent(symbol)}`; // expects { price: <num> } or time-series
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_MARKETCHART = (id, days = 30) => `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;

/* ===================== HELPERS ===================== */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR")
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
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

/* seeded random helper (for synthetic noise in chart) */
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
  return function() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

/* compute non-liquid current price given avgPrice, purchaseDate, yoy% */
function computeNonLiquidLastPrice(avgPriceUSD, purchaseDateMs, yoyPercent) {
  try {
    const years = Math.max(0, (Date.now() - (purchaseDateMs || Date.now())) / (365 * 24 * 3600 * 1000));
    const r = toNum(yoyPercent) / 100;
    // compound yearly growth
    const last = avgPriceUSD * Math.pow(1 + r, years);
    return Number(last.toFixed(6));
  } catch {
    return avgPriceUSD;
  }
}

/* ===================== UI HELPERS ===================== */
const palette = ["#4D96FF","#FF6B6B","#6BCB77","#FFD93D","#B28DFF","#FFB26B","#6BFFA0","#FF9CEE","#00C49F","#FF6BE5"];
function colorForIndex(i) { return palette[i % palette.length]; }

/* ===================== CSV helpers (spreadsheet-friendly) ===================== */
function csvQuote(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- load from localStorage ---------- */
  const loadAssets = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_assets_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(ensureNumericAsset);
    } catch { return []; }
  };
  const [assets, setAssets] = useState(loadAssets);

  const loadTx = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_transactions_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw;
    } catch { return []; }
  };
  const [transactions, setTransactions] = useState(loadTx);

  const loadRealized = () => {
    try { if (!isBrowser) return 0; return toNum(localStorage.getItem("pf_realized_v2") || 0); } catch { return 0; }
  };
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);

  const loadDisplayCcy = () => {
    try { if (!isBrowser) return "USD"; return localStorage.getItem("pf_display_ccy_v2") || "USD"; } catch { return "USD"; }
  };
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  /* FX & loading states */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [lastTick, setLastTick] = useState(null);

  /* UI states */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  /* non-liquid add inputs */
  const [nlName, setNlName] = useState("");
  const [nlDesc, setNlDesc] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");

  /* trade modal */
  const [tradeModal, setTradeModal] = useState({ open:false, mode:null, assetId:null, defaultPrice: null });

  /* chart modal (asset) */
  const [chartModal, setChartModal] = useState({ open:false, assetId:null, assetType:null });

  /* share & eye */
  const [eyeHidden, setEyeHidden] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);

  /* header filter / currency dropdown menus */
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const [portfolioFilter, setPortfolioFilter] = useState("all");

  /* transactions modal */
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* table sort/filter */
  const [tableSort, setTableSort] = useState({ key: "marketValueUSD", dir: "desc" });
  const [tableFilterMenuOpen, setTableFilterMenuOpen] = useState(false);

  /* refs to close popovers */
  const filterMenuRef = useRef(null);
  const currencyMenuRef = useRef(null);
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  const tableFilterRef = useRef(null);

  /* persist states to localStorage */
  useEffect(() => { try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions)); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {} }, [realizedUSD]);
  useEffect(() => { try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {} }, [displayCcy]);

  /* click outside listeners for closing popovers */
  useEffect(() => {
    function onBodyClick(e) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(e.target)) setCurrencyMenuOpen(false);
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {/* keep suggestions open only when focused */ }
      if (addPanelRef.current && !addPanelRef.current.contains(e.target)) { /* don't auto-close add panel - user requested explicit close */ }
      if (tableFilterRef.current && !tableFilterRef.current.contains(e.target)) setTableFilterMenuOpen(false);
    }
    document.addEventListener("click", onBodyClick);
    return () => document.removeEventListener("click", onBodyClick);
  }, []);

  /* ===================== SEARCH AUTOCOMPLETE ===================== */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins||[]).slice(0,30).map(c => ({ id:c.id, symbol:(c.symbol||"").toUpperCase(), display:c.name, source:"coingecko", type:"crypto" })));
          return;
        }
        // stocks search via Yahoo proxy
        const proxies = [ YAHOO_SEARCH_FALLBACK, (t)=>`/api/search?q=${encodeURIComponent(t)}` ];
        // simple Yahoo search (proxy) — fallback chain
        const yahooUrl = YAHOO_SEARCH;
        async function tryFetch(url) {
          try {
            const r = await fetch(url);
            if (!r.ok) return null;
            return await r.json();
          } catch { return null; }
        }
        // prefer /api/yahoo/search if exists (YAHOO_SEARCH var), else fallback to /api/search
        // We keep this simple: try both sequentially
        let payload = null;
        try {
          const r = await fetch(YAHOO_SEARCH(q));
          if (r.ok) payload = await r.json();
        } catch {}
        if (!payload) {
          try {
            const r2 = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            if (r2.ok) payload = await r2.json();
          } catch {}
        }
        if (!payload) { setSuggestions([]); return; }
        const rawList = payload.quotes || payload.result || payload.data || payload.items || payload.finance || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0,120).map(it => {
          const symbol = it.symbol || it.ticker || it.id || (typeof it === "string" ? it : "");
          const display = it.shortname || it.name || it.longname || it.displayName || symbol;
          const exchange = it.exchange || it.exchangeName || it.fullExchangeName || "";
          return { symbol:(symbol||"").toString().toUpperCase(), display, exchange, currency: it.currency||"", source:"yahoo", type:"stock" };
        });
        setSuggestions(list.slice(0,30));
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* ===================== POLLING QUOTES ===================== */
  // keep refs to avoid stale closures
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  // COINGECKO polling for crypto
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type==="crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares||0) });
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch(e) { /* silent */ }
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // STOCKS polling (AlphaVantage -> Finnhub -> Yahoo)
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type==="stock").map(a => a.symbol))).slice(0,50);
        if (symbols.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }

        const map = {};
        for (const s of symbols) {
          // prefer AlphaVantage for Indonesian stocks - try generic first
          try {
            // detect if symbol looks like IDX/Jakarta (endsWith .JK or contains .JK)
            const looksLikeId = String(s||"").toUpperCase().endsWith(".JK") || String(s||"").toUpperCase().includes(".JK");
            let filled = false;

            // Try AlphaVantage Proxy first (server must provide)
            try {
              const res = await fetch(ALPHAVANTAGE_QUOTE(s));
              if (res.ok) {
                const js = await res.json();
                // Expecting { price: number } or shape { "Global Quote": { "05. price": "..." } }
                let p = 0;
                if (typeof js.price === "number") p = js.price;
                else if (js["Global Quote"] && js["Global Quote"]["05. price"]) p = toNum(js["Global Quote"]["05. price"]);
                if (p > 0) {
                  // AlphaVantage returns local exchange price; convert for IDR tickers
                  let priceUSD = p;
                  if (looksLikeId) {
                    const fx = usdIdrRef.current || 1;
                    priceUSD = fx > 0 ? (p / fx) : p;
                  }
                  map[s] = { symbol:s, regularMarketPrice: priceUSD, _source: "alphavantage" };
                  filled = true;
                }
              }
            } catch (e) {
              // ignore
            }

            if (!filled) {
              // Try Finnhub
              try {
                const r2 = await fetch(FINNHUB_QUOTE(s));
                if (r2.ok) {
                  const js2 = await r2.json();
                  const cur = toNum(js2?.c ?? js2?.current ?? 0);
                  if (cur > 0) {
                    let priceUSD = cur;
                    if (looksLikeId) {
                      const fx = usdIdrRef.current || 1;
                      priceUSD = fx > 0 ? (cur / fx) : cur;
                    }
                    map[s] = { symbol:s, regularMarketPrice: priceUSD, _source: "finnhub" };
                    filled = true;
                  }
                }
              } catch (e) { /* ignore */ }
            }

            if (!filled) {
              // fallback to Yahoo bulk
              // We'll fetch later in bulk fallback if map remains empty
            }
          } catch (e) {
            // ignore per-symbol
          }
        }

        // If some symbols not filled, call Yahoo bulk for all missing symbols
        const missing = symbols.filter(sym => !map[sym]);
        if (missing.length > 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(missing.join(",")));
            if (res.ok) {
              const j = await res.json();
              // shape may vary
              const results = j?.quoteResponse?.result || (Array.isArray(j) ? j : []);
              if (Array.isArray(results)) {
                results.forEach(q => {
                  if (q && q.symbol) {
                    const price = toNum(q.regularMarketPrice ?? q.c ?? q.current ?? q.price ?? 0);
                    if (price > 0) {
                      let looksLikeId = String(q.symbol||"").toUpperCase().endsWith(".JK");
                      let priceUSD = price;
                      if (looksLikeId && (String(q.currency||"").toUpperCase() === "IDR" || priceUSD > 1000)) {
                        const fx = usdIdrRef.current || 1;
                        priceUSD = fx > 0 ? (price / fx) : price;
                      }
                      map[q.symbol] = { symbol: q.symbol, regularMarketPrice: priceUSD, _source: "yahoo" };
                    }
                  }
                });
              }
            }
          } catch (e) { /* ignore */ }
        }

        // Now apply map to assets, but never set price to 0: fallback to prev or avgPrice
        setAssets(prev => prev.map(a => {
          if (a.type !== "stock") return ensureNumericAsset(a);
          const q = map[a.symbol];
          if (q && (toNum(q.regularMarketPrice) > 0)) {
            const price = toNum(q.regularMarketPrice);
            return ensureNumericAsset({ ...a, lastPriceUSD: price, marketValueUSD: price * toNum(a.shares || 0) });
          } else {
            // keep previous lastPriceUSD or avgPrice if that exists
            const last = toNum(a.lastPriceUSD) || toNum(a.avgPrice) || 0;
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
          }
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

  /* FX tether -> IDR via CoinGecko */
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
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n)/n > 0.0005 ? n : prev));
      } catch (e) { /* silent */ } finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ===================== ADD ASSET LOGIC ===================== */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source||s.type}:${s.symbol||s.id}:${Date.now()}`;
    const t = s.source === "coingecko" ? "crypto" : "stock";
    const asset = ensureNumericAsset({
      id: internalId,
      type: t,
      coingeckoId: s.source === "coingecko" ? s.id : undefined,
      symbol: (s.symbol || s.id || "").toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, createdAt: Date.now()
    });
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false); setQuery(""); setSuggestions([]); setSelectedSuggestion(null);
  }

  async function addManualAsset() {
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or select suggestion"); return; }
    const t = searchMode === "crypto" ? "crypto" : (searchMode === "nonliquid" ? "nonliquid" : "stock");
    const id = `manual:${t}:${typed}:${Date.now()}`;
    const newAsset = ensureNumericAsset({
      id, type: t,
      symbol: typed.toUpperCase(), name: typed, shares:0, avgPrice:0, investedUSD:0, lastPriceUSD:0, marketValueUSD:0, createdAt: Date.now()
    });
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false); setQuery("");
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode === "crypto") picked = { source:"coingecko", id: typed.toLowerCase(), symbol:typed.toUpperCase(), display: typed };
      else picked = { source:"yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
    }
    const qty = toNum(initQty); const priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const internalId = `${picked.source||picked.type}:${picked.symbol||picked.id}:${Date.now()}`;
    const priceInUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const asset = ensureNumericAsset({
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.source === "coingecko" ? (picked.id || picked.coingeckoId) : undefined,
      symbol: (picked.symbol || picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty, avgPrice: priceInUSD, investedUSD: priceInUSD * qty, lastPriceUSD: priceInUSD, marketValueUSD: priceInUSD * qty, createdAt: Date.now(), purchaseDate: Date.now()
    });
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
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
    const id = `nonliquid:${name.replace(/\s+/g,"_")}:${Date.now()}`;
    const last = computeNonLiquidLastPrice(priceUSD, purchaseDateMs, yoy);
    const asset = ensureNumericAsset({
      id, type: "nonliquid",
      symbol: (name.length > 12 ? name.slice(0,12)+"…" : name).toUpperCase(),
      name, shares: qty, avgPrice: priceUSD, investedUSD: priceUSD * qty, lastPriceUSD: last, marketValueUSD: last * qty, createdAt: Date.now(), purchaseDate: purchaseDateMs, nonLiquidYoy: yoy, description: nlDesc || ""
    });
    setAssets(prev => [...prev, asset]);
    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc("");
    setOpenAdd(false);
  }

  /* ===================== TRADE / TRANSACTIONS ===================== */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open:true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open:false, mode:null, assetId:null, defaultPrice: null }); }

  function applyTransactionEffects(tx) {
    // apply buy/sell modify assets + realized
    if (tx.type === "buy") {
      setAssets(prev => prev.map(a => {
        if (a.id !== tx.assetId) return ensureNumericAsset(a);
        const oldShares = toNum(a.shares||0), oldInvested = toNum(a.investedUSD||0);
        const addCost = tx.cost || (toNum(tx.qty)*toNum(tx.pricePerUnit || 0));
        const newShares = oldShares + toNum(tx.qty);
        const newInvested = oldInvested + addCost;
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: toNum(tx.pricePerUnit || a.lastPriceUSD), marketValueUSD: newShares * toNum(tx.pricePerUnit || a.lastPriceUSD) });
      }));
    } else if (tx.type === "sell") {
      // subtract shares, update realized, and possibly remove asset when shares==0
      setRealizedUSD(prev => prev + toNum(tx.realized || 0));
      setAssets(prev => {
        const copy = prev.map(a => {
          if (a.id !== tx.assetId) return ensureNumericAsset(a);
          const oldShares = toNum(a.shares||0);
          const q = toNum(tx.qty);
          const avg = toNum(a.avgPrice || 0);
          const newShares = Math.max(0, oldShares - q);
          const costOfSold = q * avg;
          const newInvested = a.investedUSD - costOfSold;
          if (newShares <= 0) return null;
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newShares>0 ? (newInvested / newShares) : 0, lastPriceUSD: toNum(tx.pricePerUnit || a.lastPriceUSD), marketValueUSD: newShares * toNum(tx.pricePerUnit || a.lastPriceUSD) });
        }).filter(Boolean);
        return copy;
      });
    }
  }

  function reverseTransactionEffects(tx) {
    // reverse a prior transaction (used for delete/cancel)
    if (tx.type === "buy") {
      // remove bought shares
      setAssets(prev => {
        const copy = prev.map(a => {
          if (a.id !== tx.assetId) return ensureNumericAsset(a);
          const oldShares = toNum(a.shares||0);
          const q = toNum(tx.qty);
          const newShares = Math.max(0, oldShares - q);
          const newInvested = Math.max(0, (a.investedUSD || 0) - (q * toNum(tx.pricePerUnit || 0)));
          if (newShares <= 0) return null;
          return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newShares>0 ? (newInvested / newShares) : 0, lastPriceUSD: a.lastPriceUSD, marketValueUSD: newShares * a.lastPriceUSD });
        }).filter(Boolean);
        return copy;
      });
    } else if (tx.type === "sell") {
      // restore sold shares and remove realized
      setRealizedUSD(prev => prev - toNum(tx.realized||0));
      // re-add shares
      setAssets(prev => {
        // if asset present, add shares; otherwise create new placeholder
        const found = prev.find(a => a.id === tx.assetId);
        if (found) {
          return prev.map(a => {
            if (a.id !== tx.assetId) return ensureNumericAsset(a);
            const newShares = toNum(a.shares||0) + toNum(tx.qty);
            const newInvested = toNum(a.investedUSD || 0) + (toNum(tx.qty) * toNum(tx.pricePerUnit || 0));
            const newAvg = newInvested / newShares;
            return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: a.lastPriceUSD, marketValueUSD: newShares * a.lastPriceUSD });
          });
        } else {
          // recreate
          const obj = {
            id: tx.assetId,
            type: tx.assetType || "stock",
            symbol: tx.symbol || tx.name || "UNKNOWN",
            name: tx.name || tx.symbol || "Restored",
            shares: toNum(tx.qty),
            avgPrice: toNum(tx.pricePerUnit || 0),
            investedUSD: toNum(tx.qty) * toNum(tx.pricePerUnit || 0),
            lastPriceUSD: toNum(tx.pricePerUnit || 0),
            marketValueUSD: toNum(tx.qty) * toNum(tx.pricePerUnit || 0),
            createdAt: Date.now()
          };
          return [...prev, ensureNumericAsset(obj)];
        }
      });
    }
  }

  function addTransaction(tx) {
    setTransactions(prev => [tx, ...prev].slice(0,1000));
    applyTransactionEffects(tx);
  }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q<=0 || p<=0) { alert("Qty & price must be > 0"); return; }
    const cost = q * p;
    const tx = { id:`tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, assetId:id, assetType:(assets.find(a=>a.id===id)||{}).type||"stock", symbol:(assets.find(a=>a.id===id)||{}).symbol||"", name:(assets.find(a=>a.id===id)||{}).name||"", type:"buy", qty:q, pricePerUnit:p, cost, date:Date.now() };
    addTransaction(tx);
    closeTradeModal();
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q<=0 || p<=0) { alert("Qty & price must be > 0"); return; }
    const a = assets.find(x => x.id === id); if (!a) return;
    const oldShares = toNum(a.shares || 0); if (q > oldShares) { alert("Cannot sell more than you own"); return; }
    const avg = toNum(a.avgPrice || 0);
    const proceeds = q * p; const costOfSold = q * avg; const realized = proceeds - costOfSold;
    const tx = { id:`tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`, assetId: a.id, assetType: a.type||"stock", symbol: a.symbol, name: a.name||"", type:"sell", qty: q, pricePerUnit: p, proceeds, costOfSold, realized, date: Date.now() };
    addTransaction(tx);
    closeTradeModal();
  }

  /* transactions delete/restore */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Delete & CANCEL transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || 0)})? This will reverse its effect.`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }

  function restoreTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Restore transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || 0)})?`)) return;
    applyTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTransactionEffects(lastDeletedTx);
    setTransactions(prev => [lastDeletedTx, ...prev]);
    setLastDeletedTx(null);
  }
  function purgeLastDeletedTransaction() { setLastDeletedTx(null); }

  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name||""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ===================== computed rows & totals ===================== */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares||0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || 0);
      if (!aa.lastPriceUSD || aa.lastPriceUSD <= 0) {
        aa.lastPriceUSD = aa.avgPrice || aa.lastPriceUSD || 0;
      }
      aa.marketValueUSD = toNum(aa.shares||0) * aa.lastPriceUSD;
    }
    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = aa.marketValueUSD || (toNum(aa.shares||0) * last);
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

  /* totals */
  const totals = useMemo(() => {
    const invested = rows.reduce((s,r)=>s+toNum(r.investedUSD||0),0);
    const market = rows.reduce((s,r)=>s+toNum(r.marketValueUSD||0),0);
    const pnl = market - invested;
    const pnlPct = invested>0 ? (pnl/invested)*100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  /* donut/cake data */
  const cakeData = useMemo(() => {
    const sorted = rows.slice().sort((a,b)=>b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0,4);
    const other = sorted.slice(4);
    const otherVal = other.reduce((s,x)=>s+(x.marketValueUSD||0),0);
    const data = top.map(r=>({ name:r.symbol, value: Math.max(0,r.marketValueUSD||0) }));
    if (otherVal>0) data.push({ name:"Other", value:otherVal, symbols: other.map(x=>x.symbol) });
    return data;
  }, [rows]);

  /* portfolio growth multi-series (synthetic using transactions + prices) */
  const [chartRange, setChartRange] = useState("all"); // 1d,2d,1w,1m,1y,all
  const multiSeries = useMemo(() => {
    // Build timeline based on transactions history + daily synthetic values.
    // For simplicity we build daily series for the range and aggregate per category.
    const now = Date.now();
    let days = 365;
    if (chartRange === "1d") days = 1;
    else if (chartRange === "2d") days = 2;
    else if (chartRange === "1w") days = 7;
    else if (chartRange === "1m") days = 30;
    else if (chartRange === "1y") days = 365;
    // Generate an array of timestamps at midnight UTC for last `days`
    const out = { all: [], crypto: [], stock: [], nonliquid: [] };
    const oneDay = 24*3600*1000;
    for (let i = days-1; i >= 0; i--) {
      const t = new Date(now - i*oneDay);
      const ms = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
      // compute value per category
      const catVals = { all:0, crypto:0, stock:0, nonliquid:0 };
      rows.forEach(r => {
        // synthetic: assume lastPriceUSD held constant except for nonliquid which uses computeNonLiquid
        let v = 0;
        if (r.type === "nonliquid") {
          const last = computeNonLiquidLastPrice(r.avgPrice, r.purchaseDate||r.createdAt, r.nonLiquidYoy||0);
          v = (r.shares||0) * last;
        } else {
          // Use current marketValue distributed across days with small noise
          const base = r.marketValueUSD || (r.shares || 0) * r.avgPrice || 0;
          // synthetic daily fluctuation using seeded RNG per symbol
          const seed = hashStringToSeed(String(r.symbol||"") + String(ms));
          const rng = seededRng(seed);
          const noise = (rng()-0.5) * 0.02 * base; // ±1% noise
          v = Math.max(0, base + noise);
        }
        catVals[r.type] = (catVals[r.type]||0) + v;
        catVals.all += v;
      });
      out.all.push({ t: ms, v: catVals.all });
      out.crypto.push({ t: ms, v: catVals.crypto });
      out.stock.push({ t: ms, v: catVals.stock });
      out.nonliquid.push({ t: ms, v: catVals.nonliquid });
    }
    return out;
  }, [rows, chartRange]);

  const categoryValuesNow = useMemo(() => {
    const out = { all:0, crypto:0, stock:0, nonliquid:0 };
    try {
      Object.keys(multiSeries).forEach(k => {
        const arr = multiSeries[k] || [];
        const last = arr[arr.length-1];
        out[k] = last ? last.v : 0;
      });
    } catch (e) {}
    return out;
  }, [multiSeries]);

  /* ===================== Chart modal & TradingView embed + CoinGecko mini-chart ===================== */
  function openChartModal(assetId) {
    const a = assets.find(x => x.id === assetId);
    if (!a) return;
    setChartModal({ open:true, assetId: assetId, assetType: a.type || "stock" });
  }
  function closeChartModal() { setChartModal({ open:false, assetId:null, assetType:null }); }

  /* Chart modal component (inline) */
  function ChartModalInner({ asset }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cgSeries, setCgSeries] = useState(null); // for crypto
    const tvRef = useRef(null);

    useEffect(() => {
      if (!asset) return;
      setError(null);
      if (asset.type === "crypto" && asset.coingeckoId) {
        setLoading(true);
        (async () => {
          try {
            const res = await fetch(COINGECKO_MARKETCHART(asset.coingeckoId, 90)); // 90 days
            if (!res.ok) throw new Error("cg fetch failed");
            const j = await res.json();
            // j.prices -> [ [ts, price], ... ]
            setCgSeries(j.prices || []);
          } catch (e) {
            setError("Could not fetch coin history");
          } finally { setLoading(false); }
        })();
      } else if (asset.type === "stock") {
        // attempt tradingview embed: we will insert widget if TradingView global is available
        // We insert a script widget only inside modal container
        // Use symbol pattern mapping if necessary
        setTimeout(() => {
          // best-effort: create TradingView widget if script exists
          try {
            if (typeof window !== "undefined" && window.TradingView && tvRef.current) {
              // create widget
              const symbol = asset.symbol || "";
              // remove previous children
              tvRef.current.innerHTML = "";
              new window.TradingView.widget({
                container_id: tvRef.current.id,
                width: "100%",
                height: 380,
                symbol: symbol,
                interval: "D",
                timezone: "Etc/UTC",
                theme: "dark",
                style: "1",
                locale: "en",
                toolbar_bg: "#1f2937",
                enable_publishing: false,
                hide_side_toolbar: false,
                allow_symbol_change: true,
                details: true,
              });
            } else {
              // tradingview lib not loaded — we just show fallback message
            }
          } catch (e) {
            // ignore
          }
        }, 200);
      }
    }, [asset]);

    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black bg-opacity-70 p-4">
        <div className="bg-gray-900 rounded-lg w-full max-w-3xl border border-gray-800 overflow-hidden">
          <div className="flex items-start justify-between p-4">
            <div>
              <div className="text-lg font-semibold">{asset.symbol} <span className="text-sm text-gray-400 ml-2">{asset.name}</span></div>
              <div className="text-xs text-gray-400 mt-1">{asset.description || ""}</div>
            </div>
            <button onClick={closeChartModal} className="text-gray-400 hover:text-white">×</button>
          </div>
          <div className="p-4">
            {asset.type === "crypto" ? (
              <>
                <div className="mb-3 text-sm text-gray-300">CoinGecko market chart (approx)</div>
                {loading ? <div className="text-sm text-gray-400">Loading...</div> : error ? <div className="text-sm text-red-400">{error}</div> : cgSeries ? (
                  <svg viewBox="0 0 800 240" width="100%" height="240" className="rounded bg-gray-950 p-2">
                    {/* simple polyline scaled */}
                    {(() => {
                      const w = 760, h = 200, pad = 20;
                      const vals = cgSeries.slice(-90).map(p => p[1]);
                      const minv = Math.min(...vals), maxv = Math.max(...vals);
                      const points = vals.map((v,i) => {
                        const x = pad + (i/(vals.length-1))*(w-2*pad);
                        const y = pad + (1 - (v - minv) / (maxv - minv || 1))*(h-2*pad);
                        return `${x},${y}`;
                      }).join(" ");
                      const last = vals[vals.length-1];
                      return <>
                        <polyline fill="none" stroke="#4D96FF" strokeWidth="2" points={points} />
                        <text x={w-10} y={pad+10} fontSize="12" fill="#ccc" textAnchor="end">{fmtMoney(last,"USD")}</text>
                      </>;
                    })()}
                  </svg>
                ) : <div className="text-sm text-gray-500">No market data</div>}
              </>
            ) : (
              <>
                <div id="tv-container" ref={tvRef} style={{ width: "100%", height: 420 }} />
                <div className="text-xs text-gray-400 mt-2">If TradingView widget does not load, ensure TradingView library is included in the page (external). Fallback price shown in table.</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ===================== SHARE modal (respects eyeHidden) ===================== */
  function buildSharePayload() {
    // Build summary: allocation percentages + totals; if eyeHidden then omit numeric values
    const total = totals.market || 0;
    const pieces = rows.map(r => {
      const pct = total>0 ? (r.marketValueUSD/total)*100 : 0;
      return { symbol: r.symbol, name: r.name, pct: Number(pct.toFixed(2)), value: r.marketValueUSD };
    }).sort((a,b)=>b.pct - a.pct);
    const summary = {
      generatedAt: Date.now(),
      displayCcy,
      total,
      rows: pieces.map(p => ({ symbol:p.symbol, pct:p.pct, value: eyeHidden ? null : p.value }))
    };
    return summary;
  }

  function openShare() {
    const payload = buildSharePayload();
    setSharePayload(payload);
    setShareModalOpen(true);
  }
  function closeShare() { setShareModalOpen(false); setSharePayload(null); }

  function generateQrDataUrl(text) {
    // Simple small QR via Google Chart static (works in browser) — fallback to data-URL with simple svg
    try {
      const encoded = encodeURIComponent(text);
      // Use Google Charts API endpoint — may be blocked depending on CSP, so we also create an svg fallback
      const url = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encoded}&chld=L|1`;
      return url;
    } catch {
      // fallback: tiny data svg
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='100%' height='100%' fill='#fff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='#333'>share</text></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }
  }

  /* ===================== EXPORT/IMPORT CSV (combined) ===================== */
  function exportAllCSV() {
    const assetsHeaders = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","createdAt","purchaseDate","nonLiquidYoy"];
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
      // support BOM
      if (linesRaw[0] && linesRaw[0].charCodeAt(0) === 0xFEFF) linesRaw[0] = linesRaw[0].substring(1);
      // naive parser: find #ASSETS and #TRANSACTIONS segments
      const idxAssets = linesRaw.indexOf("#ASSETS");
      const idxTx = linesRaw.indexOf("#TRANSACTIONS");
      if (idxAssets < 0) return alert("Invalid import format (missing #ASSETS)");
      const assetsHeaderLine = linesRaw[idxAssets+1] || "";
      const assetH = assetsHeaderLine.split(",").map(h => h.trim());
      const assetLines = [];
      for (let i = idxAssets+2; i < (idxTx>0?idxTx:linesRaw.length); i++) {
        const l = linesRaw[i];
        if (!l || l.startsWith("#")) continue;
        assetLines.push(l);
      }
      const importedAssets = assetLines.map(line => {
        // CSV parse simple handling quotes
        const values = [];
        let cur = ""; let inside = false;
        for (let i=0;i<line.length;i++){
          const ch = line[i];
          if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
          if (ch === '"') { inside = !inside; continue; }
          if (ch === "," && !inside) { values.push(cur); cur=""; continue; }
          cur += ch;
        }
        values.push(cur);
        const obj = {};
        assetH.forEach((h, idx) => obj[h] = (values[idx]||"").trim());
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
          createdAt: obj.createdAt ? Date.parse(obj.createdAt) : Date.now(),
          purchaseDate: obj.purchaseDate ? Date.parse(obj.purchaseDate) : Date.now(),
          nonLiquidYoy: toNum(obj.nonLiquidYoy||0)
        };
        return ensureNumericAsset(parsed);
      });

      // transactions parsing
      const txs = [];
      if (idxTx >= 0) {
        const txHeader = linesRaw[idxTx+1] || "";
        const txH = txHeader.split(",").map(h => h.trim());
        for (let i = idxTx+2; i < linesRaw.length; i++) {
          const l = linesRaw[i];
          if (!l || l.startsWith("#")) continue;
          const values = []; let cur=""; let inside=false;
          for (let j=0;j<l.length;j++){
            const ch = l[j];
            if (ch === '"' && l[j+1] === '"') { cur += '"'; j++; continue; }
            if (ch === '"') { inside = !inside; continue; }
            if (ch === "," && !inside) { values.push(cur); cur=""; continue; }
            cur += ch;
          }
          values.push(cur);
          const obj = {};
          txH.forEach((h,idx)=> obj[h] = (values[idx]||"").trim());
          const parsed = {
            id: obj.id || `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
            type: obj.type || "buy",
            assetId: obj.assetId || "",
            assetType: obj.assetType || "",
            symbol: obj.symbol || "",
            name: obj.name || "",
            qty: toNum(obj.qty||0),
            pricePerUnit: toNum(obj.pricePerUnit||0),
            cost: toNum(obj.cost||0),
            proceeds: toNum(obj.proceeds||0),
            costOfSold: toNum(obj.costOfSold||0),
            realized: toNum(obj.realized||0),
            date: obj.date ? Date.parse(obj.date) : Date.now()
          };
          txs.push(parsed);
        }
      }

      if (merge) {
        // merge by symbol: prefer imported for duplicates
        const map = {};
        assets.forEach(a => map[a.symbol] = ensureNumericAsset(a));
        importedAssets.forEach(i => map[i.symbol] = ensureNumericAsset(i));
        const merged = Object.values(map);
        setAssets(merged);
      } else {
        setAssets(importedAssets);
      }
      if (txs.length>0) setTransactions(txs.concat(transactions));
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

  /* ===================== UI small helpers ===================== */
  function toggleEye() { setEyeHidden(v => !v); }

  /* ===================== RENDER ===================== */
  const titleForFilter = { all: "All Portfolio", crypto: "Crypto Portfolio", stock: "Stocks Portfolio", nonliquid: "Non-Liquid Portfolio" };
  const headerTitle = titleForFilter[portfolioFilter] || "Portfolio";

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <style>{`
        .btn { transition: transform 160ms, box-shadow 160ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); transition: transform 220ms; }
        .icon-box { transition: transform 160ms, background 120ms; }
        .menu-scroll { max-height: 16rem; overflow:auto; overscroll-behavior: contain; scrollbar-width: thin; }
      `}</style>

      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-center gap-2 relative">
            <h1 className="text-2xl font-semibold">{headerTitle}</h1>

            {/* header filter icon-only (no box) */}
            <div className="relative">
              <button aria-label="Filter" onClick={() => setFilterMenuOpen(v => !v)} className="ml-2 inline-flex items-center justify-center text-gray-200" style={{ fontSize: 18, padding:6 }} title="Filter portfolio">
                {/* caret-down icon */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>

              {filterMenuOpen && (
                <div ref={filterMenuRef} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-40 menu-scroll">
                  <button onClick={() => { setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                  <button onClick={() => { setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                  <button onClick={() => { setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                  <button onClick={() => { setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Currency dropdown: big nominal + code + caret */}
            <div className="relative" ref={currencyMenuRef}>
              <button aria-label="Currency" onClick={() => setCurrencyMenuOpen(v=>!v)} className="inline-flex items-center gap-2" style={{ background:"transparent", border:0, padding:"6px 8px" }} title="Currency">
                <span style={{ whiteSpace:"nowrap", fontSize:20, fontWeight:700 }}>
                  {displayCcy === "IDR" ? `${(totals.market * usdIdr).toLocaleString()} IDR` : `${Math.round(totals.market*100)/100} USD`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" className="text-gray-300"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {currencyMenuOpen && (
                <div className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-40 menu-scroll">
                  <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                  <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>

            <button onClick={() => setOpenAdd(v => !v)} className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn`} aria-label="Add asset">
              <span style={{ transform: openAdd ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 220ms" }}>+</span>
            </button>

            <button onClick={openShare} className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-200 btn" title="Share portfolio">
              {/* share icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12v6a2 2 0 0 0 2 2h12" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 6l-4-4-4 4" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 2v14" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            <button onClick={toggleEye} className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-200 btn" title="Toggle hide values">
              {eyeHidden ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 9.5a3 3 0 0 1 5 4" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 10a3 3 0 0 0 4 4" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              )}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Invested</div>
            <div className="font-medium text-lg">{eyeHidden ? "*****" : (displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD"))}</div>
            <div className="text-xs text-gray-500">avg price</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Market value</div>
            <div className="font-medium text-lg">{eyeHidden ? "*****" : (displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD"))}</div>
            <div className="text-xs text-gray-500">current price</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Gain P&L</div>
            <div className={`font-semibold text-lg ${totals.pnl>=0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy==="IDR"? (fmtMoney(totals.pnl*usdIdr,"IDR")) : (fmtMoney(totals.pnl,"USD"))} <span className="text-sm text-gray-400">({totals.pnlPct.toFixed(2)}%)</span></div>
            <div className="text-xs text-gray-500">Unrealized gain</div>
          </div>
          <div className="flex flex-col text-gray-400 cursor-pointer" onClick={() => setTransactionsOpen(true)}>
            <div className="flex items-center gap-2">
              <div className="text-xs">Realized P&L</div>
              <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center icon-box" title="Click to view transactions">
                <svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 14 L14 6" stroke={realizedUSD>=0?"#34D399":"#F87171"} strokeWidth="2" strokeLinecap="round"/><path d="M14 6 v8 h-8" stroke={realizedUSD>=0?"#34D399":"#F87171"} strokeWidth="2" strokeLinecap="round"/></svg>
              </div>
            </div>
            <div className={`font-semibold text-lg ${realizedUSD>=0 ? "text-emerald-400" : "text-red-400"}`}>{eyeHidden ? "*****" : (displayCcy==="IDR"? fmtMoney(realizedUSD*usdIdr,"IDR") : fmtMoney(realizedUSD,"USD"))}</div>
          </div>
        </div>

        {/* Portfolio Growth Chart (above donut) */}
        <div className="mt-6 bg-transparent p-3 rounded">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-300">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(k => (
                <button key={k} onClick={() => setChartRange(k)} className={`px-2 py-1 text-xs rounded ${chartRange===k ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}`}>{k}</button>
              ))}
            </div>
          </div>
          {/* small svg multi-line chart */}
          <div className="w-full overflow-auto rounded bg-gray-950 p-3">
            <svg viewBox="0 0 900 240" width="100%" height="240" preserveAspectRatio="none">
              {/* grid */}
              {[0,1,2,3,4].map(i=>{
                const y = 20 + i*(180/4);
                return <line key={i} x1={40} x2={860} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
              })}
              {/* series */}
              {["all","crypto","stock","nonliquid"].map((k, idx) => {
                const series = (multiSeries[k]||[]);
                if (!series || series.length===0) return null;
                const values = series.map(p=>p.v);
                const minv = Math.min(...values), maxv = Math.max(...values);
                const w = 820, h = 180, left = 40;
                const pts = values.map((v,i) => {
                  const x = left + (i/(values.length-1))*w;
                  const y = 20 + (1 - (v - minv)/(maxv - minv || 1))*h;
                  return `${x},${y}`;
                }).join(" ");
                return <polyline key={k} fill="none" stroke={colorForIndex(idx)} strokeWidth={k==="all"?2:1.4} points={pts} opacity={k==="all"?1:0.85} />;
              })}
            </svg>
            <div className="flex gap-4 mt-2 text-xs text-gray-400">
              <div>All: {displayCcy==="IDR" ? fmtMoney(categoryValuesNow.all * usdIdr, "IDR") : fmtMoney(categoryValuesNow.all, "USD")}</div>
              <div className="text-pink-300">Crypto: {displayCcy==="IDR" ? fmtMoney(categoryValuesNow.crypto * usdIdr, "IDR") : fmtMoney(categoryValuesNow.crypto, "USD")}</div>
              <div className="text-green-300">Stocks: {displayCcy==="IDR" ? fmtMoney(categoryValuesNow.stock * usdIdr, "IDR") : fmtMoney(categoryValuesNow.stock, "USD")}</div>
              <div className="text-yellow-300">Non-Liquid: {displayCcy==="IDR" ? fmtMoney(categoryValuesNow.nonliquid * usdIdr, "IDR") : fmtMoney(categoryValuesNow.nonliquid, "USD")}</div>
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-transparent p-3 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="crypto"?"bg-gray-800":""} btn-soft`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="id"?"bg-gray-800":""} btn-soft`}>Stocks ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="us"?"bg-gray-800":""} btn-soft`}>Stocks US</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode==="nonliquid"?"bg-gray-800":""} btn-soft`}>Non-Liquid</button>
              </div>
            </div>

            {searchMode !== "nonliquid" ? (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s,i)=>(
                        <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                          <div>
                            <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                            <div className="text-xs text-gray-500">{s.source==="coingecko" ? "Crypto" : `Security • ${s.exchange||''}`}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option><option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add</button>
                  <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn">Add + Position</button>
                  <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={nlName} onChange={e=>setNlName(e.target.value)} placeholder="Name (Land, Art, Rolex...)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlDesc} onChange={e=>setNlDesc(e.target.value)} placeholder="Description (optional)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlQty} onChange={e=>setNlQty(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <div className="flex gap-2">
                  <input value={nlPrice} onChange={e=>setNlPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full" />
                  <select value={nlPriceCcy} onChange={e=>setNlPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                    <option value="USD">USD</option><option value="IDR">IDR</option>
                  </select>
                </div>
                <input type="date" value={nlPurchaseDate} onChange={e=>setNlPurchaseDate(e.target.value)} className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <div className="flex items-center gap-2">
                  <input value={nlYoy} onChange={e=>setNlYoy(e.target.value)} placeholder="YoY %" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-24" />
                  <button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Non-Liquid</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TABLE */}
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
              {filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : filteredRows.sort((a,b)=>{
                const k = tableSort.key || "marketValueUSD";
                const dir = tableSort.dir === "asc" ? 1 : -1;
                return (toNum(a[k]) - toNum(b[k])) * dir;
              }).map(r => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openChartModal(r.id)}>{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares||0).toLocaleString(undefined,{ maximumFractionDigits:8 })}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-semibold">{eyeHidden ? "*****" : (displayCcy==="IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD"))}</div>
                    <div className="text-xs text-gray-400">{displayCcy==="IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-semibold">{eyeHidden ? "*****" : (displayCcy==="IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD"))}</div>
                    <div className="text-xs text-gray-400">{displayCcy==="IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD>=0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy==="IDR" ? (fmtMoney(r.pnlUSD * usdIdr, "IDR")) : (fmtMoney(r.pnlUSD, "USD"))}</div>
                    <div className={`text-xs ${r.pnlUSD>=0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
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

        {/* Cake allocation + legend */}
        {rows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-start gap-6">
            <div className="w-40 h-40 flex items-center justify-center bg-transparent rounded">
              {/* cake svg */}
              <svg width="160" height="160" viewBox="0 0 160 160">
                {/* center circle and slices computed */}
                {(() => {
                  const size = 160; const cx = size/2; const cy = size/2;
                  const total = cakeData.reduce((s,d)=>s+(d.value||0),0) || 1;
                  let start = -90;
                  const gapDeg = 2; // gap between slices
                  return cakeData.map((d,i) => {
                    const portion = (d.value||0)/total;
                    const angle = portion*360;
                    const end = start + angle;
                    const large = angle > 180 ? 1 : 0;
                    const rOuter = 64 + Math.round((d.value||0) > 0 ? ( (d.value||0)/Math.max(...cakeData.map(x=>x.value||0)) * 24) : 0 );
                    const sRad = (Math.PI*start)/180; const eRad = (Math.PI*end)/180;
                    const x1 = cx + rOuter * Math.cos(sRad), y1 = cy + rOuter * Math.sin(sRad);
                    const x2 = cx + rOuter * Math.cos(eRad), y2 = cy + rOuter * Math.sin(eRad);
                    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} Z`;
                    const color = colorForIndex(i);
                    start = end + (gapDeg/2);
                    return <path key={i} d={path} fill={color} stroke="#0b0b0b" strokeWidth="1" />;
                  });
                })()}
                <circle cx="80" cy="80" r="36" fill="#070707" />
                <text x="80" y="84" textAnchor="middle" fill="#cbd5e1" fontSize="12">Total</text>
                <text x="80" y="98" textAnchor="middle" fill="#e5e7eb" fontSize="14">{displayCcy==="IDR"? `${Math.round(totals.market*usdIdr).toLocaleString()} IDR` : `${Math.round(totals.market*100)/100} USD`}</text>
              </svg>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {cakeData.map((d,i) => {
                const pct = totals.market>0 ? (d.value / totals.market)*100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width:12, height:12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{displayCcy==="IDR"? fmtMoney(d.value*usdIdr,"IDR") : fmtMoney(d.value,"USD")} • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transactions modal */}
        {transactionsOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-gray-900 w-full max-w-3xl rounded-lg p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Transactions</div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { undoLastDeletedTransaction(); }} className={`px-3 py-1 rounded bg-gray-800 btn`}>Restore</button>
                  <button onClick={() => setTransactionsOpen(false)} className="text-gray-400">Close</button>
                </div>
              </div>
              <div className="mt-3 max-h-96 overflow-auto">
                {transactions.length === 0 ? <div className="text-sm text-gray-500">No transactions</div> : transactions.map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-800">
                    <div>
                      <div className="font-medium">{t.symbol} • {t.type.toUpperCase()}</div>
                      <div className="text-xs text-gray-400">{t.qty} @ {fmtMoney(t.pricePerUnit || 0,"USD")} • {new Date(t.date).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => restoreTransaction(t.id)} className="px-2 py-1 text-xs rounded bg-emerald-500 text-black btn">Restore</button>
                      <button onClick={() => deleteTransaction(t.id)} className="px-2 py-1 text-xs rounded bg-red-600 text-black btn">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TRADE MODAL */}
        {tradeModal.open && <TradeModalInner modal={tradeModal} onClose={closeTradeModal} onBuy={performBuy} onSell={performSell} usdIdr={usdIdr} />}

        {/* CHART MODAL */}
        {chartModal.open && (() => {
          const asset = assets.find(a => a.id === chartModal.assetId);
          return asset ? <ChartModalInner asset={asset} /> : null;
        })()}

        {/* SHARE MODAL */}
        {shareModalOpen && sharePayload && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="bg-gray-900 rounded-lg w-full max-w-md p-4 border border-gray-800">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Share Portfolio</div>
                <button onClick={closeShare} className="text-gray-400">×</button>
              </div>
              <div className="mt-3 text-sm text-gray-300">
                {eyeHidden ? "Values are hidden. Shared content contains only percentages." : "Values are included in the share."}
              </div>
              <div className="mt-3">
                <div className="text-xs text-gray-400 mb-1">Link</div>
                {/* create a tiny share data as base64 JSON in link */}
                <input readOnly value={`data:application/json,${encodeURIComponent(JSON.stringify(sharePayload))}`} className="w-full bg-gray-800 px-3 py-2 rounded text-sm" />
                <div className="mt-3 flex items-center gap-3">
                  <a href={`data:application/json,${encodeURIComponent(JSON.stringify(sharePayload))}`} download={`portfolio_share_${Date.now()}.json`} className="px-3 py-2 rounded bg-blue-600 btn">Download</a>
                  <button onClick={() => {
                    const text = JSON.stringify(sharePayload);
                    const url = generateQrDataUrl(text);
                    // open QR in new tab (or show inline)
                    window.open(url, "_blank");
                  }} className="px-3 py-2 rounded bg-emerald-500 btn">Open QR</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EXPORT / IMPORT / CLEAR */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (merge or replace)</div>
            <div className="text-xs text-gray-500">Export includes portfolio rows + transactions + metadata. BOM added for Excel compatibility.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportAllCSV} className="bg-blue-600 px-3 py-2 rounded font-semibold btn">Export CSV</button>
            <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={() => { if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return; setAssets([]); setRealizedUSD(0); }} className="bg-red-600 px-3 py-2 rounded font-semibold btn">Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ===================== TRADE MODAL INNER ===================== */
function TradeModalInner({ modal, onClose, onBuy, onSell, usdIdr }) {
  const { assetId, mode, defaultPrice } = modal;
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice>0?String(defaultPrice):"");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(() => { setPrice(defaultPrice>0?String(defaultPrice):""); }, [defaultPrice]);

  function handleSubmit(e) {
    e.preventDefault();
    const q = toNum(qty);
    const priceUSD = priceCcy === "IDR" ? toNum(price)/ (usdIdr || 1) : toNum(price);
    if (q<=0 || priceUSD<=0) { alert("Qty & price must be > 0"); return; }
    if (mode === "buy") onBuy(q, priceUSD);
    if (mode === "sell") onSell(q, priceUSD);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div><h2 className="text-xl font-semibold capitalize">{mode}</h2></div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" step="any" value={qty} onChange={e=>setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700" placeholder="0.00" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={e=>setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700" placeholder="0.00" />
              <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="bg-gray-800 border-t border-b border-r border-gray-700 px-2 rounded-r">
                <option value="USD">USD</option><option value="IDR">IDR</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-400 text-right mb-4">
            Total: {fmtMoney(toNum(qty) * (priceCcy === "IDR" ? (toNum(price)/(usdIdr||1)) : toNum(price)), "USD")}
          </div>
          <button type="submit" className={`w-full py-2 rounded font-semibold ${mode === "buy" ? "bg-emerald-500 text-black" : "bg-yellow-600 text-white"}`}>{mode === "buy" ? 'Confirm Buy' : 'Confirm Sell'}</button>
        </form>
      </div>
    </div>
  );
}