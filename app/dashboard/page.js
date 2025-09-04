"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
  Final single-file dashboard (Yahoo Finance only)
  - Search: query2.finance.yahoo.com/v1/finance/search
  - Quotes: query1.finance.yahoo.com/v7/finance/quote
  - USD/IDR via ticker "USDIDR=X"
  - Polling: quotes every 5s, USDIDR every 30s
  - Local persistence: localStorage
  - Dark minimalist UI, inline edit working
*/

/* ====== CONFIG ====== */
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) =>
  `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
const USDIDR_SYMBOL = "USDIDR=X";

/* ====== HELPERS ====== */
const isBrowser = typeof window !== "undefined";
const toNum = (v) => (isNaN(+v) ? 0 : +v);
function useDebounced(v, delay = 300) {
  const [val, setVal] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setVal(v), delay);
    return () => clearTimeout(t);
  }, [v, delay]);
  return val;
}
function fmt(v, ccy = "USD") {
  const n = Number(v || 0);
  if (ccy === "IDR")
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function normalizeIdr(v) {
  const n = Number(v);
  if (!n || Number.isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* Donut */
function Donut({ items = [], size = 140, inner = 60 }) {
  const total = items.reduce((s, it) => s + Math.max(0, it.value || 0), 0) || 1;
  const cx = size / 2,
    cy = size / 2,
    r = size / 2 - 6;
  let start = -90;
  const colors = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {items.map((it, i) => {
        const portion = Math.max(0, it.value || 0) / total;
        const angle = portion * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sRad = (Math.PI * start) / 180;
        const eRad = (Math.PI * end) / 180;
        const x1 = cx + r * Math.cos(sRad),
          y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad),
          y2 = cy + r * Math.sin(eRad);
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={i} d={d} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.06)" strokeWidth="0.3" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ====== MAIN COMPONENT ====== */
export default function DashboardPage() {
  /* persisted portfolio */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_yahoo_assets_v1") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_yahoo_realized_v1") || "0");
    } catch {
      return 0;
    }
  });

  /* display currency & fx */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  /* live quotes */
  const [quotes, setQuotes] = useState({}); // symbol -> yahoo quote obj
  const [lastTick, setLastTick] = useState(null);

  /* search */
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query, 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  /* add form */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  /* inline edit */
  const [editingId, setEditingId] = useState(null);
  const [editMap, setEditMap] = useState({}); // id -> { qty, avgInput, inputCurrency }

  /* polling refs */
  const pollRef = useRef(null);
  const fxRef = useRef(null);

  /* persist */
  useEffect(() => {
    try {
      localStorage.setItem("bb_yahoo_assets_v1", JSON.stringify(assets));
    } catch {}
  }, [assets]);
  useEffect(() => {
    try {
      localStorage.setItem("bb_yahoo_realized_v1", String(realizedUSD));
    } catch {}
  }, [realizedUSD]);

  /* SEARCH (Yahoo) */
  useEffect(() => {
    let cancelled = false;
    if (!debQuery || debQuery.length < 1) {
      setSuggestions([]);
      return;
    }
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(YAHOO_SEARCH(debQuery), { signal: ac.signal });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const j = await res.json();
        const quotesList = Array.isArray(j?.quotes) ? j.quotes.slice(0, 14) : [];
        const items = quotesList.map((it) => ({
          source: "yahoo",
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          exchange: it.exchange || it.exchangeTimezoneName || "",
        }));
        if (!cancelled) setSuggestions(items);
      } catch (e) {
        if (e.name !== "AbortError") console.warn("search err", e);
        if (!cancelled) setSuggestions([]);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [debQuery]);

  /* POLL quotes for tracked symbols every 5s */
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        const syms = Array.from(new Set(assets.filter((a) => a.source === "yahoo").map((a) => a.symbol)));
        // always include USDIDR=X to keep fx up-to-date
        if (!syms.includes(USDIDR_SYMBOL)) syms.push(USDIDR_SYMBOL);
        if (syms.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(syms));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const map = {};
        if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
          j.quoteResponse.result.forEach((q) => {
            if (q && q.symbol) map[q.symbol] = q;
          });
        }
        setQuotes((p) => ({ ...p, ...map }));
        // update USD/IDR if present
        const fxObj = map[USDIDR_SYMBOL];
        if (fxObj && fxObj.regularMarketPrice != null) {
          const maybe = normalizeIdr(fxObj.regularMarketPrice);
          if (maybe) setUsdIdr((prev) => (!prev || Math.abs(prev - maybe) / maybe > 0.0005 ? maybe : prev));
        }
        setLastTick(Date.now());
      } catch (e) {
        // ignore network blips
        // console.warn(e)
      }
    }
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [assets]);

  /* If USDIDR was not in tracked assets, make sure we still fetch it periodically */
  useEffect(() => {
    let mounted = true;
    async function pollFx() {
      try {
        const res = await fetch(YAHOO_QUOTE([USDIDR_SYMBOL]));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const fxObj = j?.quoteResponse?.result?.[0];
        if (fxObj && fxObj.regularMarketPrice != null) {
          const maybe = normalizeIdr(fxObj.regularMarketPrice);
          if (maybe) setUsdIdr((prev) => (!prev || Math.abs(prev - maybe) / maybe > 0.0005 ? maybe : prev));
          setQuotes((p) => ({ ...p, [USDIDR_SYMBOL]: fxObj }));
          setLastTick(Date.now());
        }
      } catch (e) {}
    }
    pollFx();
    fxRef.current = setInterval(pollFx, 30_000);
    return () => {
      mounted = false;
      if (fxRef.current) clearInterval(fxRef.current);
    };
  }, []);

  /* helper: fetch single yahoo quote */
  async function fetchQuoteSingle(sym) {
    try {
      const res = await fetch(YAHOO_QUOTE([sym]));
      if (!res.ok) return null;
      const j = await res.json();
      return j?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  /* Compose rows with computed USD-base math */
  const rows = useMemo(() => {
    return assets.map((a) => {
      // native last price (in quote currency)
      let native = a.lastKnownNative ?? null;
      if (a.source === "yahoo" && quotes[a.symbol] && quotes[a.symbol].regularMarketPrice != null)
        native = quotes[a.symbol].regularMarketPrice;
      // determine quote currency: yahoo returns currency field sometimes
      const yahooObj = quotes[a.symbol];
      const quoteCcy = a.source === "yahoo" ? (yahooObj?.currency || yahooObj?.exchange || "USD") : "USD";
      // price in USD
      let priceUSD = 0;
      if (a.source === "yahoo") {
        if (String(quoteCcy).toUpperCase().includes("IDR") || a.symbol.endsWith(".JK") || a.symbol.includes("IDX:")) {
          priceUSD = toNum(native) / (usdIdr || 1);
        } else {
          priceUSD = toNum(native);
        }
      } else {
        priceUSD = toNum(native);
      }
      const investedUSD = toNum(a.avgUSD) * toNum(a.qty);
      const marketUSD = priceUSD * toNum(a.qty);
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
  }, [assets, quotes, usdIdr, displayCcy]);

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

  const pie = useMemo(() => rows.map((r) => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter((x) => x.value > 0), [rows]);

  /* ACTIONS */
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
      alert("Pilih asset dari suggestion atau ketik symbol lengkap (mis. AAPL, BBCA.JK).");
      return;
    }
    const q = toNum(qtyInput);
    const a = toNum(avgInput);
    if (q <= 0 || a <= 0) {
      alert("Qty & Avg harus > 0");
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
    // fetch initial quote for accuracy
    try {
      const qobj = await fetchQuoteSingleSafe(pick.symbol);
      if (qobj) {
        base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
        setQuotes((p) => ({ ...p, [pick.symbol]: qobj }));
      }
    } catch {}
    setAssets((p) => [...p, base]);
    // reset
    setSelected(null);
    setQuery("");
    setQtyInput("");
    setAvgInput("");
    setAvgCcy("USD");
  }

  async function fetchQuoteSingleSafe(sym) {
    try {
      const res = await fetch(YAHOO_QUOTE([sym]));
      if (!res.ok) return null;
      const j = await res.json();
      return j?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  function beginEdit(row) {
    setEditingId(row.id);
    setEditMap((p) => ({ ...p, [row.id]: { qty: String(row.qty), avgInput: String(row.avgInput ?? row.avgUSD ?? ""), inputCurrency: row.inputCurrency || "USD" } }));
  }
  function saveEdit(id) {
    const ef = editMap[id];
    if (!ef) {
      setEditingId(null);
      return;
    }
    const q = toNum(ef.qty);
    const a = toNum(ef.avgInput);
    const ccy = ef.inputCurrency || "USD";
    if (q <= 0 || a <= 0) {
      alert("Qty & Avg harus > 0");
      setEditingId(null);
      return;
    }
    const avgUSD = ccy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets((p) => p.map((x) => (x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: ccy, avgUSD } : x)));
    setEditingId(null);
    setEditMap((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
  }
  function cancelEdit(id) {
    setEditingId(null);
    setEditMap((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
  }

  function removeAsset(id) {
    setAssets((p) => p.filter((x) => x.id !== id));
  }

  function buyMore(row) {
    const qtyStr = prompt(`Buy qty for ${row.symbol || row.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${row.inputCurrency || "USD"}):`, String(row.avgInput || row.avgUSD || ""));
    const ccy = prompt("Currency (USD/IDR):", row.inputCurrency || "USD");
    const bq = toNum(qtyStr);
    const bp = toNum(priceStr);
    if (bq <= 0 || bp <= 0) return;
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = row.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (row.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets((p) => p.map((x) => (x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD, inputCurrency: curr } : x)));
  }

  function sellSome(row) {
    const qtyStr = prompt(`Sell qty for ${row.symbol || row.displayName}:`, "0");
    const sq = toNum(qtyStr);
    if (sq <= 0 || sq > row.qty) return;
    const priceUSD = row.priceUSD ?? row.avgUSD ?? 0;
    const realized = (priceUSD - row.avgUSD) * sq;
    setRealizedUSD((p) => p + realized);
    const remain = row.qty - sq;
    if (remain <= 0) removeAsset(row.id);
    else setAssets((p) => p.map((x) => (x.id === row.id ? { ...x, qty: remain } : x)));
  }

  function openChart(row) {
    let tv = row.symbol;
    if (tv?.endsWith(".JK")) tv = `IDX:${tv.replace(".JK", "")}`;
    if (!tv.includes(":") && /^[A-Z0-9._-]{1,10}$/.test(tv)) tv = `NASDAQ:${tv}`;
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  /* Render */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">Live: {lastTick ? new Date(lastTick).toLocaleTimeString() : "-"} • USD/IDR ≈ <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span></p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">{displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}</div>
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

        {/* Search / Add */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search symbols (AAPL, BBCA.JK, BTC)..." className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
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
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-28" />
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
              ) : rows.map((r) => {
                const editing = editingId === r.id;
                const ef = editMap[r.id] || {};
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-4">
                      <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openChart(r)}>{r.symbol}</div>
                      <div className="text-xs text-gray-500">{r.qty}</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <input className="w-20 rounded bg-gray-900 px-2 py-1 text-right" value={ef.qty} onChange={(e) => setEditMap((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), qty: e.target.value } }))} />
                          <input className="w-28 rounded bg-gray-900 px-2 py-1 text-right" value={ef.avgInput} onChange={(e) => setEditMap((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), avgInput: e.target.value } }))} />
                          <select className="rounded bg-gray-900 px-2 py-1" value={ef.inputCurrency || "USD"} onChange={(e) => setEditMap((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), inputCurrency: e.target.value } }))}>
                            <option value="USD">USD</option>
                            <option value="IDR">IDR</option>
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="font-medium">{displayCcy === "IDR" ? fmt(r.displayInvested, "IDR") : fmt(r.displayInvested, "USD")}</div>
                          <div className="text-xs text-gray-500">{r.inputCurrency === "IDR" ? fmt(r.avgInput, "IDR") : fmt(r.avgUSD, "USD")}</div>
                        </>
                      )}
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className="font-medium">{r.displayPrice != null ? (displayCcy === "IDR" ? fmt(r.displayPrice, "IDR") : fmt(r.displayPrice, "USD")) : "-"}</div>
                      <div className="text-xs text-gray-500">{r.native ? `${r.quoteCcy}` : ""}</div>
                    </td>

                    <td className="px-3 py-4 text-right tabular-nums">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(r.displayPnl, "IDR") : fmt(r.displayPnl, "USD")}</div>
                      <div className={`text-xs ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                    </td>

                    <td className="px-3 py-4 text-right">
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

        {/* Donut */}
        {pie.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-40 h-40"><Donut items={pie} size={140} inner={60} /></div>
            <div>
              {pie.map((p, i) => {
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