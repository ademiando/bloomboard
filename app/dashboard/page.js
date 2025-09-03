'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getDeviceId } from '@/lib/deviceId';
import { loadPortfolio, savePortfolio } from '@/lib/supabaseClient';

/**
 * FINAL single-file dashboard:
 * - Finnhub WebSocket realtime ticks
 * - Finnhub REST fallback for quotes & forex
 * - Typeahead search (Finnhub search)
 * - Add / Edit / Delete (modal)
 * - Supabase persistence with localStorage fallback
 * - FX conversion realtime
 * - Responsive dark layout similar to screenshot
 *
 * Requirements:
 * - NEXT_PUBLIC_FINNHUB_API_KEY in env (Vercel/.env.local)
 * - Optional: Supabase helpers (loadPortfolio, savePortfolio). If not present, localStorage fallback used.
 * - Add dependency "recharts" in package.json if not present.
 */

const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
const WS_URL = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const COLORS = ['#06b6d4', '#10b981', '#84cc16', '#f97316', '#ef4444', '#8b5cf6'];

const fmtIDR = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
};
const fmtNum = (v, code = 'USD') => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (code === 'IDR') return fmtIDR(v);
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };

export default function DashboardPage() {
  const deviceId = useMemo(() => {
    try { return getDeviceId(); } catch { return 'anon'; }
  }, []);
  // data
  const [portfolio, setPortfolio] = useState([]); // {id, symbol, qty, purchasePrice, currency, date}
  const [marketData, setMarketData] = useState({}); // symbol -> {c,p,t}
  const [fxRates, setFxRates] = useState({ base: 'USD', rates: { USD: 1 } }); // USD -> CUR
  const [displayCurrency, setDisplayCurrency] = useState('IDR');

  // UI
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveFlash, setLiveFlash] = useState({}); // symbol -> timestamp for brief highlight

  // ws
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  // load portfolio from supabase or localStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (typeof loadPortfolio === 'function') {
          const res = await loadPortfolio(deviceId);
          if (res && Array.isArray(res.data) && mounted) {
            setPortfolio(res.data);
            return;
          }
        }
      } catch (e) { /* ignore */ }

      // localStorage fallback
      try {
        const raw = localStorage.getItem('bb_portfolio_v2');
        if (raw && mounted) setPortfolio(JSON.parse(raw));
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [deviceId]);

  // persist helper
  const persist = async (next) => {
    setPortfolio(next);
    try {
      setSaving(true);
      if (typeof savePortfolio === 'function') await savePortfolio(deviceId, next);
      localStorage.setItem('bb_portfolio_v2', JSON.stringify(next));
    } catch (e) {
      // fallback local
      localStorage.setItem('bb_portfolio_v2', JSON.stringify(next));
    } finally {
      setSaving(false);
    }
  };

  // --- Finnhub WS setup ---
  useEffect(() => {
    if (!WS_URL) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe existing symbols
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
              // flash highlight
              setLiveFlash(f => ({ ...f, [s]: Date.now() }));
            });
            return next;
          });
        }
      } catch (e) { console.error('ws parse', e); }
    };

    ws.onerror = (err) => { console.warn('Finnhub WS error', err); };

    ws.onclose = () => {
      // try reconnect after short delay
      setTimeout(() => {
        if (wsRef.current === ws) wsRef.current = null;
      }, 3000);
    };

    return () => {
      try {
        // unsubscribe
        portfolio.forEach(a => {
          try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: a.symbol })); } catch {}
        });
      } catch {}
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
    // We intentionally don't re-open WS when portfolio changes (we'll send subscribe/unsubscribe separately)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS_URL]);

  // send subscribe/unsubscribe when portfolio mutates
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(portfolio.map(p => p.symbol));
    // subscribe new
    desired.forEach(s => {
      if (!subscribed.current.has(s)) {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: s })); subscribed.current.add(s); } catch {}
      }
    });
    // unsubscribe removed
    Array.from(subscribed.current).forEach(s => {
      if (!desired.has(s)) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); subscribed.current.delete(s); } catch {}
      }
    });
  }, [portfolio]);

  // REST fallback: fetch missing/stale quotes & FX rates every 60s
  useEffect(() => {
    let mounted = true;
    const fetchFxAndMissing = async () => {
      if (!FINNHUB_KEY) return;
      try {
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const j = await r.json();
        if (mounted && j && j.rates) setFxRates({ base: j.base || 'USD', rates: j.rates || {} });
      } catch (e) { /* ignore */ }

      // missing/stale quotes
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
            const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
            const j = await res.json();
            setMarketData(prev => ({ ...prev, [s]: j }));
          } catch (e) {}
        }));
      }
    };

    fetchFxAndMissing();
    const iid = setInterval(fetchFxAndMissing, 60 * 1000);
    return () => { mounted = false; clearInterval(iid); };
  }, [portfolio, marketData]);

  // Typeahead search (debounced)
  const doSearch = useMemo(() => debounce(async (q) => {
    if (!q || !FINNHUB_KEY) { setSearchResults([]); return; }
    setLoadingSearch(true);
    try {
      const r = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      const j = await r.json();
      const res = (j.result || []).slice(0, 8).map(x => ({ symbol: x.symbol, desc: x.description }));
      setSearchResults(res);
    } catch (e) { setSearchResults([]); }
    setLoadingSearch(false);
  }, 260), []);
  useEffect(() => { doSearch(searchQ); }, [searchQ, doSearch]);

  // helper: convert from asset currency -> displayCurrency using fxRates (which are USD -> CUR)
  const convertToDisplay = (value, from = 'USD') => {
    if (value === null || value === undefined) return 0;
    const rates = fxRates.rates || {};
    if (from === displayCurrency) return value;
    // Finnhub rates: USD -> CUR. So:
    // value in USD = (from === 'USD') ? value : value / rates[from]
    // then to display = value_in_USD * rates[displayCurrency]
    const rFrom = (from === 'USD') ? 1 : (rates[from] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const valUsd = (from === 'USD') ? value : (value / rFrom);
    return valUsd * rTo;
  };

  // computed live portfolio
  const portLive = useMemo(() => {
    return portfolio.map(a => {
      const sym = a.symbol;
      const md = marketData[sym] || {};
      const livePrice = md.c || md.p || a.purchasePrice || 0;
      const investedAbs = (Number(a.purchasePrice) || 0) * (Number(a.qty) || 0);
      const currentAbs = (Number(livePrice) || 0) * (Number(a.qty) || 0);
      const invested = convertToDisplay(investedAbs, a.currency || 'USD');
      const current = convertToDisplay(currentAbs, a.currency || 'USD');
      const pnl = current - invested;
      const pnlPct = invested ? (pnl / invested) * 100 : 0;
      return { ...a, livePrice, invested, current, pnl, pnlPct };
    });
  }, [portfolio, marketData, fxRates, displayCurrency]);

  const totals = useMemo(() => {
    const invested = portLive.reduce((s, x) => s + (x.invested || 0), 0);
    const current = portLive.reduce((s, x) => s + (x.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [portLive]);

  // add / edit / delete actions
  const openAdd = () => { setEditing({ symbol: '', qty: 0, purchasePrice: 0, currency: 'USD' }); setModalOpen(true); setSearchQ(''); setSearchResults([]); };
  const openEdit = (asset) => { setEditing({ ...asset }); setModalOpen(true); setSearchQ(''); setSearchResults([]); };
  const closeModal = () => { setEditing(null); setModalOpen(false); setSearchQ(''); setSearchResults([]); };

  const upsertAsset = async (asset) => {
    const cleaned = {
      id: asset.id || Date.now(),
      symbol: (asset.symbol || '').toString().trim().toUpperCase(),
      qty: Number(asset.qty) || Number(asset.quantity) || 0,
      purchasePrice: Number(asset.purchasePrice || asset.avg || asset.price) || 0,
      currency: asset.currency || 'USD',
      date: asset.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');
    const exists = portfolio.find(p => p.id === cleaned.id);
    const next = exists ? portfolio.map(p => p.id === cleaned.id ? { ...p, ...cleaned } : p) : [...portfolio, cleaned];

    // subscribe ws if new
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol })); subscribed.current.add(cleaned.symbol); }
    } catch {}

    await persist(next);
    closeModal();
  };

  const deleteAsset = async (id) => {
    const removed = portfolio.find(p => p.id === id);
    const next = portfolio.filter(p => p.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol })); subscribed.current.delete(removed.symbol); }
    } catch {}
    await persist(next);
  };

  // click suggestion -> set editing.symbol
  const pickSuggestion = (sym) => {
    setEditing(ed => ({ ...(ed||{}), symbol: sym }));
    setSearchQ(''); setSearchResults([]);
  };

  // live flash cleanup (auto remove after 700ms) to show tick highlight
  useEffect(() => {
    if (!Object.keys(liveFlash).length) return;
    const iid = setInterval(() => {
      const cutoff = Date.now() - 700;
      setLiveFlash(prev => {
        const copy = {};
        Object.entries(prev).forEach(([k, t]) => { if (t > cutoff) copy[k] = t; });
        return copy;
      });
    }, 200);
    return () => clearInterval(iid);
  }, [liveFlash]);

  // small UI atoms
  const Card = ({ children, className = '' }) => <div className={`bg-zinc-950 border border-zinc-900 rounded-2xl p-4 ${className}`}>{children}</div>;
  const Small = ({ children, className = '' }) => <div className={`text-xs text-zinc-400 ${className}`}>{children}</div>;

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">My Portfolio</div>
            <div className="text-xs text-zinc-500 mt-1">{portfolio.length} assets • live</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <label className="text-xs text-zinc-400 mr-2">Currency</label>
              <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} className="bg-transparent outline-none text-zinc-100">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
              <Plus size={16} /> Add
            </button>
          </div>
        </div>

        {/* summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <Small>Trading Balance</Small>
            <div className="text-lg font-semibold">{fmtIDR(totals.invested)}</div>
          </Card>
          <Card>
            <Small>Invested</Small>
            <div className="text-lg font-semibold">{fmtIDR(totals.invested)}</div>
          </Card>
          <Card>
            <Small>P&amp;L</Small>
            <div className={`text-lg font-semibold ${totals.pnl >=0 ? 'text-emerald-400':'text-red-400'}`}>{totals.pnl>=0?'+':''}{fmtIDR(totals.pnl)} <span className="text-xs text-zinc-400">({totals.pnlPct?.toFixed(2)}%)</span></div>
          </Card>
          <Card>
            <Small>Total Equity</Small>
            <div className="text-lg font-semibold">{fmtIDR(totals.current)}</div>
          </Card>
        </div>

        {/* main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* left two columns: table + pnl bars */}
          <div className="lg:col-span-2 space-y-4">

            {/* table */}
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
                      <div className="text-xs text-zinc-500 mt-1">{fmtIDR(a.invested)} • <span className="text-xs text-zinc-400">{fmtNum(a.purchasePrice)}</span></div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 text-right">
                      <div className="w-24">{fmtIDR(a.invested)}</div>
                      <div className="w-24">
                        <div className="text-sm font-medium text-emerald-400">{fmtIDR(a.current)}</div>
                        <div className="text-xs text-zinc-400">{fmtNum(a.livePrice)}</div>
                      </div>
                      <div className="w-32 text-right">
                        <div className={`${a.pnl>=0?'text-emerald-400':'text-red-400'} font-medium`}>{a.pnl>=0?'+':''}{fmtIDR(a.pnl)}</div>
                        <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                      </div>
                      <div className="w-12 flex gap-2 justify-end">
                        <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={()=>deleteAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
                      </div>
                    </div>

                    {/* mobile condensed */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className={`${a.pnl>=0?'text-emerald-400':'text-red-400'} font-medium`}>{a.pnl>=0?'+':''}{fmtIDR(a.pnl)}</div>
                      <div className="flex gap-2">
                        <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={()=>deleteAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
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

            {/* PnL per asset bars */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>
              <div className="space-y-3">
                {portLive.map(a => {
                  const max = Math.max(...portLive.map(x=>Math.abs(x.pnl)) , 1);
                  const pct = Math.min(100, (Math.abs(a.pnl) / max) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{a.symbol}</div>
                      <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                        <div className={`${a.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className={`w-36 text-right text-sm ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{a.pnl>=0?'+':''}{fmtIDR(a.pnl)}</div>
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
                    <Tooltip formatter={(v)=>fmtIDR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="text-sm font-medium text-zinc-300 mb-2">FX (USD base)</div>
              <div className="text-xs text-zinc-400 mb-2">Updated ~60s</div>
              <div className="text-sm"><div className="flex justify-between"><div>IDR</div><div className="font-medium">{fxRates.rates?.IDR || '—'}</div></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal add/edit (with typeahead) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{editing && editing.id ? 'Edit Asset' : 'Add Asset'}</div>
              <button onClick={closeModal} className="text-zinc-400"><X size={18} /></button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              upsertAsset({
                id: editing?.id,
                symbol: fd.get('symbol'),
                qty: Number(fd.get('qty')),
                purchasePrice: Number(fd.get('price')),
                currency: fd.get('currency'),
                date: fd.get('date') || ''
              });
            }} className="space-y-3">

              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input name="symbol" value={editing?.symbol ?? searchQ} onChange={(ev) => {
                  const v = ev.target.value; setSearchQ(v); setEditing(ed => ({ ...(ed||{}), symbol: v })); }
                } placeholder="Search symbol (AAPL, BINANCE:BTCUSDT, IDX:INCO)" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                { (searchQ && (searchResults.length > 0 || loadingSearch)) && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : searchResults.map(s => (
                      <button type="button" key={s.symbol} onClick={() => pickSuggestion(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm">
                        <div><div className="font-medium">{s.symbol}</div><div className="text-xs text-zinc-500">{s.desc}</div></div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    )) }
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
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
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Buy Price</label>
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
} // end component