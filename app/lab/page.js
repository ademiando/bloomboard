"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Final dashboard page (single-file)
 *
 * Realtime sources:
 *  - Crypto: CoinGecko public API
 *  - Stocks: expects backend proxy at /api/finnhub/quote and /api/finnhub/candle
 *
 * Persist: localStorage for assets, transactions, settings.
 *
 * Important: Avg Price displayed with 2 decimals only. All numbers show currency label (IDR/USD).
 */

/* ----------------- Helpers ----------------- */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_SIMPLE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`;
const COINGECKO_SEARCH = (q) => `${COINGECKO_API}/search?query=${encodeURIComponent(q)}`;
const COINGECKO_MARKETCHART = (id, days) => `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=hourly`;

// stock proxies (expected on your server)
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const FINNHUB_CANDLE = (symbol, from, to) => `/api/finnhub/candle?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`;

// utilities
const isBrowser = typeof window !== "undefined";
const toNum = (v) => {
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
function fmtNum(val, currency = "IDR", decimals = 0) {
  const n = Number(val || 0);
  if (currency === "USD") {
    // USD: show decimals when requested (avg price 2 decimals), other numbers integer unless large
    return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  // IDR
  return `${currency} ${n.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
function ensureAsset(a) {
  return {
    id: a.id || `${a.type}:${a.symbol || a.coingeckoId || a.name}:${Date.now()}`,
    type: a.type || "crypto", // 'crypto' | 'stock' | 'nonliquid'
    symbol: a.symbol || (a.type === "stock" ? a.symbol : undefined),
    coingeckoId: a.coingeckoId || undefined,
    name: a.name || a.symbol || a.coingeckoId || "Unknown",
    shares: toNum(a.shares || a.quantity || a.units || 0),
    avgPrice: toNum(a.avgPrice || a.price || 0), // stored in USD base
    investedUSD: toNum(a.investedUSD || ( (a.shares||0) * (a.avgPrice||0) )),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    realizedUSD: toNum(a.realizedUSD || 0),
    createdAt: a.createdAt || Date.now(),
  };
}

/* ----------------- Small UI icons ----------------- */
const Back = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>);
const Graph = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);

/* ----------------- Main Component ----------------- */
export default function PortfolioDashboard() {
  // data
  const [assets, setAssets] = useState(() => {
    try { return (isBrowser && JSON.parse(localStorage.getItem("pf_assets_v2") || "[]").map(ensureAsset)) || []; } catch { return []; }
  });
  const [transactions, setTransactions] = useState(() => {
    try { return (isBrowser && JSON.parse(localStorage.getItem("pf_tx_v2") || "[]")) || []; } catch { return []; }
  });
  const [displayCcy, setDisplayCcy] = useState(() => (isBrowser && (localStorage.getItem("pf_display_ccy_v2") || "IDR")) || "IDR");
  const [usdIdr, setUsdIdr] = useState(16400);
  const [isFxLoading, setIsFxLoading] = useState(true);

  // UI
  const [activeTab, setActiveTab] = useState("portfolio"); // portfolio | performance | trade | view
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [tradeModal, setTradeModal] = useState({ open: false, asset: null, mode: "buy" });
  const [chartRange, setChartRange] = useState("30"); // days for market_chart

  // realtime price map (USD)
  const [priceMap, setPriceMap] = useState({}); // key: symbol or coingeckoId -> {usd, idr}

  // persist
  useEffect(() => { localStorage.setItem("pf_assets_v2", JSON.stringify(assets)); }, [assets]);
  useEffect(() => { localStorage.setItem("pf_tx_v2", JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem("pf_display_ccy_v2", displayCcy); }, [displayCcy]);

  /* ----------------- FX (USD <-> IDR) ----------------- */
  useEffect(() => {
    let mounted = true;
    const fetchFx = async () => {
      setIsFxLoading(true);
      try {
        const res = await fetch(`${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`);
        const j = await res.json();
        if (mounted && j?.tether?.idr) setUsdIdr(Number(j.tether.idr));
      } catch (e) {
        // ignore
      } finally { if (mounted) setIsFxLoading(false); }
    };
    fetchFx();
    const id = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  /* ----------------- PRICE POLLING (crypto via Coingecko, stocks via proxy) ----------------- */
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (assets.length === 0) return;
      // crypto ids
      const cryptoIds = assets.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId).filter(Boolean);
      if (cryptoIds.length > 0) {
        try {
          const idsParam = [...new Set(cryptoIds)].join(",");
          const res = await fetch(COINGECKO_SIMPLE(idsParam));
          const j = await res.json();
          if (mounted) {
            const newMap = { ...priceMap };
            Object.keys(j || {}).forEach(id => {
              newMap[`cg:${id}`] = { usd: Number(j[id].usd || 0), idr: Number(j[id].idr || 0) };
            });
            setPriceMap(newMap);
          }
        } catch (e) {}
      }

      // stocks: unique symbols
      const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol))].filter(Boolean);
      for (const symbol of stockSymbols) {
        try {
          const res = await fetch(FINNHUB_QUOTE(symbol));
          if (!res.ok) continue;
          const j = await res.json(); // { c: current, ... }
          if (mounted && j && j.c) {
            setPriceMap(prev => ({ ...prev, [`st:${symbol}`]: { usd: Number(j.c), idr: Number(j.c) * usdIdr } }));
          }
        } catch (e) {}
      }
    };

    poll();
    const id = setInterval(poll, 25_000);
    return () => { mounted = false; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, usdIdr]);

  /* ----------------- Search suggestions (CoinGecko + Yahoo proxy) ----------------- */
  const searchTimeout = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        // coingecko search (crypto first)
        const cRes = await fetch(COINGECKO_SEARCH(query.trim()));
        const cj = await cRes.json();
        const coins = (cj.coins || []).slice(0, 6).map(c => ({ type: "crypto", display: c.name, symbol: c.symbol.toUpperCase(), coingeckoId: c.id }));
        // yahoo search proxy for stocks
        let stocks = [];
        try {
          const sRes = await fetch(`/api/yahoo/search?q=${encodeURIComponent(query.trim())}`);
          if (sRes.ok) {
            const sj = await sRes.json();
            stocks = (sj.quotes || []).slice(0, 8).map(s => ({ type: "stock", display: s.shortname || s.longname || s.symbol, symbol: s.symbol.toUpperCase() }));
          }
        } catch (e) {}
        setSuggestions([...coins, ...stocks]);
      } catch (e) {
        setSuggestions([]);
      }
    }, 320);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  /* ----------------- Derived metrics: per-asset and totals ----------------- */
  const { rows, totals } = useMemo(() => {
    const r = assets.map(a => {
      // last price USD resolution:
      let lastPriceUSD = a.lastPriceUSD || 0;
      if (a.type === "crypto" && a.coingeckoId && priceMap[`cg:${a.coingeckoId}`]) {
        lastPriceUSD = Number(priceMap[`cg:${a.coingeckoId}`].usd || lastPriceUSD);
      }
      if (a.type === "stock" && a.symbol && priceMap[`st:${a.symbol}`]) {
        lastPriceUSD = Number(priceMap[`st:${a.symbol}`].usd || lastPriceUSD);
      }
      // invested is stored in USD
      const investedUSD = a.investedUSD || (a.shares * a.avgPrice);
      const marketValueUSD = a.shares * lastPriceUSD;
      const unrealizedUSD = marketValueUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (unrealizedUSD / investedUSD) * 100 : 0;
      return { ...a, lastPriceUSD, investedUSD, marketValueUSD, unrealizedUSD, pnlPct };
    });
    const totals = {
      investedUSD: r.reduce((s, x) => s + (x.investedUSD || 0), 0),
      marketValueUSD: r.reduce((s, x) => s + (x.marketValueUSD || 0), 0),
      unrealizedUSD: r.reduce((s, x) => s + (x.unrealizedUSD || 0), 0),
      realizedUSD: r.reduce((s, x) => s + (x.realizedUSD || 0), 0),
    };
    totals.totalEquityUSD = totals.marketValueUSD; // plus any cash balance if you add
    return { rows: r, totals };
  }, [assets, priceMap]);

  /* ----------------- CRUD: add asset from suggestion ----------------- */
  const addAssetFromSuggestion = (sug) => {
    if (!sug) return;
    const base = sug.type === "crypto"
      ? { type: "crypto", coingeckoId: sug.coingeckoId, name: sug.display, shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0 }
      : { type: "stock", symbol: sug.symbol, name: sug.display, shares: 0, avgPrice: 0, investedUSD: 0, lastPriceUSD: 0 };
    const newAsset = ensureAsset(base);
    setAssets(prev => [...prev, newAsset]);
    setSelectedSuggestion(null);
    setQuery("");
    setSuggestions([]);
  };

  /* ----------------- Trade logic (frontend state) ----------------- */
  const openTrade = (asset, mode = "buy") => setTradeModal({ open: true, asset, mode });
  const closeTrade = () => setTradeModal({ open: false, asset: null, mode: "buy" });

  const executeTrade = ({ assetId, mode, qty, priceInput, priceCcy }) => {
    // priceInput is in display currency; convert to USD
    const priceNum = toNum(priceInput);
    const priceUSD = priceCcy === "IDR" ? priceNum / usdIdr : priceNum;
    const qtyNum = Number(qty || 0);
    if (qtyNum <= 0 || priceUSD <= 0) { alert("Qty & price must be > 0"); return false; }

    setAssets(prev => prev.map(a => {
      if (a.id !== assetId) return a;
      if (mode === "buy") {
        const newShares = a.shares + qtyNum;
        const newInvested = a.investedUSD + qtyNum * priceUSD;
        const newAvg = newInvested / newShares;
        return { ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg };
      } else {
        // sell: reduce shares, realize PnL
        const sellQty = Math.min(qtyNum, a.shares);
        const proceeds = sellQty * priceUSD;
        const costBasis = sellQty * a.avgPrice;
        const realized = proceeds - costBasis;
        const newShares = a.shares - sellQty;
        const newInvested = Math.max(0, a.investedUSD - costBasis);
        const newAvg = newShares > 0 ? newInvested / newShares : 0;
        // push transaction record
        setTransactions(tx => [{ id: `tx:${Date.now()}`, assetId: a.id, mode, qty: sellQty, pricePerUnitUSD: priceUSD, proceedsUSD: proceeds, realizedUSD: realized, date: Date.now(), symbol: a.symbol, name: a.name }, ...tx]);
        // update realized on asset
        return { ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, realizedUSD: (a.realizedUSD || 0) + realized };
      }
    }));
    closeTrade();
    return true;
  };

  /* ----------------- Performance chart (simple line ROI) ----------------- */
  // compute ROI series by summing marketValue over time: we will fetch per-asset historical then combine by timestamp (for crypto via CG)
  // For simplicity we implement realtime total ROI using current snapshots every poll and keep history in memory.
  const [roiHistory, setRoiHistory] = useState(() => {
    try { return (isBrowser && JSON.parse(localStorage.getItem("pf_roi_hist_v2") || "[]")) || []; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem("pf_roi_hist_v2", JSON.stringify(roiHistory)); }, [roiHistory]);

  // append a snapshot each poll (every 30s)
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const totalMarket = rows.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
      setRoiHistory(h => {
        const next = [...h, { t, v: totalMarket }];
        // cap to 500 points to avoid memory bloat
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [rows]);

  /* ----------------- View Performance per asset (historical fetch) ----------------- */
  const fetchHistoricalForAsset = async (asset) => {
    if (!asset) return null;
    // crypto: coinGecko market_chart (USD)
    if (asset.type === "crypto" && asset.coingeckoId) {
      try {
        const res = await fetch(COINGECKO_MARKETCHART(asset.coingeckoId, chartRange || 30));
        const j = await res.json();
        // j.prices: [[unix_ms, price], ...]
        return (j.prices || []).map(p => ({ t: p[0], v: p[1] }));
      } catch (e) { return []; }
    }
    // stock: use FINNHUB_CANDLE proxy (from/to timestamps)
    if (asset.type === "stock" && asset.symbol) {
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - (Number(chartRange) || 30) * 24 * 3600;
        const res = await fetch(FINNHUB_CANDLE(asset.symbol, from, to));
        const j = await res.json(); // {c:[],t:[]}
        if (j && j.t && j.c) {
          return j.t.map((ts, i) => ({ t: ts * 1000, v: j.c[i] }));
        }
      } catch (e) { return []; }
    }
    return [];
  };

  /* ----------------- UI: Add / Edit asset form (small) ----------------- */
  const [newAssetType, setNewAssetType] = useState("crypto");
  const [newSymbolOrId, setNewSymbolOrId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newAvgPrice, setNewAvgPrice] = useState("");
  const addManualAsset = () => {
    if (!newSymbolOrId) { alert("Provide symbol (for stock) or coingecko id (for crypto)."); return; }
    let stub = null;
    if (newAssetType === "crypto") {
      stub = { type: "crypto", coingeckoId: newSymbolOrId, name: newSymbolOrId, shares: toNum(newQty), avgPrice: toNum(newAvgPrice), investedUSD: toNum(newQty) * toNum(newAvgPrice) };
    } else {
      stub = { type: "stock", symbol: newSymbolOrId.toUpperCase(), name: newSymbolOrId.toUpperCase(), shares: toNum(newQty), avgPrice: toNum(newAvgPrice), investedUSD: toNum(newQty) * toNum(newAvgPrice) };
    }
    setAssets(prev => [...prev, ensureAsset(stub)]);
    setNewSymbolOrId(""); setNewQty(""); setNewAvgPrice("");
  };

  /* ----------------- Small render helpers ----------------- */
  const currencyLabel = (valueUSD) => displayCcy === "IDR" ? fmtNum(valueUSD * usdIdr, "IDR", 0) : fmtNum(valueUSD, "USD", 0);
  const avgPriceLabel = (priceUSD) => displayCcy === "IDR" ? fmtNum(priceUSD * usdIdr, "IDR", 2) : fmtNum(priceUSD, "USD", 2);

  /* ----------------- Render ----------------- */
  return (
    <div className="p-4 bg-black text-gray-200 min-h-screen">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div style={{width:36,height:36,borderRadius:8,background:"#111"}}></div>
          <h1 className="text-xl font-semibold">Bloomboard — Full Realtime</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-400">USD/IDR: {isFxLoading ? "..." : fmtNum(usdIdr, "USD", 2)}</div>
          <div className="bg-gray-900 p-2 rounded flex items-center gap-2">
            <button className={`px-2 py-1 rounded ${displayCcy==="IDR"?"bg-gray-700":""}`} onClick={() => setDisplayCcy("IDR")}>IDR</button>
            <button className={`px-2 py-1 rounded ${displayCcy==="USD"?"bg-gray-700":""}`} onClick={() => setDisplayCcy("USD")}>USD</button>
          </div>
        </div>
      </header>

      {/* nav */}
      <nav className="flex gap-3 mb-4">
        {["portfolio","performance","trade","view"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`px-3 py-2 rounded ${activeTab===t ? "bg-emerald-600 text-black" : "bg-gray-800"}`}>{t.toUpperCase()}</button>
        ))}
      </nav>

      {/* Tab content */}
      <main>
        {activeTab === "portfolio" && (
          <section>
            <div className="mb-3 flex justify-between items-center">
              <div className="text-sm">Portfolio summary</div>
              <div className="flex items-center gap-2">
                <input placeholder="Search symbol or coin id..." value={query} onChange={e=>setQuery(e.target.value)} className="bg-gray-900 px-2 py-1 rounded" />
                <button onClick={() => { if (selectedSuggestion) addAssetFromSuggestion(selectedSuggestion); else if (suggestions[0]) addAssetFromSuggestion(suggestions[0]); }} className="px-3 py-1 bg-emerald-600 rounded">Add</button>
              </div>
            </div>

            {/* suggestions */}
            {suggestions.length>0 && <div className="mb-3 bg-gray-900 p-2 rounded max-h-48 overflow-auto">
              {suggestions.map((s,i)=>(
                <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-800 rounded">
                  <div><div className="font-semibold">{s.display}</div><div className="text-xs text-gray-400">{s.type} {s.symbol || s.coingeckoId}</div></div>
                  <div><button onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.display}`); }} className="px-2 py-1 bg-gray-700 rounded">Select</button></div>
                </div>
              ))}
            </div>}

            {/* portfolio table */}
            <div className="overflow-x-auto bg-gray-900 rounded">
              <table className="w-full min-w-[900px]">
                <thead className="text-xs text-gray-400">
                  <tr>
                    <th className="p-2 text-left">Asset</th>
                    <th className="p-2 text-right">Invested</th>
                    <th className="p-2 text-right">Avg Price</th>
                    <th className="p-2 text-right">Quantity</th>
                    <th className="p-2 text-right">Current Price</th>
                    <th className="p-2 text-right">Unrealized PnL</th>
                    <th className="p-2 text-right">Gain (Nominal / %)</th>
                    <th className="p-2 text-right">Realized PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-850 cursor-pointer" onDoubleClick={() => openTrade(r, "buy")}>
                      <td className="p-2">
                        <div className="font-semibold">{r.name || r.symbol}</div>
                        <div className="text-xs text-gray-400">{r.type.toUpperCase()} {r.symbol ? `• ${r.symbol}` : ""} {r.coingeckoId ? `• ${r.coingeckoId}` : ""}</div>
                      </td>
                      <td className="p-2 text-right">{currencyLabel(r.investedUSD)}</td>
                      <td className="p-2 text-right">{avgPriceLabel(r.avgPrice)}</td>
                      <td className="p-2 text-right">{Number(r.shares).toLocaleString()}</td>
                      <td className="p-2 text-right">{displayCcy==="IDR" ? fmtNum(r.lastPriceUSD * usdIdr, "IDR", 0) : fmtNum(r.lastPriceUSD, "USD", 0)}</td>
                      <td className={`p-2 text-right ${r.unrealizedUSD>=0 ? "text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR" ? fmtNum(r.unrealizedUSD * usdIdr, "IDR", 0) : fmtNum(r.unrealizedUSD, "USD", 0)}</td>
                      <td className={`p-2 text-right ${r.unrealizedUSD>=0 ? "text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR" ? fmtNum(r.unrealizedUSD * usdIdr, displayCcy, 0) : fmtNum(r.unrealizedUSD, displayCcy, 0)} / {r.pnlPct.toFixed(2)}%</td>
                      <td className={`p-2 text-right ${r.realizedUSD>=0 ? "text-emerald-400":"text-red-400"}`}>{displayCcy==="IDR" ? fmtNum(r.realizedUSD * usdIdr, "IDR", 0) : fmtNum(r.realizedUSD, "USD", 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* quick manual add */}
            <div className="mt-4 p-3 bg-gray-900 rounded grid grid-cols-1 md:grid-cols-4 gap-2">
              <select className="p-2 bg-gray-800" value={newAssetType} onChange={e=>setNewAssetType(e.target.value)}>
                <option value="crypto">Crypto (coingecko id)</option>
                <option value="stock">Stock (symbol)</option>
              </select>
              <input className="p-2 bg-gray-800" placeholder={newAssetType==="crypto"?"coingecko id (bitcoin)":"symbol (AAPL)"} value={newSymbolOrId} onChange={e=>setNewSymbolOrId(e.target.value)} />
              <input className="p-2 bg-gray-800" placeholder="quantity" value={newQty} onChange={e=>setNewQty(e.target.value)} />
              <div className="flex gap-2">
                <input className="p-2 bg-gray-800 flex-1" placeholder="avg price (USD)" value={newAvgPrice} onChange={e=>setNewAvgPrice(e.target.value)} />
                <button className="px-3 py-2 bg-emerald-600 rounded" onClick={addManualAsset}>Add Asset</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "performance" && (
          <section>
            <div className="mb-3 flex justify-between items-center">
              <div className="flex items-center gap-2"><Graph/> <div className="font-semibold">Performance (ROI)</div></div>
              <div className="flex items-center gap-2">
                <select value={chartRange} onChange={e=>setChartRange(e.target.value)} className="bg-gray-800 p-2">
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">365 days</option>
                </select>
              </div>
            </div>

            {/* ROI simple line: use roiHistory */}
            <div className="bg-gray-900 p-4 rounded">
              <SimpleLineChart data={roiHistory.map(p => ({ x: p.t, y: p.v }))} usdIdr={usdIdr} displayCcy={displayCcy} />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="p-3 bg-[#121212] rounded">
                  <div className="text-xs text-gray-400">Total Invested</div>
                  <div className="font-semibold">{displayCcy==="IDR" ? fmtNum(totals.investedUSD * usdIdr, "IDR", 0) : fmtNum(totals.investedUSD, "USD", 0)}</div>
                </div>
                <div className="p-3 bg-[#121212] rounded">
                  <div className="text-xs text-gray-400">Market Value</div>
                  <div className="font-semibold">{displayCcy==="IDR" ? fmtNum(totals.marketValueUSD * usdIdr, "IDR", 0) : fmtNum(totals.marketValueUSD, "USD", 0)}</div>
                </div>
                <div className="p-3 bg-[#121212] rounded">
                  <div className="text-xs text-gray-400">Unrealized PnL</div>
                  <div className="font-semibold">{displayCcy==="IDR" ? fmtNum(totals.unrealizedUSD * usdIdr, "IDR", 0) : fmtNum(totals.unrealizedUSD, "USD", 0)}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "trade" && (
          <section>
            <div className="mb-3 flex justify-between items-center">
              <div className="font-semibold">Trade (Buy / Sell) — simulated in frontend</div>
            </div>
            <div className="bg-gray-900 p-4 rounded grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-400 mb-2">Select Asset</div>
                <div className="space-y-2">
                  {assets.map(a=>(
                    <div key={a.id} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                      <div>
                        <div className="font-semibold">{a.name} {a.symbol ? `(${a.symbol})` : ""}</div>
                        <div className="text-xs text-gray-400">Shares: {a.shares}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={()=>openTrade(a,"buy")} className="px-3 py-1 bg-emerald-600 rounded">Buy</button>
                        <button onClick={()=>openTrade(a,"sell")} className="px-3 py-1 bg-red-600 rounded">Sell</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-2">Quick Trade Form</div>
                <TradeForm usdIdr={usdIdr} displayCcy={displayCcy} onExecute={executeTrade} assets={assets} />
                <div className="mt-3 text-sm text-gray-400">Double-click any row in Portfolio to open quick buy modal for that asset.</div>
              </div>
            </div>
          </section>
        )}

        {activeTab === "view" && (
          <section>
            <div className="mb-3 flex justify-between items-center">
              <div className="font-semibold">View Performance — asset history</div>
              <div>
                <button className="px-3 py-1 bg-gray-800 rounded" onClick={() => { /* nothing */ }}>Refresh</button>
              </div>
            </div>

            <div className="space-y-4">
              {assets.map(a => (
                <div key={a.id} className="bg-gray-900 p-3 rounded">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <div className="font-semibold">{a.name} {a.symbol ? `(${a.symbol})` : ""}</div>
                      <div className="text-xs text-gray-400">Type: {a.type}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{displayCcy==="IDR" ? fmtNum(a.lastPriceUSD * usdIdr, "IDR", 0) : fmtNum(a.lastPriceUSD, "USD", 0)}</div>
                      <div className="text-xs text-gray-400">Avg: {avgPriceLabel(a.avgPrice)}</div>
                    </div>
                  </div>
                  <AssetHistory asset={a} days={Number(chartRange)||30} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Trade modal */}
      {tradeModal.open && tradeModal.asset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeTrade}>
          <div className="bg-[#111] p-4 rounded w-full max-w-md" onClick={(e)=>e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">{tradeModal.mode.toUpperCase()} — {tradeModal.asset.name}</div>
              <button onClick={closeTrade}>✕</button>
            </div>
            <TradeModalContent asset={tradeModal.asset} mode={tradeModal.mode} usdIdr={usdIdr} displayCcy={displayCcy} onSubmit={executeTrade} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------- Components ----------------- */

/* SimpleLineChart: draws a basic line chart from data [{x:timestamp, y:value}] */
function SimpleLineChart({ data = [], usdIdr = 16000, displayCcy = "IDR", height = 160 }) {
  if (!data || data.length === 0) return <div className="text-center text-gray-400 py-8">No data</div>;
  // normalize values
  const w = 800, h = height, pad = 24;
  const xs = data.map(d => d.x);
  const ys = data.map(d => d.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const xScale = (t) => pad + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - pad*2);
  const yScale = (v) => pad + (1 - (v - minY) / range) * (h - pad*2);
  const path = data.map((p, i) => `${i===0 ? 'M' : 'L'}${xScale(p.x)},${yScale(p.y)}`).join(' ');
  const last = data[data.length-1].y;
  return (
    <div className="w-full overflow-auto">
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', height}} className="rounded">
        <defs>
          <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.35"/><stop offset="100%" stopColor="#16a34a" stopOpacity="0"/></linearGradient>
        </defs>
        <path d={`${path} L ${xScale(xs[xs.length-1])},${h-pad} L ${xScale(xs[0])},${h-pad} Z`} fill="url(#g1)" stroke="none" />
        <path d={path} fill="none" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {/* y grid */}
        {[0,0.25,0.5,0.75,1].map((p,i)=> {
          const y = pad + p*(h - pad*2);
          return <line key={i} x1={pad} x2={w-pad} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />;
        })}
        {/* label current */}
        <text x={w - pad} y={pad+12} fontSize="12" textAnchor="end" fill="#d1fae5">{displayCcy==="IDR" ? `${fmtNum(last * usdIdr, "IDR", 0)}` : `${fmtNum(last, "USD", 0)}`}</text>
      </svg>
    </div>
  );
}

/* Trade form for non-modal quick trades */
function TradeForm({ usdIdr, displayCcy, onExecute, assets }) {
  const [assetId, setAssetId] = useState(assets[0]?.id || "");
  const [mode, setMode] = useState("buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [priceCcy, setPriceCcy] = useState(displayCcy);

  useEffect(()=> { setAssetId(assets[0]?.id || ""); }, [assets]);

  const submit = () => {
    if (!assetId) { alert("Select asset"); return; }
    onExecute({ assetId, mode, qty: Number(qty), priceInput: price, priceCcy });
    setQty(""); setPrice("");
  };

  return (
    <div className="bg-gray-800 p-3 rounded space-y-2">
      <div className="flex gap-2">
        <select value={assetId} onChange={e=>setAssetId(e.target.value)} className="flex-1 p-2 bg-gray-900">
          {assets.map(a => <option key={a.id} value={a.id}>{a.name} {a.symbol ? `(${a.symbol})` : ""}</option>)}
        </select>
        <select value={mode} onChange={e=>setMode(e.target.value)} className="p-2 bg-gray-900">
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input placeholder="Quantity" value={qty} onChange={e=>setQty(e.target.value)} className="p-2 bg-gray-900 flex-1" />
        <input placeholder={`Price (${priceCcy})`} value={price} onChange={e=>setPrice(e.target.value)} className="p-2 bg-gray-900 w-40" />
        <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="p-2 bg-gray-900">
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={submit} className="px-4 py-2 bg-emerald-600 rounded">Execute</button>
      </div>
    </div>
  );
}

/* Modal content for trade */
function TradeModalContent({ asset, mode="buy", usdIdr, displayCcy, onSubmit }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(displayCcy==="IDR" ? String(Math.round(asset.lastPriceUSD * usdIdr)) : String(asset.lastPriceUSD));
  const [priceCcy, setPriceCcy] = useState(displayCcy);

  const handle = () => {
    onSubmit({ assetId: asset.id, mode, qty: Number(qty), priceInput: price, priceCcy });
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400">Asset</div>
      <div className="font-semibold">{asset.name} {asset.symbol ? `(${asset.symbol})` : ""}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-gray-400">Quantity</div>
          <input value={qty} onChange={e=>setQty(e.target.value)} className="w-full p-2 bg-gray-900" />
        </div>
        <div>
          <div className="text-xs text-gray-400">Price ({priceCcy})</div>
          <input value={price} onChange={e=>setPrice(e.target.value)} className="w-full p-2 bg-gray-900" />
        </div>
      </div>
      <div className="flex gap-2">
        <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="p-2 bg-gray-900">
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
        </select>
        <button onClick={handle} className="px-4 py-2 bg-emerald-600 rounded">{mode.toUpperCase()}</button>
      </div>
    </div>
  );
}

/* AssetHistory: fetch and render small chart per asset */
function AssetHistory({ asset, days = 30 }) {
  const [hist, setHist] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchHist = async () => {
      setLoading(true);
      try {
        if (asset.type === "crypto" && asset.coingeckoId) {
          const res = await fetch(`${COINGECKO_API}/coins/${asset.coingeckoId}/market_chart?vs_currency=usd&days=${days}`);
          const j = await res.json();
          if (!mounted) return;
          const arr = (j.prices || []).map(p => ({ t: p[0], v: p[1] }));
          setHist(arr);
        } else if (asset.type === "stock" && asset.symbol) {
          const to = Math.floor(Date.now() / 1000);
          const from = to - days * 24*3600;
          const res = await fetch(FINNHUB_CANDLE(asset.symbol, from, to));
          const j = await res.json();
          if (!mounted) return;
          if (j && j.t && j.c) {
            const arr = j.t.map((ts, i) => ({ t: ts*1000, v: j.c[i] }));
            setHist(arr);
          } else setHist([]);
        } else setHist([]);
      } catch (e) {
        setHist([]);
      } finally { setLoading(false); }
    };
    fetchHist();
    // no interval to avoid rate limits
    return () => { mounted = false; };
  }, [asset, days]);

  if (loading) return <div className="text-sm text-gray-400">Loading history…</div>;
  if (!hist || hist.length === 0) return <div className="text-sm text-gray-400">No history</div>;

  // tiny sparkline
  const w = 600, h = 120, pad = 8;
  const xs = hist.map(d=>d.t);
  const ys = hist.map(d=>d.v);
  const minY = Math.min(...ys), maxY = Math.max(...ys), range = maxY - minY || 1;
  const xScale = (t) => pad + ((t - xs[0])/(xs[xs.length-1] - xs[0] || 1)) * (w - pad*2);
  const yScale = (v) => pad + (1 - (v - minY)/range) * (h - pad*2);
  const path = hist.map((p,i)=> `${i===0?'M':'L'}${xScale(p.t)},${yScale(p.v)}`).join(' ');
  const last = hist[hist.length-1].v;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%", height:120}}>
        <path d={`${path} L ${xScale(xs[xs.length-1])},${h-pad} L ${xScale(xs[0])},${h-pad} Z`} fill="rgba(16,185,129,0.12)" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
        <text x={w-10} y={14} fontSize="12" textAnchor="end" fill="#9ca3af">{asset.type === "crypto" ? `USD ${last.toFixed(2)}` : `USD ${last.toFixed(2)}`}</text>
      </svg>
    </div>
  );
}