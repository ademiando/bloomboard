// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Portfolio Dashboard — final combined implementation
 *
 * Highlights:
 * - Prices: Crypto via CoinGecko, Stocks: AlphaVantage -> Finnhub -> Yahoo fallback
 * - Non-liquid assets (custom) with YOY auto-gain calculation
 * - Portfolio selector (All / Crypto / Stocks / Non-Liquid) as small dropdown icon next to title
 * - Eye toggle to hide numeric values (shows *****), percentages still visible
 * - Share icon: generates a short share payload + QR (Google Chart) obeying eye toggle
 * - Trading charts: TradingView embed for stocks; coingecko mini chart for crypto (modal)
 * - Transactions modal with delete and undo/restore logic
 * - CSV export/import combined: assets + transactions; BOM for Excel; structured headers
 * - Cake allocation (donut -> cake) with spacing, center total (smaller), hover tooltip, values follow current display currency
 * - Portfolio growth chart above cake; multiple timeframes and per-category lines
 * - All UI labels in English
 *
 * IMPORTANT: endpoints for external data (AlphaVantage etc.) are expected to be proxied on your server.
 */

/* ===================== CONFIG/ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_PRICE = (ids) =>
  `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_HISTORY = (id, days) =>
  `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;

// Proxy endpoints (adjust to your server)
const ALPHAVANTAGE_QUOTE = (symbol) => `/api/alphavantage/quote?symbol=${encodeURIComponent(symbol)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;

/* ===================== HELPERS ===================== */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
function isoDate(ms) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}
function shortDate(ms) {
  try { return new Date(ms).toLocaleDateString(); } catch { return ""; }
}
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
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function colorForIndex(i) {
  const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
  return palette[i % palette.length];
}

/* Quote values properly for CSV (include BOM on export) */
function csvQuote(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/* Ensure asset shape and numeric coercion */
function ensureNumericAsset(a) {
  return {
    id: a.id,
    type: a.type || "stock", // stock | crypto | nonliquid
    coingeckoId: a.coingeckoId || undefined,
    symbol: (a.symbol || "").toString().toUpperCase(),
    name: a.name || a.symbol || "",
    description: a.description || "",
    shares: toNum(a.shares || 0),
    avgPrice: toNum(a.avgPrice || 0),
    investedUSD: toNum(a.investedUSD || (toNum(a.shares || 0) * toNum(a.avgPrice || 0))),
    lastPriceUSD: toNum(a.lastPriceUSD || a.avgPrice || 0),
    marketValueUSD: toNum(a.marketValueUSD || (toNum(a.shares || 0) * toNum(a.lastPriceUSD || a.avgPrice || 0))),
    createdAt: a.createdAt || Date.now(),
    purchaseDate: a.purchaseDate || a.createdAt || Date.now(),
    nonLiquidYoy: toNum(a.nonLiquidYoy || 0), // annual percent e.g. 5 => 5%
  };
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- persistent state loaders ---------- */
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
  const loadTransactions = () => {
    try {
      if (!isBrowser) return [];
      const raw = JSON.parse(localStorage.getItem("pf_transactions_v2") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(t => ({ ...t, date: t.date ? Date.parse(t.date) : Date.now() }));
    } catch {
      return [];
    }
  };
  const loadRealized = () => {
    try {
      if (!isBrowser) return 0;
      return toNum(localStorage.getItem("pf_realized_v2") || 0);
    } catch { return 0; }
  };
  const loadDisplayCcy = () => {
    try {
      if (!isBrowser) return "USD";
      return localStorage.getItem("pf_display_ccy_v2") || "USD";
    } catch { return "USD"; }
  };

  const [assets, setAssets] = useState(loadAssets);
  const [transactions, setTransactions] = useState(loadTransactions);
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  /* ---------- UI & FX ---------- */
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- search/add ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | id | us | nonliquid
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [initPurchaseDate, setInitPurchaseDate] = useState(""); // for non-liquid

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- trade modal state ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* ---------- portfolio selector ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all"); // all | crypto | stock | nonliquid

  /* ---------- hide values (eye) ---------- */
  const [hideValues, setHideValues] = useState(false);

  /* ---------- transaction modal ---------- */
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txFilterMode, setTxFilterMode] = useState("all"); // all/buy/sell

  /* ---------- last chosen sort for table ---------- */
  const [assetSort, setAssetSort] = useState("value_desc"); // value_desc | value_asc | symbol_asc | newest | oldest

  /* ---------- short UI interactions ---------- */
  const [chartModal, setChartModal] = useState({ open: false, asset: null, type: null }); // type: 'tradingview' | 'coingecko'

  /* ---------- persist to localStorage ---------- */
  useEffect(() => {
    try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions)); } catch {}
  }, [transactions]);
  useEffect(() => {
    try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {}
  }, [realizedUSD]);
  useEffect(() => {
    try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {}
  }, [displayCcy]);

  /* ===================== SEARCH LOGIC ===================== */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    if (searchMode === "nonliquid") {
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

        // stocks: try packaged Yahoo search via proxy
        const res = await fetch(YAHOO_SEARCH(q));
        if (!res.ok) { setSuggestions([]); return; }
        const j = await res.json();
        const rawList = j.quotes || j.result || j.data || j.items || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map((it) => {
          const symbol = it.symbol || it.ticker || it.id || (typeof it === "string" ? it : "");
          const display = it.shortname || it.shortName || it.name || it.longname || it.longName || symbol;
          const exchange = it.exchange || it.fullExchangeName || it.exchangeName || it.exchDisp || "";
          const currency = it.currency || it.quoteCurrency || "";
          return {
            symbol: (symbol || "").toString().toUpperCase(),
            display: display || symbol,
            exchange, currency,
            source: "yahoo", type: "stock",
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

  // Poll crypto via CoinGecko
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId))).filter(Boolean);
        if (ids.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }
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
    const id = setInterval(pollCg, 8000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // Poll stocks via AlphaVantage -> Finnhub -> Yahoo
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 60);
        if (symbols.length === 0) { if (isInitialLoading && mounted) setIsInitialLoading(false); return; }

        const map = {};
        // Try AlphaVantage per-symbol (prefer)
        for (const s of symbols) {
          try {
            const res = await fetch(ALPHAVANTAGE_QUOTE(s));
            if (!res.ok) throw new Error("alphavantage failed");
            const js = await res.json();
            // Expected shape: { "Global Quote": { "05. price": "..." } }
            const gv = js["Global Quote"] || js;
            let price = toNum(gv["05. price"] ?? gv["05 Price"] ?? gv["price"] ?? gv["c"] ?? 0);
            if (price > 0) {
              // detect IDX tickers
              const looksLikeId = String(s || "").toUpperCase().endsWith(".JK") || String(gv["07. latest trading day"] || "").toUpperCase().includes("JAKARTA");
              let priceUSD = price;
              if (looksLikeId) {
                const fx = usdIdrRef.current || 1;
                priceUSD = fx > 0 ? (price / fx) : price;
              }
              map[s] = { symbol: s, priceRaw: price, priceUSD, currency: looksLikeId ? "IDR" : "USD", _source: "alphavantage", fullExchangeName: gv["10. change percent"] || "" };
              continue;
            }
          } catch (e) {
            // fallback per-symbol
          }
        }

        // Finnhub per-symbol (if missing)
        const missing1 = symbols.filter(s => !map[s]);
        for (const s of missing1) {
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) throw new Error("finnhub fail");
            const js = await res.json();
            const current = toNum(js?.c ?? js?.current ?? 0);
            if (current > 0) {
              const looksLikeId = String(s || "").toUpperCase().endsWith(".JK");
              let priceUSD = current;
              if (looksLikeId) {
                const fx = usdIdrRef.current || 1;
                priceUSD = fx > 0 ? (current / fx) : current;
              }
              map[s] = { symbol: s, priceRaw: current, priceUSD, currency: looksLikeId ? "IDR" : js?.currency || "USD", _source: "finnhub", fullExchangeName: js?.exchange || "" };
            }
          } catch (e) {}
        }

        // Yahoo bulk fallback for any still missing
        const missing = symbols.filter(s => !map[s]);
        if (missing.length > 0) {
          try {
            const res = await fetch(YAHOO_QUOTE(missing.join(",")));
            if (res.ok) {
              const j = await res.json();
              if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
                j.quoteResponse.result.forEach(q => {
                  const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.current ?? q?.c ?? 0);
                  if (price > 0 && q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: price, currency: q.currency || "USD", fullExchangeName: q.fullExchangeName || "", _source: "yahoo" };
                });
              } else if (Array.isArray(j)) {
                j.forEach(q => { if (q?.symbol) map[q.symbol] = { symbol: q.symbol, priceRaw: toNum(q?.regularMarketPrice ?? q?.c ?? 0), _source: "yahoo" }; });
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
            // if price failed or zero, fallback: keep last known price or avgPrice
            if (!priceUSD || priceUSD <= 0) priceUSD = toNum(a.lastPriceUSD || a.avgPrice || 0);
            return ensureNumericAsset({ ...a, lastPriceUSD: priceUSD, marketValueUSD: priceUSD * toNum(a.shares || 0) });
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

  /* FX tether->IDR */
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

  /* ===================== NON-LIQUID GROWTH AUTO-CALC ===================== */
  // For non-liquid assets we compute market value using YOY growth compounding from purchaseDate to now
  function computeNonLiquidMarketValue(asset) {
    // asset.nonLiquidYoy as percent yearly, e.g. 5 => 5%
    const invested = toNum(asset.investedUSD || 0);
    const rate = (toNum(asset.nonLiquidYoy || 0) / 100);
    const start = asset.purchaseDate ? new Date(asset.purchaseDate).getTime() : asset.createdAt || Date.now();
    const years = Math.max(0, (Date.now() - start) / (365.25 * 24 * 3600 * 1000));
    const factor = Math.pow(1 + rate, years);
    const market = invested * factor;
    return { marketValueUSD: market, lastPriceUSD: invested > 0 ? (market / (asset.shares || 1)) : 0 };
  }

  useEffect(() => {
    // run non-liquid recompute periodically (every 30s)
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      setAssets(prev => prev.map(a => {
        if (a.type === "nonliquid") {
          const computed = computeNonLiquidMarketValue(a);
          return ensureNumericAsset({ ...a, marketValueUSD: computed.marketValueUSD, lastPriceUSD: computed.lastPriceUSD });
        }
        return a;
      }));
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ===================== ADD ASSET LOGIC ===================== */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      description: s.exchange || "",
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
      createdAt: Date.now(),
      purchaseDate: Date.now(),
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
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, purchaseDate: Date.now(),
      });
    } else if (searchMode === "nonliquid") {
      // create non-liquid custom asset
      const name = typed;
      const qty = toNum(initQty || 1);
      const priceInput = toNum(initPrice || 0);
      const priceInUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
      const invested = qty * priceInUSD;
      const nonLiquidYoy = toNum(prompt("Enter expected annual YOY % for this non-liquid asset (e.g. 5)", "5") || 0);
      const purchaseDateMs = initPurchaseDate ? (Date.parse(initPurchaseDate) || Date.now()) : Date.now();
      newAsset = ensureNumericAsset({
        id: `manual:nl:${name}:${Date.now()}`,
        type: "nonliquid",
        coingeckoId: undefined,
        symbol: name.slice(0,6).toUpperCase(),
        name,
        description: "",
        shares: qty,
        avgPrice: priceInUSD,
        investedUSD: invested,
        lastPriceUSD: priceInUSD,
        marketValueUSD: invested,
        createdAt: Date.now(),
        purchaseDate: purchaseDateMs,
        nonLiquidYoy,
      });
    } else {
      newAsset = ensureNumericAsset({
        id: `manual:yh:${typed}:${Date.now()}`, type: "stock",
        symbol: typed.toUpperCase(), name: typed.toUpperCase(),
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0, purchaseDate: Date.now(),
      });
    }
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setInitPurchaseDate("");
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode === "crypto") {
        picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed };
      } else if (searchMode === "nonliquid") {
        // call manual path
        return addManualAsset();
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
      type: picked.source === "coingecko" ? "crypto" : (searchMode === "nonliquid" ? "nonliquid" : "stock"),
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
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
  }

  /* ===================== BUY / SELL (modal) ===================== */
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
    // record transaction
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
      type: "buy",
      assetId: id,
      assetType: (assets.find(a=>a.id===id)||{}).type || "stock",
      symbol: (assets.find(a=>a.id===id)||{}).symbol || "",
      name: (assets.find(a=>a.id===id)||{}).name || "",
      qty: q, pricePerUnit: p, cost: q * p, proceeds: 0, costOfSold: 0, realized: 0,
      date: Date.now(),
    };
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

    // add transaction (sell)
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
      type: "sell",
      assetId: id,
      assetType: a.type,
      symbol: a.symbol,
      name: a.name,
      qty: q, pricePerUnit: p, cost: 0, proceeds, costOfSold, realized,
      date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev]);
    closeTradeModal();
  }

  /* ===================== REMOVE ASSET ===================== */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ===================== TRANSACTION LOG ACTIONS ===================== */
  function openTxModal() {
    setTxModalOpen(true);
  }
  function closeTxModal() {
    setTxModalOpen(false);
  }
  function deleteTransaction(txId) {
    if (!confirm("Delete this transaction? This is permanent (but you can adjust assets manually).")) return;
    const tx = transactions.find(t => t.id === txId);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    // If we delete a sell that contributed to realizedUSD, subtract its realized
    if (tx && tx.type === "sell") {
      setRealizedUSD(prev => prev - toNum(tx.realized || 0));
    }
  }
  function undoTransaction(txId) {
    // Undo = restore reversed effect (e.g., if sell then bring back shares and reduce realized)
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm("Restore this transaction (undo)? This will attempt to revert its effects.")) return;
    if (tx.type === "sell") {
      // restore shares to asset (if missing create minimal)
      setAssets(prev => {
        const a = prev.find(x => x.id === tx.assetId);
        if (!a) {
          // create asset placeholder
          const newA = ensureNumericAsset({
            id: tx.assetId,
            type: tx.assetType || "stock",
            symbol: tx.symbol || "",
            name: tx.name || "",
            shares: tx.qty,
            avgPrice: tx.pricePerUnit, // guess
            investedUSD: tx.costOfSold || (tx.qty * tx.pricePerUnit) || 0,
            lastPriceUSD: tx.pricePerUnit,
            marketValueUSD: tx.qty * tx.pricePerUnit,
            createdAt: Date.now(),
            purchaseDate: Date.now(),
          });
          return [newA, ...prev];
        } else {
          return prev.map(x => x.id === tx.assetId ? ensureNumericAsset({ ...x, shares: toNum(x.shares||0) + toNum(tx.qty||0), investedUSD: toNum(x.investedUSD||0) + toNum(tx.costOfSold||0) }) : x);
        }
      });
      setRealizedUSD(prev => prev - toNum(tx.realized || 0));
      // mark transaction as undone (or remove)
      setTransactions(prev => prev.filter(t => t.id !== txId));
    } else if (tx.type === "buy") {
      // remove purchased shares
      setAssets(prev => prev.map(x => x.id === tx.assetId ? ensureNumericAsset({ ...x, shares: Math.max(0, toNum(x.shares||0) - toNum(tx.qty||0)), investedUSD: Math.max(0, toNum(x.investedUSD||0) - toNum(tx.cost||0)) }) : x).filter(x => toNum(x.shares||0) > 0 || x.type === "nonliquid"));
      setTransactions(prev => prev.filter(t => t.id !== txId));
    } else {
      // generic remove
      setTransactions(prev => prev.filter(t => t.id !== txId));
    }
  }

  /* ===================== computed rows & totals ===================== */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = toNum(aa.shares || 0) * last;
    const invested = toNum(aa.investedUSD || 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets]);

  const filteredRows = useMemo(() => {
    let list = rows.slice();
    if (portfolioFilter !== "all") list = list.filter(r => (portfolioFilter === "crypto" ? r.type === "crypto" : (portfolioFilter === "stock" ? r.type === "stock" : r.type === "nonliquid")));
    // sorting
    if (assetSort === "value_desc") list.sort((a,b) => b.marketValueUSD - a.marketValueUSD);
    else if (assetSort === "value_asc") list.sort((a,b) => a.marketValueUSD - b.marketValueUSD);
    else if (assetSort === "symbol_asc") list.sort((a,b) => (a.symbol||"").localeCompare(b.symbol||""));
    else if (assetSort === "newest") list.sort((a,b) => b.createdAt - a.createdAt);
    else if (assetSort === "oldest") list.sort((a,b) => a.createdAt - b.createdAt);
    return list;
  }, [rows, portfolioFilter, assetSort]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  /* donut/cake data */
  const cakeData = useMemo(() => {
    const sortedRows = rows.slice().sort((a,b) => b.marketValueUSD - a.marketValueUSD);
    const top = sortedRows.slice(0, 5);
    const other = sortedRows.slice(5);
    const otherTotal = other.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0), symbols: [r.symbol] }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: other.map(o=>o.symbol) });
    return data;
  }, [rows]);

  /* ===================== EXPORT / IMPORT CSV (combined assets+transactions) ===================== */
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
      if (linesRaw[0] && linesRaw[0].charCodeAt(0) === 0xFEFF) linesRaw[0] = linesRaw[0].slice(1); // remove BOM if present
      const lines = linesRaw.map(l => l.trimRight()).filter(l => l.length > 0 || l === "");
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

  /* ===================== PORTFOLIO GROWTH CHART (SVG) ===================== */
  // Build simplified time series from transactions + current market values
  // timeframeDays: 1,2,7,30,365,all -> days param
  const [growthTimeframe, setGrowthTimeframe] = useState("all"); // "1D","2D","1W","1M","1Y","ALL"
  function timeframeToDays(tf) {
    if (tf === "1D") return 1;
    if (tf === "2D") return 2;
    if (tf === "1W") return 7;
    if (tf === "1M") return 30;
    if (tf === "1Y") return 365;
    return 3650; // all ~10y
  }

  // Build points: for each day from earliest transaction/purchase date to now or timeframe limit
  const growthSeries = useMemo(() => {
    // bucket by date (day) compute total market value per category
    const days = timeframeToDays(growthTimeframe);
    const now = Date.now();
    const startCut = now - days * 24 * 3600 * 1000;
    // earliest date among transactions/assets
    const earliestAssetDate = assets.reduce((s,a) => Math.min(s, a.purchaseDate || a.createdAt || Date.now()), Date.now());
    const earliest = Math.min(earliestAssetDate, startCut);
    const stepMs = 24 * 3600 * 1000;
    const buckets = [];
    const d0 = new Date(earliest);
    // build day array from earliest (or startCut) to now
    let start = Math.max(earliest, startCut);
    // for small timeframes (<7 days) we will sample hourly for better curve
    const hourly = (growthTimeframe === "1D" || growthTimeframe === "2D");
    const points = [];
    if (hourly) {
      const hours = Math.max(24, days * 24);
      const startH = now - hours * 3600 * 1000;
      for (let i = 0; i <= hours; i++) {
        const t = startH + i * 3600 * 1000;
        points.push(t);
      }
    } else {
      const daysCount = Math.max(1, days);
      const startD = now - daysCount * 24 * 3600 * 1000;
      for (let i = 0; i <= daysCount; i++) {
        const t = startD + i * 24 * 3600 * 1000;
        points.push(t);
      }
    }

    // For each timestamp, compute per-category totals
    const seriesAll = [], seriesCrypto = [], seriesStock = [], seriesNon = [];
    points.forEach(t => {
      // For approximate historical, we will reconstruct value at time t by:
      // - For crypto: attempt to use coingecko history (we don't have weighty history cached here for all coins),
      //   but as a fallback, we will use linear interpolation between known transaction and current price.
      // - For stocks and nonliquid: approximate using current marketValue but scale by time since purchase using simple accrual for nonliquid and ignore intraday volatility.
      // To keep things responsive and without heavy API calls we approximate using existing transactions and current values.
      let totalAll = 0, totalCrypto = 0, totalStock = 0, totalNon = 0;
      assets.forEach(a => {
        let approxMarket = a.marketValueUSD || (a.shares * (a.lastPriceUSD || a.avgPrice || 0));
        if (a.type === "nonliquid") {
          const yrs = Math.max(0, (t - (a.purchaseDate || a.createdAt || Date.now())) / (365.25 * 24 * 3600 * 1000));
          const factor = Math.pow(1 + (toNum(a.nonLiquidYoy || 0) / 100), yrs);
          approxMarket = (a.investedUSD || (a.shares * a.avgPrice || 0)) * factor;
        } else if (a.type === "crypto") {
          // we don't fetch history for each coin for every point; use linear from purchase to now
          const purchase = a.purchaseDate || a.createdAt || Date.now();
          if (t < purchase) approxMarket = 0;
          else {
            const frac = (t - purchase) / Math.max(1, Date.now() - purchase);
            // assume linear growth from investedUSD to marketValueUSD
            approxMarket = (a.investedUSD || 0) + frac * ((a.marketValueUSD || 0) - (a.investedUSD || 0));
          }
        } else {
          // stock: similar linear interpolation
          const purchase = a.purchaseDate || a.createdAt || Date.now();
          if (t < purchase) approxMarket = 0;
          else {
            const frac = (t - purchase) / Math.max(1, Date.now() - purchase);
            approxMarket = (a.investedUSD || 0) + frac * ((a.marketValueUSD || 0) - (a.investedUSD || 0));
          }
        }
        totalAll += approxMarket;
        if (a.type === "crypto") totalCrypto += approxMarket;
        else if (a.type === "stock") totalStock += approxMarket;
        else if (a.type === "nonliquid") totalNon += approxMarket;
      });
      seriesAll.push({ t, v: totalAll });
      seriesCrypto.push({ t, v: totalCrypto });
      seriesStock.push({ t, v: totalStock });
      seriesNon.push({ t, v: totalNon });
    });

    return { all: seriesAll, crypto: seriesCrypto, stock: seriesStock, non: seriesNon, points };
  }, [assets, growthTimeframe, usdIdr, displayCcy]);

  /* ===================== CHART RENDER HELPERS (simple SVG line) ===================== */
  function renderLinePath(series, w, h, pad = 12) {
    if (!series || series.length === 0) return "";
    const vals = series.map(p => p.v);
    const times = series.map(p => p.t);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const minT = Math.min(...times), maxT = Math.max(...times);
    const rangeV = maxV - minV || 1;
    const rangeT = maxT - minT || 1;
    const scaleX = (i) => pad + ((series[i].t - minT) / rangeT) * (w - pad * 2);
    const scaleY = (i) => (h - pad) - ((series[i].v - minV) / rangeV) * (h - pad * 2);
    let d = "";
    for (let i = 0; i < series.length; i++) {
      const x = scaleX(i), y = scaleY(i);
      d += (i === 0 ? `M ${x},${y}` : ` L ${x},${y}`);
    }
    return { d, minV, maxV };
  }

  /* ===================== SHARE + QR logic ===================== */
  function buildSharePayload() {
    // Build small payload: totals + allocation percents + optionally numeric values (depending on hideValues)
    const total = totals.market;
    const parts = cakeData.map((c, i) => {
      const pct = total > 0 ? (c.value / total) * 100 : 0;
      return { name: c.name, pct: Number(pct.toFixed(2)), value: (hideValues ? null : Math.round(c.value * 100) / 100) };
    });
    const payload = {
      totals: { invested: totals.invested, market: totals.market, pnl: totals.pnl },
      hideValues: !!hideValues,
      data: parts,
      ccy: displayCcy,
      ts: Date.now(),
    };
    // encode as JSON base64
    try {
      const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      const link = `${location.origin}${location.pathname}#share=${encoded}`;
      return { link, payload };
    } catch (e) {
      const link = `${location.origin}${location.pathname}#share_simple`;
      return { link, payload: null };
    }
  }
  function openShare() {
    const { link, payload } = buildSharePayload();
    const text = `Share link: ${link}`;
    // create QR code url (Google Chart API)
    const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(link)}`;
    // open modal
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      // fallback: show prompt
      prompt("Share link (copy):", link);
      return;
    }
    w.document.write(`<html><head><title>Share Portfolio</title></head><body style="font-family:Arial;padding:20px;background:#111;color:#fff;">
      <h3>Share Portfolio</h3>
      <div style="margin:8px 0;">Link: <a href="${link}" target="_blank" style="color:#4fc3f7;">${link}</a></div>
      <div style="margin:8px 0;">QR:</div><img src="${qrUrl}" alt="QR" />
      <div style="margin-top:16px;">Data (based on ${hideValues ? "percentages only" : "numeric + percentages"}):<pre style="color:#ddd">${JSON.stringify(payload, null, 2)}</pre></div>
      </body></html>`);
    w.document.close();
  }

  /* ===================== ASSET ROW CLICK -> CHART modal ===================== */
  async function openAssetChart(a) {
    if (!a) return;
    // if crypto: fetch coingecko history and render a mini-line
    if (a.type === "crypto") {
      setChartModal({ open: true, asset: a, type: "coingecko" });
    } else {
      setChartModal({ open: true, asset: a, type: "tradingview" });
    }
  }
  function closeAssetChart() {
    setChartModal({ open: false, asset: null, type: null });
  }

  /* ===================== UI OUTSIDE CLICK CLOSE HELPERS ===================== */
  const filterMenuRef = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) {
        // close any open suggestion menus: we rely on controlled state
        setSuggestions([]);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  /* ===================== RENDER ===================== */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <span>All Portfolio</span>
              {/* dropdown icon next to title (no box, no 'filter' text) */}
              <button aria-label="Select portfolio" className="ml-1 transform hover:scale-105 transition-all duration-200" onClick={() => {
                // cycle through filters for simplicity on click
                const order = ["all","crypto","stock","nonliquid"];
                const idx = order.indexOf(portfolioFilter);
                setPortfolioFilter(order[(idx+1)%order.length]);
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-300">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>
            </h1>
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
          </div>

          <div className="flex items-center gap-3">
            {/* Value display dropdown (big number then small ccy + v icon) */}
            <div className="text-sm text-gray-400 mr-2">Portfolio Value</div>
            <div className="text-lg font-semibold flex items-center gap-2">
              <ValueDropdown
                value={displayCcy === "IDR" ? (totals.market * usdIdr) : totals.market}
                ccy={displayCcy}
                hide={hideValues}
                onChangeCcy={(c)=>setDisplayCcy(c)}
              />
              <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold transform hover:rotate-45 transition-all duration-300" onClick={() => setOpenAdd(v=>!v)} aria-label="Add asset">+</button>
            </div>
          </div>
        </div>

        {/* SUBHEADER KPIs */}
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          {/* small sub info already above */}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm items-center">
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Invested</div>
            <div className="font-medium text-lg">{hideValues ? "*****" : (displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD"))}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total invested</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Market</div>
            <div className="font-medium text-lg">{hideValues ? "*****" : (displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD"))}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total market value</div>
          </div>
          <div className="flex flex-col text-gray-400">
            <div className="text-xs">Gain P&L</div>
            <div className={`font-semibold text-lg ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")} <span className="text-sm text-gray-400">({totals.pnlPct.toFixed(2)}%)</span></div>
            <div className="text-xs text-gray-500 mt-0.5">Unrealized + realized</div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <div className="text-xs">Realized P&L <span title="Click to open transactions" style={{cursor:'pointer'}} onClick={openTxModal} className="ml-1 inline-block align-middle">
                <span style={{display:'inline-flex',alignItems:'center',background:'#222',padding:'2px 6px',borderRadius:6}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M3 12h9" stroke="#9CA3AF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"></path>
                    <path d="M14 9l5 3-5 3V9z" fill="#9CA3AF"></path>
                  </svg>
                </span>
              </span></div>
              <div className={`font-semibold text-lg ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{hideValues ? "*****" : (displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD"))}</div>
            </div>
            <div className="flex gap-2">
              <button title="Toggle hide values" onClick={() => setHideValues(h => !h)} className="p-2 rounded hover:bg-gray-800 transition">
                {hideValues ? <EyeOffIcon /> : <EyeIcon />}
              </button>
              <button title="Share portfolio" onClick={openShare} className="p-2 rounded hover:bg-gray-800 transition">
                <ShareIcon />
              </button>
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded border border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Indonesia Stocks</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""}`}>Non-Liquid</button>
              </div>
            </div>
            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : (searchMode==="nonliquid"? "Type asset name (e.g. Land, Art, Rolex)..." : "Search (AAPL | BBCA.JK)")} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
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
              <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option> <option value="IDR">IDR</option>
              </select>
              {searchMode === "nonliquid" && (
                <input value={initPurchaseDate} onChange={(e)=>setInitPurchaseDate(e.target.value)} type="date" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold transform hover:scale-105 transition">Add</button>
                <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold transform hover:scale-105 transition">Add + Position</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ASSET TABLE */}
        <div className="mt-6 overflow-x-auto">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-gray-400">Assets</div>
            <div className="flex items-center gap-2">
              <button title="Filter / Sort" onClick={() => {
                // open sort menu (simple)
                const opts = ["value_desc","value_asc","symbol_asc","newest","oldest"];
                const idx = opts.indexOf(assetSort);
                setAssetSort(opts[(idx+1)%opts.length]);
              }} className="p-2 rounded hover:bg-gray-800">
                <FilterIcon />
              </button>
              <button onClick={exportAllCSV} className="bg-blue-600 px-3 py-2 rounded font-semibold hover:bg-blue-500">Export CSV</button>
              <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
                Import CSV
                <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
              </label>
            </div>
          </div>

          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">avg price</div></th>
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
                    <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openAssetChart(r)}>{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{hideValues ? "*****" : (displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD"))}</div>
                    <div className="text-xs text-gray-500">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{hideValues ? "*****" : (displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD"))}</div>
                    <div className="text-xs text-gray-500">{displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")}</div>
                  </td>
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

        {/* PORTFOLIO GROWTH CHART (above cake) */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-300 font-semibold">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1D","2D","1W","1M","1Y","ALL"].map(tf => (
                <button key={tf} onClick={()=>setGrowthTimeframe(tf)} className={`px-3 py-1 rounded text-xs ${growthTimeframe===tf? "bg-gray-700":"bg-transparent"} hover:bg-gray-700 transition`}>{tf}</button>
              ))}
            </div>
          </div>

          <div style={{width:"100%",height:220}}>
            <svg width="100%" height="220" viewBox="0 0 800 220" preserveAspectRatio="none">
              {/* background grid */}
              <rect x="0" y="0" width="800" height="220" fill="#0b0b0b" />
              {/* series lines */}
              {(() => {
                const w = 760, h = 200, pad = 20;
                const series = growthSeries;
                const items = [
                  { series: series.all, color: "#4D96FF", name: "All"},
                  { series: series.crypto, color: "#FF6B6B", name: "Crypto"},
                  { series: series.stock, color: "#6BCB77", name: "Stocks"},
                  { series: series.non, color: "#FFD93D", name: "Non-Liquid"},
                ];
                return items.map((it, idx) => {
                  const res = renderLinePath(it.series, w, h, pad);
                  return <path key={idx} d={res.d} transform={`translate(20,10)`} fill="none" stroke={it.color} strokeWidth={idx===0?2.6:1.6} strokeLinecap="round" strokeLinejoin="round" opacity={idx===0?1:0.9}></path>;
                });
              })()}
            </svg>
            <div className="mt-2 text-xs text-gray-400">Small labels under each line show latest value (per category)</div>
            <div className="mt-2 flex gap-4 text-xs">
              <div className="flex items-center gap-2"><span style={{width:10,height:10,background:"#4D96FF",display:"inline-block"}}></span> <div className="text-gray-300">All {hideValues ? "*****" : (displayCcy==="IDR"? fmtMoney(totals.market*usdIdr,"IDR") : fmtMoney(totals.market,"USD"))}</div></div>
              <div className="flex items-center gap-2"><span style={{width:10,height:10,background:"#FF6B6B",display:"inline-block"}}></span> <div className="text-gray-400">Crypto {hideValues ? "*****" : (displayCcy==="IDR"? fmtMoney(rows.filter(r=>r.type==="crypto").reduce((s,r)=>s+r.marketValueUSD,0)*usdIdr,"IDR") : fmtMoney(rows.filter(r=>r.type==="crypto").reduce((s,r)=>s+r.marketValueUSD,0),"USD"))}</div></div>
              <div className="flex items-center gap-2"><span style={{width:10,height:10,background:"#6BCB77",display:"inline-block"}}></span> <div className="text-gray-400">Stocks {hideValues ? "*****" : (displayCcy==="IDR"? fmtMoney(rows.filter(r=>r.type==="stock").reduce((s,r)=>s+r.marketValueUSD,0)*usdIdr,"IDR") : fmtMoney(rows.filter(r=>r.type==="stock").reduce((s,r)=>s+r.marketValueUSD,0),"USD"))}</div></div>
              <div className="flex items-center gap-2"><span style={{width:10,height:10,background:"#FFD93D",display:"inline-block"}}></span> <div className="text-gray-400">Non-Liquid {hideValues ? "*****" : (displayCcy==="IDR"? fmtMoney(rows.filter(r=>r.type==="nonliquid").reduce((s,r)=>s+r.marketValueUSD,0)*usdIdr,"IDR") : fmtMoney(rows.filter(r=>r.type==="nonliquid").reduce((s,r)=>s+r.marketValueUSD,0),"USD"))}</div></div>
            </div>
          </div>
        </div>

        {/* CAKE ALLOCATION */}
        {rows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-full sm:w-48 h-48 flex items-center justify-center bg-gray-900 rounded border border-gray-800">
              {/* cake svg */}
              <CakeChart data={cakeData} total={totals.market} displayCcy={displayCcy} usdIdr={usdIdr} hideValues={hideValues} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
              {cakeData.map((d, i) => {
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div>
                      <div className="font-semibold text-gray-100">{d.name}</div>
                      <div className="text-xs text-gray-400">{hideValues ? "*****" : (displayCcy==="IDR"? fmtMoney(d.value*usdIdr,"IDR"): fmtMoney(d.value,"USD"))} • {pct.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EXPORT / IMPORT / CSV / Clear */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (assets + transactions)</div>
            <div className="text-xs text-gray-500">Export includes assets + transactions + metadata; formatted for spreadsheet.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={exportAllCSV} className="bg-blue-600 px-3 py-2 rounded font-semibold hover:bg-blue-500">Export CSV</button>
            <label className="bg-emerald-500 px-3 py-2 rounded font-semibold cursor-pointer">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={() => { if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return; setAssets([]); setRealizedUSD(0); }} className="bg-red-600 px-3 py-2 rounded font-semibold">Clear All</button>
          </div>
        </div>

      </div>

      {/* TRADE MODAL */}
      {tradeModal.open && (
        <TradeModal
          mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)}
          defaultPrice={tradeModal.defaultPrice} onClose={closeTradeModal}
          onBuy={performBuy} onSell={performSell} usdIdr={usdIdr}
        />
      )}

      {/* TRANSACTIONS MODAL */}
      {txModalOpen && (
        <TransactionsModal transactions={transactions} onClose={closeTxModal} onDelete={deleteTransaction} onUndo={undoTransaction} filter={txFilterMode} setFilter={(f)=>setTxFilterMode(f)} />
      )}

      {/* CHART MODAL */}
      {chartModal.open && (
        <AssetChartModal asset={chartModal.asset} type={chartModal.type} onClose={closeAssetChart} coingeckoHistoryFetcher={COINGECKO_HISTORY} displayCcy={displayCcy} usdIdr={usdIdr} />
      )}

    </div>
  );
}

/* ===================== SMALL UI SUBCOMPONENTS ===================== */

function ValueDropdown({ value, ccy, hide, onChangeCcy }) {
  // value numeric already in displayCcy base (if IDR then it's IDR already)
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={()=>setOpen(o=>!o)} className="text-left flex items-baseline gap-2">
        <div className="text-xl font-semibold">{hide ? "*****" : (ccy === "IDR" ? Math.round(value).toLocaleString() : Number(value || 0).toFixed(2))}</div>
        <div className="text-xs text-gray-400">{ccy} <span style={{marginLeft:6}}>▾</span></div>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 bg-gray-900 border border-gray-800 rounded p-2 z-50">
          <button onClick={()=>{ onChangeCcy("USD"); setOpen(false); }} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-800">USD</button>
          <button onClick={()=>{ onChangeCcy("IDR"); setOpen(false); }} className="block w-full text-left px-2 py-1 rounded hover:bg-gray-800">IDR</button>
        </div>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#ddd" strokeWidth="1.6"/><circle cx="12" cy="12" r="3" stroke="#ddd" strokeWidth="1.6" /></svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A9.99 9.99 0 0 1 12 19c-7 0-11-7-11-7a20.9 20.9 0 0 1 5.94-6.94" stroke="#ddd" strokeWidth="1.6"/><path d="M1 1l22 22" stroke="#ddd" strokeWidth="1.6"/></svg>
  );
}
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke="#ddd" strokeWidth="1.6"/><path d="M16 6l-4-4-4 4" stroke="#ddd" strokeWidth="1.6"/><path d="M12 2v14" stroke="#ddd" strokeWidth="1.6"/></svg>
  );
}
function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="#ddd" strokeWidth="1.6" strokeLinecap="round"/></svg>
  );
}

/* ===================== CAKE CHART SUBCOMPONENT (SVG) ===================== */
function CakeChart({ data, total, displayCcy, usdIdr, hideValues }) {
  // data: [{name,value}]
  const size = 200, inner = 46;
  const cx = size/2, cy = size/2;
  const rMax = size/2 - 8;
  // compute radii scaled to value
  const maxVal = Math.max(...data.map(d=>d.value), 1);
  const angleTotal = data.reduce((s,d)=>s+(d.value>0?d.value:0),0) || 1;
  let startAngle = -Math.PI/2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded">
      <defs>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow stdDeviation="6" dx="0" dy="2" floodColor="#000" floodOpacity="0.25"/>
        </filter>
      </defs>
      {data.map((d,i) => {
        const portion = Math.max(0, d.value || 0) / (angleTotal || 1);
        const angle = portion * Math.PI * 2;
        const end = startAngle + angle;
        const outerR = inner + ( (Math.sqrt(d.value/maxVal)) * (rMax - inner) ); // radius scaled by sqrt for visual
        const x1 = cx + inner * Math.cos(startAngle), y1 = cy + inner * Math.sin(startAngle);
        const x2 = cx + outerR * Math.cos(startAngle), y2 = cy + outerR * Math.sin(startAngle);
        const x3 = cx + outerR * Math.cos(end), y3 = cy + outerR * Math.sin(end);
        const x4 = cx + inner * Math.cos(end), y4 = cy + inner * Math.sin(end);
        const large = angle > Math.PI ? 1 : 0;
        const path = `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${large} 1 ${x3} ${y3} L ${x4} ${y4} A ${inner} ${inner} 0 ${large} 0 ${x1} ${y1} Z`;
        const color = colorForIndex(i);
        startAngle = end;
        return (
          <g key={d.name}>
            <path d={path} fill={color} stroke="#070707" strokeWidth="0.6" className="slice" style={{transition:"transform .25s"}} />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={inner-6} fill="#070707" />
      <text x={cx} y={cy} textAnchor="middle" alignmentBaseline="middle" className="center" style={{fill:"#9CA3AF",fontSize:12}}>{hideValues ? "" : (displayCcy==="IDR" ? (fmtMoney(Math.round(total*usdIdr), "IDR")) : fmtMoney(total, "USD"))}</text>
    </svg>
  );
}

/* ===================== TRADE MODAL COMPONENT ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, usdIdr }) {
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
            <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 focus:outline-none" placeholder="0.00" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Price per unit</label>
            <div className="flex rounded overflow-hidden">
              <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded-l border border-gray-700 focus:outline-none" placeholder="0.00" />
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

/* ===================== TRANSACTIONS MODAL ===================== */
function TransactionsModal({ transactions, onClose, onDelete, onUndo, filter, setFilter }) {
  const filtered = transactions.filter(t => filter === "all" ? true : t.type === filter);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-2xl border border-gray-800 text-sm">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Transactions</h3>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e)=>setFilter(e.target.value)} className="bg-gray-800 px-2 py-1 rounded text-sm">
              <option value="all">All</option><option value="buy">Buy</option><option value="sell">Sell</option>
            </select>
            <button onClick={onClose} className="px-3 py-1 bg-gray-800 rounded">Close</button>
          </div>
        </div>
        <div className="mt-4 max-h-80 overflow-auto">
          {filtered.length === 0 ? <div className="text-gray-400">No transactions</div> : filtered.map(tx => (
            <div key={tx.id} className="flex items-center justify-between gap-3 p-2 hover:bg-gray-800 rounded">
              <div>
                <div className="font-medium">{tx.type.toUpperCase()} • {tx.symbol} • {tx.qty} @ {fmtMoney(tx.pricePerUnit || 0, "USD")}</div>
                <div className="text-xs text-gray-400">{shortDate(tx.date)} • Realized: {fmtMoney(tx.realized || 0, "USD")}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>onUndo(tx.id)} className="px-2 py-1 bg-emerald-500 rounded text-black text-xs">Restore</button>
                <button onClick={()=>onDelete(tx.id)} className="px-2 py-1 bg-red-600 rounded text-xs">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== ASSET CHART MODAL ===================== */
function AssetChartModal({ asset, type, onClose, coingeckoHistoryFetcher, displayCcy, usdIdr }) {
  const [history, setHistory] = useState(null);
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!asset) return;
      if (type === "coingecko" && asset.coingeckoId) {
        try {
          const res = await fetch(coingeckoHistoryFetcher(asset.coingeckoId, 30)); // 30 days
          if (!res.ok) return;
          const j = await res.json();
          if (mounted) setHistory(j);
        } catch (e) {}
      }
      // tradingview for stocks is embedded via script
    }
    load();
    return () => { mounted = false; };
  }, [asset, type]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[200]">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-3xl border border-gray-800">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold">{asset.symbol} — {asset.name}</h2>
            <p className="text-xs text-gray-400">{asset.description}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">×</button>
        </div>
        <div className="mt-4">
          {type === "coingecko" ? (
            <div>
              {!history ? <div className="text-gray-400">Loading chart...</div> : (
                <CoingeckoMiniChart history={history} displayCcy={displayCcy} usdIdr={usdIdr} />
              )}
            </div>
          ) : (
            <div>
              {/* TradingView embed for stocks */}
              <div id={`tv_widget_${asset.symbol}`} style={{width:"100%",height:500}} />
              <TradingViewEmbed symbol={asset.symbol} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Coingecko mini chart (simple SVG) ===================== */
function CoingeckoMiniChart({ history, displayCcy, usdIdr }) {
  // history.prices: [ [ts, price], ... ]
  const prices = history?.prices || [];
  if (!prices || prices.length === 0) return <div className="text-gray-400">No history</div>;
  const series = prices.map(p => ({ t: p[0], v: p[1] }));
  const { d } = (() => {
    const w = 700, h = 240, pad = 20;
    const vals = series.map(p=>p.v);
    const times = series.map(p=>p.t);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const minT = Math.min(...times), maxT = Math.max(...times);
    const rangeV = maxV - minV || 1;
    const rangeT = maxT - minT || 1;
    const scaleX = (i) => pad + ((series[i].t - minT) / rangeT) * (w - pad * 2);
    const scaleY = (i) => (h - pad) - ((series[i].v - minV) / rangeV) * (h - pad * 2);
    let d = "";
    for (let i=0;i<series.length;i++) {
      const x = scaleX(i), y = scaleY(i);
      d += (i===0? `M ${x},${y}` : ` L ${x},${y}`);
    }
    return { d };
  })();
  // latest value:
  const latest = series[series.length-1].v;
  const displayVal = displayCcy === "IDR" ? fmtMoney(latest * usdIdr, "IDR") : fmtMoney(latest, "USD");
  return (
    <div>
      <svg width="100%" height="240" viewBox="0 0 700 240" preserveAspectRatio="none">
        <rect x="0" y="0" width="700" height="240" fill="#071426" rx="6" />
        <path d={d} fill="none" stroke="#4D96FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-2 text-sm text-gray-300">Latest: {displayVal}</div>
    </div>
  );
}

/* ===================== TradingView EMBED helper (inject script) ===================== */
function TradingViewEmbed({ symbol }) {
  useEffect(() => {
    // Insert TradingView widget script
    const id = `tv_${symbol}`;
    const container = document.getElementById(`tv_widget_${symbol}`);
    if (!container) return;
    container.innerHTML = ""; // clear previous
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/tv.js";
    script.onload = () => {
      try {
        // global TradingView
        if (window.TradingView) {
          new window.TradingView.widget({
            "width": "100%",
            "height": 500,
            "symbol": symbol.replace(".JK","IDX:")+"", // attempt to adapt
            "interval": "D",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "toolbar_bg": "#1f2937",
            "enable_publishing": false,
            "hide_side_toolbar": false,
            "allow_symbol_change": true,
            "container_id": `tv_widget_${symbol}`
          });
        }
      } catch (e) {
        // ignore
      }
    };
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch(e){} };
  }, [symbol]);
  return null;
}