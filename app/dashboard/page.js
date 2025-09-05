"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Portfolio Dashboard — full single-file React client component
 *
 * Features:
 * - Search crypto (CoinGecko) & stocks (Yahoo search)
 * - Add asset (crypto / IDX / US)
 * - Live polling for prices (CoinGecko + Yahoo)
 * - Display currency toggle (USD / IDR) with FX from CoinGecko tether->idr
 * - Donut allocation (bright colors)
 * - Buy & Sell: modal form accepts qty & price (per unit) -> math: weighted avg & realized P/L
 * - Delete with confirmation
 * - Persist assets & realized P/L to localStorage
 * - No spinner / no green dot — UI minimal and clean
 *
 * Paste into e.g. app/dashboard/page.jsx or components/PortfolioDashboard.jsx
 */

/* ===================== CONFIG/ENDPOINTS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) =>
  `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) =>
  `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
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

/* Guess if yahoo symbol price is IDR/ID exchange (very simple heuristic) */
function guessQuoteCurrency(symbol, yahooCurrency) {
  if (yahooCurrency) return yahooCurrency;
  if (!symbol) return "USD";
  if (symbol.includes(".JK") || symbol.startsWith("IDX:") || symbol.includes("IDR"))
    return "IDR";
  return "USD";
}

/* ===================== DONUT SVG ===================== */
function Donut({ data = [], size = 180, inner = 60 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 6;
  let start = -90;
  const colors = [
    "#FF6B6B",
    "#FFD93D",
    "#6BCB77",
    "#4D96FF",
    "#FF9CEE",
    "#B28DFF",
    "#FFB26B",
    "#6BFFA0",
    "#FF6BE5",
    "#00C49F",
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
        const x1 = cx + r * Math.cos(sRad),
          y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad),
          y2 = cy + r * Math.sin(eRad);
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

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- persistent state ---------- */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("pf_assets_v2") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("pf_realized_v2") || "0");
    } catch {
      return 0;
    }
  });

  /* ---------- UI & FX ---------- */
  const [displayCcy, setDisplayCcy] = useState("USD"); // default USD, can be toggled to IDR
  const [usdIdr, setUsdIdr] = useState(16000); // FX rate (tether->idr)
  const [fxLoading, setFxLoading] = useState(true);

  /* ---------- search/add ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | id | us
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState(""); // input price (per unit) when adding initial position
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  /* ---------- live quotes ---------- */
  const [yahooQuotes, setYahooQuotes] = useState({}); // symbol -> quote obj
  const [cryptoPrices, setCryptoPrices] = useState({}); // id -> { usd }
  const [lastTick, setLastTick] = useState(null);

  /* ---------- trade modal state ---------- */
  const [tradeModal, setTradeModal] = useState({
    open: false,
    mode: null, // 'buy' | 'sell'
    assetId: null, // internal id (we use asset.id)
    defaultPrice: null,
  });

  /* ---------- local helpers: persist ---------- */
  useEffect(() => {
    try {
      localStorage.setItem("pf_assets_v2", JSON.stringify(assets));
    } catch {}
  }, [assets]);
  useEffect(() => {
    try {
      localStorage.setItem("pf_realized_v2", String(realizedUSD));
    } catch {}
  }, [realizedUSD]);

  /* ===================== SEARCH LOGIC ===================== */
  // Debounce search fairly simply
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1) {
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
          const coins = (j.coins || []).slice(0, 20).map((c) => ({
            id: c.id,
            symbol: (c.symbol || "").toUpperCase(),
            display: c.name,
            source: "coingecko",
            type: "crypto",
          }));
          setSuggestions(coins);
          return;
        } else {
          // yahoo search (stocks)
          const res = await fetch(YAHOO_SEARCH(q));
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          const list = (j.quotes || []).slice(0, 30).map((it) => ({
            symbol: it.symbol,
            display: it.shortname || it.longname || it.symbol,
            exchange: it.exchange,
            currency: it.currency,
            source: "yahoo",
            type: "stock",
          }));
          if (searchMode === "id") {
            const filtered = list.filter((x) => x.symbol?.toUpperCase().includes(".JK") || String(x.exchange || "").toUpperCase().includes("JAKARTA") || String(x.exchange || "").toUpperCase().includes("IDX")).slice(0, 20);
            setSuggestions(filtered);
          } else {
            // us/global => exclude .JK for clarity
            const filtered = list.filter((x) => !x.symbol?.endsWith(".JK")).slice(0, 20);
            setSuggestions(filtered);
          }
        }
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* ===================== POLLING PRICES ===================== */
  // CoinGecko for cryptos
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assets.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) return;
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setCryptoPrices(prev => ({ ...prev, ...j }));
        // reflect into assets
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = j[a.coingeckoId].usd;
            return { ...a, lastPriceUSD: last, marketValueUSD: last * (a.shares || 0) };
          }
          return a;
        }));
        setLastTick(Date.now());
      } catch (e) {
        // ignore
      }
    }
    pollCg();
    const intv = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(intv); };
  }, [assets]);

  // Yahoo for stocks (batch)
  useEffect(() => {
    let mounted = true;
    async function pollYf() {
      try {
        const symbols = Array.from(new Set(assets.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 50);
        if (symbols.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(symbols));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const map = {};
        if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
          j.quoteResponse.result.forEach(q => { if (q && q.symbol) map[q.symbol] = q; });
        }
        setYahooQuotes(prev => ({ ...prev, ...map }));
        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const q = map[a.symbol];
            const price = q.regularMarketPrice ?? a.lastPriceUSD ?? 0;
            return { ...a, lastPriceUSD: price, marketValueUSD: price * (a.shares || 0) };
          }
          return a;
        }));
        setLastTick(Date.now());
      } catch (e) {
        // ignore
      }
    }
    pollYf();
    const intv = setInterval(pollYf, 5000);
    return () => { mounted = false; clearInterval(intv); };
  }, [assets]);

  /* FX: tether -> IDR */
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
        // ignore
      } finally {
        if (mounted) setFxLoading(false);
      }
    }
    fetchFx();
    const intv = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(intv); };
  }, []);

  /* ===================== ADD ASSET ===================== */
  // data model for an asset:
  // {
  //   id: string (internal),
  //   type: "crypto"|"stock",
  //   coingeckoId?: string,
  //   symbol: string,
  //   name: string,
  //   shares: number,
  //   avgPrice: number (USD per unit),
  //   investedUSD: number,
  //   lastPriceUSD: number,
  //   marketValueUSD: number
  // }
  function addAssetFromSuggestion(s) {
    // create internal id to avoid collisions
    const internalId = `${s.source || s.type}:${s.symbol || s.id}:${Date.now()}`;
    const asset = {
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id || s.coingeckoId : undefined,
      symbol: s.symbol || s.id,
      name: s.display || s.name || s.symbol,
      shares: 0,
      avgPrice: 0,
      investedUSD: 0,
      lastPriceUSD: 0,
      marketValueUSD: 0,
      createdAt: Date.now(),
    };
    setAssets(prev => [...prev, asset]);
    setOpenAdd(false);
    setQuery("");
    setSuggestions([]);
    setSelectedSuggestion(null);
  }

  /* allow manual add when user typed symbol & provided qty+price */
  async function addManualAsset() {
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or select suggestion"); return; }
    // attempt to resolve via yahoo if not crypto mode
    let newAsset = null;
    if (searchMode === "crypto") {
      // assume typed is coingecko id or symbol; we will set coingeckoId to typed (best-effort)
      newAsset = {
        id: `manual:cg:${typed}:${Date.now()}`,
        type: "crypto",
        coingeckoId: typed.toLowerCase(),
        symbol: typed.toUpperCase(),
        name: typed,
        shares: 0,
        avgPrice: 0,
        investedUSD: 0,
        lastPriceUSD: 0,
        marketValueUSD: 0,
      };
    } else {
      // assume typed is yahoo symbol
      newAsset = {
        id: `manual:yh:${typed}:${Date.now()}`,
        type: "stock",
        symbol: typed.toUpperCase(),
        name: typed.toUpperCase(),
        shares: 0,
        avgPrice: 0,
        investedUSD: 0,
        lastPriceUSD: 0,
        marketValueUSD: 0,
      };
    }
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false);
    setQuery("");
  }

  /* When user clicks "Add with initial position" - will use initQty and initPrice */
  async function addAssetWithInitial() {
    // either selectedSuggestion or manual typed resolves to an asset
    let picked = selectedSuggestion;
    if (!picked) {
      const typed = query.split("—")[0].trim();
      if (!typed) { alert("Select suggestion or type symbol"); return; }
      // craft suggestion-like object
      if (searchMode === "crypto") {
        picked = { source: "coingecko", id: typed.toLowerCase(), symbol: typed.toUpperCase(), display: typed };
      } else {
        picked = { source: "yahoo", symbol: typed.toUpperCase(), display: typed.toUpperCase() };
      }
    }

    const qty = toNum(initQty);
    const priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }

    // build asset
    const internalId = `${picked.source || picked.type}:${picked.symbol || picked.id}:${Date.now()}`;
    const asset = {
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.source === "coingecko" ? (picked.id || picked.coingeckoId) : undefined,
      symbol: (picked.symbol || picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty,
      avgPrice: initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput,
      investedUSD: (initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput) * qty,
      lastPriceUSD: initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput,
      marketValueUSD: ((initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput) * qty),
      createdAt: Date.now(),
    };

    setAssets(prev => [...prev, asset]);
    setOpenAdd(false);
    setQuery("");
    setInitQty("");
    setInitPrice("");
    setInitPriceCcy("USD");
    setSelectedSuggestion(null);
  }

  /* ===================== BUY / SELL (modal) ===================== */
  // open modal for buy/sell; default price is current market price if available
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() {
    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null });
  }

  // perform buy: qty units at price per unit (USD)
  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId;
    if (!id) return;
    const q = toNum(qty);
    const p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }

    setAssets(prev => prev.map(a => {
      if (a.id !== id) return a;
      const oldShares = toNum(a.shares || 0);
      const oldInvested = toNum(a.investedUSD || 0);
      const addCost = q * p; // USD
      const newShares = oldShares + q;
      const newInvested = oldInvested + addCost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      const lastPrice = p;
      return {
        ...a,
        shares: newShares,
        investedUSD: newInvested,
        avgPrice: newAvg,
        lastPriceUSD: lastPrice,
        marketValueUSD: newShares * lastPrice,
      };
    }));

    closeTradeModal();
  }

  // perform sell: qty units at price per unit (USD)
  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId;
    if (!id) return;
    const q = toNum(qty);
    const p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }

    const a = assets.find(x => x.id === id);
    if (!a) { alert("Asset not found"); return; }
    const oldShares = toNum(a.shares || 0);
    if (q > oldShares) { alert("Cannot sell more than you own"); return; }

    const avg = toNum(a.avgPrice || 0);
    const proceeds = q * p;
    const costOfSold = q * avg;
    const realized = proceeds - costOfSold; // USD realized
    setRealizedUSD(prev => prev + realized);

    const newShares = oldShares - q;
    const newInvested = a.investedUSD - costOfSold; // reduce invested by cost basis of sold shares
    const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
    const lastPrice = p;

    setAssets(prev => {
      if (newShares <= 0) {
        // remove asset entirely
        return prev.filter(x => x.id !== id);
      }
      return prev.map(x => x.id === id ? {
        ...x,
        shares: newShares,
        investedUSD: newInvested,
        avgPrice: newAvg,
        lastPriceUSD: lastPrice,
        marketValueUSD: newShares * lastPrice,
      } : x);
    });

    closeTradeModal();
  }

  /* ===================== EDIT / DELETE ===================== */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ===================== computed rows & totals ===================== */
  const rows = useMemo(() => {
    return assets.map(a => {
      // ensure lastPriceUSD fallback
      const last = a.lastPriceUSD || a.avgPrice || 0;
      const market = (a.shares || 0) * last;
      const invested = toNum(a.investedUSD || 0);
      const pnl = market - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      return {
        ...a,
        lastPriceUSD: last,
        marketValueUSD: market,
        investedUSD: invested,
        pnlUSD: pnl,
        pnlPct,
      };
    });
  }, [assets]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + (r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  /* ===================== small utilities for UI ===================== */
  function colorForIndex(i) {
    const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
    return palette[i % palette.length];
  }

  /* ===================== RENDER ===================== */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-400">
              Updated: {lastTick ? new Date(lastTick).toLocaleString() : "-"} • USD/IDR ≈ {fxLoading ? "..." : usdIdr?.toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">
              {displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr || 1), "IDR") : fmtMoney(totals.market, "USD")}
            </div>

            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
            </select>

            <button onClick={() => setOpenAdd(v => !v)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold">+</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.invested * (usdIdr || 1), "IDR") : fmtMoney(totals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr || 1), "IDR") : fmtMoney(totals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Unrealized P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * (usdIdr || 1), "IDR") : fmtMoney(totals.pnl, "USD")} ({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * (usdIdr || 1), "IDR") : fmtMoney(realizedUSD, "USD")}</div>
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
              </div>
              <div className="text-xs text-gray-400">Mode: <span className="font-medium text-gray-100">{searchMode.toUpperCase()}</span></div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                        <div>
                          <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                          <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : `Security • ${s.exchange || s.currency || ''}`}</div>
                        </div>
                        <div className="text-xs text-gray-400">{s.source === "coingecko" ? "CG" : "YH"}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Initial qty (optional)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Initial price (per unit)" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
              <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>

              <div className="flex items-center gap-2">
                <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add (no position)</button>
                <button onClick={addAssetWithInitial} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold">Add + Position</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Name</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Avg (per unit)</th>
                <th className="text-right py-2 px-3">Market <div className="text-xs text-gray-500">Last</div></th>
                <th className="text-right py-2 px-3">Market Value</th>
                <th className="text-right py-2 px-3">Unrealized P/L</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : rows.map((r, idx) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100">{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {displayCcy === "IDR" ? fmtMoney((r.avgPrice || 0) * (usdIdr || 1), "IDR") : fmtMoney(r.avgPrice || 0, "USD")}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {(r.lastPriceUSD && r.lastPriceUSD > 0) ? (displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * (usdIdr || 1), "IDR") : fmtMoney(r.lastPriceUSD, "USD")) : "-"}
                    <div className="text-xs text-gray-500">{r.type === "crypto" ? "Crypto" : "Security"}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr || 1), "IDR") : fmtMoney(r.marketValueUSD, "USD")}</td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * (usdIdr || 1), "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* DONUT + LEGEND */}
        {rows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-52 h-52 flex items-center justify-center">
              <Donut data={rows.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }))} size={200} inner={64} />
            </div>

            <div className="flex-1">
              {rows.map((r, i) => {
                const pct = totals.market > 0 ? (r.marketValueUSD / totals.market) * 100 : 0;
                return (
                  <div key={r.id} className="flex items-center gap-3 mb-2">
                    <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-sm" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-100">{r.symbol} <span className="text-xs text-gray-400">• {r.name}</span></div>
                      <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr || 1), "IDR") : fmtMoney(r.marketValueUSD, "USD")} • {pct.toFixed(1)}%</div>
                    </div>
                    <div className="text-sm text-gray-300">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr || 1), "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FOOTER SUMMARY */}
        <div className="mt-6 text-sm text-gray-300">
          <div>Total Invested: {displayCcy === "IDR" ? fmtMoney(totals.invested * (usdIdr || 1), "IDR") : fmtMoney(totals.invested, "USD")}</div>
          <div>Market Value: {displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr || 1), "IDR") : fmtMoney(totals.market, "USD")}</div>
          <div>Realized P/L: {displayCcy === "IDR" ? fmtMoney(realizedUSD * (usdIdr || 1), "IDR") : fmtMoney(realizedUSD, "USD")}</div>
        </div>

        {/* TRADE MODAL (BUY / SELL) */}
        {tradeModal.open && (
          <TradeModal
            mode={tradeModal.mode}
            asset={assets.find(a => a.id === tradeModal.assetId)}
            defaultPrice={tradeModal.defaultPrice}
            onClose={closeTradeModal}
            onBuy={(qty, price) => performBuy(qty, price)}
            onSell={(qty, price) => performSell(qty, price)}
            displayCcy={displayCcy}
            usdIdr={usdIdr}
          />
        )}

      </div>
    </div>
  );
}

/* ===================== TradeModal component ===================== */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, displayCcy, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice || "");
  useEffect(() => { setPrice(defaultPrice || ""); }, [defaultPrice]);

  if (!asset) return null;

  const title = mode === "buy" ? `Buy ${asset.symbol}` : `Sell ${asset.symbol}`;
  const actionLabel = mode === "buy" ? "Confirm Buy" : "Confirm Sell";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-md p-4 text-gray-100">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-gray-400">{asset.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-sm">Close</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Quantity (units)</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 1.5" className="w-full rounded bg-gray-800 px-3 py-2 text-sm mt-1" />
          </div>

          <div>
            <label className="text-xs text-gray-400">Price per unit ({displayCcy})</label>
            <div className="flex gap-2 mt-1">
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 105.50" className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm" />
              <div className="text-xs text-gray-400 px-2 py-2 self-end">
                {displayCcy === "IDR" ? fmtMoney((Number(price || 0) * (usdIdr || 1)), "IDR") : fmtMoney(Number(price || 0), "USD")}
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-300">
            <div>Current holdings: <span className="font-semibold">{Number(asset.shares || 0).toLocaleString()}</span></div>
            <div>Avg cost: <span className="font-semibold">{fmtMoney(asset.avgPrice || 0, "USD")}</span></div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="bg-gray-800 px-3 py-2 rounded">Cancel</button>
            <button onClick={() => {
              if (mode === "buy") onBuy(Number(qty), Number(price));
              else onSell(Number(qty), Number(price));
            }} className={`px-3 py-2 rounded font-semibold ${mode === "buy" ? "bg-emerald-500 text-black" : "bg-yellow-600 text-black"}`}>
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}