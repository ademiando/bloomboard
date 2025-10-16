// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Icons ===================== */
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIconSimple = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const TrashIcon = ({className}) => (<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>);
const ArrowUpIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/></svg>;
const ArrowDownIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/></svg>;
const InfoIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>;
const AvgProfitIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20V16"/></svg>;
const AvgLossIcon = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v10"/><path d="M18 4v16"/><path d="M6 4v8"/></svg>;
const EquityIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M7 16V8l4 4 4-4v8"/></svg>;
const CryptoIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8.5 14.5h7M8.5 9.5h7M12 17.5v-11"/></svg>;
const NonLiquidIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const StarIcon = ({ isFilled, ...props }) => (<svg {...props} width="20" height="20" viewBox="0 0 24 24" fill={isFilled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>);
const SearchIcon = (props) => (<svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>);

/* ===================== Config & Helpers ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_FINANCE_SEARCH_URL = (q) => `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const PROXIED_YAHOO_SEARCH = (q) => `https://api.allorigins.win/raw?url=${encodeURIComponent(YAHOO_FINANCE_SEARCH_URL(q))}`;

const FINNHUB_TOKEN = "cns0a0pr01qj9b42289gcns0a0pr01qj9b4228a0";
const FINNHUB_QUOTE = (symbol) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_TOKEN}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr&include_24hr_change=true`;

const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v).replace(/,/g, '').replace(/\s/g,'')); return isNaN(n) ? 0 : n; };

function formatCurrency(value, valueIsUSD, displaySymbol, usdIdr) {
  let displayValue;
  if (displaySymbol === '$') {
    displayValue = valueIsUSD ? value : value / usdIdr;
    return `$${displayValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  } else { // 'Rp'
    displayValue = valueIsUSD ? value * usdIdr : value;
    return `Rp ${Math.round(displayValue).toLocaleString('id-ID')}`;
  }
}

function formatQty(v) {
  const n = Number(v || 0);
  if (n === 0) return "0";
  if (Math.abs(n) < 1) return n.toFixed(6).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
  return n.toLocaleString('id-ID');
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
    type: a.type || "stock",
    image: a.image || null,
  };
}

/* ===================== UI Helpers ===================== */
const Modal = ({ children, isOpen, onClose, title }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 rounded-lg w-full max-w-lg border border-zinc-800 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-zinc-800">
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
      <div className={`fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto my-3"></div>
        {children}
      </div>
    </div>
  );
};

/* ===================== Main Component ===================== */
export default function PortfolioDashboard() {
  const STORAGE_VERSION = "v16";
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_assets_${STORAGE_VERSION}`) || "[]").map(ensureNumericAsset) : []);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_transactions_${STORAGE_VERSION}`) || "[]") : []);
  
  const [financialSummaries, setFinancialSummaries] = useState({
      realizedUSD: 0,
      tradingBalance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
  });

  const [displaySymbol, setDisplaySymbol] = useState(() => isBrowser ? (localStorage.getItem(`pf_display_sym_${STORAGE_VERSION}`) || "Rp") : "Rp");
  
  const [usdIdr, setUsdIdr] = useState(16400);
  const [watchedAssetIds, setWatchedAssetIds] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_watched_assets_${STORAGE_VERSION}`) || '["tether", "bitcoin"]') : ['tether', 'bitcoin']);
  const [watchedAssetData, setWatchedAssetData] = useState({});

  const [view, setView] = useState('main');
  const [isAddAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [isPortfolioGrowthModalOpen, setIsPortfolioGrowthModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("stock");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [isManagePortfolioOpen, setManagePortfolioOpen] = useState(false);
  const [isBalanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceModalMode, setBalanceModalMode] = useState('Add');
  const [tradeModal, setTradeModal] = useState({ open: false, asset: null });

  const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");
  const importInputRef = useRef(null);
  
  const recalculateStateFromTransactions = (txs) => {
    let newAssets = {};
    let realizedUSD = 0;
    let tradingBalance = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    const sortedTxs = [...txs].sort((a, b) => a.date - b.date);

    for (const tx of sortedTxs) {
      if (tx.type === 'deposit') {
        tradingBalance += tx.amount;
        totalDeposits += tx.amount;
        continue;
      }
      if (tx.type === 'withdraw') {
        tradingBalance -= tx.amount;
        totalWithdrawals += tx.amount;
        continue;
      }
      
      const assetId = tx.assetId || `${tx.type}:${tx.symbol}`;
      
      if (!newAssets[assetId]) {
        newAssets[assetId] = ensureNumericAsset({
          ...tx.assetStub,
          shares: 0,
          investedUSD: 0,
          avgPrice: 0,
        });
      }
      
      const asset = newAssets[assetId];

      if (tx.type === 'buy') {
        tradingBalance -= tx.cost * usdIdr;
        const totalInvested = asset.investedUSD + tx.cost;
        const totalShares = asset.shares + tx.qty;
        asset.investedUSD = totalInvested;
        asset.shares = totalShares;
        asset.avgPrice = totalShares > 0 ? totalInvested / totalShares : 0;
      } else if (tx.type === 'sell' || tx.type === 'delete') {
        tradingBalance += tx.proceeds * usdIdr;
        realizedUSD += tx.realized;
        const costOfSold = asset.avgPrice * tx.qty;
        asset.investedUSD -= costOfSold;
        asset.shares -= tx.qty;
      }
    }
    
    setAssets(Object.values(newAssets).filter(a => a.shares > 0.000001));
    setFinancialSummaries({ realizedUSD, tradingBalance, totalDeposits, totalWithdrawals });
  };

  useEffect(() => {
    if(isBrowser) {
        localStorage.setItem(`pf_transactions_${STORAGE_VERSION}`, JSON.stringify(transactions));
        recalculateStateFromTransactions(transactions);
    }
  }, [transactions, usdIdr]);
  
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_assets_${STORAGE_VERSION}`, JSON.stringify(assets)); }, [assets]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_display_sym_${STORAGE_VERSION}`, displaySymbol); }, [displaySymbol]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_watched_assets_${STORAGE_VERSION}`, JSON.stringify(watchedAssetIds)); }, [watchedAssetIds]);

  useEffect(() => {
    const pollPrices = async () => {
      if (assets.length === 0 && watchedAssetIds.length === 0) return;
      const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol).filter(Boolean))];
      const cryptoIds = [...new Set(assets.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId))];
      
      const newPrices = {};
      const newWatchedData = {};

      for (const symbol of stockSymbols) {
          try {
              const res = await fetch(FINNHUB_QUOTE(symbol));
              const data = await res.json();
              if (data && data.c > 0) {
                  newPrices[symbol] = data.c;
              }
          } catch (e) { console.error(`Failed to fetch price for ${symbol}`, e); }
      }

      const allCryptoIds = [...new Set([...cryptoIds, ...watchedAssetIds])];
      if (allCryptoIds.length > 0) {
        try {
          const res = await fetch(COINGECKO_PRICE(allCryptoIds.join(',')));
          const j = await res.json();
          for (const id of allCryptoIds) {
            if (j[id]) {
                const asset = assets.find(a => a.coingeckoId === id);
                if (asset) newPrices[asset.symbol] = j[id].usd;
                if (watchedAssetIds.includes(id)) {
                    const cryptoDetails = await fetch(`${COINGECKO_API}/coins/${id}`).then(res => res.json());
                    newWatchedData[id] = {
                        id: id,
                        price_usd: j[id].usd,
                        price_idr: j[id].idr,
                        change_24h: j[id].usd_24h_change,
                        name: cryptoDetails.name,
                        symbol: cryptoDetails.symbol.toUpperCase(),
                        image: cryptoDetails.image.small
                    };
                }
            }
          }
        } catch (e) { console.error("Failed to fetch crypto prices", e); }
      }
      
      if (Object.keys(newPrices).length > 0) {
        setAssets(prev => prev.map(a => {
            if (newPrices[a.symbol]) {
                const priceInUSD = a.symbol.endsWith('.JK') ? newPrices[a.symbol] / usdIdr : newPrices[a.symbol];
                return { ...a, lastPriceUSD: priceInUSD };
            }
            return a;
        }));
      }
      if(Object.keys(newWatchedData).length > 0) {
        setWatchedAssetData(newWatchedData);
      }
    };
    pollPrices();
    const id = setInterval(pollPrices, 25000);
    return () => clearInterval(id);
  }, [assets.length, usdIdr, watchedAssetIds]);

  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        const url = searchMode === 'crypto' ? `${COINGECKO_API}/search?query=${encodeURIComponent(q)}` : PROXIED_YAHOO_SEARCH(q);
        const res = await fetch(url);
        if (!res.ok) throw new Error('Search API failed with status: ' + res.status);
        const text = await res.text();
        const j = JSON.parse(text);
        
        if (searchMode === 'crypto') {
          setSuggestions((j.coins || []).slice(0, 10).map(c => ({ symbol: c.symbol.toUpperCase(), display: `${c.name} (${c.symbol.toUpperCase()})`, id: c.id, image: c.thumb, source: "coingecko", type: "crypto" })));
        } else {
          setSuggestions((j.quotes || []).filter(it => it.shortname || it.longname).map(it => ({ 
              symbol: it.symbol.toUpperCase(), 
              display: `${it.shortname || it.longname} (${it.symbol.toUpperCase()})`,
              exchange: it.exchange,
              source: "yahoo", 
              type: "stock" 
          })).slice(0, 10));
        }
      } catch (e) {
        console.error("Search failed:", e);
        setSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  /* ===================== Actions ===================== */
  const addTransaction = (tx) => {
    setTransactions(prev => [...prev, tx]);
  };
  
  const handleBuy = (assetStub, qty, priceUSD) => {
    qty = toNum(qty); priceUSD = toNum(priceUSD);
    if (qty <= 0 || priceUSD <= 0) { alert("Quantity and price must be greater than zero."); return false; }
    const costUSD = qty * priceUSD;
    if (costUSD * usdIdr > financialSummaries.tradingBalance) { alert("Insufficient trading balance."); return false; }
    
    const assetId = assetStub.id || `${assetStub.type}:${assetStub.symbol}`;
    const tx = { id: `tx:${Date.now()}`, type: "buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name || assetStub.symbol, assetId, assetStub };
    
    addTransaction(tx);
    if (tradeModal.open) setTradeModal({ open: false, asset: null });
    return true;
  };

  const handleSell = (asset, qty, priceUSD) => {
    qty = toNum(qty); priceUSD = toNum(priceUSD);
    if (!asset || qty <= 0) { alert("Quantity must be > 0"); return false; }
    if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
    const proceedsUSD = qty * priceUSD;
    const costOfSold = qty * asset.avgPrice;
    const realized = proceedsUSD - costOfSold;
    
    const tx = { id: `tx:${Date.now()}`, assetId: asset.id, type: "sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, costOfSold, realized, date: Date.now(), symbol: asset.symbol, name: asset.name };

    addTransaction(tx);
    if (tradeModal.open) setTradeModal({ open: false, asset: null });
    return true;
  };

  const handleDeleteAsset = (asset) => {
    if (!asset || !confirm(`Delete and liquidate ${asset.symbol} at market price? This action cannot be undone.`)) return;
    const marketUSD = asset.shares * asset.lastPriceUSD;
    const realized = marketUSD - asset.investedUSD;
    
    const tx = { id: `tx:${Date.now()}`, assetId: asset.id, type: "delete", qty: asset.shares, pricePerUnit: asset.lastPriceUSD, proceeds: marketUSD, costOfSold: asset.investedUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name, note: "liquidated" };
    
    addTransaction(tx);
    setTradeModal({ open: false, asset: null });
  };
  
  const handleDeleteTransaction = (txId) => {
    if (!confirm("Are you sure you want to permanently delete this transaction? This action cannot be undone and will affect your portfolio calculation.")) return;
    setTransactions(prev => prev.filter(tx => tx.id !== txId));
  };

  const handleSetWatchedAsset = (cryptoId) => {
    setWatchedAssetIds(prev => {
        if (prev.includes(cryptoId)) return prev;
        const newWatched = [...prev];
        newWatched.shift(); 
        newWatched.push(cryptoId);
        return newWatched;
    });
    alert(`${cryptoId.charAt(0).toUpperCase() + cryptoId.slice(1)} is now being watched.`);
  };

  const addAssetWithInitial = (qty, price) => {
    qty = toNum(qty); price = toNum(price);
    let p = selectedSuggestion;
    if (!p) {
      const t = query.split("(")[0].trim();
      if (!t) { alert("Select a suggestion or enter a symbol."); return; }
      p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: searchMode, image: null };
    }
    if (qty <= 0 || price <= 0) { alert("Quantity & price must be > 0"); return; }
    const priceUSD = (displaySymbol === "Rp") ? price / usdIdr : price;
    const newStub = { id: `${p.source || 'manual'}:${p.symbol||p.id}`, type: p.type, symbol: p.symbol, name: p.display, image: p.image, coingeckoId: p.type === 'crypto' ? p.id : undefined };
    if (handleBuy(newStub, qty, priceUSD)) {
      setAddAssetModalOpen(false); setQuery(''); setSelectedSuggestion(null); setSuggestions([]);
    }
  };

  const addNonLiquidAsset = () => {
    const name = nlName.trim(), qty = toNum(nlQty), priceIn = toNum(nlPrice);
    if (!name || qty <= 0 || priceIn <= 0) { alert("Name, quantity, and price must be filled."); return; }
    const priceUSD = nlPriceCcy === 'IDR' ? priceIn / usdIdr : priceIn;
    const newAssetStub = { id: `nonliquid:${name.replace(/\s/g,'_')}`, type: 'nonliquid', symbol: name.slice(0,8).toUpperCase(), name, purchaseDate: nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now(), nonLiquidYoy: toNum(nlYoy), description: nlDesc };
    if (handleBuy(newAssetStub, qty, priceUSD)) {
      setAddAssetModalOpen(false); setNlName(''); setNlQty(''); setNlPrice(''); setNlPurchaseDate(''); setNlDesc('');
    }
  };
  
  const handleAddBalance = (amount) => {
    const amountIDR = toNum(amount);
    const tx = { id: `tx:${Date.now()}`, type: "deposit", amount: amountIDR, date: Date.now() };
    addTransaction(tx);
    setBalanceModalOpen(false);
  };
  const handleWithdraw = (amount) => {
    const amountIDR = toNum(amount);
    if (amountIDR > financialSummaries.tradingBalance) { alert("Withdrawal amount exceeds balance."); return; }
    const tx = { id: `tx:${Date.now()}`, type: "withdraw", amount: amountIDR, date: Date.now() };
    addTransaction(tx);
    setBalanceModalOpen(false);
  };

  const handleExport = () => {
    if (transactions.length === 0) { alert("No transactions to export."); return; }
    const header = Object.keys(transactions[0]).join(',') + '\n';
    const rows = transactions.map(tx => Object.values(tx).map(val => `"${val}"`).join(',')).join('\n');
    const csvContent = header + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `transactions_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setManagePortfolioOpen(false);
  };

  const handleImportClick = () => {
    importInputRef.current.click();
    setManagePortfolioOpen(false);
  };

  const handleFileImport = (event) => {
      alert("Import feature is being re-evaluated for the new transaction-based system.");
  };

  /* ===================== Derived Data ===================== */
  const { tradingBalance, realizedUSD, totalDeposits, totalWithdrawals } = financialSummaries;
  const derivedData = useMemo(() => {
    const rows = assets.map(a => {
      const effectiveLastPriceUSD = a.lastPriceUSD > 0 ? a.lastPriceUSD : a.avgPrice;
      const marketValueUSD = a.shares * effectiveLastPriceUSD;
      const pnlUSD = marketValueUSD - a.investedUSD;
      const pnlPct = a.investedUSD > 0 ? (pnlUSD / a.investedUSD) * 100 : 0;
      return { ...a, lastPriceUSD: effectiveLastPriceUSD, marketValueUSD, pnlUSD, pnlPct };
    });
    
    const investedUSD = rows.reduce((s, r) => s + r.investedUSD, 0);
    const marketValueUSD = rows.reduce((s, r) => s + r.marketValueUSD, 0);
    const unrealizedPnlUSD = marketValueUSD - investedUSD;
    const unrealizedPnlPct = investedUSD > 0 ? (unrealizedPnlUSD / investedUSD) * 100 : 0;
    
    const totalEquity = (marketValueUSD * usdIdr) + tradingBalance;
    
    const sells = transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete');
    const wins = sells.filter(tx => tx.realized > 0);
    const losses = sells.filter(tx => tx.realized <= 0);
    
    const tradeStats = {
      trades: sells.length,
      wins: wins.length,
      losses: losses.length,
      winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0,
      maxProfit: wins.length ? Math.max(0, ...wins.map(tx => tx.realized)) : 0,
      maxLoss: losses.length ? Math.min(0, ...losses.map(tx => tx.realized)) : 0,
      avgProfit: wins.length ? wins.reduce((s, tx) => s + tx.realized, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((s, tx) => s + tx.realized, 0) / losses.length : 0,
      totalRealizedGain: realizedUSD
    };
    
    const netDeposit = totalDeposits - totalWithdrawals;
    const totalPnlUSD = unrealizedPnlUSD + realizedUSD;
    
    const totalValueForBreakdown = tradingBalance + (marketValueUSD * usdIdr);
    const cashPct = totalValueForBreakdown > 0 ? (tradingBalance / totalValueForBreakdown) * 100 : 0;
    const investedPct = totalValueForBreakdown > 0 ? ((marketValueUSD * usdIdr) / totalValueForBreakdown) * 100 : 0;

    return { 
      rows, 
      totals: { investedUSD, marketValueUSD, unrealizedPnlUSD, unrealizedPnlPct }, 
      totalEquity, tradeStats, netDeposit, totalPnlUSD,
      cashPct, investedPct 
    };
  }, [assets, tradingBalance, realizedUSD, totalDeposits, totalWithdrawals, transactions, usdIdr]);

  /* ===================== Equity Timeline ===================== */
  const equitySeries = useMemo(() => {
    const sortedTx = [...transactions].sort((a, b) => a.date - b.date);
    if (sortedTx.length === 0) return [{ t: Date.now() - 86400000, v: 0 }, { t: Date.now(), v: 0 }];

    const points = [];
    let currentCash = 0;
    let currentHoldings = {};

    for (const tx of sortedTx) {
        if (tx.type === 'deposit') {
            currentCash += tx.amount;
        } else if (tx.type === 'withdraw') {
            currentCash -= tx.amount;
        } else if (tx.type === 'buy') {
            const costIDR = tx.cost * usdIdr;
            currentCash -= costIDR;
            const asset = currentHoldings[tx.assetId] || { shares: 0, avgPrice: 0, invested: 0 };
            const newInvested = asset.invested + tx.cost;
            const newShares = asset.shares + tx.qty;
            asset.invested = newInvested;
            asset.shares = newShares;
            asset.avgPrice = newShares > 0 ? newInvested / newShares : 0;
            currentHoldings[tx.assetId] = asset;
        } else if (tx.type === 'sell' || tx.type === 'delete') {
            const proceedsIDR = tx.proceeds * usdIdr;
            currentCash += proceedsIDR;
            if (currentHoldings[tx.assetId]) {
                const asset = currentHoldings[tx.assetId];
                const costOfSold = asset.avgPrice * tx.qty;
                asset.invested -= costOfSold;
                asset.shares -= tx.qty;
            }
        }
        
        let holdingsValueUSD = 0;
        for (const assetId in currentHoldings) {
            const holding = currentHoldings[assetId];
            const liveAsset = assets.find(a => a.id === assetId);
            const price = liveAsset ? liveAsset.lastPriceUSD : holding.avgPrice;
            holdingsValueUSD += holding.shares * price;
        }

        const totalEquity = currentCash + (holdingsValueUSD * usdIdr);
        points.push({ t: tx.date, v: totalEquity });
    }
    
    if (points.length === 0) return [{ t: Date.now() - 86400000, v: 0 }, { t: Date.now(), v: derivedData.totalEquity }];

    return [{ t: points[0].t - 86400000, v: 0 }, ...points, {t: Date.now(), v: derivedData.totalEquity}];
  }, [transactions, assets, usdIdr, derivedData.totalEquity]);


  /* ================ Render ================ */
  if (view === 'performance') {
    return <PerformancePage {...derivedData} setView={setView} usdIdr={usdIdr} displaySymbol={displaySymbol} portfolioData={derivedData.rows} transactions={transactions} equitySeries={equitySeries} onDeleteTransaction={handleDeleteTransaction}/>;
  }

  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
          <div className="flex items-center gap-3">
            <UserAvatar />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setAddAssetModalOpen(true)} className="text-gray-400 hover:text-white"><SearchIcon /></button>
            <div className="flex items-center gap-2"><span className="text-xs font-semibold text-gray-400">IDR</span><div role="switch" aria-checked={displaySymbol === "$"} onClick={() => setDisplaySymbol(prev => prev === "Rp" ? "$" : "Rp")} className={`relative w-12 h-6 rounded-full p-1 cursor-pointer transition ${displaySymbol === "$" ? 'bg-emerald-600' : 'bg-zinc-700'}`} title="Toggle display currency"><div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${displaySymbol === "$" ? 'translate-x-6' : 'translate-x-0'}`}></div></div><span className="text-xs font-semibold text-gray-400">USD</span></div>
            <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
          </div>
        </header>

        <main>
          <section className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div onClick={() => setIsPortfolioGrowthModalOpen(true)} className="bg-zinc-900 border border-zinc-800/50 p-3 sm:p-4 rounded-xl shadow-lg flex flex-col justify-between cursor-pointer hover:border-zinc-700 transition-colors">
                    <div>
                        <div className="mt-2 sm:mt-3">
                            <p className="text-gray-500 text-[10px] sm:text-xs">Total Equity</p>
                            <p className="text-xl sm:text-3xl font-bold text-white">{formatCurrency(derivedData.totalEquity, false, displaySymbol, usdIdr)}</p>
                        </div>
                    </div>
                    <div className="h-20 -mb-4 -mx-4">
                        <AreaChart data={equitySeries} displaySymbol={displaySymbol} range={"All"} setRange={()=>{}} showTimeframes={false} simplified={true}/>
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 sm:p-4 rounded-xl shadow-lg flex flex-col justify-center">
                    <div className="grid grid-cols-2 text-center gap-1">
                        <p className="text-gray-400 text-[11px] sm:text-xs">Cash</p>
                        <p className="text-gray-400 text-[11px] sm:text-xs">Invested</p>
                        <p className={`font-semibold ${displaySymbol === 'Rp' ? 'text-xs sm:text-base' : 'text-sm sm:text-lg'}`}>{formatCurrency(tradingBalance, false, displaySymbol, usdIdr)}</p>
                        <p className={`font-semibold ${displaySymbol === 'Rp' ? 'text-xs sm:text-base' : 'text-sm sm:text-lg'}`}>{formatCurrency(derivedData.totals.marketValueUSD, true, displaySymbol, usdIdr)}</p>
                    </div>
                    <div className="flex w-full h-1.5 bg-zinc-700/50 rounded-full overflow-hidden my-2"><div className="bg-sky-500" style={{ width: `${derivedData.cashPct}%` }}></div><div className="bg-teal-500" style={{ width: `${derivedData.investedPct}%` }}></div></div>
                    <div className="text-center text-[11px] sm:text-xs text-gray-400 mt-2">Unrealized <span className={`font-semibold ${derivedData.totals.unrealizedPnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(derivedData.totals.unrealizedPnlUSD, true, displaySymbol, usdIdr)}</span></div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 sm:p-4 rounded-xl shadow-lg">
                    <div className="mt-2 sm:mt-3 text-[11px] sm:text-xs space-y-2">
                        <div className="flex justify-between items-center"><span className="text-gray-400">Net Deposit</span><span className="font-semibold text-white">{derivedData.netDeposit >= 0 ? '+' : ''}{formatCurrency(derivedData.netDeposit, false, displaySymbol, usdIdr)}</span></div>
                        <div className="flex justify-between items-center"><span className="text-gray-400">Total G/L</span><span className={`font-semibold ${derivedData.totalPnlUSD >= 0 ? 'text-[#20c997]' : 'text-red-400'}`}>{derivedData.totalPnlUSD >= 0 ? '+' : ''}{formatCurrency(derivedData.totalPnlUSD, true, displaySymbol, usdIdr)}</span></div>
                        <div className="flex justify-between items-center border-t border-zinc-800 pt-2 mt-2"><span className="text-gray-400">Realized G/L</span><span className={`font-semibold ${realizedUSD >= 0 ? 'text-[#20c997]' : 'text-red-400'}`}>{realizedUSD >= 0 ? '+' : ''}{formatCurrency(realizedUSD, true, displaySymbol, usdIdr)}</span></div>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    {watchedAssetIds.map(id => {
                        const data = watchedAssetData[id];
                        if (!data) return <div key={id} className="flex-1 bg-zinc-900 border border-zinc-800/50 p-2 rounded-lg animate-pulse"></div>;
                        const change = data.change_24h || 0;
                        return (
                            <div key={id} className="flex-1 bg-zinc-900 border border-zinc-800/50 p-2 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <img src={data.image} alt={data.name} className="w-6 h-6"/>
                                    <div>
                                        <p className="text-xs font-semibold text-white">{data.symbol}</p>
                                        <p className="text-[10px] text-gray-400">{data.name}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold text-white tabular-nums">{formatCurrency(data.price_idr, false, 'Rp', 1)}</p>
                                    <p className={`text-xs font-semibold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{change.toFixed(2)}%</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className="mt-4 text-right"><div className="text-sm text-white cursor-pointer inline-flex items-center gap-2" onClick={() => setView('performance')}>View Performance <ArrowRightIconSimple /></div></div>
          </section>
          <div className="h-2 bg-[#0a0a0a]"></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 text-xs font-semibold"><tr><th className="p-3 pt-4"><div>Code</div><div className="font-normal text-gray-600">Qty</div></th><th className="p-3 pt-4 text-right"><div>Invested</div><div className="font-normal text-gray-600">Avg Price</div></th><th className="p-3 pt-4 text-right"><div>Market</div><div className="font-normal text-gray-600">Current Price</div></th><th className="p-3 pt-4 text-right"><div>Gain P&L</div><div className="font-normal text-gray-600">%</div></th></tr></thead>
              <tbody>
                {derivedData.rows.map(r => (<tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer" onClick={() => setTradeModal({ open: true, asset: r })}><td className="p-3"><div className="font-semibold text-sm text-white">{r.symbol}</div><div className="text-xs text-gray-400 mt-0.5">{formatQty(r.shares)}</div></td><td className="p-3 text-right tabular-nums"><div className="font-semibold text-xs text-white">{formatCurrency(r.investedUSD, true, displaySymbol, usdIdr)}</div><div className="text-xs text-gray-400 mt-0.5">{formatCurrency(r.avgPrice, true, displaySymbol, usdIdr)}</div></td><td className="p-3 text-right tabular-nums"><div className="font-semibold text-xs text-white">{formatCurrency(r.marketValueUSD, true, displaySymbol, usdIdr)}</div><div className="text-xs text-gray-400 mt-0.5">{formatCurrency(r.lastPriceUSD, true, displaySymbol, usdIdr)}</div></td><td className="p-3 text-right tabular-nums"><div className={`font-semibold text-xs ${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnlUSD >= 0 ? '+' : ''}{formatCurrency(r.pnlUSD, true, displaySymbol, usdIdr)}</div><div className={`${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'} text-xs mt-0.5`}>{r.pnlPct.toFixed(2)}%</div></td></tr>))}
              </tbody>
            </table>
            {derivedData.rows.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}
            <div className="p-4 text-center"><button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button></div>
          </div>
        </main>
        <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)}><AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, usdIdr, displaySymbol, handleSetWatchedAsset, watchedAssetIds}} /></Modal>
        <Modal title="Portfolio Growth" isOpen={isPortfolioGrowthModalOpen} onClose={() => setIsPortfolioGrowthModalOpen(false)}><div className="h-72"><AreaChart data={equitySeries} displaySymbol={displaySymbol} range={"All"} setRange={()=>{}}/></div></Modal>
        <Modal title={`${balanceModalMode} Balance`} isOpen={isBalanceModalOpen} onClose={() => setBalanceModalOpen(false)}><BalanceManager onConfirm={balanceModalMode === 'Add' ? handleAddBalance : handleWithdraw} displaySymbol={displaySymbol} /></Modal>
        <TradeModal isOpen={tradeModal.open} onClose={() => setTradeModal({ open: false, asset: null })} asset={tradeModal.asset} onBuy={handleBuy} onSell={handleSell} onDelete={handleDeleteAsset} usdIdr={usdIdr} displaySymbol={displaySymbol} />
        <BottomSheet isOpen={isManagePortfolioOpen} onClose={() => setManagePortfolioOpen(false)}><ManagePortfolioSheet onAddBalance={() => { setManagePortfolioOpen(false); setBalanceModalMode('Add'); setBalanceModalOpen(true); }} onWithdraw={() => { setManagePortfolioOpen(false); setBalanceModalMode('Withdraw'); setBalanceModalOpen(true); }} onClearAll={() => { if(confirm("Erase all portfolio data? This cannot be undone.")) { setTransactions([]); } setManagePortfolioOpen(false); }} onExport={handleExport} onImport={handleImportClick} /></BottomSheet>
        <input type="file" ref={importInputRef} onChange={handleFileImport} className="hidden" accept=".csv" />
      </div>
    </div>
  );
}

/* ===================== Performance & Subcomponents ===================== */
const PerformancePage = ({ setView, usdIdr, displaySymbol, portfolioData, transactions, equitySeries, tradeStats, totalEquity, onDeleteTransaction }) => {
  const [activeTab, setActiveTab] = useState('portfolio');
  const [chartRange, setChartRange] = useState("All"); 
  const [returnPeriod, setReturnPeriod] = useState('Monthly');
  
  const equityReturnData = useMemo(() => {
    const data = equitySeries;
    if (data.length < 2) return [];
    let periodData = {};
    for (let i = 1; i < data.length; i++) {
        const currentDate = new Date(data[i].t);
        let key;
        if(returnPeriod === 'Daily'){ key = currentDate.toISOString().split('T')[0]; } 
        else if(returnPeriod === 'Monthly'){ key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`; } 
        else { key = `${currentDate.getFullYear()}`; }
        if (!periodData[key]) {
            periodData[key] = { startEquity: data[i-1].v, endEquity: data[i].v, endDate: currentDate };
        } else {
            periodData[key].endEquity = data[i].v;
            periodData[key].endDate = currentDate;
        }
    }
    return Object.keys(periodData).map(key => {
        const item = periodData[key];
        const pnl = item.endEquity - item.startEquity;
        const pnlPct = item.startEquity > 0 ? (pnl / item.startEquity) * 100 : 0;
        const date = new Date(item.endDate);
        let dateLabel = key;
        if(returnPeriod === 'Monthly') dateLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        else if(returnPeriod === 'Daily') dateLabel = date.toLocaleString('default', { month: 'short', day: 'numeric' });
        return { date: dateLabel, equity: item.endEquity, pnl, pnlPct, rawDate: item.endDate }
    }).sort((a,b) => b.rawDate - a.rawDate);
  }, [equitySeries, returnPeriod]);

  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex items-center gap-4 sticky top-0 bg-black z-10">
          <button onClick={() => setView('main')} className="text-white"><BackArrowIcon /></button>
          <h1 className="text-lg font-semibold text-white">Performance</h1>
        </header>
        <div className="border-b border-zinc-800 px-4"><nav className="flex space-x-6"><button onClick={() => setActiveTab('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button><button onClick={() => setActiveTab('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button><button onClick={() => setActiveTab('history')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'history' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>HISTORY</button></nav></div>
        {activeTab === 'portfolio' ? (
          <div className="p-4">
            <div><p className="text-sm text-gray-400">Total Equity</p><p className="text-3xl font-bold text-white mb-1">{formatCurrency(totalEquity, false, displaySymbol, usdIdr)}</p></div>
            <div className="mt-6"><AreaChart data={equitySeries} displaySymbol={displaySymbol} range={chartRange} setRange={setChartRange} /></div>
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4"><h3 className="text-base font-semibold text-white">Total Equity Return</h3><div className="flex items-center gap-2 text-sm">{['Daily', 'Monthly', 'Yearly'].map(p => (<button key={p} onClick={() => setReturnPeriod(p)} className={`px-3 py-1 rounded-full text-xs ${returnPeriod === p ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}>{p}</button>))}</div></div>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs"><tr><th className="p-2 font-normal">Date</th><th className="p-2 font-normal text-right">Equity</th><th className="p-2 font-normal text-right">P&L</th></tr></thead>
                <tbody>{equityReturnData.map((item, index) => (<tr key={index} className="border-t border-zinc-800"><td className="p-2 text-white">{item.date}</td><td className="p-2 text-white text-right">{formatCurrency(item.equity, false, displaySymbol, usdIdr)}</td><td className={`p-2 text-right ${item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.pnl >= 0 ? '+' : ''}{formatCurrency(item.pnl, false, displaySymbol, usdIdr)} ({item.pnlPct.toFixed(2)}%)</td></tr>))}</tbody>
              </table>
            </div>
            <div className="mt-8"><PortfolioAllocation data={portfolioData} displaySymbol={displaySymbol} usdIdr={usdIdr} /></div>
          </div>
        ) : activeTab === 'trade' ? (
          <TradeStatsView stats={tradeStats} transactions={transactions} displaySymbol={displaySymbol} usdIdr={usdIdr} />
        ) : (
          <HistoryView transactions={transactions} usdIdr={usdIdr} displaySymbol={displaySymbol} onDeleteTransaction={onDeleteTransaction} />
        )}
      </div>
    </div>
  );
};


const TradeStatsView = ({ stats, transactions, displaySymbol, usdIdr }) => {
    const [chartRange, setChartRange] = useState("All");
    
    const { maxProfitPct, maxLossPct } = useMemo(() => {
        const maxProfitTx = transactions.find(tx => tx.realized === stats.maxProfit);
        const profitPct = maxProfitTx && maxProfitTx.costOfSold > 0 ? (maxProfitTx.realized / maxProfitTx.costOfSold) * 100 : 0;
        const maxLossTx = transactions.find(tx => tx.realized === stats.maxLoss);
        const lossPct = maxLossTx && maxLossTx.costOfSold > 0 ? (maxLossTx.realized / maxLossTx.costOfSold) * 100 : 0;
        return { maxProfitPct: profitPct, maxLossPct: lossPct };
    }, [transactions, stats.maxProfit, stats.maxLoss]);
    
    const realizedGainSeries = useMemo(() => {
        const sorted = [...transactions.filter(t => t.type === 'sell' || t.type === 'delete')].sort((a, b) => a.date - b.date);
        let cumulativeGain = 0;
        const points = sorted.map(tx => {
            cumulativeGain += tx.realized || 0;
            const displayValue = displaySymbol === '$' ? cumulativeGain : cumulativeGain * usdIdr;
            return { t: tx.date, v: displayValue };
        });
        if (points.length > 0) points.unshift({ t: points[0].t - 86400000, v: 0 });
        return points.length ? points : [{ t: Date.now() - 1000, v: 0 }, {t: Date.now(), v:0}];
    }, [transactions, displaySymbol, usdIdr]);
    
    const sells = useMemo(() => transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete'), [transactions]);
    const realizedGainOnly = useMemo(() => sells.filter(tx => tx.realized > 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]);
    const realizedLossOnly = useMemo(() => sells.filter(tx => tx.realized < 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]);

    const topGainers = useMemo(() => {
        const gainers = {};
        sells.forEach(tx => {
            if (!gainers[tx.symbol]) gainers[tx.symbol] = { trades: 0, pnl: 0, cost: 0 };
            gainers[tx.symbol].trades++;
            gainers[tx.symbol].pnl += tx.realized;
            gainers[tx.symbol].cost += tx.costOfSold || 0;
        });
        return Object.entries(gainers)
            .map(([symbol, data]) => ({ symbol, ...data, pnlPct: data.cost > 0 ? (data.pnl / data.cost) * 100 : 0 }))
            .sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    }, [sells]);
    
    if (!stats) return <div className="p-4 text-center text-gray-500">No trade data available.</div>;

    return (
        <div className="p-4 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                    <div><p className="text-sm text-gray-400">Win Rate</p><p className="text-3xl font-bold text-white mt-1">{stats.winRate.toFixed(2)}%</p></div>
                    <div className="relative w-24 h-24"><svg className="w-full h-full transform -rotate-90"><circle cx="50%" cy="50%" r="45%" stroke="#3f3f46" strokeWidth="8" fill="transparent" /><circle cx="50%" cy="50%" r="45%" stroke="#10B981" strokeWidth="8" fill="transparent" strokeDasharray={`${Math.PI * 2 * 45 * (stats.winRate / 100)}, ${Math.PI * 2 * 45}`} strokeLinecap="round"/></svg><div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-center"><div className="font-semibold">{stats.trades}</div><div className="text-gray-400">Trades</div><div className="mt-1 flex gap-2"><div><span className="text-emerald-400">{stats.wins}</span> W</div><div><span className="text-red-400">{stats.losses}</span> L</div></div></div></div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><ArrowUpIcon className="text-emerald-400"/>Max Profit</p><p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.maxProfit, true, displaySymbol, usdIdr)}</p><p className="text-sm text-emerald-400">+{maxProfitPct.toFixed(2)}%</p></div>
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><ArrowDownIcon className="text-red-400"/>Max Loss</p><p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.maxLoss, true, displaySymbol, usdIdr)}</p><p className="text-sm text-red-400">{maxLossPct.toFixed(2)}%</p></div>
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><AvgProfitIcon className="text-gray-400 w-4 h-4"/>Avg. Profit</p><p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.avgProfit, true, displaySymbol, usdIdr)}</p></div>
                <div className="bg-zinc-900 border border-zinc-800/50 p-3 rounded-lg"><p className="text-sm text-gray-400 flex items-center gap-1"><AvgLossIcon className="text-gray-400 w-4 h-4"/>Avg. Loss</p><p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.avgLoss, true, displaySymbol, usdIdr)}</p></div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800/50 p-4 rounded-lg">
                <h3 className="font-semibold text-white flex items-center gap-1">Total Realized Gain <InfoIcon className="text-gray-400 w-3 h-3" /></h3>
                <p className={`text-2xl font-bold mt-1 ${stats.totalRealizedGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.totalRealizedGain >= 0 ? '+' : ''}{formatCurrency(stats.totalRealizedGain, true, displaySymbol, usdIdr)}</p>
                <div className="h-48 mt-2"><AreaChart data={realizedGainSeries} displaySymbol={displaySymbol} range={chartRange} setRange={setChartRange} showTimeframes={false}/></div>
                <div className="mt-2 text-xs text-gray-400 border-t border-zinc-800 pt-2 space-y-1">
                    <div className="flex justify-between"><span>Realized Gain</span> <span className="text-emerald-400 font-semibold">{formatCurrency(realizedGainOnly, true, displaySymbol, usdIdr)}</span></div>
                    <div className="flex justify-between"><span>Realized Loss</span> <span className="text-red-400 font-semibold">{formatCurrency(realizedLossOnly, true, displaySymbol, usdIdr)}</span></div>
                </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-800/50 p-4 rounded-lg">
                <h3 className="font-semibold text-white mb-2">Top Gainer ({displaySymbol})</h3>
                <table className="w-full text-sm">
                    <thead className="text-gray-400 text-xs font-light"><tr><th className="text-left font-normal py-1">Code</th><th className="text-center font-normal py-1">Trades</th><th className="text-right font-normal py-1">P&L</th></tr></thead>
                    <tbody>{topGainers.map(g => (<tr key={g.symbol} className="border-t border-zinc-800"><td className="py-2 flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-white text-xs">{g.symbol.charAt(0)}</div>{g.symbol}</td><td className="text-center py-2">{g.trades}</td><td className={`text-right py-2 font-semibold ${g.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{g.pnl >= 0 ? '+' : ''}{formatCurrency(g.pnl, true, displaySymbol, usdIdr)} ({g.pnlPct.toFixed(2)}%)</td></tr>))}</tbody>
                </table>
            </div>
        </div>
    );
};

const HistoryView = ({ transactions, usdIdr, displaySymbol, onDeleteTransaction }) => (
    <div className="p-4">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs">
                    <tr>
                        <th className="p-3">Time</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Detail</th>
                        <th className="p-3 text-right">Nominal</th>
                        <th className="p-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {[...transactions].sort((a,b) => b.date - a.date).map(tx => (
                        <tr key={tx.id} className="border-t border-zinc-800">
                            <td className="p-3 text-gray-400 text-xs">{new Date(tx.date).toLocaleString()}</td>
                            <td className="p-3 capitalize font-semibold">{tx.type}</td>
                            <td className="p-3 text-xs">
                                {tx.type === 'buy' || tx.type === 'sell' || tx.type === 'delete' ? (
                                    <>
                                        <div><strong>{tx.symbol}</strong></div>
                                        <div>{formatQty(tx.qty)} @ {formatCurrency(tx.pricePerUnit, true, displaySymbol, usdIdr)}</div>
                                    </>
                                ) : (
                                    <span>-</span>
                                )}
                            </td>
                            <td className="p-3 text-right">
                                {formatCurrency(
                                    tx.type === 'deposit' || tx.type === 'withdraw' ? tx.amount : (tx.cost || tx.proceeds || 0) * usdIdr,
                                    false, 'Rp', 1
                                )}
                            </td>
                            <td className="p-3 text-right">
                                <button onClick={() => onDeleteTransaction(tx.id)} className="text-red-500 hover:text-red-400">
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {transactions.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-500">No history</td></tr>}
                </tbody>
            </table>
        </div>
    </div>
);


/* ===================== Forms & Modals ===================== */
const BalanceManager = ({ onConfirm, displaySymbol }) => {
  const [amount, setAmount] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(amount); }} className="space-y-4">
      <div><label className="block text-sm font-medium mb-1 text-gray-400">Amount (dalam Rupiah)</label><input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)} autoFocus className="w-full bg-zinc-800 px-3 py-2 rounded border border-zinc-700 text-white" placeholder="e.g. 1000000" /></div>
      <button type="submit" className="w-full py-2.5 rounded font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Confirm</button>
    </form>
  );
};

const ManagePortfolioSheet = ({ onAddBalance, onWithdraw, onClearAll, onExport, onImport }) => ( 
  <div className="p-4 text-white text-sm">
    <h3 className="text-base font-semibold mb-4 px-2">Manage Portfolio</h3>
    <div className="space-y-1">
        <button onClick={onAddBalance} className="w-full text-left p-2 rounded hover:bg-zinc-700/50 text-gray-300">Add Balance</button>
        <button onClick={onWithdraw} className="w-full text-left p-2 rounded hover:bg-zinc-700/50 text-gray-300">Withdraw</button>
        <div className="border-t border-zinc-700 my-2"></div>
        <button onClick={onExport} className="w-full text-left p-2 rounded hover:bg-zinc-700/50 text-gray-300">Export as CSV</button>
        <button onClick={onImport} className="w-full text-left p-2 rounded hover:bg-zinc-700/50 text-gray-300">Import from CSV</button>
        <div className="border-t border-zinc-700 my-2"></div>
        <button onClick={onClearAll} className="w-full text-left p-2 rounded hover:bg-red-700/20 text-red-400">Erase all data</button>
    </div>
  </div>
);

const AddAssetForm = ({ searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, displaySymbol, handleSetWatchedAsset, watchedAssetIds }) => {
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const handleInputChange = (field, value) => {
    if (field === 'shares') { setShares(value); const num = toNum(price) * toNum(value); setTotal(num > 0 ? `${num}` : ''); } 
    else if (field === 'price') { setPrice(value); const num = toNum(value) * toNum(shares); setTotal(num > 0 ? `${num}` : ''); } 
    else if (field === 'total') { setTotal(value); const nTotal = toNum(value), nShares = toNum(shares); if (nShares > 0) setPrice(String(nTotal / nShares)); }
  };
  return (
    <div className="space-y-4">
      <div className="flex border-b border-zinc-800">{[{ key: 'stock', label: 'Stock' }, { key:'crypto', label:'Crypto' }, { key:'nonliquid', label:'Non-Liquid' }].map(item => (<button key={item.key} onClick={() => setSearchMode(item.key)} className={`px-3 py-2 text-sm font-medium ${searchMode === item.key ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400'}`}>{item.label}</button>))}</div>
      {searchMode !== 'nonliquid' ? (
        <div className="space-y-4">
          <div className="relative"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by code or name..." className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none border border-zinc-700 text-white" />{suggestions.length > 0 && <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded max-h-56 overflow-auto">{suggestions.map((s, i) => (<div key={i} className="w-full px-3 py-2 text-left hover:bg-zinc-700 flex items-center gap-3"><button className="flex-1 flex items-center gap-3 text-left" onClick={() => { setSelectedSuggestion(s); setQuery(s.display); setSuggestions([]); }}><img src={s.image} alt={s.symbol} className="w-6 h-6 rounded-full bg-zinc-700" onError={(e) => e.target.style.display='none'} /><div className="flex-1 overflow-hidden"><div className="font-medium text-gray-100 truncate">{s.display}</div><div className="text-xs text-gray-400">{s.exchange}</div></div></button>{s.type === 'crypto' && <button onClick={() => handleSetWatchedAsset(s.id)} className="text-yellow-500 hover:text-yellow-400"><StarIcon isFilled={watchedAssetIds.includes(s.id)} /></button>}</div>))}</div>}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label className="text-xs text-gray-400">Qty</label><input value={shares} onChange={e => handleInputChange('shares', e.target.value)} className="w-full mt-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" type="text" /></div><div><label className="text-xs text-gray-400">Price ({displaySymbol})</label><input value={price} onChange={e => handleInputChange('price', e.target.value)} className="w-full mt-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" type="text" /></div></div>
          <div><label className="text-xs text-gray-400">Total Value ({displaySymbol})</label><input value={total} onChange={e => handleInputChange('total', e.target.value)} className="w-full mt-1 rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" type="text" /></div>
          <div className="flex justify-end"><button onClick={() => addAssetWithInitial(shares, price)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Position</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><input value={nlName} onChange={e => setNlName(e.target.value)} placeholder="Asset Name (e.g. Property)" className="rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" /><input value={nlQty} onChange={e => setNlQty(e.target.value)} placeholder="Quantity" type="number" className="rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" /><input value={nlPrice} onChange={e => setNlPrice(e.target.value)} placeholder="Purchase Price" type="number" className="rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" /><select value={nlPriceCcy} onChange={e => setNlPriceCcy(e.target.value)} className="rounded bg-zinc-800 px-2 py-2 text-sm border border-zinc-700 text-white"><option value="IDR">IDR</option><option value="USD">USD</option></select><input type="date" value={nlPurchaseDate} onChange={e => setNlPurchaseDate(e.target.value)} className="rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" /><input value={nlYoy} onChange={e => setNlYoy(e.target.value)} placeholder="Est. Yearly Gain (%)" type="number" className="rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" /></div>
          <input value={nlDesc} onChange={e => setNlDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded bg-zinc-800 px-3 py-2 text-sm border border-zinc-700 text-white" />
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
      const priceVal = displaySymbol === "Rp" ? asset.lastPriceUSD * usdIdr : asset.lastPriceUSD;
      setPrice(String(isFinite(priceVal) ? (displaySymbol === "$" ? priceVal.toFixed(3) : Math.round(priceVal)) : ''));
      setShares(''); setTotal('');
    }
  }, [asset, usdIdr, displaySymbol, mode]);
  if (!isOpen || !asset) return null;
  const handleInputChange = (field, value) => {
    if (field === 'shares') { setShares(value); const nPrice = toNum(price), nShares = toNum(value); setTotal(nPrice > 0 && nShares > 0 ? (nPrice * nShares).toString() : ''); } 
    else if (field === 'price') { setPrice(value); const nPrice = toNum(value), nShares = toNum(shares); setTotal(nPrice > 0 && nShares > 0 ? (nPrice * nShares).toString() : ''); } 
    else if (field === 'total') { setTotal(value); const nTotal = toNum(value), nShares = toNum(shares); if (nShares > 0 && nTotal > 0) setPrice(String((nTotal / nShares).toFixed(3))); }
  };
  const priceUSD = (displaySymbol === 'Rp') ? toNum(price) / usdIdr : toNum(price);
  const doSubmit = () => { if (mode === 'buy') onBuy(asset, shares, priceUSD); else if (mode === 'sell') onSell(asset, shares, priceUSD); };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={asset.symbol}>
      <div className="space-y-4">
        <div className="flex bg-zinc-800 rounded-full p-1"><button onClick={() => setMode('buy')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'buy' ? 'bg-emerald-600 text-white' : 'text-gray-300'}`}>Buy</button><button onClick={() => setMode('sell')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'sell' ? 'bg-red-600 text-white' : 'text-gray-300'}`}>Sell</button></div>
        <div><label className="text-xs text-gray-400">Qty</label><input type="text" value={shares} onChange={e=>handleInputChange('shares', e.target.value)} className="w-full mt-1 bg-zinc-800 px-3 py-2 rounded border border-zinc-700 text-white" /></div>
        <div><label className="text-xs text-gray-400">Price ({displaySymbol})</label><input type="text" value={price} onChange={e=>handleInputChange('price', e.target.value)} className="w-full mt-1 bg-zinc-800 px-3 py-2 rounded border border-zinc-700 text-white" /></div>
        <div><label className="text-xs text-gray-400">Total ({displaySymbol})</label><input type="text" value={total} onChange={e=>handleInputChange('total', e.target.value)} className="w-full mt-1 bg-zinc-800 px-3 py-2 rounded border border-zinc-700 text-white" /></div>
        <div className="flex gap-2"><button onClick={doSubmit} className={`flex-1 py-2.5 rounded font-semibold text-white ${mode === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>Confirm {mode.charAt(0).toUpperCase() + mode.slice(1)}</button><button onClick={() => onDelete(asset)} title="Delete (liquidate)" className="py-2.5 px-3 rounded bg-zinc-700 hover:bg-zinc-600 text-white flex items-center gap-2"><TrashIcon className="text-white" /></button></div>
      </div>
    </Modal>
  );
};

/* ===================== Charts ===================== */
const AreaChart = ({ data: chartData, displaySymbol, range, setRange, showTimeframes = true, simplified = false }) => {
  const [hoverData, setHoverData] = useState(null);
  const svgRef = useRef(null);
  const now = new Date();
  let startTime;
  switch (range) {
    case '1W': startTime = new Date(now.getTime() - 7 * 24 * 3600 * 1000); break;
    case '1M': startTime = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
    case '3M': startTime = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
    case '1Y': startTime = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    case 'All': startTime = chartData.length > 1 ? new Date(chartData[0].t) : new Date(0); break;
    case 'YTD': default: startTime = new Date(now.getFullYear(), 0, 1); break;
  }
  
  const filteredData = chartData.filter(d => d.t >= startTime.getTime());
  const data = useMemo(() => {
      if(filteredData.length === 0) return [{t: startTime.getTime(), v: 0}, {t: now.getTime(), v: 0}];
      if(filteredData[0].t > startTime.getTime() && filteredData.length > 0){
          return [{t: startTime.getTime(), v: filteredData[0].v}, ...filteredData];
      }
      return filteredData;
  }, [filteredData, startTime, now]);

  const height = simplified ? 80 : 220;
  const width = 700;
  const padding = { top: simplified ? 5 : 20, bottom: simplified ? 5 : 40, left: 0, right: simplified ? 0 : 80 };
  
  const yValues = data.map(d => d.v);
  const minVal = Math.min(...yValues);
  const maxVal = Math.max(...yValues);
  const valRange = maxVal - minVal || 1;
  const timeStart = data[0].t;
  const timeEnd = data[data.length - 1].t;
  const xScale = (t) => padding.left + ((t - timeStart) / (timeEnd - timeStart || 1)) * (width - padding.left - padding.right);
  const yScale = (v) => padding.top + (1 - (v - minVal) / valRange) * (height - padding.top - padding.bottom);

  // Function to create a smooth path
  const createSmoothPath = (points, x, y) => {
    if (points.length < 2) return "";
    let path = `M${x(points[0].t)},${y(points[0].v)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const x_mid = (x(points[i].t) + x(points[i + 1].t)) / 2;
        const y_mid = (y(points[i].v) + y(points[i + 1].v)) / 2;
        const cp_x1 = (x_mid + x(points[i].t)) / 2;
        const cp_y1 = (y_mid + y(points[i].v)) / 2;
        const cp_x2 = (x_mid + x(points[i + 1].t)) / 2;
        const cp_y2 = (y_mid + y(points[i + 1].v)) / 2;
        path += ` Q${cp_x1},${y(points[i].v)},${x_mid},${y_mid}`;
        path += ` Q${cp_x2},${y(points[i+1].v)},${x(points[i + 1].t)},${y(points[i + 1].v)}`;
    }
    return path;
  };

  const path = createSmoothPath(data, xScale, yScale);
  const areaPath = `${path} L${xScale(timeEnd)},${height - padding.bottom} L${xScale(timeStart)},${height - padding.bottom} Z`;
  const yAxisLabels = Array.from({length: 5}, (_, i) => minVal + (valRange / 4) * i);
  
  const formatValueForChart = (v) => {
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}M`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}jt`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(0)}rb`;
    return Math.round(v);
  }
  const fmtYLabel = (v) => `${displaySymbol === 'Rp' ? 'Rp' : '$'}${formatValueForChart(v)}`;
  const xAxisLabels = () => Array.from({length: 5}, (_, i) => {
      const t = timeStart + (i / 4) * (timeEnd - timeStart);
      return {t, label: new Date(t).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})};
  });
  
  const handleMouseMove = (event) => {
    if (simplified || !svgRef.current || data.length < 2) return;
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = timeStart + ((x - padding.left) / (width - padding.left - padding.right)) * (timeEnd - timeStart);
    let closestPoint = data.reduce((prev, curr) => Math.abs(curr.t - time) < Math.abs(prev.t - time) ? curr : prev);
    if (closestPoint) setHoverData({ point: closestPoint, x: xScale(closestPoint.t), y: yScale(closestPoint.v) });
  };

  return (
    <div>
      <div className="relative">
        <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="rounded" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverData(null)}>
          <defs><linearGradient id="areaGradient2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.05} /></linearGradient></defs>
          <path d={areaPath} fill="url(#areaGradient2)" />
          <path d={path} fill="none" stroke="#10B981" strokeWidth="2" />
          {!simplified && (
            <>
              {yAxisLabels.map((v, idx) => (<g key={idx}><line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" /><text x={width - padding.right + 6} y={yScale(v) + 4} fontSize="11" fill="#6B7280">{fmtYLabel(v)}</text></g>))}
              {xAxisLabels().map((item, idx) => (<text key={idx} x={xScale(item.t)} y={height - padding.bottom + 15} textAnchor="middle" fontSize="11" fill="#6B7280">{item.label}</text>))}
              {hoverData && (<g><line y1={padding.top} y2={height - padding.bottom} x1={hoverData.x} x2={hoverData.x} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="3,3" /><circle cx={hoverData.x} cy={hoverData.y} r="4" fill="#10B981" stroke="white" strokeWidth="2" /></g>)}
              <rect x={padding.left} y={padding.top} width={width - padding.left - padding.right} height={height-padding.top-padding.bottom} fill="transparent" />
            </>
          )}
        </svg>
        {hoverData && (<div className="absolute p-2 rounded-lg bg-zinc-800 text-white text-xs pointer-events-none" style={{ left: `${hoverData.x / width * 100}%`, top: `${padding.top-10}px`, transform: `translateX(-50%)` }}><div>{new Date(hoverData.point.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div><div className="font-bold">{formatCurrency(hoverData.point.v, false, displaySymbol, 1)}</div></div>)}
      </div>
      {showTimeframes && <div className="flex justify-center gap-2 mt-2">{['1W', '1M', '3M', 'YTD', '1Y', 'All'].map(r => (<button key={r} onClick={() => setRange(r)} className={`px-3 py-1 text-xs rounded-full ${range === r ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}>{r}</button>))}</div>}
    </div>
  );
};

const PortfolioAllocation = ({ data: fullAssetData, displaySymbol, usdIdr }) => {
  const [activeTab, setActiveTab] = useState('Equity');
  const [hoveredSegment, setHoveredSegment] = useState(null);

  const { equityData, sectorData } = useMemo(() => {
    const eqData = fullAssetData
      .filter(d => d.type === 'stock' || d.type === 'crypto')
      .map(d => ({ name: d.symbol, value: d.marketValueUSD, image: d.image, type: d.type }))
      .sort((a,b)=>b.value-a.value);

    const secData = {
      'Equity': { value: 0, color: '#10B981', icon: <EquityIcon /> },
      'Crypto': { value: 0, color: '#3B82F6', icon: <CryptoIcon /> },
      'Non-Liquid': { value: 0, color: '#F97316', icon: <NonLiquidIcon /> }
    };
    fullAssetData.forEach(asset => {
      if (asset.type === 'stock') secData['Equity'].value += asset.marketValueUSD;
      else if (asset.type === 'crypto') secData['Crypto'].value += asset.marketValueUSD;
      else if (asset.type === 'nonliquid') secData['Non-Liquid'].value += asset.marketValueUSD;
    });
    
    return { 
      equityData: eqData,
      sectorData: Object.entries(secData).map(([name, data]) => ({ name, ...data })).filter(d => d.value > 0)
    };
  }, [fullAssetData]);

  const data = activeTab === 'Equity' ? equityData : sectorData;
  const totalValueUSD = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  
  if (!totalValueUSD) return <div className="mt-8 text-center text-gray-500">No assets to show in allocation.</div>;

  const totalValueDisplay = displaySymbol === "Rp" ? totalValueUSD * usdIdr : totalValueUSD;
  const size = 200, strokeWidth = 20, innerRadius = (size / 2) - strokeWidth;
  const colors = ["#10B981", "#3B82F6", "#F97316", "#8B5CF6", "#F59E0B", "#64748B"];
  let accumulatedAngle = 0;

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-white mb-4">Portfolio Allocation</h3>
      <div className="flex gap-2 mb-4"><button onClick={() => setActiveTab('Equity')} className={`px-4 py-1 text-sm rounded-full ${activeTab === 'Equity' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-gray-400'}`}>By Asset</button><button onClick={() => setActiveTab('Sub-Sector')} className={`px-4 py-1 text-sm rounded-full ${activeTab === 'Sub-Sector' ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-gray-400'}`}>By Sector</button></div>
      <div className="relative flex justify-center items-center" style={{ width: size, height: size, margin: '0 auto 2rem auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {data.map((d, i) => {
            const angle = (d.value / totalValueUSD) * 360;
            const segment = (<circle key={i} cx={size/2} cy={size/2} r={innerRadius} fill="transparent" stroke={d.color || colors[i % colors.length]} strokeWidth={strokeWidth + (hoveredSegment === d.name ? 4 : 0)} strokeDasharray={`${(angle - 2) * Math.PI * innerRadius / 180} ${360 * Math.PI * innerRadius / 180}`} strokeDashoffset={-accumulatedAngle * Math.PI * innerRadius / 180} className="transition-all duration-300" onMouseOver={() => setHoveredSegment(d.name)} onMouseOut={() => setHoveredSegment(null)}/>);
            accumulatedAngle += angle; return segment;
          })}
        </svg>
        <div className="absolute flex flex-col items-center justify-center pointer-events-none"><div className="text-xl font-bold text-white">{formatCurrency(totalValueDisplay, false, displaySymbol, 1)}</div><div className="text-sm text-gray-400">{data.length} {activeTab === 'Equity' ? 'Assets' : 'Sectors'}</div></div>
      </div>
      <div className="space-y-2">{data.map((d, i) => { const percentage = (d.value / totalValueUSD) * 100; const valueDisplay = d.value * (displaySymbol === "Rp" ? usdIdr : 1); return (<div key={i} className={`p-2 rounded-lg transition-colors duration-300 ${hoveredSegment === d.name ? 'bg-zinc-800' : ''}`} onMouseOver={() => setHoveredSegment(d.name)} onMouseOut={() => setHoveredSegment(null)}><div className="flex justify-between items-center text-sm mb-1"><div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-white text-xs">
          {d.image ? <img src={d.image} alt={d.name} className="w-full h-full rounded-full object-cover"/> : d.icon || (d.type === 'stock' ? <EquityIcon /> : d.name.charAt(0))}
        </div>
        <div><div className="font-semibold text-white">{d.name}</div><div className="text-xs text-gray-400">{formatCurrency(valueDisplay, false, displaySymbol, 1)}</div></div></div><div className="text-white font-semibold">{percentage.toFixed(2)}%</div></div><div className="w-full bg-zinc-700 rounded-full h-1.5 mt-1"><div className="h-1.5 rounded-full" style={{ width: `${percentage}%`, backgroundColor: d.color || colors[i % colors.length] }}></div></div></div>); })}</div>
    </div>
  );
};

