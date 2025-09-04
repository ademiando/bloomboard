"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 Final single-file dashboard page.
 Requires two server-side proxy routes (place in app/api/...):
  - /api/yahoo/search?q=...
  - /api/yahoo/quote?symbols=SYM1,SYM2
 These proxies avoid CORS and are included in earlier messages.
*/

const API_SEARCH = "/api/yahoo/search?q=";
const API_QUOTE = "/api/yahoo/quote?symbols=";
const USDIDR_SYMBOL = "USDIDR=X";

const toNum = (v) => (isNaN(+v) ? 0 : +v);

function useDebounced(v, ms = 350) {
  const [val, setVal] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setVal(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return val;
}

function fmtMoney(n, ccy = "USD") {
  const num = Number(n || 0);
  if (ccy === "IDR")
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
      Math.round(num)
    );
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    num
  );
}

/* Donut simple */
function Donut({ data = [], size = 140, inner = 60 }) {
  const total = Math.max(1, data.reduce((s, d) => s + Math.max(0, d.value || 0), 0));
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

/* Sparkline simple */
function Sparkline({ data = [], w = 80, h = 28 }) {
  if (!data || data.length === 0) {
    return <svg width={w} height={h} />;
  }
  const pts = data.slice(-40);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = w / Math.max(1, pts.length - 1);
  const path = pts
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashboardPage() {
  // persisted assets
  const [assets, setAssets] = useState(() => {
    try {
      const raw = localStorage.getItem("bb_assets_final_v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      return Number(localStorage.getItem("bb_realized_final_v1") || "0");
    } catch {
      return 0;
    }
  });

  // display & fx
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);

  // quotes + history
  const [quotes, setQuotes] = useState({}); // symbol -> quote obj
  const priceHistoryRef = useRef({});
  const [priceHistoryState, setPriceHistoryState] = useState({});
  const [isFirstSync, setIsFirstSync] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const pollRef = useRef(null);

  // search
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query, 300);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  // add inputs
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  // edit
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({}); // id -> { qty, avgInput, inputCurrency }

  // persist
  useEffect(() => {
    try {
      localStorage.setItem("bb_assets_final_v1", JSON.stringify(assets));
    } catch {}
  }, [assets]);
  useEffect(() => {
    try {
      localStorage.setItem("bb_realized_final_v1", String(realizedUSD));
    } catch {}
  }, [realizedUSD]);

  // SEARCH (server-side proxy)
  useEffect(() => {
    let alive = true;
    if (!debQuery || debQuery.trim().length < 1) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);
    (async () => {
      try {
        const res = await fetch(API_SEARCH + encodeURIComponent(debQuery));
        if (!alive) return;
        if (!res.ok) {
          setSuggestions([]);
          setSuggestLoading(false);
          return;
        }
        const json = await res.json();
        const list = Array.isArray(json?.quotes) ? json.quotes : [];
        const mapped = list.map((it) => ({
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          exchange: it.exchange || "",
        }));
        setSuggestions(mapped.slice(0, 30));
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      } finally {
        if (alive) setSuggestLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [debQuery]);

  // QUOTE POLLING (initial sync then interval)
  useEffect(() => {
    let mounted = true;
    async function poll() {
      try {
        setIsSyncing(true);
        // symbols tracked + USDIDR
        const syms = Array.from(new Set([...assets.map((a) => a.symbol), USDIDR_SYMBOL])).filter(Boolean);
        // if none, still fetch USDIDR
        if (syms.length === 0) {
          const rfx = await fetch(API_QUOTE + encodeURIComponent(USDIDR_SYMBOL));
          if (!mounted) return;
          if (rfx.ok) {
            const j = await rfx.json();
            const fx = j?.quoteResponse?.result?.[0];
            if (fx && fx.regularMarketPrice != null) {
              const norm = fx.regularMarketPrice > 1000 ? Math.round(fx.regularMarketPrice) : Math.round(fx.regularMarketPrice * 1000);
              setUsdIdr((prev) => (!prev || Math.abs(prev - norm) / norm > 0.0005 ? norm : prev));
              setQuotes((p) => ({ ...p, [USDIDR_SYMBOL]: fx }));
            }
          }
          setIsSyncing(false);
          return;
        }

        const r = await fetch(API_QUOTE + encodeURIComponent(syms.join(",")));
        if (!mounted) return;
        if (!r.ok) {
          setIsSyncing(false);
          return;
        }
        const j = await r.json();
        const resArr = Array.isArray(j?.quoteResponse?.result) ? j.quoteResponse.result : [];
        const map = {};
        resArr.forEach((q) => {
          if (!q || !q.symbol) return;
          map[q.symbol] = q;
          const p = q.regularMarketPrice ?? null;
          if (p != null) {
            const arr = priceHistoryRef.current[q.symbol] ? [...priceHistoryRef.current[q.symbol]] : [];
            arr.push(Number(p));
            if (arr.length > 120) arr.shift();
            priceHistoryRef.current[q.symbol] = arr;
          }
        });
        // update states
        setQuotes((prev) => ({ ...prev, ...map }));
        setPriceHistoryState({ ...priceHistoryRef.current });
        // USDIDR
        if (map[USDIDR_SYMBOL] && map[USDIDR_SYMBOL].regularMarketPrice != null) {
          const fxv = map[USDIDR_SYMBOL].regularMarketPrice;
          const norm = fxv > 1000 ? Math.round(fxv) : Math.round(fxv * 1000);
          setUsdIdr((prev) => (!prev || Math.abs(prev - norm) / norm > 0.0005 ? norm : prev));
        }
      } catch (e) {
        // ignore network
      } finally {
        if (!mounted) return;
        setIsSyncing(false);
        if (isFirstSync) setIsFirstSync(false);
      }
    }
    // initial poll then interval
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  // Helper: fetch single symbol quote
  async function fetchSingle(sym) {
    try {
      const r = await fetch(API_QUOTE + encodeURIComponent(sym));
      if (!r.ok) return null;
      const j = await r.json();
      return j?.quoteResponse?.result?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // Computations: rows & totals
  const rows = useMemo(() => {
    return assets.map((a) => {
      const qObj = quotes[a.symbol];
      const nativeLast = a.lastKnownNative ?? (qObj?.regularMarketPrice ?? null);
      const quoteCcy = qObj?.currency ? String(qObj.currency).toUpperCase() : (a.quoteCurrency || (a.symbol?.endsWith(".JK") ? "IDR" : "USD"));
      let priceUSD = 0;
      if (quoteCcy === "IDR") priceUSD = toNum(nativeLast) / (usdIdr || 1);
      else priceUSD = toNum(nativeLast);
      const investedUSD = toNum(a.avgUSD) * toNum(a.qty);
      const marketUSD = priceUSD * toNum(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;
      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;
      const hist = priceHistoryState[a.symbol] || [];
      return {
        ...a,
        nativeLast,
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
        hist,
      };
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

  const pieData = useMemo(() => rows.map((r) => ({ name: r.symbol, value: Math.max(0, r.marketUSD || 0) })).filter(Boolean), [rows]);

  // Actions
  function pickSuggestion(it) {
    setSelected(it);
    setQuery(`${it.symbol} — ${it.display}`);
    setSuggestions([]);
  }

  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      const typed = query.split("—")[0].trim();
      if (typed) pick = { symbol: typed, display: typed };
    }
    if (!pick) {
      alert("Pilih item dari suggestion atau ketik symbol lengkap (mis: AAPL, BBCA.JK, BTC-USD).");
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
      symbol: pick.symbol,
      displayName: pick.display || "",
      qty: q,
      avgInput: a,
      inputCurrency: avgCcy,
      avgUSD,
      createdAt: Date.now(),
    };
    // initial quote fetch
    try {
      const qobj = await fetchSingle(pick.symbol);
      if (qobj) {
        base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
        setQuotes((p) => ({ ...p, [pick.symbol]: qobj }));
        if (qobj.regularMarketPrice != null) {
          const arr = priceHistoryRef.current[pick.symbol] ? [...priceHistoryRef.current[pick.symbol]] : [];
          arr.push(Number(qobj.regularMarketPrice));
          priceHistoryRef.current[pick.symbol] = arr.slice(-120);
          setPriceHistoryState({ ...priceHistoryRef.current });
        }
      }
    } catch {}
    setAssets((p) => [...p, base]);
    // reset add form
    setSelected(null);
    setQuery("");
    setQtyInput("");
    setAvgInput("");
    setAvgCcy("USD");
  }

  function beginEdit(a) {
    setEditingId(a.id);
    setEditDraft((p) => ({ ...p, [a.id]: { qty: String(a.qty), avgInput: String(a.avgInput ?? a.avgUSD ?? ""), inputCurrency: a.inputCurrency || "USD" } }));
  }

  function saveEdit(id) {
    const draft = editDraft[id];
    if (!draft) {
      setEditingId(null);
      return;
    }
    const q = toNum(draft.qty);
    const a = toNum(draft.avgInput);
    const ccy = draft.inputCurrency || "USD";
    if (q <= 0 || a <= 0) {
      alert("Qty & Avg harus > 0");
      setEditingId(null);
      return;
    }
    const avgUSD = ccy === "IDR" ? a / (usdIdr || 1) : a;
    setAssets((p) => p.map((x) => (x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: ccy, avgUSD } : x)));
    setEditingId(null);
    setEditDraft((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
  }

  function cancelEdit(id) {
    setEditingId(null);
    setEditDraft((p) => {
      const cp = { ...p };
      delete cp[id];
      return cp;
    });
  }

  function removeAsset(id) {
    setAssets((p) => p.filter((x) => x.id !== id));
    // prune price history if no asset uses symbol
    priceHistoryRef.current = Object.keys(priceHistoryRef.current).reduce((acc, k) => {
      const keep = assets.some((a) => a.id !== id && a.symbol === k);
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
    setAssets((p) => p.map((x) => (x.id === a.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD, inputCurrency: curr } : x)));
  }

  function sellSome(a) {
    const qtyStr = prompt(`Sell qty for ${a.symbol}:`, "0");
    const sq = toNum(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    // use latest priceUSD
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD((p) => p + realized);
    const remain = a.qty - sq;
    if (remain <= 0) removeAsset(a.id);
    else setAssets((p) => p.map((x) => (x.id === a.id ? { ...x, qty: remain } : x)));
  }

  function openTradingView(r) {
    let tv = r.symbol;
    if (tv?.endsWith(".JK")) tv = `IDX:${tv.replace(".JK", "")}`;
    if (!tv.includes(":") && /^[A-Z0-9._-]{1,10}$/.test(tv)) tv = `NASDAQ:${tv}`;
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  // UI
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
                <span>Last sync: {isSyncing ? "syncing…" : new Date().toLocaleTimeString()}</span>
              )}
              {" "}• USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span>
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

        {/* Add bar */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search symbol (AAPL, BBCA.JK, BTC-USD, BTCUSDT, etc)..."
                className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {suggestLoading ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent border-gray-400 animate-spin" /> : null}
              </div>

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
              ) : rows.map((r) => {
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

/* minor export helper sparkline component declared after component to keep file tidy */
function Sparkline({ data = [], w = 72, h = 28 }) {
  if (!data || data.length === 0) return <svg width={w} height={h} />;
  const pts = data.slice(-40);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const step = w / Math.max(1, pts.length - 1);
  let path = "";
  pts.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={path} fill="none" stroke="#16a34a" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}