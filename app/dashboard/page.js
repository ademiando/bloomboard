"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 Final Dashboard (single-file)
 - Yahoo Finance search (query2) + quotes (quote endpoint)
 - Polling 5s for quotes + keep short price history for sparklines
 - USD/IDR from ticker USDIDR=X (Yahoo)
 - Add/Edit/Delete/Buy/Sell
 - Donut allocation + legend
 - Sparkline per asset
 - Dark minimalist UI
 Notes: If Yahoo endpoints are blocked by CORS in your hosting environment, add a server-side proxy route.
*/

/* ====== CONFIG ====== */
const YF_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YF_QUOTE = (symbols) =>
  `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
const USDIDR = "USDIDR=X";

/* ====== HELPERS ====== */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => (isNaN(+v) ? 0 : +v);

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function fmt(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* Guess quote currency best-effort */
function guessCurrency(symbol, quoteObj) {
  if (quoteObj && quoteObj.currency) return String(quoteObj.currency).toUpperCase();
  if (!symbol) return "USD";
  if (symbol.endsWith(".JK") || symbol.includes(".JK") || symbol.includes("IDX")) return "IDR";
  if (/USDT|USD/i.test(symbol)) return "USD";
  return "USD";
}

/* normalize possible Yahoo small-format IDR like 16.4 -> 16400 */
function normalizeIdr(v) {
  const n = Number(v);
  if (!n || Number.isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* small SVG sparkline */
function Sparkline({ data = [], width = 90, height = 28, stroke = "#16a34a" }) {
  if (!data || data.length === 0) {
    return (
      <svg width={width} height={height} className="inline-block">
        <rect width={width} height={height} rx="4" fill="transparent" />
      </svg>
    );
  }
  const pts = data.slice(-30);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = width / Math.max(1, pts.length - 1);
  let path = "";
  pts.forEach((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block">
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* Donut */
function Donut({ data = [], size = 140, inner = 60 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 6;
  let start = -90;
  const colors = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
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
        const dPath = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={i} d={dPath} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ====== MAIN COMPONENT ====== */
export default function DashboardPage() {
  /* persisted portfolio (base structure) */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_yf_assets_v1") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_yf_realized_v1") || "0");
    } catch {
      return 0;
    }
  });

  /* UI state */
  const [displayCcy, setDisplayCcy] = useState("IDR"); // default IDR
  const [usdIdr, setUsdIdr] = useState(16000);

  /* live stores */
  const [quotes, setQuotes] = useState({}); // symbol -> yahoo quote object
  const [priceHistory, setPriceHistory] = useState({}); // symbol -> array of last prices
  const priceHistoryRef = useRef({});
  const [lastTick, setLastTick] = useState(null);

  /* search + add inputs */
  const [query, setQuery] = useState("");
  const debq = useDebounced(query, 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  /* edit state */
  const [editingId, setEditingId] = useState(null);
  const [editMap, setEditMap] = useState({}); // id -> { qty, avgInput, inputCurrency }

  /* polling refs */
  const pollRef = useRef(null);

  /* persist changes */
  useEffect(() => {
    try {
      localStorage.setItem("bb_yf_assets_v1", JSON.stringify(assets));
    } catch {}
  }, [assets]);

  useEffect(() => {
    try {
      localStorage.setItem("bb_yf_realized_v1", String(realizedUSD));
    } catch {}
  }, [realizedUSD]);

  /* SEARCH (Yahoo) */
  useEffect(() => {
    let canceled = false;
    if (!debq || debq.length < 1) {
      setSuggestions([]);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(YF_SEARCH(debq), { signal: ac.signal });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const j = await res.json();
        const list = Array.isArray(j?.quotes) ? j.quotes.slice(0, 16) : [];
        const items = list.map((it) => ({
          source: "yahoo",
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          exchange: it.exchange,
        }));
        if (!canceled) setSuggestions(items);
      } catch (e) {
        if (e.name !== "AbortError") console.warn("yf search err", e);
        if (!canceled) setSuggestions([]);
      }
    })();
    return () => { canceled = true; ac.abort(); };
  }, [debq]);

  /* Poll quotes for tracked symbols every 5s and maintain history */
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        // symbols tracked (only yahoo-source ones stored in assets)
        const yahooSyms = Array.from(new Set(assets.filter(a => a.source !== "local" && a.source !== "coingecko").map(a => a.symbol)));
        // always ensure USDIDR is included
        if (!yahooSyms.includes(USDIDR)) yahooSyms.push(USDIDR);
        if (yahooSyms.length === 0) {
          // still fetch USDIDR occasionally
          const resFx = await fetch(YF_QUOTE([USDIDR]));
          if (!mounted) return;
          if (resFx.ok) {
            const j = await resFx.json();
            const fxObj = j?.quoteResponse?.result?.[0];
            if (fxObj && fxObj.regularMarketPrice != null) {
              const maybe = normalizeIdr(fxObj.regularMarketPrice);
              if (maybe) setUsdIdr(prev => (!prev || Math.abs(prev - maybe) / maybe > 0.0005 ? maybe : prev));
              setQuotes(p => ({ ...p, [USDIDR]: fxObj }));
              setLastTick(Date.now());
            }
          }
          return;
        }
        const res = await fetch(YF_QUOTE(yahooSyms));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const map = {};
        if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
          j.quoteResponse.result.forEach(q => {
            if (q && q.symbol) {
              map[q.symbol] = q;
              // push to price history
              const p = q.regularMarketPrice ?? null;
              if (p != null) {
                const arr = priceHistoryRef.current[q.symbol] ? [...priceHistoryRef.current[q.symbol]] : [];
                arr.push(Number(p));
                if (arr.length > 60) arr.shift(); // keep last ~60 points
                priceHistoryRef.current[q.symbol] = arr;
              }
            }
          });
        }
        // also update priceHistory state from ref
        const histCopy = { ...priceHistoryRef.current };
        setPriceHistory(histCopy);
        setQuotes(prev => ({ ...prev, ...map }));
        // USDIDR normalization
        if (map[USDIDR] && map[USDIDR].regularMarketPrice != null) {
          const m = normalizeIdr(map[USDIDR].regularMarketPrice);
          if (m) setUsdIdr(prev => (!prev || Math.abs(prev - m) / m > 0.0005 ? m : prev));
        }
        setLastTick(Date.now());
      } catch (e) {
        // ignore
      }
    }
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { mounted = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [assets]);

  /* Helper to fetch single quote */
  async function fetchSingle(sym) {
    try {
      const res = await fetch(YF_QUOTE([sym]));
      if (!res.ok) return null;
      const j = await res.json();
      return j?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /* Compose rows with computed USD-based math */
  const rows = useMemo(() => {
    return assets.map(a => {
      // last native price (quote currency)
      const quoteObj = quotes[a.symbol];
      const nativeLast = a.lastKnownNative ?? (quoteObj?.regularMarketPrice ?? null);
      // detect quote currency
      const qCcy = quoteObj?.currency ? String(quoteObj.currency).toUpperCase() : (a.quoteCurrency || (a.symbol?.endsWith(".JK") ? "IDR" : "USD"));
      // price in USD
      let priceUSD = 0;
      if (qCcy === "IDR") priceUSD = toNum(nativeLast) / (usdIdr || 1);
      else priceUSD = toNum(nativeLast);
      const investedUSD = toNum(a.avgUSD) * toNum(a.qty);
      const marketUSD = priceUSD * toNum(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;
      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;
      const hist = priceHistory[a.symbol] || [];
      return {
        ...a,
        nativeLast,
        qCcy,
        priceUSD,
        investedUSD,
        marketUSD,
        pnlUSD,
        pnlPct,
        displayPrice,
        displayInvested,
        displayMarket,
        displayPnl,
        hist,
      };
    });
  }, [assets, quotes, priceHistory, usdIdr, displayCcy]);

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

  const pieData = useMemo(
    () => rows.map(r => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0),
    [rows]
  );

  /* Actions: selection, add, edit, remove, buy, sell */
  function selectSuggestion(item) {
    setSelected(item);
    setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]);
  }

  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      const typed = query.split("—")[0].trim();
      if (typed) pick = { source: "yahoo", symbol: typed, display: typed };
    }
    if (!pick) {
      alert("Pilih asset dari suggestion atau ketik symbol lengkap (AAPL, BBCA.JK, etc).");
      return;
    }
    const q = toNum(qtyInput);
    const a = toNum(avgInput);
    if (q <= 0 || a <= 0) {
      alert("Qty & Avg harus lebih dari 0.");
      return;
    }
    const avgUSD = avgCcy === "IDR" ? a / (usdIdr || 1) : a;
    const base = {
      id: Date.now(),
      source: "yahoo",
      symbol: pick.symbol,
      displayName: pick.display,
      qty: q,
      avgInput: a,
      inputCurrency: avgCcy,
      avgUSD,
      lastKnownNative: undefined,
      createdAt: Date.now(),
    };
    // try fetch initial quote immediately
    try {
      const qobj = await fetchSingle(pick.symbol);
      if (qobj) {
        base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
        setQuotes(prev => ({ ...prev, [pick.symbol]: qobj }));
        // update history ref
        if (qobj.regularMarketPrice != null) {
          const arr = priceHistoryRef.current[pick.symbol] ? [...priceHistoryRef.current[pick.symbol]] : [];
          arr.push(Number(qobj.regularMarketPrice));
          priceHistoryRef.current[pick.symbol] = arr.slice(-60);
          setPriceHistory({ ...priceHistoryRef.current });
        }
      }
    } catch {}
    setAssets(prev => [...prev, base]);
    // reset form
    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCcy("USD");
  }

  function beginEdit(row) {
    setEditingId(row.id);
    setEditMap(prev => ({ ...prev, [row.id]: { qty: String(row.qty), avgInput: String(row.avgInput ?? row.avgUSD ?? ""), inputCurrency: row.inputCurrency || "USD" } }));
  }
  function saveEdit(id) {
    const ef = editMap[id];
    if (!ef) { setEditingId(null); return; }
    const q = toNum(ef.qty);
    const a = toNum(ef.avgInput);
    const ccy = ef.inputCurrency || "USD";
    if (q <= 0 || a <= 0) { alert("Qty & Avg harus > 0"); setEditingId(null); return; }
    const avgUSD = ccy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: ccy, avgUSD } : x));
    setEditingId(null);
    setEditMap(prev => { const cp = {...prev}; delete cp[id]; return cp; });
  }
  function cancelEdit(id) {
    setEditingId(null);
    setEditMap(prev => { const cp = {...prev}; delete cp[id]; return cp; });
  }

  function removeAsset(id) {
    setAssets(prev => prev.filter(a => a.id !== id));
    // also clear history if any
    priceHistoryRef.current = Object.keys(priceHistoryRef.current).reduce((acc, k) => {
      const keep = assets.some(a => a.id !== id && a.symbol === k);
      if (keep) acc[k] = priceHistoryRef.current[k];
      return acc;
    }, {});
    setPriceHistory({ ...priceHistoryRef.current });
  }

  function buyMore(row) {
    const qtyStr = prompt(`Buy qty for ${row.symbol}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${row.inputCurrency || "USD"}):`, String(row.avgInput || row.avgUSD || ""));
    const ccy = prompt("Currency (USD/IDR):", row.inputCurrency || "USD");
    const bq = toNum(qtyStr);
    const bp = toNum(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = row.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (row.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD, inputCurrency: curr } : x));
  }

  function sellSome(row) {
    const qtyStr = prompt(`Sell qty for ${row.symbol}:`, "0");
    const sq = toNum(qtyStr);
    if (sq <= 0 || sq > row.qty) return;
    const priceUSD = row.priceUSD ?? row.avgUSD ?? 0;
    const realized = (priceUSD - row.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = row.qty - sq;
    if (remain <= 0) removeAsset(row.id);
    else setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: remain } : x));
  }

  function openTradingView(row) {
    let tv = row.symbol;
    if (tv?.endsWith(".JK")) tv = `IDX:${tv.replace(".JK", "")}`;
    if (!tv.includes(":") && /^[A-Z0-9._-]{1,10}$/.test(tv)) tv = `NASDAQ:${tv}`;
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  /* UI render */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Updated: {lastTick ? new Date(lastTick).toLocaleTimeString() : "-"} • USD/IDR ≈{" "}
              <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span>
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

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between text-gray-400"><div>Invested</div><div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.invested, "IDR") : fmt(displayTotals.invested, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Market</div><div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}</div></div>
          <div className="flex justify-between text-gray-400"><div>Unrealized P&L</div><div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(displayTotals.pnl, "IDR") : fmt(displayTotals.pnl, "USD")} ({displayTotals.pnlPct?.toFixed?.(2) || "0.00"}%)</div></div>
          <div className="flex justify-between text-gray-400"><div>Realized P&L</div><div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(displayTotals.realized, "IDR") : fmt(displayTotals.realized, "USD")}</div></div>
        </div>

        {/* Add bar */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search symbol e.g. AAPL, BBCA.JK, BTC..." className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                        <div className="text-xs text-gray-500">{s.exchange || ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-full sm:w-28" />
            <div className="flex items-center gap-2">
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg Price" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-28" />
              <select value={avgCcy} onChange={(e) => setAvgCcy(e.target.value)} className="rounded-md bg-gray-950 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
            <button onClick={addAsset} className="bg-green-600 hover:bg-green-500 text-black px-4 py-2 rounded font-semibold w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Symbol</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Avg</th>
                <th className="text-right py-2 px-3">Last</th>
                <th className="text-right py-2 px-3">Invested</th>
                <th className="text-right py-2 px-3">Market</th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="text-right py-2 px-3">%Gain</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-gray-500">No assets — add via search above</td></tr>
              ) : rows.map(r => {
                const editing = editingId === r.id;
                const ef = editMap[r.id] || {};
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <button onClick={() => openTradingView(r)} className="font-semibold text-gray-100 hover:text-green-400">{r.symbol}</button>
                          <div className="text-xs text-gray-500">{r.displayName || ""}</div>
                        </div>
                        <div className="ml-2">
                          <Sparkline data={r.hist} />
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {editing ? <input value={ef.qty} onChange={(e) => setEditMap(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), qty: e.target.value } }))} className="w-20 rounded bg-gray-950 px-2 py-1 text-right" /> : r.qty}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <input value={ef.avgInput} onChange={(e) => setEditMap(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), avgInput: e.target.value } }))} className="w-28 rounded bg-gray-950 px-2 py-1 text-right" />
                          <select value={ef.inputCurrency || "USD"} onChange={(e) => setEditMap(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), inputCurrency: e.target.value } }))} className="rounded bg-gray-950 px-2 py-1">
                            <option value="USD">USD</option>
                            <option value="IDR">IDR</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{r.inputCurrency === "IDR" ? fmt(r.avgInput, "IDR") : fmt(r.avgUSD, "USD")}</div>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">{r.displayPrice != null ? (displayCcy === "IDR" ? fmt(r.displayPrice, "IDR") : fmt(r.displayPrice, "USD")) : "-"}</td>

                    <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmt(r.displayInvested, "IDR") : fmt(r.displayInvested, "USD")}</td>

                    <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmt(r.displayMarket, "IDR") : fmt(r.displayMarket, "USD")}</td>

                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(r.displayPnl, "IDR") : fmt(r.displayPnl, "USD")}</td>

                    <td className={`px-3 py-3 text-right tabular-nums ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? r.pnlPct.toFixed(2) : "0.00"}%</td>

                    <td className="px-3 py-3 text-right">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => saveEdit(r.id)} className="bg-green-600 px-3 py-1 rounded text-xs font-semibold text-black">Save</button>
                          <button onClick={() => cancelEdit(r.id)} className="bg-gray-800 px-3 py-1 rounded text-xs">Cancel</button>
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