// app/dashboard/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getDeviceId } from '@/lib/deviceId';
import { loadPortfolio, savePortfolio } from '@/lib/supabaseClient';

/*
FINAL Portfolio tracker single-file:
- Finnhub WS realtime ticks + REST fallback
- Finnhub Search (typeahead) + stock profile to detect currency
- Add/Edit/Delete asset
- Add by Qty or by Amount (in display currency) with auto-calculation
- FX rates realtime (USD base) and conversion
- Persist to Supabase if available, fallback to localStorage
- Responsive dark/minimal UI
Requirements:
- NEXT_PUBLIC_FINNHUB_API_KEY env variable
- dependencies: recharts, lucide-react
*/

const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
const WS_URL = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const COLORS = ['#06b6d4', '#10b981', '#84cc16', '#f97316', '#ef4444', '#8b5cf6'];

const fmtIDR = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID');
};
const fmtNum = (v, opts = { min: 2, max: 2 }) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: opts.min, maximumFractionDigits: opts.max });
};
const debounce = (fn, ms = 260) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };

export default function DashboardPage() {
  const deviceId = useMemo(() => {
    try { return getDeviceId(); } catch { return 'anon'; }
  }, []);

  // Core data
  const [portfolio, setPortfolio] = useState([]); // items: { id, symbol, qty, purchasePrice, currency, date, note }
  const [marketData, setMarketData] = useState({}); // symbol -> quote object { c, p, t }
  const [fxRates, setFxRates] = useState({ base: 'USD', rates: { USD: 1 } }); // USD -> CUR mapping
  const [displayCurrency, setDisplayCurrency] = useState('IDR');

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // object or null
  const [modalModeAmount, setModalModeAmount] = useState(false); // false => qty mode, true => amount mode
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveFlash, setLiveFlash] = useState({}); // symbol -> timestamp (for short highlight when tick arrives)

  // WS and subscriptions
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* ------------------ Load persisted portfolio ------------------ */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof loadPortfolio === 'function') {
          const res = await loadPortfolio(deviceId);
          if (mounted && res && Array.isArray(res.data)) {
            setPortfolio(res.data);
            return;
          }
        }
      } catch (e) { /* ignore and fallback */ }

      // fallback localStorage
      try {
        const raw = localStorage.getItem('bb_portfolio_v3');
        if (raw && mounted) setPortfolio(JSON.parse(raw));
      } catch (e) {}
    })();
    return () => { mounted = false; };
  }, [deviceId]);

  // persist helper (Supabase try, then localStorage)
  const persist = async (next) => {
    setPortfolio(next);
    try {
      setSaving(true);
      if (typeof savePortfolio === 'function') await savePortfolio(deviceId, next);
      localStorage.setItem('bb_portfolio_v3', JSON.stringify(next));
    } catch (e) {
      // fallback local
      localStorage.setItem('bb_portfolio_v3', JSON.stringify(next));
    } finally {
      setSaving(false);
    }
  };

  /* ------------------ Finnhub WebSocket ------------------ */
  useEffect(() => {
    if (!WS_URL) {
      console.warn('Finnhub key missing — live WS disabled.');
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe to current portfolio
      portfolio.forEach(a => {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
      });
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          setMarketData(prev => {
            const next = { ...prev };
            msg.data.forEach(tr => {
              const s = tr.s;
              next[s] = { ...(next[s] || {}), c: tr.p, t: tr.t, p: tr.p };
              setLiveFlash(f => ({ ...f, [s]: Date.now() }));
            });
            return next;
          });
        }
      } catch (err) {
        console.error('WS parse err', err);
      }
    };

    ws.onerror = (err) => { console.warn('Finnhub WS error', err); };

    ws.onclose = () => {
      // try reconnect after short delay (simple)
      setTimeout(() => { if (wsRef.current === ws) wsRef.current = null; }, 3000);
    };

    return () => {
      // cleanup
      try {
        portfolio.forEach(a => { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: a.symbol })); } });
      } catch {}
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS_URL]);

  // Manage subscriptions when portfolio changes (subscribe/unsubscribe)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(portfolio.map(p => p.symbol));
    desired.forEach(s => {
      if (!subscribed.current.has(s)) {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: s })); subscribed.current.add(s); } catch {}
      }
    });
    Array.from(subscribed.current).forEach(s => {
      if (!desired.has(s)) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); subscribed.current.delete(s); } catch {}
      }
    });
  }, [portfolio]);

  /* ------------------ FX + REST fallback fetch ------------------ */
  useEffect(() => {
    let mounted = true;
    const updateFxAndMissing = async () => {
      if (!FINNHUB_KEY) return;
      try {
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const j = await r.json();
        if (mounted && j && j.rates) setFxRates({ base: j.base || 'USD', rates: j.rates || {} });
      } catch (e) { /* ignore */ }

      // fetch missing or stale quotes (>60s)
      const now = Date.now();
      const needs = portfolio.filter(a => {
        const md = marketData[a.symbol];
        if (!md || !md.t) return true;
        if (now - (md.t * 1000 || 0) > 60 * 1000) return true;
        return false;
      }).map(a => a.symbol);

      if (needs.length && FINNHUB_KEY) {
        await Promise.all(needs.map(async s => {
          try {
            const rr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
            const jj = await rr.json();
            setMarketData(prev => ({ ...prev, [s]: jj }));
          } catch (e) {}
        }));
      }
    };

    updateFxAndMissing();
    const iid = setInterval(updateFxAndMissing, 60 * 1000);
    return () => { mounted = false; clearInterval(iid); };
  }, [portfolio, marketData]);

  /* ------------------ Typeahead search ------------------ */
  const doSearch = useMemo(() => debounce(async (q) => {
    if (!q || !FINNHUB_KEY) { setSearchResults([]); return; }
    setLoadingSearch(true);
    try {
      const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      const j = await res.json();
      const arr = (j.result || []).slice(0, 8).map(x => ({ symbol: x.symbol, description: x.description, type: x.type }));
      setSearchResults(arr);
    } catch (e) {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, 260), []);
  useEffect(() => { doSearch(searchQ); }, [searchQ, doSearch]);

  /* ------------------ Helper: conversion functions ------------------ */
  // fxRates.rates: USD -> CUR (e.g. rates['IDR'] = 15500)
  function convertToDisplay(valueInAssetCurrency, assetCurrency = 'USD') {
    if (valueInAssetCurrency === null || valueInAssetCurrency === undefined) return 0;
    const rates = fxRates.rates || {};
    if (assetCurrency === displayCurrency) return valueInAssetCurrency;
    // Convert assetCurrency -> USD -> displayCurrency using rates (USD->CUR)
    // valueInUSD = (assetCurrency === 'USD') ? value : value / rates[assetCurrency]
    const rFrom = (assetCurrency === 'USD') ? 1 : (rates[assetCurrency] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const valueInUSD = (assetCurrency === 'USD') ? valueInAssetCurrency : (valueInAssetCurrency / rFrom);
    return valueInUSD * rTo;
  }

  function displayFormat(value) {
    if (displayCurrency === 'IDR') return fmtIDR(value);
    return `${displayCurrency} ${fmtNum(value)}`;
  }

  /* ------------------ Compute live portfolio with conversions ------------------ */
  const portLive = useMemo(() => {
    return portfolio.map(a => {
      const md = marketData[a.symbol] || {};
      const livePrice = md.c || md.p || a.purchasePrice || 0;
      const investedAbs = (Number(a.purchasePrice) || 0) * (Number(a.qty) || 0);
      const currentAbs = (Number(livePrice) || 0) * (Number(a.qty) || 0);
      const investedDisp = convertToDisplay(investedAbs, a.currency || 'USD');
      const currentDisp = convertToDisplay(currentAbs, a.currency || 'USD');
      const pnl = currentDisp - investedDisp;
      const pnlPct = investedDisp ? (pnl / investedDisp) * 100 : 0;
      return { ...a, livePrice, investedDisp, currentDisp, pnl, pnlPct };
    });
  }, [portfolio, marketData, fxRates, displayCurrency]);

  const totals = useMemo(() => {
    const invested = portLive.reduce((s, x) => s + (x.investedDisp || 0), 0);
    const current = portLive.reduce((s, x) => s + (x.currentDisp || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [portLive]);

  /* ------------------ Add / Edit / Delete actions ------------------ */
  const openAdd = () => {
    setEditing({ symbol: '', qty: 0, purchasePrice: 0, currency: 'USD', date: '' });
    setModalModeAmount(false);
    setIsModalOpen(true);
    setSearchQ('');
    setSearchResults([]);
  };
  const openEdit = (a) => {
    setEditing({ ...a });
    setModalModeAmount(false);
    setIsModalOpen(true);
    setSearchQ('');
    setSearchResults([]);
  };
  const closeModal = () => {
    setEditing(null); setIsModalOpen(false); setSearchQ(''); setSearchResults([]);
  };

  // pick suggestion -> fetch quote & profile then set editing symbol/vendor defaults
  const pickSuggestion = async (symbol) => {
    try {
      // set symbol quickly
      setEditing(ed => ({ ...(ed||{}), symbol }));
      setSearchQ('');
      setSearchResults([]);

      // fetch quote for live price
      if (FINNHUB_KEY) {
        const qres = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
        const jq = await qres.json();
        setMarketData(prev => ({ ...prev, [symbol]: jq }));

        // fetch profile2 to detect currency if available
        try {
          const pr = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
          const jp = await pr.json();
          if (jp && jp.currency) {
            setEditing(ed => ({ ...(ed||{}), currency: jp.currency }));
          }
        } catch {}
      }
    } catch (e) {
      console.error('pickSuggestion err', e);
    }
  };

  // upsert asset from modal form
  const upsertAsset = async (payload) => {
    // payload can be { id?, symbol, qty, purchasePrice, currency, date }
    const cleaned = {
      id: payload.id || Date.now(),
      symbol: (payload.symbol || '').toString().trim().toUpperCase(),
      qty: Number(payload.qty || payload.quantity || 0) || 0,
      purchasePrice: Number(payload.purchasePrice || payload.purchase_price || 0) || 0,
      currency: payload.currency || 'USD',
      date: payload.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');

    const exists = portfolio.find(p => p.id === cleaned.id);
    const next = exists ? portfolio.map(p => p.id === cleaned.id ? { ...p, ...cleaned } : p) : [...portfolio, cleaned];

    // subscribe WS for new symbol immediately
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol })); subscribed.current.add(cleaned.symbol); }
    } catch {}

    await persist(next);
    closeModal();
  };

  const removeAsset = async (id) => {
    const removed = portfolio.find(p => p.id === id);
    const next = portfolio.filter(p => p.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol })); subscribed.current.delete(removed.symbol); }
    } catch {}
    await persist(next);
  };

  /* ------------------ Modal helper: compute qty when user enters amount ------------------ */
  // amountInDisplayCurrency -> qty  = amount / price_in_displayCurrency
  const computeQtyFromAmount = (amount, symbol, assetCurrency) => {
    const md = marketData[symbol] || {};
    const livePrice = md.c || md.p || 0;
    // price in asset currency -> convert to display currency
    const priceInDisplay = convertPriceToDisplay(livePrice, assetCurrency);
    if (!priceInDisplay || priceInDisplay === 0) return 0;
    return Number(amount) / Number(priceInDisplay);
  };

  // convert 1 unit price from assetCurrency to displayCurrency
  const convertPriceToDisplay = (price, assetCurrency) => {
    // price: number in assetCurrency
    // we want price_in_displayCurrency
    const rates = fxRates.rates || {};
    if (assetCurrency === displayCurrency) return price;
    const rFrom = (assetCurrency === 'USD') ? 1 : (rates[assetCurrency] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const priceUsd = (assetCurrency === 'USD') ? price : (price / rFrom);
    return priceUsd * rTo;
  };

  /* ------------------ Small UI atoms ------------------ */
  const Card = ({ children, className='' }) => <div className={`bg-zinc-950 border border-zinc-900 rounded-2xl p-4 ${className}`}>{children}</div>;
  const Small = ({ children, className='' }) => <div className={`text-xs text-zinc-400 ${className}`}>{children}</div>;

  /* ------------------ Live flash cleanup ------------------ */
  useEffect(() => {
    if (!Object.keys(liveFlash).length) return;
    const iid = setInterval(() => {
      const cutoff = Date.now() - 700;
      setLiveFlash(prev => {
        const copy = {};
        Object.entries(prev).forEach(([k,t]) => { if (t > cutoff) copy[k] = t; });
        return copy;
      });
    }, 200);
    return () => clearInterval(iid);
  }, [liveFlash]);

  /* ------------------ Render ------------------ */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">Portfolio</div>
            <div className="text-xs text-zinc-500 mt-1">{portfolio.length} assets • live</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <label className="text-xs text-zinc-400 mr-2">Currency</label>
              <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)} className="bg-transparent outline-none text-zinc-100">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
              <Plus size={16}/> Add
            </button>
          </div>
        </div>

        {/* summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <Small>Trading Balance</Small>
            <div className="text-lg font-semibold">{displayFormat(totals.invested)}</div>
          </Card>
          <Card>
            <Small>Invested</Small>
            <div className="text-lg font-semibold">{displayFormat(totals.invested)}</div>
          </Card>
          <Card>
            <Small>P&amp;L</Small>
            <div className={`text-lg font-semibold ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.pnl >=0 ? '+' : ''}{displayFormat(totals.pnl)} <span className="text-xs text-zinc-400">({totals.pnlPct?.toFixed(2)}%)</span></div>
          </Card>
          <Card>
            <Small>Total Equity</Small>
            <div className="text-lg font-semibold">{displayFormat(totals.current)}</div>
          </Card>
        </div>

        {/* main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* left: table & PnL bars */}
          <div className="lg:col-span-2 space-y-4">

            {/* asset table */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-300">Code</div>
                <div className="hidden sm:flex gap-6 text-xs text-zinc-500">
                  <div className="w-24 text-right">Invested</div>
                  <div className="w-24 text-right">Market</div>
                  <div className="w-32 text-right">P&amp;L</div>
                  <div className="w-12" />
                </div>
              </div>

              <div className="divide-y divide-zinc-900">
                {portLive.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-500">Belum ada asset. Tekan Add untuk menambah.</div>
                ) : portLive.map(a => (
                  <div key={a.id} className="px-4 py-4 flex items-center justify-between hover:bg-zinc-900">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-sm">{a.symbol}</div>
                        <div className="text-xs text-zinc-500">{a.qty} Lot</div>
                        {liveFlash[a.symbol] && <div className="ml-2 text-xs text-emerald-400">live</div>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{displayFormat(a.invested)} • <span className="text-xs text-zinc-400">{fmtNum(a.purchasePrice)}</span></div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 text-right">
                      <div className="w-24">{displayFormat(a.invested)}</div>
                      <div className="w-24">
                        <div className="text-sm font-medium text-emerald-400">{displayFormat(a.current)}</div>
                        <div className="text-xs text-zinc-400">{fmtNum(a.livePrice)}</div>
                      </div>
                      <div className="w-32 text-right">
                        <div className={`${a.pnl>=0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl>=0?'+':''}{displayFormat(a.pnl)}</div>
                        <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                      </div>
                      <div className="w-12 flex gap-2 justify-end">
                        <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={()=>removeAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
                      </div>
                    </div>

                    {/* mobile condensed */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className={`${a.pnl>=0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl>=0?'+':''}{displayFormat(a.pnl)}</div>
                      <div className="flex gap-2">
                        <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={()=>removeAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
                <div>{portLive.length} assets</div>
                <div>{saving ? 'Saving...' : 'Saved'}</div>
              </div>
            </div>

            {/* PnL per asset */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>
              <div className="space-y-3">
                {portLive.map(a => {
                  const max = Math.max(...portLive.map(x => Math.abs(x.pnl)), 1);
                  const pct = Math.min(100, (Math.abs(a.pnl) / max) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{a.symbol}</div>
                      <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                        <div className={`${a.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`w-36 text-right text-sm ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{a.pnl >= 0 ? '+' : ''}{displayFormat(a.pnl)}</div>
                    </div>
                  );
                })}
                {portLive.length === 0 && <div className="text-zinc-500 text-sm">No data</div>}
              </div>
            </div>

          </div>

          {/* right: allocation + FX */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">Allocation</div>
                <div className="text-xs text-zinc-500">Live</div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={portLive.map(p=>({ name: p.symbol, value: p.current }))} dataKey="value" nameKey="name" outerRadius={80} label>
                      {portLive.map((_,i)=>(<Cell key={i} fill={COLORS[i%COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(v)=> displayFormat(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="text-sm font-medium text-zinc-300 mb-2">FX (USD base)</div>
              <div className="text-xs text-zinc-400 mb-2">Updated ~60s</div>
              <div className="text-sm">
                <div className="flex justify-between"><div>IDR</div><div className="font-medium">{fxRates.rates?.IDR || '—'}</div></div>
                <div className="flex justify-between"><div>EUR</div><div className="font-medium">{fxRates.rates?.EUR || '—'}</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Add/Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{editing && editing.id ? 'Edit Asset' : 'Add Asset'}</div>
              <button onClick={closeModal} className="text-zinc-400"><X size={18} /></button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const symbol = (fd.get('symbol') || '').toString().trim().toUpperCase();
              const currencyField = fd.get('currency') || 'USD';
              // mode: amount or qty?
              const mode = fd.get('mode') || 'qty';
              let qty = Number(fd.get('qty') || 0);
              let purchasePrice = Number(fd.get('price') || 0);

              if (mode === 'amount') {
                const amount = Number(fd.get('amount') || 0);
                // compute qty from amount: qty = amount / (livePrice-in-displayCurrency)
                const md = marketData[symbol] || {};
                const live = md.c || md.p || purchasePrice || 0;
                const priceInDisplay = convertPriceToDisplay(live, currencyField, fxRates, displayCurrency);
                if (!priceInDisplay || priceInDisplay === 0) return alert('Cannot compute qty: missing price or FX.');
                qty = amount / priceInDisplay;
                // set purchasePrice in asset currency (approx)
                // purchasePrice as value per unit in asset currency (we keep what user entered or live price)
                if (!purchasePrice) purchasePrice = live;
              }

              // commit upsert
              await upsertAsset({ id: editing?.id, symbol, qty, purchasePrice, currency: currencyField, date: fd.get('date') || '' });
            }} className="space-y-3">

              {/* Typeahead */}
              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input name="symbol" value={editing?.symbol ?? searchQ} onChange={(ev) => {
                  const v = ev.target.value;
                  setSearchQ(v);
                  setEditing(ed => ({ ...(ed||{}), symbol: v }));
                }} placeholder="Search symbol (e.g. AAPL, BINANCE:BTCUSDT, IDX:INCO)" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                { (searchQ && (searchResults.length>0 || loadingSearch)) && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : searchResults.map(s => (
                      <button key={s.symbol} type="button" onClick={() => pickSuggestion(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{s.symbol}</div>
                          <div className="text-xs text-zinc-500">{s.description}</div>
                        </div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    )) }
                  </div>
                )}
              </div>

              {/* mode toggle: qty vs amount */}
              <div className="flex items-center gap-2">
                <label className={`px-3 py-1 rounded-lg text-sm ${modalModeAmount ? 'bg-zinc-800' : 'bg-zinc-700'}`}>
                  <input type="radio" name="mode" value="qty" defaultChecked={!modalModeAmount} onChange={() => setModalModeAmount(false)} /> <span className="ml-2">Qty</span>
                </label>
                <label className={`px-3 py-1 rounded-lg text-sm ${modalModeAmount ? 'bg-zinc-700' : 'bg-zinc-800'}`}>
                  <input type="radio" name="mode" value="amount" defaultChecked={modalModeAmount} onChange={() => setModalModeAmount(true)} /> <span className="ml-2">Amount ({displayCurrency})</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!modalModeAmount ? (
                  <>
                    <div>
                      <label className="text-xs text-zinc-400">Qty</label>
                      <input name="qty" defaultValue={editing?.qty ?? ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Currency</label>
                      <select name="currency" defaultValue={editing?.currency || 'USD'} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm">
                        <option value="USD">USD</option>
                        <option value="IDR">IDR</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-zinc-400">Amount ({displayCurrency})</label>
                      <input name="amount" type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-400">Asset Currency (detected or choose)</label>
                      <select name="currency" defaultValue={editing?.currency || 'USD'} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm">
                        <option value="USD">USD</option>
                        <option value="IDR">IDR</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Buy Price (per unit) (optional)</label>
                  <input name="price" defaultValue={editing?.purchasePrice ?? ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Date</label>
                  <input name="date" defaultValue={editing?.date ?? ''} type="date" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="px-3 py-2 rounded-xl bg-zinc-800">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600">Save</button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );

  /* ---------------- internal helpers used in modal submission (kept local) ---------------- */
  function convertPriceToDisplay(price, assetCurrency, fxRatesLocal = fxRates, displayCur = displayCurrency) {
    const rates = fxRatesLocal.rates || {};
    if (!price) return 0;
    if (assetCurrency === displayCur) return price;
    const rFrom = (assetCurrency === 'USD') ? 1 : (rates[assetCurrency] || 1);
    const rTo = (displayCur === 'USD') ? 1 : (rates[displayCur] || 1);
    const priceUsd = (assetCurrency === 'USD') ? price : (price / rFrom);
    return priceUsd * rTo;
  }

  // Because of closures in render, expose compute helper functions for modal usage below
  async function removeAsset(id) { await removeAssetAction(id); }
  async function removeAssetAction(id) {
    const removed = portfolio.find(p => p.id === id);
    const next = portfolio.filter(p => p.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol }));
        subscribed.current.delete(removed.symbol);
      }
    } catch {}
    await persist(next);
  }
  async function upsertAsset(payload) { await upsertAssetAction(payload); }
  async function upsertAssetAction(payload) {
    const cleaned = {
      id: payload.id || Date.now(),
      symbol: (payload.symbol || '').toString().trim().toUpperCase(),
      qty: Number(payload.qty || payload.quantity || 0) || 0,
      purchasePrice: Number(payload.purchasePrice || payload.price || 0) || 0,
      currency: payload.currency || 'USD',
      date: payload.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');
    const exists = portfolio.find(p => p.id === cleaned.id);
    const next = exists ? portfolio.map(p => p.id === cleaned.id ? { ...p, ...cleaned } : p) : [...portfolio, cleaned];
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol })); subscribed.current.add(cleaned.symbol); }
    } catch {}
    await persist(next);
  }
} // end DashboardPage