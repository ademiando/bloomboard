// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Icons ===================== */
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIconSimple = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const GraphIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>);
const TrashIcon = ({ className }) => (<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>);

/* ===================== CONFIG & HELPERS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;

const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v).replace(/,/g, '').replace(/\s/g, '')); return isNaN(n) ? 0 : n; };

function formatMoney(value, ccySymbol) {
  const n = Number(value || 0);
  if (ccySymbol === "$") {
    return `${ccySymbol}${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  return `Rp. ${Math.round(n).toLocaleString('id-ID')}`;
}

function formatQty(v) {
  const n = Number(v || 0);
  if (n === 0) return "0";
  if (Math.abs(n) < 1) return n.toFixed(6).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
  return Math.round(n).toLocaleString();
}

function ensureNumericAsset(a) {
  return {
    ...a,
    id: a.id || `${a.type}:${a.symbol}:${Math.random()}`,
    shares: toNum(a.shares || 0),
    avgPrice: toNum(a.avgPrice || 0),
    investedUSD: toNum(a.investedUSD || 0),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    createdAt: a.createdAt || Date.now(),
    purchaseDate: a.purchaseDate || a.createdAt || Date.now(),
    nonLiquidYoy: toNum(a.nonLiquidYoy || 0),
    type: a.type || "stock"
  };
}

/* ===================== UI Helpers ===================== */
const Modal = ({ children, isOpen, onClose, title }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#181818] rounded-lg w-full max-w-lg border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

const BottomSheet = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}>
      <div className={`fixed bottom-0 left-0 right-0 bg-[#1e1e1e] rounded-t-2xl shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto my-3"></div>
        {children}
      </div>
    </div>
  );
};

/* ===================== MAIN DASHBOARD COMPONENT ===================== */
export default function PortfolioDashboard() {
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v9") || "[]").map(ensureNumericAsset) : []);
  const [realizedUSD, setRealizedUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_realized_v9") || 0) : 0);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_transactions_v9") || "[]") : []);
  const [tradingBalance, setTradingBalance] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_balance_v9") || 5952) : 5952);

  // displaySymbol is "Rp." or "$"
  const [displaySymbol, setDisplaySymbol] = useState(() => isBrowser ? (localStorage.getItem("pf_display_sym_v9") || "Rp.") : "Rp.");
  const [usdIdr, setUsdIdr] = useState(16400);
  const [isFxLoading, setIsFxLoading] = useState(true);

  const [view, setView] = useState('main');
  const [isAddAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("stock");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [isManagePortfolioOpen, setManagePortfolioOpen] = useState(false);
  const [isBalanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceModalMode, setBalanceModalMode] = useState('Add');
  const [tradeModal, setTradeModal] = useState({ open: false, asset: null });
  const [chartRange, setChartRange] = useState("1Y");

  const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");

  useEffect(() => { if (isBrowser) localStorage.setItem("pf_assets_v9", JSON.stringify(assets)); }, [assets]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_realized_v9", String(realizedUSD)); }, [realizedUSD]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_transactions_v9", JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_balance_v9", String(tradingBalance)); }, [tradingBalance]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_display_sym_v9", displaySymbol); }, [displaySymbol]);

  useEffect(() => {
    const fetchFx = async () => {
      setIsFxLoading(true);
      try { const res = await fetch(COINGECKO_USD_IDR); const j = await res.json(); if (j?.tether?.idr) setUsdIdr(Math.round(j.tether.idr)); } catch (e) {}
      finally { setIsFxLoading(false); }
    };
    fetchFx();
    const id = setInterval(fetchFx, 70000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const pollPrices = async () => {
      if (assets.length === 0) return;
      const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol).filter(Boolean))];
      const cryptoIds = [...new Set(assets.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId))];
      const newPrices = {};
      for (const symbol of stockSymbols) {
        try {
          const res = await fetch(FINNHUB_QUOTE(symbol));
          const data = await res.json();
          const c = toNum(data?.c);
          if (c > 0) {
            const isIdr = symbol.toUpperCase().endsWith('.JK');
            newPrices[symbol] = { [isIdr ? 'idr' : 'usd']: c };
          }
        } catch (e) {}
      }
      if (cryptoIds.length > 0) {
        try {
          const idsParam = cryptoIds.join(',');
          const res = await fetch(COINGECKO_PRICE(idsParam));
          const j = await res.json();
          for (const id of cryptoIds) {
            if (j[id]) newPrices[id] = { usd: toNum(j[id].usd), idr: toNum(j[id].idr) };
          }
        } catch (e) {}
      }

      setAssets(prev => prev.map(a => {
        if (a.type === 'stock' && newPrices[a.symbol]) {
          const isIdrStock = a.symbol.endsWith('.JK');
          const p = newPrices[a.symbol];
          let lastPriceUSD = a.lastPriceUSD;
          if (isIdrStock && p.idr) lastPriceUSD = p.idr / usdIdr;
          else if (p.usd) lastPriceUSD = p.usd;
          return { ...a, lastPriceUSD };
        }
        if (a.type === 'crypto' && a.coingeckoId && newPrices[a.coingeckoId]) {
          const p = newPrices[a.coingeckoId];
          const lastPriceUSD = p.usd || a.lastPriceUSD;
          return { ...a, lastPriceUSD };
        }
        return a;
      }));
    };

    pollPrices();
    const id = setInterval(pollPrices, 30000);
    return () => clearInterval(id);
  }, [assets.length, usdIdr]);

  // suggestions
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        if (searchMode === 'crypto') {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`);
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 10).map(c => ({ symbol: c.symbol.toUpperCase(), display: c.name, id: c.id, source: "coingecko", type: "crypto" })));
        } else {
          const res = await fetch(YAHOO_SEARCH(q));
          if (!res.ok) throw new Error('API fetch failed');
          const payload = await res.json();
          const list = (payload.quotes || []).map(it => ({ symbol: it.symbol.toUpperCase(), display: it.shortname || it.longname || it.symbol, exchange: it.exchange, source: "yahoo", type: "stock" }));
          setSuggestions(list.slice(0, 10));
        }
      } catch (e) { setSuggestions([]); }
    }, 350);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  /* ===================== Actions ===================== */
  const handleBuy = (assetStub, qty, priceUSD) => {
    qty = Number(qty || 0); priceUSD = Number(priceUSD || 0);
    if (qty <= 0 || priceUSD <= 0) { alert("Quantity and price must be greater than zero."); return false; }
    const costUSD = qty * priceUSD;
    if (costUSD * usdIdr > tradingBalance) { alert("Insufficient trading balance."); return false; }
    const existing = assets.find(a => a.symbol === assetStub.symbol);
    const tx = { id: `tx:${Date.now()}`, type: "buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name || assetStub.symbol };
    if (existing) {
      tx.assetId = existing.id;
      setAssets(prev => prev.map(a => a.id === existing.id ? { ...a, shares: a.shares + qty, investedUSD: a.investedUSD + costUSD, avgPrice: (a.investedUSD + costUSD) / (a.shares + qty) } : a));
    } else {
      const newAsset = ensureNumericAsset({ ...assetStub, shares: qty, avgPrice: priceUSD, investedUSD: costUSD });
      tx.assetId = newAsset.id;
      setAssets(prev => [...prev, newAsset]);
    }
    setTradingBalance(b => b - (costUSD * usdIdr));
    setTransactions(prev => [tx, ...prev]);
    if (tradeModal.open) setTradeModal({ open: false, asset: null });
    return true;
  };

  const handleSell = (asset, qty, priceUSD) => {
    qty = Number(qty || 0); priceUSD = Number(priceUSD || 0);
    if (!asset) return false;
    if (qty <= 0) { alert("Quantity must be > 0"); return false; }
    if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
    const proceedsUSD = qty * priceUSD;
    const costOfSold = qty * asset.avgPrice;
    const realized = proceedsUSD - costOfSold;
    const tx = { id: `tx:${Date.now()}`, assetId: asset.id, type: "sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name };
    setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, shares: a.shares - qty, investedUSD: a.investedUSD - costOfSold, avgPrice: (a.shares - qty) > 0 ? (a.investedUSD - costOfSold) / (a.shares - qty) : 0 } : a).filter(a => a.shares > 0));
    setTradingBalance(b => b + (proceedsUSD * usdIdr));
    setRealizedUSD(r => r + realized);
    setTransactions(prev => [tx, ...prev]);
    if (tradeModal.open) setTradeModal({ open: false, asset: null });
    return true;
  };

  const handleDeleteAsset = (asset) => {
    if (!asset) return;
    if (!confirm(`Delete and liquidate ${asset.symbol} at market price?`)) return;
    const marketUSD = asset.shares * asset.lastPriceUSD;
    const realized = marketUSD - asset.investedUSD;
    const tx = { id: `tx:${Date.now()}`, assetId: asset.id, type: "delete", qty: asset.shares, pricePerUnit: asset.lastPriceUSD, proceeds: marketUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name, note: "liquidated" };
    setAssets(prev => prev.filter(a => a.id !== asset.id));
    setTradingBalance(b => b + (marketUSD * usdIdr));
    setRealizedUSD(r => r + realized);
    setTransactions(prev => [tx, ...prev]);
    setTradeModal({ open: false, asset: null });
  };

  const addAssetWithInitial = (qty, price, ccy) => {
    qty = Number(qty || 0); price = Number(price || 0);
    let p = selectedSuggestion;
    if (!p) {
      const t = query.split("—")[0].trim();
      if (!t) { alert("Select a suggestion"); return; }
      p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: 'stock' };
    }
    if (qty <= 0 || price <= 0) { alert("Quantity & price must be > 0"); return; }
    const priceUSD = (ccy === "IDR") ? price / usdIdr : price;
    const newStub = { id: `${p.source || 'manual'}:${p.symbol||p.id}:${Date.now()}`, type: p.type, symbol: p.symbol, name: p.display, coingeckoId: p.type === 'crypto' ? p.id : undefined };
    if (handleBuy(newStub, qty, priceUSD)) {
      setAddAssetModalOpen(false);
      setQuery('');
      setSelectedSuggestion(null);
    }
  };

  const addNonLiquidAsset = () => {
    const name = nlName.trim(), qty = toNum(nlQty), priceIn = toNum(nlPrice);
    if (!name || qty <= 0 || priceIn <= 0) { alert("Name, quantity, and price must be filled."); return; }
    const priceUSD = nlPriceCcy === 'IDR' ? priceIn / usdIdr : priceIn;
    const newAssetStub = { id: `nonliquid:${name.replace(/\s/g,'_')}:${Date.now()}`, type: 'nonliquid', symbol: name.slice(0,8).toUpperCase(), name, purchaseDate: nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now(), nonLiquidYoy: toNum(nlYoy), description: nlDesc };
    if (handleBuy(newAssetStub, qty, priceUSD)) {
      setAddAssetModalOpen(false); setNlName(''); setNlQty(''); setNlPrice(''); setNlPurchaseDate(''); setNlDesc('');
    }
  };

  // now record deposits & withdrawals as transactions for total deposit calculation
  const handleAddBalance = (amountIDR) => {
    if (amountIDR <= 0) { alert("Amount must be > 0"); return; }
    const tx = { id: `tx:${Date.now()}`, type: 'deposit', amountIDR: amountIDR, date: Date.now(), note: 'deposit' };
    setTradingBalance(b => b + amountIDR);
    setTransactions(prev => [tx, ...prev]);
    setBalanceModalOpen(false);
  };
  const handleWithdraw = (amountIDR) => {
    if (amountIDR > tradingBalance) { alert("Withdrawal amount exceeds balance."); return; }
    const tx = { id: `tx:${Date.now()}`, type: 'withdraw', amountIDR: amountIDR, date: Date.now(), note: 'withdraw' };
    setTradingBalance(b => b - amountIDR);
    setTransactions(prev => [tx, ...prev]);
    setBalanceModalOpen(false);
  };

  const exportCSV = () => {
    const pad = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const assetHeaders = ["id", "type", "symbol", "name", "shares", "avgPriceUSD", "investedUSD", "lastPriceUSD"];
    const assetsCsv = [assetHeaders.join(",")].concat(assets.map(a => assetHeaders.map(h => pad(a[h])).join(","))).join("\n");
    const txHeaders = ["id", "type", "assetId", "symbol", "qty", "pricePerUnit", "cost", "proceeds", "realized", "date", "note", "amountIDR"];
    const txCsv = [txHeaders.join(",")].concat(transactions.map(t => txHeaders.map(h => pad(t[h])).join(","))).join("\n");
    const blob = new Blob([`# assets\n${assetsCsv}\n\n# transactions\n${txCsv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `bloomboard_export_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      try {
        const parts = text.split(/\r?\n/);
        let assetsBlock = [], txBlock = [], mode = null;
        for (let line of parts) {
          line = line.trim();
          if (!line) continue;
          if (line.startsWith("# assets")) { mode = "assets"; continue; }
          if (line.startsWith("# transactions")) { mode = "tx"; continue; }
          if (line.startsWith("#")) { mode = null; continue; }
          if (!mode) continue;
          if (mode === "assets") assetsBlock.push(line);
          if (mode === "tx") txBlock.push(line);
        }
        if (assetsBlock.length > 0) {
          const header = assetsBlock[0].split(",").map(h => h.replace(/"/g, '').trim());
          const rows = assetsBlock.slice(1).map(r => {
            const vals = r.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const obj = {}; header.forEach((h,i) => obj[h] = (vals[i] || "").replace(/^"|"$/g, "")); return obj;
          });
          const importedAssets = rows.map(r => ensureNumericAsset({
            id: r.id || `imp:${r.symbol}:${Date.now()}`,
            type: r.type || "stock",
            symbol: r.symbol,
            name: r.name || r.symbol,
            shares: toNum(r.shares),
            avgPrice: toNum(r.avgPriceUSD),
            investedUSD: toNum(r.investedUSD),
            lastPriceUSD: toNum(r.lastPriceUSD)
          }));
          setAssets(prev => {
            const merged = [...prev];
            for (const a of importedAssets) {
              const found = merged.find(x => x.symbol === a.symbol);
              if (!found) merged.push(a);
            }
            return merged;
          });
        }
        if (txBlock.length > 0) {
          const header = txBlock[0].split(",").map(h => h.replace(/"/g, '').trim());
          const rows = txBlock.slice(1).map(r => {
            const vals = r.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
            const obj = {}; header.forEach((h,i) => obj[h] = (vals[i] || "").replace(/^"|"$/g, "")); return obj;
          });
          const importedTx = rows.map(r => ({
            id: r.id || `imp:tx:${Date.now()}`,
            type: r.type,
            assetId: r.assetId,
            symbol: r.symbol,
            qty: toNum(r.qty),
            pricePerUnit: toNum(r.pricePerUnit),
            cost: toNum(r.cost),
            proceeds: toNum(r.proceeds),
            realized: toNum(r.realized),
            date: toNum(r.date) || Date.now(),
            note: r.note,
            amountIDR: toNum(r.amountIDR)
          }));
          setTransactions(prev => [...importedTx, ...prev]);
        }
        alert("CSV imported (best-effort). Check your portfolio.");
      } catch (err) {
        alert("Failed to import CSV. Make sure it matches expected format.");
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  /* ===================== Derived Data ===================== */
  const { rows, totals, totalEquity, tradeStats, donutData, totalDeposited } = useMemo(() => {
    const calculatedRows = assets.map(a => {
      const market = a.shares * a.lastPriceUSD;
      const pnl = market - a.investedUSD;
      const pnlPct = a.investedUSD > 0 ? (pnl / a.investedUSD) * 100 : 0;
      return { ...a, marketValueUSD: market, pnlUSD: pnl, pnlPct };
    });
    const invested = calculatedRows.reduce((s, r) => s + r.investedUSD, 0);
    const market = calculatedRows.reduce((s, r) => s + r.marketValueUSD, 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const totalEq = (market * usdIdr) + tradingBalance;
    const sells = transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete');
    const wins = sells.filter(tx => tx.realized > 0);
    const losses = sells.filter(tx => tx.realized <= 0);
    const tStats = {
      trades: sells.length,
      wins: wins.length,
      losses: losses.length,
      winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0,
      maxProfit: wins.length ? Math.max(...wins.map(tx => tx.realized)) : 0,
      maxLoss: losses.length ? Math.min(...losses.map(tx => tx.realized)) : 0,
      avgProfit: wins.length ? wins.reduce((s, tx) => s + tx.realized, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((s, tx) => s + tx.realized, 0) / losses.length : 0,
      totalRealizedGain: realizedUSD
    };
    const dData = calculatedRows.map(r => ({ name: r.symbol, value: r.marketValueUSD })).sort((a,b)=>b.value-a.value);
    const totalDeposited = transactions.filter(t => t.type === 'deposit').reduce((s, t) => s + (t.amountIDR || 0), 0);
    return { rows: calculatedRows, totals: { invested, market, pnl, pnlPct }, totalEquity: totalEq, tradeStats: tStats, donutData: dData, totalDeposited };
  }, [assets, transactions, usdIdr, tradingBalance, realizedUSD]);

  /* ===================== Equity timeline for chart & PnL periods ===================== */
  const equitySeries = useMemo(() => {
    // Build timeline from transactions + current holdings
    const sorted = [...transactions].sort((a,b) => a.date - b.date);
    let cash = 0;
    // start with current cash = tradingBalance but we want historical series; we'll back-calculate final + previous points from tx
    // Simpler approach: start at 0, walk through tx and buys/sells to compute resulting cash+holdings value at each tx.
    // We'll produce points at each tx and final now.
    let holdings = {};
    const points = [];
    const addPoint = (t) => {
      const marketUSD = Object.values(holdings).reduce((s,h) => s + (h.shares * (h.lastPriceUSD || h.avgPriceUSD || 0)), 0);
      const marketIdr = Math.round(marketUSD * usdIdr);
      points.push({ t, v: cash + marketIdr });
    };
    // We'll assume initial cash is tradingBalance and then apply transactions backwards to create a rough series:
    // To be pragmatic: create points by capturing value after each transaction using current asset prices as approximation.
    let nowCash = tradingBalance;
    const currentHoldings = {};
    for (const a of assets) {
      currentHoldings[a.symbol] = { shares: a.shares, lastPriceUSD: a.lastPriceUSD, avgPriceUSD: a.avgPrice || 0 };
    }
    // Start from earliest tx, simulate forward from 0 starting cash = 0
    cash = 0;
    holdings = {};
    addPoint((sorted.length ? sorted[0].date : Date.now()) - 1000);
    for (const tx of sorted) {
      if (tx.type === 'deposit') {
        cash += tx.amountIDR;
      } else if (tx.type === 'withdraw') {
        cash -= tx.amountIDR;
      } else if (tx.type === 'buy') {
        // reduce cash by cost (in IDR)
        cash -= Math.round((tx.cost || 0) * usdIdr);
        holdings[tx.symbol] = holdings[tx.symbol] || { shares: 0, avgPriceUSD: 0, investedUSD: 0, lastPriceUSD: 0 };
        holdings[tx.symbol].shares += tx.qty;
        holdings[tx.symbol].investedUSD += (tx.cost || 0);
        holdings[tx.symbol].avgPriceUSD = holdings[tx.symbol].investedUSD / holdings[tx.symbol].shares;
        const a = assets.find(x => x.symbol === tx.symbol);
        if (a) holdings[tx.symbol].lastPriceUSD = a.lastPriceUSD || holdings[tx.symbol].avgPriceUSD;
      } else if (tx.type === 'sell' || tx.type === 'delete') {
        cash += Math.round((tx.proceeds || 0) * usdIdr);
        holdings[tx.symbol] = holdings[tx.symbol] || { shares: 0, avgPriceUSD: 0, investedUSD: 0, lastPriceUSD: 0 };
        holdings[tx.symbol].shares -= tx.qty;
        holdings[tx.symbol].investedUSD -= (tx.qty * (tx.pricePerUnit || 0));
        if (holdings[tx.symbol].shares <= 0) delete holdings[tx.symbol];
      }
      addPoint(tx.date);
    }
    // final point = current cash + market value (use current assets)
    const finalMarketUSD = assets.reduce((s,a) => s + a.shares * a.lastPriceUSD, 0);
    const finalMarketIdr = Math.round(finalMarketUSD * usdIdr);
    points.push({ t: Date.now(), v: Math.round(tradingBalance) + finalMarketIdr });
    // dedupe by timestamp
    const unique = [];
    const seen = new Set();
    for (const p of points) {
      if (!seen.has(p.t)) { unique.push(p); seen.add(p.t); }
    }
    return unique.length ? unique : [{ t: Date.now() - 1000, v: 0 }, { t: Date.now(), v: Math.round(tradingBalance) }];
  }, [transactions, assets, tradingBalance, usdIdr]);

  /* helper: get value at given timestamp (closest earlier) */
  const pointAt = (series, ts) => {
    if (!series.length) return series[0] || { t: Date.now(), v: 0 };
    let prev = series[0];
    for (const p of series) {
      if (p.t >= ts) return prev;
      prev = p;
    }
    return series[series.length - 1];
  };

  /* ===================== CSV / export/import already implemented above ===================== */

  /* ================ Render ================ */
  if (view === 'performance') {
    return <PerformancePage totals={totals} totalEquity={totalEquity} tradeStats={tradeStats} setView={setView} usdIdr={usdIdr} displaySymbol={displaySymbol} chartRange={chartRange} setChartRange={setChartRange} donutData={donutData} transactions={transactions} equitySeries={equitySeries} pointAt={pointAt} />;
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
          <div className="flex items-center gap-3"><UserAvatar /><h1 className="text-lg font-bold text-white">Bloomboard</h1></div>

          <div className="flex items-center gap-3">
            {/* Compact switch: active text inside the bubble */}
            <div
              role="switch"
              aria-checked={displaySymbol === "$"}
              onClick={() => setDisplaySymbol(prev => prev === "Rp." ? "$" : "Rp.")}
              className={`relative w-14 h-7 rounded-full p-1 cursor-pointer transition ${displaySymbol === "$" ? 'bg-emerald-600' : 'bg-gray-700'}`}
              title="Toggle display currency"
            >
              <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${displaySymbol === "$" ? 'translate-x-6' : 'translate-x-0'}`}></div>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-black">{displaySymbol === "$" ? 'USD' : 'IDR'}</div>
            </div>

            {/* FX rate to the right */}
            <div className="text-xs text-gray-400">{isFxLoading ? '...' : new Intl.NumberFormat('id-ID').format(usdIdr)}</div>

            <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
          </div>
        </header>

        <main>
          <div className="border-b border-gray-800 px-4">
            <nav className="flex space-x-6 py-2"><div className="py-2 px-1 font-semibold text-sm text-white">PORTFOLIO</div></nav>
          </div>

          <section className="p-4">
            {/* 3x3 summary grid (3 rows for neat layout) */}
            <div className="grid grid-cols-3 gap-px bg-[#0a0a0a] p-px">
              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Trading Balance</p>
                <p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(tradingBalance, "Rp.") : formatMoney(tradingBalance / usdIdr, "$")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Invested</p>
                <p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(totals.invested * usdIdr, "Rp.") : formatMoney(totals.invested, "$")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Total Equity</p>
                <p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(totalEquity, "Rp.") : formatMoney(totalEquity / usdIdr, "$")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Gain P&L</p>
                <p className={`font-semibold ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.pnl >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(totals.pnl * usdIdr, "Rp.") : formatMoney(totals.pnl, "$")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Realized P&L</p>
                <p className={`font-semibold ${realizedUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{realizedUSD >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(realizedUSD * usdIdr, "Rp.") : formatMoney(realizedUSD, "$")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Total Deposit</p>
                <p className="font-semibold text-white">{formatMoney(totalDeposited, "Rp.")}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Number of Assets</p>
                <p className="font-semibold text-white">{assets.length}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Total Trades</p>
                <p className="font-semibold text-white">{transactions.length}</p>
              </div>

              <div className="bg-black p-3">
                <p className="text-xs text-gray-500">Cash</p>
                <p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(tradingBalance, "Rp.") : formatMoney(tradingBalance / usdIdr, "$")}</p>
              </div>
            </div>

            <div className="mt-4 text-right">
              <div className="text-sm text-white cursor-pointer inline-flex items-center gap-2" onClick={() => setView('performance')}>View Performance <ArrowRightIconSimple /></div>
            </div>
          </section>

          <div className="h-2 bg-[#0a0a0a]"></div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 text-xs">
                <tr>
                  <th className="p-3 pt-4">Asset<br/><span className="text-xs mt-1 text-gray-400">Qty</span></th>
                  <th className="p-3 pt-4 text-right">Invested<br/><span className="text-xs mt-1 text-gray-400">Avg Price</span></th>
                  <th className="p-3 pt-4 text-right">Market<br/><span className="text-xs mt-1 text-gray-400">Price</span></th>
                  <th className="p-3 pt-4 text-right">Gain P&L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={() => setTradeModal({ open: true, asset: r })}>
                    <td className="p-3">
                      <div className="font-semibold text-base text-white">{r.symbol}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{formatQty(r.shares)}</div>
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      <div className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(r.investedUSD * usdIdr, "Rp.") : formatMoney(r.investedUSD, "$")}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{displaySymbol === "Rp." ? formatMoney(r.avgPrice * usdIdr, "Rp.") : formatMoney(r.avgPrice, "$")}</div>
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      <div className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(r.marketValueUSD * usdIdr, "Rp.") : formatMoney(r.marketValueUSD, "$")}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{displaySymbol === "Rp." ? formatMoney(r.lastPriceUSD * usdIdr, "Rp.") : formatMoney(r.lastPriceUSD, "$")}</div>
                    </td>

                    <td className="p-3 text-right tabular-nums">
                      <div className={`font-semibold ${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnlUSD >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(r.pnlUSD * usdIdr, "Rp.") : formatMoney(r.pnlUSD, "$")}</div>
                      <div className={`${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'} text-xs mt-0.5`}>{Math.round(r.pnlPct)}%</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}

            <div className="p-4 text-center">
              <button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button>
            </div>
          </div>
        </main>

        <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)}>
          <AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, usdIdr}} />
        </Modal>

        <Modal title={`${balanceModalMode} Balance`} isOpen={isBalanceModalOpen} onClose={() => setBalanceModalOpen(false)}>
          <BalanceManager onConfirm={balanceModalMode === 'Add' ? handleAddBalance : handleWithdraw} />
        </Modal>

        <TradeModal isOpen={tradeModal.open} onClose={() => setTradeModal({ open: false, asset: null })} asset={tradeModal.asset} onBuy={handleBuy} onSell={handleSell} onDelete={handleDeleteAsset} usdIdr={usdIdr} displaySymbol={displaySymbol} />

        <BottomSheet isOpen={isManagePortfolioOpen} onClose={() => setManagePortfolioOpen(false)}>
          <ManagePortfolioSheet onImportClick={importCSV} onExportClick={exportCSV} onAddBalance={() => { setManagePortfolioOpen(false); setBalanceModalMode('Add'); setBalanceModalOpen(true); }} onWithdraw={() => { setManagePortfolioOpen(false); setBalanceModalMode('Withdraw'); setBalanceModalOpen(true); }} onClearAll={() => { if (confirm("Erase all portfolio data?")) { setAssets([]); setTransactions([]); setTradingBalance(0); setRealizedUSD(0); } }} usdIdr={usdIdr} />
        </BottomSheet>
      </div>
    </div>
  );
}

/* ===================== PERFORMANCE & SUBCOMPONENTS ===================== */

const PerformancePage = ({ totals, totalEquity, tradeStats, setView, usdIdr, displaySymbol, chartRange, setChartRange, donutData, transactions, equitySeries, pointAt }) => {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [range, setRange] = useState('1M'); // 1D,7D,1M,1Y,All
  const [pnlMode, setPnlMode] = useState('daily'); // daily/monthly/yearly/all

  const now = Date.now();
  const ranges = {
    '1D': 24 * 3600 * 1000,
    '7D': 7 * 24 * 3600 * 1000,
    '1M': 30 * 24 * 3600 * 1000,
    '1Y': 365 * 24 * 3600 * 1000,
    'All': now * 2
  };

  const filteredSeries = useMemo(() => {
    if (range === 'All') return equitySeries;
    const minTs = Date.now() - ranges[range];
    return equitySeries.filter(p => p.t >= minTs);
  }, [equitySeries, range]);

  const computePnlForPeriod = (periodMs) => {
    const end = Date.now();
    const start = end - periodMs;
    const startPoint = pointAt(equitySeries, start);
    const endPoint = equitySeries[equitySeries.length - 1];
    if (!startPoint || !endPoint) return 0;
    return (endPoint.v - startPoint.v) / usdIdr; // return USD equivalent (approx)
  };

  const pnlDaily = computePnlForPeriod(24 * 3600 * 1000);
  const pnlMonthly = computePnlForPeriod(30 * 24 * 3600 * 1000);
  const pnlYearly = computePnlForPeriod(365 * 24 * 3600 * 1000);
  const pnlAll = (equitySeries.length ? (equitySeries[equitySeries.length - 1].v - equitySeries[0].v) / usdIdr : 0);

  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex items-center gap-4 sticky top-0 bg-black z-10">
          <button onClick={() => setView('main')} className="text-white"><BackArrowIcon /></button>
          <h1 className="text-lg font-semibold text-white">Performance</h1>
        </header>

        <div className="border-b border-gray-800 px-4">
          <nav className="flex space-x-6">
            <button onClick={() => setActiveTab('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button>
            <button onClick={() => setActiveTab('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button>
            <button onClick={() => setActiveTab('history')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'history' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>HISTORY</button>
          </nav>
        </div>

        {activeTab === 'portfolio' ? (
          <div className="p-4">
            <div>
              <p className="text-sm text-gray-400">Total Equity</p>
              <p className="text-2xl font-bold text-white mb-1">{displaySymbol === "Rp." ? formatMoney(totalEquity, "Rp.") : formatMoney(totalEquity / usdIdr, "$")}</p>
              <p className={`font-semibold text-sm ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.pnl >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(totals.pnl * usdIdr, "Rp.") : formatMoney(totals.pnl, "$")} ({Math.round(totals.pnlPct||0)}%) All Time</p>
            </div>

            <div className="mt-4 flex items-center gap-3">
              {["1D","7D","1M","1Y","All"].map(r => (<button key={r} onClick={() => { setRange(r); setChartRange(r); }} className={`px-3 py-1 text-xs rounded-full ${range === r ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'}`}>{r}</button>))}
            </div>

            <div className="mt-6"><AreaChart equityData={filteredSeries} displaySymbol={displaySymbol} usdIdr={usdIdr} /></div>

            <div className="mt-4">
              <div className="flex items-center gap-3">
                {['daily','monthly','yearly','all'].map(m => (<button key={m} onClick={() => setPnlMode(m)} className={`px-3 py-1 text-xs rounded-full ${pnlMode === m ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'}`}>{m.charAt(0).toUpperCase() + m.slice(1)}</button>))}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-4">
                <div className="bg-[#111111] p-3 rounded"><p className="text-xs text-gray-400">Daily PnL</p><p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(pnlDaily * usdIdr, "Rp.") : formatMoney(pnlDaily, "$")}</p></div>
                <div className="bg-[#111111] p-3 rounded"><p className="text-xs text-gray-400">Monthly PnL</p><p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(pnlMonthly * usdIdr, "Rp.") : formatMoney(pnlMonthly, "$")}</p></div>
                <div className="bg-[#111111] p-3 rounded"><p className="text-xs text-gray-400">Yearly PnL</p><p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(pnlYearly * usdIdr, "Rp.") : formatMoney(pnlYearly, "$")}</p></div>
                <div className="bg-[#111111] p-3 rounded"><p className="text-xs text-gray-400">All PnL</p><p className="font-semibold text-white">{displaySymbol === "Rp." ? formatMoney(pnlAll * usdIdr, "Rp.") : formatMoney(pnlAll, "$")}</p></div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-base font-semibold text-white mb-4">Asset Allocation</h3>
              <AllocationDonut data={donutData} displayCcySymbol={displaySymbol} usdIdr={usdIdr} />
            </div>
          </div>
        ) : activeTab === 'trade' ? (
          <TradeStatsView stats={tradeStats} displayCcySymbol={displaySymbol} usdIdr={usdIdr} />
        ) : (
          <HistoryView transactions={transactions} usdIdr={usdIdr} displayCcySymbol={displaySymbol} />
        )}
      </div>
    </div>
  );
};

const TradeStatsView = ({ stats, displayCcySymbol, usdIdr }) => {
  const getVal = (val) => displayCcySymbol === "Rp." ? val * usdIdr : val;
  return (
    <div className="p-4 space-y-6">
      <div className="text-center">
        <div className="relative inline-block">
          <svg className="w-28 h-28 transform -rotate-90"><circle cx="56" cy="56" r="50" stroke="#374151" strokeWidth="6" fill="transparent"/><circle cx="56" cy="56" r="50" stroke="#22c55e" strokeWidth="6" fill="transparent" strokeDasharray="314.159" strokeDashoffset={314.159 * (1 - (stats.winRate / 100))} /></svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-gray-400">Win Rate</span><span className="text-2xl font-bold text-white">{Math.round(stats.winRate)}%</span></div>
        </div>
        <div className="mt-2 text-sm">{stats.wins} Wins / {stats.losses} Losses ({stats.trades} Trades)</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Profit</p><p className="text-lg font-semibold text-emerald-400">+{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.maxProfit), "Rp.") : formatMoney(getVal(stats.maxProfit), "$")}</p></div>
        <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Loss</p><p className="text-lg font-semibold text-red-400">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.maxLoss), "Rp.") : formatMoney(getVal(stats.maxLoss), "$")}</p></div>
        <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Profit</p><p className="text-lg font-semibold text-emerald-400">+{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.avgProfit), "Rp.") : formatMoney(getVal(stats.avgProfit), "$")}</p></div>
        <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Loss</p><p className="text-lg font-semibold text-red-400">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.avgLoss), "Rp.") : formatMoney(getVal(stats.avgLoss), "$")}</p></div>
      </div>

      <div><p className="text-sm text-gray-400">Total Realized Gain</p><p className="text-2xl font-bold text-emerald-400">+{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.totalRealizedGain), "Rp.") : formatMoney(getVal(stats.totalRealizedGain), "$")}</p></div>
    </div>
  );
};

const HistoryView = ({ transactions, usdIdr, displayCcySymbol }) => {
  return (
    <div className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500 text-xs">
            <tr>
              <th className="p-3">Time</th>
              <th className="p-3">Type</th>
              <th className="p-3">Symbol</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-right">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-t border-gray-800">
                <td className="p-3 text-gray-400">{new Date(tx.date).toLocaleString()}</td>
                <td className="p-3">{tx.type}</td>
                <td className="p-3 font-semibold">{tx.symbol || tx.note}</td>
                <td className="p-3 text-right">{formatQty(tx.qty)}</td>
                <td className="p-3 text-right text-gray-400">{displayCcySymbol === "Rp." ? formatMoney((tx.pricePerUnit || tx.price || 0) * usdIdr, "Rp.") : formatMoney((tx.pricePerUnit || tx.price || 0), "$")}</td>
                <td className="p-3 text-right">{tx.type === 'deposit' || tx.type === 'withdraw' ? formatMoney(tx.amountIDR, "Rp.") : displayCcySymbol === "Rp." ? formatMoney((tx.cost || tx.proceeds || 0) * usdIdr, "Rp.") : formatMoney((tx.cost || tx.proceeds || 0), "$")}</td>
              </tr>
            ))}
            {transactions.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-500">No history</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ===================== Forms & Modals ===================== */

const BalanceManager = ({ onConfirm }) => {
  const [amount, setAmount] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(toNum(amount)); }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-400">Amount (IDR)</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus className="w-full bg-gray-900 px-3 py-2 rounded border border-gray-700 text-white" placeholder="e.g. 1000000" />
      </div>
      <button type="submit" className="w-full py-2.5 rounded font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Confirm</button>
    </form>
  );
};

const ManagePortfolioSheet = ({ onImportClick, onExportClick, onAddBalance, onWithdraw, onClearAll, usdIdr }) => (
  <div className="p-4 text-white text-sm">
    <h3 className="text-base font-semibold mb-4 px-2">Manage Portfolio</h3>
    <div className="space-y-1">
      <div className="p-2 rounded text-gray-300">Realtime USD/IDR rate: {new Intl.NumberFormat('id-ID').format(usdIdr)}</div>
      <button onClick={onAddBalance} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Add Balance</button>
      <button onClick={onWithdraw} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Withdraw</button>
      <label className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300 block cursor-pointer">Import CSV<input type="file" accept=".csv" onChange={onImportClick} className="hidden" /></label>
      <button onClick={onExportClick} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Export CSV</button>
      <button onClick={onClearAll} className="w-full text-left p-2 rounded hover:bg-red-700/20 text-red-400">Erase all data</button>
    </div>
  </div>
);

const AddAssetForm = ({ searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, usdIdr }) => {
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [ccy, setCcy] = useState('IDR');

  useEffect(() => { setSearchMode('stock'); }, []);

  const handleInputChange = (field, value) => {
    if (field === 'shares') {
      setShares(value);
      const num = toNum(price) * toNum(value);
      setTotal(num ? `${Math.round(num)} ${ccy}` : '');
    } else if (field === 'price') {
      setPrice(value);
      const num = toNum(value) * toNum(shares);
      setTotal(num ? `${Math.round(num)} ${ccy}` : '');
    } else if (field === 'total') {
      setTotal(value);
      const nTotal = toNum(value), nShares = toNum(shares);
      if (nShares > 0) setPrice(String(Math.round(nTotal / nShares)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-700">
        {[{ key: 'stock', label: 'Stock' }, { key: 'crypto', label: 'Crypto' }, { key: 'nonliquid', label: 'Non-Liquid' }].map(item => (
          <button key={item.key} onClick={() => { setSearchMode(item.key); setCcy(item.key === 'stock' ? 'IDR' : (item.key === 'crypto' ? 'USD' : 'IDR')); }} className={`px-3 py-2 text-sm font-medium ${searchMode === item.key ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400'}`}>{item.label}</button>
        ))}
      </div>

      {searchMode !== 'nonliquid' ? (
        <div className="space-y-4">
          <div className="relative">
            <input value={query} onChange={e => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder="Search by code or name..." className="w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-600 text-white" />
            {suggestions.length > 0 && <div className="absolute z-50 mt-1 w-full bg-[#1e1e1e] border border-gray-700 rounded max-h-56 overflow-auto">
              {suggestions.map((s, i) => (<button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-700"><div className="font-medium text-gray-100">{s.symbol}</div><div className="text-xs text-gray-400">{s.display}</div></button>))}
            </div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Qty</label>
              <input value={shares} onChange={e => handleInputChange('shares', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Price ({ccy})</label>
              <div className="flex gap-2">
                <input value={price} onChange={e => handleInputChange('price', e.target.value)} className="flex-1 mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text" />
                <select value={ccy} onChange={e => setCcy(e.target.value)} className="mt-1 rounded bg-gray-900 px-2 py-2 text-sm border border-gray-600 text-white">
                  <option value="IDR">IDR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Total Value ({ccy})</label>
            <input value={total} onChange={e => handleInputChange('total', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text" />
          </div>

          <div className="flex justify-end">
            <button onClick={() => addAssetWithInitial(toNum(shares), toNum(price), ccy)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Position</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={nlName} onChange={e => setNlName(e.target.value)} placeholder="Asset Name (e.g. Property)" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlQty} onChange={e => setNlQty(e.target.value)} placeholder="Quantity" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlPrice} onChange={e => setNlPrice(e.target.value)} placeholder="Purchase Price" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <select value={nlPriceCcy} onChange={e => setNlPriceCcy(e.target.value)} className="rounded bg-gray-900 px-2 py-2 text-sm border border-gray-600 text-white">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
            <input type="date" value={nlPurchaseDate} onChange={e => setNlPurchaseDate(e.target.value)} className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlYoy} onChange={e => setNlYoy(e.target.value)} placeholder="Est. Yearly Gain (%)" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
          </div>

          <input value={nlDesc} onChange={e => setNlDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
          <div className="flex justify-end"><button onClick={addNonLiquidAsset} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Asset</button></div>
        </div>
      )}
    </div>
  );
};

const TradeModal = ({ isOpen, onClose, asset, onBuy, onSell, onDelete, usdIdr, displaySymbol }) => {
  const [mode, setMode] = useState('buy');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [ccy, setCcy] = useState(displaySymbol === "Rp." ? 'IDR' : 'USD');

  useEffect(() => {
    if (asset) {
      const isIdr = asset.symbol && asset.symbol.endsWith('.JK');
      const priceVal = asset.lastPriceUSD * (isIdr ? usdIdr : 1);
      setPrice(String(isFinite(priceVal) ? (displaySymbol === "$" ? priceVal.toFixed(2) : Math.round(priceVal)) : ''));
      setShares('');
      setTotal('');
      setCcy(displaySymbol === "Rp." ? 'IDR' : 'USD');
    }
  }, [asset, usdIdr, displaySymbol]);

  if (!isOpen || !asset) return null;

  const handleInputChange = (field, value) => {
    if (field === 'shares') {
      setShares(value);
      const nPrice = toNum(price), nShares = toNum(value);
      if (nPrice > 0 && nShares > 0) setTotal((nPrice * nShares).toString());
      else setTotal('');
    } else if (field === 'price') {
      setPrice(value);
      const nPrice = toNum(value), nShares = toNum(shares);
      if (nPrice > 0 && nShares > 0) setTotal((nPrice * nShares).toString());
      else setTotal('');
    } else if (field === 'total') {
      setTotal(value);
      const nTotal = toNum(value), nShares = toNum(shares);
      if (nShares > 0 && nTotal > 0) setPrice(String(Math.round(nTotal / nShares)));
    }
  };

  const priceUSD = (ccy === 'IDR') ? toNum(price) / usdIdr : toNum(price);

  const doSubmit = () => {
    if (mode === 'buy') onBuy(asset, toNum(shares), priceUSD);
    else if (mode === 'sell') onSell(asset, toNum(shares), priceUSD);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={asset.symbol}>
      <div className="space-y-4">
        <div className="flex bg-gray-800 rounded-full p-1">
          <button onClick={() => setMode('buy')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'buy' ? 'bg-emerald-600 text-white' : 'text-gray-300'}`}>Buy</button>
          <button onClick={() => setMode('sell')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'sell' ? 'bg-red-600 text-white' : 'text-gray-300'}`}>Sell</button>
        </div>

        <div>
          <label className="text-xs text-gray-400">Qty</label>
          <input type="text" value={shares} onChange={e => handleInputChange('shares', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
        </div>

        <div>
          <label className="text-xs text-gray-400">Price ({ccy})</label>
          <div className="flex gap-2">
            <input type="text" value={price} onChange={e => handleInputChange('price', e.target.value)} className="flex-1 mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
            <select value={ccy} onChange={e => setCcy(e.target.value)} className="mt-1 rounded bg-gray-900 px-2 py-2 text-sm border border-gray-600 text-white">
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400">Total ({ccy})</label>
          <input type="text" value={total} onChange={e => handleInputChange('total', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
        </div>

        <div className="flex gap-2">
          <button onClick={doSubmit} className={`flex-1 py-2.5 rounded font-semibold text-white ${mode === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>Confirm {mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
          <button onClick={() => onDelete(asset)} title="Delete (liquidate)" className="py-2.5 px-3 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-2">
            <TrashIcon className="text-red-400" />
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* ===================== Charts ===================== */

const AreaChart = ({ equityData, displaySymbol, usdIdr }) => {
  const data = equityData.length > 1 ? equityData : [{ t: Date.now() - 1000, v: 0 }, { t: Date.now(), v: 0 }];
  const height = 220, width = 700, padding = { top: 10, bottom: 20, left: 30, right: 40 };
  const minVal = Math.min(...data.map(d => d.v)), maxVal = Math.max(...data.map(d => d.v));
  const range = maxVal - minVal || 1;
  const startTime = data[0].t, endTime = data[data.length - 1].t;
  const xScale = (t) => padding.left + ((t - startTime) / (endTime - startTime || 1)) * (width - padding.left - padding.right);
  const yScale = (v) => padding.top + (1 - (v - minVal) / range) * (height - padding.top - padding.bottom);
  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.v)}`).join(' ');
  const areaPath = `${path} L${xScale(endTime)},${height - padding.bottom} L${xScale(startTime)},${height - padding.bottom} Z`;
  const yAxisLabels = [minVal, minVal + range * 0.25, minVal + range * 0.5, minVal + range * 0.75, maxVal];
  const fmtLabel = (v) => displaySymbol === "Rp." ? `Rp. ${Math.round(v).toLocaleString('id-ID')}` : `$ ${Math.round(v / usdIdr).toLocaleString()}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="rounded">
      <defs>
        <linearGradient id="areaGradient2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity={0.24} />
          <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaGradient2)" />
      <path d={path} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {yAxisLabels.map((v, idx) => (
        <g key={idx}>
          <line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.04)" strokeDasharray="2,2" />
          <text x={width - padding.right + 6} y={yScale(v) + 4} fontSize="11" fill="#6B7280">{fmtLabel(v)}</text>
        </g>
      ))}
    </svg>
  );
};

const AllocationDonut = ({ data, displayCcySymbol, usdIdr }) => {
  const [hover, setHover] = useState(null);
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: '' });
  const ref = useRef(null);
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  if (!total) return <div className="text-center text-gray-500 py-8">No assets to display</div>;
  const size = 220, innerRadius = 60, outerRadius = 90;
  const colors = ["#22c55e", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#3f3f46", "#52525b", "#71717a"];
  let cum = -Math.PI / 2;
  const handleMove = (e) => { if (ref.current) { const r = ref.current.getBoundingClientRect(); setTooltip(t => ({ ...t, x: e.clientX - r.left, y: e.clientY - r.top })); } };
  const handleOver = (i, d) => { setHover(i); const pct = Math.round(d.value / total * 100); const val = Math.round(d.value * (displayCcySymbol === "Rp." ? usdIdr : 1)); setTooltip(t => ({ ...t, show: true, content: `${d.name}: ${displayCcySymbol === "Rp." ? 'Rp.' : '$'} ${new Intl.NumberFormat(displayCcySymbol === "Rp." ? 'id-ID' : 'en-US').format(val)} (${pct}%)` })); };
  const handleOut = () => { setHover(null); setTooltip(t => ({ ...t, show: false })); };

  return (
    <div className="flex flex-col md:flex-row items-center gap-6" ref={ref} onMouseMove={handleMove}>
      <div className="relative" style={{ width: size, height: size }}>
        {tooltip.show && (<div className="absolute z-10 p-2 text-xs bg-gray-800 text-white rounded shadow-lg pointer-events-none" style={{ left: tooltip.x + 15, top: tooltip.y }}>{tooltip.content}</div>)}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><g transform={`translate(${size/2}, ${size/2})`}>
          {data.map((d, i) => {
            const angle = (d.value / total) * 2 * Math.PI;
            const start = cum;
            const end = cum + angle;
            cum = end;
            const isH = hover === i;
            const rOut = isH ? outerRadius + 6 : outerRadius;
            const arc = (r, sa, ea) => { const large = ea - sa <= Math.PI ? "0" : "1"; return `M ${r*Math.cos(sa)} ${r*Math.sin(sa)} A ${r} ${r} 0 ${large} 1 ${r*Math.cos(ea)} ${r*Math.sin(ea)}`; };
            const path = `${arc(rOut, start, end)} L ${innerRadius*Math.cos(end)} ${innerRadius*Math.sin(end)} ${arc(innerRadius, end, start).replace('M','L').replace(new RegExp(`A ${innerRadius} ${innerRadius} 0 \\d 1`), `A ${innerRadius} ${innerRadius} 0 ${angle>Math.PI?1:0} 0`)} Z`;
            return (<path key={d.name} d={path} fill={colors[i % colors.length]} onMouseOver={() => handleOver(i, d)} onMouseOut={handleOut} style={{ transition: 'all .18s', cursor: 'pointer' }} />);
          })}
        </g></svg>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full">
        {data.slice(0, 8).map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div style={{ backgroundColor: colors[i % colors.length] }} className="w-3 h-3 rounded-sm flex-shrink-0"></div>
            <div><div className="font-semibold text-sm text-gray-100">{d.name}</div><div className="text-xs text-gray-400">{Math.round(d.value / total * 100)}%</div></div>
          </div>
        ))}
      </div>
    </div>
  );
};