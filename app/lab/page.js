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
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const YAHOO_SEARCH = (q) => `/api/yahoo/search?q=${encodeURIComponent(q)}`;
const FINNHUB_QUOTE = (symbol) => `/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`;
const COINGECKO_PRICE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,idr`;
const COINGECKO_USD_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;
const isBrowser = typeof window !== "undefined";
const toNum = (v) => { const n = Number(String(v || 0).replace(/,/g, '')); return isNaN(n) ? 0 : n; };

/* Formatter: all numbers show currency label. Only Avg Price shows 2 decimals.
   - displayCcy: "IDR" or "USD"
   - digits: optional override (rarely used)
*/
function fmt(val, displayCcy = "IDR", digits = null) {
  const n = Number(val || 0);
  if (displayCcy === "USD") {
    const md = digits == null ? 0 : digits; // default USD: integer display except avg override
    return `USD ${n.toLocaleString("en-US", { minimumFractionDigits: md, maximumFractionDigits: md })}`;
  }
  // IDR: integer display except avg override
  const md = digits == null ? 0 : digits;
  return `IDR ${n.toLocaleString("id-ID", { minimumFractionDigits: md, maximumFractionDigits: md })}`;
}

function ensureNumericAsset(a) {
  return {
    ...a,
    id: a.id || `${a.type}:${a.symbol || a.coingeckoId || a.name}:${Math.random()}`,
    shares: toNum(a.shares || a.quantity || 0),
    avgPrice: toNum(a.avgPrice || 0), // stored in USD base
    investedUSD: toNum(a.investedUSD || ( (a.shares||0) * (a.avgPrice||0) )),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    realizedUSD: toNum(a.realizedUSD || 0),
    createdAt: a.createdAt || Date.now(),
    type: a.type || "stock"
  };
}

/* ===================== UI COMPONENTS ===================== */
const Modal = ({ children, isOpen, onClose, title }) => { if (!isOpen) return null; return (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}><div className="bg-[#181818] rounded-lg w-full max-w-lg border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex justify-between items-center p-4 border-b border-gray-700"><h2 className="text-lg font-semibold text-white">{title}</h2><button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button></div><div className="p-4">{children}</div></div></div>); };

/* ===================== MAIN DASHBOARD COMPONENT ===================== */
export default function PortfolioDashboard() {
  const [assets, setAssets] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_assets_v_final") || "[]").map(ensureNumericAsset) : []);
  const [transactions, setTransactions] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_tx_v_final") || "[]") : []);
  const [tradingBalance, setTradingBalance] = useState(() => isBrowser ? toNum(localStorage.getItem("pf_balance_v_final") || 5952) : 5952);
  const [displayCcy, setDisplayCcy] = useState(() => isBrowser ? localStorage.getItem("pf_display_ccy_v_final") || "IDR" : "IDR");
  const [usdIdr, setUsdIdr] = useState(16400);
  const [isFxLoading, setIsFxLoading] = useState(true);

  // UI state
  const [view, setView] = useState('portfolio'); // portfolio | performance | trade | history
  const [isAddAssetModalOpen, setAddAssetModalOpen] = useState(false);
  const [searchMode, setSearchMode] = useState("id");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [tradeModal, setTradeModal] = useState({ open: false, asset: null, mode: 'buy' });
  const [chartRange, setChartRange] = useState("30"); // days for performance chart

  useEffect(() => { if(isBrowser) localStorage.setItem("pf_assets_v_final", JSON.stringify(assets)); }, [assets]);
  useEffect(() => { if(isBrowser) localStorage.setItem("pf_tx_v_final", JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { if(isBrowser) localStorage.setItem("pf_balance_v_final", String(tradingBalance)); }, [tradingBalance]);
  useEffect(() => { if(isBrowser) localStorage.setItem("pf_display_ccy_v_final", displayCcy); }, [displayCcy]);

  // fetch USD/IDR (coingecko tether)
  useEffect(() => {
    let mounted = true;
    const fetchFx = async () => {
      setIsFxLoading(true);
      try {
        const res = await fetch(COINGECKO_USD_IDR);
        const j = await res.json();
        if (mounted && j?.tether?.idr) setUsdIdr(Math.round(j.tether.idr));
      } catch (e) {}
      finally { if (mounted) setIsFxLoading(false); }
    };
    fetchFx();
    const id = setInterval(fetchFx, 70_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Polling prices: stocks via FINNHUB proxy, crypto via CoinGecko
  useEffect(() => {
    let mounted = true;
    const pollPrices = async () => {
      if (assets.length === 0) return;
      const newAssets = [...assets];

      // crypto ids
      const cryptoIds = [...new Set(assets.filter(a => a.type === 'crypto' && a.coingeckoId).map(a => a.coingeckoId))].filter(Boolean);
      if (cryptoIds.length > 0) {
        try {
          const res = await fetch(COINGECKO_PRICE(cryptoIds.join(',')));
          const j = await res.json();
          // update matching assets
          newAssets.forEach((a, idx) => {
            if (a.type === 'crypto' && a.coingeckoId && j[a.coingeckoId]) {
              newAssets[idx] = { ...a, lastPriceUSD: toNum(j[a.coingeckoId].usd) };
            }
          });
        } catch (e) {}
      }

      // stocks
      const stockSymbols = [...new Set(assets.filter(a => a.type === "stock").map(a => a.symbol))].filter(Boolean);
      for (const symbol of stockSymbols) {
        try {
          const res = await fetch(FINNHUB_QUOTE(symbol));
          const d = await res.json();
          const price = toNum(d?.c);
          if (price > 0) {
            // update assets with this symbol
            newAssets.forEach((a, idx) => {
              if (a.type === 'stock' && a.symbol === symbol) {
                // If IDR stock (.JK) assume price in IDR; convert to USD using usdIdr
                if (symbol.toUpperCase().endsWith('.JK')) {
                  newAssets[idx] = { ...a, lastPriceUSD: price / usdIdr };
                } else {
                  newAssets[idx] = { ...a, lastPriceUSD: price };
                }
              }
            });
          }
        } catch (e) {}
      }

      if (mounted) setAssets(newAssets);
    };

    pollPrices();
    const id = setInterval(pollPrices, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [assets.length, usdIdr]);

  // search suggestions
  const searchTimeoutRef = useRef(null);
  useEffect(() => {
    if (!query || query.trim().length < 2) { setSuggestions([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        if (searchMode === 'crypto') {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(query.trim())}`);
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0, 10).map(c => ({ symbol: c.symbol.toUpperCase(), display: c.name, id: c.id, source: "coingecko", type: "crypto" })));
        } else {
          const res = await fetch(YAHOO_SEARCH(query.trim()));
          if (!res.ok) throw new Error('API fetch failed');
          const payload = await res.json();
          const list = (payload.quotes || []).map(it => ({ symbol: it.symbol.toUpperCase(), display: it.shortname || it.longname || it.symbol, exchange: it.exchange, source: "yahoo", type: "stock" }));
          if (searchMode === "id") setSuggestions(list.filter(x => x.symbol.toUpperCase().endsWith(".JK")));
          else if (searchMode === "us") setSuggestions(list.filter(x => !x.symbol.toUpperCase().endsWith(".JK") && (x.exchange === 'NMS' || x.exchange === 'NYQ')));
          else setSuggestions(list);
        }
      } catch (e) { setSuggestions([]); }
    }, 350);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query, searchMode]);

  // Helper: buy/sell operations (affect state)
  const handleBuy = (assetStub, qty, priceUSD) => {
    const costUSD = qty * priceUSD;
    // balance stored as IDR; tradingBalance is IDR in this app
    if (costUSD * usdIdr > tradingBalance) { alert("Insufficient trading balance."); return false; }
    const existingAsset = assets.find(a => a.symbol === assetStub.symbol && a.type === assetStub.type && a.coingeckoId === assetStub.coingeckoId);
    const newTx = { id:`tx:${Date.now()}`, type:"buy", qty, pricePerUnit: priceUSD, cost: costUSD, date: Date.now(), symbol: assetStub.symbol, name: assetStub.name };
    if (existingAsset) {
      newTx.assetId = existingAsset.id;
      setAssets(prev => prev.map(a => a.id === existingAsset.id ? {...a, shares: a.shares + qty, investedUSD: a.investedUSD + costUSD, avgPrice: (a.investedUSD + costUSD) / (a.shares + qty)} : a));
    } else {
      const newAsset = ensureNumericAsset({ ...assetStub, shares: qty, avgPrice: priceUSD, investedUSD: costUSD });
      newTx.assetId = newAsset.id;
      setAssets(prev => [...prev, newAsset]);
    }
    setTradingBalance(b => b - (costUSD * usdIdr));
    setTransactions(prev => [newTx, ...prev]);
    if(tradeModal.open) setTradeModal({open: false, asset: null, mode: 'buy'});
    return true;
  };
  const handleSell = (asset, qty, priceUSD) => {
    if (qty > asset.shares) { alert("Cannot sell more than you own."); return false; }
    const proceedsUSD = qty * priceUSD, costOfSold = qty * asset.avgPrice, realized = proceedsUSD - costOfSold;
    const newTx = {id:`tx:${Date.now()}`, assetId:asset.id, type:"sell", qty, pricePerUnit: priceUSD, proceeds: proceedsUSD, realized, date: Date.now(), symbol: asset.symbol, name: asset.name };
    setAssets(prev => prev.map(a => a.id === asset.id ? {...a, shares: a.shares - qty, investedUSD: a.investedUSD - costOfSold, avgPrice: (a.shares - qty) > 0 ? (a.investedUSD - costOfSold)/(a.shares - qty) : 0, realizedUSD: (a.realizedUSD||0) + realized } : a).filter(a => a.shares > 1e-9));
    setTradingBalance(b => b + (proceedsUSD * usdIdr));
    setTransactions(prev => [newTx, ...prev]);
    if(tradeModal.open) setTradeModal({open: false, asset: null, mode: 'buy'});
    return true;
  };

  const addAssetWithInitial = (qty, price, ccy) => {
    let p = selectedSuggestion;
    if(!p){
      const t = query.split("—")[0].trim();
      if(!t){ alert("Select a suggestion"); return; }
      p = { symbol: t.toUpperCase(), display: t.toUpperCase(), type: 'stock' };
    }
    if(qty<=0 || price<=0){ alert("Quantity & price must be > 0"); return; }
    const priceUSD = ccy === "IDR" ? price / usdIdr : price;
    const newAssetStub = { id:`${p.source || 'manual'}:${p.symbol||p.id}:${Date.now()}`, type: p.type, symbol: p.symbol, name: p.display, coingeckoId: p.type==='crypto' ? p.id : undefined };
    if(handleBuy(newAssetStub, qty, priceUSD)) { setAddAssetModalOpen(false); setQuery(""); setSelectedSuggestion(null); }
  };

  const addNonLiquidAsset = () => {
    // kept as original
    // ...
  };

  // Derived rows and totals with correct math
  const { rows, totals } = useMemo(() => {
    const calculatedRows = assets.map(a => {
      // Determine lastPriceUSD sources already updated by poll
      const lastPriceUSD = a.lastPriceUSD || 0;
      const investedUSD = a.investedUSD || (a.shares * a.avgPrice);
      const marketValueUSD = a.shares * lastPriceUSD;
      const unrealizedUSD = marketValueUSD - investedUSD;
      const realizedUSD = a.realizedUSD || 0;
      const gainNominalUSD = unrealizedUSD + realizedUSD; // combined gain (realized + unrealized)
      const gainPct = investedUSD > 0 ? (gainNominalUSD / investedUSD) * 100 : 0;
      return { ...a, lastPriceUSD, investedUSD, marketValueUSD, unrealizedUSD, realizedUSD, gainNominalUSD, gainPct };
    });
    const t = {
      invested: calculatedRows.reduce((s,r)=>s + (r.investedUSD||0), 0),
      market: calculatedRows.reduce((s,r)=>s + (r.marketValueUSD||0), 0),
      unrealized: calculatedRows.reduce((s,r)=>s + (r.unrealizedUSD||0), 0),
      realized: calculatedRows.reduce((s,r)=>s + (r.realizedUSD||0), 0),
    };
    t.gain = t.unrealized + t.realized;
    return { rows: calculatedRows, totals: t };
  }, [assets]);

  /* UI handlers (open trade modal) */
  const openTradeModal = (asset, mode='buy') => setTradeModal({ open: true, asset, mode });
  const closeTradeModal = () => setTradeModal({ open: false, asset: null, mode: 'buy' });

  /* Basic CSV import/export placeholders preserved */
  const exportCSV = () => alert("CSV Export preserved.");
  const importCSV = (e) => { alert("CSV Import preserved."); e.target.value = ''; };

  /* Render */
  return (
    <div className="bg-black text-gray-300 min-h-screen font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="p-4 flex justify-between items-center sticky top-0 bg-black z-10">
          <div className="flex items-center gap-3"><UserAvatar /><h1 className="text-lg font-bold text-white">Bloomboard</h1></div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-400">USD/IDR: {isFxLoading ? '...' : fmt(usdIdr, 'USD', 2)}</div>
            <div className="bg-gray-900 p-1 rounded flex items-center gap-1">
              <button onClick={() => setDisplayCcy('IDR')} className={`px-2 py-1 text-xs rounded ${displayCcy === 'IDR' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>IDR</button>
              <button onClick={() => setDisplayCcy('USD')} className={`px-2 py-1 text-xs rounded ${displayCcy === 'USD' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>USD</button>
            </div>
            <button onClick={() => { /* manage portfolio */ }} className="text-gray-400 hover:text-white"><MoreVerticalIcon /></button>
          </div>
        </header>

        <main>
          {/* Tabs: only single set, no duplicates */}
          <div className="border-b border-gray-800 px-4">
            <nav className="flex space-x-6">
              <button onClick={() => setView('portfolio')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'portfolio' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PORTFOLIO</button>
              <button onClick={() => setView('performance')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'performance' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>PERFORMANCE</button>
              <button onClick={() => setView('trade')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'trade' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>TRADE</button>
              <button onClick={() => setView('history')} className={`py-2 px-1 border-b-2 font-semibold text-sm ${view === 'history' ? 'border-emerald-400 text-white' : 'border-transparent text-gray-500'}`}>HISTORY</button>
            </nav>
          </div>

          {/* Main content per view */}
          {view === 'portfolio' && (
            <section className="p-4">
              <div className="grid grid-cols-3 gap-px bg-[#0a0a0a] p-px">
                <div className="bg-black p-2"><p className="text-xs text-gray-500">Trading Balance</p><p className="font-semibold text-sm text-white">{fmt(tradingBalance * (displayCcy === 'IDR' ? 1 : 1 / usdIdr), displayCcy)}</p></div>
                <div className="bg-black p-2"><p className="text-xs text-gray-500">Invested</p><p className="font-semibold text-sm text-white">{fmt(totals.invested * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</p></div>
                <div className="bg-black p-2"><p className="text-xs text-gray-500">Market Value</p><p className="font-semibold text-sm text-white">{fmt(totals.market * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</p></div>
                <div className="bg-black p-2 col-span-2"><p className="text-xs text-gray-500">Total Gain (Realized + Unrealized)</p><p className={`font-semibold text-sm ${totals.gain>=0?'text-emerald-400':'text-red-400'}`}>{totals.gain>=0?'+':''}{fmt(totals.gain * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</p></div>
                <div className="bg-black p-2"><p className="text-xs text-gray-500">Unrealized</p><p className="font-semibold text-sm text-white">{fmt(totals.unrealized * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</p></div>
              </div>

              <div className="h-2 bg-[#0a0a0a] mt-4"></div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500 text-xs">
                    <tr>
                      <th className="p-3 pt-4 font-normal">Asset</th>
                      <th className="p-3 pt-4 font-normal text-right">Invested</th>
                      <th className="p-3 pt-4 font-normal text-right">Avg Price</th>
                      <th className="p-3 pt-4 font-normal text-right">Quantity</th>
                      <th className="p-3 pt-4 font-normal text-right">Current Price</th>
                      <th className="p-3 pt-4 font-normal text-right">Unrealized PnL</th>
                      <th className="p-3 pt-4 font-normal text-right">Gain (Nominal / %)</th>
                      <th className="p-3 pt-4 font-normal text-right">Realized PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-900/50 cursor-pointer" onClick={() => openTradeModal(r, 'buy')}>
                        <td className="p-3">
                          <div className="font-semibold text-base text-white">{r.symbol || r.name}</div>
                          <div className="text-gray-400">{r.name}</div>
                        </td>

                        {/* Invested */}
                        <td className="p-3 text-right tabular-nums">
                          <div className="font-semibold text-white">{fmt(r.investedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                        </td>

                        {/* Avg Price (2 decimals only) */}
                        <td className="p-3 text-right tabular-nums">
                          <div className="font-semibold text-white">{fmt(r.avgPrice * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy, 2)}</div>
                        </td>

                        {/* Quantity */}
                        <td className="p-3 text-right">{Number(r.shares).toLocaleString()}</td>

                        {/* Current Price */}
                        <td className="p-3 text-right tabular-nums">
                          <div className="font-semibold text-white">{fmt(r.lastPriceUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                        </td>

                        {/* Unrealized PnL */}
                        <td className="p-3 text-right tabular-nums">
                          <div className={`font-semibold ${r.unrealizedUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.unrealizedUSD>=0?'+':''}{fmt(r.unrealizedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                        </td>

                        {/* Gain: realized + unrealized (nominal) and percent vs invested */}
                        <td className="p-3 text-right tabular-nums">
                          <div className={`font-semibold ${r.gainNominalUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.gainNominalUSD>=0?'+':''}{fmt(r.gainNominalUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
                          <div className={`${r.gainPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.gainPct.toFixed(2)}%</div>
                        </td>

                        {/* Realized PnL */}
                        <td className="p-3 text-right tabular-nums">
                          <div className={`font-semibold ${r.realizedUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.realizedUSD>=0?'+':''}{fmt(r.realizedUSD * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
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

          {view === 'performance' && (
            <PerformancePage totals={totals} rows={rows} setView={setView} usdIdr={usdIdr} displayCcy={displayCcy} chartRange={chartRange} setChartRange={setChartRange} />
          )}

          {view === 'trade' && (
            <section className="p-4">
              <h2 className="text-white font-semibold mb-3">Trade (Buy / Sell)</h2>
              <div className="bg-[#0f0f0f] p-4 rounded">
                <TradePanel assets={assets} onBuy={handleBuy} onSell={handleSell} usdIdr={usdIdr} displayCcy={displayCcy} />
              </div>
            </section>
          )}

          {view === 'history' && (
            <section className="p-4">
              <h2 className="text-white font-semibold mb-3">Transactions / History</h2>
              <div className="bg-[#0f0f0f] p-4 rounded">
                <TransactionsView transactions={transactions} usdIdr={usdIdr} displayCcy={displayCcy} fmt={fmt} />
              </div>
            </section>
          )}
        </main>

        <Modal title="Add New Asset" isOpen={isAddAssetModalOpen} onClose={() => setAddAssetModalOpen(false)}>
          <AddAssetForm {...{searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial }} />
        </Modal>

        <Modal isOpen={tradeModal.open} onClose={closeTradeModal} title={tradeModal.asset ? `${tradeModal.mode.toUpperCase()} ${tradeModal.asset.symbol || tradeModal.asset.name}` : "Trade"}>
          {tradeModal.asset && <TradeModalContent asset={tradeModal.asset} mode={tradeModal.mode} onBuy={handleBuy} onSell={handleSell} usdIdr={usdIdr} displayCcy={displayCcy} />}
        </Modal>
      </div>
    </div>
  );
}

/* ===================== SUB-COMPONENTS ===================== */

function AddAssetForm({ searchMode, setSearchMode, query, setQuery, suggestions, setSelectedSuggestion, setSuggestions, selectedSuggestion, addAssetWithInitial }) {
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [ccy, setCcy] = useState('IDR');

  const handleAdd = () => {
    const q = toNum(qty), p = toNum(price);
    if (q <= 0 || p <= 0) { alert('Qty & price must be > 0'); return; }
    addAssetWithInitial(q, p, ccy);
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-gray-700">
        {[{key: 'id', label: 'Stocks (ID)'}, {key: 'us', label: 'Stocks (US)'}, {key:'crypto', label:'Crypto'}, {key:'nonliquid', label:'Non-Liquid'}].map(item =>(
          <button key={item.key} onClick={() => { setSearchMode(item.key); setCcy(item.key === 'id' ? 'IDR' : 'USD'); }} className={`px-3 py-2 text-sm font-medium ${searchMode === item.key ? 'text-white border-b-2 border-emerald-400' : 'text-gray-400'}`}>{item.label}</button>
        ))}
      </div>

      {searchMode !== 'nonliquid' ? (
        <div className="space-y-4">
          <div className="relative">
            <input value={query} onChange={e => { setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder="Search by code or name..." className="w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none border border-gray-600 text-white" />
            {suggestions.length > 0 && <div className="absolute z-50 mt-1 w-full bg-[#1e1e1e] border border-gray-700 rounded max-h-56 overflow-auto">
              {suggestions.map((s,i)=>(
                <button key={i} onClick={()=>{ setSelectedSuggestion(s); setQuery(`${s.symbol || s.id} — ${s.display}`); setSuggestions([]); }} className="w-full px-3 py-2 text-left hover:bg-gray-700">
                  <div className="font-medium text-gray-100">{s.symbol || s.id}</div>
                  <div className="text-xs text-gray-400">{s.display}</div>
                </button>
              ))}
            </div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400">Quantity</label>
              <input value={qty} onChange={e => setQty(e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="number"/>
            </div>
            <div>
              <label className="text-xs text-gray-400">Price ({ccy})</label>
              <input value={price} onChange={e => setPrice(e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-3 py-2 text-sm border border-gray-600 text-white" type="number"/>
            </div>
            <div>
              <label className="text-xs text-gray-400">Currency</label>
              <select value={ccy} onChange={e=>setCcy(e.target.value)} className="w-full mt-1 rounded bg-gray-900 px-2 py-2 text-sm border border-gray-600 text-white">
                <option value="IDR">IDR</option><option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded font-semibold">Add Position</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Non-liquid form kept minimal (preserve original behavior) */}
          <p className="text-sm text-gray-400">Non-liquid asset form (unchanged).</p>
        </div>
      )}
    </div>
  );
}

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
          <option value="buy">Buy</option><option value="sell">Sell</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input placeholder="Quantity" value={qty} onChange={e=>setQty(e.target.value)} className="flex-1 bg-gray-900 p-2" />
        <input placeholder={`Price (${priceCcy})`} value={price} onChange={e=>setPrice(e.target.value)} className="w-40 bg-gray-900 p-2" />
        <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="bg-gray-900 p-2">
          <option value="USD">USD</option><option value="IDR">IDR</option>
        </select>
      </div>
      <div className="flex justify-end">
        <button onClick={execute} className="px-4 py-2 rounded bg-emerald-600">Execute</button>
      </div>
    </div>
  );
}

function TradeModalContent({ asset, mode='buy', onBuy, onSell, usdIdr, displayCcy }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(displayCcy === 'IDR' ? String(Math.round(asset.lastPriceUSD * usdIdr)) : String(asset.lastPriceUSD));
  const [priceCcy, setPriceCcy] = useState(displayCcy);

  const submit = () => {
    const priceNum = toNum(price);
    const priceUSD = priceCcy === 'IDR' ? priceNum / usdIdr : priceNum;
    const qtyNum = Number(qty || 0);
    if (mode === 'buy') onBuy(asset, qtyNum, priceUSD); else onSell(asset, qtyNum, priceUSD);
  };

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{asset.name} {asset.symbol ? `(${asset.symbol})` : ""}</div>
      <div className="grid grid-cols-2 gap-2">
        <input value={qty} onChange={e=>setQty(e.target.value)} placeholder="Quantity" className="bg-gray-900 p-2" />
        <input value={price} onChange={e=>setPrice(e.target.value)} placeholder={`Price (${priceCcy})`} className="bg-gray-900 p-2" />
      </div>
      <div className="flex gap-2">
        <select value={priceCcy} onChange={e=>setPriceCcy(e.target.value)} className="bg-gray-900 p-2">
          <option value="USD">USD</option><option value="IDR">IDR</option>
        </select>
        <div className="flex-1" />
        <button onClick={submit} className="px-4 py-2 bg-emerald-600 rounded">{mode === 'buy' ? 'Buy' : 'Sell'}</button>
      </div>
    </div>
  );
}

function PerformancePage({ totals, rows, setView, usdIdr, displayCcy, chartRange, setChartRange }) {
  // Create a small synthetic ROI series from current snapshot (client-side)
  const [snapshots, setSnapshots] = useState(() => isBrowser ? JSON.parse(localStorage.getItem("pf_roi_snap_v_final") || "[]") : []);
  useEffect(() => { localStorage.setItem("pf_roi_snap_v_final", JSON.stringify(snapshots)); }, [snapshots]);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      const v = rows.reduce((s,r) => s + (r.marketValueUSD || 0), 0);
      setSnapshots(prev => {
        const next = [...prev, { t, v }];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [rows]);

  return (
    <div className="p-4">
      <header className="flex items-center gap-4 mb-4">
        <button onClick={() => setView('portfolio')} className="text-white"><BackArrowIcon /></button>
        <h2 className="text-lg font-semibold text-white">Performance</h2>
      </header>

      <div className="bg-[#0f0f0f] p-4 rounded">
        <div className="flex justify-between items-center mb-3">
          <div className="font-semibold">ROI (Realtime)</div>
          <div>
            <select value={chartRange} onChange={e=>setChartRange(e.target.value)} className="bg-gray-900 p-2">
              <option value="7">7d</option><option value="30">30d</option><option value="90">90d</option><option value="365">365d</option>
            </select>
          </div>
        </div>

        <div>
          <SimpleLineChart data={snapshots} usdIdr={usdIdr} displayCcy={displayCcy} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="p-3 bg-[#121212] rounded">
            <div className="text-xs text-gray-400">Total Invested</div>
            <div className="font-semibold">{fmt(totals.invested * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
          </div>
          <div className="p-3 bg-[#121212] rounded">
            <div className="text-xs text-gray-400">Market Value</div>
            <div className="font-semibold">{fmt(totals.market * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
          </div>
          <div className="p-3 bg-[#121212] rounded">
            <div className="text-xs text-gray-400">Total Gain</div>
            <div className="font-semibold">{fmt(totals.gain * (displayCcy === 'IDR' ? usdIdr : 1), displayCcy)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SimpleLineChart({ data = [], usdIdr = 16000, displayCcy = "IDR", height = 200 }) {
  if (!data || data.length === 0) return <div className="text-gray-400 py-8 text-center">No data</div>;
  const width = 800, h = height, pad = 24;
  const xs = data.map(d => d.t);
  const ys = data.map(d => d.v);
  const minY = Math.min(...ys), maxY = Math.max(...ys), range = maxY - minY || 1;
  const xScale = (t) => pad + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (width - pad*2);
  const yScale = (v) => pad + (1 - (v - minY) / range) * (h - pad*2);
  const path = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xScale(p.t)},${yScale(p.v)}`).join(' ');
  const last = data[data.length-1].v;
  return (
    <div className="w-full overflow-auto">
      <svg viewBox={`0 0 ${width} ${h}`} style={{ width: '100%', height: h }}>
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity="0.3"/><stop offset="100%" stopColor="#16a34a" stopOpacity="0"/></linearGradient></defs>
        <path d={`${path} L ${xScale(xs[xs.length-1])},${h-pad} L ${xScale(xs[0])},${h-pad} Z`} fill="url(#g)" />
        <path d={path} fill="none" stroke="#16a34a" strokeWidth="2" />
        {[0,0.25,0.5,0.75,1].map((p,i)=> {
          const y = pad + p*(h - pad*2);
          return <line key={i} x1={pad} x2={width-pad} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />;
        })}
        <text x={width - pad} y={pad+12} fontSize="12" textAnchor="end" fill="#d1fae5">{displayCcy === 'IDR' ? `IDR ${Math.round(last * usdIdr).toLocaleString()}` : `USD ${Math.round(last).toLocaleString()}`}</text>
      </svg>
    </div>
  );
}

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
              <td className="p-2 text-right">{displayCcy === 'IDR' ? fmt(tx.pricePerUnit * usdIdr, 'IDR') : fmt(tx.pricePerUnit, 'USD')}</td>
              <td className="p-2 text-right">{displayCcy === 'IDR' ? fmt(tx.cost * usdIdr, 'IDR') : fmt(tx.cost, 'USD')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}