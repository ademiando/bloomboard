"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ================== CONFIG ================== */
const FINNHUB_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY
    : "";
const FINNHUB_WS = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const FINNHUB_SEARCH = (q) =>
  `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
const FINNHUB_QUOTE = (symbol) =>
  `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
const COINGECKO_SEARCH = (q) =>
  `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids, vs = "usd") =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`;

/* ================== HELPERS ================== */
const isBrowser = typeof window !== "undefined";
const number = (v) => (isNaN(+v) ? 0 : +v);

function useDebounced(value, delay = 300) {
  const [val, setVal] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setVal(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return val;
}

function fmt(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* Guess quote currency from symbol */
function symbolToQuoteCurrency(symbol) {
  if (!symbol) return "USD";
  if (typeof symbol === "string" && (symbol.startsWith("IDX:") || symbol.includes("IDR"))) return "IDR";
  if (typeof symbol === "string" && symbol.toUpperCase().includes("USDT")) return "USD";
  return "USD";
}

/* Convert "maybe small" FX to large (safety): if value < 1000 it might be 16.4 => 16400 */
function normalizeUsdIdr(v) {
  const n = Number(v);
  if (!n || Number.isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* ================== SVG DONUT ================== */
function Donut({ data = [], size = 140, inner = 62 }) {
  const total = data.reduce((s, i) => s + Math.max(0, i.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  let start = -90;
  const colors = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, idx) => {
        const portion = Math.max(0, d.value || 0) / total;
        const angle = portion * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sRad = (Math.PI * start) / 180;
        const eRad = (Math.PI * end) / 180;
        const x1 = cx + r * Math.cos(sRad);
        const y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad);
        const y2 = cy + r * Math.sin(eRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={idx} d={path} fill={colors[idx % colors.length]} stroke="rgba(0,0,0,0.12)" strokeWidth="0.2" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ================== MAIN COMPONENT ================== */
export default function DashboardPage() {
  /* Persisted state */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_v3") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_v3") || "0");
    } catch {
      return 0;
    }
  });

  /* UI state */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  /* realtime stores */
  const [stockPrices, setStockPrices] = useState({}); // { 'NASDAQ:NVDA': 410.12 }
  const [cryptoPricesUSD, setCryptoPricesUSD] = useState({}); // { 'bitcoin': { usd: 41000 } }
  const [lastTickTs, setLastTickTs] = useState(null);

  /* search */
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  /* add form */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCurrencyInput, setAvgCurrencyInput] = useState("USD");

  /* inline edit */
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvgInput, setEditAvgInput] = useState("");
  const [editAvgCurrency, setEditAvgCurrency] = useState("USD");

  /* ws ref & subscribed */
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* persist effects */
  useEffect(() => {
    try { localStorage.setItem("bb_assets_v3", JSON.stringify(assets)); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("bb_realized_usd_v3", String(realizedUSD)); } catch {}
  }, [realizedUSD]);

  /* ================== SEARCH (Finnhub + CoinGecko) ================== */
  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        const q = debouncedQuery;
        const fhPromise = FINNHUB_KEY
          ? fetch(FINNHUB_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null);
        const cgPromise = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);

        const [fh, cg] = await Promise.all([fhPromise, cgPromise]);
        if (cancelled) return;

        const fhList = (fh && fh.result && Array.isArray(fh.result))
          ? fh.result.slice(0, 10).map(item => ({ source: "finnhub", symbol: item.symbol, display: item.description || item.displaySymbol || item.symbol }))
          : [];

        const cgCoins = (cg && cg.coins && Array.isArray(cg.coins))
          ? cg.coins.slice(0, 10).map(item => ({ source: "coingecko", coingeckoId: item.id, symbol: item.symbol.toUpperCase(), display: item.name, market: item.market_cap_rank }))
          : [];

        const merged = [];
        const seen = new Set();
        cgCoins.forEach(c => {
          const key = `cg:${c.coingeckoId}`;
          if (!seen.has(key)) { merged.push(c); seen.add(key); }
        });
        fhList.forEach(f => {
          const key = `fh:${f.symbol}`;
          if (!seen.has(key)) { merged.push(f); seen.add(key); }
        });

        setSuggestions(merged.slice(0, 12));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Search error", err);
        setSuggestions([]);
      }
    })();

    return () => { cancelled = true; ac.abort(); };
  }, [debouncedQuery]);

  /* ================== FINNHUB WS (stocks + FX) ================== */
  useEffect(() => {
    if (!FINNHUB_WS) {
      return;
    }
    let ws;
    try {
      ws = new WebSocket(FINNHUB_WS);
    } catch (e) {
      console.warn("WS init failed", e);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: "subscribe", symbol: "OANDA:USD_IDR" }));
        subscribed.current.add("OANDA:USD_IDR");
      } catch {}
      // subscribe existing finnhub symbols
      assets.forEach(a => {
        if (a.source === "finnhub" && a.symbol) {
          try { ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
        }
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg) return;
        if (msg.type === "trade" && Array.isArray(msg.data)) {
          let fxCandidate = null;
          const updates = {};
          msg.data.forEach(t => {
            const s = t.s;
            const p = t.p;
            if (s === "OANDA:USD_IDR") {
              const maybe = normalizeUsdIdr(p);
              fxCandidate = maybe;
            } else {
              updates[s] = p;
            }
            setLastTickTs(t.ts || Date.now());
          });
          if (Object.keys(updates).length) setStockPrices(prev => ({ ...prev, ...updates }));
          if (fxCandidate != null) setUsdIdr(prev => {
            if (!prev || Math.abs(prev - fxCandidate) / fxCandidate > 0.0005) return fxCandidate;
            return prev;
          });
        }
      } catch (e) {
        console.error("WS msg parse", e);
      }
    };

    ws.onerror = (e) => { console.warn("ws error", e); };
    ws.onclose = () => { /* no-op */ };

    return () => { try { ws.close(); } catch {} wsRef.current = null; subscribed.current.clear(); };
  }, []);

  /* subscribe newly added finnhub assets when ws ready */
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    assets.forEach(a => {
      if (a.source === "finnhub" && a.symbol && !subscribed.current.has(a.symbol)) {
        try { ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
      }
    });
  }, [assets]);

  /* ================== COINGECKO POLLING for crypto prices (every 6s) ================== */
  useEffect(() => {
    let mounted = true;
    let tickId = null;
    async function fetchPrices() {
      try {
        const cgIds = assets.filter(a => a.source === "coingecko" && a.coingeckoId).map(a => a.coingeckoId);
        if (cgIds.length === 0) return;
        const uniq = Array.from(new Set(cgIds)).join(",");
        const url = COINGECKO_PRICE(uniq, "usd");
        const res = await fetch(url);
        if (!mounted || !res.ok) return;
        const json = await res.json();
        setCryptoPricesUSD(prev => ({ ...prev, ...json }));
      } catch (e) {
        // ignore
      }
    }
    fetchPrices();
    tickId = setInterval(fetchPrices, 6000);
    return () => { mounted = false; if (tickId) clearInterval(tickId); };
  }, [assets]);

  /* fallback FX fetch (Coingecko tether->IDR) every minute if ws hasn't updated */
  useEffect(() => {
    let mounted = true;
    let iid = null;
    async function fetchFx() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr");
        if (!mounted || !res.ok) return;
        const json = await res.json();
        const idr = json?.tether?.idr ? normalizeUsdIdr(json.tether.idr) : null;
        if (idr) {
          setUsdIdr(prev => {
            if (!prev || Math.abs(prev - idr) / idr > 0.0005) return idr;
            return prev;
          });
        }
      } catch (e) {}
    }
    fetchFx();
    iid = setInterval(fetchFx, 60_000);
    return () => { mounted = false; if (iid) clearInterval(iid); };
  }, []);

  /* ================== helper: initial stock quote fetch ================== */
  async function fetchInitialStockQuote(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      if (typeof j.c === "number") return j.c;
      return null;
    } catch {
      return null;
    }
  }

  /* ================== COMPUTATIONS ================== */
  const rows = useMemo(() => {
    return assets.map(a => {
      let nativeLast = a.lastKnownNative ?? null;
      if (a.source === "finnhub" && stockPrices[a.symbol] != null) nativeLast = stockPrices[a.symbol];
      if (a.source === "coingecko" && cryptoPricesUSD[a.coingeckoId] && cryptoPricesUSD[a.coingeckoId].usd != null) nativeLast = cryptoPricesUSD[a.coingeckoId].usd;

      const quoteCcy = a.source === "coingecko" ? "USD" : symbolToQuoteCurrency(a.symbol);
      let priceUSD = 0;
      if (a.source === "coingecko") {
        priceUSD = number(nativeLast);
      } else {
        if (quoteCcy === "IDR") priceUSD = number(nativeLast) / (usdIdr || 1);
        else priceUSD = number(nativeLast);
      }

      const investedUSD = number(a.avgUSD) * number(a.qty);
      const marketUSD = priceUSD * number(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;

      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;

      return { ...a, nativeLast, quoteCcy, priceUSD, investedUSD, marketUSD, pnlUSD, pnlPct, displayPrice, displayInvested, displayMarket, displayPnl };
    });
  }, [assets, stockPrices, cryptoPricesUSD, usdIdr, displayCcy]);

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

  const pieData = useMemo(() => rows.map(r => ({ name: r.symbol || r.displayName, value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0), [rows]);

  /* ================== ACTIONS ================== */
  function onSelectSuggestion(item) {
    setSelected(item);
    if (item.source === "coingecko") setQuery(`${item.symbol.toUpperCase()} — ${item.display}`);
    else setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]);
  }

  async function onAddAsset() {
    let picked = selected;
    if (!picked && query) {
      picked = query.includes(":") ? { source: "finnhub", symbol: query.trim(), display: query.trim() } : null;
    }
    if (!picked) { alert("Please choose an asset from the suggestions."); return; }
    const q = number(qtyInput);
    const a = number(avgInput);
    if (q <= 0 || a <= 0) { alert("Qty and Avg price must be > 0"); return; }

    const avgUSD = avgCurrencyInput === "IDR" ? a / (usdIdr || 1) : a;

    const base = { id: Date.now(), source: picked.source, createdAt: Date.now(), qty: q, avgInput: a, inputCurrency: avgCurrencyInput, avgUSD, lastKnownNative: undefined, displayName: picked.display || picked.name || "" };

    if (picked.source === "coingecko") {
      base.coingeckoId = picked.coingeckoId;
      base.symbol = picked.symbol.toUpperCase();
      try {
        const res = await fetch(COINGECKO_PRICE(picked.coingeckoId, "usd"));
        if (res.ok) {
          const j = await res.json();
          if (j && j[picked.coingeckoId] && typeof j[picked.coingeckoId].usd === "number") {
            base.lastKnownNative = j[picked.coingeckoId].usd;
            setCryptoPricesUSD(prev => ({ ...prev, [picked.coingeckoId]: { usd: j[picked.coingeckoId].usd } }));
          }
        }
      } catch {}
    } else {
      base.symbol = picked.symbol;
      try {
        const p = await fetchInitialStockQuote(picked.symbol);
        if (p != null) { base.lastKnownNative = p; setStockPrices(prev => ({ ...prev, [picked.symbol]: p })); }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // subscribe ws if finnhub
    try { if (base.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) { wsRef.current.send(JSON.stringify({ type: "subscribe", symbol: base.symbol })); subscribed.current.add(base.symbol); } } catch {}

    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCurrencyInput("USD");
  }

  function beginEdit(a) {
    setEditingId(a.id);
    setEditQty(String(a.qty));
    setEditAvgInput(String(a.avgInput || a.avgUSD || ""));
    setEditAvgCurrency(a.inputCurrency || "USD");
  }

  function saveEdit(id) {
    const q = number(editQty);
    const a = number(editAvgInput);
    if (q <= 0 || a <= 0) { setEditingId(null); return; }
    const avgUSD = editAvgCurrency === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: editAvgCurrency, avgUSD } : x));
    setEditingId(null);
  }

  function removeAsset(id) {
    const target = assets.find(a => a.id === id);
    setAssets(prev => prev.filter(a => a.id !== id));
    if (target && target.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
      try { wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: target.symbol })); subscribed.current.delete(target.symbol); } catch {}
    }
  }

  function buyMore(a) {
    const qtyStr = prompt(`Buy qty for ${a.symbol || a.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${a.inputCurrency || "USD"}):`, String(a.avgInput || ""));
    const ccy = prompt("Currency of price (USD/IDR):", a.inputCurrency || "USD");
    const bq = number(qtyStr);
    const bp = number(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = a.qty;
    const newQtyVal = oldQty + bq;
    const newAvgUSD = (a.avgUSD * oldQty + bpUSD * bq) / newQtyVal;
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: newQtyVal, avgUSD: newAvgUSD, avgInput: (newAvgUSD * (usdIdr || 1)), inputCurrency: curr } : x));
  }

  function sellSome(a) {
    const qtyStr = prompt(`Sell qty for ${a.symbol || a.displayName}:`, "0");
    const sq = number(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = a.qty - sq;
    if (remain <= 0) removeAsset(a.id);
    else setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: remain } : x));
  }

  /* ================== RENDER UI ================== */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Live tick: {lastTickTs ? new Date(lastTickTs).toLocaleTimeString() : "-"} • FX USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">
              {displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}
            </div>
            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="ml-3 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* KPI Row */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.invested, "IDR") : fmt(displayTotals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Unrealized P&L</div>
            <div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(displayTotals.pnl, "IDR") : fmt(displayTotals.pnl, "USD")} ({displayTotals.pnlPct?.toFixed?.(2) || "0.00"}%)</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(displayTotals.realized, "IDR") : fmt(displayTotals.realized, "USD")}</div>
          </div>
        </div>

        {/* Search + Add */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search: AAPL, BINANCE:BTCUSDT, IDX:BBCA, BTC..." className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              {suggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-gray-950 border border-gray-800 rounded overflow-auto max-h-56">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => onSelectSuggestion(s)} className="w-full text-left px-3 py-2 hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol.toUpperCase()} • ${s.display}` : `${s.symbol} • ${s.display}`}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : "Stock/FX (Finnhub)"}</div>
                      </div>
                      <div className="text-xs text-gray-400">{s.source === "coingecko" ? `#${s.market || "-"}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty / Lot" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-full sm:w-36" />
            <div className="flex items-center gap-2">
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg Price" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-36" />
              <select value={avgCurrencyInput} onChange={(e) => setAvgCurrencyInput(e.target.value)} className="rounded-md bg-gray-950 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>

            <button onClick={onAddAsset} className="bg-green-600 hover:bg-green-500 text-black font-semibold px-4 py-2 rounded w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* Compact Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Qty</div></th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg Price</div></th>
                <th className="text-right py-2 px-3">Market <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">No assets. Add one above.</td></tr>
              ) : rows.map(r => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-4">
                      <div className="font-semibold text-gray-100">{(r.symbol || r.displayName || "").replace?.("BINANCE:","")}</div>
                      <div className="text-xs text-gray-500">{isEditing ? editQty : (r.qty || 0)}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className="font-medium">{displayCcy === "IDR" ? fmt(r.displayInvested, "IDR") : fmt(r.displayInvested, "USD")}</div>
                      <div className="text-xs text-gray-500">{r.inputCurrency === "IDR" ? fmt(r.avgInput, "IDR") : fmt(r.avgUSD, "USD")}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className="font-medium">{r.displayPrice != null ? (displayCcy === "IDR" ? fmt(r.displayPrice, "IDR") : fmt(r.displayPrice, "USD")) : "-"}</div>
                      <div className="text-xs text-gray-500">{r.nativeLast ? (r.quoteCcy || symbolToQuoteCurrency(r.symbol)) : ""}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(r.displayPnl, "IDR") : fmt(r.displayPnl, "USD")}</div>
                      <div className={`text-xs ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => beginEdit(r)} className="text-xs bg-gray-800 px-2 py-1 rounded">Edit</button>
                        <button onClick={() => buyMore(r)} className="text-xs bg-gray-800 px-2 py-1 rounded">Buy</button>
                        <button onClick={() => sellSome(r)} className="text-xs bg-gray-800 px-2 py-1 rounded">Sell</button>
                        <button onClick={() => removeAsset(r.id)} className="text-xs bg-red-600 px-2 py-1 rounded font-semibold text-black">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Donut + legend */}
        {pieData.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-40 h-40"><Donut data={pieData} size={140} inner={60} /></div>
            <div>
              {pieData.map((p, i) => {
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