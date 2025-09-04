"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 Final single-file dashboard:
 - Finnhub (stocks/FX WS + search) + CoinGecko (crypto search + price polling)
 - Realtime-ish prices (WS for Finnhub ticks, polling for CoinGecko)
 - Add/Edit/Delete/Buy/Sell, localStorage persistence
 - Dark, compact UI like screenshots; donut allocation; responsive
 - Fixes: edit clickable, currency dropdown applies everywhere, scrollable search
*/

/* ===== CONFIG ===== */
const FINNHUB_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY || ""
    : "";
const FINNHUB_WS = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const FINNHUB_SEARCH = (q) => `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
const FINNHUB_QUOTE = (sym) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`;
const COINGECKO_SEARCH = (q) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids, vs = "usd") =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=${vs}`;

/* ===== Helpers ===== */
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

function fmtCurrency(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function symbolQuoteCurrency(symbol) {
  if (!symbol) return "USD";
  if (typeof symbol === "string" && (symbol.startsWith("IDX:") || symbol.includes("IDR"))) return "IDR";
  if (typeof symbol === "string" && /USDT|USD/i.test(symbol)) return "USD";
  return "USD";
}

function normalizeUsdIdr(v) {
  const n = Number(v);
  if (!n || Number.isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* ===== Donut SVG ===== */
function Donut({ items = [], size = 140, inner = 60 }) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
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
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={idx} d={d} fill={colors[idx % colors.length]} stroke="rgba(0,0,0,0.08)" strokeWidth="0.3" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ===== MAIN PAGE ===== */
export default function DashboardPage() {
  /* persisted */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_final_v4") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_final_v4") || "0");
    } catch {
      return 0;
    }
  });

  /* UI + rates */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  /* realtime stores */
  const [stockPrices, setStockPrices] = useState({}); // key: finnhub symbol -> price (native quote)
  const [cryptoPricesUSD, setCryptoPricesUSD] = useState({}); // key: coingecko id -> {usd: ...}
  const [lastTickTs, setLastTickTs] = useState(null);

  /* search */
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query, 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [finnhubAvailable, setFinnhubAvailable] = useState(Boolean(FINNHUB_KEY));

  /* add/edit inputs */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcyInput, setAvgCcyInput] = useState("USD");

  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [editAvgCcy, setEditAvgCcy] = useState("USD");

  /* ws & subs */
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* persist effects */
  useEffect(() => { try { localStorage.setItem("bb_assets_final_v4", JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("bb_realized_usd_final_v4", String(realizedUSD)); } catch {} }, [realizedUSD]);

  /* ---- SEARCH: FINNHUB + COINGECKO ---- */
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
        // finnHub (if available) + coingecko in parallel
        const fhPromise = FINNHUB_KEY
          ? fetch(FINNHUB_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
          : Promise.resolve(null);
        const cgPromise = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);

        const [fh, cg] = await Promise.all([fhPromise, cgPromise]);
        if (cancelled) return;

        // Prepare lists
        const fhList = fh && Array.isArray(fh.result) ? fh.result.slice(0, 10).map(i => ({
          source: "finnhub",
          symbol: i.symbol,
          display: i.description || i.displaySymbol || i.symbol,
        })) : [];

        const cgList = cg && Array.isArray(cg.coins) ? cg.coins.slice(0, 10).map(i => ({
          source: "coingecko",
          coingeckoId: i.id,
          symbol: i.symbol.toUpperCase(),
          display: i.name,
        })) : [];

        // merge: coins first (crypto often desired), then fh
        const merged = [];
        const seen = new Set();
        cgList.forEach(c => { const k = `cg:${c.coingeckoId}`; if (!seen.has(k)) { merged.push(c); seen.add(k); }});
        fhList.forEach(f => { const k = `fh:${f.symbol}`; if (!seen.has(k)) { merged.push(f); seen.add(k); }});

        setSuggestions(merged.slice(0, 12));
        setFinnhubAvailable(Boolean(FINNHUB_KEY && fh));
      } catch (e) {
        if (e.name === "AbortError") return;
        console.warn("search error", e);
        setSuggestions([]);
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [debQuery]);

  /* ---- FINNHUB WS: subscribe ticks + USD_IDR ---- */
  useEffect(() => {
    if (!FINNHUB_WS) return; // no key -> skip WS
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
      // subscribe existing
      assets.forEach(a => {
        if (a.source === "finnhub" && a.symbol) {
          try { ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
        }
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "trade" && Array.isArray(msg.data)) {
          const updates = {};
          let fxCandidate = null;
          msg.data.forEach(t => {
            if (!t) return;
            const s = t.s;
            const p = t.p;
            if (s === "OANDA:USD_IDR") {
              fxCandidate = normalizeUsdIdr(p);
            } else {
              updates[s] = p;
            }
            setLastTickTs(t.ts || Date.now());
          });
          if (Object.keys(updates).length) setStockPrices(prev => ({ ...prev, ...updates }));
          if (fxCandidate) setUsdIdr(prev => {
            if (!prev || Math.abs(prev - fxCandidate) / fxCandidate > 0.0005) return fxCandidate;
            return prev;
          });
        }
      } catch (e) {
        console.warn("ws parse err", e);
      }
    };
    ws.onerror = (e) => console.warn("ws err", e);
    ws.onclose = () => {/*noop*/};

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

  /* ---- COINGECKO polling for crypto (6s) ---- */
  useEffect(() => {
    let mounted = true;
    let iid = null;
    async function fetchCG() {
      try {
        const ids = assets.filter(a => a.source === "coingecko" && a.coingeckoId).map(a => a.coingeckoId);
        if (ids.length === 0) return;
        const uniq = Array.from(new Set(ids)).join(",");
        const res = await fetch(COINGECKO_PRICE(uniq, "usd"));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setCryptoPricesUSD(prev => ({ ...prev, ...j }));
      } catch (e) {}
    }
    fetchCG();
    iid = setInterval(fetchCG, 6000);
    return () => { mounted = false; if (iid) clearInterval(iid); };
  }, [assets]);

  /* ---- FX fallback via Coingecko every 60s ---- */
  useEffect(() => {
    let mounted = true;
    let iid = null;
    async function fetchFx() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr");
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const idr = j?.tether?.idr ? normalizeUsdIdr(j.tether.idr) : null;
        if (idr) setUsdIdr(prev => (!prev || Math.abs(prev - idr) / idr > 0.0005 ? idr : prev));
      } catch (e) {}
    }
    fetchFx();
    iid = setInterval(fetchFx, 60_000);
    return () => { mounted = false; if (iid) clearInterval(iid); };
  }, []);

  /* helper: initial quote fetch for finnhub symbol */
  async function fetchFinnhubQuote(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      if (typeof j.c === "number") return j.c;
      return null;
    } catch { return null; }
  }

  /* ---- COMPUTE rows & totals (USD base for math) ---- */
  const rows = useMemo(() => {
    return assets.map(a => {
      let nativeLast = a.lastKnownNative ?? null;
      if (a.source === "finnhub" && stockPrices[a.symbol] != null) nativeLast = stockPrices[a.symbol];
      if (a.source === "coingecko" && cryptoPricesUSD[a.coingeckoId] && cryptoPricesUSD[a.coingeckoId].usd != null) nativeLast = cryptoPricesUSD[a.coingeckoId].usd;

      const quoteCcy = a.source === "coingecko" ? "USD" : symbolQuoteCurrency(a.symbol);
      let priceUSD = 0;
      if (a.source === "coingecko") priceUSD = number(nativeLast);
      else {
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

  const pieData = useMemo(() =>
    rows.map(r => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0),
  [rows]);

  /* ===== ACTIONS: select suggestion, add, edit, buy, sell, delete ===== */
  function selectSuggestion(item) {
    setSelected(item);
    if (item.source === "coingecko") setQuery(`${item.symbol.toUpperCase()} — ${item.display}`);
    else setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]); // hide
  }

  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      // if typed symbol with colon, treat as finnhub symbol (manual)
      if (query.includes(":")) pick = { source: "finnhub", symbol: query.trim(), display: query.trim() };
    }
    if (!pick) {
      alert("Pilih asset dari suggestions (atau ketik symbol lengkap, mis. IDX:BBCA).");
      return;
    }
    const q = number(qtyInput);
    const a = number(avgInput);
    if (q <= 0 || a <= 0) { alert("Qty & Avg harus > 0"); return; }

    const avgUSD = avgCcyInput === "IDR" ? a / (usdIdr || 1) : a;
    const base = { id: Date.now(), source: pick.source, createdAt: Date.now(), qty: q, avgInput: a, inputCurrency: avgCcyInput, avgUSD, lastKnownNative: undefined, displayName: pick.display || pick.name || "" };

    if (pick.source === "coingecko") {
      base.coingeckoId = pick.coingeckoId;
      base.symbol = pick.symbol.toUpperCase();
      try {
        const res = await fetch(COINGECKO_PRICE(pick.coingeckoId, "usd"));
        if (res.ok) {
          const j = await res.json();
          if (j && j[pick.coingeckoId] && typeof j[pick.coingeckoId].usd === "number") {
            base.lastKnownNative = j[pick.coingeckoId].usd;
            setCryptoPricesUSD(prev => ({ ...prev, [pick.coingeckoId]: { usd: j[pick.coingeckoId].usd } }));
          }
        }
      } catch {}
    } else {
      base.symbol = pick.symbol;
      try {
        const p = await fetchFinnhubQuote(pick.symbol);
        if (p != null) { base.lastKnownNative = p; setStockPrices(prev => ({ ...prev, [pick.symbol]: p })); }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // subscribe ws if finnhub
    try {
      if (base.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "subscribe", symbol: base.symbol }));
        subscribed.current.add(base.symbol);
      }
    } catch {}

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
    const q = number(editQty);
    const aVal = number(editAvg);
    if (q <= 0 || aVal <= 0) { setEditingId(null); return; }
    const avgUSD = editAvgCcy === "IDR" ? aVal / (usdIdr || 1) : aVal;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: aVal, inputCurrency: editAvgCcy, avgUSD } : x));
    setEditingId(null);
  }
  function cancelEdit() { setEditingId(null); }

  function removeAsset(id) {
    const t = assets.find(a => a.id === id);
    setAssets(prev => prev.filter(a => a.id !== id));
    if (t && t.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
      try { wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: t.symbol })); subscribed.current.delete(t.symbol); } catch {}
    }
  }

  function buyMore(a) {
    const qtyStr = prompt(`Buy qty for ${a.symbol || a.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${a.inputCurrency || "USD"}):`, String(a.avgInput || ""));
    const ccy = prompt("Currency (USD/IDR):", a.inputCurrency || "USD");
    const bq = number(qtyStr);
    const bp = number(priceStr);
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
    const sq = number(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = a.qty - sq;
    if (remain <= 0) removeAsset(a.id);
    else setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: remain } : x));
  }

  /* Render */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* warning if Finnhub missing */}
        {!FINNHUB_KEY && (
          <div className="mb-4 rounded px-3 py-2 bg-yellow-900 text-yellow-200 text-sm">
            Finnhub API key not found. Stocks/IDX search & realtime WS won't be available. Set NEXT_PUBLIC_FINNHUB_API_KEY in env to enable.
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">Live tick: {lastTickTs ? new Date(lastTickTs).toLocaleTimeString() : "-"} • FX USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{displayCcy === "IDR" ? fmtCurrency(displayTotals.market, "IDR") : fmtCurrency(displayTotals.market, "USD")}</div>
            <select value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value)} className="ml-3 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400"><div>Invested</div><div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(displayTotals.invested, "IDR") : fmtCurrency(displayTotals.invested, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Market</div><div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(displayTotals.market, "IDR") : fmtCurrency(displayTotals.market, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Unrealized P&L</div><div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(displayTotals.pnl, "IDR") : fmtCurrency(displayTotals.pnl, "USD")} ({displayTotals.pnlPct?.toFixed?.(2) || "0.00"}%)</div></div>
          <div className="flex justify-between text-gray-400"><div>Realized P&L</div><div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(displayTotals.realized, "IDR") : fmtCurrency(displayTotals.realized, "USD")}</div></div>
        </div>

        {/* Add Bar */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search: AAPL | IDX:BBCA | BINANCE:BTCUSDT | BTC"
                className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800"
                aria-label="search-symbol"
              />
              {suggestions.length > 0 && (
                <div style={{ zIndex: 60 }} className="absolute mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol} • ${s.display}` : `${s.symbol} • ${s.display}`}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : "Stock/FX (Finnhub)"}</div>
                      </div>
                      <div className="text-xs text-gray-400">{s.source === "coingecko" ? "" : ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-full sm:w-28" />
            <div className="flex items-center gap-2">
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-28" />
              <select value={avgCcyInput} onChange={(e) => setAvgCcyInput(e.target.value)} className="rounded-md bg-gray-950 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>

            <button onClick={addAsset} className="bg-green-600 hover:bg-green-500 text-black px-4 py-2 rounded font-semibold w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* Table compact (Stockbit-like) */}
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
                <tr><td colSpan={5} className="py-8 text-center text-gray-500">Add assets to track your portfolio</td></tr>
              ) : rows.map(r => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-3">
                      <button
                        onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.source === "finnhub" ? r.symbol : (r.symbol || r.coingeckoId))}`, "_blank")}
                        className="font-semibold text-gray-100 hover:text-green-400"
                      >
                        {(r.symbol || r.displayName || "").replace?.("BINANCE:","")}
                      </button>
                      <div className="text-xs text-gray-500">{r.qty}</div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{displayCcy === "IDR" ? fmtCurrency(r.displayInvested, "IDR") : fmtCurrency(r.displayInvested, "USD")}</div>
                      <div className="text-xs text-gray-500">{r.inputCurrency === "IDR" ? fmtCurrency(r.avgInput, "IDR") : fmtCurrency(r.avgUSD, "USD")}</div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-medium">{r.displayPrice != null ? (displayCcy === "IDR" ? fmtCurrency(r.displayPrice, "IDR") : fmtCurrency(r.displayPrice, "USD")) : "-"}</div>
                      <div className="text-xs text-gray-500">{r.nativeLast ? (r.quoteCcy || symbolQuoteCurrency(r.symbol)) : ""}</div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtCurrency(r.displayPnl, "IDR") : fmtCurrency(r.displayPnl, "USD")}</div>
                      <div className={`text-xs ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                    </td>

                    <td className="px-3 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(r.id)} className="bg-green-600 px-3 py-1 rounded text-xs font-semibold text-black">Save</button>
                          <button onClick={() => cancelEdit()} className="bg-gray-800 px-3 py-1 rounded text-xs">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {/* All action buttons are standard buttons so clickable */}
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

        {/* Donut */}
        {pieData.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-40 h-40"><Donut items={pieData} size={140} inner={60} /></div>
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