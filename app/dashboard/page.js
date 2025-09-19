"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Utility: format currency
function fmtMoney(v, ccy = "USD") {
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v || 0);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v || 0);
}
function isoDate(t) { return new Date(t).toISOString().split("T")[0]; }
function toNum(v) { return Number(v) || 0; }
function hashStringToSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function seededRng(seed) {
  let x = seed % 2147483647;
  return function () {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

/* ---------- Component ---------- */
export default function PortfolioDashboard() {
  const [assets, setAssets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pf_assets_v2") || "[]"); } catch { return []; }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try { return parseFloat(localStorage.getItem("pf_realized_v2") || "0"); } catch { return 0; }
  });
  const [displayCcy, setDisplayCcy] = useState(() => localStorage.getItem("pf_display_ccy_v2") || "USD");
  const [transactions, setTransactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pf_transactions_v2") || "[]"); } catch { return []; }
  });

  const [usdIdr, setUsdIdr] = useState(16000);
  const [fxLoading, setFxLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---------- add/search state ---------- */
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("crypto");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  const [nlName, setNlName] = useState("");
  const [nlQty, setNlQty] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [nlPriceCcy, setNlPriceCcy] = useState("USD");
  const [nlPurchaseDate, setNlPurchaseDate] = useState("");
  const [nlYoy, setNlYoy] = useState("5");
  const [nlDesc, setNlDesc] = useState("");

  const [depositIdrInput, setDepositIdrInput] = useState("");
  const [depositUsdInput, setDepositUsdInput] = useState("");
  const [depositTotal, setDepositTotal] = useState(0);

  /* ---------- live quotes ---------- */
  const [lastTick, setLastTick] = useState(null);

  /* ---------- filter & UI ---------- */
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);

  /* ---------- table sort menu ---------- */
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  /* ---------- transactions / undo ---------- */
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [lastDeletedTx, setLastDeletedTx] = useState(null);

  /* ---------- trade modal ---------- */
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: null });
  const [chartModal, setChartModal] = useState({ open: false, symbol: "", type: "", coingeckoId: "" });

  /* ---------- chart timeframe ---------- */
  const [chartRange, setChartRange] = useState("all");
  const [chartHover, setChartHover] = useState(null);

  /* ---------- sorting ---------- */
  const [sortBy, setSortBy] = useState("market_desc");

  /* ---------- refs ---------- */
  const filterMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const suggestionsRef = useRef(null);
  const addPanelRef = useRef(null);
  const currencyMenuRef = useRef(null);

  /* ---------- persist ---------- */
  useEffect(() => {
    try { localStorage.setItem("pf_assets_v2", JSON.stringify(assets.map(ensureNumericAsset))); } catch {}
  }, [assets]);
  useEffect(() => {
    try { localStorage.setItem("pf_realized_v2", String(realizedUSD)); } catch {}
  }, [realizedUSD]);
  useEffect(() => {
    try { localStorage.setItem("pf_display_ccy_v2", displayCcy); } catch {}
  }, [displayCcy]);
  useEffect(() => {
    try { localStorage.setItem("pf_transactions_v2", JSON.stringify(transactions || [])); } catch {}
  }, [transactions]);

  /* click outside (close menus) */
  useEffect(() => {
    function onPointerDown(e) {
      const target = e.target;
      if (filterMenuOpen && filterMenuRef.current && !filterMenuRef.current.contains(target) && !e.target.closest('[aria-label="Filter"]')) {
        setFilterMenuOpen(false);
      }
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(target) && !e.target.closest('[aria-label="Sort"]')) {
        setSortMenuOpen(false);
      }
      if (suggestions.length > 0 && suggestionsRef.current && !suggestionsRef.current.contains(target) && !addPanelRef.current?.contains(target)) {
        setSuggestions([]);
      }
      if (openAdd && addPanelRef.current && !addPanelRef.current.contains(target) && !e.target.closest('[aria-label="Add asset"]')) {
        setOpenAdd(false);
      }
      if (currencyMenuOpen && currencyMenuRef.current && !currencyMenuRef.current.contains(target) && !e.target.closest('[aria-label="Currency"]')) {
        setCurrencyMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [filterMenuOpen, sortMenuOpen, suggestions, openAdd, currencyMenuOpen]);

  /* search (unchanged) */
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "nonliquid") {
      setSuggestions([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === "crypto") {
          const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map((c) => ({
            id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name,
            source: "coingecko", type: "crypto",
          })));
          return;
        }
        const proxyCandidates = [
          (t) => `/api/search?q=${encodeURIComponent(t)}`,
        ];
        let payload = null;
        for (const p of proxyCandidates) {
          try {
            const url = typeof p === "function" ? p(q) : p(q);
            const res = await fetch(url);
            if (!res.ok) continue;
            payload = await res.json();
            if (payload) break;
          } catch (e) {}
        }
        if (!payload) { setSuggestions([]); return; }

        const rawList = payload.quotes || payload.result || (payload.data && payload.data.quotes) || (payload.finance && payload.finance.result && payload.finance.result.quotes) || payload.items || [];
        const list = (Array.isArray(rawList) ? rawList : []).slice(0, 120).map((it) => {
          const symbol =
            it.symbol ||
            it.ticker ||
            it.symbolDisplay ||
            it.id ||
            (typeof it === "string" ? it : "");
          const display =
            it.shortname ||
            it.shortName ||
            it.longname ||
            it.longName ||
            it.name ||
            it.title ||
            it.displayName ||
            it.description ||
            symbol;
          return {
            symbol: (symbol || "").toString().toUpperCase(),
            display,
            source: "stock",
            type: "stock",
            exchange: it.fullExchangeName || "",
          };
        });
        setSuggestions(list);
      } catch (e) {
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  /* ---------- Buy/Sell/Trade ---------- */
  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() {
    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null });
  }
  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    const cost = q * p;
    // Check trading balance
    const investedSum = assets.reduce((s, a) => s + toNum(a.investedUSD), 0);
    const available = depositTotal - investedSum;
    if (cost > available) { alert("Not enough trading balance"); return; }
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: id,
      assetType: (assets.find(a=>a.id===id)||{}).type || "stock",
      symbol: (assets.find(a=>a.id===id)||{}).symbol || "",
      name: (assets.find(a=>a.id===id)||{}).name || "",
      type: "buy",
      qty: q,
      pricePerUnit: p,
      cost,
      date: Date.now(),
    };
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    applyTransactionEffects(tx);
    closeTradeModal();
  }
  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    const a = assets.find(x => x.id === id); if (!a) return;
    const oldShares = toNum(a.shares || 0); if (q > oldShares) { alert("Cannot sell more than you own"); return; }
    const avg = toNum(a.avgPrice || 0);
    const proceeds = q * p, costOfSold = q * avg;
    const realized = proceeds - costOfSold;
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: a.id,
      assetType: a.type || "stock",
      symbol: a.symbol,
      name: a.name || "",
      type: "sell",
      qty: q,
      pricePerUnit: p,
      proceeds,
      costOfSold,
      realized,
      date: Date.now(),
    };
    applyTransactionEffects(tx);
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    closeTradeModal();
  }
  function performDeposit() {
    const idrAmt = toNum(depositIdrInput);
    const usdAmt = toNum(depositUsdInput);
    const depositUSD = (idrAmt > 0 ? idrAmt / usdIdr : 0) + (usdAmt > 0 ? usdAmt : 0);
    if (depositUSD <= 0) { alert("Enter deposit amount"); return; }
    setDepositTotal(prev => prev + depositUSD);
    setDepositIdrInput(""); setDepositUsdInput("");
  }

  /* transactions delete/restore */
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Delete & CANCEL transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || (tx.cost/tx.qty))})? This will reverse its effect and can be undone.`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(tx);
  }
  function restoreTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm(`Restore (reverse) transaction for ${tx.symbol} (${tx.qty} @ ${fmtMoney(tx.pricePerUnit || (tx.cost/tx.qty))})?`)) return;
    reverseTransactionEffects(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }
  function undoLastDeletedTransaction() {
    if (!lastDeletedTx) return;
    applyTransactionEffects(lastDeletedTx);
    setTransactions(prev => [lastDeletedTx, ...prev]);
    setLastDeletedTx(null);
  }
  function purgeLastDeletedTransaction() { setLastDeletedTx(null); }

  /* remove asset */
  function removeAsset(id) {
    const a = assets.find(x => x.id === id); if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }
  function openChartModal(asset) {
    setChartModal({ open: true, symbol: asset.symbol, type: asset.type, coingeckoId: asset.coingeckoId || asset.id });
  }

  /* computed rows & totals */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    if (aa.type === "nonliquid") {
      const last = computeNonLiquidLastPrice(aa.avgPrice, aa.purchaseDate || aa.createdAt, aa.nonLiquidYoy || 0);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares || 0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || 0);
      if (!aa.lastPriceUSD || aa.lastPriceUSD <= 0) {
        aa.lastPriceUSD = aa.avgPrice || aa.lastPriceUSD || 0;
      }
      aa.marketValueUSD = toNum(aa.shares || 0) * aa.lastPriceUSD;
    }
    const last = aa.lastPriceUSD || aa.avgPrice || 0;
    const market = aa.marketValueUSD || (toNum(aa.shares || 0) * last);
    const invested = toNum(aa.investedUSD || 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { ...aa, lastPriceUSD: last, marketValueUSD: market, investedUSD: invested, pnlUSD: pnl, pnlPct };
  }), [assets, usdIdr]);

  const filteredRows = useMemo(() => {
    if (portfolioFilter === "all") return rows;
    if (portfolioFilter === "crypto") return rows.filter(r => r.type === "crypto");
    if (portfolioFilter === "stock") return rows.filter(r => r.type === "stock");
    if (portfolioFilter === "nonliquid") return rows.filter(r => r.type === "nonliquid");
    return rows;
  }, [rows, portfolioFilter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    switch (sortBy) {
      case "market_desc": copy.sort((a,b) => b.marketValueUSD - a.marketValueUSD); break;
      case "invested_desc": copy.sort((a,b) => b.investedUSD - a.investedUSD); break;
      case "pnl_desc": copy.sort((a,b) => b.pnlUSD - a.pnlUSD); break;
      case "symbol_asc": copy.sort((a,b) => a.symbol.localeCompare(b.symbol)); break;
      case "oldest": copy.sort((a,b) => (a.purchaseDate||a.createdAt) - (b.purchaseDate||b.createdAt)); break;
      case "newest": copy.sort((a,b) => (b.purchaseDate||b.createdAt) - (a.purchaseDate||a.createdAt)); break;
      default: break;
    }
    return copy;
  }, [filteredRows, sortBy]);

  const totals = useMemo(() => {
    const invested = filteredRows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows]);

  const tradingBalance = useMemo(() => depositTotal - (totals.invested || 0), [depositTotal, totals]);

  /* donut/cake data */
  const donutData = useMemo(() => {
    const sortedRows = filteredRows.slice().sort((a, b) => b.marketValueUSD - a.marketValueUSD);
    const top = sortedRows.slice(0, 6);
    const other = sortedRows.slice(6);
    const otherTotal = other.reduce((s, r) => s + (r.marketValueUSD || 0), 0);
    const otherSymbols = other.map(r => r.symbol);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal, symbols: otherSymbols });
    return data;
  }, [filteredRows]);

  function colorForIndex(i) {
    const palette = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
    return palette[i % palette.length];
  }

  /* Chart series (growth over time) */
  function buildMultiCategorySeries(rowsForChart, txs, rangeKey) {
    const now = Date.now();
    let earliest = now;
    txs.forEach(t => { if (t.date && t.date < earliest) earliest = t.date; });
    rowsForChart.forEach(r => { if (r.purchaseDate && r.purchaseDate < earliest) earliest = r.purchaseDate; });
    const defaultDays = rangeKey === "1d" ? 1 : rangeKey === "2d" ? 2 : rangeKey === "1w" ? 7 : rangeKey === "1m" ? 30 : rangeKey === "1y" ? 365 : 365 * 3;
    const start = (earliest < now) ? earliest : (now - defaultDays * 24 * 3600 * 1000);
    let points = 180;
    if (rangeKey === "1d") points = 48;
    if (rangeKey === "2d") points = 96;
    if (rangeKey === "1w") points = 56;
    if (rangeKey === "1m") points = 90;
    if (rangeKey === "1y") points = 180;
    if (rangeKey === "all") points = 200;

    const txsByAsset = {};
    txs.slice().forEach(t => {
      if (!txsByAsset[t.assetId]) txsByAsset[t.assetId] = [];
      txsByAsset[t.assetId].push(t);
    });

    const syntheticTxs = [];
    rowsForChart.forEach(r => {
      const assetTxs = txsByAsset[r.id] || [];
      if ((assetTxs.length === 0) && (toNum(r.shares || 0) > 0)) {
        syntheticTxs.push({
          id: `synth:${r.id}:${r.purchaseDate || r.createdAt || Date.now()}`,
          assetId: r.id,
          assetType: r.type,
          symbol: r.symbol,
          name: r.name,
          type: "buy",
          qty: toNum(r.shares || 0),
          pricePerUnit: toNum(r.avgPrice || 0),
          cost: toNum(r.investedUSD || (r.avgPrice * r.shares) || 0),
          date: r.purchaseDate || r.createdAt || Date.now(),
        });
      }
    });

    const allTxs = [...txs, ...syntheticTxs].slice().sort((a,b) => (a.date||0) - (b.date||0));

    function sharesUpTo(assetId, t) {
      let s = 0;
      for (const tx of allTxs) {
        if (tx.assetId !== assetId) continue;
        if ((tx.date || 0) <= t) {
          if (tx.type === "buy") s += toNum(tx.qty || 0);
          else if (tx.type === "sell") s -= toNum(tx.qty || 0);
        }
      }
      return s;
    }

    function priceAtTime(asset, t) {
      if (asset.type === "nonliquid") {
        return computeNonLiquidLastPrice(asset.avgPrice || 0, asset.purchaseDate || asset.createdAt || 0, asset.nonLiquidYoy || 0, t);
      }
      const pd = asset.purchaseDate || asset.createdAt || (now - defaultDays * 24 * 3600 * 1000);
      const avg = toNum(asset.avgPrice || 0);
      const last = toNum(asset.lastPriceUSD || avg || 0);
      if (t <= pd) return avg || last;
      if (t >= now) return last || avg;
      const frac = (t - pd) / Math.max(1, (now - pd));
      const base = avg + (last - avg) * frac;
      return Math.max(0, base);
    }

    const seriesPerKey = { all: [], crypto: [], stock: [], nonliquid: [] };
    for (let i = 0; i < points; i++) {
      const t = start + (i / (points - 1)) * (now - start);
      let totals = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
      rowsForChart.forEach(asset => {
        const s = sharesUpTo(asset.id, t);
        if (s <= 0) return;
        const price = priceAtTime(asset, t);
        const val = s * Math.max(0, price || 0);
        totals.all += val;
        if (asset.type === "crypto") totals.crypto += val;
        else if (asset.type === "stock") totals.stock += val;
        else if (asset.type === "nonliquid") totals.nonliquid += val;
      });
      Object.keys(totals).forEach(k => seriesPerKey[k].push({ t, v: totals[k] }));
    }
    return seriesPerKey;
  }

  const multiSeries = useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  const categoryValuesNow = useMemo(() => {
    const out = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
    try {
      Object.keys(multiSeries).forEach(k => {
        const arr = multiSeries[k] || [];
        const last = arr[arr.length - 1];
        out[k] = last ? last.v : 0;
      });
    } catch (e) {}
    return out;
  }, [multiSeries]);

  const titleForFilter = {
    all: "All Portfolio",
    crypto: "Crypto Portfolio",
    stock: "Stocks Portfolio",
    nonliquid: "Non-Liquid Portfolio",
  };
  const headerTitle = titleForFilter[portfolioFilter] || "Portfolio";

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      <style>{`
        .btn { transition: transform 180ms, box-shadow 180ms, background-color 120ms; }
        .btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 8px 22px rgba(0,0,0,0.45); }
        .btn-soft:hover { transform: translateY(-2px) scale(1.01); }
        .rotate-open { transform: rotate(45deg); transition: transform 220ms; }
        .icon-box { transition: transform 160ms, background 120ms; }
        .slice { cursor: pointer; }
        .menu-scroll { max-height: 16rem; overflow:auto; overscroll-behavior: contain; scrollbar-width: thin; }
      `}</style>

      <div className="max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 relative">
            <button onClick={() => setFilterMenuOpen(v => !v)} className="inline-flex items-center justify-center text-gray-200" title="Filter portfolio">
              <span className="text-2xl font-semibold">{headerTitle}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" className="ml-2" fill="none">
                <path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {filterMenuOpen && (
              <div ref={filterMenuRef} className="absolute mt-2 left-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-44 menu-scroll">
                <button onClick={() => { setPortfolioFilter("all"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">All</button>
                <button onClick={() => { setPortfolioFilter("crypto"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Crypto</button>
                <button onClick={() => { setPortfolioFilter("stock"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Stocks</button>
                <button onClick={() => { setPortfolioFilter("nonliquid"); setFilterMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Non-Liquid</button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Currency dropdown */}
            <div className="relative">
              <button onClick={() => setCurrencyMenuOpen(v => !v)} className="inline-flex items-center gap-2" title="Currency">
                <span style={{whiteSpace: "nowrap", fontSize: 20, fontWeight: 700}}>
                  {displayCcy === "IDR"
                    ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(totals.market * usdIdr)} IDR`
                    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(totals.market)} USD`}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" className="ml-1" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {currencyMenuOpen && (
                <div ref={currencyMenuRef} className="absolute mt-2 right-0 z-50 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-36">
                  <button onClick={() => { setDisplayCcy("USD"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">USD</button>
                  <button onClick={() => { setDisplayCcy("IDR"); setCurrencyMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">IDR</button>
                </div>
              )}
            </div>

            <button aria-label="Add asset" onClick={() => setOpenAdd(v => !v)}
              className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn`} title="Add asset">
              <span style={{ display: "inline-block", transformOrigin: "50% 50%", transition: "transform 220ms" }} className={openAdd ? "rotate-open" : ""}>+</span>
            </button>
          </div>
        </div>

        {/* SUBHEADER */}
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          {isInitialLoading && assets.length > 0 ? (
            <>
              <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading portfolio data...</span>
            </>
          ) : (
            lastTick &&
            <>
              <span>Updated: {new Date(lastTick).toLocaleString()}</span>
              <span>•</span>
              <span className="flex items-center gap-1">USD/IDR ≈ {fxLoading ? (
                <svg className="animate-spin h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                `${(usdIdr).toFixed(0)}`
              )}</span>
            </>
          )}
        </div>

        {/* CSV/Export/Import Buttons - top-level */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm items-center">
          <div className="flex justify-between text-gray-400">
            <div>Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.invested * usdIdr, "IDR") : fmtMoney(totals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Market</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Trading Balance</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(tradingBalance * usdIdr, "IDR") : fmtMoney(tradingBalance, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Gain P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")}
              <span className={`text-xs ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totals.pnlPct.toFixed(2)}%</span>
            </div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Realized P&L</div>
            <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => { setSearchMode("deposit"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "deposit" ? "bg-gray-800" : ""} btn-soft`}>Deposit</button>
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "crypto" ? "bg-gray-800" : ""} btn-soft`}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "id" ? "bg-gray-800" : ""} btn-soft`}>Stocks ID</button>
                <button onClick={() => { setSearchMode("us"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "us" ? "bg-gray-800" : ""} btn-soft`}>Stocks US</button>
                <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === "nonliquid" ? "bg-gray-800" : ""} btn-soft`}>Non-Liquid</button>
              </div>
            </div>

            {searchMode === "deposit" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Deposit (IDR)</label>
                  <input type="number" value={depositIdrInput} onChange={(e) => setDepositIdrInput(e.target.value)} placeholder="0" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Deposit (USD)</label>
                  <input type="number" value={depositUsdInput} onChange={(e) => setDepositUsdInput(e.target.value)} placeholder="0" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div className="flex items-end">
                  <button onClick={performDeposit} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Deposit</button>
                </div>
              </div>
            ) : searchMode !== "nonliquid" ? (
              <div className="flex gap-3 flex-col sm:flex-row items-start">
                <div className="relative w-full sm:max-w-lg">
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === "crypto" ? "Search crypto (BTC, ethereum)..." : "Search (AAPL | BBCA.JK)"} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-800" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute z-50 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-56 overflow-auto">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-900 flex justify-between">
                          <div>
                            <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                            <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange || ''}`}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Initial qty" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Initial price" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800 w-full sm:w-32" />
                <select value={initPriceCcy} onChange={(e) => setInitPriceCcy(e.target.value)} className="rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                  <option value="USD">USD</option> <option value="IDR">IDR</option>
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={() => selectedSuggestion ? addAssetFromSuggestion(selectedSuggestion) : addManualAsset()} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add</button>
                  <button onClick={addAssetWithInitial} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Assets</button>
                  {/* Removed Close/Delete buttons per instructions */}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Name (Land, Art, Rolex...)</label>
                  <input value={nlName} onChange={(e) => setNlName(e.target.value)} placeholder="e.g. Land, Art, Rolex" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Quantity</label>
                  <input value={nlQty} onChange={(e) => setNlQty(e.target.value)} placeholder="1" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Price (per unit)</label>
                  <input value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} placeholder="100000" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Currency</label>
                  <select value={nlPriceCcy} onChange={(e) => setNlPriceCcy(e.target.value)} className="w-full rounded-md bg-gray-900 px-2 py-2 text-sm border border-gray-800">
                    <option value="USD">USD</option>
                    <option value="IDR">IDR</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Purchase date</label>
                  <input type="date" value={nlPurchaseDate} onChange={(e) => setNlPurchaseDate(e.target.value)} className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">YoY gain (%)</label>
                  <input value={nlYoy} onChange={(e) => setNlYoy(e.target.value)} placeholder="5" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-gray-400">Description</label>
                  <input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} placeholder="Optional description" className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                </div>
                <div className="sm:col-span-2 flex items-end justify-end">
                  <button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Asset</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TABLE + SORT */}
        <div className="mt-6" style={{ overflowX: 'auto', overflowY: 'visible' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-400">Assets</div>
            <div className="flex items-center gap-2 relative">
              <button aria-label="Sort" onClick={() => setSortMenuOpen(v => !v)} className="inline-flex items-center justify-center rounded px-2 py-1 bg-gray-900 border border-gray-800 text-gray-200 btn" title="Sort assets">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6h12" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M9 12h6" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M11 18h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
              {sortMenuOpen && (
                <div ref={sortMenuRef} className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden w-56 z-40 menu-scroll">
                  <button onClick={() => { setSortBy("market_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Value (high → low)</button>
                  <button onClick={() => { setSortBy("invested_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Invested (high → low)</button>
                  <button onClick={() => { setSortBy("pnl_desc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">P&L (high → low)</button>
                  <button onClick={() => { setSortBy("symbol_asc"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">A → Z</button>
                  <button onClick={() => { setSortBy("oldest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Oldest</button>
                  <button onClick={() => { setSortBy("newest"); setSortMenuOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">Newest</button>
                </div>
              )}
            </div>
          </div>

          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code <div className="text-xs text-gray-500">Description</div></th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg price</div></th>
                <th className="text-right py-2 px-3">Market value <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : sortedRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <button onClick={() => openChartModal(r)} className="text-left font-semibold text-gray-100">{r.symbol}</button>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? (displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")) : "-"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(r.pnlUSD * usdIdr, "IDR") : fmtMoney(r.pnlUSD, "USD")}</div>
                    <div className={`text-xs ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openTradeModal(r.id, "buy")} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Buy</button>
                      <button onClick={() => openTradeModal(r.id, "sell")} className="bg-yellow-600 px-2 py-1 rounded text-xs btn">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CHART MODAL */}
        {chartModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-3xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">{chartModal.symbol} Chart</div>
                <button onClick={() => setChartModal({ open: false, symbol: "", type: "", coingeckoId: "" })} className="text-gray-200 text-xl">&times;</button>
              </div>
              <div className="h-96 w-full">
                {chartModal.type === "crypto" ? (
                  <iframe src={`https://s.tradingview.com/embed-widget/mini-symbol-overview?symbol=BINANCE:${chartModal.symbol}USDT`} style={{width:"100%", height:"100%"}} frameBorder="0"></iframe>
                ) : (
                  <p className="text-center text-gray-400">CoinGecko chart for {chartModal.symbol} not available in this demo.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PORTFOLIO GROWTH */}
        <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Portfolio Growth</div>
            <div className="flex items-center gap-2">
              {["1d","2d","1w","1m","1y","all"].map(k => (
                <button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange===k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300"} btn`}>{k}</button>
              ))}
            </div>
          </div>
          <CandlesWithLines
            seriesMap={multiSeries}
            displayCcy={displayCcy}
            usdIdr={usdIdr}
            width={900}
            height={300}
            rangeKey={chartRange}
            onHover={(p) => { setChartHover(p); }}
          />
        </div>

        {/* DONUT ALLOCATION */}
        {filteredRows.length > 0 && (
          <div className="mt-6 flex flex-row items-center gap-6">
            <div className="w-44 h-44 flex items-center justify-center">
              <CakeAllocation
                data={donutData}
                size={176}
                inner={48}
                gap={0.06}
                displayTotal={displayCcy === "IDR" ? fmtMoney(totals.market * usdIdr, "IDR") : fmtMoney(totals.market, "USD")}
                displayCcy={displayCcy}
                usdIdr={usdIdr}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {donutData.map((d, i) => {
                const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                return (
                  <div key={d.name} className="flex items-center gap-3">
                    <div style={{ width: 12, height: 12, background: colorForIndex(i) }} className="rounded-full" />
                    <div>
                      <div className="text-sm text-gray-100">{d.name}</div>
                      {d.name === "Other" ? (
                        <div className="text-xs text-gray-400">
                          {d.symbols.join(', ')} <br/>
                          {displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">
                          {displayCcy === "IDR" ? fmtMoney(d.value * usdIdr, "IDR") : fmtMoney(d.value, "USD")} • {pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* EXPORT / IMPORT CSV (buttons white) */}
        <div className="mt-8 p-4 rounded bg-gray-900 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <div className="text-sm text-gray-300">CSV: export / import (combined)</div>
            <div className="text-xs text-gray-500">Export contains ASSETS and TRANSACTIONS in one CSV file. File includes header markers (#ASSETS, #TRANSACTIONS) and ISO dates for clean spreadsheet import.</div>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <button onClick={exportAllCSV} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-blue-600 hover:text-white">Export CSV</button>
            </div>
            <label className="bg-white text-black px-3 py-2 rounded font-semibold cursor-pointer btn hover:bg-emerald-500 hover:text-white">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={onImportClick} className="hidden" />
            </label>
            <button onClick={() => {
              if (!confirm("This will clear your portfolio and realized P&L. Continue?")) return;
              setAssets([]); setRealizedUSD(0); setTransactions([]); setLastDeletedTx(null);
            }} className="bg-white text-black px-3 py-2 rounded font-semibold btn hover:bg-red-600 hover:text-white">Clear All</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ensure numeric types
function ensureNumericAsset(a) {
  return {
    ...a,
    shares: toNum(a.shares),
    avgPrice: toNum(a.avgPrice),
    investedUSD: toNum(a.investedUSD),
    lastPriceUSD: toNum(a.lastPriceUSD),
    marketValueUSD: toNum(a.marketValueUSD),
  };
}
function computeNonLiquidLastPrice(avgPrice, purchaseDate, yoy, t=Date.now()) {
  const years = (t - (purchaseDate||Date.now()))/1000/60/60/24/365.25;
  return avgPrice * Math.pow(1 + toNum(yoy||0)/100, years);
}

// (Placeholder functions for addAsset)
function addAssetFromSuggestion(s) { /* ... */ }
function addManualAsset() { /* ... */ }
function addNonLiquidAsset() { /* ... */ }