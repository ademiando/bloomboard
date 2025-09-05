"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Full single-file portfolio dashboard
 *
 * - Search coin/gecko + yahoo search
 * - Polling for prices (coingecko + yahoo)
 * - Display currency IDR / USD (fx via coingecko tether->idr)
 * - Add asset (crypto / saham ID / US)
 * - No spinner; Market/Last column shows price or '-' if unknown
 * - Buy/Sell UI: per-row numeric input (USD), buttons, confirmations
 * - Donut: bright/contrasting colors, central total displayed
 * - Inline edit / delete / persistence via localStorage
 *
 * Notes:
 * - Yahoo endpoints may be blocked by CORS in some environments; if you see CORS errors,
 *   use a small server-side proxy / Next.js API route to fetch Yahoo for the client.
 */

/* ======= CONFIG / ENDPOINTS ======= */
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
const COINGECKO_SEARCH = (q) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_USD_IDR = `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr`;

/* ======= HELPERS ======= */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => (isNaN(Number(v)) ? 0 : Number(v));

function useDebounced(value, delay = 300) {
  const [val, setVal] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setVal(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return val;
}

function fmtMoney(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

// guess currency for yahoo symbol
function guessQuoteCurrency(symbol, yahooCurrency) {
  if (yahooCurrency) return yahooCurrency;
  if (!symbol) return "USD";
  if (symbol.includes(".JK") || symbol.startsWith("IDX:") || symbol.includes("IDR")) return "IDR";
  if (/USDT|USD/i.test(symbol)) return "USD";
  return "USD";
}

// normalize small idr numbers: some APIs return 16.4 meaning 16.4k IDR
function normalizeIdr(v) {
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* ======= Donut component (SVG) - bright colors ======= */
function Donut({ data = [], size = 180, inner = 64 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let start = -90;
  // bright contrasting palette
  const colors = ["#FF6384","#36A2EB","#FFCE56","#4BC0C0","#9966FF","#FF9F40","#FF4444","#00C49F","#2D9CDB","#FF6B6B"];
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
        return <path key={i} d={path} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.06)" strokeWidth="0.6" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ======= Main ======= */
export default function DashboardPage() {
  /* persisted assets */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_final") || "[]");
    } catch { return []; }
  });

  const [realizedUSD, setRealizedUSD] = useState(() => {
    try { if (!isBrowser) return 0; return Number(localStorage.getItem("bb_realized_usd_final") || "0"); } catch { return 0; }
  });

  /* display & FX */
  const [displayCcy, setDisplayCcy] = useState("IDR"); // IDR | USD
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);

  /* live stores */
  const [yahooQuotes, setYahooQuotes] = useState({});
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [lastTick, setLastTick] = useState(null);

  /* search/add panel */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto"); // crypto | id | us
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  /* inline editing */
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});

  /* per-row buy/sell input refs (controlled inputs) */
  const [rowTradeInput, setRowTradeInput] = useState({}); // id -> value string

  /* polling refs for cleanup */
  const pollYahooRef = useRef(null);
  const pollCgRef = useRef(null);
  const pollFxRef = useRef(null);

  /* persist effects */
  useEffect(() => { try { localStorage.setItem("bb_assets_final", JSON.stringify(assets)); } catch (e) {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("bb_realized_usd_final", String(realizedUSD)); } catch (e) {} }, [realizedUSD]);

  /* SEARCH logic - CoinGecko for crypto, Yahoo for stocks - debounced */
  useEffect(() => {
    let cancelled = false;
    if (!debQuery || debQuery.length < 1) { setSuggestions([]); return; }
    const ac = new AbortController();
    (async () => {
      try {
        const q = debQuery;
        if (searchMode === "crypto") {
          const res = await fetch(COINGECKO_SEARCH(q), { signal: ac.signal });
          if (!res.ok) return setSuggestions([]);
          const j = await res.json();
          const cgList = (j?.coins || []).slice(0, 12).map(it => ({ source: "coingecko", coingeckoId: it.id, symbol: it.symbol.toUpperCase(), display: it.name }));
          if (!cancelled) setSuggestions(cgList);
          return;
        }

        // stocks path
        const res = await fetch(YAHOO_SEARCH(q), { signal: ac.signal });
        if (!res.ok) return setSuggestions([]);
        const j = await res.json();
        const list = (j?.quotes || []).slice(0, 30).map(it => ({ source: "yahoo", symbol: it.symbol, display: it.shortname || it.longname || it.symbol, exchange: it.exchange, currency: it.currency }));
        if (searchMode === "id") {
          const filtered = list.filter(x => String(x.symbol).toUpperCase().includes(".JK") || String(x.exchange||"").toUpperCase().includes("JAKARTA") || String(x.exchange||"").toUpperCase().includes("IDX")).slice(0,12);
          if (!cancelled) setSuggestions(filtered);
          return;
        }
        // us/global
        const filtered = list.filter(x => !x.symbol?.endsWith(".JK")).slice(0, 20);
        if (!cancelled) setSuggestions(filtered);
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("search err", e);
        setSuggestions([]);
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [debQuery, searchMode]);

  /* POLL Yahoo quotes every 5s for tracked yahoo symbols */
  useEffect(() => {
    let mounted = true;
    async function pollYahoo() {
      try {
        const symbols = Array.from(new Set(assets.filter(a => a.source === "yahoo").map(a => a.symbol))).slice(0,50);
        if (symbols.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(symbols));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const map = {};
        if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
          j.quoteResponse.result.forEach(q => { if (q && q.symbol) map[q.symbol] = q; });
        }
        setYahooQuotes(prev => ({ ...prev, ...map }));
        // update assets with lastKnownNative + lastUpdated
        setAssets(prev => prev.map(a => {
          if (a.source === "yahoo" && map[a.symbol]) {
            const q = map[a.symbol];
            const lastTime = q.regularMarketTime ? q.regularMarketTime * 1000 : Date.now();
            return { ...a, lastKnownNative: q.regularMarketPrice ?? a.lastKnownNative, lastUpdated: lastTime, meta: { exchange: q.fullExchangeName || q.exchange || a.meta?.exchange } };
          }
          return a;
        }));
        setLastTick(Date.now());
      } catch (e) {
        // ignore
      }
    }
    pollYahoo();
    pollYahooRef.current = setInterval(pollYahoo, 5000);
    return () => { mounted = false; if (pollYahooRef.current) clearInterval(pollYahooRef.current); };
  }, [assets]);

  /* POLL CoinGecko for crypto every 6s */
  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assets.filter(a => a.source === "coingecko" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) return;
        const res = await fetch(COINGECKO_PRICE(ids.join(",")));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setCryptoPrices(prev => ({ ...prev, ...j }));
        setAssets(prev => prev.map(a => {
          if (a.source === "coingecko" && a.coingeckoId && j[a.coingeckoId]) {
            return { ...a, lastKnownNative: j[a.coingeckoId].usd ?? a.lastKnownNative, lastUpdated: Date.now() };
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

  /* FX tether -> IDR every 60s */
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
    pollFxRef.current = setInterval(fetchFx, 60_000);
    return () => { mounted = false; if (pollFxRef.current) clearInterval(pollFxRef.current); };
  }, []);

  /* helper to fetch single yahoo quote (when adding manual symbol) */
  async function fetchYahooQuoteSingle(symbol) {
    try {
      const res = await fetch(YAHOO_QUOTE([symbol]));
      if (!res.ok) return null;
      const j = await res.json();
      if (j?.quoteResponse?.result && j.quoteResponse.result[0]) return j.quoteResponse.result[0];
      return null;
    } catch { return null; }
  }

  /* combine assets with live prices & compute USD-base math */
  const rows = useMemo(() => {
    return assets.map(a => {
      let native = a.lastKnownNative ?? null;
      if (a.source === "yahoo" && yahooQuotes[a.symbol] && yahooQuotes[a.symbol].regularMarketPrice != null) native = yahooQuotes[a.symbol].regularMarketPrice;
      if (a.source === "coingecko" && cryptoPrices[a.coingeckoId] && cryptoPrices[a.coingeckoId].usd != null) native = cryptoPrices[a.coingeckoId].usd;

      const quoteCcy = a.source === "coingecko" ? "USD" : guessQuoteCurrency(a.symbol, yahooQuotes[a.symbol]?.currency);

      // price in USD
      let priceUSD = 0;
      if (a.source === "coingecko") priceUSD = toNum(native);
      else {
        if (quoteCcy === "IDR") priceUSD = toNum(native) / (usdIdr || 1);
        else priceUSD = toNum(native);
      }

      const investedUSD = toNum(a.avgUSD) * toNum(a.qty);
      const marketUSD = priceUSD * toNum(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;

      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;

      return { ...a, native, quoteCcy, priceUSD, investedUSD, marketUSD, pnlUSD, pnlPct, displayPrice, displayInvested, displayMarket, displayPnl };
    });
  }, [assets, yahooQuotes, cryptoPrices, usdIdr, displayCcy]);

  /* totals */
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

  const pie = useMemo(() => rows.map(r => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0), [rows]);

  /* ACTIONS - search select */
  function selectSuggestion(item) {
    setSelected(item);
    setQuery(item.source === "coingecko" ? `${item.symbol} — ${item.display}` : `${item.symbol} — ${item.display}`);
    setSuggestions([]);
  }

  /* add asset (with initial price fetch) */
  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      const typed = query.split("—")[0].trim();
      if (typed) pick = { source: searchMode === "crypto" ? "coingecko" : "yahoo", symbol: typed, display: typed };
    }
    if (!pick) { alert("Pilih asset dari suggestion atau ketik symbol (mis. AAPL, BBCA.JK, BTC)."); return; }
    const q = toNum(qtyInput);
    const a = toNum(avgInput);
    if (q <= 0 || a <= 0) { alert("Qty & Avg harus > 0"); return; }

    const avgUSD = avgCcy === "IDR" ? a / (usdIdr || 1) : a;
    const base = {
      id: Date.now() + Math.random(),
      source: pick.source,
      symbol: pick.source === "coingecko" ? pick.symbol : pick.symbol,
      coingeckoId: pick.source === "coingecko" ? pick.coingeckoId : undefined,
      displayName: pick.display,
      qty: q,
      avgInput: a,
      inputCurrency: avgCcy,
      avgUSD,
      lastKnownNative: undefined,
      lastUpdated: undefined,
      createdAt: Date.now(),
      meta: { type: pick.source === "coingecko" ? "Crypto" : "Stock" },
    };

    // fetch initial price
    if (base.source === "coingecko" && base.coingeckoId) {
      try {
        const res = await fetch(COINGECKO_PRICE(base.coingeckoId));
        if (res.ok) {
          const j = await res.json();
          if (j && j[base.coingeckoId] && typeof j[base.coingeckoId].usd === "number") {
            base.lastKnownNative = j[base.coingeckoId].usd;
            base.lastUpdated = Date.now();
            setCryptoPrices(prev => ({ ...prev, [base.coingeckoId]: j[base.coingeckoId] }));
          }
        }
      } catch {}
    } else if (base.source === "yahoo" && base.symbol) {
      try {
        const qobj = await fetchYahooQuoteSingle(base.symbol);
        if (qobj) {
          base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
          base.lastUpdated = qobj.regularMarketTime ? qobj.regularMarketTime * 1000 : Date.now();
          setYahooQuotes(prev => ({ ...prev, [base.symbol]: qobj }));
        }
      } catch {}
    }

    setAssets(prev => [...prev, base]);
    // reset add form
    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCcy("USD"); setOpenAdd(false);
  }

  /* inline edit */
  function beginEdit(row) {
    setEditingId(row.id);
    setEditFields(prev => ({ ...prev, [row.id]: { qty: String(row.qty), avgInput: String(row.avgInput ?? row.avgUSD ?? ""), inputCurrency: row.inputCurrency || "USD" } }));
  }
  function saveEdit(id) {
    const ef = editFields[id];
    if (!ef) { setEditingId(null); return; }
    const q = toNum(ef.qty); const a = toNum(ef.avgInput); const ccy = ef.inputCurrency || "USD";
    if (q <= 0 || a <= 0) { alert("Qty & Avg harus > 0"); setEditingId(null); return; }
    const avgUSD = ccy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: ccy, avgUSD } : x));
    setEditingId(null);
    setEditFields(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
  }
  function cancelEdit(id) {
    setEditingId(null);
    setEditFields(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
  }

  /* remove asset */
  function removeAsset(id) {
    if (!window.confirm("Delete asset? This will remove it from your portfolio.")) return;
    setAssets(prev => prev.filter(a => a.id !== id));
  }

  /* buy/sell with improved UI handling using controlled inputs */
  function onRowTradeInputChange(id, v) {
    setRowTradeInput(prev => ({ ...prev, [id]: v }));
  }

  function buyFromRow(row) {
    const raw = rowTradeInput[row.id];
    const usd = toNum(raw);
    if (!usd || usd <= 0) { alert("Enter buy amount (USD) > 0"); return; }
    const bpUSD = usd; // USD amount
    const oldQty = toNum(row.qty);
    const addQty = bpUSD / (row.priceUSD || row.avgUSD || 1);
    const newQty = oldQty + addQty;
    const newAvgUSD = ((row.avgUSD || 0) * oldQty + bpUSD) / newQty;
    setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: (row.inputCurrency === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD), inputCurrency: "USD" } : x));
    setRowTradeInput(prev => ({ ...prev, [row.id]: "" }));
  }

  function sellFromRow(row) {
    const raw = rowTradeInput[row.id];
    const usd = toNum(raw);
    if (!usd || usd <= 0) { alert("Enter sell amount (USD) > 0"); return; }
    if (!window.confirm(`Are you sure you want to sell USD ${usd.toFixed(2)} of ${row.symbol || row.displayName}?`)) return;
    const sellQty = usd / (row.priceUSD || row.avgUSD || 1);
    const remain = toNum(row.qty) - sellQty;
    const realized = (row.priceUSD || row.avgUSD || 0) - (row.avgUSD || 0); // per-unit difference
    // realized USD for sold qty:
    const realizedUSDForSale = ( (row.priceUSD || row.avgUSD || 0) - (row.avgUSD || 0) ) * sellQty;
    setRealizedUSD(prev => prev + realizedUSDForSale);
    if (remain <= 0) {
      setAssets(prev => prev.filter(a => a.id !== row.id));
    } else {
      setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: remain } : x));
    }
    setRowTradeInput(prev => ({ ...prev, [row.id]: "" }));
  }

  /* open tradingview */
  function openTradingView(row) {
    let tv = row.symbol;
    if (!tv && row.coingeckoId) { window.open(`https://www.tradingview.com/symbols/${encodeURIComponent(row.coingeckoId)}/`, "_blank"); return; }
    if (tv?.endsWith(".JK")) { const code = tv.replace(".JK",""); tv = `IDX:${code}`; }
    if (!tv.includes(":") && /^[A-Z0-9-_.]{1,10}$/.test(tv)) tv = `NASDAQ:${tv}`;
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  /* UI - render */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Updated: { lastTick ? new Date(lastTick).toLocaleTimeString() : "-" } • USD/IDR ≈{" "}
              <span className="text-emerald-400 font-medium ml-1">{ fxLoading ? "..." : usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-" }</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{ displayCcy === "IDR" ? fmtMoney(displayTotals.market,"IDR") : fmtMoney(displayTotals.market,"USD") }</div>

            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="ml-3 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>

            {/* Add button (white circle) */}
            <button onClick={() => setOpenAdd(v => !v)} title="Add asset" className="ml-3 w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
              <span className="text-black text-xl font-bold">+</span>
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{ displayCcy === "IDR" ? fmtMoney(displayTotals.invested,"IDR") : fmtMoney(displayTotals.invested,"USD") }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{ displayCcy === "IDR" ? fmtMoney(displayTotals.market,"IDR") : fmtMoney(displayTotals.market,"USD") }</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Unrealized P&L</div>
            <div className={`font-semibold ${ displayTotals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              { displayCcy === "IDR" ? fmtMoney(displayTotals.pnl,"IDR") : fmtMoney(displayTotals.pnl,"USD") } ({ displayTotals.pnlPct?.toFixed?.(2) || "0.00" }%)
            </div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${ displayTotals.realized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              { displayCcy === "IDR" ? fmtMoney(displayTotals.realized,"IDR") : fmtMoney(displayTotals.realized,"USD") }
            </div>
          </div>
        </div>

        {/* Add panel */}
        {openAdd && (
          <div className="mt-6 bg-transparent rounded p-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => setSearchMode("crypto")} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""}`}>Crypto</button>
                <button onClick={() => setSearchMode("id")} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""}`}>Saham ID</button>
                <button onClick={() => setSearchMode("us")} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""}`}>US/Global</button>
              </div>
              <div className="text-xs text-gray-400">Mode: <span className="font-medium text-gray-100">{ searchMode.toUpperCase() }</span></div>
            </div>

            <div className="flex gap-3 flex-col sm:flex-row">
              <div className="relative w-full sm:max-w-md">
                <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ETH)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                {suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                    {suggestions.map((s,i) => (
                      <button key={i} onClick={() => selectSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                        <div>
                          <div className="font-medium text-gray-100">{ s.source === "coingecko" ? `${s.symbol} • ${s.display}` : `${s.symbol} • ${s.display}` }</div>
                          <div className="text-xs text-gray-500">{ s.source === "coingecko" ? "Crypto (CoinGecko)" : `Security • ${s.exchange || s.currency || ''}` }</div>
                        </div>
                        <div className="text-xs text-gray-400">{ s.source === "coingecko" ? "CG" : "YH" }</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-28" />
              <div className="flex items-center gap-2">
                <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-28" />
                <select value={avgCcy} onChange={(e) => setAvgCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option>
                  <option value="IDR">IDR</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={addAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add</button>
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
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Qty</div></th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg</div></th>
                <th className="text-right py-2 px-3">Market <div className="text-xs text-gray-500">Last</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : rows.map(r => {
                const editing = editingId === r.id;
                const ef = editFields[r.id] || {};
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-4">
                      <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openTradingView(r)}>{ String(r.symbol || r.displayName || "").replace?.("BINANCE:","") }</div>
                      <div className="text-xs text-gray-400 mt-1">{ r.qty }</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <input className="w-20 rounded bg-gray-900 px-2 py-1 text-right" value={ef.qty} onChange={(e) => setEditFields(prev => ({ ...prev, [r.id]: { ...(prev[r.id]||{}), qty: e.target.value } }))} />
                          <input className="w-28 rounded bg-gray-900 px-2 py-1 text-right" value={ef.avgInput} onChange={(e) => setEditFields(prev => ({ ...prev, [r.id]: { ...(prev[r.id]||{}), avgInput: e.target.value } }))} />
                          <select className="rounded bg-gray-900 px-2 py-1" value={ef.inputCurrency || "USD"} onChange={(e) => setEditFields(prev => ({ ...prev, [r.id]: { ...(prev[r.id]||{}), inputCurrency: e.target.value } }))}>
                            <option value="USD">USD</option>
                            <option value="IDR">IDR</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium">{ displayCcy === "IDR" ? fmtMoney(r.displayInvested,"IDR") : fmtMoney(r.displayInvested,"USD") }</div>
                          <div className="text-xs text-gray-500">{ r.inputCurrency === "IDR" ? fmtMoney(r.avgInput,"IDR") : fmtMoney(r.avgUSD,"USD") }</div>
                        </>
                      )}
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className="font-medium">{ r.displayPrice != null ? ( displayCcy === "IDR" ? fmtMoney(r.displayPrice,"IDR") : fmtMoney(r.displayPrice,"USD") ) : "-" }</div>
                      <div className="text-xs text-gray-500">{ r.native ? `${r.quoteCcy} • ${r.meta?.exchange || r.meta?.type || ''}` : '' }</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className={`font-semibold ${ r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400" }`}>{ displayCcy === "IDR" ? fmtMoney(r.displayPnl,"IDR") : fmtMoney(r.displayPnl,"USD") }</div>
                      <div className={`text-xs ${ r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400" }`}>{ isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%" }</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(r.id)} className="bg-emerald-500 px-3 py-1 rounded text-xs font-semibold text-black">Save</button>
                          <button onClick={() => cancelEdit(r.id)} className="bg-gray-800 px-3 py-1 rounded text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => beginEdit(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Edit</button>

                          {/* Trade input + Buy/Sell */}
                          <div className="flex items-center gap-2">
                            <input
                              value={rowTradeInput[r.id] || ""}
                              onChange={(e) => onRowTradeInputChange(r.id, e.target.value)}
                              placeholder="USD"
                              className="w-20 rounded bg-gray-900 px-2 py-1 text-sm text-right"
                            />
                            <button onClick={() => buyFromRow(r)} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black">Buy</button>
                            <button onClick={() => sellFromRow(r)} className="bg-yellow-600 px-2 py-1 rounded text-xs">Sell</button>
                          </div>

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

        {/* Donut allocation */}
        {pie.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-48 h-48 rounded p-3 flex items-center justify-center relative">
              <Donut data={pie} size={180} inner={64} />
              <div className="absolute flex flex-col items-center" style={{ transform: "translateY(-6px)" }}>
                <div className="text-xs text-gray-400">Total</div>
                <div className="text-sm font-semibold">{ displayCcy === "IDR" ? fmtMoney(displayTotals.market,"IDR") : fmtMoney(displayTotals.market,"USD") }</div>
              </div>
            </div>

            <div>
              {pie.map((p, i) => {
                const pct = totals.market > 0 ? (p.value / totals.market) * 100 : 0;
                const color = ["#FF6384","#36A2EB","#FFCE56","#4BC0C0","#9966FF","#FF9F40"][i % 6];
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