"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
  Final Dashboard (single-file)
  - Yahoo Finance (search + quotes polling)
  - CoinGecko (crypto search + price polling + USD/IDR fallback)
  - TradingView for chart (open new tab)
  - Add/Edit/Delete/Buy/Sell, LocalStorage persistence
  - Dark minimalist UI, donut allocation, portfolio currency dropdown (USD/IDR)
*/

/* ------------------ CONFIG ------------------ */
// Yahoo endpoints (no key)
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;

// CoinGecko
const COINGECKO_SEARCH = (q) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_USD_IDR = `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr`;

/* ------------------ HELPERS ------------------ */
const isBrowser = typeof window !== "undefined";
const toNumber = (v) => (isNaN(+v) ? 0 : +v);

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* try guess quote currency from symbol (best-effort) */
function guessQuoteCurrency(symbol, yahooQuoteCurrency) {
  if (yahooQuoteCurrency) return yahooQuoteCurrency;
  if (!symbol) return "USD";
  if (symbol.includes(".JK") || symbol.startsWith("IDX:") || symbol.includes("IDR")) return "IDR";
  if (/USDT|USD/i.test(symbol)) return "USD";
  return "USD";
}

/* normalize coinGecko returned idr (sometimes small) */
function normalizeIdr(val) {
  const n = Number(val);
  if (!n || Number.isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* Donut SVG */
function Donut({ items = [], size = 140, inner = 60 }) {
  const total = items.reduce((s, it) => s + Math.max(0, it.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  let start = -90;
  const palette = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {items.map((it, i) => {
        const portion = Math.max(0, it.value || 0) / total;
        const angle = portion * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sRad = (Math.PI * start) / 180;
        const eRad = (Math.PI * end) / 180;
        const x1 = cx + r * Math.cos(sRad);
        const y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad);
        const y2 = cy + r * Math.sin(eRad);
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={i} d={d} fill={palette[i % palette.length]} stroke="rgba(0,0,0,0.08)" strokeWidth="0.2" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ------------------ COMPONENT ------------------ */
export default function DashboardPage() {
  /* persisted portfolio */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_portfolio_v_yahoo") || "[]");
    } catch { return []; }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_v_yahoo") || "0");
    } catch { return 0; }
  });

  /* display currency + FX */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  /* realtime price stores */
  const [yahooQuotes, setYahooQuotes] = useState({}); // symbol -> { regularMarketPrice, currency, ... }
  const [cryptoPrices, setCryptoPrices] = useState({}); // coingeckoId -> { usd: ... }
  const [lastTick, setLastTick] = useState(null);

  /* search UI */
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  /* add/edit inputs */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcyInput, setAvgCcyInput] = useState("USD");

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [editAvgCcy, setEditAvgCcy] = useState("USD");

  /* polling refs */
  const pollRef = useRef(null);
  const pollCryptoRef = useRef(null);
  const pollFxRef = useRef(null);

  /* persist on change */
  useEffect(() => { try { localStorage.setItem("bb_portfolio_v_yahoo", JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("bb_realized_usd_v_yahoo", String(realizedUSD)); } catch {} }, [realizedUSD]);

  /* ------------------ SEARCH (Yahoo + CoinGecko) ------------------ */
  useEffect(() => {
    let cancelled = false;
    if (!debQuery || debQuery.length < 1) {
      setSuggestions([]);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const q = debQuery;
        // Yahoo search
        const yahooPromise = fetch(YAHOO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        const cgPromise = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        const [yh, cg] = await Promise.all([yahooPromise, cgPromise]);
        if (cancelled) return;

        const yhList = (yh && yh.quotes && Array.isArray(yh.quotes)) ? yh.quotes.slice(0, 12).map(it => ({
          source: "yahoo",
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          currency: it.currency || it.exchange || null,
        })) : [];

        const cgList = (cg && cg.coins && Array.isArray(cg.coins)) ? cg.coins.slice(0, 10).map(it => ({
          source: "coingecko",
          coingeckoId: it.id,
          symbol: it.symbol.toUpperCase(),
          display: it.name,
        })) : [];

        // Merge: put crypto first, then yahoo
        const merged = [];
        const seen = new Set();
        cgList.forEach(c => { const k = `cg:${c.coingeckoId}`; if (!seen.has(k)) { merged.push(c); seen.add(k); }});
        yhList.forEach(y => { const k = `yh:${y.symbol}`; if (!seen.has(k)) { merged.push(y); seen.add(k); }});
        setSuggestions(merged.slice(0, 14));
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("search err", e);
        setSuggestions([]);
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [debQuery]);

  /* ------------------ POLL QUOTES (Yahoo) every 5s ------------------ */
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const yahooSymbols = Array.from(new Set(assets.filter(a => a.source === "yahoo").map(a => a.symbol))).slice(0, 50);
        if (yahooSymbols.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(yahooSymbols));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        if (!j || !j.quoteResponse || !Array.isArray(j.quoteResponse.result)) return;
        const map = {};
        j.quoteResponse.result.forEach(q => {
          if (q && q.symbol) map[q.symbol] = q;
        });
        setYahooQuotes(prev => ({ ...prev, ...map }));
        setLastTick(Date.now());
      } catch (e) {
        // ignore
      }
    }
    // initial poll + interval
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { mounted = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [assets]);

  /* ------------------ POLL COINGECKO for crypto prices (6s) ------------------ */
  useEffect(() => {
    let mounted = true;
    async function pollCG() {
      try {
        const cgIds = Array.from(new Set(assets.filter(a => a.source === "coingecko").map(a => a.coingeckoId))).slice(0, 100);
        if (cgIds.length === 0) return;
        const res = await fetch(COINGECKO_PRICE(cgIds.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setCryptoPrices(prev => ({ ...prev, ...j }));
        setLastTick(Date.now());
      } catch (e) {}
    }
    pollCG();
    pollCryptoRef.current = setInterval(pollCG, 6000);
    return () => { mounted = false; if (pollCryptoRef.current) clearInterval(pollCryptoRef.current); };
  }, [assets]);

  /* ------------------ POLL FX (USD/IDR) fallback (Coingecko) every 60s ------------------ */
  useEffect(() => {
    let mounted = true;
    async function fetchFx() {
      try {
        const res = await fetch(COINGECKO_USD_IDR);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const raw = j?.tether?.idr;
        const n = normalizeIdr(raw);
        if (n) setUsdIdr(prev => (!prev || Math.abs(prev - n) / n > 0.0005 ? n : prev));
      } catch (e) {}
    }
    fetchFx();
    pollFxRef.current = setInterval(fetchFx, 60_000);
    return () => { mounted = false; if (pollFxRef.current) clearInterval(pollFxRef.current); };
  }, []);

  /* ------------------ COMPUTE rows, totals, pie ------------------ */
  const rows = useMemo(() => {
    return assets.map(a => {
      // determine native last price
      let native = a.lastKnownNative ?? null;
      if (a.source === "yahoo" && yahooQuotes[a.symbol] && yahooQuotes[a.symbol].regularMarketPrice != null) {
        native = yahooQuotes[a.symbol].regularMarketPrice;
      }
      if (a.source === "coingecko" && cryptoPrices[a.coingeckoId] && cryptoPrices[a.coingeckoId].usd != null) {
        native = cryptoPrices[a.coingeckoId].usd;
      }

      const quoteCcy = a.source === "coingecko" ? "USD" : guessQuoteCurrency(a.symbol, yahooQuotes[a.symbol]?.currency);
      // price in USD
      let priceUSD = 0;
      if (a.source === "coingecko") priceUSD = toNumber(native);
      else {
        if (quoteCcy === "IDR") priceUSD = toNumber(native) / (usdIdr || 1);
        else priceUSD = toNumber(native);
      }

      const investedUSD = toNumber(a.avgUSD) * toNumber(a.qty);
      const marketUSD = priceUSD * toNumber(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;

      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;

      return {
        ...a,
        native,
        quoteCcy,
        priceUSD,
        investedUSD,
        marketUSD,
        pnlUSD,
        pnlPct,
        displayPrice,
        displayInvested,
        displayMarket,
        displayPnl,
      };
    });
  }, [assets, yahooQuotes, cryptoPrices, usdIdr, displayCcy]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + (r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + (r.marketUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  const displayTotals = {
    invested: displayCcy === "IDR" ? totals.invested * (usdIdr || 1) : totals.invested,
    market: displayCcy === "IDR" ? totals.market * (usdIdr || 1) : totals.market,
    pnl: displayCcy === "IDR" ? totals.pnl * (usdIdr || 1) : totals.pnl,
    pnlPct: totals.pnlPct,
    realized: displayCcy === "IDR" ? realizedUSD * (usdIdr || 1) : realizedUSD,
  };

  const pieItems = useMemo(() => rows.map(r => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter(i => i.value > 0), [rows]);

  /* ------------------ ACTIONS ------------------ */
  function selectSuggestion(item) {
    setSelected(item);
    if (item.source === "coingecko") setQuery(`${item.symbol} — ${item.display}`);
    else setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]);
  }

  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      // allow typed yahoo symbol (e.g. AAPL or BBCA.JK)
      if (query.includes(":") || query.includes(".") || /^[A-Z0-9-_.]{1,12}$/.test(query.split(" — ")[0].trim())) {
        const symbol = query.split(" — ")[0].trim();
        pick = { source: "yahoo", symbol, display: symbol };
      }
    }
    if (!pick) { alert("Pilih asset dari suggestions atau ketik symbol lengkap."); return; }

    const q = toNumber(qtyInput);
    const a = toNumber(avgInput);
    if (q <= 0 || a <= 0) { alert("Qty dan Avg harus > 0"); return; }

    const avgUSD = avgCcyInput === "IDR" ? a / (usdIdr || 1) : a;
    const base = {
      id: Date.now(),
      source: pick.source,
      symbol: pick.source === "coingecko" ? (pick.symbol || pick.coingeckoId) : pick.symbol,
      coingeckoId: pick.source === "coingecko" ? pick.coingeckoId : undefined,
      displayName: pick.display,
      qty: q,
      avgInput: a,
      inputCurrency: avgCcyInput,
      avgUSD,
      lastKnownNative: undefined,
      createdAt: Date.now(),
    };

    // fetch initial price
    if (base.source === "coingecko" && base.coingeckoId) {
      try {
        const res = await fetch(COINGECKO_PRICE(base.coingeckoId));
        if (res.ok) {
          const j = await res.json();
          if (j && j[base.coingeckoId] && typeof j[base.coingeckoId].usd === "number") {
            base.lastKnownNative = j[base.coingeckoId].usd;
            setCryptoPrices(prev => ({ ...prev, [base.coingeckoId]: j[base.coingeckoId] }));
          }
        }
      } catch {}
    } else if (base.source === "yahoo" && base.symbol) {
      try {
        const res = await fetch(YAHOO_QUOTE([base.symbol]));
        if (res.ok) {
          const j = await res.json();
          if (j?.quoteResponse?.result && j.quoteResponse.result[0]) {
            const qobj = j.quoteResponse.result[0];
            base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
            setYahooQuotes(prev => ({ ...prev, [base.symbol]: qobj }));
          }
        }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // reset
    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCcyInput("USD");
  }

  function beginEdit(a) {
    setEditingId(a.id);
    setEditQty(String(a.qty));
    setEditAvg(String(a.avgInput || a.avgUSD || ""));
    setEditAvgCcy(a.inputCurrency || "USD");
  }
  function saveEdit(id) {
    const q = toNumber(editQty);
    const a = toNumber(editAvg);
    if (q <= 0 || a <= 0) { setEditingId(null); return; }
    const avgUSD = editAvgCcy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: editAvgCcy, avgUSD } : x));
    setEditingId(null);
  }
  function cancelEdit() { setEditingId(null); }

  function removeAsset(id) {
    setAssets(prev => prev.filter(a => a.id !== id));
  }

  function buyMore(a) {
    const qtyStr = prompt(`Buy qty for ${a.symbol || a.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Buy price (in ${a.inputCurrency || "USD"}):`, String(a.avgInput || ""));
    const ccy = prompt("Currency (USD/IDR):", a.inputCurrency || "USD");
    const bq = toNumber(qtyStr);
    const bp = toNumber(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = a.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (a.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: (curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD), inputCurrency: curr } : x));
  }

  function sellSome(a) {
    const qtyStr = prompt(`Sell qty for ${a.symbol || a.displayName}:`, "0");
    const sq = toNumber(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = a.qty - sq;
    if (remain <= 0) removeAsset(a.id);
    else setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: remain } : x));
  }

  /* open TradingView chart in new tab; attempt to map symbol to TradingView format */
  function openTradingView(r) {
    // If yahoo symbol contains exchange suffix (e.g., .JK) try map:
    let tvSymbol = r.symbol;
    if (!tvSymbol && r.coingeckoId) {
      // TradingView uses BINANCE:BTCUSDT usually; we can't map cg id reliably — open search page
      window.open(`https://www.tradingview.com/symbols/${encodeURIComponent(r.coingeckoId)}/`, "_blank");
      return;
    }
    // crude mapping: .JK -> IDX:CODE (remove .JK)
    if (tvSymbol?.endsWith(".JK")) {
      const code = tvSymbol.replace(".JK", "");
      tvSymbol = `IDX:${code}`;
    }
    // US stocks likely need exchange prefix — try NASDAQ by default
    if (!tvSymbol.includes(":") && /^[A-Z0-9.]{1,10}$/.test(tvSymbol)) {
      // try NASDAQ first
      tvSymbol = `NASDAQ:${tvSymbol}`;
    }
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`, "_blank");
  }

  /* ------------------ UI ------------------ */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">Last update: {lastTick ? new Date(lastTick).toLocaleTimeString() : "-"} • USD/IDR ≈ <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{displayCcy === "IDR" ? fmtMoney(displayTotals.market, "IDR") : fmtMoney(displayTotals.market, "USD")}</div>
            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="ml-3 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400"><div>Invested</div><div className="font-medium">{displayCcy === "IDR" ? fmtMoney(displayTotals.invested, "IDR") : fmtMoney(displayTotals.invested, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Market</div><div className="font-medium">{displayCcy === "IDR" ? fmtMoney(displayTotals.market, "IDR") : fmtMoney(displayTotals.market, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Unrealized P&L</div><div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(displayTotals.pnl, "IDR") : fmtMoney(displayTotals.pnl, "USD")} ({displayTotals.pnlPct?.toFixed?.(2) || "0.00"}%)</div></div>
          <div className="flex justify-between text-gray-400"><div>Realized P&L</div><div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(displayTotals.realized, "IDR") : fmtMoney(displayTotals.realized, "USD")}</div></div>
        </div>

        {/* SEARCH & ADD */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search: AAPL, BBCA.JK, BTC, BINANCE:BTCUSDT..." className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol} • ${s.display}` : `${s.symbol} • ${s.display}`}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : "Stock/ETF/FX (Yahoo)"}</div>
                      </div>
                      <div className="text-xs text-gray-400">{s.source === "coingecko" ? "" : ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-full sm:w-28" />
            <div className="flex items-center gap-2">
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg Price" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-28" />
              <select value={avgCcyInput} onChange={(e) => setAvgCcyInput(e.target.value)} className="rounded-md bg-gray-950 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>

            <button onClick={addAsset} className="bg-green-600 hover:bg-green-500 text-black px-4 py-2 rounded font-semibold w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Qty</div></th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg</div></th>
                <th className="text-right py-2 px-3">Market <div className="text-xs text-gray-500">Last</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">No assets — add one above</td></tr>
              ) : rows.map(r => {
                const editing = editingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openTradingView(r)} className="font-semibold text-gray-100 hover:text-green-400">
                          {String(r.symbol || r.displayName || "").replace?.("BINANCE:","")}
                        </button>
                      </div>
                      <div className="text-xs text-gray-500">{r.qty}</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.displayInvested, "IDR") : fmtMoney(r.displayInvested, "USD")}</div>
                      <div className="text-xs text-gray-500">{r.inputCurrency === "IDR" ? fmtMoney(r.avgInput, "IDR") : fmtMoney(r.avgUSD, "USD")}</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className="font-medium">{r.displayPrice != null ? (displayCcy === "IDR" ? fmtMoney(r.displayPrice, "IDR") : fmtMoney(r.displayPrice, "USD")) : "-"}</div>
                      <div className="text-xs text-gray-500">{r.native ? `${r.quoteCcy}` : ""}</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.displayPnl, "IDR") : fmtMoney(r.displayPnl, "USD")}</div>
                      <div className={`text-xs ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(r.id)} className="bg-green-600 px-3 py-1 rounded text-xs font-semibold text-black">Save</button>
                          <button onClick={() => cancelEdit()} className="bg-gray-800 px-3 py-1 rounded text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => beginEdit(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Edit</button>
                          <button onClick={() => buyMore(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Buy</button>
                          <button onClick={() => sellSome(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Sell</button>
                          <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black">Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Donut + legend */}
        {pieItems.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-40 h-40"><Donut items={pieItems} size={140} inner={60} /></div>
            <div>
              {pieItems.map((p, i) => {
                const pct = totals.market > 0 ? (p.value / totals.market) * 100 : 0;
                const color = ["#16a34a","#06b6d4","#f59e0b","#ef4444","#7c3aed","#84cc16"][i % 6];
                return (
                  <div key={p.name} className="flex items-center gap-3 text-sm text-gray-300 mb-2">
                    <div style={{ width: 12, height: 12, background: color }} className="rounded-sm" />
                    <div className="font-semibold text-gray-100">{p.name}</div>
                    <div className="text-gray-400">— {pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}