'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { getDeviceId } from '@/lib/deviceId';
import { loadPortfolio, savePortfolio } from '@/lib/supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/* ===========================
   CONFIG / HELPERS
   =========================== */
const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
if (!FINNHUB_KEY) {
  console.warn('NEXT_PUBLIC_FINNHUB_API_KEY not set — realtime will fail.');
}

const COLORS = ['#06b6d4', '#6366f1', '#10b981', '#f97316', '#ef4444', '#a78bfa'];

const fmt = (v, currency = 'USD') => {
  if (Number.isNaN(v) || v === null || v === undefined) return '-';
  try {
    if (currency === 'IDR') {
      return `Rp ${Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
    }
    return `${currency} ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return v;
  }
};

const debounce = (fn, delay = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
};

/* ===========================
   MAIN PAGE
   =========================== */
export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]); // {id, symbol, quantity, purchasePrice, currency, date, note}
  const [marketData, setMarketData] = useState({}); // { SYMBOL: {c: current, t:timestamp, ...}}
  const [fxRates, setFxRates] = useState({ base: 'USD', rates: { USD: 1, IDR: 0 } });
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const deviceId = useMemo(() => getDeviceId(), []);
  const wsRef = useRef(null);

  // hydrate from supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await loadPortfolio(deviceId);
        if (Array.isArray(data) && data.length) setPortfolio(data);
        else setPortfolio([]);
      } catch (e) {
        console.error('loadPortfolio failed', e);
        setPortfolio([]);
      }
    })();
  }, [deviceId]);

  // persist helper (and update supabase)
  const persistPortfolio = async (next) => {
    setPortfolio(next);
    try {
      setIsSaving(true);
      await savePortfolio(deviceId, next);
    } catch (e) {
      console.error('savePortfolio failed', e);
    } finally {
      setIsSaving(false);
    }
  };

  /* -------------------------
     FINNHUB: initial quotes (one-shot)
     ------------------------- */
  const fetchQuotesBulk = async (symbols) => {
    if (!symbols?.length || !FINNHUB_KEY) return {};
    const res = {};
    await Promise.all(
      symbols.map(async (s) => {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`
          );
          const j = await r.json();
          // j.c current price; j.t timestamp
          res[s] = j;
        } catch (err) {
          // ignore
        }
      })
    );
    return res;
  };

  /* -------------------------
     FINNHUB: websocket for live updates
     ------------------------- */
  useEffect(() => {
    if (!FINNHUB_KEY) return;
    // open websocket
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe to existing symbols
      (portfolio || []).forEach((a) => {
        try {
          ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol }));
        } catch {}
      });
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          // multiple trades — update marketData for related symbols
          setMarketData((prev) => {
            const copy = { ...prev };
            msg.data.forEach((trade) => {
              // trade.s symbol, trade.p price
              const sym = trade.s;
              const price = trade.p;
              copy[sym] = { ...copy[sym], c: price, t: trade.t };
            });
            return copy;
          });
        }
      } catch (e) {
        console.error('ws parse err', e);
      }
    };

    ws.onerror = (e) => {
      console.warn('Finnhub WS error', e);
    };

    ws.onclose = () => {
      // reconnect after short delay
      setTimeout(() => {
        if (wsRef.current === ws) wsRef.current = null;
      }, 1000 * 5);
    };

    return () => {
      try {
        // unsubscribe all then close
        (portfolio || []).forEach((a) => {
          try {
            ws.send(JSON.stringify({ type: 'unsubscribe', symbol: a.symbol }));
          } catch {}
        });
      } catch {}
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
    // note: we intentionally don't include portfolio in deps to avoid re-opening WS each change;
    // we'll send subscribe/unsubscribe messages in a separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FINNHUB_KEY]);

  // Manage subscriptions on change to portfolio symbols
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // figure out which symbols to subscribe/unsubscribe
    const currentSubs = new Set(Object.keys(marketData || {})); // approx
    const desired = new Set(portfolio.map((p) => p.symbol));
    // subscribe new
    desired.forEach((s) => {
      if (!currentSubs.has(s)) {
        try {
          ws.send(JSON.stringify({ type: 'subscribe', symbol: s }));
        } catch {}
      }
    });
    // unsubscribe removed
    currentSubs.forEach((s) => {
      if (!desired.has(s)) {
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s }));
        } catch {}
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio]);

  /* -------------------------
     Periodic: fetch any missing quotes (fallback) & FX rates
     ------------------------- */
  useEffect(() => {
    let mounted = true;

    const updateFx = async () => {
      if (!FINNHUB_KEY) return;
      try {
        // Finnhub forex rates endpoint: /forex/rates?base=USD
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const j = await r.json(); // { base: 'USD', rates: { 'IDR': 15500, ... } }
        if (mounted && j && j.rates) {
          setFxRates({ base: j.base || 'USD', rates: j.rates || {} });
        }
      } catch (e) {
        console.error('fx fetch err', e);
      }
    };

    const updateMissingQuotes = async () => {
      // fetch quotes for symbols not present in marketData or older than 60s
      const now = Date.now();
      const needs = [];
      portfolio.forEach((a) => {
        const md = marketData[a.symbol];
        if (!md || !md.t || now - (md.t * 1000 || 0) > 60 * 1000) needs.push(a.symbol);
      });
      if (needs.length) {
        const q = await fetchQuotesBulk(needs);
        setMarketData((prev) => ({ ...prev, ...q }));
      }
    };

    // initial
    updateFx();
    updateMissingQuotes();
    const intv = setInterval(() => {
      updateFx();
      updateMissingQuotes();
    }, 60 * 1000); // every 60s
    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, FINNHUB_KEY]);

  /* -------------------------
     Search typeahead (Finnhub symbol lookup)
     ------------------------- */
  const doSearch = useMemo(
    () =>
      debounce(async (q) => {
        setLoadingSearch(true);
        if (!q || !FINNHUB_KEY) {
          setSearchResults([]);
          setLoadingSearch(false);
          return;
        }
        try {
          const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
          const j = await res.json();
          const results = (j.result || []).slice(0, 8).map((r) => ({
            symbol: r.symbol,
            description: r.description,
            type: r.type,
          }));
          setSearchResults(results);
        } catch (e) {
          setSearchResults([]);
          console.error('search err', e);
        } finally {
          setLoadingSearch(false);
        }
      }, 300),
    [FINNHUB_KEY]
  );

  useEffect(() => {
    doSearch(searchQuery);
  }, [searchQuery, doSearch]);

  /* -------------------------
     Helpers: conversion & totals
     ------------------------- */
  const convert = (value, from = 'USD', to = displayCurrency) => {
    if (value === null || value === undefined) return 0;
    if (from === to) return value;
    // first convert 'from' -> USD using fxRates if necessary, then to 'to'
    // fxRates.base is USD; fxRates.rates gives mapping USD -> X
    const rates = fxRates.rates || {};
    // convert 'from' to USD
    let amountInUSD = value;
    if (from === 'USD') amountInUSD = value;
    else {
      // need USD->FROM? we have USD->FROM in rates; FROM->USD = 1 / rates[FROM]
      const r = rates[from];
      if (r) amountInUSD = value / r;
      else amountInUSD = value; // fallback
    }
    if (to === 'USD') return amountInUSD;
    const rTo = rates[to];
    if (rTo) return amountInUSD * rTo;
    return amountInUSD;
  };

  const portfolioWithLive = useMemo(() => {
    return portfolio.map((a) => {
      const symbol = a.symbol;
      // prefer WS live price (marketData[symbol].p or .c)
      const md = marketData[symbol] || {};
      const livePrice = md.p || md.c || a.purchasePrice || 0;
      const investedAbsolute = a.purchasePrice * a.quantity; // in asset currency
      const currentAbsolute = livePrice * a.quantity;
      const invested = convert(investedAbsolute, a.currency, displayCurrency);
      const current = convert(currentAbsolute, a.currency, displayCurrency);
      const pnl = current - invested;
      const pnlPct = invested ? (pnl / invested) * 100 : 0;
      return {
        ...a,
        livePrice,
        invested,
        current,
        pnl,
        pnlPct,
      };
    });
  }, [portfolio, marketData, fxRates, displayCurrency]);

  const totals = useMemo(() => {
    const invested = portfolioWithLive.reduce((s, a) => s + (a.invested || 0), 0);
    const current = portfolioWithLive.reduce((s, a) => s + (a.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [portfolioWithLive]);

  /* -------------------------
     UI actions: add/edit/remove
     ------------------------- */
  const openAdd = () => {
    setEditing({ symbol: '', quantity: 0, purchasePrice: 0, currency: 'USD', date: '' });
    setIsModalOpen(true);
  };
  const openEdit = (asset) => {
    setEditing({ ...asset });
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setEditing(null);
    setIsModalOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const submitAsset = async (payload) => {
    // payload: { id?, symbol, quantity, purchasePrice, currency, date, note }
    const cleaned = {
      ...payload,
      symbol: payload.symbol.trim().toUpperCase(),
      quantity: Number(payload.quantity) || 0,
      purchasePrice: Number(payload.purchasePrice) || 0,
      currency: payload.currency || 'USD',
      date: payload.date || '',
      note: payload.note || '',
    };
    if (!cleaned.symbol) return alert('Symbol required');
    const exists = portfolio.find((p) => p.id === cleaned.id);
    let next;
    if (exists) {
      next = portfolio.map((p) => (p.id === cleaned.id ? { ...p, ...cleaned } : p));
    } else {
      next = [...portfolio, { ...cleaned, id: Date.now() }];
      // ensure WS subscribes quickly by sending subscribe if ws open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol }));
        } catch {}
      }
    }
    await persistPortfolio(next);
    closeModal();
  };

  const deleteAsset = async (id) => {
    const next = portfolio.filter((p) => p.id !== id);
    // unsubscribe ws
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const removed = portfolio.find((p) => p.id === id);
        if (removed) wsRef.current.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol }));
      }
    } catch {}
    await persistPortfolio(next);
  };

  /* -------------------------
     Responsive minimal UI rendering
     ------------------------- */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Top bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-sm text-zinc-500">Realtime prices • Live FX • Minimal & clear</p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <label className="text-xs text-zinc-400 mr-2">Currency</label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value)}
                className="bg-transparent outline-none text-zinc-100"
              >
                {/* include USD and top FX from rates */}
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              <Plus size={16} /> Add Asset
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Invested</div>
            <div className="text-lg font-semibold">{fmt(totals.invested, displayCurrency)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Current Value</div>
            <div className="text-lg font-semibold">{fmt(totals.current, displayCurrency)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">P&L</div>
            <div className={`text-lg font-semibold ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmt(totals.pnl, displayCurrency)} <span className="text-sm text-zinc-400">({totals.pnlPct?.toFixed(2)}%)</span>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: table (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-300">Assets</div>
                <div className="text-xs text-zinc-500">Live prices via Finnhub</div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-400 bg-zinc-900">
                    <tr>
                      <th className="text-left px-4 py-3">Asset</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Buy (orig)</th>
                      <th className="text-right px-4 py-3">Live Price</th>
                      <th className="text-right px-4 py-3">Invested ({displayCurrency})</th>
                      <th className="text-right px-4 py-3">Value ({displayCurrency})</th>
                      <th className="text-right px-4 py-3">P&L</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioWithLive.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">No assets — click “Add Asset” to start tracking.</td>
                      </tr>
                    )}

                    {portfolioWithLive.map((a) => (
                      <tr key={a.id} className="border-t border-zinc-900 hover:bg-zinc-950">
                        <td className="px-4 py-3">
                          <div className="font-medium">{a.symbol}</div>
                          <div className="text-xs text-zinc-500">{a.currency} • {a.date || '-'}</div>
                        </td>

                        <td className="px-4 py-3 text-right">{a.quantity}</td>
                        <td className="px-4 py-3 text-right">{fmt(a.purchasePrice, a.currency)}</td>
                        <td className="px-4 py-3 text-right">{fmt(a.livePrice, a.currency)}</td>
                        <td className="px-4 py-3 text-right">{fmt(a.invested, displayCurrency)}</td>
                        <td className="px-4 py-3 text-right">{fmt(a.current, displayCurrency)}</td>
                        <td className={`px-4 py-3 text-right ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {fmt(a.pnl, displayCurrency)} <div className="text-xs text-zinc-500">({a.pnlPct?.toFixed(2)}%)</div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button title="Edit" onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white">
                              <Edit3 size={14} />
                            </button>
                            <button title="Delete" onClick={() => deleteAsset(a.id)} className="text-red-400 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
                <div>{portfolioWithLive.length} assets</div>
                <div>{isSaving ? 'Saving...' : 'Saved'}</div>
              </div>
            </div>

            {/* PnL by asset (simple horizontal bars for clarity) */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>
              <div className="space-y-3">
                {portfolioWithLive.map((a) => {
                  // normalized width
                  const magnitude = Math.abs(a.pnl) || 0;
                  const max = Math.max(...portfolioWithLive.map(x=>Math.abs(x.pnl)) , 1);
                  const pct = Math.min(100, (magnitude / max) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{a.symbol}</div>
                      <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                        <div className={`${a.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`w-36 text-right text-sm ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(a.pnl, displayCurrency)}
                      </div>
                    </div>
                  );
                })}
                {portfolioWithLive.length === 0 && <div className="text-zinc-500 text-sm">No data</div>}
              </div>
            </div>
          </div>

          {/* Right: allocation + fx editor (1/3) */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">Allocation</div>
                <div className="text-xs text-zinc-500">Live</div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={portfolioWithLive.map(p => ({ name: p.symbol, value: p.current }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                    >
                      {portfolioWithLive.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value, displayCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">FX (USD base)</div>
                <div className="text-xs text-zinc-500">Updated ~60s</div>
              </div>
              <div className="text-xs text-zinc-400 mb-2">Rates (USD → )</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><div>IDR</div><div className="font-medium">{(fxRates.rates?.IDR || '—')}</div></div>
                <div className="flex items-center justify-between"><div>EUR</div><div className="font-medium">{(fxRates.rates?.EUR || '—')}</div></div>
                <div className="flex items-center justify-between"><div>JPY</div><div className="font-medium">{(fxRates.rates?.JPY || '—')}</div></div>
              </div>
              <div className="mt-3 text-xs text-zinc-500">Tip: Currency selector converts totals to chosen currency.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Add/Edit with Typeahead search */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">{editing?.id ? 'Edit Asset' : 'Add Asset'}</h3>
              <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-200"><X size={18} /></button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              submitAsset({
                id: editing?.id,
                symbol: (fd.get('symbol') || '').toString(),
                quantity: Number(fd.get('quantity') || 0),
                purchasePrice: Number(fd.get('purchasePrice') || 0),
                currency: (fd.get('currency') || 'USD').toString(),
                date: (fd.get('date') || '').toString(),
                note: (fd.get('note') || '').toString(),
              });
            }} className="space-y-3">

              {/* Typeahead */}
              <div>
                <label className="text-xs text-zinc-400">Search Symbol</label>
                <input
                  name="symbol"
                  value={editing?.symbol ?? searchQuery}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchQuery(v);
                    // keep editing.symbol updated for instant preview
                    setEditing((ed) => ({ ...(ed || {}), symbol: v }));
                  }}
                  placeholder="Search symbol (AAPL, TSLA, BINANCE:BTCUSDT, OANDA:USD_IDR...)"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100"
                  autoComplete="off"
                />
                {searchQuery && (
                  <div className="max-h-44 overflow-auto mt-1 bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? (
                      <div className="p-2 text-xs text-zinc-500">Searching…</div>
                    ) : (
                      <SearchSuggestions
                        query={searchQuery}
                        onPick={(sym) => {
                          setEditing((ed) => ({ ...(ed || {}), symbol: sym }));
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        results={searchResults}
                        setSearchResults={setSearchResults}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Quantity</label>
                  <input name="quantity" defaultValue={editing?.quantity ?? 0} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Currency</label>
                  <select name="currency" defaultValue={editing?.currency || 'USD'} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm">
                    <option value="USD">USD</option>
                    <option value="IDR">IDR</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400">Purchase Price</label>
                  <input name="purchasePrice" defaultValue={editing?.purchasePrice ?? 0} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Date</label>
                  <input name="date" defaultValue={editing?.date ?? ''} type="date" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs text-zinc-400">Note (optional)</label>
                <input name="note" defaultValue={editing?.note ?? ''} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={closeModal} className="px-3 py-2 rounded-xl bg-zinc-800 text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

/* ===========================
   Search Suggestions component
   - uses the searchQuery-driven results in parent
   - fallback to dynamic fetch when clicking to pick
   =========================== */
function SearchSuggestions({ query, results, onPick, setSearchResults }) {
  // if parent fed results, show them; otherwise show empty
  // clicking a suggestion triggers pick
  if (!results || results.length === 0) {
    return <div className="p-2 text-xs text-zinc-500">No results</div>;
  }
  return (
    <div>
      {results.map((r) => (
        <button
          key={r.symbol}
          onClick={() => onPick(r.symbol)}
          className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between"
        >
          <div>
            <div className="font-medium">{r.symbol}</div>
            <div className="text-xs text-zinc-500">{r.description}</div>
          </div>
          <div className="text-xs text-zinc-400">{r.type || ''}</div>
        </button>
      ))}
    </div>
  );
}

/* ===========================
   Side effects: search debounce wiring (top-level)
   - we keep search results in state; parent triggers doSearch
   =========================== */
// place doSearch outside to reuse previous debounce and FINNHUB_KEY
// but we used useMemo in top-level to create it; ensure top-level sets searchResults
// The top-level uses `doSearch` defined earlier (in DashboardPage) - it's okay.