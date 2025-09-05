"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 Final unified dashboard (single-file)
 - Yahoo Finance search + quotes (polling)
 - CoinGecko search + crypto prices (polling)
 - TradingView link on click
 - Inline edit (works), add, buy, sell, delete
 - Currency dropdown (IDR/USD) updates ALL displayed numbers
 - Donut allocation
 - LocalStorage persistence
 Notes: Yahoo endpoints can be blocked by CORS in some hosts — if that happens we'll add a server-side proxy.
*/

/* ====== CONFIG ====== */
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const YAHOO_QUOTE = (symbols) => `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
const COINGECKO_SEARCH = (q) => `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_USD_IDR = `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr`;

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

function fmt(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* best-effort quote currency */
function guessQuoteCurrency(symbol, yahooCurrency) {
  if (yahooCurrency) return yahooCurrency;
  if (!symbol) return "USD";
  if (symbol.includes(".JK") || symbol.startsWith("IDX:") || symbol.includes("IDR")) return "IDR";
  if (/USDT|USD/i.test(symbol)) return "USD";
  return "USD";
}

/* normalize small IDR values (some APIs give 16.4 instead of 16400) */
function normalizeIdr(v) {
  const n = Number(v);
  if (!n || isNaN(n)) return null;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
}

/* simple donut svg */
function Donut({ data = [], size = 140, inner = 60 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 6;
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
        const x1 = cx + r * Math.cos(sRad), y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad), y2 = cy + r * Math.sin(eRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={i} d={path} fill={colors[i % colors.length]} stroke="rgba(0,0,0,0.08)" strokeWidth="0.4" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* Loading spinner component */
function LoadingSpinner({ size = "small" }) {
  const spinnerSize = size === "small" ? "w-4 h-4" : "w-8 h-8";
  return (
    <div className={`inline-block ${spinnerSize} animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]`} role="status">
      <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
    </div>
  );
}

/* ====== MAIN ====== */
export default function DashboardPage() {
  /* persisted data */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_final") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_final") || "0");
    } catch {
      return 0;
    }
  });

  /* display & FX */
  const [displayCcy, setDisplayCcy] = useState("IDR");
  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);

  /* live prices stores */
  const [yahooQuotes, setYahooQuotes] = useState({}); // symbol -> quote object from yahoo
  const [cryptoPrices, setCryptoPrices] = useState({}); // cg id -> { usd: number }
  const [lastTick, setLastTick] = useState(null);

  /* search */
  const [query, setQuery] = useState("");
  const debQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);

  /* add inputs */
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD");

  /* editing (inline) - mapping id -> fields */
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({}); // { [id]: { qty, avgInput, inputCurrency } }

  /* refs for polling intervals */
  const pollYahooRef = useRef(null);
  const pollCgRef = useRef(null);
  const pollFxRef = useRef(null);

  /* persist effects */
  useEffect(() => { try { localStorage.setItem("bb_assets_final", JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("bb_realized_usd_final", String(realizedUSD)); } catch {} }, [realizedUSD]);

  /* SEARCH (Yahoo + Coingecko) */
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
        const yahooP = fetch(YAHOO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        const cgP = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
        const [yh, cg] = await Promise.allSettled([yahooP, cgP]);
        if (cancelled) return;

        const yhResult = yh.status === 'fulfilled' ? await yh.value : null;
        const cgResult = cg.status === 'fulfilled' ? await cg.value : null;

        const yhList = (yhResult && Array.isArray(yhResult.quotes)) ? yhResult.quotes.slice(0, 12).map(it => ({
          source: "yahoo",
          symbol: it.symbol,
          display: it.shortname || it.longname || it.symbol,
          currency: it.currency || it.exchange || null,
        })) : [];

        const cgList = (cgResult && Array.isArray(cgResult.coins)) ? cgResult.coins.slice(0, 10).map(it => ({
          source: "coingecko",
          coingeckoId: it.id,
          symbol: it.symbol.toUpperCase(),
          display: it.name,
        })) : [];

        // merge crypto first (useful), then yahoo
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

  /* POLL Yahoo quotes every 5s for tracked yahoo symbols */
  useEffect(() => {
    let mounted = true;
    async function pollYahoo() {
      try {
        const symbols = Array.from(new Set(assets.filter(a => a.source === "yahoo").map(a => a.symbol))).slice(0, 50);
        if (symbols.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(symbols));
        if (!mounted || !res.ok) return;
        const j = await res.json();
        const map = {};
        if (j?.quoteResponse?.result && Array.isArray(j.quoteResponse.result)) {
          j.quoteResponse.result.forEach(q => { if (q && q.symbol) map[q.symbol] = q; });
        }
        setYahooQuotes(prev => ({ ...prev, ...map }));
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
        setLastTick(Date.now());
      } catch (e) {}
    }
    pollCg();
    pollCgRef.current = setInterval(pollCg, 6000);
    return () => { mounted = false; if (pollCgRef.current) clearInterval(pollCgRef.current); };
  }, [assets]);

  /* FX fallback USD/IDR every 60s via CoinGecko tether->idr */
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
      } finally {
        if (mounted) setFxLoading(false);
      }
    }
    fetchFx();
    pollFxRef.current = setInterval(fetchFx, 60_000);
    return () => { mounted = false; if (pollFxRef.current) clearInterval(pollFxRef.current); };
  }, []);

  /* fetch initial quote helper */
  async function fetchYahooQuoteSingle(symbol) {
    try {
      const res = await fetch(YAHOO_QUOTE([symbol]));
      if (!res.ok) return null;
      const j = await res.json();
      if (j?.quoteResponse?.result && j.quoteResponse.result[0]) return j.quoteResponse.result[0];
      return null;
    } catch { return null; }
  }

  /* rows: combine assets with live prices & compute USD-base math */
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

  const pie = useMemo(() => rows.map(r => ({ name: r.symbol || r.displayName || "?", value: Math.max(0, r.marketUSD || 0) })).filter(x => x.value > 0), [rows]);

  /* ACTIONS */
  function selectSuggestion(item) {
    setSelected(item);
    if (item.source === "coingecko") setQuery(`${item.symbol} — ${item.display}`);
    else setQuery(`${item.symbol} — ${item.display}`);
    setSuggestions([]); // clear visible suggestions
  }

  async function addAsset() {
    let pick = selected;
    if (!pick && query) {
      // allow manual symbol typed (common yahoo style: AAPL, BBCA.JK)
      const typed = query.split("—")[0].trim();
      if (typed) pick = { source: "yahoo", symbol: typed, display: typed };
    }
    if (!pick) { alert("Pilih asset dari suggestion atau ketik symbol (mis. AAPL, BBCA.JK, BTC)."); return; }
    const q = toNum(qtyInput);
    const a = toNum(avgInput);
    if (q <= 0 || a <= 0) { alert("Qty & Avg harus > 0"); return; }

    const avgUSD = avgCcy === "IDR" ? a / (usdIdr || 1) : a;
    const base = {
      id: Date.now(),
      source: pick.source,
      symbol: pick.source === "coingecko" ? pick.symbol : pick.symbol,
      coingeckoId: pick.source === "coingecko" ? pick.coingeckoId : undefined,
      displayName: pick.display,
      qty: q,
      avgInput: a,
      inputCurrency: avgCcy,
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
        const qobj = await fetchYahooQuoteSingle(base.symbol);
        if (qobj) {
          base.lastKnownNative = qobj.regularMarketPrice ?? undefined;
          setYahooQuotes(prev => ({ ...prev, [base.symbol]: qobj }));
        }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // reset
    setSelected(null); setQuery(""); setQtyInput(""); setAvgInput(""); setAvgCcy("USD");
  }

  /* inline edit handlers */
  function beginEdit(row) {
    setEditingId(row.id);
    setEditFields(prev => ({ ...prev, [row.id]: { qty: String(row.qty), avgInput: String(row.avgInput ?? row.avgUSD ?? ""), inputCurrency: row.inputCurrency || "USD" } }));
    // scroll into view optionally
  }
  function saveEdit(id) {
    const ef = editFields[id];
    if (!ef) { setEditingId(null); return; }
    const q = toNum(ef.qty);
    const a = toNum(ef.avgInput);
    const ccy = ef.inputCurrency || "USD";
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

  function removeAsset(id) {
    setAssets(prev => prev.filter(a => a.id !== id));
  }

  /* buy/sell operate on "row" (which includes computed priceUSD) */
  function buyMoreRow(row) {
    const qtyStr = prompt(`Buy qty for ${row.symbol || row.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Buy price per unit (in ${row.inputCurrency || "USD"}):`, String(row.avgInput || row.avgUSD || ""));
    const ccy = prompt("Currency (USD/IDR):", row.inputCurrency || "USD");
    const bq = toNum(qtyStr);
    const bp = toNum(priceStr);
    if (bq <= 0 || bp <= 0) return;
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = row.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (row.avgUSD * oldQty + bpUSD * bq) / newQty;
    setAssets(prev => prev.map(x => x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD, avgInput: (curr === "IDR" ? newAvgUSD * (usdIdr || 1) : newAvgUSD), inputCurrency: curr } : x));
  }

  function sellSomeRow(row) {
    const qtyStr = prompt(`Sell qty for ${row.symbol || row.displayName}:`, "0");
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
    if (!tv && row.coingeckoId) { window.open(`https://www.tradingview.com/symbols/${encodeURIComponent(row.coingeckoId)}/`, "_blank"); return; }
    if (tv?.endsWith(".JK")) { const code = tv.replace(".JK", ""); tv = `IDX:${code}`; }
    if (!tv.includes(":") && /^[A-Z0-9-_.]{1,10}$/.test(tv)) { tv = `NASDAQ:${tv}`; }
    window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`, "_blank");
  }

  /* UI */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">Updated: {lastTick ? new Date(lastTick).toLocaleTimeString() : "-"} • USD/IDR ≈ 
              <span className="text-green-400 font-medium ml-1">
                {fxLoading ? <LoadingSpinner size="small" /> : (usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-")}
              </span>
            </p>
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

        {/* Add bar */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Search: AAPL | BBCA.JK | BTC | BINANCE:BTCUSDT ..."
                className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectSuggestion(s)} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol} • ${s.display}` : `${s.symbol} • ${s.display}`}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : "Security (Yahoo)"}</div>
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
              ) : rows.map(r => {
                const editing = editingId === r.id;
                const ef = editFields[r.id] || {};
                return (
                  <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                    <td className="px-3 py-4">
                      <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openTradingView(r)}>{String(r.symbol || r.displayName || "").replace?.("BINANCE:","")}</div>
                      <div className="text-xs text-gray-500">{r.qty}</div>
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
                          <button onClick={() => buyMoreRow(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Buy</button>
                          <button onClick={() => sellSomeRow(r)} className="bg-gray-800 px-2 py-1 rounded text-xs">Sell</button>
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
            <div className="w-40 h-40"><Donut data={pie} size={140} inner={60} /></div>
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