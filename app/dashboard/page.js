"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * PortfolioDashboard (single-file)
 *
 * Features implemented:
 * - Search: CoinGecko (crypto) + Yahoo Finance search (IDX & US/global stocks)
 * - Live price polling: CoinGecko for crypto, Yahoo for stocks
 * - USD/IDR exchange rate fetched from exchangerate.host (real-time on load, updates periodically)
 * - Add asset (with optional initial position: qty + price + currency)
 * - Buy / Sell modal forms: require qty and price (per unit). Math uses weighted-average + realized P/L
 * - Market/Last always shows a usable price (live price → fallback avg)
 * - Donut allocation (smaller size, bright colors)
 * - Clean UI: no spinner, no green dot/time, no awkward empty USD box
 * - LocalStorage persistence
 *
 * Usage:
 * - Copy-paste into a React/Next.js client component file (e.g. app/dashboard/page.jsx).
 * - Tailwind classes are used for quick styling (optional). If Tailwind isn't available, classes will be inert.
 *
 * Notes:
 * - If Yahoo endpoints are blocked by CORS on your host, use a server proxy or Next.js API route to relay requests.
 * - The exchange rate endpoint used: https://api.exchangerate.host/latest?base=USD&symbols=IDR
 */

/* ---------------- CONFIG / ENDPOINTS ---------------- */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const FX_USD_IDR = `https://api.exchangerate.host/latest?base=USD&symbols=IDR`;

/* ---------------- HELPERS ---------------- */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function normalizeIdr(v) {
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* simple color palette (bright) */
const PALETTE = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#00C49F","#FF6BE5","#FF7A59"];

/* ---------------- Donut (smaller) ---------------- */
function Donut({ data = [], size = 120, inner = 44 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let start = -90;
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
        return <path key={i} d={path} fill={PALETTE[i % PALETTE.length]} stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ---------------- Main Component ---------------- */
export default function PortfolioDashboard() {
  /* ---------- persistence ---------- */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("pf_assets_v3") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("pf_realized_v3") || "0");
    } catch {
      return 0;
    }
  });

  /* ---------- FX / UI ---------- */
  const [usdIdr, setUsdIdr] = useState(null); // fetched
  const [displayCcy, setDisplayCcy] = useState("USD"); // USD or IDR

  /* ---------- search/add ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // 'crypto' | 'id' | 'us'
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  /* ---------- live quotes ---------- */
  const [cryptoPrices, setCryptoPrices] = useState({}); // id -> { usd }
  const [yahooQuotes, setYahooQuotes] = useState({}); // symbol -> quote
  const [lastTick, setLastTick] = useState(null);

  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPriceUSD: 0 });

  /* ---------- refs ---------- */
  const searchTimer = useRef(null);
  const pollCgRef = useRef(null);
  const pollYfRef = useRef(null);
  const fxRef = useRef(null);

  /* persist effects */
  useEffect(() => { try { localStorage.setItem("pf_assets_v3", JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("pf_realized_v3", String(realizedUSD)); } catch {} }, [realizedUSD]);

  /* ---------------- fetch FX (USD->IDR) ---------------- */
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        const res = await fetch(FX_USD_IDR);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const v = j?.rates?.IDR ?? j?.rates?.IDR;
        const n = normalizeIdr(v);
        if (n) setUsdIdr(n);
      } catch (e) {
        // silent
      }
    }
    fetchFx();
    fxRef.current = setInterval(fetchFx, 60_000); // update every minute
    return () => { mounted = false; if (fxRef.current) clearInterval(fxRef.current); };
  }, []);

  /* ---------------- SEARCH (debounced) ---------------- */
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query || query.trim().length < 1) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          const coins = (j.coins || []).slice(0, 20).map(c => ({ source: "coingecko", id: c.id, symbol: (c.symbol||"").toUpperCase(), display: c.name }));
          setSuggestions(coins);
          return;
        }
        // stocks -> Yahoo search
        const res = await fetch(YAHOO_SEARCH(q));
        if (!res.ok) { setSuggestions([]); return; }
        const j = await res.json();
        const list = (j.quotes || []).slice(0, 30).map(it => ({
          source: "yahoo",
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          exchange: it.exchange,
          currency: it.currency,
        }));
        if (searchMode === "id") {
          const filtered = list.filter(x => x.symbol?.toUpperCase().includes(".JK") || String(x.exchange||"").toUpperCase().includes("JAKARTA") || String(x.exchange||"").toUpperCase().includes("IDX")).slice(0, 20);
          setSuggestions(filtered);
        } else {
          const filtered = list.filter(x => !x.symbol?.endsWith(".JK")).slice(0, 20);
          setSuggestions(filtered);
        }
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, searchMode]);

  /* ---------------- POLLING PRICES ---------------- */
  // coin prices
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
    pollCgRef.current = setInterval(pollCg, 6000);
    return () => { mounted = false; if (pollCgRef.current) clearInterval(pollCgRef.current); };
  }, [assets]);

  // yahoo prices for stocks
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
    pollYfRef.current = setInterval(pollYf, 5000);
    return () => { mounted = false; if (pollYfRef.current) clearInterval(pollYfRef.current); };
  }, [assets]);

  /* ---------------- ADD ASSET ---------------- */
  function addAssetFromSuggestion(s) {
    // avoid duplicates by symbol+type
    const symbolKey = (s.symbol || s.id || "").toString().toUpperCase();
    const already = assets.find(a => a.symbol === symbolKey && a.type === (s.source === "coingecko" ? "crypto" : "stock"));
    if (already) {
      setOpenAdd(false);
      setQuery("");
      setSuggestions([]);
      setSelectedSuggestion(null);
      return;
    }
    const internalId = `${s.source || s.type}:${symbolKey}:${Date.now()}`;
    const asset = {
      id: internalId,
      type: s.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: s.source === "coingecko" ? s.id : undefined,
      symbol: symbolKey,
      name: s.display || s.name || symbolKey,
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

  async function addManualAsset() {
    const typed = query.split("—")[0].trim();
    if (!typed) { alert("Type symbol or choose suggestion"); return; }
    const symbolKey = typed.toUpperCase();
    const existing = assets.find(a => a.symbol === symbolKey);
    if (existing) { setOpenAdd(false); return; }
    const internalId = `manual:${symbolKey}:${Date.now()}`;
    const asset = {
      id: internalId,
      type: searchMode === "crypto" ? "crypto" : "stock",
      coingeckoId: searchMode === "crypto" ? typed.toLowerCase() : undefined,
      symbol: symbolKey,
      name: symbolKey,
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

    const internalId = `${picked.source || picked.type}:${(picked.symbol||picked.id).toString().toUpperCase()}:${Date.now()}`;
    const priceUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const asset = {
      id: internalId,
      type: picked.source === "coingecko" ? "crypto" : "stock",
      coingeckoId: picked.source === "coingecko" ? (picked.id || picked.coingeckoId) : undefined,
      symbol: (picked.symbol || picked.id).toString().toUpperCase(),
      name: picked.display || picked.name || picked.symbol || picked.id,
      shares: qty,
      avgPrice: priceUSD,
      investedUSD: priceUSD * qty,
      lastPriceUSD: priceUSD,
      marketValueUSD: priceUSD * qty,
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

  /* ---------------- TRADE MODAL (Buy/Sell) ---------------- */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPriceUSD: defaultPrice });
  }
  function closeTradeModal() {
    setTradeModal({ open: false, mode: null, assetId: null, defaultPriceUSD: 0 });
  }

  function performBuy(assetId, qty, pricePerUnit) {
    const q = toNum(qty);
    const p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty and price must be > 0"); return; }
    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      const oldShares = toNum(a.shares || 0);
      const oldInvested = toNum(a.investedUSD || 0);
      const addCost = q * p;
      const newShares = oldShares + q;
      const newInvested = oldInvested + addCost;
      const newAvg = newShares > 0 ? newInvested / newShares : 0;
      return {
        ...a,
        shares: newShares,
        investedUSD: newInvested,
        avgPrice: newAvg,
        lastPriceUSD: p,
        marketValueUSD: newShares * p,
      };
    }));
    closeTradeModal();
  }

  function performSell(assetId, qty, pricePerUnit) {
    const q = toNum(qty);
    const p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty and price must be > 0"); return; }
    const asset = assets.find(a => a.id === assetId);
    if (!asset) { alert("Asset not found"); return; }
    const oldShares = toNum(asset.shares || 0);
    if (q > oldShares) { alert("Sell qty cannot exceed holdings"); return; }
    const avg = toNum(asset.avgPrice || 0);
    const proceeds = q * p;
    const costBasis = q * avg;
    const realized = proceeds - costBasis;
    setRealizedUSD(prev => prev + realized);

    const newShares = oldShares - q;
    const newInvested = asset.investedUSD - costBasis;
    const newAvg = newShares > 0 ? newInvested / newShares : 0;

    setAssets(prev => {
      if (newShares <= 0) {
        return prev.filter(x => x.id !== assetId);
      }
      return prev.map(x => x.id === assetId ? {
        ...x,
        shares: newShares,
        investedUSD: newInvested,
        avgPrice: newAvg,
        lastPriceUSD: p,
        marketValueUSD: newShares * p,
      } : x);
    });
    closeTradeModal();
  }

  /* ---------------- EDIT / DELETE ---------------- */
  function deleteAsset(id) {
    const a = assets.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  /* ---------------- COMPUTED ROWS & TOTALS ---------------- */
  const rows = useMemo(() => {
    return assets.map(a => {
      const last = toNum(a.lastPriceUSD || a.avgPrice || 0);
      const market = toNum(a.shares || 0) * last;
      const invested = toNum(a.investedUSD || 0);
      const pnl = market - invested;
      const pct = invested > 0 ? (pnl / invested) * 100 : 0;
      return { ...a, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct: pct };
    });
  }, [assets]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + (r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pct };
  }, [rows]);

  /* ---------------- small helpers ---------------- */
  function colorFor(i) { return PALETTE[i % PALETTE.length]; }
  function safeFmt(val) { return displayCcy === "IDR" ? fmtMoney(val * (usdIdr || 1), "IDR") : fmtMoney(val, "USD"); }

  /* ---------------- RENDER ---------------- */
  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-400">
              Updated: {lastTick ? new Date(lastTick).toLocaleString() : "-"} • USD/IDR ≈ {usdIdr ? usdIdr.toLocaleString("id-ID") : "..."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{ displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr || 1), "IDR") : fmtMoney(totals.market, "USD") }</div>
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
            <div className="font-medium">{ displayCcy === "IDR" ? fmtMoney(totals.invested * (usdIdr || 1), "IDR") : fmtMoney(totals.invested, "USD") }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{ displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr || 1), "IDR") : fmtMoney(totals.market, "USD") }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Unrealized P&L</div>
            <div className={`font-semibold ${ totals.pnl >= 0 ? "text-emerald-400" : "text-red-400" }`}>{ displayCcy === "IDR" ? fmtMoney(totals.pnl * (usdIdr || 1),"IDR") : fmtMoney(totals.pnl,"USD") } ({ totals.pct.toFixed(2) }%)</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${ realizedUSD >= 0 ? "text-emerald-400" : "text-red-400" }`}>{ displayCcy === "IDR" ? fmtMoney(realizedUSD * (usdIdr || 1),"IDR") : fmtMoney(realizedUSD,"USD") }</div>
          </div>
        </div>

        {/* Add panel */}
        {openAdd && (
          <div className="mt-6 bg-transparent rounded p-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Saham ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
              </div>
              <div className="text-xs text-gray-400">Mode: <span className="font-medium text-gray-100">{ searchMode.toUpperCase() }</span></div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                        <div>
                          <div className="font-medium text-gray-100">{ (s.symbol || s.id) } • { s.display }</div>
                          <div className="text-xs text-gray-500">{ s.source === "coingecko" ? "Crypto (CoinGecko)" : `Security • ${s.exchange || s.currency || ''}` }</div>
                        </div>
                        <div className="text-xs text-gray-400">{ s.source === "coingecko" ? "CG" : "YH" }</div>
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

        {/* Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Name</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Avg</th>
                <th className="text-right py-2 px-3">Last</th>
                <th className="text-right py-2 px-3">Market Value</th>
                <th className="text-right py-2 px-3">Unrealized</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-4">
                    <div className="font-semibold text-gray-100 cursor-default">{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.name}</div>
                  </td>

                  <td className="px-3 py-4 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>

                  <td className="px-3 py-4 text-right tabular-nums">
                    { displayCcy === "IDR" ? fmtMoney((r.avgPrice || 0) * (usdIdr || 1), "IDR") : fmtMoney(r.avgPrice || 0, "USD") }
                  </td>

                  <td className="px-3 py-4 text-right tabular-nums">
                    { (r.lastPriceUSD && r.lastPriceUSD > 0) ? ( displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * (usdIdr || 1), "IDR") : fmtMoney(r.lastPriceUSD, "USD") ) : "-" }
                    <div className="text-xs text-gray-500">{ r.type === "crypto" ? "Crypto" : "Security" }</div>
                  </td>

                  <td className="px-3 py-4 text-right tabular-nums">{ displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr || 1), "IDR") : fmtMoney(r.marketValueUSD, "USD") }</td>

                  <td className="px-3 py-4 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ displayCcy === "IDR" ? fmtMoney(r.pnlUSD * (usdIdr || 1), "IDR") : fmtMoney(r.pnlUSD, "USD") }</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{ isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%" }</div>
                  </td>

                  <td className="px-3 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                      <button onClick={() => deleteAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Donut + legend (smaller) */}
        {rows.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-36 h-36 flex items-center justify-center">
              <Donut data={rows.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }))} size={120} inner={44} />
            </div>

            <div className="flex-1">
              {rows.map((r, idx) => {
                const pct = totals.market > 0 ? (r.marketValueUSD / totals.market) * 100 : 0;
                return (
                  <div key={r.id} className="flex items-center gap-3 mb-2">
                    <div style={{ width: 12, height: 12, background: colorFor(idx) }} className="rounded-sm" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-100">{r.symbol} <span className="text-xs text-gray-400">• {r.name}</span></div>
                      <div className="text-xs text-gray-400">{ displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr||1),"IDR") : fmtMoney(r.marketValueUSD,"USD") } • {pct.toFixed(1)}%</div>
                    </div>
                    <div className="text-sm text-gray-300">{ displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * (usdIdr||1),"IDR") : fmtMoney(r.marketValueUSD,"USD") }</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer summary */}
        <div className="mt-6 text-sm text-gray-300">
          <div>Total Invested: { displayCcy === "IDR" ? fmtMoney(totals.invested * (usdIdr||1),"IDR") : fmtMoney(totals.invested,"USD") }</div>
          <div>Market Value: { displayCcy === "IDR" ? fmtMoney(totals.market * (usdIdr||1),"IDR") : fmtMoney(totals.market,"USD") }</div>
          <div>Realized P/L: { displayCcy === "IDR" ? fmtMoney(realizedUSD * (usdIdr||1),"IDR") : fmtMoney(realizedUSD,"USD") }</div>
        </div>

        {/* Trade Modal */}
        {tradeModal.open && (
          <TradeModal
            mode={tradeModal.mode}
            asset={assets.find(a => a.id === tradeModal.assetId)}
            defaultPrice={tradeModal.defaultPriceUSD}
            onClose={closeTradeModal}
            onBuy={(qty, price) => performBuy(tradeModal.assetId, qty, price)}
            onSell={(qty, price) => performSell(tradeModal.assetId, qty, price)}
            displayCcy={displayCcy}
            usdIdr={usdIdr}
          />
        )}

      </div>
    </div>
  );
}

/* ---------------- TradeModal Component ---------------- */
function TradeModal({ mode, asset, defaultPrice, onClose, onBuy, onSell, displayCcy, usdIdr }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice || "");
  useEffect(() => { setPrice(defaultPrice || ""); }, [defaultPrice]);

  if (!asset) return null;
  const title = mode === "buy" ? `Buy ${asset.symbol}` : `Sell ${asset.symbol}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-gray-900 rounded p-4 text-gray-100">
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-gray-400">{asset.name}</div>
          </div>
          <button onClick={onClose} className="text-xs text-gray-400">Close</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Quantity (units)</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 1.5" className="w-full rounded bg-gray-800 px-3 py-2 text-sm mt-1" />
          </div>

          <div>
            <label className="text-xs text-gray-400">Price per unit (USD)</label>
            <div className="flex items-center gap-2 mt-1">
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 105.50" className="flex-1 rounded bg-gray-800 px-3 py-2 text-sm" />
              <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(Number(price || 0) * (usdIdr || 1), "IDR") : fmtMoney(Number(price || 0), "USD")}</div>
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
              {mode === "buy" ? "Confirm Buy" : "Confirm Sell"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Utility functions used above (performBuy/performSell) ---------------- */
/* Separated to avoid inline redefinition warnings — these helpers are referenced inside component scope. */
function performBuy(assetId, qty, price) {
  // placeholder — actual performBuy is defined inline in main component to access state
}
function performSell(assetId, qty, price) {
  // placeholder — actual performSell is defined inline in main component to access state
}