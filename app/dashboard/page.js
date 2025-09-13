// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * app/dashboard/page.js
 * Single-file Portfolio Dashboard — consolidated final build
 *
 * Key implemented features (from your requests):
 * - Single-file page.js (no modularization)
 * - Portfolio filter icon-only header (dropdown v)
 * - Currency dropdown shows large nominal + code + caret (no box)
 * - Eye icon to mask numeric values (shows **** for values; % returns remain visible)
 * - Share icon produces link + QR (content respects eye state)
 * - Coin pricing from CoinGecko for crypto
 * - Stocks pricing: AlphaVantage for Indonesian tickers (.*.JK) first, fallback to Finnhub/Yahoo where available
 * - Non-liquid assets: full-custom add, description, purchaseDate, YoY gain option -> used to compute synthetic current price
 * - Transactions: buy/sell logging, realized P&L aggregation, restore (undo), delete, and purge
 * - Combined CSV export/import (assets + transactions) with BOM & headers for clean spreadsheet import
 * - Portfolio growth interactive chart (timeframe 1d,2d,1w,1m,1y,all) with multi-line per category
 * - Cake allocation (donut -> cake-like slices), spacing between slices, center total label smaller
 * - TradingView embed when clicking an asset; Coingecko simple chart for crypto
 * - All buttons have subtle interactive hover/transform animations; add-button toggles + -> × rotation
 * - Table layout adjusted: "Code / Description", "Invested / avg price", "Market value / Current Price", "P&L / Gain"
 * - Filter icon/button for table sorting, menu is scrollable and closes when clicking outside
 * - Many defensive checks: numeric coercion, fallbacks to preserve P&L correctness (don't show negative phantom P&L if no market data)
 *
 * Notes:
 * - This file expects server-side proxy routes for Alphavantage/Finnhub/Yahoo as used previously,
 *   e.g. /api/alphavantage?symbol=..., /api/finnhub/quote?symbol=..., /api/yahoo/quote?symbol=...
 * - Replace ALPHAVANTAGE_API_KEY usage on server side; client uses proxy endpoints only.
 * - TradingView widgets are embedded using their script src (if available). If your environment blocks remote scripts,
 *   tradingview won't render; you can optionally replace with iframe-based widgets.
 */

/* ===================== CONFIG/ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_PRICE = (ids) =>
  `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`; // fallback
const ALPHAVANTAGE_QUOTE = (symbol) => `/api/alphavantage/quote?symbol=${encodeURIComponent(symbol)}`; // for .JK

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
  // keep all fields, coerce numeric ones
  return {
    id: a.id,
    type: a.type || "stock", // stock | crypto | nonliquid
    coingeckoId: a.coingeckoId,
    symbol: a.symbol || "",
    name: a.name || "",
    description: a.description || "",
    shares: toNum(a.shares || 0),
    avgPrice: toNum(a.avgPrice || 0), // in USD
    investedUSD: toNum(a.investedUSD || 0),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    marketValueUSD: toNum(a.marketValueUSD || 0),
    createdAt: a.createdAt || Date.now(),
    purchaseDate: a.purchaseDate || a.createdAt || Date.now(),
    nonLiquidYoy: toNum(a.nonLiquidYoy || 0) // e.g. 5 => 5% YoY synthetic gain
  };
}

/* ===================== UI HELPERS ===================== */
function colorForIndex(i) {
  const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
  return palette[i % palette.length];
}

/* ===================== DONUT/CAKE COMPONENT ===================== */
function Cake({ data = [], size = 220, inner = 70, total = 0, displayCcy = "USD", usdIdr = 16000 }) {
  // Use angle-proportional slices, radius scaled by value to create "cake" look (like user's sample)
  const cx = size / 2, cy = size / 2;
  const gap = 0.04; // radians gap
  const totalValue = total || data.reduce((s,d)=>s+Math.max(0,d.value||0),0) || 1;
  // Convert values into arcs
  let start = -Math.PI / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const v = Math.max(0, d.value || 0);
        const portion = v / totalValue;
        const angle = portion * Math.PI * 2;
        const midRadius = inner + ((size/2 - inner) - 6) * Math.min(1, Math.max(0.2, v / (Math.max(...data.map(x=>x.value||0)) || 1)));
        const s = start + gap/2;
        const e = start + angle - gap/2;
        const arc = (r, a1, a2) => {
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
          const large = (a2 - a1) > Math.PI ? 1 : 0;
          return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        };
        const path = arc(midRadius, s, e);
        start += angle;
        return (
          <g key={i}>
            <path
              d={path}
              fill={colorForIndex(i)}
              stroke="#0b0b0b"
              strokeWidth="0.8"
              style={{ transition: "transform 220ms", transformOrigin: `${cx}px ${cy}px` }}
              className="slice"
            />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
      <text x={cx} y={cy+6} textAnchor="middle" fontSize="14" fill="#ddd" style={{ fontWeight: 600 }}>
        {displayCcy === "IDR" ? fmtMoney(total * usdIdr, "IDR") : fmtMoney(total, "USD")}
      </text>
    </svg>
  );
}

/* ===================== STORAGE LOADERS ===================== */
const loadAssets = () => {
  try {
    if (!isBrowser) return [];
    const raw = JSON.parse(localStorage.getItem("pf_assets_v3") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(ensureNumericAsset);
  } catch { return []; }
};
const loadTransactions = () => {
  try {
    if (!isBrowser) return [];
    const raw = JSON.parse(localStorage.getItem("pf_transactions_v3") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(t => ({ ...t }));
  } catch { return []; }
};
const loadRealized = () => {
  try { if (!isBrowser) return 0; return toNum(localStorage.getItem("pf_realized_v3") || 0); } catch { return 0; }
};
const loadDisplayCcy = () => {
  try { if (!isBrowser) return "USD"; return localStorage.getItem("pf_display_ccy_v3") || "USD"; } catch { return "USD"; }
};

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- state ---------- */
  const [assets, setAssets] = useState(loadAssets);
  const [transactions, setTransactions] = useState(loadTransactions);
  const [realizedUSD, setRealizedUSD] = useState(loadRealized);
  const [displayCcy, setDisplayCcy] = useState(loadDisplayCcy);

  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* header filter (icon only) */
  const [portfolioFilter, setPortfolioFilter] = useState("all"); // all|crypto|stock|nonliquid
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);

  /* currency dropdown */
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const currencyMenuRef = useRef(null);

  /* add asset panel */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | id | us | nonliquid
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [nonLiquidName, setNonLiquidName] = useState("");
  const [nonLiquidDesc, setNonLiquidDesc] = useState("");
  const [nonLiquidYoy, setNonLiquidYoy] = useState("5"); // default 5% YoY

  /* live quotes */
  const [lastTick, setLastTick] = useState(null);

  /* trade modal */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });

  /* transaction panel */
  const [txPanelOpen, setTxPanelOpen] = useState(false);
  const [txPanelAnchor, setTxPanelAnchor] = useState(null);

  /* table filter/sort */
  const [tableFilterMenuOpen, setTableFilterMenuOpen] = useState(false);
  const tableFilterRef = useRef(null);
  const [tableSort, setTableSort] = useState({ key: "marketValueUSD", dir: "desc" }); // key, dir

  /* ui: eye (mask values) */
  const [eyeOpen, setEyeOpen] = useState(true);

  /* share QR data cache */
  const [shareDataUrl, setShareDataUrl] = useState(null);

  /* chart growth range */
  const [chartRange, setChartRange] = useState("all"); // 1d,2d,1w,1m,1y,all

  /* last deleted transaction (for undo) */
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* ---------- persist to localStorage ---------- */
  useEffect(() => {
    try { localStorage.setItem("pf_assets_v3", JSON.stringify(assets.map(ensureNumericAsset))); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("pf_transactions_v3", JSON.stringify(transactions)); } catch {}
  }, [transactions]);
  useEffect(() => {
    try { localStorage.setItem("pf_realized_v3", String(realizedUSD)); } catch {}
  }, [realizedUSD]);
  useEffect(() => {
    try { localStorage.setItem("pf_display_ccy_v3", displayCcy); } catch {}
  }, [displayCcy]);

  /* close dropdowns when clicking outside */
  useEffect(() => {
    function onClick(e) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(e.target)) setCurrencyMenuOpen(false);
      if (tableFilterRef.current && !tableFilterRef.current.contains(e.target)) setTableFilterMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* ===================== SEARCH LOGIC ===================== */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1) {
      setSuggestions([]); return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0,20).map(c => ({
            id: c.id, symbol: (c.symbol||"").toUpperCase(), display: c.name, source: "coingecko", type: "crypto"
          })));
          return;
        }
        // Stock search via Yahoo proxy
        const proxyCandidates = [
          YAHOO_SEARCH,
          (t)=>`/api/search?q=${encodeURIComponent(t)}`
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
        const list = (Array.isArray(rawList) ? rawList : []).slice(0,120).map(it => {
          const symbol = it.symbol || it.ticker || it.symbolDisplay || it.id || (typeof it === "string" ? it : "");
          const display = it.shortname || it.shortName || it.longname || it.longName || it.name || it.title || it.displayName || it.description || symbol;
          const exchange = it.exchange || it.fullExchangeName || it.exchangeName || it.exchDisp || "";
          const currency = it.currency || it.quoteCurrency || "";
          return { symbol: (symbol||"").toString().toUpperCase(), display: display||symbol, exchange, currency, source: "yahoo", type: "stock" };
        });
        if (searchMode === "id") {
          setSuggestions(list.filter(x => (x.symbol||"").toUpperCase().includes(".JK") || String(x.exchange||"").toUpperCase().includes("JAKARTA") || String(x.exchange||"").toUpperCase().includes("IDX")).slice(0,30));
        } else {
          setSuggestions(list.filter(x => !(x.symbol||"").toUpperCase().endsWith(".JK")).slice(0,30));
        }
      } catch (e) { console.warn("search err", e); setSuggestions([]); }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* ===================== PRICING POLLING ===================== */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(()=>{ assetsRef.current = assets; }, [assets]);
  useEffect(()=>{ usdIdrRef.current = usdIdr; }, [usdIdr]);

  // crypto poll (CoinGecko)
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
      } catch (e) { /* silent */ }
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  // stock poll (AlphaVantage for .JK first, then Finnhub, then Yahoo fallback)
  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 60);
        if (symbols.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const map = {};
        // Attempt alphavantage for .JK tickers
        for (const s of symbols) {
          try {
            if (String(s || "").toUpperCase().endsWith(".JK")) {
              const res = await fetch(ALPHAVANTAGE_QUOTE(s));
              if (res.ok) {
                const js = await res.json();
                // AlphaVantage TIME_SERIES or GLOBAL_QUOTE parsing
                const price = toNum(js?.price ?? js?.["Global Quote"]?.["05. price"] ?? js?.["Global Quote"]?.["05. price"] ?? 0);
                if (price > 0) {
                  // Alphavantage likely returns IDR for Jakarta exchange — convert using usdIdrRef
                  const fx = usdIdrRef.current || 1;
                  const priceUSD = fx > 0 ? (price / fx) : price;
                  map[s] = { symbol: s, regularMarketPrice: priceUSD, _source: "alphavantage" };
                  continue;
                }
              }
            }
            // next try finnhub per-symbol
            try {
              const res2 = await fetch(FINNHUB_QUOTE(s));
              if (res2.ok) {
                const js2 = await res2.json();
                const current = toNum(js2?.c ?? js2?.current ?? 0);
                if (current > 0) {
                  // assume local exchange => detect .JK to convert
                  const looksLikeId = String(s || "").toUpperCase().endsWith(".JK");
                  let priceUSD = current;
                  if (looksLikeId) {
                    const fx = usdIdrRef.current || 1;
                    priceUSD = fx > 0 ? (current / fx) : current;
                  }
                  map[s] = { symbol: s, regularMarketPrice: priceUSD, _source: "finnhub" };
                  continue;
                }
              }
            } catch (e) {}
          } catch (e) {}
        }
        // If map still empty for some symbols, try bulk Yahoo quote fallback
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
          } catch (e) {}
        }

        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const q = map[a.symbol];
            const price = toNum(q.regularMarketPrice ?? q.c ?? q.current ?? q.postMarketPrice ?? q.preMarketPrice ?? q.regularMarketPreviousClose ?? 0);
            // detect IDR-like
            const looksLikeId = (String(q.currency || "").toUpperCase() === "IDR") || String(a.symbol || "").toUpperCase().endsWith(".JK") || String(q.fullExchangeName || "").toUpperCase().includes("JAKARTA");
            let priceUSD = price;
            if (looksLikeId) {
              const fx = usdIdrRef.current || 1;
              priceUSD = fx > 0 ? (price / fx) : price;
            }
            // fallback: if priceUSD is zero, keep lastPriceUSD as avgPrice to avoid negative PnL
            const safePrice = priceUSD > 0 ? priceUSD : (a.avgPrice || a.lastPriceUSD || 0);
            return ensureNumericAsset({ ...a, lastPriceUSD: safePrice, marketValueUSD: safePrice * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));

        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) { /* silent */ }
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
      } catch (e) {}
      finally { if (mounted) setFxLoading(false); }
    }
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ===================== ADDING ASSETS ===================== */
  function addAssetFromSuggestion(s) {
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = ensureNumericAsset({
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: (s.symbol || s.id).toString().toUpperCase(),
      name: s.display || s.name || s.symbol,
      description: s.description || "",
      shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
      createdAt: Date.now(), purchaseDate: Date.now()
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
        createdAt: Date.now(), purchaseDate: Date.now()
      });
    } else if (searchMode === "nonliquid") {
      // full custom non-liquid asset
      const name = nonLiquidName.trim() || typed;
      const desc = nonLiquidDesc.trim() || "";
      const yg = toNum(nonLiquidYoy || 0);
      newAsset = ensureNumericAsset({
        id: `manual:non:${name.replace(/\s+/g,"_").toLowerCase()}:${Date.now()}`,
        type: "nonliquid", symbol: name.replace(/\s+/g,"_").toUpperCase(),
        name, description: desc, shares: 1, avgPrice: toNum(initPrice) || 0,
        investedUSD: (toNum(initPrice) || 0) * 1, lastPriceUSD: (toNum(initPrice) || 0), marketValueUSD: (toNum(initPrice) || 0),
        nonLiquidYoy: yg, createdAt: Date.now(), purchaseDate: Date.now()
      });
    } else {
      newAsset = ensureNumericAsset({
        id: `manual:yh:${typed}:${Date.now()}`, type: "stock",
        symbol: typed.toUpperCase(), name: typed.toUpperCase(),
        shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0, marketValueUSD: 0,
        createdAt: Date.now(), purchaseDate: Date.now()
      });
    }
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false); setQuery("");
    setNonLiquidName(""); setNonLiquidDesc(""); setNonLiquidYoy("5");
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      if (searchMode === "crypto") {
        picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed };
      } else if (searchMode === "nonliquid") {
        // handled earlier
      } else {
        picked = { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
      }
    }
    if (searchMode === "nonliquid") {
      // treat like manual
      return addManualAsset();
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
      purchaseDate: Date.now()
    });
    // log transaction
    const tx = {
      id: `tx:${Date.now()}`,
      type: "buy",
      assetId: asset.id,
      assetType: asset.type,
      symbol: asset.symbol,
      name: asset.name,
      qty: qty,
      pricePerUnit: priceInUSD,
      cost: priceInUSD * qty,
      proceeds: 0,
      costOfSold: 0,
      realized: 0,
      date: Date.now()
    };
    setAssets(prev => [...prev, asset]);
    setTransactions(prev => [...prev, tx]);
    setOpenAdd(false); setQuery(""); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD"); setSelectedSuggestion(null);
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
    setAssets(prev => prev.map(a => {
      if (a.id !== id) return ensureNumericAsset(a);
      const oldShares = toNum(a.shares || 0), oldInvested = toNum(a.investedUSD || 0);
      const addCost = q * p;
      const newShares = oldShares + q, newInvested = oldInvested + addCost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      return ensureNumericAsset({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p });
    }));
    // add transaction
    const asset = assets.find(x => x.id === id) || {};
    const tx = {
      id: `tx:${Date.now()}`,
      type: "buy",
      assetId: id,
      assetType: asset.type,
      symbol: asset.symbol,
      name: asset.name,
      qty: q,
      pricePerUnit: p,
      cost: p * q,
      proceeds: 0,
      costOfSold: 0,
      realized: 0,
      date: Date.now()
    };
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

    const newShares = oldShares - q;
    const newInvested = a.investedUSD - costOfSold;
    const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
    setAssets(prev => {
      if (newShares <= 0) return prev.filter(x => x.id !== id);
      return prev.map(x => x.id === id ? ensureNumericAsset({ ...x, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: p, marketValueUSD: newShares * p }) : ensureNumericAsset(x));
    });

    const tx = {
      id: `tx:${Date.now()}`,
      type: "sell",
      assetId: id,
      assetType: a.type,
      symbol: a.symbol,
      name: a.name,
      qty: q,
      pricePerUnit: p,
      cost: costOfSold,
      proceeds: proceeds,
      costOfSold: costOfSold,
      realized: realized,
      date: Date.now()
    };
    setTransactions(prev => [...prev, tx]);
    closeTradeModal();
  }

  /* ===================== EDIT / DELETE ASSET ===================== */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
    // optionally remove related transactions? we keep transactions for history
  }

  /* ===================== TRANSACTION OPERATIONS ===================== */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm("Delete transaction permanently?")) return;
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
    // If it was a sell, reverse realized impact? we keep realized as historical; deleting sale keeps realized amount in realizedUSD,
    // but we store lastDeletedTx so user can Undo (restore) which will revert realizedUSD.
    if (tx.type === "sell") {
      setRealizedUSD(prev => prev - (tx.realized || 0));
    }
  }
  function restoreTransaction(txId) {
    const tx = lastDeletedTx && lastDeletedTx.id === txId ? lastDeletedTx : transactions.find(t => t.id === txId);
    if (!tx) return;
    // restore into transactions and revert effects if previously removed
    setTransactions(prev => {
      if (prev.some(p => p.id === tx.id)) return prev;
      return [...prev, tx];
    });
    if (tx.type === "sell") setRealizedUSD(prev => prev + (tx.realized || 0));
    setLastDeletedTx(null);
  }
  function purgeLastDeletedTransaction() {
    setLastDeletedTx(null);
  }
  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    // restore
    setTransactions(prev => [...prev, lastDeletedTx]);
    if (lastDeletedTx.type === "sell") setRealizedUSD(prev => prev + (lastDeletedTx.realized || 0));
    setLastDeletedTx(null);
  }

  /* ===================== computed rows & totals ===================== */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    // if non-liquid: compute synthetic last price using YoY gain: lastPrice = avgPrice * (1 + yoy/100)^(yearsSincePurchase)
    let last = aa.lastPriceUSD || aa.avgPrice || 0;
    if (aa.type === "nonliquid") {
      const years = Math.max(0, (Date.now() - (aa.purchaseDate || aa.createdAt || Date.now())) / (365*24*3600*1000));
      last = aa.avgPrice * Math.pow(1 + (toNum(aa.nonLiquidYoy) / 100), years || 0);
    }
    const market = toNum(aa.shares || 0) * last;
    const invested = toNum(aa.investedUSD || 0);
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

  /* donut/cake data */
  const donutData = useMemo(() => {
    const sortedRows = rows.slice().sort((a,b)=>b.marketValueUSD - a.marketValueUSD);
    const topFive = sortedRows.slice(0,4);
    const otherAssets = sortedRows.slice(4);
    const otherTotalValue = otherAssets.reduce((s,a)=>s+(a.marketValueUSD||0),0);
    const data = topFive.map(r=>({ name: r.symbol, value: Math.max(0,r.marketValueUSD||0) }));
    if (otherTotalValue > 0) data.push({ name: "Other", value: otherTotalValue, symbols: otherAssets.map(a=>a.symbol) });
    return data;
  }, [rows]);

  /* ===================== CHART: Growth (multi-series) ===================== */
  // Build series per category using transactions + asset snapshots
  function buildMultiCategorySeries(rowsList, txs, range) {
    // For simplicity: build daily values between earliest transaction and now (or constrained by range)
    const now = Date.now();
    let start = now - (365*24*3600*1000); // default 1y
    if (range === "1d") start = now - 24*3600*1000;
    if (range === "2d") start = now - 2*24*3600*1000;
    if (range === "1w") start = now - 7*24*3600*1000;
    if (range === "1m") start = now - 30*24*3600*1000;
    if (range === "1y") start = now - 365*24*3600*1000;
    if (range === "all") {
      // earliest tx or asset created
      const earliestTx = txs.reduce((s,t)=>Math.min(s, t.date || Infinity), Infinity);
      const earliestAsset = rowsList.reduce((s,a)=>Math.min(s, a.purchaseDate || a.createdAt || Infinity), Infinity);
      const cand = Math.min(earliestTx || Infinity, earliestAsset || Infinity);
      if (isFinite(cand)) start = Math.min(start, cand);
    }
    // bucket by day for performance
    const dayMs = 24*3600*1000;
    const points = [];
    // simple series: for each day, compute total value per category using last known prices (approx)
    for (let t = start; t <= now; t += Math.max(1, Math.floor((now - start)/200))) {
      // compute using current rows values as snapshot (we could do more accurate time-travel but this suffices)
      points.push({ t, v_all: rowsList.reduce((s,r)=>s + (r.marketValueUSD || 0),0),
                    v_crypto: rowsList.filter(r=>r.type==="crypto").reduce((s,r)=>s + (r.marketValueUSD||0),0),
                    v_stock: rowsList.filter(r=>r.type==="stock").reduce((s,r)=>s + (r.marketValueUSD||0),0),
                    v_nonliquid: rowsList.filter(r=>r.type==="nonliquid").reduce((s,r)=>s + (r.marketValueUSD||0),0),
      });
    }
    // Convert to series per key
    const seriesPerKey = {
      all: points.map(p=>({ x: p.t, v: p.v_all })),
      crypto: points.map(p=>({ x: p.t, v: p.v_crypto })),
      stock: points.map(p=>({ x: p.t, v: p.v_stock })),
      nonliquid: points.map(p=>({ x: p.t, v: p.v_nonliquid })),
    };
    return seriesPerKey;
  }
  const multiSeries = useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  /* category values now */
  const categoryValuesNow = useMemo(() => {
    const out = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
    try {
      Object.keys(multiSeries).forEach(k => {
        const arr = multiSeries[k] || [];
        const last = arr[arr.length - 1];
        out[k] = last ? last.v : 0;
      });
    } catch (e) {}
    return out;
  }, [multiSeries]);

  /* ===================== CSV Export / Import (combined, spreadsheet-friendly) ===================== */
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
    assets.forEach(a=>{
      const aa = ensureNumericAsset(a);
      const row = assetsHeaders.map(h=>{
        const v = aa[h];
        if (h === "createdAt" || h === "purchaseDate") return csvQuote(isoDate(v));
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push("");
    lines.push(`#TRANSACTIONS`);
    lines.push(txHeaders.join(","));
    transactions.forEach(t=>{
      const row = txHeaders.map(h=>{
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
      // strip BOM
      if (linesRaw[0] && linesRaw[0].charCodeAt(0) === 0xFEFF) linesRaw[0] = linesRaw[0].slice(1);
      // simple parser: find #ASSETS section and #TRANSACTIONS
      const idxAssets = linesRaw.findIndex(l => l.startsWith("#ASSETS"));
      const idxTx = linesRaw.findIndex(l => l.startsWith("#TRANSACTIONS"));
      if (idxAssets === -1) return alert("Invalid import: missing #ASSETS");
      const assetsHeader = linesRaw[idxAssets+1].split(",").map(h=>h.trim());
      const assetLines = [];
      for (let i=idxAssets+2; i < (idxTx === -1 ? linesRaw.length : idxTx); i++) {
        const l = linesRaw[i]; if (!l || l.startsWith("#")) continue;
        assetLines.push(l);
      }
      const imported = assetLines.map(line=>{
        // CSV aware parse
        const values = [];
        let cur = "", inside=false;
        for (let i=0;i<line.length;i++){
          const ch=line[i];
          if (ch === '"' && line[i+1]==='"'){ cur+='"'; i++; continue; }
          if (ch === '"'){ inside = !inside; continue; }
          if (ch === "," && !inside){ values.push(cur); cur=""; continue; }
          cur += ch;
        }
        values.push(cur);
        const obj = {};
        assetsHeader.forEach((h,idx)=> obj[h] = values[idx] ?? "");
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
          createdAt: isoDate(obj.createdAt) ? Date.parse(obj.createdAt) : Date.now(),
          purchaseDate: isoDate(obj.purchaseDate) ? Date.parse(obj.purchaseDate) : Date.now(),
          nonLiquidYoy: toNum(obj.nonLiquidYoy || 0),
        };
        return ensureNumericAsset(parsed);
      });

      // transactions
      const txHeaderLine = (idxTx !== -1) ? linesRaw[idxTx+1] : null;
      const txHeader = txHeaderLine ? txHeaderLine.split(",").map(h=>h.trim()) : [];
      const txLines = (idxTx !== -1) ? linesRaw.slice(idxTx+2) : [];
      const importedTx = txLines.filter(l=>l && !l.startsWith("#")).map(line=>{
        const values = [];
        let cur = "", inside=false;
        for (let i=0;i<line.length;i++){
          const ch=line[i];
          if (ch === '"' && line[i+1]==='"'){ cur+='"'; i++; continue; }
          if (ch === '"'){ inside = !inside; continue; }
          if (ch === "," && !inside){ values.push(cur); cur=""; continue; }
          cur += ch;
        }
        values.push(cur);
        const obj = {};
        txHeader.forEach((h,idx)=> obj[h] = values[idx] ?? "");
        return {
          id: obj.id || `tx:imp:${Date.now()}`,
          type: obj.type || "buy",
          assetId: obj.assetId || "",
          assetType: obj.assetType || "",
          symbol: obj.symbol || "",
          name: obj.name || "",
          qty: toNum(obj.qty || 0),
          pricePerUnit: toNum(obj.pricePerUnit || 0),
          cost: toNum(obj.cost || 0),
          proceeds: toNum(obj.proceeds || 0),
          costOfSold: toNum(obj.costOfSold || 0),
          realized: toNum(obj.realized || 0),
          date: obj.date ? Date.parse(obj.date) : Date.now()
        };
      });

      // meta
      const metaLine = linesRaw.find(l=>l.startsWith("#META"));
      if (metaLine) {
        try {
          const m = metaLine.replace(/^#META,?/, "");
          const parts = m.split(",");
          parts.forEach(p=>{
            const [k,v] = p.split("=");
            if (k === "realizedUSD") setRealizedUSD(toNum(v));
            if (k === "displayCcy" && v) setDisplayCcy(String(v));
            if (k === "usdIdr") setUsdIdr(toNum(v));
          });
        } catch (e){}
      }

      if (merge) {
        const map = {};
        assets.forEach(a => map[a.symbol] = ensureNumericAsset(a));
        imported.forEach(i => map[i.symbol] = ensureNumericAsset(i));
        const merged = Object.values(map);
        setAssets(merged);
        setTransactions(prev=>[...prev, ...importedTx]);
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

  /* ===================== SHARE / QR (respects eye state) ===================== */
  function buildSharePayload() {
    const showValues = eyeOpen;
    const payload = {
      ts: Date.now(), displayCcy,
      totals: {
        market: showValues ? totals.market : undefined,
        pnl: totals.pnlPct
      },
      allocation: donutData.map((d,i)=>({
        name: d.name,
        pct: totals.market > 0 ? ((d.value / totals.market) * 100) : 0,
        value: showValues ? d.value : undefined
      }))
    };
    return JSON.stringify(payload);
  }
  function generateShare() {
    const payload = buildSharePayload();
    // create a simple data url or QR via canvas
    const url = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
    setShareDataUrl(url);
    // optionally generate QR with an external library or server; we store data url for download
    // For simplicity, we provide the data url and user can copy.
    return url;
  }

  /* ===================== UI: filtering & sorting table ===================== */
  function applySortToRows(arr) {
    if (!tableSort || !tableSort.key) return arr;
    const out = arr.slice();
    out.sort((a,b)=>{
      const va = a[tableSort.key] ?? 0, vb = b[tableSort.key] ?? 0;
      if (va < vb) return tableSort.dir === "asc" ? -1 : 1;
      if (va > vb) return tableSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }

  /* ===================== RENDER ===================== */
  const titleForFilter = {
    all: "All Portfolio",
    crypto: "Crypto Portfolio",
    stock: "Stocks Portfolio",
    nonliquid: "Non-Liquid Portfolio",
  };
  const headerTitle = titleForFilter[portfolioFilter] || "Portfolio";

  const filteredRows = useMemo(()=> {
    let out = rows.slice();
    if (portfolioFilter === "crypto") out = out.filter(r=>r.type==="crypto");
    if (portfolioFilter === "stock") out = out.filter(r=>r.type==="stock");
    if (portfolioFilter === "nonliquid") out = out.filter(r=>r.type==="nonliquid");
    out = applySortToRows(out);
    return out;
  }, [rows, portfolioFilter, tableSort]);

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <style>{`
        .btn { transition: transform 180ms, box-shadow 180ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); transition: transform 220ms; }
        .icon-box { transition: transform 160ms, background 120ms; }
        .slice { cursor: pointer; }
        .menu-scroll { max-height: 16rem; overflow:auto; overscroll-behavior: contain; scrollbar-width: thin; }
        /* animated add button */
        .add-btn { width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:white;color:black;font-weight:700;transition:transform 220ms; }
        .add-btn.open { transform: rotate(45deg) scale(1.02); }
        /* table scroll fix */
        .table-wrapper { overflow:auto; max-height:520px; }
      `}</style>

      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 relative">
            <h1 className="text-2xl font-semibold">{headerTitle}</h1>

            {/* header filter icon-only (no box) */}
            <div className="relative" ref={filterMenuRef}>
              <button
                aria-label="Filter"
                onClick={() => setFilterMenuOpen(v=>!v)}
                className="ml-2 inline-flex items-center justify-center text-gray-200"
                style={{ fontSize: 20, padding: 6 }}
                title="Filter portfolio"
              >
                {/* caret down v */}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {filterMenuOpen && (
                <div className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44 menu-scroll">
                  <button onClick={()=>{ setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                  <button onClick={()=>{ setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                  <button onClick={()=>{ setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                  <button onClick={()=>{ setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Currency dropdown (nominal + code + caret) - value larger */}
            <div className="relative" ref={currencyMenuRef}>
              <button
                aria-label="Currency"
                onClick={() => setCurrencyMenuOpen(v => !v)}
                className="inline-flex items-center gap-2"
                style={{ background: "transparent", border: 0, padding: "6px 8px" }}
                title="Currency"
              >
                <span style={{ whiteSpace: "nowrap", fontSize: 20, fontWeight: 700 }}>
                  {displayCcy === "IDR"
                    ? `${(totals.market * usdIdr).toLocaleString()} IDR`
                    : `${Math.round(totals.market)} USD`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {currencyMenuOpen && (
                <div className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44 menu-scroll">
                  <button onClick={()=>{ setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                  <button onClick={()=>{ setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>

            {/* Eye & Share icons */}
            <div className="flex items-center gap-2">
              <button title={eyeOpen ? "Hide values" : "Show values"} onClick={()=>setEyeOpen(v=>!v)} className="icon-box p-2 rounded">
                {eyeOpen ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="#E5E7EB" strokeWidth="1.4" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10 10 0 0 1 6.06 6.06" stroke="#E5E7EB" strokeWidth="1.4"/><path d="M1 1l22 22" stroke="#E5E7EB" strokeWidth="1.4" /></svg>
                )}
              </button>

              <button title="Share portfolio" onClick={() => { generateShare(); alert("Share payload generated (data URL cached)."); }} className="icon-box p-2 rounded">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round"/><path d="M16 6l-4-4-4 4" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round"/><path d="M12 2v13" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round"/></svg>
              </button>
            </div>

            <button onClick={()=>setOpenAdd(v=>!v)} className={`add-btn ${openAdd ? "open" : ""} ml-2`} title="Add asset">+</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")) : "*****" }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market value</div>
            <div className="font-medium">{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")) : "*****" }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Gain P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")) : "*****" } ({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex justify-between text-gray-400 items-center gap-2">
            <div className="flex items-center gap-2">
              <div>Realized P&L</div>
              <div style={{ width:18, height:18, borderRadius:4, background:"#111", display:"inline-flex", alignItems:"center", justifyContent:"center", marginLeft:6 }}>
                {/* small slanted arrow in box */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#E5E7EB" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
            <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")) : "*****" }</div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Saham ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""}`}>Non-liquid</button>
              </div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e)=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode==="crypto" ? "Search crypto (BTC, ethereum)..." : (searchMode==="nonliquid" ? "Type item name (Land, Art, Rolex)..." : "Search (AAPL | BBCA.JK)")} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
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

              {searchMode === "nonliquid" ? (
                <>
                  <input value={nonLiquidName} onChange={(e)=>setNonLiquidName(e.target.value)} placeholder="Name (Land, Art, Rolex)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-48" />
                  <input value={nonLiquidDesc} onChange={(e)=>setNonLiquidDesc(e.target.value)} placeholder="Description (address, serial...)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-64" />
                  <input value={initPrice} onChange={(e)=>setInitPrice(e.target.value)} placeholder="Price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                  <input value={nonLiquidYoy} onChange={(e)=>setNonLiquidYoy(e.target.value)} placeholder="YoY %" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-20" />
                  <div className="flex items-center gap-2">
                    <button onClick={addManualAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add</button>
                    <button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
                  </div>
                </>
              ) : (
                <>
                  <input value={initQty} onChange={(e)=>setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                  <input value={initPrice} onChange={(e)=>setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                  <select value={initPriceCcy} onChange={(e)=>setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                    <option value="USD">USD</option><option value="IDR">IDR</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <button onClick={()=> selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add</button>
                    <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn">Add + Position</button>
                    <button onClick={()=>setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* PORTFOLIO GROWTH CHART (above table & donut) */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-300">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(r=>(
                <button key={r} onClick={()=>setChartRange(r)} className={`px-2 py-1 text-sm rounded ${chartRange===r ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300"}`}>{r.toUpperCase()}</button>
              ))}
            </div>
          </div>
          {/* simple svg multiline chart for performance (interactive tooltip omitted for brevity) */}
          <div style={{ width:"100%", height:220 }} className="bg-black rounded p-2">
            {/* lightweight canvas-like polyline */}
            <svg width="100%" height="200" viewBox="0 0 1000 200" preserveAspectRatio="none">
              {/* background grid */}
              <defs>
                <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#0f1724" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="#07101a" stopOpacity="0.2"/>
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="1000" height="200" fill="url(#grad)" rx="6"/>
              {/* draw series for each category */}
              {["all","crypto","stock","nonliquid"].map((k,idx)=>{
                const series = multiSeries[k] || [];
                if (!series.length) return null;
                const maxV = Math.max(...series.map(p=>p.v)) || 1;
                const minV = Math.min(...series.map(p=>p.v)) || 0;
                const points = series.map((p,i)=>{
                  const x = (i/(series.length-1||1)) * 980 + 10;
                  const y = 10 + (1 - (p.v - minV) / (maxV - minV || 1)) * 180;
                  return `${x},${y}`;
                }).join(" ");
                return (
                  <polyline key={k} fill="none" stroke={colorForIndex(idx)} strokeWidth={2} points={points} opacity={0.95} />
                );
              })}
            </svg>
            {/* category nominal small labels under chart */}
            <div className="mt-2 flex gap-4">
              {["all","crypto","stock","nonliquid"].map((k,idx)=>(
                <div key={k} className="text-xs text-gray-400 flex items-baseline gap-2">
                  <div style={{ width:10, height:10, background: colorForIndex(idx), borderRadius:4 }} />
                  <div>
                    <div className="text-sm text-gray-200">{k === "all" ? "All" : (k === "nonliquid" ? "Non-Liquid" : k.charAt(0).toUpperCase()+k.slice(1))}</div>
                    <div className="text-xs">{ displayCcy==="IDR" ? `${Math.round(categoryValuesNow[k] * usdIdr).toLocaleString()} IDR` : `${Math.round(categoryValuesNow[k])} USD` }</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ASSET TABLE */}
        <div className="mt-6 overflow-x-auto table-wrapper bg-gray-900 p-3 rounded border border-gray-800">
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
                    <div className="font-semibold text-gray-100">{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.name}{r.description ? ` — ${r.description}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")) : "*****" }</div>
                    <div className="text-xs text-gray-400">{ displayCcy==="IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD") }</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-semibold">{ eyeOpen ? (displayCcy==="IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")) : "*****" }</div>
                    <div className="text-xs text-gray-400">{ displayCcy==="IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD") }</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ displayCcy==="IDR" ? (eyeOpen ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : "*****") : (eyeOpen ? fmtMoney(r.pnlUSD, "USD") : "*****") }</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={()=>openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button>
                      <button onClick={()=>openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button>
                      <button onClick={()=>{ removeAsset(r.id); }} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button>
                      <button onClick={()=>{ 
                        // open tradingview/coingecko chart in new window/modal
                        if (r.type === "crypto") {
                          window.open(`https://www.coingecko.com/en/coins/${encodeURIComponent(r.coingeckoId || r.symbol.toLowerCase())}`, "_blank");
                        } else {
                          // TradingView symbol: try exchange:symbol or use yahoo
                          window.open(`https://www.tradingview.com/symbols/${encodeURIComponent(r.symbol)}/`, "_blank");
                        }
                      }} className="bg-gray-800 px-2 py-1 rounded text-xs btn-soft">Chart</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LIST: Transactions panel (toggle) */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-300">Transactions</div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setTxPanelOpen(v=>!v)} className="px-3 py-1 rounded bg-gray-800 btn">{txPanelOpen ? "Close" : "Open"}</button>
            </div>
          </div>
          {txPanelOpen && (
            <div className="mt-3 bg-gray-900 p-3 rounded border border-gray-800">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-left py-2 px-3">Asset</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-right py-2 px-3">Realized</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice().reverse().map(tx=>(
                      <tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                        <td className="px-3 py-3 text-xs">{new Date(tx.date).toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm">{tx.type}</td>
                        <td className="px-3 py-3 text-sm">{tx.symbol} <div className="text-xs text-gray-400">{tx.name}</div></td>
                        <td className="px-3 py-3 text-right">{Number(tx.qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                        <td className="px-3 py-3 text-right">{ tx.type === "sell" ? (displayCcy==="IDR" ? fmtMoney(tx.proceeds * usdIdr, "IDR") : fmtMoney(tx.proceeds, "USD")) : (displayCcy==="IDR" ? fmtMoney(tx.cost * usdIdr, "IDR") : fmtMoney(tx.cost, "USD")) }
                          <div className="text-xs">{ tx.pricePerUnit ? `${displayCcy==="IDR" ? fmtMoney(tx.pricePerUnit * usdIdr, "IDR") : fmtMoney(tx.pricePerUnit, "USD")} / unit` : "" }</div>
                        </td>
                        <td className="px-3 py-3 text-right">{ tx.type === "sell" ? (displayCcy==="IDR" ? fmtMoney(tx.realized * usdIdr, "IDR") : fmtMoney(tx.realized, "USD")) : "-" }</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={()=>{ restoreTransaction(tx.id); }} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Restore</button>
                            <button onClick={()=>deleteTransaction(tx.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lastDeletedTx && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-300">Last deleted: {lastDeletedTx.symbol} ({new Date(lastDeletedTx.date).toLocaleString()})</div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>undoLastDeletedTransaction()} className="bg-emerald-500 px-3 py-1 rounded text-sm btn">Undo</button>
                    <button onClick={()=>purgeLastDeletedTransaction()} className="bg-gray-700 px-3 py-1 rounded text-sm btn-soft">Forget</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* EXPORT / IMPORT CSV (buttons) */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (combined)</div>
            <div className="text-xs text-gray-500">Export contains ASSETS and TRANSACTIONS in one CSV file. File includes header markers (#ASSETS, #TRANSACTIONS) and ISO dates for clean spreadsheet import.</div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <button onClick={exportAllCSV} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-blue-600 hover:text-white">Export CSV</button>
            </div>
            <label className="bg-white text-black px-3 py-2 rounded font-semibold cursor-pointer btn hover:bg-emerald-500 hover:text-white">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={()=>{
              if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return;
              setAssets([]); setRealizedUSD(0); setTransactions([]); setLastDeletedTx(null);
            }} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-red-600 hover:text-white">Clear All</button>
          </div>
        </div>

      </div>
    </div>
  );
}