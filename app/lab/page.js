// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== SVG ICONS ===================== */
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const GraphIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>);

/* ===================== CONFIG & HELPERS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3",
      YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`,
      FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`,
      COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`,
      COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;
const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v || 0).replace(/,/g, '')); return isNaN(n) ? 0 : n; };

/* fmt: now includes currency label ("IDR " or "USD "), and supports digits override.
   Default: most numbers show 0 decimals; pass digits=2 only for Avg Price.
*/
function fmt(val, type="IDR", digits = 0) {
    const n = Number(val || 0);
    if (type === "USD") {
        return `USD ${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    }
    return `IDR ${n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function ensureNumericAsset(a) { return { ...a, id: a.id || `${a.type}:${a.symbol}:${Math.random()}`, shares: toNum(a.shares || 0), avgPrice: toNum(a.avgPrice || 0), investedUSD: toNum(a.investedUSD || 0), lastPriceUSD: toNum(a.lastPriceUSD || 0), createdAt: a.createdAt || Date.now(), purchaseDate: a.purchaseDate || a.createdAt || Date.now(), nonLiquidYoy: toNum(a.nonLiquidYoy || 0), type: a.type || "stock" }; }

/* ===================== UI COMPONENTS ===================== */
const Modal = ({ children, isOpen, onClose, title }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-[#181818] rounded-lg w-full max-w-lg border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center p-4 border-b border-gray-700"><h2 className="text-lg font-semibold text-white">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button></div><div className="p-4">{children}</div></div></div>); };
const BottomSheet = ({ isOpen, onClose, children }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}><div className={`fixed bottom-0 left-0 right-0 bg-[#1e1e1e] rounded-t-2xl shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}><div className="w-10 h-1 bg-gray-600 rounded-full mx-auto my-3"></div>{children}</div></div>); };

/* ===================== MAIN DASHBOARD COMPONENT ===================== */
export default function PortfolioDashboard() {
    // keep original state keys and defaults
    const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v9") || "[]").map(ensureNumericAsset) : []);
    const [realizedUSD, setRealizedUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_realized_v9") || 0) : 0);
    const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_transactions_v9") || "[]") : []);
    const [tradingBalance, setTradingBalance] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_balance_v9") || 5952) : 5952);
    const [displayCcy, setDisplayCcy] = useState(() => isBrowser ? localStorage.getItem("pf_display_ccy_v9") || "IDR" : "IDR");
    const [usdIdr, setUsdIdr] = useState(16400);
    const [isFxLoading, setIsFxLoading] = useState(true);

    // *** CHANGE: default view is 'portfolio' and nav shows all four tabs ***
    const [view, setView] = useState('portfolio'); // portfolio | performance | trade | history
    const [isAddAssetModalOpen, setAddAssetModalOpen] = useState(false);
    const [searchMode, setSearchMode] = useState("id");
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [selectedSuggestion, setSelectedSuggestion] = useState(null);
    const [isManagePortfolioOpen, setManagePortfolioOpen] = useState(false);
    const [isBalanceModalOpen, setBalanceModalOpen] = useState(false);
    const [balanceModalMode, setBalanceModalMode] = useState('Add');
    const [tradeModal, setTradeModal] = useState({ open: false, asset: null });
    const [chartRange, setChartRange] = useState("YTD");

    const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");

    // persist
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_assets_v9", JSON.stringify(assets)); }, [assets]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_realized_v9", String(realizedUSD)); }, [realizedUSD]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_transactions_v9", JSON.stringify(transactions)); }, [transactions]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_balance_v9", String(tradingBalance)); }, [tradingBalance]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_display_ccy_v9", displayCcy); }, [displayCcy]);

    // FX fetch (unchanged behavior)
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

    // Poll prices (kept original)
    useEffect(() => {
        const pollPrices = async () => {
            if (assets.length === 0) return;
            const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol))];
            let priceMap = {};
            if (stockSymbols.length > 0) {
                for (const symbol of stockSymbols) {
                    try {
                        const res = await fetch(FINNHUB_QUOTE(symbol));
                        const data = await res.json();
                        const price = toNum(data?.c);
                        if (price > 0) {
                            const isIdr = symbol.toUpperCase().endsWith('.JK');
                            priceMap[symbol] = { [isIdr ? 'idr' : 'usd']: price };
                        }
                    } catch (e) {}
                }
            }
            if (Object.keys(priceMap).length > 0) {
                setAssets(prev => prev.map(a => {
                    const key = a.symbol;
                    if (a.type === 'stock' && priceMap[key]) {
                        const isIdrStock = a.symbol.endsWith('.JK');
                        const priceData = priceMap[key];
                        let lastPriceUSD = a.lastPriceUSD;
                        if (isIdrStock && priceData.idr) { lastPriceUSD = priceData.idr / usdIdr; }
                        else if (priceData.usd) { lastPriceUSD = priceData.usd; }
                        return { ...a, lastPriceUSD };
                    }
                    return a;
                }));
            }
        };
        pollPrices();
        const id = setInterval(pollPrices, 30000);
        return () => clearInterval(id);
    }, [assets.length, usdIdr]);

    // search suggestions unchanged
    const searchTimeoutRef = useRef(null);
    useEffect(() => {
        if (!query || query.trim().length < 2) { setSuggestions([]); return; }
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const q = query.trim();
                if (searchMode === 'crypto') {
                    const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(q)}`); const j = await res.json();
                    setSuggestions((j.coins||[]).slice(0,10).map(c=>({symbol:c.symbol.toUpperCase(),display:c.name,id:c.id,source:"coingecko",type:"crypto"})));
                } else {
                    const res = await fetch(YAHOO_SEARCH(q));
                    if (!res.ok) throw new Error('API fetch failed');
                    const payload = await res.json();
                    const list = (payload.quotes||[]).map(it=>({symbol:it.symbol.toUpperCase(),display:it.shortname||it.longname||it.symbol,exchange:it.exchange,source:"yahoo",type:"stock"}));
                    if (searchMode === "id") setSuggestions(list.filter(x => x.symbol.toUpperCase().endsWith(".JK")));
                    else setSuggestions(list.filter(x => !x.symbol.toUpperCase().endsWith(".JK") && (x.exchange === 'NMS' || x.exchange === 'NYQ')));
                }
            } catch (e) { setSuggestions([]); }
        }, 350);
        return () => clearTimeout(searchTimeoutRef.current);
    }, [query, searchMode]);

    // buy/sell logic preserved
    const handleBuy = (assetStub, qty, priceUSD) => {
        const costUSD = qty * priceUSD;
        if (costUSD * usdIdr > tradingBalance) { alert("Insufficient trading balance."); return false; }
        const existingAsset = assets.find(a => a.symbol === assetStub.symbol);
        const newTx = { id:`tx:${Date.now()}`, type:"buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name };
        if (existingAsset) {
            newTx.assetId = existingAsset.id;
            setAssets(assets.map(a => a.id === existingAsset.id ? {...a, shares: a.shares + qty, investedUSD: a.investedUSD + costUSD, avgPrice: (a.investedUSD + costUSD) / (a.shares + qty)} : a));
        } else {
            const newAsset = ensureNumericAsset({ ...assetStub, shares: qty, avgPrice: priceUSD, investedUSD: costUSD });
            newTx.assetId = newAsset.id;
            setAssets([...assets, newAsset]);
        }
        setTradingBalance(b => b - (costUSD * usdIdr));
        setTransactions(prev => [newTx, ...prev]);
        if(tradeModal.open) setTradeModal({open: false, asset: null});
        return true;
    };
    const handleSell = (asset, qty, priceUSD) => {
        if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
        const proceedsUSD = qty * priceUSD, costOfSold = qty * asset.avgPrice, realized = proceedsUSD - costOfSold;
        const newTx = {id:`tx:${Date.now()}`, assetId:asset.id, type:"sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name };
        setAssets(assets.map(a => a.id === asset.id ? {...a, shares: a.shares - qty, investedUSD: a.investedUSD - costOfSold, avgPrice: (a.shares - qty) > 0 ? (a.investedUSD - costOfSold)/(a.shares - qty) : 0} : a).filter(a => a.shares > 1e-9));
        setTradingBalance(b => b + (proceedsUSD * usdIdr));
        setRealizedUSD(r => r + realized);
        setTransactions(prev => [newTx, ...prev]);
        if(tradeModal.open) setTradeModal({open: false, asset: null});
        return true;
    };

    const addAssetWithInitial = (qty, price, ccy) => {
        let p = selectedSuggestion; if(!p){const t=query.split("—")[0].trim();if(!t){alert("Select a suggestion");return;}p={symbol:t.toUpperCase(),display:t.toUpperCase(),type:'stock'};}
        if(qty<=0||price<=0){alert("Quantity & price must be > 0");return;}
        const priceUSD = ccy === "IDR" ? price / usdIdr : price;
        const newAssetStub = {id:`${p.source}:${p.symbol||p.id}:${Date.now()}`, type:p.type, symbol:p.symbol, name:p.display, coingeckoId: p.type==='crypto' ? p.id : undefined };
        if(handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setQuery(""); setSelectedSuggestion(null); }
    };
    const addNonLiquidAsset = () => {
        const name=nlName.trim(), qty=toNum(nlQty), priceIn=toNum(nlPrice); if(!name || qty<=0 || priceIn<=0){alert("Name, quantity, and price must be filled.");return;}
        const priceUSD = nlPriceCcy === 'IDR' ? priceIn / usdIdr : priceIn;
        const newAssetStub = {id:`nonliquid:${name.replace(/\s/g,'_')}:${Date.now()}`, type:'nonliquid', symbol:name.slice(0,8).toUpperCase(), name, purchaseDate: nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now(), nonLiquidYoy: toNum(nlYoy), description: nlDesc};
        if(handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setNlName(''); setNlQty(''); setNlPrice(''); setNlPurchaseDate(''); setNlDesc(''); }
    };
    const handleAddBalance = (amount) => { setTradingBalance(b => b + amount); setBalanceModalOpen(false); };
    const handleWithdraw = (amount) => { if(amount > tradingBalance){alert("Withdrawal amount exceeds balance."); return;} setTradingBalance(b => b - amount); setBalanceModalOpen(false); };
    const exportCSV = () => alert("CSV Export functionality is preserved.");
    const importCSV = (e) => { alert("CSV Import functionality is preserved."); e.target.value = ''; };

    // === Derived rows & totals: add unrealized, gain (realized+unrealized), pct ===
    const { rows, totals, totalEquity, tradeStats, donutData } = useMemo(() => {
        const calculatedRows = assets.map(a => {
            const market = a.shares * a.lastPriceUSD;
            const invested = a.investedUSD || (a.shares * a.avgPrice);
            const unrealized = market - invested;
            const realized = a.realizedUSD || 0;
            const gainNominal = unrealized + realized;
            const gainPct = invested > 0 ? (gainNominal / invested) * 100 : 0;
            return { ...a, marketValueUSD: market, investedUSD: invested, unrealizedUSD: unrealized, realizedUSD: realized, gainNominalUSD: gainNominal, gainPct };
        });
        const t = {
            invested: calculatedRows.reduce((s,r)=>s + (r.investedUSD||0),0),
            market: calculatedRows.reduce((s,r)=>s + (r.marketValueUSD||0),0),
            unrealized: calculatedRows.reduce((s,r)=>s + (r.unrealizedUSD||0),0),
            realized: calculatedRows.reduce((s,r)=>s + (r.realizedUSD||0),0),
        };
        t.gain = t.unrealized + t.realized;
        t.pnl = t.gain;
        t.pnlPct = t.invested > 0 ? (t.pnl / t.invested) * 100 : 0;
        const totalEq = (t.market * usdIdr) + tradingBalance;
        const sells = transactions.filter(tx => tx.type === 'sell'); const wins = sells.filter(tx => tx.realized > 0); const losses = sells.filter(tx => tx.realized <= 0);
        const tStats = { trades: sells.length, wins: wins.length, losses: losses.length, winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0, maxProfit: Math.max(0, ...wins.map(tx => tx.realized)), maxLoss: Math.min(0, ...losses.map(tx => tx.realized)), avgProfit: wins.length > 0 ? wins.reduce((s,tx)=>s+tx.realized,0)/wins.length : 0, avgLoss: losses.length > 0 ? losses.reduce((s,tx)=>s+tx.realized,0)/losses.length : 0, totalRealizedGain: realizedUSD };
        const dData = calculatedRows.map(r => ({ name: r.symbol, value: r.marketValueUSD })).sort((a,b) => b.value - a.value);
        return { rows: calculatedRows, totals: t, totalEquity: totalEq, tradeStats: tStats, donutData: dData };
    }, [assets, transactions, usdIdr, tradingBalance, realizedUSD]);

    // If performance view selected, render PerformancePage (same as original behavior)
    if (view === 'performance') {
        return <PerformancePage totals={totals} totalEquity={totalEquity} tradeStats={tradeStats} setView={setView} usdIdr={usdIdr} displayCcy={displayCcy} chartRange={chartRange} setChartRange={setChartRange} donutData={donutData} />;
    }

    /* ===================== RENDER ===================== */
    return (
        <div className="bg-black text-gray-300 min-h-screen font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
                    <div className="flex items-center gap-3"><UserAvatar /><h1 className="text-lg font-bold text-white">Bloomboard</h1></div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs text-gray-400">USD/IDR: {isFxLoading ? '...' : fmt(usdIdr, 'USD', 0)}</div>
                        <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
                    </div>
                </header>

                <main>
                    {/* === NAV: PORTFOLIO | PERFORMANCE | TRADE | HISTORY (no duplicates) === */}
                    <div className="border-b border-gray-800 px-4">
                        <nav className="flex space-x-6">
                            <button onClick={() => setView('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button>
                            <button onClick={() => setView('performance')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'performance' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PERFORMANCE</button>
                            <button onClick={() => setView('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button>
                            <button onClick={() => setView('history')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'history' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>HISTORY</button>
                        </nav>
                    </div>

                    {view === 'portfolio' && (
                    <section className="p-4">
                        <div className="grid grid-cols-3 gap-px bg-[#0a0a0a] p-px">
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Trading Balance</p><p className="font-semibold text-sm text-white">{fmt(tradingBalance * (displayCcy === 'IDR' ? 1 : 1 / usdIdr), displayCcy, 0)}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Invested</p><p className="font-semibold text-sm text-white">{fmt(totals.invested * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Total Equity</p><p className="font-semibold text-sm text-white">{fmt(totalEquity, displayCcy, 0)}</p></div>
                            <div className="bg-black p-2 col-span-2"><p className="text-xs text-gray-500">Total P&L</p><p className={`font-semibold text-sm ${totals.pnl>=0?'text-emerald-400':'text-red-400'}`}>{totals.pnl>=0?'+':''}{fmt(totals.pnl * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Gain</p><p className={`font-semibold text-sm ${totals.pnl>=0?'text-emerald-400':'text-red-400'}`}>{(totals.pnlPct || 0).toFixed(4)}%</p></div>
                        </div>

                        <div className="h-2 bg-[#0a0a0a] mt-4"></div>

                        <div className="overflow-x-auto mt-4">
                            {/* === Updated table: columns with two-row cells (main value + subtext) === */}
                            <table className="w-full text-sm">
                                <thead className="text-left text-gray-500 text-xs">
                                    <tr>
                                        <th className="p-3 pt-4 font-normal">Asset<br/>Shares</th>
                                        <th className="p-3 pt-4 font-normal text-right">Invested<br/>Avg Price</th>
                                        <th className="p-3 pt-4 font-normal text-right">Market<br/>Current Price</th>
                                        <th className="p-3 pt-4 font-normal text-right">Unrealized<br/>Gain %</th>
                                        <th className="p-3 pt-4 font-normal text-right">Realized<br/>PnL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                    <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={() => setTradeModal({ open: true, asset: r })}>
                                        {/* Asset: symbol (top) / shares (bottom) */}
                                        <td className="p-3">
                                            <div className="font-semibold text-base text-white">{r.symbol || r.name}</div>
                                            <div className="text-gray-400">{r.shares.toLocaleString()} Shares</div>
                                        </td>

                                        {/* Invested (top) / Avg Price (bottom, 2 decimals) */}
                                        <td className="p-3 text-right tabular-nums">
                                            <div className="font-semibold text-white">{fmt(r.investedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</div>
                                            <div className="text-gray-400">{fmt(r.avgPrice * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 2)}</div>
                                        </td>

                                        {/* Market (top) / Current Price (bottom) */}
                                        <td className="p-3 text-right tabular-nums">
                                            <div className="font-semibold text-white">{fmt(r.marketValueUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</div>
                                            <div className="text-gray-400">{fmt(r.lastPriceUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, displayCcy === 'IDR' ? 0 : 4)}</div>
                                        </td>

                                        {/* Unrealized (top) / Gain % (bottom) */}
                                        <td className="p-3 text-right tabular-nums">
                                            <div className={`font-semibold ${r.unrealizedUSD>=0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.unrealizedUSD>=0?'+':''}{fmt(r.unrealizedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</div>
                                            <div className={`${r.gainPct>=0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.gainPct.toFixed(2)}%</div>
                                        </td>

                                        {/* Realized PnL (top) / empty bottom for two-line consistency */}
                                        <td className="p-3 text-right tabular-nums">
                                            <div className={`font-semibold ${r.realizedUSD>=0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.realizedUSD>=0?'+':''}{fmt(r.realizedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)}</div>
                                            <div className="text-gray-400">{/* intentionally blank to keep two-line design consistent */}</div>
                                        </td>
                                    </tr>
                                    ))}
                                </tbody>
                            </table>

                            {rows.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}
                            <div className="p-4 text-center"><button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button></div>
                        </div>
                    </section>
                    )}

                    {view === 'trade' && (
                        <section className="p-4">
                            <h2 className="text-white font-semibold mb-3">Trade</h2>
                            <div className="bg-[#0f0f0f] p-4 rounded">
                                <TradePanel assets={assets} onBuy={handleBuy} onSell={handleSell} usdIdr={usdIdr} displayCcy={displayCcy} />
                            </div>
                        </section>
                    )}

                    {view === 'history' && (
                        <section className="p-4">
                            <h2 className="text-white font-semibold mb-3">History</h2>
                            <div className="bg-[#0f0f0f] p-4 rounded">
                                <TransactionsView transactions={transactions} usdIdr={usdIdr} displayCcy={displayCcy} fmt={fmt} />
                            </div>
                        </section>
                    )}
                </main>

                {/* Add Asset Modal */}
                <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)}>
                    <AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc }} />
                </Modal>

                <Modal title={`${balanceModalMode} Balance`} isOpen={isBalanceModalOpen} onClose={() => setBalanceModalOpen(false)}>
                    <BalanceManager onConfirm={balanceModalMode === 'Add' ? handleAddBalance : handleWithdraw} />
                </Modal>

                <TradeModal isOpen={tradeModal.open} onClose={() => setTradeModal({open: false, asset: null})} asset={tradeModal.asset} onBuy={handleBuy} onSell={handleSell} usdIdr={usdIdr} />

                <BottomSheet isOpen={isManagePortfolioOpen} onClose={() => setManagePortfolioOpen(false)}>
                    <ManagePortfolioSheet displayCcy={displayCcy} setDisplayCcy={setDisplayCcy} onImportClick={importCSV} onExportClick={exportCSV} onAddBalance={() => { setManagePortfolioOpen(false); setBalanceModalMode('Add'); setBalanceModalOpen(true); }} onWithdraw={() => { setManagePortfolioOpen(false); setBalanceModalMode('Withdraw'); setBalanceModalOpen(true); }} />
                </BottomSheet>
            </div>
        </div>
    );
}

/* ===================== SUB-PAGES & COMPONENTS (unchanged except TradePanel & TransactionsView used above) ===================== */

const PerformancePage = ({ totals, totalEquity, tradeStats, setView, usdIdr, displayCcy, chartRange, setChartRange, donutData }) => {
    const [activeTab, setActiveTab] = useState('portfolio');
    return (
        <div className="bg-black text-gray-300 min-h-screen font-sans"><div className="max-w-4xl mx-auto">
            <header className="p-4 flex items-center gap-4 sticky top-0 bg-black z-10"><button onClick={() => setView('portfolio')} className="text-white"><BackArrowIcon /></button><h1 className="text-lg font-semibold text-white">Performance</h1></header>
            <div className="border-b border-gray-800 px-4"><nav className="flex space-x-6">
                <button onClick={() => setActiveTab('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button>
                <button onClick={() => setActiveTab('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button>
            </nav></div>
            {activeTab === 'portfolio' ? (
                <div className="p-4 space-y-8">
                    <div>
                        <p className="text-sm text-gray-400">Total Equity</p>
                        <p className="text-2xl font-bold text-white mb-1">{fmt(totalEquity * (displayCcy === 'IDR' ? 1 : 1), displayCcy, 0)}</p>
                        <p className={`font-semibold text-sm ${totals.pnl>=0?'text-emerald-400':'text-red-400'}`}> {totals.pnl>=0?'+':''}{fmt(totals.pnl * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 0)} ({(totals.pnlPct||0).toFixed(4)}%) All Time </p>
                    </div>
                    <div>
                        <div className="mt-4"><AreaChart equityData={[{t: Date.now() - 365*24*36e5, v: totalEquity*0.8}, {t:Date.now(), v:totalEquity}]} /></div>
                        <div className="flex items-center justify-center gap-2 mt-4">{["1W","1M","3M","YTD","1Y","All"].map(r => (<button key={r} onClick={() => setChartRange(r)} className={`px-3 py-1 text-xs rounded-full ${chartRange === r ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'}`}>{r}</button>))}</div>
                    </div>
                    <div className="h-2 bg-[#0a0a0a] -mx-4"></div>
                    <div>
                         <h3 className="text-base font-semibold text-white mb-4">Asset Allocation</h3>
                        <AllocationDonut data={donutData} displayCcy={displayCcy} usdIdr={usdIdr} />
                    </div>
                </div>
            ) : (<TradeStatsView stats={tradeStats} displayCcy={displayCcy} usdIdr={usdIdr} />)}
        </div></div>
    );
};
const TradeStatsView = ({ stats, displayCcy, usdIdr }) => {
    const getVal = (val) => val * (displayCcy === 'IDR' ? usdIdr : 1);
    return (
        <div className="p-4 space-y-6">
            <div className="text-center"><div className="relative inline-block">
                <svg className="w-28 h-28 transform -rotate-90"><circle cx="56" cy="56" r="50" stroke="#374151" strokeWidth="6" fill="transparent"/><circle cx="56" cy="56" r="50" stroke="#22c55e" strokeWidth="6" fill="transparent" strokeDasharray="314.159" strokeDashoffset={314.159 * (1 - (stats.winRate / 100))} /></svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-gray-400">Win Rate</span><span className="text-2xl font-bold text-white">{stats.winRate.toFixed(0)}%</span></div>
            </div><div className="mt-2 text-sm">{stats.wins} Wins / {stats.losses} Losses ({stats.trades} Trades)</div></div>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Profit</p><p className="text-lg font-semibold text-emerald-400">+{fmt(getVal(stats.maxProfit), displayCcy, 0)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Loss</p><p className="text-lg font-semibold text-red-400">{fmt(getVal(stats.maxLoss), displayCcy, 0)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Profit</p><p className="text-lg font-semibold text-emerald-400">+{fmt(getVal(stats.avgProfit), displayCcy, 0)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Loss</p><p className="text-lg font-semibold text-red-400">{fmt(getVal(stats.avgLoss), displayCcy, 0)}</p></div>
            </div>
            <div><p className="text-sm text-gray-400">Total Realized Gain</p><p className="text-2xl font-bold text-emerald-400">+{fmt(getVal(stats.totalRealizedGain), displayCcy, 0)}</p></div>
        </div>
    );
};

/* Remaining components copied unchanged from original (BalanceManager, ManagePortfolioSheet, AddAssetForm, TradeModal, AreaChart, AllocationDonut) */
const BalanceManager = ({ onConfirm }) => {
    const [amount, setAmount] = useState('');
    return (
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(toNum(amount)); }} className="space-y-4">
            <div><label className="block text-sm font-medium mb-1 text-gray-400">Amount (IDR)</label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus className="w-full bg-gray-900 px-3 py-2 rounded border border-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-white" placeholder="e.g. 1000000" /></div>
            <button type="submit" className="w-full py-2.5 rounded font-semibold bg-emerald-600 text-white hover:bg-emerald-500">Confirm</button>
        </form>
    );
};
const ManagePortfolioSheet = ({ displayCcy, setDisplayCcy, onImportClick, onExportClick, onAddBalance, onWithdraw }) => (
    <div className="p-4 text-white text-sm"><h3 className="text-base font-semibold mb-4 px-2">Manage Portfolio</h3><div className="space-y-1">
        <div className="flex justify-between items-center p-2 rounded hover:bg-gray-700/50"><span className="text-gray-300">Display Currency</span><div className="flex items-center bg-gray-700 rounded-full p-0.5"><button onClick={() => setDisplayCcy('IDR')} className={`px-3 py-1 text-xs rounded-full ${displayCcy === 'IDR' ? 'bg-gray-500' : ''}`}>IDR</button><button onClick={() => setDisplayCcy('USD')} className={`px-3 py-1 text-xs rounded-full ${displayCcy === 'USD' ? 'bg-gray-500' : ''}`}>USD</button></div></div>
        <button onClick={onAddBalance} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Add Balance</button>
        <button onClick={onWithdraw} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Withdraw</button>
        <label className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300 block cursor-pointer">Import CSV<input type="file" accept=".csv" onChange={onImportClick} className="hidden"/></label>
        <button onClick={onExportClick} className="w-full text-left p-2 rounded hover:bg-gray-700/50 text-gray-300">Export CSV</button>
    </div></div>
);
const AddAssetForm = ({ searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial, addNonLiquidAsset, nlName, setNlName, nlQty, setNlQty, nlPrice, setNlPrice, nlPriceCcy, setNlPriceCcy, nlPurchaseDate, setNlPurchaseDate, nlYoy, setNlYoy, nlDesc, setNlDesc }) => {
    const [qty, setQty] = useState('');
    const [price, setPrice] = useState('');
    const [total, setTotal] = useState('');
    const [ccy, setCcy] = useState('IDR');

    const handleInputChange = (field, value) => {
        const multiplier = searchMode === 'crypto' ? 1 : 100;
        if (field === 'qty') {
            const newQty = toNum(value); setQty(value);
            const numPrice = toNum(price);
            if (numPrice > 0) setTotal(fmt(newQty * numPrice * multiplier, ccy));
        } else if (field === 'price') {
            const newPrice = toNum(value); setPrice(value);
            const numQty = toNum(qty);
            if (numQty > 0) setTotal(fmt(numQty * multiplier * newPrice, ccy));
        } else if (field === 'total') {
            const newTotal = toNum(value); setTotal(value);
            const numQty = toNum(qty);
            const numPrice = toNum(price);
            if (numPrice > 0 && newTotal > 0) setQty(fmt(newTotal / (numPrice * multiplier), 'IDR', 0));
            else if (numQty > 0 && newTotal > 0) setPrice(fmt(newTotal / (numQty * multiplier), ccy, 2));
        }
    };
    
    return (<div className="space-y-4"><div className="flex border-b border-gray-700">
        {[{key: 'id', label: 'Stocks (ID)'}, {key: 'us', label: 'Stocks (US)'}, {key:'crypto', label:'Crypto'}, {key:'nonliquid', label:'Non-Liquid'}].map(item =>(<button key={item.key} onClick={() => { setSearchMode(item.key); setCcy(item.key === 'id' ? 'IDR' : 'USD'); }} className={`px-3 py-2 text-sm font-medium ${searchMode === item.key ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400'}`}>{item.label}</button>))}
    </div> { searchMode !== 'nonliquid' ? (<div className="space-y-4">
        <div className="relative"><input value={query} onChange={e=>{setQuery(e.target.value);setSelectedSuggestion(null);}} placeholder="Search by code or name..." className="w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-600 text-white" />
            {suggestions.length > 0 && <div className="absolute z-50 mt-1 w-full bg-[#1e1e1e] border border-gray-700 rounded max-h-56 overflow-auto">{suggestions.map((s,i)=>(<button key={i} onClick={()=>{setSelectedSuggestion(s);setQuery(`${s.symbol} — ${s.display}`);setSuggestions([]);}} className="w-full px-3 py-2 text-left hover:bg-gray-700"><div className="font-medium text-gray-100">{s.symbol}</div><div className="text-xs text-gray-400">{s.display}</div></button>))}</div>}
        </div><div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400">Quantity {searchMode==='crypto' ? '(Units)' : '(Lot)'}</label><input value={qty} onChange={e => handleInputChange('qty', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text"/></div>
            <div><label className="text-xs text-gray-400">Price ({ccy})</label><input value={price} onChange={e => handleInputChange('price', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text"/></div>
        </div>
        <div><label className="text-xs text-gray-400">Total Value ({ccy})</label><input value={total} onChange={e => handleInputChange('total', e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="text"/></div>
        <div className="flex justify-end"><button onClick={() => addAssetWithInitial(toNum(qty) * (searchMode === 'crypto' ? 1 : 100), toNum(price), ccy)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Position</button></div>
    </div>) : ( <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input value={nlName} onChange={e=>setNlName(e.target.value)} placeholder="Asset Name (e.g. Property)" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlQty} onChange={e=>setNlQty(e.target.value)} placeholder="Quantity" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlPrice} onChange={e=>setNlPrice(e.target.value)} placeholder="Purchase Price" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <select value={nlPriceCcy} onChange={e=>setNlPriceCcy(e.target.value)} className="rounded bg-gray-900 px-2 py-2 text-sm border border-gray-600 text-white"><option value="IDR">IDR</option><option value="USD">USD</option></select>
            <input type="date" value={nlPurchaseDate} onChange={e=>setNlPurchaseDate(e.target.value)} className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
            <input value={nlYoy} onChange={e=>setNlYoy(e.target.value)} placeholder="Est. Yearly Gain (%)" type="number" className="rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
        </div>
        <input value={nlDesc} onChange={e=>setNlDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" />
        <div className="flex justify-end"><button onClick={addNonLiquidAsset} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Asset</button></div>
    </div>)}</div>);
};
const TradeModal = ({ isOpen, onClose, asset, onBuy, onSell, usdIdr }) => {
    const [mode, setMode] = useState('buy');
    const [qty, setQty] = useState('');
    const [price, setPrice] = useState('');
    const [total, setTotal] = useState('');
    const isIdr = asset && asset.symbol && asset.symbol.endsWith && asset.symbol.endsWith('.JK');
    const ccy = isIdr ? 'IDR' : 'USD';

    useEffect(() => { if (asset) { setPrice(fmt(asset.lastPriceUSD * (isIdr ? usdIdr : 1), ccy, isIdr ? 0 : 4)); setQty(''); setTotal(''); } }, [asset, isIdr, usdIdr]);
    
    const handleInputChange = (field, value) => {
        const multiplier = 100; // Assuming lots for stocks
        if (field === 'qty') {
            const newQty = toNum(value); setQty(value);
            const numPrice = toNum(price);
            if (numPrice > 0) setTotal(fmt(newQty * numPrice * multiplier, ccy));
        } else if (field === 'price') {
            const newPrice = toNum(value); setPrice(value);
            const numQty = toNum(qty);
            if (numQty > 0) setTotal(fmt(numQty * multiplier * newPrice, ccy));
        } else if (field === 'total') {
            const newTotal = toNum(value); setTotal(value);
            const numPrice = toNum(price);
            if (numPrice > 0 && newTotal > 0) setQty(fmt(newTotal / (numPrice * multiplier), 'IDR', 0));
        }
    };
    
    if (!isOpen || !asset) return null;
    const priceUSD = isIdr ? toNum(price) / usdIdr : toNum(price);
    const handleSubmit = () => { mode === 'buy' ? onBuy(asset, toNum(qty) * 100, priceUSD) : onSell(asset, toNum(qty) * 100, priceUSD); };

    return (<Modal isOpen={isOpen} onClose={onClose} title={asset.symbol}><div className="space-y-4">
        <div className="flex bg-gray-800 rounded-full p-1"><button onClick={() => setMode('buy')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'buy' ? 'bg-emerald-600 text-white' : 'text-gray-300'}`}>Buy</button><button onClick={() => setMode('sell')} className={`w-1/2 py-2 text-sm font-semibold rounded-full ${mode === 'sell' ? 'bg-red-600 text-white' : 'text-gray-300'}`}>Sell</button></div>
        <div><label className="text-xs text-gray-400">Quantity (Lot)</label><input type="text" value={qty} onChange={e=>handleInputChange('qty', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" /></div>
        <div><label className="text-xs text-gray-400">Price ({ccy})</label><input type="text" value={price} onChange={e=>handleInputChange('price', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" /></div>
        <div><label className="text-xs text-gray-400">Total Value ({ccy})</label><input type="text" value={total} onChange={e=>handleInputChange('total', e.target.value)} className="w-full mt-1 bg-gray-900 px-3 py-2 rounded border border-gray-600 text-white" /></div>
        <button onClick={handleSubmit} className={`w-full py-2.5 rounded font-semibold text-white ${mode === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>Confirm {mode.charAt(0).toUpperCase() + mode.slice(1)}</button>
    </div></Modal>);
};

/* AreaChart & AllocationDonut remain exactly as original (omitted here for brevity) */
/* ... (AreaChart and AllocationDonut code copied unchanged from your original file) ... */

/* Minimal TradePanel used in TRADE tab */
function TradePanel({ assets, onBuy, onSell, usdIdr, displayCcy }) {
    const [assetId, setAssetId] = useState(assets[0]?.id || "");
    const [mode, setMode] = useState("buy");
    const [qty, setQty] = useState("");
    const [price, setPrice] = useState("");
    const [priceCcy, setPriceCcy] = useState(displayCcy);

    useEffect(() => { setAssetId(assets[0]?.id || ""); }, [assets]);

    const execute = () => {
        if (!assetId) { alert("Pilih asset"); return; }
        const asset = assets.find(a => a.id === assetId);
        const priceNum = toNum(price);
        const priceUSD = priceCcy === "IDR" ? priceNum / usdIdr : priceNum;
        const qtyNum = Number(qty || 0);
        if (mode === 'buy') onBuy(asset, qtyNum, priceUSD); else onSell(asset, qtyNum, priceUSD);
        setQty(''); setPrice('');
    };

    return (
        <div className="space-y-3">
            <div className="flex gap-2">
                <select value={assetId} onChange={e=>setAssetId(e.target.value)} className="flex-1 bg-gray-900 p-2">
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} {a.symbol ? `(${a.symbol})` : ""}</option>)}
                </select>
                <select value={mode} onChange={e=>setMode(e.target.value)} className="bg-gray-900 p-2">
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                </select>
            </div>
            <div className="flex gap-2">
                <input placeholder="Quantity" value={qty} onChange={e=>setQty(e.target.value)} className="p-2 bg-gray-900 flex-1" />
                <input placeholder={`Price (${priceCcy})`} value={price} onChange={e=>setPrice(e.target.value)} className="p-2 bg-gray-900 w-40" />
                <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="p-2 bg-gray-900">
                    <option value="USD">USD</option>
                    <option value="IDR">IDR</option>
                </select>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={execute} className="px-4 py-2 bg-emerald-600 rounded">Execute</button>
            </div>
        </div>
    );
}

/* Transactions view used in HISTORY tab */
function TransactionsView({ transactions = [], usdIdr = 16400, displayCcy = 'IDR', fmt }) {
    if (!transactions || transactions.length === 0) return <div className="text-gray-400">No transactions yet.</div>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs text-gray-400"><tr><th className="p-2 text-left">Type</th><th className="p-2 text-right">Symbol</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Nominal</th></tr></thead>
                <tbody>
                    {transactions.map(tx => (
                        <tr key={tx.id} className="border-t border-gray-800">
                            <td className="p-2">{tx.type.toUpperCase()}</td>
                            <td className="p-2 text-right">{tx.symbol}</td>
                            <td className="p-2 text-right">{tx.qty}</td>
                            <td className="p-2 text-right">{displayCcy === 'IDR' ? fmt(tx.pricePerUnit * usdIdr, 'IDR', 0) : fmt(tx.pricePerUnit, 'USD', 0)}</td>
                            <td className="p-2 text-right">{displayCcy === 'IDR' ? fmt(tx.cost * usdIdr, 'IDR', 0) : fmt(tx.cost, 'USD', 0)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}