"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 Final dashboard (single file)
 - Dependencies: server proxies:
    /api/yahoo/search?q=...
    /api/yahoo/quote?symbols=SYM1,SYM2
 - Polls quotes every 5s, includes USDIDR=X for FX
 - Initial sync spinner only during first successful quote fetch attempt
 - Robust search suggestions (Yahoo results + smart fallbacks)
 - Add/Edit/Delete/Buy/Sell working with correct USD math
 - All displayed numbers convert via live USD->IDR rate
 - Minimal dark UI, responsive table, donut allocation, sparklines
 NOTE: keep API_PROXY files deployed in same app.
*/

const API_SEARCH = "/api/yahoo/search?q=";
const API_QUOTE = "/api/yahoo/quote?symbols=";
const USDIDR_SYMBOL = "USDIDR=X";

const toNum = (v) => (isNaN(+v) ? 0 : +v);

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
    // show no decimal for IDR by default
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.round(n));
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* Simple donut SVG */
function Donut({ data = [], size = 140, inner = 60 }) {
  const total = Math.max(1, data.reduce((s, d) => s + Math.max(0, d.value || 0), 0));
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
  let start = -90;
  const colors = ["#16a34a","#06b6d4","#f59e0b","#ef4444","#7c3aed","#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
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
        return <path key={i} d={path} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.05)" strokeWidth="0.3" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* Sparkline */
function Sparkline({ data = [], w = 80, h = 28 }) {
  if (!data || data.length === 0) return <svg width={w} height={h} />;
  const pts = data.slice(-40);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = w / Math.max(1, pts.length - 1);
  const d = pts.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke="#16a34a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  // persisted portfolio
  const [assets, setAssets] = useState(() => {
    try { const raw = localStorage.getItem("bb_assets_final"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try { return Number(localStorage.getItem("bb_realized_final") || "0"); } catch { return 0; }
  });

  // display & FX
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(null); // null until we sync
  const [isFirstSync, setIsFirstSync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // quotes & history
  const [quotes, setQuotes] = useState({}); // symbol -> quote object
  const priceHistoryRef = useRef({});
  const [priceHistoryState, setPriceHistoryState] = useState({});
  const pollRef = useRef(null);

  // search UI
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  // add inputs
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({}); // id -> {qty, avgInput, inputCurrency}

  // persist to localStorage
  useEffect(() => {
    try { localStorage.setItem("bb_assets_final", JSON.stringify(assets)); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("bb_realized_final", String(realizedUSD)); } catch {}
  }, [realizedUSD]);

  // Search (Yahoo via proxy) + fallbacks
  useEffect(() => {
    let active = true;
    if (!debQuery || debQuery.length < 1) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);

    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(API_SEARCH + encodeURIComponent(debQuery), { signal: ac.signal });
        if (!active) return;
        if (!res.ok) {
          // fallback suggestions (generate guesses)
          const q = debQuery.toUpperCase();
          const fallbacks = generateFallbacks(q);
          setSuggestions(fallbacks);
          setSuggestLoading(false);
          return;
        }
        const json = await res.json();
        const arr = Array.isArray(json?.quotes) ? json.quotes : [];
        let mapped = arr.map(it => ({
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          exchange: it.exchange || "",
        }));
        if (mapped.length === 0) {
          // generate smart fallbacks
          mapped = generateFallbacks(debQuery.toUpperCase());
        }
        setSuggestions(mapped.slice(0, 40));
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("search error", err);
          setSuggestions(generateFallbacks(debQuery.toUpperCase()));
        }
      } finally {
        if (active) setSuggestLoading(false);
      }
    })();

    return () => { active = false; ac.abort(); };
  }, [debQuery]);

  // Poll quotes every 5s (initial sync included) - includes USDIDR
  useEffect(() => {
    let mounted = true;
    async function pollOnce() {
      try {
        setIsSyncing(true);
        // always ensure we request USDIDR symbol
        const unique = Array.from(new Set([...assets.map(a => a.symbol), USDIDR_SYMBOL])).filter(Boolean);
        if (unique.length === 0) {
          // still fetch USDIDR only
          const rfx = await fetch(API_QUOTE + encodeURIComponent(USDIDR_SYMBOL));
          if (!mounted) return;
          if (rfx.ok) {
            const j = await rfx.json();
            const fx = j?.quoteResponse?.result?.[0];
            if (fx && fx.regularMarketPrice != null) {
              const normalized = normalizeUsdIdr(fx.regularMarketPrice);
              if (normalized) setUsdIdr(prev => useNewFx(prev, normalized));
              setQuotes(prev => ({ ...prev, [USDIDR_SYMBOL]: fx }));
            }
          }
          setIsSyncing(false);
          return;
        }

        const res = await fetch(API_QUOTE + encodeURIComponent(unique.join(",")));
        if (!mounted) return;
        if (!res.ok) {
          setIsSyncing(false);
          return;
        }
        const j = await res.json();
        const arr = Array.isArray(j?.quoteResponse?.result) ? j.quoteResponse.result : [];
        const map = {};
        arr.forEach(q => {
          if (!q || !q.symbol) return;
          map[q.symbol] = q;
          const p = q.regularMarketPrice ?? null;
          if (p != null) {
            const hist = priceHistoryRef.current[q.symbol] ? [...priceHistoryRef.current[q.symbol]] : [];
            hist.push(Number(p));
            if (hist.length > 120) hist.shift();
            priceHistoryRef.current[q.symbol] = hist;
          }
        });
        setQuotes(prev => ({ ...prev, ...map }));
        setPriceHistoryState({ ...priceHistoryRef.current });
        // update fx if present
        if (map[USDIDR_SYMBOL] && map[USDIDR_SYMBOL].regularMarketPrice != null) {
          const norm = normalizeUsdIdr(map[USDIDR_SYMBOL].regularMarketPrice);
          if (norm) setUsdIdr(prev => useNewFx(prev, norm));
        }
      } catch (e) {
        // network error - ignore but keep spinner off after first attempt
        console.warn("poll err", e);
      } finally {
        if (!mounted) return;
        setIsSyncing(false);
        if (isFirstSync) setIsFirstSync(false);
      }
    }

    pollOnce();
    pollRef.current = setInterval(pollOnce, 5000);
    return () => { mounted = false; if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  // Helpers
  function generateFallbacks(q) {
    const res = [];
    if (!q) return res;
    // If looks like IDX ticker (letters, 2-5 chars)
    if (/^[A-Z]{2,6}$/.test(q)) {
      res.push({ symbol: `${q}.JK`, display: `${q}.JK (IDX guess)` });
    }
    // direct ticker
    res.push({ symbol: q, display: `${q} (ticker)` });
    // crypto guessed pairs
    res.push({ symbol: `${q}-USD`, display: `${q}-USD (crypto guess)` });
    res.push({ symbol: `${q}USDT`, display: `${q}USDT (crypto guess)` });
    res.push({ symbol: `${q}USD`, display: `${q}USD (crypto guess)` });
    return res;
  }

  function normalizeUsdIdr(raw) {
    if (raw == null) return null;
    const v = Number(raw);
    if (Number.isNaN(v)) return null;
    // Yahoo sometimes returns 15.6 (-> 15.6 * 1000 = 15,600)
    if (v < 1000) {
      // if v looks like 15.6, scale to 15599 etc (closest)
      return Math.round(v * 1000);
    }
    return Math.round(v);
  }

  function useNewFx(prev, candidate) {
    if (!prev) return candidate;
    // only update if change significant (>0.05%)
    if (Math.abs(prev - candidate) / candidate > 0.0005) return candidate;
    return prev;
  }

  async function fetchSingleQuote(sym) {
    try {
      const res = await fetch(API_QUOTE + encodeURIComponent(sym));
      if (!res.ok) return null;
      const j = await res.json();
      return j?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // Computation rows (all USD math)
  const rows = useMemo(() => {
    return assets.map(a => {
      const qobj = quotes[a.symbol];
      const nativeLast = a.lastKnownNative ?? (qobj?.regularMarketPrice ?? null);
      const quoteCurrency = qobj?.currency ? String(qobj.currency).toUpperCase() : (a.symbol?.endsWith(".JK") ? "IDR" : "USD");
      let priceUSD = 0;
      if (quoteCurrency === "IDR") {
        priceUSD = toNum(nativeLast) / (usdIdr || 1);
      } else {
        priceUSD = toNum(nativeLast);
      }
      const investedUSD = toNum(a.avgUSD) * toNum(a.qty);
      const marketUSD = priceUSD * toNum(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;
      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;
      const hist = priceHistoryState[a.symbol] || [];
      return { ...a, nativeLast, quoteCurrency, priceUSD, investedUSD, marketUSD, pnlUSD, pnlPct, displayPrice, displayInvested, displayMarket, displayPnl, hist };
    });
  }, [assets, quotes, priceHistoryState, usdIdr, displayCcy]);

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

  const pieData = useMemo(() => rows.map(r => ({ name: r.symbol, value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0), [rows]);

  /* Actions */

  function pickSuggestion(it) {
    setSelected(it);
    // show selected symbol in input (short)
    setQuery(it.symbol);
    setSuggestions([]);
  }

  async function addAsset() {
    // require fx if avgCcy is IDR
    if (avgCcy === "IDR" && !usdIdr) {
      alert("Waiting for USD/IDR rate sync. Please wait a moment.");
      return;
    }
    let pick = selected;
    if (!pick && query) {
      const typed = query.split("—")[0].trim();
      if (typed) pick = { symbol: typed, display: typed };
    }
    if (!pick) {
      alert("Please pick an asset from suggestions or type a full symbol (e.g. AAPL, BBCA.JK, BTC-USD).");
      return;
    }
    const q = toNum(qtyInput);
    const a = toNum(avgInput);
    if (q <= 0 || a <= 0) {
      alert("Qty and Avg must be > 0");
      return;
    }
    const avgUSD = avgCcy === "IDR" ? a / (usdIdr || 1) : a;
    const base = {
      id: Date.now(),
      symbol: pick.symbol,
      displayName: pick.display || "",
      qty: q,
      avgInput: a,
      inputCurrency: avgCcy,
      avgUSD,
      createdAt: Date.now(),
    };
    // quick initial price fetch
    try {
      const qobj = await fetchSingleQuote(pick.symbol);
      if (qobj) {
        base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
        setQuotes(prev => ({ ...prev, [pick.symbol]: qobj }));
        if (qobj.regularMarketPrice != null) {
          const arr = priceHistoryRef.current[pick.symbol] ? [...priceHistoryRef.current[pick.symbol]] : [];
          arr.push(Number(qobj.regularMarketPrice));
          priceHistoryRef.current[pick.symbol] = arr.slice(-120);
          setPriceHistoryState({ ...priceHistoryRef.current });
        }
      }
    } catch {}
    setAssets(prev => [...prev, base]);
    setSelected(null);
    setQuery("");
    setQtyInput("");
    setAvgInput("");
    setAvgCcy("USD");
  }

  function beginEdit(a) {
    setEditingId(a.id);
    setEditDraft(prev => ({ ...prev, [a.id]: { qty: String(a.qty), avgInput: String(a.avgInput ?? a.avgUSD ?? ""), inputCurrency: a.inputCurrency || "USD" } }));
  }

  function saveEdit(id) {
    const d = editDraft[id];
    if (!d) { setEditingId(null); return; }
    const q = toNum(d.qty);
    const a = toNum(d.avgInput);
    const ccy = d.inputCurrency || "USD";
    if (q <= 0 || a <= 0) { alert("Qty & Avg must be > 0"); setEditingId(null); return; }
    const avgUSD = ccy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: ccy, avgUSD } : x));
    setEditingId(null);
    setEditDraft(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
  }

  function cancelEdit(id) {
    setEditingId(null);
    setEditDraft(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
  }

  function removeAsset(id) {
    setAssets(prev => prev.filter(x => x.id !== id));
    // prune price history
    priceHistoryRef.current = Object.keys(priceHistoryRef.current).reduce((acc, k) => {
      const keep = assets.some(a => a.id !== id && a.symbol === k);
      if (keep) acc[k] = priceHistoryRef.current[k];
      return acc;
    }, {});
    setPriceHistoryState({ ...priceHistoryRef.current });
  }

  function buyMore(a) {
    const qtyStr = prompt(`Buy qty for ${a.symbol}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${a.inputCurrency || "USD"}):`, String(a.avgInput || a.avgUSD || ""));
    const ccy = prompt("Currency (USD/IDR):", a.inputCurrency || "USD");
    const bq = toNum(qtyStr);
    const bp = toNum(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = a.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (a.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD, inputCurrency: curr } : x));
  }

  function sellSome(a) {
    const qtyStr = prompt(`Sell qty for ${a.symbol}:`, "0");
    const sq = toNum(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    // use most recent priceUSD
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = a.qty - sq;
    if (remain <= 0) removeAsset(a.id);
    else setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: remain } : x));
  }

  function openTradingView(r) {
    let tv = r.symbol;
    // map .JK to IDX:
    if (tv?.endsWith(".JK")) tv = `IDX:${tv.replace(".JK", "")}`;
    // if looks like plain ticker, assume NASDAQ (best-effort)
    if (!tv.includes(":") && /^[A-Z0-9._-]{1,10}$/.test(tv)) tv = `NASDAQ:${tv}`;
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  // Render UI
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              {isFirstSync ? (
                <span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" /> syncing initial prices…</span>
              ) : (
                <span>{isSyncing ? "syncing…" : `Last: ${new Date().toLocaleTimeString()}`}</span>
              )}
              {" "}• USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "—"}</span>
            </p>
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

        {/* ADD BAR */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search symbol (AAPL, BBCA.JK, BTC-USD, BNBUSDT, etc)" className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">{suggestLoading ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" /> : null}</div>

              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-60 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => pickSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
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

        {/* TABLE */}
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
                const draft = editDraft[r.id] || {};
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <button onClick={() => openTradingView(r)} className="font-semibold text-gray-100 hover:text-green-400">{r.symbol}</button>
                          <div className="text-xs text-gray-500">{r.displayName || ""}</div>
                        </div>
                        <div className="ml-2"><Sparkline data={r.hist} /></div>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {editing ? <input value={draft.qty} onChange={(e) => setEditDraft(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), qty: e.target.value } }))} className="w-20 rounded bg-gray-950 px-2 py-1 text-right" /> : r.qty}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">
                      {editing ? (
                        <div className="flex items-center justify-end gap-2">
                          <input value={draft.avgInput} onChange={(e) => setEditDraft(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), avgInput: e.target.value } }))} className="w-28 rounded bg-gray-950 px-2 py-1 text-right" />
                          <select value={draft.inputCurrency || "USD"} onChange={(e) => setEditDraft(p => ({ ...p, [r.id]: { ...(p[r.id]||{}), inputCurrency: e.target.value } }))} className="rounded bg-gray-950 px-2 py-1">
                            <option value="USD">USD</option>
                            <option value="IDR">IDR</option>
                          </select>
                        </div>
                      ) : (
                        <div className="font-medium">{r.inputCurrency === "IDR" ? fmtMoney(r.avgInput, "IDR") : fmtMoney(r.avgUSD, "USD")}</div>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums">{r.displayPrice != null ? (displayCcy === "IDR" ? fmtMoney(r.displayPrice, "IDR") : fmtMoney(r.displayPrice, "USD")) : "-"}</td>

                    <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmtMoney(r.displayInvested, "IDR") : fmtMoney(r.displayInvested, "USD")}</td>

                    <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmtMoney(r.displayMarket, "IDR") : fmtMoney(r.displayMarket, "USD")}</td>

                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.displayPnl, "IDR") : fmtMoney(r.displayPnl, "USD")}</td>

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

        {/* Donut */}
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