import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { isoDate, toNum, ensureNumericAsset, seededRng, fmtMoney } from "@/lib/utils";
import { TradeModal } from "./TradeModal";
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `https://query2.finance.yahoo.com/v1/finance/search?q=${q}`;
const FINNHUB_QUOTE = (s) => `https://finnhub.io/api/v1/quote?symbol=${s}&token=cj9q46nad3i8ema8tn0g`;
const CSV = dynamic(() => import("react-csv"), { ssr: false });

// ===== Dashboard page component =====
export default function Page() {
  const [assets, setAssets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [realizedUSD, setRealizedUSD] = useState(0);
  const [displayCcy, setDisplayCcy] = useState("USD");

  // ========= States for user input & UI =========
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

  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");
  const [depositTotalUSD, setDepositTotalUSD] = useState(0);
  const [depositFormOpen, setDepositFormOpen] = useState(false);

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
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 20).map((c) => ({
            id: c.id, symbol: (c.symbol || "").toUpperCase(), display: c.name,
            source: "coingecko", type: "crypto",
          })));
          return;
        }

        const proxyCandidates = [
          YAHOO_SEARCH,
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
          const exchange = it.exchange || it.fullExchangeName || it.exchangeName || it.exchDisp || "";
          const currency = it.currency || it.quoteCurrency || "";
          return {
            symbol: (symbol || "").toString().toUpperCase(),
            display: display || symbol,
            exchange,
            currency,
            source: "yahoo",
            type: "stock",
          };
        });

        if (searchMode === "id") {
          setSuggestions(list.filter((x) =>
            (x.symbol || "").toUpperCase().includes(".JK") ||
            String(x.exchange || "").toUpperCase().includes("JAKARTA") ||
            String(x.exchange || "").toUpperCase().includes("IDX")
          ).slice(0, 30));
        } else {
          setSuggestions(list.filter((x) => !(x.symbol || "").toUpperCase().endsWith(".JK")).slice(0, 30));
        }
      } catch (e) {
        console.warn("search err", e);
        setSuggestions([]);
      }
    }, 320);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [query, searchMode]);

  /* polling crypto & stocks (unchanged logic) */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  useEffect(() => {
    let mounted = true;
    async function pollCg() {
      try {
        const ids = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (ids.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const res = await fetch(COINGECKO_API + `/simple/price?ids=${ids.join(",")}&vs_currencies=usd`);
        if (!mounted || !res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const last = toNum(j[a.coingeckoId].usd);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) {}
    }
    pollCg();
    const id = setInterval(pollCg, 6000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  useEffect(() => {
    let mounted = true;
    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock").map(a => a.symbol))).slice(0, 50);
        if (symbols.length === 0) {
          if (isInitialLoading && mounted) setIsInitialLoading(false);
          return;
        }
        const map = {};
        for (const s of symbols) {
          try {
            const res = await fetch(FINNHUB_QUOTE(s));
            if (!res.ok) continue;
            const j = await res.json();
            map[s] = (j.c || 0);
          } catch (e) {}
        }
        if (!mounted) return;
        setAssets(prev => prev.map(a => {
          if (a.type === "stock") {
            const last = toNum(map[a.symbol] || a.lastPriceUSD || 0);
            return ensureNumericAsset({ ...a, lastPriceUSD: last, marketValueUSD: last * toNum(a.shares || 0) });
          }
          return ensureNumericAsset(a);
        }));
        setLastTick(Date.now());
        if (isInitialLoading && mounted) setIsInitialLoading(false);
      } catch (e) {}
    }
    pollStocks();
    const id = setInterval(pollStocks, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, [isInitialLoading]);

  /* Transactions: restore / delete */
  function restoreTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    const asset = assets.find(a => a.id === tx.assetId);
    if (!asset) return;
    const inv = tx.type === "sell" ? asset.investedUSD - tx.realized : asset.investedUSD + tx.cost;
    // Update asset
    setAssets(prev => prev.map(a => a.id === asset.id ? ensureNumericAsset({ ...asset, investedUSD: inv, shares: a.shares + (tx.type === "buy" ? tx.qty : -tx.qty), marketValueUSD: (a.lastPriceUSD || a.avgPrice || 0) * (a.shares + (tx.type === "buy" ? tx.qty : -tx.qty)) }) : a));
    // Update realized
    if (tx.type === "sell") setRealizedUSD(prev => prev - tx.realized);
    setTransactions(prev => prev.filter(t => t.id !== txId));
    setLastDeletedTx(null);
  }
  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    reverseTransactionEffects(tx);
    setLastDeletedTx(tx);
    setTransactions(prev => prev.filter(t => t.id !== txId));
  }

  /* Reverse (cancel) a transaction's effect */
  function reverseTransactionEffects(tx) {
    setAssets(prev => prev.map(a => {
      if (a.id !== tx.assetId) return a;
      const aa = ensureNumericAsset(a);
      if (tx.type === "buy") {
        aa.shares -= tx.qty;
        aa.investedUSD -= tx.cost;
        aa.avgPrice = aa.shares > 0 ? aa.investedUSD / aa.shares : aa.avgPrice;
        if (aa.shares < 0) aa.shares = 0;
      } else if (tx.type === "sell") {
        aa.shares += tx.qty;
        aa.investedUSD += tx.costOfSold;
        aa.avgPrice = aa.shares > 0 ? aa.investedUSD / aa.shares : aa.avgPrice;
      }
      aa.marketValueUSD = aa.shares * (aa.lastPriceUSD || aa.avgPrice || 0);
      return aa;
    }));
    if (tx.type === "sell") setRealizedUSD(prev => prev - tx.realized);
  }

  /* Build rows and totals for portfolio */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumericAsset(a);
    aa.pnlUSD = (aa.marketValueUSD || 0) - (aa.investedUSD || 0);
    aa.pnlPct = aa.investedUSD > 0 ? (aa.pnlUSD / aa.investedUSD) * 100 : 0;
    return aa;
  }), [assets]);

  const filteredRows = useMemo(() => {
    if (portfolioFilter === "all") return rows;
    if (portfolioFilter === "crypto") return rows.filter(r => r.type === "crypto");
    if (portfolioFilter === "stock") return rows.filter(r => r.type === "stock");
    if (portfolioFilter === "nonliquid") return rows.filter(r => r.type === "nonliquid");
    return rows;
  }, [rows, portfolioFilter]);

  const totals = useMemo(() => {
    const investedSum = filteredRows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    const marketSum = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = marketSum - investedSum;
    const pnlPct = investedSum > 0 ? (pnl / investedSum) * 100 : 0;
    return { invested: investedSum, market: marketSum, pnl, pnlPct };
  }, [filteredRows]);

  /* Compute donut chart data */
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
    const palette = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#FF9CEE", "#B28DFF", "#FFB26B", "#6BFFA0", "#FF6BE5", "#00C49F"];
    return palette[i % palette.length];
  }

  /* Format for CSV export */
  function csvQuote(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function exportAllCSV() {
    const assetsHeaders = ["id","type","coingeckoId","symbol","name","description","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","createdAt","purchaseDate","nonLiquidYoy"];
    const txHeaders = ["id","type","assetId","assetType","symbol","name","qty","pricePerUnit","cost","proceeds","costOfSold","realized","date"];

    const lines = [];
    lines.push(`#FILE:app/dashboard/page.js`);
    lines.push(`#EXPORT:CombinedPortfolioAndTransactions,generatedAt=${isoDate(Date.now())}`);
    lines.push(`#ASSETS`);
    lines.push(assetsHeaders.join(","));
    assets.forEach(a => {
      const aa = ensureNumericAsset(a);
      const row = assetsHeaders.map(h => {
        const v = aa[h];
        if (h === "createdAt" || h === "purchaseDate") return csvQuote(v ? isoDate(v) : "");
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push("");
    lines.push(`#TRANSACTIONS`);
    lines.push(txHeaders.join(","));
    transactions.forEach(t => {
      const row = txHeaders.map(h => {
        const v = t[h];
        if (h === "date") return csvQuote(v ? isoDate(v) : "");
        if (typeof v === "number") return String(v);
        return csvQuote(v);
      }).join(",");
      lines.push(row);
    });
    lines.push(`#META,realizedUSD=${realizedUSD},displayCcy=${displayCcy},usdIdr=${usdIdr},assets=${assets.length},transactions=${transactions.length}`);

    const csv = "\uFEFF" + lines.join("\n"); // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio_combined_export_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file, { merge = true } = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const linesRaw = text.split(/\r?\n/);
      if (linesRaw[0] && linesRaw[0].charCodeAt(0) === 0xFEFF) linesRaw[0] = linesRaw[0].slice(1);
      const lines = linesRaw.map(l => l.trimRight());
      if (lines.length === 0) return alert("Empty file");
      const idxAssets = lines.findIndex(l => l.startsWith("#ASSETS"));
      const idxTx = lines.findIndex(l => l.startsWith("#TRANSACTIONS"));
      const metaLine = lines.find(l => l.startsWith("#META"));
      let importedAssets = [];
      if (idxAssets >= 0) {
        let headerLineIdx = -1;
        for (let i = idxAssets + 1; i < lines.length; i++) {
          if (lines[i].trim() === "") continue;
          headerLineIdx = i; break;
        }
        if (headerLineIdx >= 0) {
          const headers = lines[headerLineIdx].split(",").map(h => h.replace(/^"|"$/g,"").trim());
          for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (!l || l.startsWith("#TRANSACTIONS") || l.startsWith("#META") || l.startsWith("#FILE") || l.startsWith("#EXPORT")) break;
            const values = [];
            let cur = "";
            let insideQuote = false;
            for (let k = 0; k < l.length; k++) {
              const ch = l[k];
              if (ch === '"' && l[k+1] === '"') { cur += '"'; k++; continue; }
              if (ch === '"') { insideQuote = !insideQuote; continue; }
              if (ch === "," && !insideQuote) { values.push(cur); cur = ""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
            const parsed = {
              id: obj.id || `imp:${obj.symbol || ""}:${Date.now()}`,
              type: obj.type || "stock",
              coingeckoId: obj.coingeckoId || undefined,
              symbol: (obj.symbol || "").toString().toUpperCase(),
              name: obj.name || obj.symbol || "",
              description: obj.description || "",
              shares: toNum(obj.shares || 0),
              avgPrice: toNum(obj.avgPrice || 0),
              investedUSD: toNum(obj.investedUSD || 0),
              lastPriceUSD: toNum(obj.lastPriceUSD || 0),
              marketValueUSD: toNum(obj.marketValueUSD || 0),
              createdAt: obj.createdAt ? (Date.parse(obj.createdAt) || Date.now()) : Date.now(),
              purchaseDate: obj.purchaseDate ? (Date.parse(obj.purchaseDate) || undefined) : undefined,
              nonLiquidYoy: toNum(obj.nonLiquidYoy) || 0,
            };
            importedAssets.push(ensureNumericAsset(parsed));
          }
        }
      }
      let importedTx = [];
      if (idxTx >= 0) {
        let headerLineIdx = -1;
        for (let i = idxTx + 1; i < lines.length; i++) {
          if (lines[i].trim() === "") continue;
          headerLineIdx = i; break;
        }
        if (headerLineIdx >= 0) {
          const headers = lines[headerLineIdx].split(",").map(h => h.replace(/^"|"$/g,"").trim());
          for (let i = headerLineIdx + 1; i < lines.length; i++) {
            const l = lines[i];
            if (!l || l.startsWith("#META") || l.startsWith("#FILE") || l.startsWith("#EXPORT")) break;
            const values = [];
            let cur = "";
            let insideQuote = false;
            for (let k = 0; k < l.length; k++) {
              const ch = l[k];
              if (ch === '"' && l[k+1] === '"') { cur += '"'; k++; continue; }
              if (ch === '"') { insideQuote = !insideQuote; continue; }
              if (ch === "," && !insideQuote) { values.push(cur); cur = ""; continue; }
              cur += ch;
            }
            values.push(cur);
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
            const parsed = {
              id: obj.id || `imp_tx:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
              type: obj.type || "buy",
              assetId: obj.assetId || obj.assetId,
              assetType: obj.assetType || "stock",
              symbol: (obj.symbol || "").toString().toUpperCase(),
              name: obj.name || obj.symbol || "",
              qty: toNum(obj.qty || 0),
              pricePerUnit: toNum(obj.pricePerUnit || 0),
              cost: toNum(obj.cost || 0),
              proceeds: toNum(obj.proceeds || 0),
              costOfSold: toNum(obj.costOfSold || 0),
              realized: toNum(obj.realized || 0),
              date: obj.date ? (Date.parse(obj.date) || Date.now()) : Date.now(),
            };
            importedTx.push(parsed);
          }
        }
      }

      if (importedAssets.length > 0) {
        if (!merge && !confirm("This will clear your existing portfolio and realized P&L. Continue?")) return;
        if (!merge) {
          setAssets(importedAssets.map(ensureNumericAsset));
          setRealizedUSD(0);
          setTransactions(importedTx || []);
          setLastDeletedTx(null);
        } else {
          setAssets(prev => mergeAssets(prev, importedAssets));
        }
      }
      if (importedTx.length > 0) {
        if (!merge && !importedAssets.length) {
          if (!merge) {
            setAssets([]);
            setRealizedUSD(0);
            setTransactions([]);
            setLastDeletedTx(null);
          }
        }
        setTransactions(prev => mergeTransactions(prev, importedTx, importedAssets));
      }
      if (!merge && importedAssets.length === 0 && importedTx.length === 0 && !confirm("Import had no recognized assets, but had transactions. Clear all?")) return;
      if (!merge && importedAssets.length === 0 && importedTx.length === 0) {
        setAssets([]);
        setRealizedUSD(0);
        setTransactions([]);
        setLastDeletedTx(null);
      }
    };
    reader.readAsText(file);
  }

  function addAssetFromSuggestion(s) {
    const symbol = s.symbol.toUpperCase();
    const displayName = s.display;
    const id = `asset:${symbol}:${Date.now()}`;
    const type = s.type === "crypto" ? "crypto" : "stock";
    const coingeckoId = s.type === "crypto" ? s.id : undefined;
    const newAsset = ensureNumericAsset({
      id,
      type,
      coingeckoId,
      symbol,
      name: displayName,
      description: "",
      shares: 0,
      avgPrice: 0,
      investedUSD: 0,
      lastPriceUSD: 0,
      marketValueUSD: 0,
      createdAt: Date.now(),
      purchaseDate: undefined,
      nonLiquidYoy: 0,
    });
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false);
    setQuery("");
    setInitQty("");
    setInitPrice("");
    setInitPriceCcy("USD");
    setSelectedSuggestion(null);
  }

  function addAssetWithInitial() {
    if (selectedSuggestion) {
      const sym = selectedSuggestion.symbol.toUpperCase();
      const name = selectedSuggestion.display;
      const id = `asset:${sym}:${Date.now()}`;
      const type = selectedSuggestion.type === "crypto" ? "crypto" : "stock";
      const coingeckoId = selectedSuggestion.type === "crypto" ? selectedSuggestion.id : undefined;
      const qty = toNum(initQty);
      const priceInput = toNum(initPrice);
      if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
      const priceUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
      const asset = ensureNumericAsset({
        id,
        type,
        coingeckoId,
        symbol: sym,
        name,
        description: "",
        shares: qty,
        avgPrice: priceUSD,
        investedUSD: priceUSD * qty,
        lastPriceUSD: priceUSD,
        marketValueUSD: priceUSD * qty,
        createdAt: Date.now(),
        purchaseDate: Date.now(),
        nonLiquidYoy: 0,
      });
      setAssets(prev => [...prev, asset]);
      setOpenAdd(false);
      setQuery("");
      setInitQty("");
      setInitPrice("");
      setInitPriceCcy("USD");
      setSelectedSuggestion(null);
    } else {
      addManualAsset();
    }
  }

  function addManualAsset() {
    const sym = query.trim().toUpperCase();
    const name = query.trim();
    if (!sym) { alert("Enter symbol or search"); return; }
    const id = `asset:${sym}:${Date.now()}`;
    const type = searchMode === "crypto" ? "crypto" : "stock";
    const coingeckoId = searchMode === "crypto" ? (selectedSuggestion ? selectedSuggestion.id : undefined) : undefined;
    const newAsset = ensureNumericAsset({
      id,
      type,
      coingeckoId,
      symbol: sym,
      name,
      description: "",
      shares: 0,
      avgPrice: 0,
      investedUSD: 0,
      lastPriceUSD: 0,
      marketValueUSD: 0,
      createdAt: Date.now(),
      purchaseDate: undefined,
      nonLiquidYoy: 0,
    });
    setAssets(prev => [...prev, newAsset]);
    setOpenAdd(false);
    setQuery("");
    setInitQty("");
    setInitPrice("");
    setInitPriceCcy("USD");
    setSelectedSuggestion(null);
  }

  function removeAsset(id) {
    const a = assets.find(x => x.id === id);
    if (!a) return;
    if (!confirm(`Delete ${a.symbol} (${a.name || ""}) from portfolio?`)) return;
    setAssets(prev => prev.filter(x => x.id !== id));
  }

  function addNonLiquidAsset() {
    const name = nlName.trim();
    const qty = toNum(nlQty);
    const priceInput = toNum(nlPrice);
    const purchaseDateMs = nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now();
    const yoy = toNum(nlYoy);
    if (!name) { alert("Enter non-liquid asset name (Land, Art, Rolex...)"); return; }
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price must be > 0"); return; }
    const priceUSD = nlPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const id = `nonliquid:${name.replace(/\s+/g, "_")}:${Date.now()}`;
    const last = computeNonLiquidLastPrice(priceUSD, purchaseDateMs, yoy);
    const asset = ensureNumericAsset({
      id,
      type: "nonliquid",
      symbol: (name.length > 12 ? name.slice(0, 12) + "…" : name).toUpperCase(),
      name,
      description: nlDesc || "",
      shares: qty,
      avgPrice: priceUSD,
      investedUSD: priceUSD * qty,
      lastPriceUSD: last,
      marketValueUSD: last * qty,
      createdAt: Date.now(),
      purchaseDate: purchaseDateMs,
      nonLiquidYoy: yoy,
    });
    setAssets(prev => [...prev, asset]);
    setNlName(""); setNlQty(""); setNlPrice(""); setNlPurchaseDate(""); setNlYoy("5"); setNlDesc("");
    setOpenAdd(false);
  }

  function handleAddDeposit() {
    const idr = toNum(depositIDR);
    const usd = toNum(depositUSD);
    if (idr <= 0 && usd <= 0) { alert("Enter deposit amount"); return; }
    let addUSD = 0;
    if (idr > 0) addUSD += idr / (usdIdr || 1);
    if (usd > 0) addUSD += usd;
    setDepositTotalUSD(prev => prev + addUSD);
    setDepositIDR(""); setDepositUSD(""); setDepositFormOpen(false);
  }

  function openTradeModal(assetId, mode) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const defaultPrice = asset.lastPriceUSD || asset.avgPrice || 0;
    setTradeModal({ open: true, mode, assetId, defaultPrice });
  }
  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null }); }

  function performBuy(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }

    const cost = q * p;
    const investedSum = filteredRows.reduce((s, r) => s + toNum(r.investedUSD || 0), 0);
    if (cost > (depositTotalUSD - investedSum)) { alert("Insufficient trading balance"); return; }

    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: id,
      assetType: (assets.find(a=>a.id===id)||{}).type || "stock",
      symbol: (assets.find(a=>a.id===id)||{}).symbol || "",
      name: (assets.find(a=>a.id===id)||{}).name || "",
      type: "buy",
      qty: q,
      pricePerUnit: p,
      cost: cost,
      proceeds: 0,
      costOfSold: 0,
      realized: 0,
      date: Date.now(),
    };
    applyTransactionEffects(tx);
    setTransactions(prev => [...prev, tx]);
    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null });
  }

  function performSell(qty, pricePerUnit) {
    const id = tradeModal.assetId; if (!id) return;
    const q = toNum(qty), p = toNum(pricePerUnit);
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    if (q <= 0 || p <= 0 || q > asset.shares) { alert("Invalid quantity or price"); return; }

    const proceeds = q * p;
    const realized = proceeds - ((asset.avgPrice || 0) * q);
    const tx = {
      id: `tx:${Date.now()}:${Math.random().toString(36).slice(2,8)}`,
      assetId: id,
      assetType: asset.type,
      symbol: asset.symbol,
      name: asset.name,
      type: "sell",
      qty: q,
      pricePerUnit: p,
      cost: 0,
      proceeds: proceeds,
      costOfSold: (asset.avgPrice || 0) * q,
      realized: realized,
      date: Date.now(),
    };
    applyTransactionEffects(tx);
    setRealizedUSD(prev => prev + realized);
    setTransactions(prev => [...prev, tx]);
    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: null });
  }

  function applyTransactionEffects(tx) {
    setAssets(prev => prev.map(a => {
      if (a.id !== tx.assetId) return a;
      const aa = ensureNumericAsset(a);
      if (tx.type === "buy") {
        aa.shares += tx.qty;
        aa.investedUSD += tx.cost;
        aa.avgPrice = aa.shares > 0 ? aa.investedUSD / aa.shares : aa.avgPrice;
      } else if (tx.type === "sell") {
        aa.shares -= tx.qty;
        aa.investedUSD -= tx.costOfSold;
        aa.avgPrice = aa.shares > 0 ? aa.investedUSD / aa.shares : aa.avgPrice;
      }
      aa.marketValueUSD = aa.shares * (aa.lastPriceUSD || aa.avgPrice || 0);
      return aa;
    }));
  }

  /* build growth series */
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
      const seed = hashStringToSeed(asset.symbol + String(asset.id || ""));
      const rng = seededRng(seed);
      const vol = asset.type === "crypto" ? 0.12 : asset.type === "stock" ? 0.04 : 0.01;
      const base = avg + (last - avg) * frac;
      const noise = (Math.sin(frac * 12 + rng() * 10) * 0.25 + (rng() - 0.5) * 0.4) * vol;
      return Math.max(0, base * (1 + noise));
    }

    const seriesPerKey = { all: [], crypto: [], stock: [], nonliquid: [] };

    for (let i = 0; i < points; i++) {
      const t = start + (i / (points - 1)) * (now - start);
      let totalsObj = { all: 0, crypto: 0, stock: 0, nonliquid: 0 };
      rowsForChart.forEach(asset => {
        const s = sharesUpTo(asset.id, t);
        if (s <= 0) return;
        const price = priceAtTime(asset, t);
        const val = s * Math.max(0, price || 0);
        totalsObj.all += val;
        if (asset.type === "crypto") totalsObj.crypto += val;
        else if (asset.type === "stock") totalsObj.stock += val;
        else if (asset.type === "nonliquid") totalsObj.nonliquid += val;
      });
      Object.keys(totalsObj).forEach(k => seriesPerKey[k].push({ t, v: totalsObj[k] }));
    }

    return seriesPerKey;
  }

  const multiSeries = useMemo(() => buildMultiCategorySeries(rows, transactions, chartRange), [rows, transactions, chartRange]);

  /* category values for legend (current) */
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

  /* RENDER */
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
            <h1 className="text-2xl font-semibold">{portfolioFilter === "all" ? '>' : headerTitle}</h1>

            {/* header filter icon-only (no box) */}
            <div className="relative">
              <button
                aria-label="Filter"
                onClick={() => setFilterMenuOpen(v => !v)}
                className="ml-2 inline-flex items-center justify-center text-gray-200"
                style={{ fontSize: 18, padding: 6 }}
                title="Filter portfolio"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M3 5h18" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M7 12h10" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M11 19h2" stroke="#E5E7EB" strokeWidth="1.6" strokeLinecap="round" />
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
          </div>

          <div className="flex items-center gap-3">
            {/* Currency dropdown */}
            <div className="relative">
              <button
                aria-label="Currency"
                onClick={() => setCurrencyMenuOpen(v => !v)}
                className="inline-flex items-center gap-2"
                style={{ background: "transparent", border: 0, padding: "6px 8px" }}
                title="Currency"
              >
                <span style={{ whiteSpace: "nowrap", fontSize: 20, fontWeight: 700 }}>
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

            <button
              aria-label="Add asset"
              onClick={() => setOpenAdd(v => !v)}
              className={`w-10 h-10 rounded-full bg-white flex items-center justify-center text-black font-bold btn`}
              title="Add asset"
            >
              <span style={{ display: "inline-block", transformOrigin: "50% 50%", transition: "transform 220ms" }} className={openAdd ? "rotate-open" : ""}>
                +
              </span>
            </button>
          </div>
        </div>

        {/* KPIs */}
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
            <div className="font-medium">{displayCcy === "IDR" ? fmtMoney((depositTotalUSD - totals.invested) * usdIdr, "IDR") : fmtMoney(depositTotalUSD - totals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between text-gray-400">
            <div>Gain P&L</div>
            <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(totals.pnl * usdIdr, "IDR") : fmtMoney(totals.pnl, "USD")} ({totals.pnlPct.toFixed(2)}%)</div>
          </div>
          <div className="flex items-center justify-between text-gray-400 cursor-pointer" onClick={() => setTransactionsOpen(true)}>
            <div className="flex items-center gap-2">
              <div>Realized P&L</div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`font-semibold ${realizedUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtMoney(realizedUSD * usdIdr, "IDR") : fmtMoney(realizedUSD, "USD")}</div>
              <div className="w-6 h-6 bg-gray-800 rounded flex items-center justify-center icon-box">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M6 14 L14 6" stroke={realizedUSD >= 0 ? "#6BCB77" : "#FF6B6B"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <path d="M14 6 v8 h-8" stroke={realizedUSD >= 0 ? "#6BCB77" : "#FF6B6B"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ADD PANEL */}
        {openAdd && (
          <div ref={addPanelRef} className="mt-6 bg-transparent p-3 rounded">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => setDepositFormOpen(v => !v)} className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-2 rounded font-semibold btn">Deposit</button>
              <div className="flex bg-gray-900 rounded overflow-hidden">
                <button onClick={() => { setSearchMode("crypto"); setSelectedSuggestion(null); setQuery(""); }} className={"px-3 py-1 font-semibold " + (searchMode === "crypto" ? "bg-gray-800 text-white" : "") + " btn-soft"}>Crypto</button>
                <button onClick={() => { setSearchMode("id"); setSelectedSuggestion(null); setQuery(""); }} className={"px-3 py-1 font-semibold " + (searchMode === "id" ? "bg-gray-800 text-white" : "") + " btn-soft"}>Stocks ID</button>
                <button onClick={() => { setSearchMode("us"); setSelectedSuggestion(null); setQuery(""); }} className={"px-3 py-1 font-semibold " + (searchMode === "us" ? "bg-gray-800 text-white" : "") + " btn-soft"}>Stocks US</button>
                <button onClick={() => { setSearchMode("nonliquid"); setSelectedSuggestion(null); setQuery(""); }} className={"px-3 py-1 font-semibold " + (searchMode === "nonliquid" ? "bg-gray-800 text-white" : "") + " btn-soft"}>Non-Liquid</button>
              </div>
            </div>
            {depositFormOpen && (
              <div className="flex gap-3 items-center mb-3">
                <input value={depositIDR} onChange={(e) => setDepositIDR(e.target.value)} placeholder="IDR" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={depositUSD} onChange={(e) => setDepositUSD(e.target.value)} placeholder="USD" className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <button onClick={handleAddDeposit} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn">Add Deposit</button>
              </div>
            )}
            {searchMode !== "nonliquid" && (
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchMode === "crypto" ? "Search Crypto (CoinGecko)" : "Search Stocks (Yahoo)"} className="w-full bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                  {suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute inset-x-0 top-full bg-gray-900 mt-1 rounded border border-gray-800 max-h-56 overflow-auto menu-scroll z-50">
                      {suggestions.map((s, i) => (
                        <button key={i} onClick={() => { setSelectedSuggestion(s); setSuggestions([]); setQuery(""); }} className="w-full px-3 py-2 text-left hover:bg-gray-700 flex justify-between">
                          <div>
                            <div className="font-medium text-gray-100">{s.symbol} • {s.display}</div>
                            <div className="text-xs text-gray-400">{s.source === "coingecko" ? "Crypto" : `Security • ${s.exchange || ''}`}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input value={initQty} onChange={(e) => setInitQty(e.target.value)} placeholder="Qty" className="w-full sm:w-32 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={initPrice} onChange={(e) => setInitPrice(e.target.value)} placeholder="Price" className="w-full sm:w-32 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <div className="relative">
                  <button onClick={() => setInitPriceCcy(v => v === "USD" ? "IDR" : "USD")} className="px-3 py-2 border border-gray-800 text-sm">
                    {initPriceCcy}
                  </button>
                  {initPriceCcy === "IDR" ? (
                    <div className="absolute right-full mr-1 text-xs text-gray-400">IDR</div>
                  ) : (
                    <div className="absolute right-full mr-1 text-xs text-gray-400">USD</div>
                  )}
                </div>
                <button onClick={selectedSuggestion ? addAssetFromSuggestion : addManualAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add Assets</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
              </div>
            )}
            {searchMode === "nonliquid" && (
              <div className="flex gap-3">
                <input value={nlName} onChange={(e) => setNlName(e.target.value)} placeholder="Name (land, art...)" className="flex-1 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlQty} onChange={(e) => setNlQty(e.target.value)} placeholder="Qty" className="w-full sm:w-20 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlPrice} onChange={(e) => setNlPrice(e.target.value)} placeholder="Price" className="w-full sm:w-32 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <div className="relative">
                  <button onClick={() => setNlPriceCcy(v => v === "USD" ? "IDR" : "USD")} className="px-3 py-2 border border-gray-800 text-sm">
                    {nlPriceCcy}
                  </button>
                  {nlPriceCcy === "IDR" ? (
                    <div className="absolute right-full mr-1 text-xs text-gray-400">IDR</div>
                  ) : (
                    <div className="absolute right-full mr-1 text-xs text-gray-400">USD</div>
                  )}
                </div>
                <input type="date" value={nlPurchaseDate} onChange={(e) => setNlPurchaseDate(e.target.value)} className="w-full sm:w-40 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlYoy} onChange={(e) => setNlYoy(e.target.value)} placeholder="YoY%" className="w-full sm:w-16 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <input value={nlDesc} onChange={(e) => setNlDesc(e.target.value)} placeholder="Desc (opt)" className="flex-1 bg-gray-900 px-3 py-2 text-sm border border-gray-800" />
                <button onClick={addNonLiquidAsset} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn">Add</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded btn-soft">Close</button>
              </div>
            )}
          </div>
        )}

        {/* ASSET TABLE */}
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Asset</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested <div className="text-xs text-gray-500">Avg Price</div></th>
                <th className="text-right py-2 px-3">Market Value <div className="text-xs text-gray-500">Current Price</div></th>
                <th className="text-right py-2 px-3">P&L <div className="text-xs text-gray-500">Gain</div></th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets — add one with the + button</td></tr>
              ) : filteredRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <a href={r.coingeckoId ? `https://www.coingecko.com/en/coins/${r.coingeckoId}` : `https://www.tradingview.com/symbols/${r.symbol}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-100">{r.symbol}</a>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.investedUSD * usdIdr, "IDR") : fmtMoney(r.investedUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtMoney(r.avgPrice * usdIdr, "IDR") : fmtMoney(r.avgPrice, "USD")}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtMoney(r.marketValueUSD * usdIdr, "IDR") : fmtMoney(r.marketValueUSD, "USD")}</div>
                    <div className="text-xs text-gray-400">{r.lastPriceUSD > 0 ? (displayCcy === "IDR" ? fmtMoney(r.lastPriceUSD * usdIdr, "IDR") : fmtMoney(r.lastPriceUSD, "USD")) + " • " + (totals.invested > 0 ? ((r.marketValueUSD - r.investedUSD) / totals.invested * 100).toFixed(2) : "0.00") + "%" : "-"}</div>
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

        {/* Portfolio Growth chart */}
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

        {/* Donut Allocation + Legend */}
        {filteredRows.length > 0 && (
          <div className="mt-6 flex items-center gap-6">
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
                      <div className="font-semibold text-gray-100 text-sm">{d.name}</div>
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

        {/* TRADE MODAL */}
        {tradeModal.open && (
          <TradeModal
            mode={tradeModal.mode} asset={assets.find(a => a.id === tradeModal.assetId)}
            defaultPrice={tradeModal.defaultPrice} onClose={() => closeTradeModal()}
            onBuy={performBuy} onSell={performSell} usdIdr={usdIdr}
          />
        )}

        {/* TRANSACTIONS MODAL */}
        {transactionsOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[120]">
            <div className="bg-gray-900 p-6 rounded-lg w-full max-w-3xl border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold">Transactions</div>
                  <div className="text-xs text-gray-400">{transactions.length} records</div>
                </div>
                <div className="flex items-center gap-2">
                  {lastDeletedTx && (
                    <button onClick={() => undoLastDeletedTransaction()} className="bg-amber-500 px-3 py-1 rounded text-sm btn">Undo Delete</button>
                  )}
                  <button onClick={() => { setTransactionsOpen(false); }} className="bg-gray-800 px-3 py-1 rounded btn-soft">Close</button>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="text-sm text-gray-500">No transactions yet.</div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="min-w-full text-sm">
                    <thead className="text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Asset</th>
                        <th className="text-right py-2 px-3">Qty</th>
                        <th className="text-right py-2 px-3">Proceeds / Cost</th>
                        <th className="text-right py-2 px-3">Realized</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => (
                        <tr key={tx.id} className="border-b border-gray-900 hover:bg-gray-950">
                          <td className="px-3 py-3">{new Date(tx.date).toLocaleString()}</td>
                          <td className="px-3 py-3">{tx.symbol} <div className="text-xs text-gray-400">{tx.name}</div></td>
                          <td className="px-3 py-3 text-right">{Number(tx.qty).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td className="px-3 py-3 text-right">
                            {tx.type === "sell" ? (displayCcy === "IDR" ? fmtMoney(tx.proceeds * usdIdr, "IDR") : fmtMoney(tx.proceeds, "USD")) : (displayCcy === "IDR" ? fmtMoney(tx.cost * usdIdr, "IDR") : fmtMoney(tx.cost, "USD"))}
                            <div className="text-xs">{tx.pricePerUnit ? `${displayCcy === "IDR" ? fmtMoney(tx.pricePerUnit * usdIdr, "IDR") : fmtMoney(tx.pricePerUnit, "USD")} / unit` : ""}</div>
                          </td>
                          <td className="px-3 py-3 text-right">{tx.type === "sell" ? (displayCcy === "IDR" ? fmtMoney(tx.realized * usdIdr, "IDR") : fmtMoney(tx.realized, "USD")) : "-"}</td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { restoreTransaction(tx.id); }} className="bg-emerald-500 px-2 py-1 rounded text-xs font-semibold text-black btn">Restore</button>
                              <button onClick={() => { deleteTransaction(tx.id); }} className="bg-red-600 px-2 py-1 rounded text-xs font-semibold text-black btn">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}