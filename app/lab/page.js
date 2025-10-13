// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Icons ===================== */
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIconSimple = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const GraphIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>);
const TrashIcon = ({className}) => (<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>);
const ArrowUpIcon = () => <svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/></svg>;
const ArrowDownIcon = () => <svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/></svg>;
const InfoIcon = () => <svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>;

/* ===================== Config & Helpers ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`;
const COINGECKO_TETHER_IDR_MARKET = `${COINGECKO_API}/coins/markets?vs_currency=idr&ids=tether`;
const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v).replace(/,/g, '').replace(/\s/g,'')); return isNaN(n) ? 0 : n; };

function formatMoney(value, ccySymbol) {
  const n = Number(value || 0);
  if (ccySymbol === "$") {
    return `${ccySymbol} ${n.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
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

/* ===================== Main Component ===================== */
export default function PortfolioDashboard() {
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v9") || "[]").map(ensureNumericAsset) : []);
  const [realizedUSD, setRealizedUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_realized_v9") || 0) : 0);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_transactions_v9") || "[]") : []);
  const [tradingBalance, setTradingBalance] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_balance_v9") || 5952) : 5952);
  const [totalDeposits, setTotalDeposits] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_deposits_v9") || 5952) : 5952);
  const [displaySymbol, setDisplaySymbol] = useState(() => isBrowser ? (localStorage.getItem("pf_display_sym_v9") || "Rp.") : "Rp.");
  
  const [usdIdr, setUsdIdr] = useState(16400);
  const [usdIdrChange24h, setUsdIdrChange24h] = useState(0);
  const [priceDirection, setPriceDirection] = useState('neutral'); // 'up', 'down', 'neutral'
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

  const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");

  useEffect(() => { if (isBrowser) localStorage.setItem("pf_assets_v9", JSON.stringify(assets)); }, [assets]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_realized_v9", String(realizedUSD)); }, [realizedUSD]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_transactions_v9", JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_balance_v9", String(tradingBalance)); }, [tradingBalance]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_deposits_v9", String(totalDeposits)); }, [totalDeposits]);
  useEffect(() => { if (isBrowser) localStorage.setItem("pf_display_sym_v9", displaySymbol); }, [displaySymbol]);

  useEffect(() => {
    const fetchFx = async () => {
      setIsFxLoading(true);
      try {
        const res = await fetch(COINGECKO_TETHER_IDR_MARKET);
        const j = await res.json();
        if (j && j[0]) {
          const newPrice = Math.round(j[0].current_price);
          const newChange = j[0].price_change_percentage_24h || 0;

          setUsdIdr(prevPrice => {
            if (prevPrice !== 0 && newPrice > prevPrice) setPriceDirection('up');
            else if (prevPrice !== 0 && newPrice < prevPrice) setPriceDirection('down');
            else setPriceDirection('neutral');
            return newPrice;
          });

          setUsdIdrChange24h(newChange);
        }
      } catch (e) {
        console.error("Failed to fetch FX data", e);
      } finally {
        setIsFxLoading(false);
        setTimeout(() => setPriceDirection('neutral'), 1500); // Reset color after 1.5 seconds
      }
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
          if (!res.ok) throw new Error('search failed');
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

  const addAssetWithInitial = (qty, price) => {
    qty = Number(qty || 0); price = Number(price || 0);
    let p = selectedSuggestion;
    if (!p) {
      const t = query.split("—")[0].trim();
      if (!t) { alert("Select a suggestion"); return; }
      p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: 'stock' };
    }
    if (qty <= 0 || price <= 0) { alert("Quantity & price must be > 0"); return; }
    const priceUSD = (displaySymbol === "Rp.") ? price / usdIdr : price;
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

  const handleAddBalance = (amount) => {
    const amountIDR = displaySymbol === "Rp." ? amount : amount * usdIdr;
    setTradingBalance(b => b + amountIDR);
    setTotalDeposits(d => d + amountIDR);
    setBalanceModalOpen(false);
  };
  const handleWithdraw = (amount) => {
    const amountIDR = displaySymbol === "Rp." ? amount : amount * usdIdr;
    if (amountIDR > tradingBalance) { alert("Withdrawal amount exceeds balance."); return; }
    setTradingBalance(b => b - amountIDR);
    setBalanceModalOpen(false);
  };

  /* ===================== Derived Data ===================== */
  const { rows, totals, totalEquity, tradeStats } = useMemo(() => {
    const calculatedRows = assets.map(a => {
      const effectiveLastPriceUSD = a.lastPriceUSD > 0 ? a.lastPriceUSD : a.avgPrice;
      const market = a.shares * effectiveLastPriceUSD;
      const pnl = market - a.investedUSD;
      const pnlPct = a.investedUSD > 0 ? (pnl / a.investedUSD) * 100 : 0;
      return { 
        ...a, 
        lastPriceUSD: effectiveLastPriceUSD,
        marketValueUSD: market, 
        pnlUSD: pnl, 
        pnlPct 
      };
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
    return { rows: calculatedRows, totals: { invested, market, pnl, pnlPct }, totalEquity: totalEq, tradeStats: tStats };
  }, [assets, transactions, usdIdr, tradingBalance, realizedUSD]);

  /* ===================== Equity Timeline ===================== */
  const equitySeries = useMemo(() => {
    const buysCost = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + (t.cost || 0), 0);
    const sellsProceeds = transactions.filter(t => t.type === 'sell' || t.type === 'delete').reduce((s, t) => s + (t.proceeds || 0), 0);
    const initialCashIdr = tradingBalance + Math.round(buysCost * usdIdr) - Math.round(sellsProceeds * usdIdr);
    const sorted = [...transactions].sort((a,b) => a.date - b.date);
    let cash = initialCashIdr;
    let holdings = {};
    const points = [];
    const startTime = sorted.length ? sorted[0].date : Date.now() - 365*24*3600*1000;
    const addPoint = (t) => {
      const marketUSD = Object.values(holdings).reduce((s,h) => s + (h.shares * (h.lastPriceUSD || h.avgPriceUSD || 0)), 0);
      const marketIdr = Math.round(marketUSD * usdIdr);
      points.push({ t, v: cash + marketIdr });
    };
    addPoint(startTime - 1000);
    for (const tx of sorted) {
      if (tx.type === 'buy') {
        const costIdr = Math.round((tx.cost || 0) * usdIdr);
        cash -= costIdr;
        const key = tx.symbol;
        if (!holdings[key]) holdings[key] = { shares: 0, avgPriceUSD: 0, investedUSD: 0, lastPriceUSD: 0 };
        holdings[key].shares += tx.qty;
        holdings[key].investedUSD += (tx.cost || 0);
        holdings[key].avgPriceUSD = holdings[key].investedUSD / holdings[key].shares;
        const a = assets.find(x => x.symbol === key);
        if (a) holdings[key].lastPriceUSD = a.lastPriceUSD || holdings[key].avgPriceUSD;
      } else if (tx.type === 'sell' || tx.type === 'delete') {
        const proceedsIdr = Math.round((tx.proceeds || 0) * usdIdr);
        cash += proceedsIdr;
        const key = tx.symbol;
        if (!holdings[key]) holdings[key] = { shares:0, avgPriceUSD:0, investedUSD:0, lastPriceUSD:0 };
        holdings[key].shares -= tx.qty;
        holdings[key].investedUSD -= (tx.qty * (tx.pricePerUnit || 0));
        if (holdings[key].shares <= 0) delete holdings[key];
        else holdings[key].avgPriceUSD = holdings[key].investedUSD / holdings[key].shares;
        const a = assets.find(x => x.symbol === key);
        if (a) holdings[key].lastPriceUSD = a.lastPriceUSD || holdings[key].avgPriceUSD;
      }
      addPoint(tx.date);
    }
    const now = Date.now();
    const finalMarketUSD = assets.reduce((s,a) => s + a.shares * (a.lastPriceUSD > 0 ? a.lastPriceUSD : a.avgPrice), 0);
    const finalMarketIdr = Math.round(finalMarketUSD * usdIdr);
    points.push({ t: now, v: tradingBalance + finalMarketIdr });
    const unique = [];
    const seen = new Set();
    for (const p of points) {
      if (!seen.has(p.t)) { unique.push(p); seen.add(p.t); }
    }
    return unique.length ? unique : [{ t: now - 1000, v: 0 }, { t: now, v: finalMarketIdr + tradingBalance }];
  }, [transactions, assets, tradingBalance, usdIdr]);

  /* ===================== CSV ===================== */
  const exportCSV = () => {
    const pad = s => `"${String(s||"").replace(/"/g,'""')}"`;
    const assetHeaders = ["id","type","symbol","name","shares","avgPriceUSD","investedUSD","lastPriceUSD"];
    const assetsCsv = [assetHeaders.join(",")].concat(assets.map(a => assetHeaders.map(h => pad(a[h])).join(","))).join("\n");
    const txHeaders = ["id","type","assetId","symbol","qty","pricePerUnit","cost","proceeds","realized","date","note"];
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
          const header = assetsBlock[0].split(",").map(h => h.replace(/"/g,'').trim());
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
          const header = txBlock[0].split(",").map(h => h.replace(/"/g,'').trim());
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
            note: r.note
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

  /* ================ Render ================ */
  if (view === 'performance') {
    return <PerformancePage totals={totals} totalEquity={totalEquity} tradeStats={tradeStats} setView={setView} usdIdr={usdIdr} displaySymbol={displaySymbol} portfolioData={rows} transactions={transactions} equitySeries={equitySeries} />;
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
          <div className="flex items-center gap-3">
            <UserAvatar />
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 flex items-center gap-2">
                <img src="/tether.png" alt="Tether" className="w-5 h-5" />
                <div className={`font-semibold text-xs tabular-nums transition-colors duration-500 ${
                    priceDirection === 'up' ? 'text-emerald-400' : priceDirection === 'down' ? 'text-red-400' : 'text-white'
                }`}>
                  {isFxLoading ? '...' : `Rp ${new Intl.NumberFormat('id-ID').format(usdIdr)}`}
                </div>
                {!isFxLoading && (
                  <div className={`flex items-center text-xs font-semibold ${usdIdrChange24h >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className={`mr-1 ${usdIdrChange24h < 0 ? 'transform rotate-180' : ''}`}>
                      <path d="M7 14l5-5 5 5z"/>
                    </svg>
                    {usdIdrChange24h.toFixed(2)}%
                  </div>
                )}
              </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400">IDR</span>
              <div
                role="switch"
                aria-checked={displaySymbol === "$"}
                onClick={() => setDisplaySymbol(prev => prev === "Rp." ? "$" : "Rp.")}
                className={`relative w-12 h-6 rounded-full p-1 cursor-pointer transition ${displaySymbol === "$" ? 'bg-emerald-600' : 'bg-gray-700'}`}
                title="Toggle display currency"
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${displaySymbol === "$" ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </div>
              <span className="text-xs font-semibold text-gray-400">USD</span>
            </div>

            <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
          </div>
        </header>

        <main>
          <div className="border-b border-gray-800 px-4">
            <nav className="flex space-x-6 py-2"></nav>
          </div>

          <section className="p-4">
            <div className="grid grid-cols-3 gap-px bg-[#0a0a0a] p-px">
              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Cash</p>
                <p className="font-semibold text-xs text-white">
                  {displaySymbol === "Rp." ? formatMoney(tradingBalance, "Rp.") : formatMoney(tradingBalance / usdIdr, "$")}
                </p>
              </div>

              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Invested</p>
                <p className="font-semibold text-xs text-white">
                  {displaySymbol === "Rp." ? formatMoney(totals.invested * usdIdr, "Rp.") : formatMoney(totals.invested, "$")}
                </p>
              </div>

              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Total Equity</p>
                <p className="font-semibold text-xs text-white">
                  {displaySymbol === "Rp." ? formatMoney(totalEquity, "Rp.") : formatMoney(totalEquity / usdIdr, "$")}
                </p>
              </div>

              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Gain P&L</p>
                <p className={`font-semibold text-xs ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totals.pnl >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(totals.pnl * usdIdr, "Rp.") : formatMoney(totals.pnl, "$")} ({(totals.pnlPct || 0).toFixed(2)}%)
                </p>
              </div>
              
              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Deposit</p>
                <p className="font-semibold text-xs text-white">
                  {displaySymbol === "Rp." ? formatMoney(totalDeposits, "Rp.") : formatMoney(totalDeposits / usdIdr, "$")}
                </p>
              </div>

              <div className="bg-black p-2">
                <p className="text-xs text-gray-500">Realized P&L</p>
                <p className={`font-semibold text-xs ${realizedUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {realizedUSD >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(realizedUSD * usdIdr, "Rp.") : formatMoney(realizedUSD, "$")}
                </p>
              </div>
            </div>

            <div className="mt-4 text-right">
              <div className="text-sm text-white cursor-pointer inline-flex items-center gap-2" onClick={() => setView('performance')}>View Performance <ArrowRightIconSimple /></div>
            </div>
          </section>

          <div className="h-2 bg-[#0a0a0a]"></div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 text-xs font-semibold">
                <tr>
                  <th className="p-3 pt-4">
                    <div>Code</div>
                    <div className="font-normal text-gray-600">Qty</div>
                  </th>
                  <th className="p-3 pt-4 text-right">
                    <div>Invested</div>
                    <div className="font-normal text-gray-600">Avg Price</div>
                  </th>
                  <th className="p-3 pt-4 text-right">
                    <div>Market</div>
                    <div className="font-normal text-gray-600">Current Price</div>
                  </th>
                  <th className="p-3 pt-4 text-right">
                    <div>Gain P&L</div>
                    <div className="font-normal text-gray-600">%</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  return (
                    <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={() => setTradeModal({ open: true, asset: r })}>
                      <td className="p-3">
                        <div className="font-semibold text-sm text-white">{r.symbol}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{formatQty(r.shares)}</div>
                      </td>

                      <td className="p-3 text-right tabular-nums">
                        <div className="font-semibold text-xs text-white">{displaySymbol === "Rp." ? formatMoney(r.investedUSD * usdIdr, "Rp.") : formatMoney(r.investedUSD, "$")}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{displaySymbol === "Rp." ? formatMoney(r.avgPrice * usdIdr, "Rp.") : formatMoney(r.avgPrice, "$")}</div>
                      </td>

                      <td className="p-3 text-right tabular-nums">
                        <div className="font-semibold text-xs text-white">{displaySymbol === "Rp." ? formatMoney(r.marketValueUSD * usdIdr, "Rp.") : formatMoney(r.marketValueUSD, "$")}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{displaySymbol === "Rp." ? formatMoney(r.lastPriceUSD * usdIdr, "Rp.") : formatMoney(r.lastPriceUSD, "$")}</div>
                      </td>

                      <td className="p-3 text-right tabular-nums">
                        <div className={`font-semibold text-xs ${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnlUSD >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(r.pnlUSD * usdIdr, "Rp.") : formatMoney(r.pnlUSD, "$")}</div>
                        <div className={`${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'} text-xs mt-0.5`}>{r.pnlPct.toFixed(2)}%</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {rows.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}

            <div className="p-4 text-center">
              <button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button>
            </div>
          </div>
        </main>

        <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)}>
          <AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, usdIdr, displaySymbol}} />
        </Modal>

        <Modal title={`${balanceModalMode} Balance`} isOpen={isBalanceModalOpen} onClose={() => setBalanceModalOpen(false)}>
          <BalanceManager onConfirm={balanceModalMode === 'Add' ? handleAddBalance : handleWithdraw} displaySymbol={displaySymbol} />
        </Modal>

        <TradeModal isOpen={tradeModal.open} onClose={() => setTradeModal({ open: false, asset: null })} asset={tradeModal.asset} onBuy={handleBuy} onSell={handleSell} onDelete={handleDeleteAsset} usdIdr={usdIdr} displaySymbol={displaySymbol} />

        <BottomSheet isOpen={isManagePortfolioOpen} onClose={() => setManagePortfolioOpen(false)}>
          <ManagePortfolioSheet onImportClick={importCSV} onExportClick={exportCSV} onAddBalance={() => { setManagePortfolioOpen(false); setBalanceModalMode('Add'); setBalanceModalOpen(true); }} onWithdraw={() => { setManagePortfolioOpen(false); setBalanceModalMode('Withdraw'); setBalanceModalOpen(true); }} onClearAll={() => { if(confirm("Erase all portfolio data?")) { setAssets([]); setTransactions([]); setTradingBalance(0); setRealizedUSD(0); setTotalDeposits(0); } }} />
        </BottomSheet>
      </div>
    </div>
  );
}

/* ===================== Performance & Subcomponents ===================== */

const PerformancePage = ({ totals, totalEquity, setView, usdIdr, displaySymbol, portfolioData, transactions, equitySeries, tradeStats }) => {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [chartRange, setChartRange] = useState("YTD");
  const [returnPeriod, setReturnPeriod] = useState('Monthly');

  const { equityReturnData } = useMemo(() => {
    const data = equitySeries;
    if (data.length < 2) return { equityReturnData: [] };

    let periodData = {};

    for (let i = 1; i < data.length; i++) {
        const currentDate = new Date(data[i].t);
        let key;
        if(returnPeriod === 'Daily'){
          key = currentDate.toISOString().split('T')[0];
        } else if(returnPeriod === 'Monthly'){
          key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
        } else { // Yearly
          key = `${currentDate.getFullYear()}`;
        }
        
        if (!periodData[key]) {
            periodData[key] = {
                startDate: new Date(data[i-1].t),
                startEquity: data[i-1].v,
                endDate: currentDate,
                endEquity: data[i].v,
            };
        } else {
            periodData[key].endDate = currentDate;
            periodData[key].endEquity = data[i].v;
        }
    }

    const equityReturnData = Object.keys(periodData).map(key => {
        const item = periodData[key];
        const pnl = item.endEquity - item.startEquity;
        const pnlPct = item.startEquity > 0 ? (pnl / item.startEquity) * 100 : 0;
        
        let dateLabel = key;
        if(returnPeriod === 'Monthly'){
          const date = new Date(item.endDate);
          dateLabel = date.toLocaleString('default', { month: 'short' }) + ' ' + String(date.getDate()).padStart(2, '0');
        } else if(returnPeriod === 'Daily') {
          const date = new Date(item.endDate);
          dateLabel = date.toLocaleString('default', { month: 'short' }) + ' ' + String(date.getDate()).padStart(2, '0');
        }

        return {
            date: dateLabel,
            equity: item.endEquity,
            pnl: pnl,
            pnlPct: pnlPct,
            rawDate: item.endDate
        }
    }).sort((a,b) => b.rawDate - a.rawDate);
    
    return { equityReturnData };
}, [equitySeries, returnPeriod]);


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
              <p className="text-3xl font-bold text-white mb-1">{displaySymbol === "Rp." ? formatMoney(totalEquity, "Rp.") : formatMoney(totalEquity / usdIdr, "$")}</p>
            </div>

            <div className="mt-6">
              <AreaChart equityData={equitySeries} displaySymbol={displaySymbol} usdIdr={usdIdr} range={chartRange} setRange={setChartRange} />
            </div>

            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-semibold text-white">Total Equity Return</h3>
                <div className="flex items-center gap-2 text-sm">
                  {['Daily', 'Monthly', 'Yearly'].map(p => (
                    <button key={p} onClick={() => setReturnPeriod(p)} className={`px-3 py-1 rounded-full ${returnPeriod === p ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>{p}</button>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs">
                  <tr>
                    <th className="p-2 font-normal">Date</th>
                    <th className="p-2 font-normal text-right">Equity</th>
                    <th className="p-2 font-normal text-right">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {equityReturnData.map((item, index) => (
                    <tr key={index} className="border-t border-gray-800">
                      <td className="p-2 text-white">{item.date}</td>
                      <td className="p-2 text-white text-right">{displaySymbol === "Rp." ? formatMoney(item.equity, "Rp.") : formatMoney(item.equity / usdIdr, "$")}</td>
                      <td className={`p-2 text-right ${item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.pnl >= 0 ? '+' : ''}{displaySymbol === "Rp." ? formatMoney(item.pnl, "Rp.") : formatMoney(item.pnl / usdIdr, "$")} ({item.pnlPct.toFixed(2)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-8">
              <PortfolioAllocation data={portfolioData} displayCcySymbol={displaySymbol} usdIdr={usdIdr} />
            </div>

          </div>
        ) : activeTab === 'trade' ? (
          <TradeStatsView stats={tradeStats} transactions={transactions} assets={portfolioData} displayCcySymbol={displaySymbol} usdIdr={usdIdr} />
        ) : (
          <HistoryView transactions={transactions} usdIdr={usdIdr} displayCcySymbol={displaySymbol} />
        )}
      </div>
    </div>
  );
};


const TradeStatsView = ({ stats, transactions, assets, displayCcySymbol, usdIdr }) => {
  const getVal = (val) => displayCcySymbol === "Rp." ? val * usdIdr : val;
  
  const realizedGainSeries = useMemo(() => {
    const sorted = [...transactions.filter(t => t.type === 'sell' || t.type === 'delete')].sort((a,b) => a.date - b.date);
    let cumulativeGain = 0;
    const points = sorted.map(tx => {
      cumulativeGain += tx.realized || 0;
      return {t: tx.date, v: cumulativeGain};
    });
     if (points.length > 0) {
      points.unshift({t: points[0].t - 86400000, v: 0}); // Add a point at the beginning
    }
    return points.length ? points : [{t: Date.now(), v:0}];
  }, [transactions]);
  
  const sells = useMemo(() => transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete'), [transactions]);
  const realizedGainOnly = useMemo(() => sells.filter(tx => tx.realized > 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]);
  const realizedLossOnly = useMemo(() => sells.filter(tx => tx.realized < 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]);

  const {maxProfitPct, maxLossPct} = useMemo(() => {
      const maxProfitTx = transactions.find(tx => tx.realized === stats.maxProfit);
      let maxProfitCost = 0;
      if(maxProfitTx) {
          const asset = assets.find(a => a.id === maxProfitTx.assetId);
          maxProfitCost = maxProfitTx.qty * (asset ? asset.avgPrice : maxProfitTx.pricePerUnit);
      }
      const maxProfitPercentage = maxProfitCost > 0 ? (stats.maxProfit / maxProfitCost) * 100 : 0;

      const maxLossTx = transactions.find(tx => tx.realized === stats.maxLoss);
      let maxLossCost = 0;
      if(maxLossTx){
         const asset = assets.find(a => a.id === maxLossTx.assetId);
         maxLossCost = maxLossTx.qty * (asset ? asset.avgPrice : maxLossTx.pricePerUnit);
      }
      const maxLossPercentage = maxLossCost > 0 ? (stats.maxLoss / maxLossCost) * 100 : 0;
      
      return {maxProfitPct: maxProfitPercentage, maxLossPct: maxLossPercentage};
  }, [transactions, assets, stats.maxProfit, stats.maxLoss]);

  
  const topGainers = useMemo(() => {
    const gainers = {};
    sells.forEach(tx => {
      if(!gainers[tx.symbol]){
        gainers[tx.symbol] = {trades:0, pnl: 0, cost: 0, proceeds: 0};
      }
      const asset = assets.find(a => a.id === tx.assetId);
      gainers[tx.symbol].trades++;
      gainers[tx.symbol].pnl += tx.realized;
      gainers[tx.symbol].cost += tx.qty * (asset?.avgPrice || tx.pricePerUnit);
      gainers[tx.symbol].proceeds += tx.proceeds;
    });
    return Object.entries(gainers)
      .map(([symbol, data]) => ({
        symbol, ...data, 
        pnlPct: data.cost > 0 ? (data.pnl/data.cost)*100 : 0
      }))
      .sort((a,b) => b.pnl - a.pnl).slice(0,5);
  }, [transactions, assets]);

  return (
    <div className="p-4 space-y-6">
      <div className="bg-gray-900 p-4 rounded-lg">
        <h3 className="font-semibold text-white mb-2">Win Rate</h3>
        <div className="flex items-center justify-between">
          <span className="text-3xl font-bold text-white">{stats.winRate.toFixed(2)}%</span>
          <div className="relative w-24 h-24">
            <svg className="w-full h-full transform -rotate-90"><circle cx="50%" cy="50%" r="45%" stroke="#374151" strokeWidth="8" fill="transparent"/><circle cx="50%" cy="50%" r="45%" stroke="#22c55e" strokeWidth="8" fill="transparent" strokeDasharray={`${Math.PI * 45 * 2 * (stats.winRate/100)}, ${Math.PI * 45 * 2}`} /></svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-xs">
              <div>{stats.trades} Trades</div>
              <div className="text-emerald-400">{stats.wins} Wins</div>
              <div className="text-red-400">{stats.losses} Losses</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><ArrowUpIcon className="text-emerald-400"/>Max Profit</p><p className="text-lg font-semibold text-white mt-1">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.maxProfit), "Rp.") : formatMoney(getVal(stats.maxProfit), "$")}</p><p className="text-sm text-emerald-400">{maxProfitPct.toFixed(2)}%</p></div>
        <div className="bg-gray-900 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><ArrowDownIcon className="text-red-400"/>Max Loss</p><p className="text-lg font-semibold text-white mt-1">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.maxLoss), "Rp.") : formatMoney(getVal(stats.maxLoss), "$")}</p><p className="text-sm text-red-400">{maxLossPct.toFixed(2)}%</p></div>
        <div className="bg-gray-900 p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Profit</p><p className="text-lg font-semibold text-white mt-1">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.avgProfit), "Rp.") : formatMoney(getVal(stats.avgProfit), "$")}</p></div>
        <div className="bg-gray-900 p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Loss</p><p className="text-lg font-semibold text-white mt-1">{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.avgLoss), "Rp.") : formatMoney(getVal(stats.avgLoss), "$")}</p></div>
      </div>

      <div className="bg-gray-900 p-4 rounded-lg">
        <h3 className="font-semibold text-white flex items-center gap-1">Total Realized Gain <InfoIcon className="text-gray-400" /></h3>
        <p className={`text-2xl font-bold mt-1 ${stats.totalRealizedGain >=0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.totalRealizedGain >=0 ? '+' : ''}{displayCcySymbol === "Rp." ? formatMoney(getVal(stats.totalRealizedGain), "Rp.") : formatMoney(getVal(stats.totalRealizedGain), "$")}</p>
        <div className="h-40 mt-2">
            <AreaChart equityData={realizedGainSeries.map(p => ({...p, v: getVal(p.v)}))} displaySymbol={displayCcySymbol} usdIdr={usdIdr} range="All" setRange={()=>{}} />
        </div>
        <div className="mt-2 text-xs text-gray-400 border-t border-gray-700 pt-2">
            <div className="flex justify-between"><span>Total Equity Realized Gain</span> <span className="text-white">{formatMoney(getVal(stats.totalRealizedGain), displayCcySymbol)}</span></div>
            <div className="flex justify-between"><span>Realized Gain</span> <span className="text-emerald-400">{formatMoney(getVal(realizedGainOnly), displayCcySymbol)}</span></div>
            <div className="flex justify-between"><span>Realized Loss</span> <span className="text-red-400">{formatMoney(getVal(realizedLossOnly), displayCcySymbol)}</span></div>
        </div>
      </div>
      
      <div className="bg-gray-900 p-4 rounded-lg">
        <h3 className="font-semibold text-white mb-2">Top Gainer ({displayCcySymbol === 'Rp.' ? 'Rp' : '$'})</h3>
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr><th className="text-left font-normal py-1">Code</th><th className="text-center font-normal py-1">Trades</th><th className="text-right font-normal py-1">P&L</th></tr>
          </thead>
          <tbody>
            {topGainers.map(g => (
              <tr key={g.symbol}>
                <td className="py-1 flex items-center gap-2">
                   <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white text-xs">{g.symbol.charAt(0)}</div>
                   {g.symbol}
                </td>
                <td className="text-center py-1">{g.trades}</td>
                <td className={`text-right py-1 ${g.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {g.pnl >= 0 ? '+' : ''}{formatMoney(getVal(g.pnl), displayCcySymbol)} ({g.pnlPct.toFixed(2)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
                <td className="p-3 font-semibold">{tx.symbol}</td>
                <td className="p-3 text-right">{formatQty(tx.qty)}</td>
                <td className="p-3 text-right text-gray-400">{displayCcySymbol === "Rp." ? formatMoney((tx.pricePerUnit || tx.price || 0) * usdIdr, "Rp.") : formatMoney((tx.pricePerUnit || tx.price || 0), "$")}</td>
                <td className="p-3 text-right">{displayCcySymbol === "Rp." ? formatMoney((tx.cost || tx.proceeds || 0) * usdIdr, "Rp.") : formatMoney((tx.cost || tx.proceeds || 0), "$")}</td>
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

const BalanceManager = ({ onConfirm, displaySymbol }) => {
  const [amount, setAmount] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(toNum(amount)); }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1 text-gray-400">Amount ({displaySymbol})</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus className="w-full bg-gray-900 px-3 py-2 rounded border border-gray-700 text-white" placeholder={displaySymbol === "Rp." ? "e.g. 1000000" : "e.g. 100"} />
      </div>
      <button type="submit" className="w-full py-2.5 rounded font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Confirm</button>
    </form>
  );
};

const ManagePortfolioSheet = ({ onImportClick, onExportClick, onAddBalance, onWithdraw, onClearAll }) => ( 
  <div className="p-4 text-white text-sm">
    <h3 className="text-base font-semibold mb-4 px-2">Manage Portfolio</h3>
    <div className="space-y-1">
      <button onClick={onAddBalance} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Add Balance</button>
      <button onClick={onWithdraw} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Withdraw</button>
      <label className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300 block cursor-pointer">Import CSV<input type="file" accept=".csv" onChange={onImportClick} className="hidden" /></label>
      <button onClick={onExportClick} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Export CSV</button>
      <button onClick={onClearAll} className="w-full text-left p-2 rounded hover:bg-red-700/20 text-red-400">Erase all data</button>
    </div>
  </div>
);

const AddAssetForm = ({ searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, displaySymbol }) => {
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');

  const handleInputChange = (field, value) => {
    if (field === 'shares') {
      setShares(value);
      const num = toNum(price) * toNum(value);
      setTotal(num ? `${Math.round(num)}` : '');
    } else if (field === 'price') {
      setPrice(value);
      const num = toNum(value) * toNum(shares);
      setTotal(num ? `${Math.round(num)}` : '');
    } else if (field === 'total') {
      setTotal(value);
      const nTotal = toNum(value), nShares = toNum(shares);
      if (nShares > 0) setPrice(String(Math.round(nTotal / nShares)));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-700">
        {[{ key: 'stock', label: 'Stock' }, { key:'crypto', label:'Crypto' }, { key:'nonliquid', label:'Non-Liquid' }].map(item => (
          <button key={item.key} onClick={() => setSearchMode(item.key)} className={`px-3 py-2 text-sm font-medium ${searchMode === item.key ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400'}`}>{item.label}</button>
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
              <label className="text-xs text-gray-400">Price ({displaySymbol})</label>
              <input value={price} onChange={e => handleInputChange('price', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400">Total Value ({displaySymbol})</label>
            <input value={total} onChange={e => handleInputChange('total', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text" />
          </div>

          <div className="flex justify-end">
            <button onClick={() => addAssetWithInitial(toNum(shares), toNum(price))} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Position</button>
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

  useEffect(() => {
    if (asset) {
      const priceVal = displaySymbol === "Rp." ? asset.lastPriceUSD * usdIdr : asset.lastPriceUSD;
      setPrice(String(isFinite(priceVal) ? (displaySymbol === "$" ? priceVal.toFixed(3) : Math.round(priceVal)) : ''));
      setShares('');
      setTotal('');
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

  const priceUSD = (displaySymbol === 'Rp.') ? toNum(price) / usdIdr : toNum(price);

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
          <input type="text" value={shares} onChange={e=>handleInputChange('shares', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
        </div>

        <div>
          <label className="text-xs text-gray-400">Price ({displaySymbol})</label>
          <input type="text" value={price} onChange={e=>handleInputChange('price', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
        </div>

        <div>
          <label className="text-xs text-gray-400">Total ({displaySymbol})</label>
          <input type="text" value={total} onChange={e=>handleInputChange('total', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" />
        </div>

        <div className="flex gap-2">
          <button onClick={doSubmit} className={`flex-1 py-2.5 rounded font-semibold text-white ${mode === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>Confirm {mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
          <button onClick={() => onDelete(asset)} title="Delete (liquidate)" className="py-2.5 px-3 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center gap-2">
            <TrashIcon className="text-white" />
          </button>
        </div>
      </div>
    </Modal>
  );
};

/* ===================== Charts ===================== */
const AreaChart = ({ equityData, displaySymbol, usdIdr, range, setRange }) => {
  const [hoverData, setHoverData] = useState(null);
  const svgRef = useRef(null);

  const now = new Date();
  let startTime;
  switch (range) {
    case '1W': startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case '1M': startTime = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
    case '3M': startTime = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
    case '1Y': startTime = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    case 'All': startTime = equityData.length > 1 ? new Date(equityData[0].t) : new Date(0); break;
    case 'YTD':
    default: startTime = new Date(now.getFullYear(), 0, 1); break;
  }
  
  const filteredData = equityData.filter(d => d.t >= startTime.getTime());
  const data = filteredData.length > 1 ? [{t: startTime.getTime(), v: filteredData.length > 0 ? filteredData[0].v : 0}, ...filteredData] : [{t:Date.now()-1000, v:0}, {t:Date.now(), v:0}];

  const height = 220, width = 700, padding = { top: 20, bottom: 40, left: 0, right: 80 };
  const minVal = Math.min(...data.map(d => d.v));
  const maxVal = Math.max(...data.map(d => d.v));
  const valRange = maxVal - minVal || 1;
  const timeStart = data[0].t;
  const timeEnd = data[data.length - 1].t;
  
  const xScale = (t) => padding.left + ((t - timeStart) / (timeEnd - timeStart || 1)) * (width - padding.left - padding.right);
  const yScale = (v) => padding.top + (1 - (v - minVal) / valRange) * (height - padding.top - padding.bottom);
  
  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.v)}`).join(' ');
  const areaPath = `${path} L${xScale(timeEnd)},${height - padding.bottom} L${xScale(timeStart)},${height - padding.bottom} Z`;
  
  const yAxisLabels = [minVal, minVal + valRange * 0.25, minVal + valRange * 0.5, minVal + valRange * 0.75, maxVal];
  
  const formatValue = (v) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)} K`;
    return Math.round(v);
  }
  const fmtYLabel = (v) => displaySymbol === "Rp." ? formatValue(v) : `$ ${formatValue(v / usdIdr)}`;

  const xAxisLabels = () => {
    const labels = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
        const t = timeStart + (i / (count - 1)) * (timeEnd - timeStart);
        labels.push({t: t, label: new Date(t).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})});
    }
    return labels;
  }
  
  const handleMouseMove = (event) => {
    if (!svgRef.current || data.length < 2) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;

    const time = timeStart + ((x - padding.left) / (width - padding.left - padding.right)) * (timeEnd - timeStart);

    let closestPoint = data.reduce((prev, curr) => Math.abs(curr.t - time) < Math.abs(prev.t - time) ? curr : prev);
    
    if (closestPoint) {
        setHoverData({
            point: closestPoint,
            x: xScale(closestPoint.t),
            y: yScale(closestPoint.v),
        });
    }
  };

  const handleMouseLeave = () => {
      setHoverData(null);
  };

  return (
    <div>
        <div className="relative">
            <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="rounded" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
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
                <line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" />
                <text x={width - padding.right + 6} y={yScale(v) + 4} fontSize="11" fill="#6B7280">{fmtYLabel(v)}</text>
                </g>
            ))}
            {xAxisLabels().map((item, idx) => (
                <text key={idx} x={xScale(item.t)} y={height - padding.bottom + 15} textAnchor="middle" fontSize="11" fill="#6B7280">{item.label}</text>
            ))}
            {hoverData && (
                <g>
                    <line y1={padding.top} y2={height - padding.bottom} x1={hoverData.x} x2={hoverData.x} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="3,3" />
                    <circle cx={hoverData.x} cy={hoverData.y} r="4" fill="#22c55e" stroke="white" strokeWidth="2" />
                </g>
            )}
            <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height-padding.top-padding.bottom} fill="transparent" />
            </svg>
            {hoverData && (
                 <div className="absolute p-2 rounded-lg bg-gray-800 text-white text-xs pointer-events-none" style={{ left: `${hoverData.x / width * 100}%`, top: `${padding.top-10}px`, transform: `translateX(-50%)` }}>
                    <div>{new Date(hoverData.point.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    <div className="font-bold">{displaySymbol === 'Rp.' ? formatMoney(hoverData.point.v, 'Rp.') : formatMoney(hoverData.point.v / usdIdr, '$')}</div>
                </div>
            )}
        </div>
        <div className="flex justify-center gap-2 mt-2">
            {['1W', '1M', '3M', 'YTD', '1Y', 'All'].map(r => (
                <button key={r} onClick={() => setRange(r)} className={`px-3 py-1 text-xs rounded-full ${range === r ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>{r}</button>
            ))}
        </div>
    </div>
  );
};

const PortfolioAllocation = ({ data: fullAssetData, displayCcySymbol, usdIdr }) => {
  const [activeTab, setActiveTab] = useState('Equity');
  const [hoveredSegment, setHoveredSegment] = useState(null);

  const equityData = useMemo(() => 
    fullAssetData.filter(d => d.type === 'stock' || d.type === 'crypto')
    .map(d => ({ name: d.symbol, value: d.marketValueUSD }))
    .sort((a,b)=>b.value-a.value), [fullAssetData]);
  
  const sectorData = useMemo(() => {
    const sectors = {
        'Equity': { value: 0, color: '#10B981', count: 0 },
        'Crypto': { value: 0, color: '#3B82F6', count: 0 },
        'Non-Liquid': { value: 0, color: '#F97316', count: 0 }
    };
    fullAssetData.forEach(asset => {
        if (asset.type === 'stock') {
            sectors['Equity'].value += asset.marketValueUSD;
            sectors['Equity'].count++;
        } else if (asset.type === 'crypto') {
            sectors['Crypto'].value += asset.marketValueUSD;
            sectors['Crypto'].count++;
        } else if (asset.type === 'nonliquid') {
            sectors['Non-Liquid'].value += asset.marketValueUSD;
            sectors['Non-Liquid'].count++;
        }
    });
    return Object.entries(sectors)
        .map(([name, data]) => ({ name, ...data }))
        .filter(d => d.value > 0);
  }, [fullAssetData]);

  const data = activeTab === 'Equity' ? equityData : sectorData;
  const totalValueUSD = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  
  if (!totalValueUSD) return null;

  const totalValueDisplay = displayCcySymbol === "Rp." ? totalValueUSD * usdIdr : totalValueUSD;
  const assetCount = data.length;

  const size = 200, strokeWidth = 20, innerRadius = (size / 2) - strokeWidth;
  const colors = ["#10B981", "#3B82F6", "#F97316", "#8B5CF6", "#F59E0B", "#64748B"];

  let accumulatedAngle = 0;

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-white mb-4">Portfolio Allocation</h3>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setActiveTab('Equity')} className={`px-4 py-1 text-sm rounded-full ${activeTab === 'Equity' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Equity</button>
        <button onClick={() => setActiveTab('Sub-Sector')} className={`px-4 py-1 text-sm rounded-full ${activeTab === 'Sub-Sector' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Sub-Sector</button>
      </div>

      <div className="relative flex justify-center items-center" style={{ width: size, height: size, margin: '0 auto 2rem auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {data.map((d, i) => {
            const percentage = d.value / totalValueUSD;
            const angle = percentage * 360;
            const isHovered = hoveredSegment === d.name;
            
            const segment = (
              <circle
                key={i}
                cx={size/2} cy={size/2} r={innerRadius}
                fill="transparent"
                stroke={d.color || colors[i % colors.length]}
                strokeWidth={strokeWidth + (isHovered ? 4 : 0)}
                strokeDasharray={`${(angle - 2) * Math.PI * innerRadius / 180} ${360 * Math.PI * innerRadius / 180}`}
                strokeDashoffset={-accumulatedAngle * Math.PI * innerRadius / 180}
                className="transition-all duration-300"
                onMouseOver={() => setHoveredSegment(d.name)}
                onMouseOut={() => setHoveredSegment(null)}
              />
            );
            accumulatedAngle += angle;
            return segment;
          })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center pointer-events-none">
          <div className="text-xl font-bold text-white">{formatMoney(totalValueDisplay, displayCcySymbol)}</div>
          <div className="text-sm text-gray-400">{assetCount} {activeTab === 'Equity' ? 'Items' : 'Sectors'}</div>
        </div>
      </div>
      
      <div className="space-y-2">
        {data.map((d, i) => {
          const percentage = (d.value / totalValueUSD) * 100;
          const valueDisplay = d.value * (displayCcySymbol === "Rp." ? usdIdr : 1);
          const isHovered = hoveredSegment === d.name;
          return (
            <div 
              key={i}
              className={`p-2 rounded-lg transition-colors duration-300 ${isHovered ? 'bg-gray-800' : ''}`}
              onMouseOver={() => setHoveredSegment(d.name)}
              onMouseOut={() => setHoveredSegment(null)}
            >
              <div className="flex justify-between items-center text-sm mb-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white">{d.name.charAt(0)}</div>
                  <div>
                    <div className="font-semibold text-white">{d.name}</div>
                    <div className="text-xs text-gray-400">{formatMoney(valueDisplay, displayCcySymbol)}</div>
                  </div>
                </div>
                <div className="text-white font-semibold">{percentage.toFixed(2)}%</div>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                <div className="h-1.5 rounded-full" style={{ width: `${percentage}%`, backgroundColor: d.color || colors[i % colors.length] }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


