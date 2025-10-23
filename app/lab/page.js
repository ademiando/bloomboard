// Ganti seluruh isi file Anda dengan kode ini
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// Komponen untuk memasukkan CSS kustom Anda
const GlobalStyles = () => (
  <style jsx global>{`
    body, .main-background {
      background-color: #000000;
    }
    .glass-card {
      background: rgba(28, 28, 32, 0.6);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    @keyframes flash-green { 0% { background-color: rgba(16, 185, 129, 0.5); } 100% { background-color: transparent; } }
    @keyframes flash-red { 0% { background-color: rgba(239, 68, 68, 0.5); } 100% { background-color: transparent; } }
    .flash-up { animation: flash-green 0.7s ease-out; }
    .flash-down { animation: flash-red 0.7s ease-out; }
    .tradingview-widget-container:fullscreen { background-color: #131722; }
  `}</style>
);


/* ===================== Icons ===================== */
// Ikon ini (UserAvatar) tidak lagi digunakan di header, namun tetap dipertahankan jika diperlukan di tempat lain.
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIconSimple = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const TrashIcon = ({className}) => (<svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>);
const ArrowUpIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 12a.5.5 0 0 0 .5-.5V5.707l2.146 2.147a.5.5 0 0 0 .708-.708l-3-3a.5.5 0 0 0-.708 0l-3 3a.5.5 0 1 0 .708.708L7.5 5.707V11.5a.5.5 0 0 0 .5.5z"/></svg>;
const ArrowDownIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path fillRule="evenodd" d="M8 4a.5.5 0 0 1 .5.5v5.793l2.146-2.147a.5.5 0 0 1 .708.708l-3 3a.5.5 0 0 1-.708 0l-3-3a.5.5 0 1 1 .708-.708L7.5 10.293V4.5A.5.5 0 0 1 8 4z"/></svg>;
const InfoIcon = ({className}) => <svg className={className} width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>;
const FullscreenIcon = ({className}) => (<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>);
const ExitFullscreenIcon = ({ className }) => (<svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0-2-2h-3M3 16h3a2 2 0 0 0 2 2v3"/></svg>);
const PencilIcon = (props) => (<svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>);

// --- Colorful Sector Icons (dari file HTML) ---
const ColorfulEquityIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 18h16" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
        <path d="M7 14v-3" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
        <path d="M12 14v-6" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
        <path d="M17 14V6" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
        <path d="M4 10l5-3 5 5 5-4" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const ColorfulCryptoIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="#F97316"/>
        <path d="M14.5 7.5H10.4375C9.33294 7.5 8.5 8.33294 8.5 9.4375V14.5625C8.5 15.6671 9.33294 16.5 10.4375 16.5H14.5M14.5 7.5V10.5M14.5 7.5L12 5.5M14.5 16.5V13.5M14.5 16.5L12 18.5M11.5 7.5V16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const ColorfulCashIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cash-gradient" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#4ade80"/>
                <stop offset="1" stopColor="#16a34a"/>
            </linearGradient>
        </defs>
        <circle cx="12" cy="12" r="10" fill="url(#cash-gradient)"/>
        <path d="M12 6V18M9.5 9h5M9.5 15h5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
);
const ColorfulNonLiquidIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 9.5L12 4L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z" fill="#a16207" stroke="#78350f" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M9 21V12H15V21" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const SearchIcon = (props) => (<svg {...props} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" ><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>);
const StarIcon = ({ isFilled, ...props }) => (<svg {...props} width="20" height="20" viewBox="0 0 24 24" fill={isFilled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>);

/* ===================== Config & Helpers ===================== */
// PERUBAHAN: Menggunakan definisi API dari file page (16).js
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_FINANCE_SEARCH_URL = (q) => `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}`;
const PROXIED_YAHOO_SEARCH = (q) => `https://api.allorigins.win/raw?url=${encodeURIComponent(YAHOO_FINANCE_SEARCH_URL(q))}`;

const FINNHUB_TOKEN = "cns0a0pr01qj9b42289gcns0a0pr01qj9b4228a0";
const FINNHUB_QUOTE = (symbol) => `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_TOKEN}`;
const COINGECKO_MARKETS = (ids) => `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&price_change_percentage=24h`;
// AKHIR PERUBAHAN

const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v).replace(/,/g, '').replace(/\s/g,'')); return isNaN(n) ? 0 : n; };

function formatCurrency(value, valueIsUSD, displaySymbol, usdIdr) {
  if (value === null || typeof value === 'undefined' || isNaN(Number(value))) {
    return displaySymbol === '$' ? '$0.00' : 'Rp 0';
  }

  let displayValue;
  if (displaySymbol === '$') {
    displayValue = valueIsUSD ? value : value / usdIdr;
    const options = {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };
    if (Math.abs(displayValue) > 0 && Math.abs(displayValue) < 1) {
      options.minimumFractionDigits = 8;
      options.maximumFractionDigits = 8;
    }
    return new Intl.NumberFormat('en-US', options).format(displayValue);
  } else { 
    displayValue = valueIsUSD ? value * usdIdr : value;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(displayValue);
  }
}

function formatCurrencyShort(value, valueIsUSD, displaySymbol, usdIdr) {
  let displayValue;
  if (displaySymbol === '$') {
    displayValue = valueIsUSD ? value : value / usdIdr;
     return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      compactDisplay: 'short',
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(displayValue);
  } else { 
    displayValue = valueIsUSD ? value * usdIdr : value;
    if (displayValue >= 1000000000) {
        return `Rp ${(displayValue / 1000000000).toFixed(2).replace('.', ',')}B`;
    }
    if (displayValue >= 1000000) {
        return `Rp ${(displayValue / 1000000).toFixed(2).replace('.', ',')}M`;
    }
    if (displayValue >= 1000) {
        return `Rp ${(displayValue / 1000).toFixed(2).replace('.', ',')}K`;
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(displayValue);
  }
}


function formatQty(v) {
  const n = Number(v || 0);
  if (n === 0) return "0";
  if (Math.abs(n) < 1) return n.toFixed(6).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
  return n.toLocaleString('id-ID');
}

function ensureNumericAsset(a) {
  return { ...a, id: a.id || `${a.type}:${a.symbol}:${Math.random()}`, name: a.name || a.symbol, shares: toNum(a.shares || 0), avgPrice: toNum(a.avgPrice || 0), investedUSD: toNum(a.investedUSD || 0), lastPriceUSD: toNum(a.lastPriceUSD || 0), change24hUSD: toNum(a.change24hUSD || 0), change24hPct: toNum(a.change24hPct || 0), createdAt: a.createdAt || Date.now(), purchaseDate: a.purchaseDate || a.createdAt || Date.now(), nonLiquidYoy: toNum(a.nonLiquidYoy || 0), type: a.type || "stock", image: a.image || null, };
}

/* ===================== UI Helpers ===================== */
const Modal = ({ children, isOpen, onClose, title, size = "2xl" }) => {
  if (!isOpen) return null;
  const sizeClasses = {
      'lg': 'max-w-lg',
      '2xl': 'max-w-2xl',
      '3xl': 'max-w-3xl',
  };
  return (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}><div className={`glass-card w-full ${sizeClasses[size]}`} onClick={e => e.stopPropagation()}><div className="flex justify-between items-center p-4 border-b border-white/10"><h2 className="text-lg font-semibold text-white">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button></div><div className="p-4">{children}</div></div></div>);
};
const BottomSheet = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (<div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}><div className={`fixed bottom-0 left-0 right-0 glass-card rounded-t-2xl shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}><div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto my-3"></div>{children}</div></div>);
};

/* ===================== Main Component ===================== */
export default function PortfolioDashboard() {
  const STORAGE_VERSION = "v26"; 
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_assets_${STORAGE_VERSION}`) || "[]").map(ensureNumericAsset) : []);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_transactions_${STORAGE_VERSION}`) || "[]") : []);
  const [financialSummaries, setFinancialSummaries] = useState({ realizedUSD: 0, tradingBalance: 0, totalDeposits: 0, totalWithdrawals: 0, });
  const [displaySymbol, setDisplaySymbol] = useState(() => isBrowser ? (localStorage.getItem(`pf_display_sym_${STORAGE_VERSION}`) || "Rp") : "Rp");
  const [usdIdr] = useState(16400); 
  const [watchedAssetIds, setWatchedAssetIds] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_watched_assets_${STORAGE_VERSION}`) || '["tether", "bitcoin"]') : ['tether', 'bitcoin']);
  const [watchedAssetData, setWatchedAssetData] = useState({});
  const [priceHistory, setPriceHistory] = useState(() => isBrowser ? JSON.parse(localStorage.getItem(`pf_price_history_${STORAGE_VERSION}`) || "{}") : {});
  const [priceFlashes, setPriceFlashes] = useState({});

  const [isAddAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("stock");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [isManagePortfolioOpen, setManagePortfolioOpen] = useState(false);
  const [isBalanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceModalMode, setBalanceModalMode] = useState('Add');
  const [isAssetDetailModalOpen, setAssetDetailModalOpen] = useState(false);
  const [selectedAssetForDetail, setSelectedAssetForDetail] = useState(null);
  const [isEquityModalOpen, setIsEquityModalOpen] = useState(false);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);
  const [isAssetOptionsOpen, setIsAssetOptionsOpen] = useState(false);
  const [assetSortBy, setAssetSortBy] = useState('default'); // 'default', 'allocation', 'purchaseDate'
  const [assetDisplayAs, setAssetDisplayAs] = useState(() => isBrowser ? (localStorage.getItem(`pf_asset_display_as_${STORAGE_VERSION}`) || 'card') : 'card');


  const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");
  const importInputRef = useRef(null);
  const prevAssetsRef = useRef();
  
  const recalculateStateFromTransactions = (txs) => {
    let newAssets = {}; let realizedUSD = 0; let tradingBalance = 0; let totalDeposits = 0; let totalWithdrawals = 0;
    const sortedTxs = [...txs].sort((a, b) => a.date - b.date);
    for (const tx of sortedTxs) {
      if (tx.type === 'deposit') { tradingBalance += tx.amount; totalDeposits += tx.amount; continue; }
      if (tx.type === 'withdraw') { tradingBalance -= tx.amount; totalWithdrawals += tx.amount; continue; }
      const assetId = tx.assetId || `${tx.assetStub.type}:${tx.assetStub.symbol}`;
      if (!newAssets[assetId]) { newAssets[assetId] = ensureNumericAsset({ ...tx.assetStub, shares: 0, investedUSD: 0, avgPrice: 0 }); }
      const asset = newAssets[assetId];
      if (tx.type === 'buy') {
        tradingBalance -= tx.cost * usdIdr; const totalInvested = asset.investedUSD + tx.cost; const totalShares = asset.shares + tx.qty;
        asset.investedUSD = totalInvested; asset.shares = totalShares; asset.avgPrice = totalShares > 0 ? totalInvested / totalShares : 0;
      } else if (tx.type === 'sell' || tx.type === 'delete') {
        tradingBalance += tx.proceeds * usdIdr; realizedUSD += tx.realized; const costOfSold = asset.avgPrice * tx.qty;
        asset.investedUSD -= costOfSold; asset.shares -= tx.qty;
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
  
  useEffect(() => { 
    if (isBrowser) {
        localStorage.setItem(`pf_assets_${STORAGE_VERSION}`, JSON.stringify(assets));
        prevAssetsRef.current = assets.reduce((acc, asset) => {
            acc[asset.id] = asset;
            return acc;
        }, {});
    }
  }, [assets]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_display_sym_${STORAGE_VERSION}`, displaySymbol); }, [displaySymbol]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_watched_assets_${STORAGE_VERSION}`, JSON.stringify(watchedAssetIds)); }, [watchedAssetIds]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_price_history_${STORAGE_VERSION}`, JSON.stringify(priceHistory)); }, [priceHistory]);
  useEffect(() => { if (isBrowser) localStorage.setItem(`pf_asset_display_as_${STORAGE_VERSION}`, assetDisplayAs); }, [assetDisplayAs]);


  useEffect(() => {
    // PERUBAHAN: Menggunakan logika pollPrices dari file page (16).js (Finnhub, Coingecko direct, 25s)
    const pollPrices = async () => {
      if (assets.length === 0 && watchedAssetIds.length === 0) return;

      const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol).filter(Boolean))];
      const portfolioCryptoIds = [...new Set(assets.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId))];
      
      const newPrices = {};
      const newFlashes = {};
      const newHistory = {...priceHistory};

      for (const symbol of stockSymbols) {
        try {
          const res = await fetch(FINNHUB_QUOTE(symbol));
          const data = await res.json();
          if (data && data.c > 0) {
            const priceInUSD = symbol.endsWith('.JK') ? data.c / usdIdr : data.c;
            newPrices[symbol] = { price: priceInUSD, change: data.d ?? 0, pctChange: data.dp ?? 0 };
          }
        } catch (e) { console.error(`Failed to fetch price for ${symbol}`, e); }
      }
      
      const allCryptoIds = [...new Set([...portfolioCryptoIds, ...watchedAssetIds])];
      if (allCryptoIds.length > 0) {
        try {
            const res = await fetch(COINGECKO_MARKETS(allCryptoIds.join(',')));
            const data = await res.json();
            const newWatchedData = {};

            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (watchedAssetIds.includes(item.id)) {
                        newWatchedData[item.id] = {
                            id: item.id, price_usd: item.current_price,
                            change_24h: item.price_change_percentage_24h,
                            name: item.name, symbol: item.symbol.toUpperCase(), image: item.image,
                        };
                    }
                    if (portfolioCryptoIds.includes(item.id)) {
                        const asset = assets.find(a => a.coingeckoId === item.id);
                        if (asset) {
                           newPrices[asset.symbol] = { price: item.current_price ?? 0, change: item.price_change_24h ?? 0, pctChange: item.price_change_percentage_24h ?? 0 };
                        }
                    }
                });
                setWatchedAssetData(newWatchedData);
            } else {
                 console.error("Unexpected data format from crypto API:", data);
            }
        } catch (e) { console.error("Failed to fetch crypto prices", e); }
      }
      
      if (Object.keys(newPrices).length > 0) {
        setAssets(prev => prev.map(a => {
            if (newPrices[a.symbol]) {
                const newPriceData = newPrices[a.symbol];
                const prevAsset = prevAssetsRef.current?.[a.id];

                if (prevAsset && newPriceData.price !== prevAsset.lastPriceUSD) {
                    newFlashes[a.id] = newPriceData.price > prevAsset.lastPriceUSD ? 'up' : 'down';
                }

                const history = (newHistory[a.id] || []).slice(-29);
                history.push(newPriceData.price);
                newHistory[a.id] = history;

                return { 
                    ...a, 
                    lastPriceUSD: newPriceData.price,
                    change24hUSD: newPriceData.change,
                    change24hPct: newPriceData.pctChange
                };
            }
            return a;
        }));
        
        setPriceHistory(newHistory);
        
        if (Object.keys(newFlashes).length > 0) {
            setPriceFlashes(newFlashes);
            Object.keys(newFlashes).forEach(assetId => {
                setTimeout(() => {
                    setPriceFlashes(prev => {
                        const next = {...prev};
                        delete next[assetId];
                        return next;
                    });
                }, 700);
            });
        }
      }
    };

    pollPrices();
    const id = setInterval(pollPrices, 25000); // Polling every 25 seconds
    return () => clearInterval(id);
    // AKHIR PERUBAHAN
  }, [assets.length, usdIdr, watchedAssetIds]);

  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        // PERUBAHAN: Menggunakan URL search dari file page (16).js (Coingecko direct)
        const url = searchMode === 'crypto' ? `${COINGECKO_API}/search?query=${encodeURIComponent(q)}` : PROXIED_YAHOO_SEARCH(q);
        // AKHIR PERUBAHAN
        const res = await fetch(url);
        if (!res.ok) throw new Error('Search API failed');
        const j = await res.json();
        if (searchMode === 'crypto') {
          setSuggestions((j.coins || []).slice(0, 10).map(c => ({ symbol: c.symbol.toUpperCase(), display: `${c.name} (${c.symbol.toUpperCase()})`, id: c.id, image: c.thumb, source: "coingecko", type: "crypto" })));
        } else {
          setSuggestions((j.quotes || []).filter(it => it.shortname || it.longname).map(it => ({ symbol: it.symbol.toUpperCase(), display: `${it.shortname || it.longname} (${it.symbol.toUpperCase()})`, exchange: it.exchange, source: "yahoo", type: "stock" })).slice(0, 10));
        }
      } catch (e) { console.error("Search failed:", e); setSuggestions([]); }
    }, 400);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  const addTransaction = (tx) => setTransactions(prev => [...prev, tx]);
  
  const handleBuy = (assetStub, qty, priceUSD) => {
    qty = toNum(qty); priceUSD = toNum(priceUSD);
    if (qty <= 0 || priceUSD <= 0) { alert("Quantity and price must be greater than zero."); return false; }
    const costUSD = qty * priceUSD;
    if (costUSD * usdIdr > financialSummaries.tradingBalance) { alert("Insufficient trading balance."); return false; }
    const assetId = assetStub.id || `${assetStub.type}:${assetStub.symbol}`;
    addTransaction({ id: `tx:${Date.now()}`, type: "buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name || assetStub.symbol, assetId, assetStub });
    if (isAssetDetailModalOpen) setAssetDetailModalOpen(false); return true;
  };

  const handleSell = (asset, qty, priceUSD) => {
    qty = toNum(qty); priceUSD = toNum(priceUSD);
    if (!asset || qty <= 0) { alert("Quantity must be > 0"); return false; }
    if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
    const proceedsUSD = qty * priceUSD; const costOfSold = qty * asset.avgPrice; const realized = proceedsUSD - costOfSold;
    addTransaction({ id: `tx:${Date.now()}`, assetId: asset.id, type: "sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, costOfSold, realized, date: Date.now(), symbol: asset.symbol, name: asset.name });
    if (isAssetDetailModalOpen) setAssetDetailModalOpen(false); return true;
  };

  const handleDeleteAsset = (asset) => {
    if (!asset || !confirm(`Delete and liquidate ${asset.symbol} at market price?`)) return;
    const marketUSD = asset.shares * asset.lastPriceUSD; const realized = marketUSD - asset.investedUSD;
    addTransaction({ id: `tx:${Date.now()}`, assetId: asset.id, type: "delete", qty: asset.shares, pricePerUnit: asset.lastPriceUSD, proceeds: marketUSD, costOfSold: asset.investedUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name, note: "liquidated" });
    setAssetDetailModalOpen(false);
  };
  
  const handleDeleteTransaction = (txId) => { if (confirm("Delete this transaction permanently?")) setTransactions(prev => prev.filter(tx => tx.id !== txId)); };

  const addAssetWithInitial = (qty, price) => {
    qty = toNum(qty); price = toNum(price); let p = selectedSuggestion;
    if (!p) { const t = query.split("(")[0].trim(); if (!t) return; p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: searchMode, image: null }; }
    if (qty <= 0 || price <= 0) return;
    const priceUSD = (displaySymbol === "Rp") ? price / usdIdr : price;
    const newStub = { id: `${p.type}:${p.symbol||p.id}`, type: p.type, symbol: p.symbol, name: p.display, image: p.image, coingeckoId: p.type === 'crypto' ? p.id : undefined };
    if (handleBuy(newStub, qty, priceUSD)) { setAddAssetModalOpen(false); setQuery(''); setSelectedSuggestion(null); setSuggestions([]); }
  };

  const addNonLiquidAsset = () => {
    const name = nlName.trim(), qty = toNum(nlQty), priceIn = toNum(nlPrice);
    if (!name || qty <= 0 || priceIn <= 0) { alert("Name, quantity, and price must be filled."); return; }
    const priceUSD = nlPriceCcy === 'IDR' ? priceIn / usdIdr : priceIn;
    const newAssetStub = { id: `nonliquid:${name.replace(/\s/g,'_')}`, type: 'nonliquid', symbol: name.slice(0,8).toUpperCase(), name, purchaseDate: nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now(), nonLiquidYoy: toNum(nlYoy), description: nlDesc };
    if (handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setNlName(''); setNlQty(''); setNlPrice(''); setNlPurchaseDate(''); setNlDesc(''); }
  };
  
  const handleAddBalance = (amount) => { addTransaction({ id: `tx:${Date.now()}`, type: "deposit", amount: toNum(amount), date: Date.now() }); setBalanceModalOpen(false); };
  const handleWithdraw = (amount) => {
    const amountIDR = toNum(amount); if (amountIDR > financialSummaries.tradingBalance) { alert("Withdrawal amount exceeds balance."); return; }
    addTransaction({ id: `tx:${Date.now()}`, type: "withdraw", amount: amountIDR, date: Date.now() }); setBalanceModalOpen(false);
  };
  
  // PERUBAHAN: Menggunakan logika Export dari file page (16).js (CSV flattened)
  const handleExport = () => {
    if (transactions.length === 0) { alert("No transactions to export."); return; }
    const formatCsvCell = (cellData) => { const stringData = String(cellData ?? ''); if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) { return `"${stringData.replace(/"/g, '""')}"`; } return stringData; };
    const headers = ['id', 'date', 'type', 'symbol', 'name', 'qty', 'pricePerUnit', 'cost', 'proceeds', 'realized', 'amount', 'assetId', 'note', 'assetStub_id', 'assetStub_type', 'assetStub_symbol', 'assetStub_name', 'assetStub_image', 'assetStub_coingeckoId'];
    const headerRow = headers.join(',') + '\n';
    const rows = transactions.map(tx => { const rowData = headers.map(header => { if (header.startsWith('assetStub_')) { const key = header.replace('assetStub_', ''); return tx.assetStub ? tx.assetStub[key] : ''; } return tx[header]; }); return rowData.map(formatCsvCell).join(','); }).join('\n');
    const csvContent = headerRow + rows; const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a");
    if (link.download !== undefined) { const url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); }
    setManagePortfolioOpen(false);
  };
  // AKHIR PERUBAHAN

  const handleImportClick = () => { importInputRef.current.click(); };

  // PERUBAHAN: Menggunakan logika Import dari file page (16).js (CSV flattened)
  const handleFileImport = (event) => {
    const file = event.target.files[0];
    if (!file) { return; }
    if (!confirm("Mengimpor file baru akan menggantikan semua transaksi saat ini. Apakah Anda yakin ingin melanjutkan?")) { event.target.value = null; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result; const lines = text.split(/\r\n|\n/);
            if (lines.length < 2) throw new Error("File CSV kosong atau hanya berisi header.");
            const headerLine = lines.shift(); const headers = headerLine.split(',').map(h => h.trim());
            const newTransactions = lines.filter(line => line.trim() !== '').map(line => {
                const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(val => val.startsWith('"') && val.endsWith('"') ? val.slice(1, -1).replace(/""/g, '"') : val);
                const tx = {};
                headers.forEach((header, index) => { if (values[index] !== undefined) tx[header] = values[index]; });
                if (tx.type === 'buy' && tx.assetStub_symbol) { tx.assetStub = { id: tx.assetStub_id, type: tx.assetStub_type, symbol: tx.assetStub_symbol, name: tx.assetStub_name, image: tx.assetStub_image, coingeckoId: tx.assetStub_coingeckoId, }; }
                Object.keys(tx).forEach(key => { if (key.startsWith('assetStub_')) delete tx[key]; });
                const numericFields = ['date', 'qty', 'pricePerUnit', 'cost', 'proceeds', 'realized', 'amount'];
                numericFields.forEach(field => { if (tx[field]) tx[field] = toNum(tx[field]); });
                return tx;
            });
            setTransactions(newTransactions); alert("Transaksi berhasil diimpor!");
        } catch (error) { console.error("Gagal mengimpor CSV:", error); alert(`Terjadi kesalahan saat mengimpor file: ${error.message}`); } finally { event.target.value = null; }
    };
    reader.readAsText(file); setManagePortfolioOpen(false);
  };
  // AKHIR PERUBAHAN

  const handleSetWatchedAsset = (cryptoId) => {
    setWatchedAssetIds(prev => {
        if (prev.includes(cryptoId)) return prev.filter(id => id !== cryptoId);
        if (prev.length >= 2) { const newWatched = [...prev]; newWatched.shift(); newWatched.push(cryptoId); return newWatched; }
        return [...prev, cryptoId];
    });
  };

  const { tradingBalance, realizedUSD, totalDeposits, totalWithdrawals } = financialSummaries;
  const derivedData = useMemo(() => {
    const rows = assets.map(a => {
        const currentPrice = a.lastPriceUSD > 0 ? a.lastPriceUSD : a.avgPrice;
        const marketValueUSD = a.shares * currentPrice;
        const pnlUSD = marketValueUSD - a.investedUSD;
        const pnlPct = a.investedUSD > 0 ? (pnlUSD / a.investedUSD) * 100 : 0;
        return { ...a, marketValueUSD, pnlUSD, pnlPct, lastPriceUSD: currentPrice };
    });
    const investedUSD = rows.reduce((s, r) => s + r.investedUSD, 0);
    const marketValueUSD = rows.reduce((s, r) => s + r.marketValueUSD, 0);
    const unrealizedPnlUSD = marketValueUSD - investedUSD;
    const unrealizedPnlPct = investedUSD > 0 ? (unrealizedPnlUSD / investedUSD) * 100 : 0;
    const totalEquity = (marketValueUSD * usdIdr) + tradingBalance;
    const sells = transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete');
    const wins = sells.filter(tx => tx.realized > 0); const losses = sells.filter(tx => tx.realized <= 0);
    const tradeStats = { trades: sells.length, wins: wins.length, losses: losses.length, winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0, maxProfit: wins.length ? Math.max(0, ...wins.map(tx => tx.realized)) : 0, maxLoss: losses.length ? Math.min(0, ...losses.map(tx => tx.realized)) : 0, avgProfit: wins.length ? wins.reduce((s, tx) => s + tx.realized, 0) / wins.length : 0, avgLoss: losses.length ? losses.reduce((s, tx) => s + tx.realized, 0) / losses.length : 0, totalRealizedGain: realizedUSD };
    const netDeposit = totalDeposits - totalWithdrawals; const totalPnlUSD = unrealizedPnlUSD + realizedUSD;
    const totalValueForBreakdown = tradingBalance + (marketValueUSD * usdIdr);
    const cashPct = totalValueForBreakdown > 0 ? (tradingBalance / totalValueForBreakdown) * 100 : 0;
    const investedPct = totalValueForBreakdown > 0 ? ((marketValueUSD * usdIdr) / totalValueForBreakdown) * 100 : 0;
    return { rows, totals: { investedUSD, marketValueUSD, unrealizedPnlUSD, unrealizedPnlPct }, totalEquity, tradeStats, netDeposit, totalPnlUSD, cashPct, investedPct };
  }, [assets, tradingBalance, realizedUSD, totalDeposits, totalWithdrawals, transactions, usdIdr]);

  const sortedAssets = useMemo(() => {
    const assetsToSort = [...derivedData.rows];
    if (assetSortBy === 'allocation') {
        return assetsToSort.sort((a,b) => b.marketValueUSD - a.marketValueUSD);
    }
    if (assetSortBy === 'purchaseDate') {
        return assetsToSort.sort((a,b) => a.purchaseDate - b.purchaseDate);
    }
    return assetsToSort; // default
  }, [derivedData.rows, assetSortBy]);


  const equitySeries = useMemo(() => {
    const sortedTx = [...transactions].sort((a, b) => a.date - b.date);
    if (sortedTx.length === 0) return [{ t: Date.now() - 86400000, v: 0 }, { t: Date.now(), v: 0 }];
    const points = []; let currentCash = 0; let currentHoldings = {};
    for (const tx of sortedTx) {
        if (tx.type === 'deposit') currentCash += tx.amount;
        else if (tx.type === 'withdraw') currentCash -= tx.amount;
        else if (tx.type === 'buy') {
            currentCash -= tx.cost * usdIdr;
            const asset = currentHoldings[tx.assetId] || { shares: 0, avgPrice: 0, invested: 0 };
            const newInvested = asset.invested + tx.cost; const newShares = asset.shares + tx.qty;
            asset.invested = newInvested; asset.shares = newShares; asset.avgPrice = newShares > 0 ? newInvested / newShares : 0;
            currentHoldings[tx.assetId] = asset;
        } else if (tx.type === 'sell' || tx.type === 'delete') {
            currentCash += tx.proceeds * usdIdr;
            if (currentHoldings[tx.assetId]) {
                const asset = currentHoldings[tx.assetId];
                asset.invested -= asset.avgPrice * tx.qty; asset.shares -= tx.qty;
            }
        }
        let holdingsValueUSD = 0;
        for (const assetId in currentHoldings) {
            const holding = currentHoldings[assetId];
            const liveAsset = assets.find(a => a.id === assetId);
            holdingsValueUSD += holding.shares * (liveAsset ? liveAsset.lastPriceUSD : holding.avgPrice);
        }
        points.push({ t: tx.date, v: currentCash + (holdingsValueUSD * usdIdr) });
    }
    if (points.length === 0) return [{ t: Date.now() - 86400000, v: 0 }, { t: Date.now(), v: derivedData.totalEquity }];
    return [{ t: points[0].t - 86400000, v: 0 }, ...points, {t: Date.now(), v: derivedData.totalEquity}];
  }, [transactions, assets, usdIdr, derivedData.totalEquity]);

  const handleWatchedAssetClick = (data) => {
    const assetStub = {
        id: `watched:${data.id}`,
        symbol: data.symbol,
        name: data.name,
        type: 'crypto',
        coingeckoId: data.id,
        lastPriceUSD: data.price_usd,
        change24hUSD: data.price_usd * (data.change_24h / 100),
        change24hPct: data.change_24h,
        shares: 0, // Key indicator that it's not owned
    };
    setSelectedAssetForDetail(assetStub);
    setAssetDetailModalOpen(true);
  };

  return (
    <React.Fragment>
      <GlobalStyles /> {/* Memanggil komponen style */}
      <div className="bg-black text-gray-300 min-h-screen font-sans main-background">
        <div className="max-w-4xl mx-auto">
          {/* PERUBAHAN: Header dipertahankan dari file sebelumnya (logo dihapus) */}
          <header className="p-4 flex justify-between items-center sticky top-0 bg-black/50 backdrop-blur-sm z-10">
              <div className="flex items-center gap-3">{/* Logo dihapus sesuai permintaan */}</div>
              <div className="flex items-center gap-3">
                  <button onClick={() => setAddAssetModalOpen(true)} className="text-gray-400 hover:text-white"><SearchIcon /></button>
                  <div className="flex items-center gap-2"><span className="text-xs font-semibold text-gray-400">IDR</span><div role="switch" aria-checked={displaySymbol === "$"} onClick={() => setDisplaySymbol(prev => prev === "Rp" ? "$" : "Rp")} className={`relative w-12 h-6 rounded-full p-1 cursor-pointer transition ${displaySymbol === "$" ? 'bg-emerald-600' : 'bg-zinc-700'}`}><div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${displaySymbol === "$" ? 'translate-x-6' : 'translate-x-0'}`}></div></div><span className="text-xs font-semibold text-gray-400">USD</span></div>
                  <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
              </div>
          </header>
          {/* AKHIR PERUBAHAN */}
          <main>
            <section className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div onClick={() => setIsEquityModalOpen(true)} className="glass-card p-3 sm:p-4 shadow-lg flex flex-col justify-between cursor-pointer hover:border-white/20 transition-all overflow-hidden">
                      <div>
                          <p className="text-gray-400 text-[10px] sm:text-xs">Total Equity</p>
                          <p className="text-xl sm:text-3xl font-bold text-white">{formatCurrency(derivedData.totalEquity, false, displaySymbol, usdIdr)}</p>
                          <p className="text-xs text-gray-400 mt-1">{displaySymbol === 'Rp' ? formatCurrency(derivedData.totalEquity, false, '$', usdIdr) : formatCurrency(derivedData.totalEquity, false, 'Rp', usdIdr)}</p>
                      </div>
                       <div className="text-[10px] sm:text-xs mt-2 space-y-1 text-gray-400 border-t border-white/10 pt-2">
                          <div className="flex justify-between">
                              <span>Unrealized P&L</span>
                              <span className={`font-semibold ${derivedData.totals.unrealizedPnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {formatCurrency(derivedData.totals.unrealizedPnlUSD, true, displaySymbol, usdIdr)}
                              </span>
                          </div>
                          <div className="flex justify-between">
                              <span>&nbsp;</span>
                              <span className={`font-semibold text-right block ${derivedData.totals.unrealizedPnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {derivedData.totals.unrealizedPnlUSD >= 0 ? '+' : ''}{derivedData.totals.unrealizedPnlPct.toFixed(2)}%
                              </span>
                          </div>
                      </div>
                      <div className="h-16 -mb-4 -mx-4 mt-auto pt-2"><AreaChart data={equitySeries} simplified={true}/></div>
                  </div>
                  <div onClick={() => setIsAllocationModalOpen(true)} className="glass-card p-3 sm:p-4 shadow-lg flex flex-col justify-center cursor-pointer hover:border-white/20 transition-all">
                      <div className="grid grid-cols-2 text-center gap-1">
                          <p className="text-gray-400 text-[11px] sm:text-xs">Cash</p>
                          <p className="text-gray-400 text-[11px] sm:text-xs">Invested</p>
                          <p className="font-semibold text-sm sm:text-base -mt-1">{formatCurrencyShort(tradingBalance, false, displaySymbol, usdIdr)}</p>
                          <p className="font-semibold text-sm sm:text-base -mt-1">{formatCurrencyShort(derivedData.totals.marketValueUSD, true, displaySymbol, usdIdr)}</p>
                      </div>
                      <div className="relative w-full h-4 bg-black/20 rounded-full my-2 flex text-[10px] font-bold text-white items-center">
                          <div className="bg-sky-500 h-full flex items-center justify-center rounded-l-full" style={{ width: `${derivedData.cashPct}%` }}>
                              {derivedData.cashPct > 15 && `${derivedData.cashPct.toFixed(0)}%`}
                          </div>
                          <div className="bg-teal-500 h-full flex items-center justify-center rounded-r-full" style={{ width: `${derivedData.investedPct}%` }}>
                              {derivedData.investedPct > 15 && `${derivedData.investedPct.toFixed(0)}%`}
                          </div>
                      </div>
                      <div className="text-[10px] sm:text-xs mt-2 space-y-1 text-gray-400 border-t border-white/10 pt-2">
                          <div className="flex justify-between">
                              <span>Net Deposit</span>
                              <span className="font-medium text-gray-300">{formatCurrency(derivedData.netDeposit, false, displaySymbol, usdIdr)}</span>
                          </div>
                          <div className="flex justify-between">
                              <span>Total G/L</span>
                              <span className={`font-semibold ${derivedData.totalPnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {formatCurrency(derivedData.totalPnlUSD, true, displaySymbol, usdIdr)}
                              </span>
                          </div>
                      </div>
                  </div>
                  <div onClick={() => setIsHistoryModalOpen(true)} className="glass-card p-3 sm:p-4 shadow-lg cursor-pointer hover:border-white/20 transition-all">
                       <p className="text-gray-400 text-[10px] sm:text-xs mb-2">Summary</p>
                      <div className="text-[11px] sm:text-xs space-y-2">
                          <div className="flex justify-between items-center"><span className="text-gray-400">Deposit</span><span className="font-medium">{formatCurrency(totalDeposits, false, displaySymbol, usdIdr)}</span></div>
                          <div className="flex justify-between items-center"><span className="text-gray-400">Withdraw</span><span className="font-medium">{formatCurrency(totalWithdrawals, false, displaySymbol, usdIdr)}</span></div>
                          <div className="flex justify-between items-center border-t border-white/10 pt-2 mt-2"><span className="text-gray-400">Realized P&L</span><span className={`font-semibold ${realizedUSD >= 0 ? 'text-[#20c997]' : 'text-red-400'}`}>{realizedUSD >= 0 ? '+' : ''}{formatCurrency(realizedUSD, true, displaySymbol, usdIdr)}</span></div>
                      </div>
                  </div>
                  <div className="flex flex-col gap-2">
                      {watchedAssetIds.map(id => {
                          const data = watchedAssetData[id];
                          if (!data) return <div key={id} className="flex-1 glass-card p-2 animate-pulse"></div>;
                          const change = data.change_24h || 0;
                          return (
                              <div key={id} onClick={() => handleWatchedAssetClick(data)} className="flex-1 glass-card p-2 flex items-center justify-between cursor-pointer hover:border-white/20 transition-all">
                                  <div className="flex items-center gap-2">
                                      <img src={data.image} alt={data.name} className="w-6 h-6"/>
                                      <div><p className="text-xs font-semibold text-white">{data.symbol}</p><p className="text-[10px] text-gray-400">{data.name}</p></div>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-xs font-semibold text-white tabular-nums">{formatCurrency(data.price_usd, true, displaySymbol, usdIdr)}</p>
                                      <p className={`text-xs font-semibold tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{change.toFixed(2)}%</p>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              </div>
              <div className="mt-4 px-2 flex justify-between items-center">
                  <button onClick={() => setIsAssetOptionsOpen(true)} className="text-gray-400 hover:text-white p-1" title="Filter and View Options">
                      <PencilIcon width="16" height="16" />
                  </button>
                  <div className="text-sm text-white cursor-pointer inline-flex items-center gap-2" onClick={() => setIsPerformanceModalOpen(true)}>
                      View Trade Performance <ArrowRightIconSimple />
                  </div>
              </div>
            </section>
            
            <div className="p-2 space-y-2">
               {assetDisplayAs === 'card' ? (
                  sortedAssets.map(r => {
                      const pnlColor = r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400';
                      const changeColor = r.change24hPct >= 0 ? 'text-emerald-400' : 'text-red-400';
                      const flashClass = priceFlashes[r.id] === 'up' ? 'flash-up' : priceFlashes[r.id] === 'down' ? 'flash-down' : '';

                      return (
                          <div key={r.id} className="glass-card p-3 cursor-pointer hover:border-white/20 transition-all" onClick={() => { setSelectedAssetForDetail(r); setAssetDetailModalOpen(true); }}>
                              <div className="flex justify-between items-center mb-3">
                                  <div>
                                      <h3 className="text-lg font-bold text-white">{r.symbol}</h3>
                                      <p className="text-xs text-gray-400 truncate max-w-[120px]">{r.name}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                      <div className="w-20 h-8">
                                          <Sparkline data={priceHistory[r.id] || []} color={r.change24hPct >= 0 ? '#10B981' : '#EF4444'} />
                                      </div>
                                      <div className={`text-right p-1 rounded-md ${flashClass}`}>
                                          <p className="text-base font-semibold text-white tabular-nums">{formatCurrency(r.lastPriceUSD, true, displaySymbol, usdIdr)}</p>
                                          {/* PERUBAHAN: Logika tampilan 24h disesuaikan agar cocok dengan data Finnhub/Coingecko (keduanya sudah USD) */}
                                          <p className={`text-xs font-semibold tabular-nums ${changeColor}`}>
                                              {r.change24hUSD >= 0 ? '+' : ''}{formatCurrency(r.change24hUSD, true, displaySymbol, usdIdr)} ({r.change24hPct?.toFixed(2) ?? '0.00'}%)
                                          </p>
                                      </div>
                                  </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-xs pt-3 border-t border-white/10">
                                  <div className="space-y-1">
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Qty</span><span className="font-medium text-gray-200">{formatQty(r.shares)}</span></div>
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Invested</span><span className="font-medium text-gray-200">{formatCurrency(r.investedUSD, true, displaySymbol, usdIdr)}</span></div>
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Avg Price</span><span className="font-medium text-gray-200">{formatCurrency(r.avgPrice, true, displaySymbol, usdIdr)}</span></div>
                                  </div>
                                  <div className="space-y-1 text-right">
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Gain P&L</span><span className={`font-semibold ${pnlColor}`}>{r.pnlUSD >= 0 ? '+' : ''}{formatCurrency(r.pnlUSD, true, displaySymbol, usdIdr)} ({r.pnlPct.toFixed(1)}%)</span></div>
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Market</span><span className="font-semibold text-gray-200">{formatCurrency(r.marketValueUSD, true, displaySymbol, usdIdr)}</span></div>
                                      <div className="flex justify-between items-center"><span className="text-gray-400">Current Price</span><span className="font-semibold text-gray-200">{formatCurrency(r.lastPriceUSD, true, displaySymbol, usdIdr)}</span></div>
                                  </div>
                              </div>
                          </div>
                      );
                  })
              ) : (
                  <AssetTableView rows={sortedAssets} displaySymbol={displaySymbol} usdIdr={usdIdr} onRowClick={(r) => { setSelectedAssetForDetail(r); setAssetDetailModalOpen(true); }} />
              )}
              {sortedAssets.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}
              <div className="p-4 text-center"><button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button></div>
            </div>

          </main>
          <AssetDetailModal isOpen={isAssetDetailModalOpen} onClose={() => setAssetDetailModalOpen(false)} asset={selectedAssetForDetail} onBuy={handleBuy} onSell={handleSell} onDelete={handleDeleteAsset} usdIdr={usdIdr} displaySymbol={displaySymbol} />
          <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)} size="lg"><AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc, displaySymbol, handleSetWatchedAsset, watchedAssetIds}} /></Modal>
          <Modal title={`${balanceModalMode} Balance`} isOpen={isBalanceModalOpen} onClose={() => setBalanceModalOpen(false)} size="lg"><BalanceManager onConfirm={balanceModalMode === 'Add' ? handleAddBalance : handleWithdraw} /></Modal>
          <Modal title="Portfolio Growth" isOpen={isEquityModalOpen} onClose={() => setIsEquityModalOpen(false)}><EquityGrowthView equitySeries={equitySeries} displaySymbol={displaySymbol} usdIdr={usdIdr} totalEquity={derivedData.totalEquity} /></Modal>
          <Modal title="Portfolio Allocation" isOpen={isAllocationModalOpen} onClose={() => setIsAllocationModalOpen(false)}><PortfolioAllocation data={derivedData.rows} tradingBalance={financialSummaries.tradingBalance} displaySymbol={displaySymbol} usdIdr={usdIdr}/></Modal>
          <Modal title="Transaction History" isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)}><HistoryView transactions={transactions} usdIdr={usdIdr} displaySymbol={displaySymbol} onDeleteTransaction={handleDeleteTransaction} /></Modal>
          
          {/* PERUBAHAN: Tinggi modal 70vh dipertahankan dari file sebelumnya */}
          <Modal title="Trade Performance" isOpen={isPerformanceModalOpen} onClose={() => setIsPerformanceModalOpen(false)} size="2xl">
              <div className="max-h-[70vh] overflow-y-auto">
                  <TradeStatsView stats={derivedData.tradeStats} transactions={transactions} displaySymbol={displaySymbol} usdIdr={usdIdr} />
              </div>
          </Modal>
          {/* AKHIR PERUBAHAN */}

          <Modal title="Asset Options" isOpen={isAssetOptionsOpen} onClose={() => setIsAssetOptionsOpen(false)} size="lg">
              <AssetOptionsPanel 
                  sortBy={assetSortBy}
                  setSortBy={setAssetSortBy}
                  displayAs={assetDisplayAs}
                  setDisplayAs={setAssetDisplayAs}
                  onClose={() => setIsAssetOptionsOpen(false)}
              />
          </Modal>
          <BottomSheet isOpen={isManagePortfolioOpen} onClose={() => setManagePortfolioOpen(false)}><ManagePortfolioSheet onAddBalance={() => { setManagePortfolioOpen(false); setBalanceModalMode('Add'); setBalanceModalOpen(true); }} onWithdraw={() => { setManagePortfolioOpen(false); setBalanceModalMode('Withdraw'); setBalanceModalOpen(true); }} onClearAll={() => { if(confirm("Erase all portfolio data? This cannot be undone.")) { setTransactions([]); } setManagePortfolioOpen(false); }} onExport={handleExport} onImport={handleImportClick} /></BottomSheet>
          <input type="file" ref={importInputRef} onChange={handleFileImport} className="hidden" accept=".csv" />
        </div>
      </div>
    </React.Fragment>
  );
}

/* ===================== Charts ===================== */
const Sparkline = ({ data = [], color = '#10B981' }) => {
  const uniqueId = useMemo(() => `sparkline-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  if (!data || data.length < 2) {
    return (
      <svg width="100%" height="100%" viewBox="0 0 80 32">
        <line x1="0" y1="16" x2="80" y2="16" stroke="#4B5563" strokeWidth="1.5" strokeDasharray="2,2" />
      </svg>
    );
  }
  const width = 80; const height = 32;
  const yMin = Math.min(...data); const yMax = Math.max(...data);
  const yRange = yMax - yMin === 0 ? 1 : yMax - yMin;
  const xStep = width / (data.length - 1);

  const points = data.map((point, i) => { const x = i * xStep; const y = height - ((point - yMin) / yRange) * height; return `${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={uniqueId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      <polygon fill={`url(#${uniqueId})`} points={areaPoints} />
    </svg>
  );
};

const AreaChart = ({ data: chartData, simplified = false, displaySymbol, range, setRange, showTimeframes = true }) => {
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
      if(filteredData.length > 0 && filteredData[0].t > startTime.getTime()){
          const firstValue = filteredData.find(d => d.v > 0)?.v || 0;
          return [{t: startTime.getTime(), v: firstValue}, ...filteredData];
      }
      return filteredData;
  }, [filteredData, startTime, now]);

  const height = simplified ? 80 : 220;
  const width = 700;
  const padding = { top: simplified ? 5 : 20, bottom: simplified ? 5 : 40, left: 0, right: simplified ? 0 : 80 };
  
  const yValues = data.map(d => d.v); const minVal = Math.min(...yValues); const maxVal = Math.max(...yValues);
  const valRange = maxVal - minVal || 1; const timeStart = data[0].t; const timeEnd = data[data.length - 1].t;
  const xScale = (t) => padding.left + ((t - timeStart) / (timeEnd - timeStart || 1)) * (width - padding.left - padding.right);
  const yScale = (v) => padding.top + (1 - (v - minVal) / valRange) * (height - padding.top - padding.bottom);

  const createSmoothPath = (points, x, y) => {
    if (points.length < 2) return ""; let path = `M ${x(points[0].t)},${y(points[0].v)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const x_mid = (x(points[i].t) + x(points[i + 1].t)) / 2; const y_mid = (y(points[i].v) + y(points[i + 1].v)) / 2;
        const cp_x1 = (x_mid + x(points[i].t)) / 2; const cp_x2 = (x_mid + x(points[i + 1].t)) / 2;
        path += ` Q ${cp_x1},${y(points[i].v)},${x_mid},${y_mid}`;
        path += ` Q ${cp_x2},${y(points[i + 1].v)},${x(points[i + 1].t)},${y(points[i + 1].v)}`;
    } return path;
  };
  const path = createSmoothPath(data, xScale, yScale);
  const areaPath = `${path} L ${xScale(timeEnd)},${height - padding.bottom} L ${xScale(timeStart)},${height - padding.bottom} Z`;
  
  const handleMouseMove = (event) => {
    if (simplified || !svgRef.current || data.length < 2) return;
    const svg = svgRef.current; const rect = svg.getBoundingClientRect(); const x = event.clientX - rect.left;
    const time = timeStart + ((x - padding.left) / (width - padding.left - padding.right)) * (timeEnd - timeStart);
    let closestPoint = data.reduce((prev, curr) => Math.abs(curr.t - time) < Math.abs(prev.t - time) ? curr : prev);
    if (closestPoint) setHoverData({ point: closestPoint, x: xScale(closestPoint.t), y: yScale(closestPoint.v) });
  };

  return (
    <div>
      <div className="relative">
        <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverData(null)}>
          <defs><linearGradient id="areaGradient2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#10B981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10B981" stopOpacity={0.05} /></linearGradient></defs>
          <path d={areaPath} fill="url(#areaGradient2)" /><path d={path} fill="none" stroke="#10B981" strokeWidth="2" />
          {!simplified && (
            <React.Fragment>
              {Array.from({length: 5}, (_, i) => minVal + (valRange / 4) * i).map((v, idx) => (<g key={idx}><line x1={padding.left} x2={width - padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2,2" /><text x={width - padding.right + 6} y={yScale(v) + 4} fontSize="11" fill="#6B7280">{`${displaySymbol === 'Rp' ? 'Rp' : '$'}${Math.round(v/1000)}k`}</text></g>))}
              {Array.from({length: 5}, (_, i) => {const t = timeStart + (i / 4) * (timeEnd - timeStart); return {t, label: new Date(t).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})}}).map((item, idx) => (<text key={idx} x={xScale(item.t)} y={height - padding.bottom + 15} textAnchor="middle" fontSize="11" fill="#6B7280">{item.label}</text>))}
              {hoverData && (<g><line y1={padding.top} y2={height - padding.bottom} x1={hoverData.x} x2={hoverData.x} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="3,3" /><circle cx={hoverData.x} cy={hoverData.y} r="4" fill="#10B981" stroke="white" strokeWidth="2" /></g>)}
            </React.Fragment>
          )}
        </svg>
        {hoverData && (<div className="absolute p-2 rounded-lg bg-zinc-800 text-white text-xs pointer-events-none" style={{ left: `${hoverData.x / width * 100}%`, top: `${padding.top-10}px`, transform: `translateX(-50%)` }}><div>{new Date(hoverData.point.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div><div className="font-bold">{formatCurrency(hoverData.point.v, false, displaySymbol, 1)}</div></div>)}
      </div>
      {showTimeframes && <div className="flex justify-center gap-2 mt-2">{['1W', '1M', '3M', 'YTD', '1Y', 'All'].map(r => (<button key={r} onClick={() => setRange(r)} className={`px-3 py-1 text-xs rounded-full ${range === r ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}>{r}</button>))}</div>}
    </div>
  );
};

/* ===================== Sub-Components & Pages ===================== */
// PERUBAHAN: Komponen-komponen di bawah ini dipertahankan dari file (15).js (sebelumnya)
// karena file (16).js memiliki implementasi yang berbeda/hilang
// dan permintaan Anda hanya untuk mengubah *pemanggilan API*.

const EquityGrowthView = ({ equitySeries, displaySymbol, usdIdr, totalEquity }) => {
    const [chartRange, setChartRange] = useState("All");
    const [returnPeriod, setReturnPeriod] = useState('Monthly');
    const [selectedDate, setSelectedDate] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    const availableYears = useMemo(() => {
        if (equitySeries.length < 2) return [new Date().getFullYear()];
        const years = new Set(equitySeries.map(p => new Date(p.t).getFullYear()));
        return Array.from(years).sort((a, b) => b - a);
    }, [equitySeries]);
    
    const availableMonths = useMemo(() => {
        if (equitySeries.length < 2) return [];
        const months = new Set();
        equitySeries.forEach(p => {
            const d = new Date(p.t);
            months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        });
        return Array.from(months).sort().reverse();
    }, [equitySeries]);

    const equityReturnData = useMemo(() => {
        if (equitySeries.length < 2) return [];

        const getEquityAt = (timestamp) => {
            let lastKnownEquity = 0;
            for (const point of equitySeries) {
                if (point.t <= timestamp) {
                    lastKnownEquity = point.v;
                } else {
                    break;
                }
            }
            return lastKnownEquity;
        };

        let results = [];
        const [year, month] = selectedDate.split('-').map(Number);

        if (returnPeriod === 'Daily') {
            const daysInMonth = new Date(year, month, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const currentDate = new Date(year, month - 1, day, 23, 59, 59, 999);
                if (currentDate.getTime() > Date.now()) break; 
                if (currentDate.getTime() < equitySeries[0].t) continue;
                
                const startOfDay = new Date(currentDate);
                startOfDay.setHours(0, 0, 0, 0);

                const endEquity = getEquityAt(currentDate.getTime());
                const startEquity = getEquityAt(startOfDay.getTime() - 1);

                const pnl = endEquity - startEquity;
                const pnlPct = startEquity > 0 ? (pnl / startEquity) * 100 : 0;

                results.push({
                    date: currentDate.toLocaleDateString('default', { month: 'short', day: 'numeric' }),
                    equity: endEquity, pnl, pnlPct, rawDate: currentDate
                });
            }
        } else if (returnPeriod === 'Monthly') {
            const selectedYearNum = parseInt(selectedDate.split('-')[0]);
            for (let i = 0; i < 12; i++) {
                const date = new Date(selectedYearNum, i, 1);
                const endOfMonth = new Date(selectedYearNum, i + 1, 0, 23, 59, 59, 999);
                
                if (endOfMonth.getTime() < equitySeries[0].t) continue;
                if (date.getTime() > Date.now()) continue;

                const endEquity = getEquityAt(endOfMonth.getTime());
                const startEquity = getEquityAt(date.getTime() - 1);

                const pnl = endEquity - startEquity;
                const pnlPct = startEquity > 0 ? (pnl / startEquity) * 100 : 0;
                
                results.push({
                    date: date.toLocaleString('default', { month: 'short', year: 'numeric' }),
                    equity: endEquity, pnl, pnlPct, rawDate: endOfMonth
                });
            }
        } else if (returnPeriod === 'Yearly') {
             availableYears.forEach(year => {
                const startOfYear = new Date(year, 0, 1);
                const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

                if (startOfYear.getTime() > Date.now()) return;

                const endEquity = getEquityAt(Math.min(endOfYear.getTime(), Date.now()));
                const startEquity = getEquityAt(startOfYear.getTime() - 1);

                const pnl = endEquity - startEquity;
                const pnlPct = startEquity > 0 ? (pnl / startEquity) * 100 : 0;

                results.push({
                    date: year.toString(),
                    equity: endEquity, pnl, pnlPct, rawDate: endOfYear
                });
             });
        }
        return results.sort((a, b) => b.rawDate - a.rawDate);
    }, [equitySeries, returnPeriod, selectedDate, availableYears]);

    return (
        <div className="p-1">
            <div className="mb-4">
                <p className="text-xs text-gray-400">Total Equity</p>
                <p className="text-2xl font-bold text-white">{formatCurrency(totalEquity, false, displaySymbol, usdIdr)}</p>
            </div>
            <div className="mt-6"><AreaChart data={equitySeries} displaySymbol={displaySymbol} range={chartRange} setRange={setChartRange} /></div>
            <div className="mt-8 max-h-64 overflow-y-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sticky top-0 bg-zinc-900/80 backdrop-blur-sm py-2">
                    <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-0">Total Equity Return</h3>
                    <div className="flex items-center gap-2 text-sm">
                        {(returnPeriod === 'Monthly' || returnPeriod === 'Daily') && (
                             <select value={selectedDate.substring(0,4)} onChange={e => setSelectedDate(`${e.target.value}-${selectedDate.substring(5,7)}`)} className="bg-zinc-700 text-white text-xs rounded-full px-3 py-1.5 outline-none appearance-none">
                                {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                            </select>
                        )}
                        {returnPeriod === 'Daily' && (
                            <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-zinc-700 text-white text-xs rounded-full px-3 py-1.5 outline-none appearance-none">
                                {availableMonths.map(month => <option key={month} value={month}>{new Date(month+"-02").toLocaleString('default', {month:'long', year:'numeric'})}</option>)}
                            </select>
                        )}
                        {['Daily', 'Monthly', 'Yearly'].map(p => (
                            <button key={p} onClick={() => setReturnPeriod(p)} className={`px-3 py-1 rounded-full text-xs ${returnPeriod === p ? 'bg-zinc-700 text-white' : 'text-gray-400'}`}>{p}</button>
                        ))}
                    </div>
                </div>
                <table className="w-full text-sm">
                    <thead className="text-left text-gray-500 text-xs">
                        <tr><th className="p-2 font-normal">Date</th><th className="p-2 font-normal text-right">Equity</th><th className="p-2 font-normal text-right">P&L</th></tr>
                    </thead>
                    <tbody>
                        {equityReturnData.map((item, index) => (
                        <tr key={index} className="border-t border-white/10">
                            <td className="p-2 text-white">{item.date}</td>
                            <td className="p-2 text-white text-right">{formatCurrency(item.equity, false, displaySymbol, usdIdr)}</td>
                            <td className={`p-2 text-right ${item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{item.pnl >= 0 ? '+' : ''}{formatCurrency(item.pnl, false, displaySymbol, usdIdr)} ({item.pnlPct.toFixed(2)}%)</td>
                        </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
const TradeStatsView = ({ stats, transactions, displaySymbol, usdIdr }) => {
    const [chartRange, setChartRange] = useState("All");
    const { maxProfitPct, maxLossPct } = useMemo(() => {
        let profitPct = 0;
        if (stats.maxProfit > 0) {
            const maxProfitTx = transactions.find(tx => tx.realized === stats.maxProfit);
            if (maxProfitTx && maxProfitTx.costOfSold > 0) {
                profitPct = (maxProfitTx.realized / maxProfitTx.costOfSold) * 100;
            }
        }
        
        let lossPct = 0;
        if (stats.maxLoss < 0) {
            const maxLossTx = transactions.find(tx => tx.realized === stats.maxLoss);
            if (maxLossTx && maxLossTx.costOfSold > 0) {
                lossPct = (maxLossTx.realized / maxLossTx.costOfSold) * 100;
            }
        }

        return { maxProfitPct: profitPct, maxLossPct: lossPct };
    }, [transactions, stats.maxProfit, stats.maxLoss]);

    const realizedGainSeries = useMemo(() => { const sorted = [...transactions.filter(t => t.type === 'sell' || t.type === 'delete')].sort((a, b) => a.date - b.date); let cumulativeGain = 0; const points = sorted.map(tx => { cumulativeGain += tx.realized || 0; return { t: tx.date, v: displaySymbol === '$' ? cumulativeGain : cumulativeGain * usdIdr }; }); if (points.length > 0) points.unshift({ t: points[0].t - 86400000, v: 0 }); return points.length ? points : [{ t: Date.now() - 1000, v: 0 }, {t: Date.now(), v:0}]; }, [transactions, displaySymbol, usdIdr]);
    const sells = useMemo(() => transactions.filter(tx => tx.type === 'sell' || tx.type === 'delete'), [transactions]); const realizedGainOnly = useMemo(() => sells.filter(tx => tx.realized > 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]); const realizedLossOnly = useMemo(() => sells.filter(tx => tx.realized < 0).reduce((sum, tx) => sum + tx.realized, 0), [sells]);
    const topGainers = useMemo(() => { const gainers = {}; sells.forEach(tx => { if (!gainers[tx.symbol]) gainers[tx.symbol] = { trades: 0, pnl: 0, cost: 0 }; gainers[tx.symbol].trades++; gainers[tx.symbol].pnl += tx.realized; gainers[tx.symbol].cost += tx.costOfSold || 0; }); return Object.entries(gainers).map(([symbol, data]) => ({ symbol, ...data, pnlPct: data.cost > 0 ? (data.pnl / data.cost) * 100 : 0 })).sort((a, b) => b.pnl - a.pnl).slice(0, 5); }, [sells]);
    
    if (!stats) return <div className="p-4 text-center text-gray-500">No trade data available.</div>;
    
    return ( 
        <div className="p-4 space-y-6"> 
            <div className="glass-card p-4"> 
                <div className="flex items-center justify-between"> 
                    <div>
                        <p className="text-sm text-gray-400">Win Rate</p>
                        <p className="text-3xl font-bold text-white mt-1">{stats.winRate.toFixed(2)}%</p>
                    </div> 
                    <div className="relative w-24 h-24">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="50%" cy="50%" r="45%" stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="transparent" />
                            <circle cx="50%" cy="50%" r="45%" stroke="#10B981" strokeWidth="8" fill="transparent" strokeDasharray={`${Math.PI * 2 * 45 * (stats.winRate / 100)}, ${Math.PI * 2 * 45}`} strokeLinecap="round"/>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-xs text-center">
                            <div className="font-semibold">{stats.trades}</div>
                            <div className="text-gray-400">Trades</div>
                            <div className="mt-1 flex gap-2">
                                <div><span className="text-emerald-400">{stats.wins}</span> W</div>
                                <div><span className="text-red-400">{stats.losses}</span> L</div>
                            </div>
                        </div>
                    </div> 
                </div> 
            </div> 
            <div className="grid grid-cols-2 gap-4"> 
                <div className="glass-card p-3">
                    <p className="text-sm text-gray-400 flex items-center gap-1"><ArrowUpIcon className="text-emerald-400"/>Max Profit</p>
                    <p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.maxProfit, true, displaySymbol, usdIdr)}</p>
                    <p className="text-sm text-emerald-400">+{maxProfitPct.toFixed(2)}%</p>
                </div> 
                <div className="glass-card p-3">
                    <p className="text-sm text-gray-400 flex items-center gap-1"><ArrowDownIcon className="text-red-400"/>Max Loss</p>
                    <p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.maxLoss, true, displaySymbol, usdIdr)}</p>
                    <p className="text-sm text-red-400">{maxLossPct.toFixed(2)}%</p>
                </div> 
                <div className="glass-card p-3">
                    <p className="text-sm text-gray-400 flex items-center gap-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20V16"/></svg>Avg. Profit</p>
                    <p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.avgProfit, true, displaySymbol, usdIdr)}</p>
                </div> 
                <div className="glass-card p-3">
                    <p className="text-sm text-gray-400 flex items-center gap-1"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v10"/><path d="M18 4v16"/><path d="M6 4v8"/></svg>Avg. Loss</p>
                    <p className="text-base font-semibold text-white mt-1">{formatCurrency(stats.avgLoss, true, displaySymbol, usdIdr)}</p>
                </div> 
            </div> 
            <div className="glass-card p-4"> 
                <h3 className="font-semibold text-white flex items-center gap-1">Total Realized Gain <InfoIcon className="text-gray-400 w-3 h-3" /></h3> 
                <p className={`text-2xl font-bold mt-1 ${stats.totalRealizedGain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.totalRealizedGain >= 0 ? '+' : ''}{formatCurrency(stats.totalRealizedGain, true, displaySymbol, usdIdr)}</p> 
                <div className="h-48 mt-2"><AreaChart data={realizedGainSeries} displaySymbol={displaySymbol} range={chartRange} setRange={setChartRange} showTimeframes={false}/></div> 
                <div className="mt-2 text-xs text-gray-400 border-t border-white/10 pt-2 space-y-1"> 
                    <div className="flex justify-between"><span>Realized Gain</span> <span className="text-emerald-400 font-semibold">{formatCurrency(realizedGainOnly, true, displaySymbol, usdIdr)}</span></div> 
                    <div className="flex justify-between"><span>Realized Loss</span> <span className="text-red-400 font-semibold">{formatCurrency(realizedLossOnly, true, displaySymbol, usdIdr)}</span></div> 
                </div> 
            </div> 
            <div className="glass-card p-4"> 
                <h3 className="font-semibold text-white mb-2">Top Gainer ({displaySymbol})</h3> 
                <table className="w-full text-sm"> 
                    <thead className="text-gray-400 text-xs font-light"><tr><th className="text-left font-normal py-1">Code</th><th className="text-center font-normal py-1">Trades</th><th className="text-right font-normal py-1">P&L</th></tr></thead> 
                    <tbody>{topGainers.map(g => (<tr key={g.symbol} className="border-t border-white/10"><td className="py-2 flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-white text-xs">{g.symbol.charAt(0)}</div>{g.symbol}</td><td className="text-center py-2">{g.trades}</td><td className={`text-right py-2 font-semibold ${g.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{g.pnl >= 0 ? '+' : ''}{formatCurrency(g.pnl, true, displaySymbol, usdIdr)} ({g.pnlPct.toFixed(2)}%)</td></tr>))}</tbody> 
                </table> 
            </div>
            <div className="glass-card p-4">
                <h3 className="font-semibold text-white mb-2">Trade History</h3>
                <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="text-gray-400 text-xs font-light sticky top-0 bg-zinc-800/80 backdrop-blur-sm">
                            <tr>
                                <th className="text-left font-normal py-2 px-2">Date</th>
                                <th className="text-left font-normal py-2 px-2">Symbol</th>
                                <th className="text-right font-normal py-2 px-2">Qty</th>
                                <th className="text-right font-normal py-2 px-2">Realized P&L</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...sells].sort((a,b) => b.date - a.date).map(tx => (
                                <tr key={tx.id} className="border-t border-white/10">
                                    <td className="py-2 px-2 text-xs text-gray-400">{new Date(tx.date).toLocaleDateString()}</td>
                                    <td className="py-2 px-2 font-semibold">{tx.symbol}</td>
                                    <td className="py-2 px-2 text-right">{formatQty(tx.qty)}</td>
                                    <td className={`py-2 px-2 text-right font-semibold ${tx.realized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {formatCurrency(tx.realized, true, displaySymbol, usdIdr)}
                                    </td>
                                </tr>
                            ))}
                            {sells.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="text-center py-8 text-gray-500">No completed trades yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div> 
    );
};
const HistoryView = ({ transactions, usdIdr, displaySymbol, onDeleteTransaction }) => (
    <div className="p-1 max-h-[70vh] overflow-y-auto">
        <table className="w-full text-sm">
            <thead className="text-left text-gray-500 text-xs sticky top-0 bg-zinc-900/80 backdrop-blur-sm">
                <tr><th className="p-3">Time</th><th className="p-3">Type</th><th className="p-3">Detail</th><th className="p-3 text-right">Nominal</th><th className="p-3 text-right">Action</th></tr>
            </thead>
            <tbody>
                {[...transactions].sort((a,b) => b.date - a.date).map(tx => (
                <tr key={tx.id} className="border-t border-white/10">
                    <td className="p-3 text-gray-400 text-xs">{new Date(tx.date).toLocaleString()}</td>
                    <td className="p-3 capitalize font-semibold">{tx.type}</td>
                    <td className="p-3 text-xs">{tx.type === 'buy' || tx.type === 'sell' || tx.type === 'delete' ? (<React.Fragment><div><strong>{tx.symbol}</strong></div><div>{formatQty(tx.qty)} @ {formatCurrency(tx.pricePerUnit, true, displaySymbol, usdIdr)}</div></React.Fragment>) : (<span>-</span>)}</td>
                    <td className="p-3 text-right">{formatCurrency(tx.type === 'deposit' || tx.type === 'withdraw' ? tx.amount : (tx.cost ||


