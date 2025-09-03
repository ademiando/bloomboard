
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

// Try to import existing helpers if present (supabase persistence & device id).
// If not present, we'll fallback to localStorage — imports wrapped in try/catch below.
let getDeviceId;
let loadPortfolio;
let savePortfolio;
try {
  // eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies
  // note: if these files exist in your repo, they'll be used; otherwise we'll use fallback
  // keep them dynamic to avoid build failure if absent
  // In Next.js, dynamic require at runtime: wrap in try/catch
  // eslint-disable-next-line global-require
  const dev = require('@/lib/deviceId');
  getDeviceId = dev.getDeviceId || (() => 'anon');
} catch (e) {
  getDeviceId = () => 'anon';
}
try {
  // eslint-disable-next-line global-require
  const sup = require('@/lib/supabaseClient');
  loadPortfolio = sup.loadPortfolio;
  savePortfolio = sup.savePortfolio;
} catch (e) {
  loadPortfolio = null;
  savePortfolio = null;
}

/* ==========================
   CONFIG
   ========================== */
const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
const WS_URL = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const POLL_INTERVAL_MS = 10000; // fallback polling interval for quotes
const FX_INTERVAL_MS = 60 * 1000; // FX update interval
const COLORS = ['#06b6d4', '#10b981', '#84cc16', '#f97316', '#ef4444', '#8b5cf6'];

/* ==========================
   SMALL HELPERS
   ========================== */
const fmtIDR = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID');
};
const fmtNum = (v, min = 2) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: 2 });
};
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

/* ==========================
   SMALL UI ATOMS (self-contained)
   ========================== */
const IconPlus = ({ className = '', size = 14 }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconEdit = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 21l3-1 9-9 3 3-9 9-6  -2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconTrash = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6v12M16 6v12M9 6l1-2h4l1 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

/* ==========================
   MAIN COMPONENT
   ========================== */
export default function DashboardPage() {
  const deviceId = useMemo(() => {
    try {
      return getDeviceId ? getDeviceId() : 'anon';
    } catch {
      return 'anon';
    }
  }, []);

  // portfolio: array of assets { id, symbol, qty, purchasePrice, currency, date, note }
  const [portfolio, setPortfolio] = useState([]);
  const [marketData, setMarketData] = useState({}); // symbol -> { c, p, t } from Finnhub quote/trade
  const [fxRates, setFxRates] = useState({ base: 'USD', rates: { USD: 1 } }); // USD -> CUR
  const [displayCurrency, setDisplayCurrency] = useState('IDR');

  // UI state
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveFlash, setLiveFlash] = useState({}); // symbol -> timestamp
  const wsRef = useRef(null);
  const subscribedRef = useRef(new Set());
  const pollRef = useRef(null);

  /* ---------------- load persisted portfolio (supabase or localStorage) ---------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (loadPortfolio) {
          const res = await loadPortfolio(deviceId);
          if (res && Array.isArray(res.data) && mounted) {
            setPortfolio(res.data);
            return;
          }
        }
      } catch (e) {
        // ignore, fallback
      }
      try {
        const raw = localStorage.getItem('bb_portfolio_v_final');
        if (raw && mounted) setPortfolio(JSON.parse(raw));
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [deviceId]);

  /* ---------------- persist helper ---------------- */
  const persist = async (next) => {
    setPortfolio(next);
    try {
      setSaving(true);
      if (savePortfolio) await savePortfolio(deviceId, next);
      localStorage.setItem('bb_portfolio_v_final', JSON.stringify(next));
    } catch (e) {
      // fallback localStorage
      localStorage.setItem('bb_portfolio_v_final', JSON.stringify(next));
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Finnhub WebSocket (realtime trades) ---------------- */
  useEffect(() => {
    if (!WS_URL) {
      console.warn('Finnhub WS disabled (missing API key)');
      return;
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe to existing portfolio symbols
      portfolio.forEach(a => {
        try {
          ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol }));
          subscribedRef.current.add(a.symbol);
        } catch {}
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
              // tr.p price, tr.t timestamp
              next[s] = { ...(next[s] || {}), c: tr.p, t: tr.t };
              // set flash
              setLiveFlash(f => ({ ...f, [s]: Date.now() }));
            });
            return next;
          });
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onerror = (e) => {
      console.warn('Finnhub WS error', e);
    };

    ws.onclose = () => {
      // let reconnection be handled by re-mounting when needed; keep simple here
      wsRef.current = null;
    };

    return () => {
      try {
        portfolio.forEach(a => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'unsubscribe', symbol: a.symbol }));
          }
        });
      } catch {}
      try { ws.close(); } catch {}
      wsRef.current = null;
    };
    // NOTE: we intentionally don't add portfolio to deps to avoid reopen; subscription management handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS_URL]);

  // subscribe/unsubscribe when portfolio changes (send messages on existing ws)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(portfolio.map(p => p.symbol));
    desired.forEach(sym => {
      if (!subscribedRef.current.has(sym)) {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })); subscribedRef.current.add(sym); } catch {}
      }
    });
    Array.from(subscribedRef.current).forEach(sym => {
      if (!desired.has(sym)) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: sym })); subscribedRef.current.delete(sym); } catch {}
      }
    });
  }, [portfolio]);

  /* ---------------- REST fallback polling for quotes and FX rates ---------------- */
  useEffect(() => {
    let mounted = true;
    const fetchFxAndQuotes = async () => {
      if (!FINNHUB_KEY) return;
      try {
        // FX rates (USD base)
        const rfx = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const jfx = await rfx.json();
        if (mounted && jfx && jfx.rates) setFxRates({ base: jfx.base || 'USD', rates: jfx.rates || {} });
      } catch (e) {
        // ignore
      }

      // quotes for symbols not present or stale (>60s)
      const now = Date.now();
      const needs = portfolio.filter(a => {
        const md = marketData[a.symbol];
        if (!md || !md.t) return true;
        if (now - (md.t * 1000 || 0) > 60 * 1000) return true;
        return false;
      }).map(a => a.symbol);

      if (needs.length > 0 && FINNHUB_KEY) {
        await Promise.all(needs.map(async (s) => {
          try {
            const rq = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
            const jq = await rq.json();
            setMarketData(prev => ({ ...prev, [s]: jq }));
          } catch {}
        }));
      }
    };

    // initial
    fetchFxAndQuotes();
    // poll for quotes periodically (also serves as fallback if WS missing)
    pollRef.current = setInterval(fetchFxAndQuotes, POLL_INTERVAL_MS);
    // fx refetch interval
    const fxiid = setInterval(fetchFxAndQuotes, FX_INTERVAL_MS);

    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
      clearInterval(fxiid);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, marketData]);

  /* ---------------- Typeahead search (Finnhub search) ---------------- */
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

  /* ---------------- Conversion helpers ---------------- */
  // fxRates.rates: USD -> CUR (e.g., rates['IDR'] = 15500)
  const convertToDisplay = (value, from = 'USD') => {
    if (value === null || value === undefined) return 0;
    const rates = fxRates.rates || {};
    if (from === displayCurrency) return value;
    // convert from -> USD -> display
    const rFrom = (from === 'USD') ? 1 : (rates[from] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const valueUsd = (from === 'USD') ? value : (value / rFrom);
    return valueUsd * rTo;
  };

  const displayFormat = (value) => {
    if (displayCurrency === 'IDR') return fmtIDR(value);
    return `${displayCurrency} ${fmtNum(value)}`;
  };

  /* ---------------- Derived live portfolio ---------------- */
  const portLive = useMemo(() => {
    return portfolio.map(a => {
      const md = marketData[a.symbol] || {};
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
    const invested = portLive.reduce((s, a) => s + (a.invested || 0), 0);
    const current = portLive.reduce((s, a) => s + (a.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [portLive]);

  /* ---------------- CRUD actions ---------------- */
  const openAdd = () => {
    setEditing({ symbol: '', qty: 0, purchasePrice: 0, currency: 'USD', date: '' });
    setSearchQ('');
    setSearchResults([]);
    setModalOpen(true);
  };
  const openEdit = (asset) => {
    setEditing({ ...asset });
    setSearchQ('');
    setSearchResults([]);
    setModalOpen(true);
  };
  const closeModal = () => {
    setEditing(null);
    setModalOpen(false);
    setSearchQ('');
    setSearchResults([]);
  };

  const upsertAsset = async (item) => {
    // item: { id?, symbol, qty, purchasePrice, currency, date }
    const cleaned = {
      id: item.id || Date.now(),
      symbol: (item.symbol || '').toString().trim().toUpperCase(),
      qty: Number(item.qty || 0) || 0,
      purchasePrice: Number(item.purchasePrice || item.purchase_price || 0) || 0,
      currency: item.currency || 'USD',
      date: item.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');

    const exists = portfolio.find(p => p.id === cleaned.id);
    const next = exists ? portfolio.map(p => p.id === cleaned.id ? { ...p, ...cleaned } : p) : [...portfolio, cleaned];

    // subscribe WS if needed immediately
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol }));
        subscribedRef.current.add(cleaned.symbol);
      }
    } catch {}

    await persist(next);
    closeModal();
  };

  const deleteAsset = async (id) => {
    const removed = portfolio.find(p => p.id === id);
    const next = portfolio.filter(p => p.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol }));
        subscribedRef.current.delete(removed.symbol);
      }
    } catch {}
    await persist(next);
  };

  /* ---------------- Modal helper: pick suggestion -> fetch profile/quote ---------------- */
  const pickSuggestion = async (symbol) => {
    // set symbol quickly
    setEditing(ed => ({ ...(ed || {}), symbol }));
    setSearchQ('');
    setSearchResults([]);

    if (!FINNHUB_KEY) return;
    try {
      const qRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
      const jq = await qRes.json();
      setMarketData(prev => ({ ...prev, [symbol]: jq }));
    } catch (e) { /* ignore */ }

    // try to fetch profile (to detect currency for stock tickers)
    try {
      const pr = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
      const jp = await pr.json();
      if (jp && jp.currency) {
        setEditing(ed => ({ ...(ed || {}), currency: jp.currency }));
      }
    } catch (e) { /* ignore */ }
  };

  /* ---------------- live flash cleanup ---------------- */
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

  /* ===========================
     RENDER
     =========================== */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">Portfolio Tracker</div>
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
              <IconPlus /> Add
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Invested</div>
            <div className="text-lg font-semibold">{displayFormat(totals.invested)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Market Value</div>
            <div className="text-lg font-semibold">{displayFormat(totals.current)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">P&amp;L</div>
            <div className={`text-lg font-semibold ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals.pnl>=0?'+':''}{displayFormat(totals.pnl)} <span className="text-xs text-zinc-400">({totals.pnlPct?.toFixed(2)}%)</span></div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Total Equity</div>
            <div className="text-lg font-semibold">{displayFormat(totals.current)}</div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: table + pnl bars */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-300">Assets</div>
                <div className="text-xs text-zinc-500">Live prices via Finnhub</div>
              </div>

              <div className="divide-y divide-zinc-900">
                {portLive.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-500">No assets yet. Click Add to track.</div>
                ) : portLive.map((a) => (
                  <div key={a.id} className="px-4 py-4 flex items-center justify-between hover:bg-zinc-900">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-sm">{a.symbol}</div>
                        <div className="text-xs text-zinc-500">{Number(a.qty)} qty</div>
                        {liveFlash[a.symbol] && <div className="ml-2 text-xs text-emerald-400">live</div>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{displayFormat(a.invested)} • <span className="text-xs text-zinc-400">{fmtNum(a.purchasePrice)}</span></div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 text-right">
                      <div className="w-28">{displayFormat(a.invested)}</div>
                      <div className="w-28">
                        <div className="text-sm font-medium text-emerald-400">{displayFormat(a.current)}</div>
                        <div className="text-xs text-zinc-400">{fmtNum(a.livePrice)}</div>
                      </div>
                      <div className="w-36 text-right">
                        <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{displayFormat(a.pnl)}</div>
                        <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                      </div>
                      <div className="w-12 flex gap-2 justify-end">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white"><IconEdit /></button>
                        <button onClick={() => deleteAsset(a.id)} className="text-red-500 hover:text-red-400"><IconTrash /></button>
                      </div>
                    </div>

                    {/* mobile condensed */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{displayFormat(a.pnl)}</div>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white"><IconEdit /></button>
                        <button onClick={() => deleteAsset(a.id)} className="text-red-500 hover:text-red-400"><IconTrash /></button>
                      </div>
                    </div>
                  </div>
                )))}
              </div>

              <div className="px-4 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
                <div>{portLive.length} assets</div>
                <div>{saving ? 'Saving...' : 'Saved'}</div>
              </div>
            </div>

            {/* PnL bars */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>

              <div className="space-y-3">
                {portLive.map((a, i) => {
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

          {/* Right: allocation (simple donut) + FX */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">Allocation</div>
                <div className="text-xs text-zinc-500">Live</div>
              </div>
              {/* simple svg donut */}
              <div className="w-full h-56 flex items-center justify-center">
                <svg viewBox="0 0 200 200" className="w-full h-full">
                  <g transform="translate(100,100)">
                    {(() => {
                      const total = Math.max(0.0001, portLive.reduce((s, x) => s + (x.current || 0), 0));
                      let start = 0;
                      return portLive.map((p, idx) => {
                        const value = p.current || 0;
                        const angle = (value / total) * Math.PI * 2;
                        const x1 = Math.cos(start) * 70;
                        const y1 = Math.sin(start) * 70;
                        const x2 = Math.cos(start + angle) * 70;
                        const y2 = Math.sin(start + angle) * 70;
                        const large = angle > Math.PI ? 1 : 0;
                        const d = `M ${x1} ${y1} A 70 70 0 ${large} 1 ${x2} ${y2} L 0 0`;
                        start += angle;
                        return <path key={idx} d={d} fill={COLORS[idx % COLORS.length]} opacity="0.95" />;
                      });
                    })()}
                    {/* hole */}
                    <circle cx="0" cy="0" r="40" fill="#0b1220" />
                  </g>
                </svg>
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

      {/* Modal (Add/Edit) */}
      {isModalOpen && (
        <Modal onClose={closeModal}>
          <div className="w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{editing?.id ? 'Edit Asset' : 'Add Asset'}</div>
              <button onClick={closeModal} className="text-zinc-400"><X size={18} /></button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const mode = fd.get('mode') || 'qty';
              const symbol = (fd.get('symbol') || '').toString().trim().toUpperCase();
              const currency = (fd.get('currency') || 'USD').toString();
              let qty = Number(fd.get('qty') || 0);
              let purchasePrice = Number(fd.get('price') || 0);
              const date = fd.get('date') || '';

              if (mode === 'amount') {
                const amount = Number(fd.get('amount') || 0);
                // compute qty = amount / (livePrice converted to display currency), then convert back to asset currency units
                const md = marketData[symbol] || {};
                const live = md.c || md.p || purchasePrice || 0;
                // convert live (in asset currency) to display currency
                const rateFrom = (currency === 'USD') ? 1 : (fxRates.rates?.[currency] || 1);
                const rateTo = (displayCurrency === 'USD') ? 1 : (fxRates.rates?.[displayCurrency] || 1);
                const priceInDisplay = ((currency === 'USD') ? live : (live / rateFrom)) * rateTo;
                if (!priceInDisplay) {
                  alert('Cannot compute quantity: missing price or FX.');
                  return;
                }
                qty = amount / priceInDisplay;
                if (!purchasePrice) purchasePrice = live;
              }

              await upsertAsset({ id: editing?.id, symbol, qty, purchasePrice, currency, date });
            }} className="space-y-3">

              {/* Symbol / search */}
              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input name="symbol" value={editing?.symbol ?? searchQ} onChange={(ev) => {
                  const v = ev.target.value;
                  setSearchQ(v);
                  setEditing(ed => ({ ...(ed || {}), symbol: v }));
                }} placeholder="Search symbol (AAPL, BINANCE:BTCUSDT, IDX:INCO)" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                {searchQ && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : searchResults.map(s => (
                      <button key={s.symbol} type="button" onClick={() => pickSuggestion(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium">{s.symbol}</div>
                          <div className="text-xs text-zinc-500">{s.description}</div>
                        </div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* mode toggle */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-400">Input</label>
                <label className="flex items-center gap-2 text-sm"><input name="mode" type="radio" value="qty" defaultChecked /> Qty</label>
                <label className="flex items-center gap-2 text-sm"><input name="mode" type="radio" value="amount" /> Amount ({displayCurrency})</label>
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

              {/* amount / price */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Amount ({displayCurrency})</label>
                  <input name="amount" placeholder="only for Amount mode" type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Buy Price (per unit)</label>
                  <input name="price" defaultValue={editing?.purchasePrice ?? ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Date</label>
                  <input name="date" defaultValue={editing?.date ?? ''} type="date" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Note (optional)</label>
                  <input name="note" defaultValue={editing?.note ?? ''} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="px-3 py-2 rounded-xl bg-zinc-800">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600">Save</button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );

  /* Note: local helper functions referenced inside render are defined below so bundlers don't complain */
  function Modal({ children, onClose }) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full">{children}</div>
      </div>
    );
  }

  /* Helper wrappers (to avoid function hoisting issues) */
  async function pickSuggestion(symbol) {
    // mirror earlier defined pickSuggestion
    setEditing(ed => ({ ...(ed || {}), symbol }));
    setSearchQ('');
    setSearchResults([]);
    if (!FINNHUB_KEY) return;
    try {
      const qRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
      const jq = await qRes.json();
      setMarketData(prev => ({ ...prev, [symbol]: jq }));
    } catch (e) { /* ignore */ }
    try {
      const pr = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
      const jp = await pr.json();
      if (jp && jp.currency) setEditing(ed => ({ ...(ed || {}), currency: jp.currency }));
    } catch (e) { /* ignore */ }
  }

  async function upsertAsset(item) {
    await upsertAssetAction(item);
  }
  async function upsertAssetAction(item) {
    const cleaned = {
      id: item.id || Date.now(),
      symbol: (item.symbol || '').toString().trim().toUpperCase(),
      qty: Number(item.qty || 0) || 0,
      purchasePrice: Number(item.purchasePrice || item.purchase_price || 0) || 0,
      currency: item.currency || 'USD',
      date: item.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');
    const exists = portfolio.find(p => p.id === cleaned.id);
    const next = exists ? portfolio.map(p => p.id === cleaned.id ? { ...p, ...cleaned } : p) : [...portfolio, cleaned];
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol })); subscribedRef.current.add(cleaned.symbol); }
    } catch {}
    await persist(next);
  }

  async function deleteAssetAction(id) {
    const removed = portfolio.find(p => p.id === id);
    const next = portfolio.filter(p => p.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol })); subscribedRef.current.delete(removed.symbol); }
    } catch {}
    await persist(next);
  }

  // expose these to JSX handlers
  // eslint-disable-next-line no-unused-vars
  const removeAsset = async (id) => await deleteAssetAction(id);
  // eslint-disable-next-line no-unused-vars
  const pickSuggestionHandler = async (symbol) => await pickSuggestion(symbol);
  // eslint-disable-next-line no-unused-vars
  const upsertHandler = async (item) => await upsertAsset(item);
} // end DashboardPage