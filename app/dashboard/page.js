"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ========== CONFIG ========== */
const FINNHUB_KEY = (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY)) || "";
const FINNHUB_WS = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const FINNHUB_SEARCH = (q) => `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
const FINNHUB_QUOTE = (sym) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`;
const COINGECKO_SEARCH = (q) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

/* ========== HELPERS ========== */
const isBrowser = typeof window !== "undefined";
const number = (v) => (isNaN(+v) ? 0 : +v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function useDebounced(v, d = 300) {
  const [val, setVal] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setVal(v), d);
    return () => clearTimeout(t);
  }, [v, d]);
  return val;
}
function fmtCurrency(n, ccy = "USD") {
  const v = Number(n || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
}
function normalizeUsdIdr(x) {
  const v = Number(x);
  if (!v) return null;
  if (v < 1000) return Math.round(v * 1000);
  return Math.round(v);
}
function symbolQuoteCurrency(sym) {
  if (!sym) return "USD";
  if (sym.startsWith("IDX:") || sym.includes("IDR")) return "IDR";
  if (sym.toUpperCase().includes("USDT")) return "USD";
  return "USD";
}

/* ========== Donut SVG ========== */
function Donut({ items = [], size = 140 }) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 6;
  let start = -90;
  const colors = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {items.map((it, idx) => {
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
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={idx} d={path} fill={colors[idx % colors.length]} stroke="rgba(0,0,0,0.12)" strokeWidth="0.2" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#070707" />
    </svg>
  );
}

/* ========== MAIN ========== */
export default function DashboardPage() {
  /* Persistent portfolio */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_final") || "[]");
    } catch { return []; }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_final") || "0");
    } catch { return 0; }
  });

  /* UI state */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  /* Realtime stores */
  const [stockPrices, setStockPrices] = useState({}); // keyed by Finnhub symbol
  const [cryptoPricesUSD, setCryptoPricesUSD] = useState({}); // keyed by coin id
  const [lastTick, setLastTick] = useState(null);

  /* Search */
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query, 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  /* Add form */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcyInput, setAvgCcyInput] = useState("USD");

  /* Edit inline */
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [editAvgCcy, setEditAvgCcy] = useState("USD");

  /* WS */
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* Persist */
  useEffect(() => {
    try { localStorage.setItem("bb_assets_final", JSON.stringify(assets)); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("bb_realized_usd_final", String(realizedUSD)); } catch {}
  }, [realizedUSD]);

  /* Search combined (Finnhub + CoinGecko) */
  useEffect(() => {
    let cancelled = false;
    if (!debQuery || debQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const q = debQuery;
        const fhPromise = FINNHUB_KEY ? fetch(FINNHUB_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null);
        const cgPromise = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        const [fh, cg] = await Promise.all([fhPromise, cgPromise]);
        if (cancelled) return;

        const fhList = (fh && Array.isArray(fh.result)) ? fh.result.map(i => ({
          source: "finnhub",
          symbol: i.symbol,
          display: i.description || i.displaySymbol || i.symbol,
        })) : [];

        const cgList = (cg && Array.isArray(cg.coins)) ? cg.coins.map(i => ({
          source: "coingecko",
          coingeckoId: i.id,
          symbol: i.symbol.toUpperCase(),
          display: i.name,
        })) : [];

        // Merge and dedupe (crypto first)
        const merged = [];
        const seen = new Set();
        cgList.forEach(c => { const k = `cg:${c.coingeckoId}`; if (!seen.has(k)) { merged.push(c); seen.add(k); } });
        fhList.forEach(f => { const k = `fh:${f.symbol}`; if (!seen.has(k)) { merged.push(f); seen.add(k); } });

        setSuggestions(merged.slice(0, 12));
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("search error", e);
          setSuggestions([]);
        }
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [debQuery]);

  /* Finnhub WebSocket for ticks & USD/IDR */
  useEffect(() => {
    if (!FINNHUB_WS) return;
    let ws;
    try {
      ws = new WebSocket(FINNHUB_WS);
    } catch (e) {
      console.warn("ws init failed", e);
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
        if (msg.type === "trade" && Array.isArray(msg.data)) {
          let fxCandidate = null;
          const updates = {};
          msg.data.forEach(t => {
            const s = t.s;
            const p = t.p;
            setLastTick(t.ts || Date.now());
            if (s === "OANDA:USD_IDR") {
              const n = Number(p);
              fxCandidate = n < 1000 ? Math.round(n * 1000) : Math.round(n);
            } else {
              updates[s] = p;
            }
          });
          if (Object.keys(updates).length) setStockPrices(prev => ({ ...prev, ...updates }));
          if (fxCandidate) setUsdIdr(prev => (Math.abs(prev - fxCandidate) / fxCandidate > 0.0005 ? fxCandidate : prev));
        }
      } catch (e) {
        console.warn("ws msg parse", e);
      }
    };

    ws.onerror = (e) => { console.warn("ws error", e); };
    ws.onclose = () => { /* no-op */ };

    return () => { try { ws.close(); } catch {} wsRef.current = null; subscribed.current.clear(); };
  }, [/* FINNHUB_WS */]);

  /* ensure ws subscribes newly added finnhub assets */
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    assets.forEach(a => {
      if (a.source === "finnhub" && a.symbol && !subscribed.current.has(a.symbol)) {
        try { ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
      }
    });
  }, [assets]);

  /* Poll CoinGecko for crypto prices (fast) */
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const cgIds = assets.filter(a => a.source === "coingecko" && a.coingeckoId).map(a => a.coingeckoId);
        if (cgIds.length === 0) return;
        const uniq = Array.from(new Set(cgIds)).join(",");
        const res = await fetch(COINGECKO_PRICE(uniq));
        if (!mounted || !res.ok) return;
        const json = await res.json();
        setCryptoPricesUSD(prev => ({ ...prev, ...json }));
      } catch (e) {}
    };
    tick();
    const iid = setInterval(tick, 6000);
    return () => { mounted = false; clearInterval(iid); };
  }, [assets]);

  /* FX fallback (Coingecko tether->idr) */
  useEffect(() => {
    let mounted = true;
    const fetchFx = async () => {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr");
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const idr = j?.tether?.idr ? normalizeUsdIdr(j.tether.idr) : null;
        if (idr) setUsdIdr(prev => (Math.abs(prev - idr) / idr > 0.0005 ? idr : prev));
      } catch (e) {}
    };
    fetchFx();
    const iid = setInterval(fetchFx, 60_000);
    return () => { mounted = false; clearInterval(iid); };
  }, []);

  /* helper fetch initial stock quote */
  async function fetchInitialStock(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      if (typeof j.c === "number") return j.c;
      return null;
    } catch { return null; }
  }

  /* rows computed */
  const rows = useMemo(() => {
    return assets.map(a => {
      let nativeLast = a.lastKnownNative ?? null;
      if (a.source === "finnhub" && stockPrices[a.symbol] != null) nativeLast = stockPrices[a.symbol];
      if (a.source === "coingecko" && cryptoPricesUSD[a.coingeckoId] && cryptoPricesUSD[a.coingeckoId].usd != null) nativeLast = cryptoPricesUSD[a.coingeckoId].usd;

      const quoteCcy = a.source === "coingecko' ? 'USD' : symbolQuoteCurrency(a.symbol);
      // price in USD
      let priceUSD = 0;
      if (a.source === "coingecko") priceUSD = number(nativeLast);
      else {
        const qc = symbolQuoteCurrency(a.symbol);
        if (qc === "IDR") priceUSD = number(nativeLast) / (usdIdr || 1);
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
    const pct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pct };
  }, [rows]);

  const displayTotals = {
    invested: displayCcy === "IDR" ? totals.invested * (usdIdr || 1) : totals.invested,
    market: displayCcy === "IDR" ? totals.market * (usdIdr || 1) : totals.market,
    pnl: displayCcy === "IDR" ? totals.pnl * (usdIdr || 1) : totals.pnl,
    pct: totals.pct,
    realized: displayCcy === "IDR" ? realizedUSD * (usdIdr || 1) : realizedUSD,
  };

  /* pie items */
  const pieItems = useMemo(() => rows.map(r => ({ name: r.symbol || r.displayName, value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0), [rows]);

  /* ACTIONS: select suggestion, add, edit, buy, sell, delete */
  function selectSuggestion(item) {
    setSelected(item);
    if (item.source === "coingecko") setQuery(`${item.symbol.toUpperCase()} — ${item.display}`);
    else setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]);
  }

  async function addAsset() {
    // require selection (prefer) or allow typed finnhub symbol
    let pick = selected;
    if (!pick && query.trim()) {
      // allow manual symbol if contains ":" or uppercase letters
      if (query.includes(":")) pick = { source: "finnhub", symbol: query.trim(), display: query.trim() };
    }
    if (!pick) { alert("Please choose an asset from suggestions"); return; }
    const qty = number(qtyInput);
    const avg = number(avgInput);
    if (qty <= 0 || avg <= 0) { alert("Qty and Avg must be > 0"); return; }

    const avgUSD = avgCcyInput === "IDR" ? avg / (usdIdr || 1) : avg;
    const base = {
      id: Date.now(),
      source: pick.source,
      symbol: pick.symbol || pick.coingeckoId,
      displayName: pick.display || pick.name || pick.symbol,
      coingeckoId: pick.coingeckoId || undefined,
      qty,
      avgInput: avg,
      inputCurrency: avgCcyInput,
      avgUSD,
      lastKnownNative: undefined,
      createdAt: Date.now(),
    };

    if (base.source === "coingecko" && base.coingeckoId) {
      // fetch initial cg price
      try {
        const res = await fetch(COINGECKO_PRICE(base.coingeckoId));
        if (res.ok) {
          const j = await res.json();
          if (j && j[base.coingeckoId] && typeof j[base.coingeckoId].usd === "number") {
            base.lastKnownNative = j[base.coingeckoId].usd;
            setCryptoPricesUSD(prev => ({ ...prev, [base.coingeckoId]: { usd: j[base.coingeckoId].usd } }));
          }
        }
      } catch {}
    } else if (base.source === "finnhub" && base.symbol) {
      try {
        const val = await fetchInitialQuote(base.symbol);
        if (val != null) {
          base.lastKnownNative = val;
          setStockPrices(prev => ({ ...prev, [base.symbol]: val }));
        }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // subscribe WS if possible
    try {
      if (base.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "subscribe", symbol: base.symbol }));
        subscribed.current.add(base.symbol);
      }
    } catch {}

    // reset
    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCcyInput("USD");
  }

  async function fetchInitialQuote(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      if (typeof j.c === "number") return j.c;
      return null;
    } catch { return null; }
  }

  function beginEdit(row) {
    setEditingId(row.id);
    setEditQty(String(row.qty));
    setEditAvg(String(row.avgInput || row.avgUSD || ""));
    setEditAvgCcy(row.inputCurrency || "USD");
  }
  function saveEdit(id) {
    const q = number(editQty);
    const a = number(editAvg);
    if (q <= 0 || a <= 0) { setEditingId(null); return; }
    const avgUSD = editAvgCcy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: editAvgCcy, avgUSD } : x));
    setEditingId(null);
  }
  function cancelEdit() { setEditingId(null); }

  function removeAsset(id) {
    const target = assets.find(a => a.id === id);
    setAssets(prev => prev.filter(a => a.id !== id));
    if (target && target.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
      try { wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: target.symbol })); subscribed.current.delete(target.symbol); } catch {}
    }
  }

  function buyMore(row) {
    const qtyStr = prompt(`Buy qty for ${row.symbol || row.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${row.inputCurrency || "USD"}):`, String(row.avgInput || ""));
    const ccy = prompt("Currency (USD/IDR):", row.inputCurrency || "USD");
    const bq = number(qtyStr);
    const bp = number(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = row.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (row.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: newAvgUSD * (row.inputCurrency === "IDR" ? usdIdr : 1), inputCurrency: curr } : x));
  }

  function sellSome(row) {
    const qtyStr = prompt(`Sell qty for ${row.symbol || row.displayName}:`, "0");
    const sq = number(qtyStr);
    if (sq <= 0 || sq > row.qty) return;
    const priceUSD = row.priceUSD ?? row.avgUSD ?? 0;
    const realized = (priceUSD - row.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = row.qty - sq;
    if (remain <= 0) removeAsset(row.id);
    else setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: remain } : x));
  }

  async function fetchInitialQuote(sym) {
    return await fetchInitialQuoteInner(sym);
  }
  async function fetchInitialQuoteInner(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      if (typeof j.c === "number") return j.c;
      return null;
    } catch { return null; }
  }

  /* UI layout like stockbit row: compact, qty line below symbol, invested/avg smaller on second line */
  return (
    <div className="min-h-screen bg-black text-gray-200">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Live tick: {lastTick ? new Date(lastTick).toLocaleTimeString() : "-"} • FX USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{displayCcy === "IDR" ? fmtCurrency(displayTotals.market, "IDR") : fmtCurrency(displayTotals.market, "USD")}</div>
            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* KPI Bar */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(displayTotals.invested, "IDR") : fmtCurrency(displayTotals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(displayTotals.market, "IDR") : fmtCurrency(displayTotals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Unrealized P&L</div>
            <div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(displayTotals.pnl, "IDR") : fmtCurrency(displayTotals.pnl, "USD")} ({displayTotals.pct?.toFixed?.(2) || "0.00"}%)</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(displayTotals.realized, "IDR") : fmtCurrency(displayTotals.realized, "USD")}</div>
          </div>
        </div>

        {/* Search + Add */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search symbol e.g. AAPL, IDX:BBCA, BTC" className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              {suggestions.length > 0 && (
                <div className="absolute z-40 mt-1 w-full max-h-56 overflow-auto rounded border border-gray-800 bg-gray-950">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full text-left px-3 py-2 hover:bg-gray-900 flex justify-between items-center">
                      <div className="flex flex-col text-left">
                        <span className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol.toUpperCase()} • ${s.display}` : `${s.symbol} • ${s.display}`}</span>
                        <span className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : "Stock/FX"}</span>
                      </div>
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
            <button onClick={addAsset} className="bg-green-600 hover:bg-green-500 text-black font-semibold px-4 py-2 rounded w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* Table header like stockbit */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-3 px-3">Code <div className="text-xs text-gray-500">Qty</div></th>
                <th className="text-right py-3 px-3">Invested <div className="text-xs text-gray-500">Avg Price</div></th>
                <th className="text-right py-3 px-3">Market <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-3 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-3 px-3"></th>
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
                      <div className="font-semibold text-gray-100">{r.symbol?.replace?.("BINANCE:","") || r.displayName}</div>
                      <div className="text-xs text-gray-500">{(isEditing ? editQty : (r.qty || 0))} {r.source === "finnhub" && r.symbol && r.symbol.startsWith("IDX:") ? "Lot?" : ""}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(r.displayInvested, "IDR") : fmtCurrency(r.displayInvested, "USD")}</div>
                      <div className="text-xs text-gray-500">{r.inputCurrency === "IDR" ? fmtCurrency(r.avgInput, "IDR") : fmtCurrency(r.avgUSD, "USD")}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className="font-medium">{r.displayPrice != null ? (displayCcy === "IDR" ? fmtCurrency(r.displayPrice, "IDR") : fmtCurrency(r.displayPrice, "USD")) : "-"}</div>
                      <div className="text-xs text-gray-500">{r.nativeLast ? (r.quoteCcy || symbolQuoteCurrency(r.symbol)) : ""}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(r.displayPnl, "IDR") : fmtCurrency(r.displayPnl, "USD")}</div>
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
        {pieItems.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row gap-6">
            <div className="w-40 h-40"><Donut items={pieItems} size={140} /></div>
            <div className="flex flex-col gap-2">
              {pieItems.map((p, i) => {
                const pct = totals.market > 0 ? (p.value / totals.market) * 100 : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3 text-sm text-gray-300">
                    <div style={{ width: 12, height: 12, background: ["#16a34a","#06b6d4","#f59e0b","#ef4444","#7c3aed","#84cc16"][i % 6] }} className="rounded-sm" />
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