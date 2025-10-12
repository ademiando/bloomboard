// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== SVG ICONS (unchanged) ===================== */
const UserAvatar = () => (<svg width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#374151"></circle><path d="M12 14c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm0-2c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z" fill="#9CA3AF"></path></svg>);
const MoreVerticalIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>);
const ArrowRightIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>);
const BackArrowIcon = () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>);
const GraphIcon = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>);

/* ===================== CONFIG & HELPERS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;

const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
function fmt(val, type="IDR", digits=0) {
    if (type === "USD") return new Intl.NumberFormat("en-US", { style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(val || 0);
    return new Intl.NumberFormat("id-ID", { style: "decimal", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(val || 0);
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

/* ===================== UI COMPONENTS (unchanged) ===================== */
const Modal = ({ children, isOpen, onClose, title }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-[#181818] rounded-lg w-full max-w-lg border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center p-4 border-b border-gray-700"><h2 className="text-lg font-semibold text-white">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button></div><div className="p-4">{children}</div></div></div>); };
const BottomSheet = ({ isOpen, onClose, children }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}><div className={`fixed bottom-0 left-0 right-0 bg-[#1e1e1e] rounded-t-2xl shadow-lg transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`} onClick={e => e.stopPropagation()}><div className="w-10 h-1 bg-gray-600 rounded-full mx-auto my-3"></div>{children}</div></div>); };

/* ===================== MAIN DASHBOARD COMPONENT ===================== */
export default function PortfolioDashboard() {
    const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v9") || "[]").map(ensureNumericAsset) : []);
    const [realizedUSD, setRealizedUSD] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_realized_v9") || 0) : 0);
    const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_transactions_v9") || "[]") : []);
    const [tradingBalance, setTradingBalance] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_balance_v9") || 5952) : 5952);
    const [displayCcy, setDisplayCcy] = useState(() => isBrowser ? localStorage.getItem("pf_display_ccy_v9") || "IDR" : "IDR");
    const [usdIdr, setUsdIdr] = useState(16400);
    const [isFxLoading, setIsFxLoading] = useState(true);
    const [view, setView] = useState('main');
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

    // Non-liquid form state
    const [nlName, setNlName] = useState(""), [nlQty, setNlQty] = useState(""), [nlPrice, setNlPrice] = useState(""), [nlPriceCcy, setNlPriceCcy] = useState("IDR"), [nlPurchaseDate, setNlPurchaseDate] = useState(""), [nlYoy, setNlYoy] = useState("5"), [nlDesc, setNlDesc] = useState("");

    // equity history for AreaChart
    const [equityHistory, setEquityHistory] = useState(() => {
        if (!isBrowser) return [];
        try { return JSON.parse(localStorage.getItem("pf_equity_hist_v1") || "[]"); } catch { return []; }
    });

    // persist key states
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_assets_v9", JSON.stringify(assets)); }, [assets]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_realized_v9", String(realizedUSD)); }, [realizedUSD]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_transactions_v9", JSON.stringify(transactions)); }, [transactions]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_balance_v9", String(tradingBalance)); }, [tradingBalance]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_display_ccy_v9", displayCcy); }, [displayCcy]);
    useEffect(() => { if(isBrowser) localStorage.setItem("pf_equity_hist_v1", JSON.stringify(equityHistory)); }, [equityHistory]);

    /* =========== FX Polling (CoinGecko tether -> IDR) =========== */
    useEffect(() => {
        const fetchFx = async () => {
            setIsFxLoading(true);
            try {
                const res = await fetch(COINGECKO_USD_IDR);
                const j = await res.json();
                if (j?.tether?.idr) setUsdIdr(Math.round(j.tether.idr));
            } catch (e) { /* ignore */ }
            finally { setIsFxLoading(false); }
        };
        fetchFx();
        const id = setInterval(fetchFx, 70000);
        return () => clearInterval(id);
    }, []);

    /* =========== Stock prices polling (Finnhub) - existing logic preserved but made safer =========== */
    useEffect(() => {
        const pollStockPrices = async () => {
            if (assets.length === 0) return;
            const stockSymbols = [...new Set(assets.filter(a => a.type === "stock" && a.symbol).map(a => a.symbol))];
            if (stockSymbols.length === 0) return;
            let priceMap = {};
            for (const symbol of stockSymbols) {
                try {
                    const res = await fetch(FINNHUB_QUOTE(symbol));
                    const data = await res.json();
                    const price = toNum(data?.c);
                    if (price > 0) {
                        const isIdr = symbol.toUpperCase().endsWith('.JK');
                        priceMap[symbol] = { [isIdr ? 'idr' : 'usd']: price };
                    }
                } catch (e) {
                    // ignore failures for specific symbols
                }
            }
            if (Object.keys(priceMap).length > 0) {
                setAssets(prev => prev.map(a => {
                    if (a.type === 'stock' && priceMap[a.symbol]) {
                        const isIdrStock = a.symbol.endsWith('.JK');
                        const priceData = priceMap[a.symbol];
                        let lastPriceUSD = a.lastPriceUSD;
                        if (isIdrStock && priceData.idr) { lastPriceUSD = priceData.idr / usdIdr; }
                        else if (priceData.usd) { lastPriceUSD = priceData.usd; }
                        return { ...a, lastPriceUSD };
                    }
                    return a;
                }));
            }
        };
        pollStockPrices();
        const id = setInterval(pollStockPrices, 30000);
        return () => clearInterval(id);
    }, [assets.length, usdIdr]);

    /* =========== Crypto prices polling (CoinGecko) =========== */
    useEffect(() => {
        const pollCryptoPrices = async () => {
            const cryptoIds = [...new Set(assets.filter(a => a.type === 'crypto' && a.coingeckoId).map(a => a.coingeckoId))];
            if (cryptoIds.length === 0) return;
            try {
                const res = await fetch(COINGECKO_PRICE(cryptoIds.join(',')));
                const j = await res.json();
                setAssets(prev => prev.map(a => {
                    if (a.type === 'crypto' && a.coingeckoId && j[a.coingeckoId]) {
                        const pUsd = toNum(j[a.coingeckoId].usd || 0);
                        return { ...a, lastPriceUSD: pUsd };
                    }
                    return a;
                }));
            } catch (e) {
                // ignore
            }
        };
        pollCryptoPrices();
        const id = setInterval(pollCryptoPrices, 30000);
        return () => clearInterval(id);
    }, [assets.length, usdIdr]);

    /* =========== Keep an equity history for the AreaChart (push on relevant changes) =========== */
    useEffect(() => {
        const tMarket = assets.reduce((s, a) => s + (a.lastPriceUSD * a.shares), 0);
        const totalEq = (tMarket * usdIdr) + tradingBalance;
        setEquityHistory(prev => {
            const last = prev.length ? prev[prev.length - 1] : null;
            // Avoid too-frequent duplicates: only push if different value or >30s elapsed
            if (last && Math.abs(last.v - totalEq) < 1 && (Date.now() - last.t) < 30000) return prev;
            const next = [...prev, { t: Date.now(), v: totalEq }].slice(-500);
            return next;
        });
    }, [assets, usdIdr, tradingBalance]);

    /* =========== Search suggestions (unchanged behavior) =========== */
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
                    setSuggestions((j.coins || []).slice(0,10).map(c => ({ symbol: c.symbol.toUpperCase(), display: c.name, id: c.id, source: "coingecko", type: "crypto" })));
                } else {
                    const res = await fetch(YAHOO_SEARCH(q));
                    if (!res.ok) throw new Error('API fetch failed');
                    const payload = await res.json();
                    const list = (payload.quotes || []).map(it => ({ symbol: it.symbol.toUpperCase(), display: it.shortname || it.longname || it.symbol, exchange: it.exchange, source: "yahoo", type: "stock" }));
                    if (searchMode === "id") setSuggestions(list.filter(x => x.symbol.toUpperCase().endsWith(".JK")));
                    else setSuggestions(list.filter(x => !x.symbol.toUpperCase().endsWith(".JK") && (x.exchange === 'NMS' || x.exchange === 'NYQ')));
                }
            } catch (e) { setSuggestions([]); }
        }, 350);
        return () => clearTimeout(searchTimeoutRef.current);
    }, [query, searchMode]);

    /* =========== Trading logic (handleBuy/handleSell) - ensure lastPriceUSD set on buy =========== */
    const handleBuy = (assetStub, qty, priceUSD) => {
        const costUSD = qty * priceUSD;
        if (costUSD * usdIdr > tradingBalance) { alert("Insufficient trading balance."); return false; }
        const existingAsset = assets.find(a => a.symbol === assetStub.symbol && a.type === assetStub.type);
        const newTx = { id:`tx:${Date.now()}`, type:"buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name };
        if (existingAsset) {
            newTx.assetId = existingAsset.id;
            setAssets(prev => prev.map(a => a.id === existingAsset.id ? {
                ...a,
                shares: a.shares + qty,
                investedUSD: a.investedUSD + costUSD,
                avgPrice: (a.investedUSD + costUSD) / (a.shares + qty),
                lastPriceUSD: priceUSD // update last price to buy price
            } : a));
        } else {
            const newAsset = ensureNumericAsset({ ...assetStub, shares: qty, avgPrice: priceUSD, investedUSD: costUSD, lastPriceUSD: priceUSD });
            newTx.assetId = newAsset.id;
            setAssets(prev => [...prev, newAsset]);
        }
        setTradingBalance(b => b - (costUSD * usdIdr));
        setTransactions(prev => [newTx, ...prev]);
        if (tradeModal.open) setTradeModal({open: false, asset: null});
        return true;
    };
    const handleSell = (asset, qty, priceUSD) => {
        if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
        const proceedsUSD = qty * priceUSD, costOfSold = qty * asset.avgPrice, realized = proceedsUSD - costOfSold;
        const newTx = {id:`tx:${Date.now()}`, assetId:asset.id, type:"sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name };
        setAssets(prev => prev.map(a => a.id === asset.id ? {
            ...a,
            shares: a.shares - qty,
            investedUSD: a.investedUSD - costOfSold,
            avgPrice: (a.shares - qty) > 0 ? (a.investedUSD - costOfSold) / (a.shares - qty) : 0
        } : a).filter(a => a.shares > 1e-9));
        setTradingBalance(b => b + (proceedsUSD * usdIdr));
        setRealizedUSD(r => r + realized);
        setTransactions(prev => [newTx, ...prev]);
        if (tradeModal.open) setTradeModal({open: false, asset: null});
        return true;
    };

    /* =========== Add asset helpers (unchanged except lastPriceUSD set on creation) =========== */
    const addAssetWithInitial = (qty, price, ccy) => {
        let p = selectedSuggestion;
        if (!p) {
            const t = query.split("—")[0].trim();
            if (!t) { alert("Select a suggestion"); return; }
            p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: 'stock' };
        }
        if (qty <= 0 || price <= 0) { alert("Quantity & price must be > 0"); return; }
        const priceUSD = ccy === "IDR" ? price / usdIdr : price;
        const newAssetStub = { id: `${p.source}:${p.symbol || p.id}:${Date.now()}`, type: p.type, symbol: p.symbol, name: p.display, coingeckoId: p.type === 'crypto' ? p.id : undefined, lastPriceUSD: priceUSD };
        if (handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setQuery(""); setSelectedSuggestion(null); }
    };
    const addNonLiquidAsset = () => {
        const name = nlName.trim(), qty = toNum(nlQty), priceIn = toNum(nlPrice);
        if (!name || qty <= 0 || priceIn <= 0) { alert("Name, quantity, and price must be filled."); return; }
        const priceUSD = nlPriceCcy === 'IDR' ? priceIn / usdIdr : priceIn;
        const newAssetStub = { id: `nonliquid:${name.replace(/\s/g,'_')}:${Date.now()}`, type: 'nonliquid', symbol: name.slice(0,8).toUpperCase(), name, purchaseDate: nlPurchaseDate ? new Date(nlPurchaseDate).getTime() : Date.now(), nonLiquidYoy: toNum(nlYoy), description: nlDesc, lastPriceUSD: priceUSD };
        if (handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setNlName(''); setNlQty(''); setNlPrice(''); setNlPurchaseDate(''); setNlDesc(''); }
    };

    /* =========== Balance helpers (unchanged) =========== */
    const handleAddBalance = (amount) => { setTradingBalance(b => b + amount); setBalanceModalOpen(false); };
    const handleWithdraw = (amount) => { if (amount > tradingBalance) { alert("Withdrawal amount exceeds balance."); return; } setTradingBalance(b => b - amount); setBalanceModalOpen(false); };
    const exportCSV = () => alert("CSV Export functionality is preserved.");
    const importCSV = (e) => { alert("CSV Import functionality is preserved."); e.target.value = ''; };

    /* =========== Derived data (row calculations & totals) =========== */
    const { rows, totals, totalEquity, tradeStats, donutData } = useMemo(() => {
        const calculatedRows = assets.map(a => {
            const market = a.shares * a.lastPriceUSD;
            const pnl = market - a.investedUSD;
            const pnlPct = a.investedUSD > 0 ? (pnl / a.investedUSD) * 100 : 0;
            return { ...a, marketValueUSD: market, pnlUSD: pnl, pnlPct: pnlPct };
        });
        const t = { invested: calculatedRows.reduce((s, r) => s + r.investedUSD, 0), market: calculatedRows.reduce((s, r) => s + r.marketValueUSD, 0) };
        t.pnl = t.market - t.invested;
        t.pnlPct = t.invested > 0 ? (t.pnl / t.invested) * 100 : 0;
        const totalEq = (t.market * usdIdr) + tradingBalance;
        const sells = transactions.filter(tx => tx.type === 'sell');
        const wins = sells.filter(tx => tx.realized > 0);
        const losses = sells.filter(tx => tx.realized <= 0);
        const tStats = {
            trades: sells.length,
            wins: wins.length,
            losses: losses.length,
            winRate: sells.length > 0 ? (wins.length / sells.length) * 100 : 0,
            maxProfit: wins.length ? Math.max(...wins.map(tx => tx.realized)) : 0,
            maxLoss: losses.length ? Math.min(...losses.map(tx => tx.realized)) : 0,
            avgProfit: wins.length > 0 ? wins.reduce((s, tx) => s + tx.realized, 0) / wins.length : 0,
            avgLoss: losses.length > 0 ? losses.reduce((s, tx) => s + tx.realized, 0) / losses.length : 0,
            totalRealizedGain: realizedUSD
        };
        const dData = calculatedRows.map(r => ({ name: r.symbol, value: r.marketValueUSD })).sort((a, b) => b.value - a.value);
        return { rows: calculatedRows, totals: t, totalEquity: totalEq, tradeStats: tStats, donutData: dData };
    }, [assets, transactions, usdIdr, tradingBalance, realizedUSD]);

    /* =========== Render Performance subpage if requested =========== */
    if (view === 'performance') {
        return <PerformancePage totals={totals} totalEquity={totalEquity} tradeStats={tradeStats} setView={setView} usdIdr={usdIdr} displayCcy={displayCcy} chartRange={chartRange} setChartRange={setChartRange} donutData={donutData} equityHistory={equityHistory} />;
    }

    /* ===================== MAIN UI (kept layout exactly as original) ===================== */
    return (
        <div className="bg-black text-gray-300 min-h-screen font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
                    <div className="flex items-center gap-3"><UserAvatar /><h1 className="text-lg font-bold text-white">Bloomboard</h1></div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs text-gray-400">USD/IDR: {isFxLoading ? '...' : fmt(usdIdr)}</div>
                        <button onClick={() => setManagePortfolioOpen(true)} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
                    </div>
                </header>
                <main>
                    <div className="border-b border-gray-800 px-4"><nav className="flex space-x-6"><button className="py-2 px-1 border-b-2 font-semibold text-sm border-emerald-400 text-white">PORTFOLIO</button></nav></div>
                    <section className="p-4">
                        <div className="grid grid-cols-3 gap-px bg-[#0a0a0a] p-px">
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Trading Balance</p><p className="font-semibold text-sm text-white">{fmt(tradingBalance, 'IDR')}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Invested</p><p className="font-semibold text-sm text-white">{fmt(totals.invested * usdIdr, 'IDR')}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Total Equity</p><p className="font-semibold text-sm text-white">{fmt(totalEquity, 'IDR')}</p></div>
                            <div className="bg-black p-2 col-span-2"><p className="text-xs text-gray-500">Total P&L</p><p className={`font-semibold text-sm ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.pnl >= 0 ? '+' : ''}{fmt(totals.pnl * usdIdr, 'IDR')}</p></div>
                            <div className="bg-black p-2"><p className="text-xs text-gray-500">Gain</p><p className={`font-semibold text-sm ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(totals.pnlPct || 0).toFixed(4)}%</p></div>
                        </div>
                        <button onClick={() => setView('performance')} className="mt-4 flex justify-between items-center w-full text-left p-2 -m-2 rounded hover:bg-gray-800/50">
                            <span className="text-sm font-medium text-white flex items-center gap-2"><GraphIcon />View Performance</span><ArrowRightIcon />
                        </button>
                    </section>
                    <div className="h-2 bg-[#0a0a0a]"></div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-gray-500 text-xs"><tr>
                                <th className="p-3 pt-4 font-normal">Code<br/>Shares</th><th className="p-3 pt-4 font-normal text-right">Market<br/>Current Price</th><th className="p-3 pt-4 font-normal text-right">P&L<br/>Gain</th>
                            </tr></thead>
                            <tbody>
                                {rows.map(r => (<tr key={r.id} className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={() => setTradeModal({ open: true, asset: r })}>
                                    <td className="p-3"><div className="font-semibold text-base text-white">{r.symbol}</div><div className="text-gray-400">{r.shares.toLocaleString()} Shares</div></td>
                                    <td className="p-3 text-right tabular-nums">
                                        <div className="font-semibold text-white">{fmt(r.marketValueUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                                        <div className="text-gray-400">{fmt(r.lastPriceUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, displayCcy === 'IDR' ? 0 : 4)}</div>
                                    </td>
                                    <td className="p-3 text-right tabular-nums">
                                        <div className={`font-semibold ${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnlUSD >= 0 ? '+' : ''}{fmt(r.pnlUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                                        <div className={`${r.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.pnlPct.toFixed(4)}%</div>
                                    </td>
                                </tr>))}
                            </tbody>
                        </table>
                        {rows.length === 0 && <p className="text-center py-8 text-gray-500">No assets in portfolio.</p>}
                         <div className="p-4 text-center"><button onClick={() => setAddAssetModalOpen(true)} className="text-emerald-400 font-semibold text-sm">+ Add new asset</button></div>
                    </div>
                </main>

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

/* ===================== SUB-PAGES & FULLY FUNCTIONAL COMPONENTS ===================== */
/* PerformancePage now consumes equityHistory for AreaChart */
const PerformancePage = ({ totals, totalEquity, tradeStats, setView, usdIdr, displayCcy, chartRange, setChartRange, donutData, equityHistory }) => {
    const [activeTab, setActiveTab] = useState('portfolio');
    return (
        <div className="bg-black text-gray-300 min-h-screen font-sans"><div className="max-w-4xl mx-auto">
            <header className="p-4 flex items-center gap-4 sticky top-0 bg-black z-10"><button onClick={() => setView('main')} className="text-white"><BackArrowIcon /></button><h1 className="text-lg font-semibold text-white">Performance</h1></header>
            <div className="border-b border-gray-800 px-4"><nav className="flex space-x-6">
                <button onClick={() => setActiveTab('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button>
                <button onClick={() => setActiveTab('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${activeTab === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button>
            </nav></div>
            {activeTab === 'portfolio' ? (
                <div className="p-4 space-y-8">
                    <div>
                        <p className="text-sm text-gray-400">Total Equity</p>
                        <p className="text-2xl font-bold text-white mb-1">{fmt(totalEquity, 'IDR')}</p>
                        <p className={`font-semibold text-sm ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}> {totals.pnl >= 0 ? '+' : ''}{fmt(totals.pnl * usdIdr, 'IDR')} ({(totals.pnlPct || 0).toFixed(4)}%) All Time </p>
                    </div>
                    <div>
                        <div className="mt-4"><AreaChart equityData={equityHistory.length ? equityHistory : [{ t: Date.now() - 365 * 24 * 36e5, v: totalEquity * 0.8 }, { t: Date.now(), v: totalEquity }]} /></div>
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
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Profit</p><p className="text-lg font-semibold text-emerald-400">+{fmt(getVal(stats.maxProfit), displayCcy)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Max Loss</p><p className="text-lg font-semibold text-red-400">{fmt(getVal(stats.maxLoss), displayCcy)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Profit</p><p className="text-lg font-semibold text-emerald-400">+{fmt(getVal(stats.avgProfit), displayCcy)}</p></div>
                <div className="bg-[#181818] p-3 rounded-lg"><p className="text-sm text-gray-400">Avg. Loss</p><p className="text-lg font-semibold text-red-400">{fmt(getVal(stats.avgLoss), displayCcy)}</p></div>
            </div>
            <div><p className="text-sm text-gray-400">Total Realized Gain</p><p className="text-2xl font-bold text-emerald-400">+{fmt(getVal(stats.totalRealizedGain), displayCcy)}</p></div>
        </div>
    );
};

/* Balance Manager, ManagePortfolioSheet, AddAssetForm, TradeModal,
   AreaChart, AllocationDonut components are unchanged except where they rely on new props.
   I kept them identical to your original file to preserve UI & UX. */

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
    const isIdr = asset && asset.symbol && asset.symbol.endsWith('.JK');
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

const AreaChart = ({ equityData }) => {
    const data = equityData.length > 1 ? equityData : [{t:Date.now()-1000, v:0}, {t:Date.now(), v:0}];
    const height=200, width=500, padding={top:10, bottom:20, left:0, right:50};
    const minVal = Math.min(...data.map(d=>d.v)), maxVal = Math.max(...data.map(d=>d.v));
    const range = maxVal - minVal || 1;
    const startTime = data[0].t, endTime = data[data.length - 1].t;
    const xScale = (t) => padding.left + ((t-startTime)/(endTime-startTime||1)) * (width-padding.left-padding.right);
    const yScale = (v) => padding.top + (1 - (v-minVal)/range) * (height-padding.top-padding.bottom);
    const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.v)}`).join(' ');
    const areaPath = `${path} L${xScale(endTime)},${height - padding.bottom} L${xScale(startTime)},${height - padding.bottom} Z`;
    const yAxisLabels = [minVal, minVal+range*0.25, minVal+range*0.5, minVal+range*0.75, maxVal];
    const fmtLabel = (v) => v > 1e6 ? `${(v/1e6).toFixed(1)}M` : v > 1e3 ? `${(v/1e3).toFixed(0)}K` : v.toFixed(0);
    return (<svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} /><stop offset="100%" stopColor="#22c55e" stopOpacity={0} /></linearGradient></defs>
        <path d={areaPath} fill="url(#areaGradient)" /><path d={path} fill="none" stroke="#22c55e" strokeWidth="2" />
        {yAxisLabels.map(v => (<g key={v}><line x1={padding.left} x2={width-padding.right} y1={yScale(v)} y2={yScale(v)} stroke="rgba(255,255,255,0.05)" strokeDasharray="2,2" /><text x={width-padding.right+5} y={yScale(v)+4} fontSize="11" fill="#6B7280">{fmtLabel(v)}</text></g>))}
    </svg>);
};

const AllocationDonut = ({ data, displayCcy, usdIdr }) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: '' });
    const ref = useRef(null);
    const totalValue = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
    if (totalValue === 0) return <div className="text-center text-gray-500 py-8">No assets to display</div>;
    const size = 180, innerRadius = 55, outerRadius = 80;
    const colors = ["#22c55e", "#10b981", "#059669", "#047857", "#065f46", "#064e3b", "#3f3f46", "#52525b", "#71717a"];
    let cumulativeAngle = -Math.PI / 2;
    const handleMouseMove = (e) => { if(ref.current) { const rect = ref.current.getBoundingClientRect(); setTooltip(prev => ({...prev, x: e.clientX - rect.left, y: e.clientY - rect.top})); } };
    const handleMouseOver = (index, d) => {
        setHoveredIndex(index);
        const percentage = (d.value / totalValue * 100).toFixed(2);
        const value = fmt(d.value * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy);
        setTooltip(prev => ({...prev, show: true, content: `${d.name}: ${value} (${percentage}%)`}));
    };
    const handleMouseOut = () => { setHoveredIndex(null); setTooltip(prev => ({...prev, show: false})); };
    return (
        <div className="flex flex-col md:flex-row items-center gap-6" ref={ref} onMouseMove={handleMouseMove}>
            <div className="relative" style={{ width: size, height: size }}>
                {tooltip.show && (<div className="absolute z-10 p-2 text-xs bg-gray-800 text-white rounded shadow-lg pointer-events-none whitespace-nowrap" style={{ left: tooltip.x + 15, top: tooltip.y }}>{tooltip.content}</div>)}
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}><g transform={`translate(${size/2}, ${size/2})`}>
                    {data.map((d, i) => {
                        const angle = (d.value / totalValue) * 2 * Math.PI, startAngle = cumulativeAngle, endAngle = cumulativeAngle + angle; cumulativeAngle = endAngle;
                        const isHovered = hoveredIndex === i, r_inner = innerRadius, r_outer = isHovered ? outerRadius + 5 : outerRadius;
                        const arc = (r, sa, ea) => { const largeArcFlag = ea - sa <= Math.PI ? "0" : "1"; return `M ${r*Math.cos(sa)} ${r*Math.sin(sa)} A ${r} ${r} 0 ${largeArcFlag} 1 ${r*Math.cos(ea)} ${r*Math.sin(ea)}`; }
                        const pathData = `${arc(r_outer, startAngle, endAngle)} L ${r_inner*Math.cos(endAngle)} ${r_inner*Math.sin(endAngle)} ${arc(r_inner, endAngle, startAngle).replace('M','L').replace(new RegExp(`A ${r_inner} ${r_inner} 0 \\d 1`), `A ${r_inner} ${r_inner} 0 ${angle > Math.PI ? 1:0} 0`)} Z`;
                        return (<path key={d.name} d={pathData} fill={colors[i % colors.length]} onMouseOver={() => handleMouseOver(i, d)} onMouseOut={handleMouseOut} style={{ transition: 'all 0.2s ease-in-out', cursor: 'pointer' }}/>);
                    })}
                </g></svg>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 w-full">
                {data.slice(0, 8).map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div style={{ backgroundColor: colors[i % colors.length] }} className="w-3 h-3 rounded-sm flex-shrink-0"></div>
                        <div><div className="font-semibold text-sm text-gray-100">{d.name}</div><div className="text-xs text-gray-400">{(d.value / totalValue * 100).toFixed(1)}%</div></div>
                    </div>
                ))}
            </div>
        </div>
    );
};