'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Edit3, Trash2, X } from 'lucide-react';

/**
 * Final dashboard single-file
 * Requirements:
 * - NEXT_PUBLIC_FINNHUB_API_KEY set in Vercel env (client-side)
 * - Tailwind set up in project (assumed)
 * - lucide-react present (you have it)
 *
 * Persistence: localStorage by default (key "bloomboard_portfolio_v1").
 * If you want Supabase persistence, replace persist/load functions with your supabaseClient calls.
 */

const LS_KEY = 'bloomboard_portfolio_v1';
const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
const WS_URL = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const COLORS = ['#06b6d4', '#10b981', '#84cc16', '#f97316', '#ef4444', '#8b5cf6'];

/* ---------- small helpers ---------- */
const fmtIDR = (v) => {
  if (v == null || Number.isNaN(v)) return '-';
  return 'Rp ' + Math.round(Number(v)).toLocaleString('id-ID');
};
const fmtNum = (v, min=2, max=2) => {
  if (v == null || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
};
const debounce = (fn, ms=250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };

/* ---------- small SVG donut (no lib) ---------- */
function Donut({ items = [], size = 180 }) {
  const total = items.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const cx = size/2, cy = size/2, r = (size/2) - 2;
  let startAngle = -90;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {items.map((it, i) => {
        const portion = Math.max(0, it.value) / total;
        const angle = portion * 360;
        const endAngle = startAngle + angle;
        const large = angle > 180 ? 1 : 0;
        const startRad = (Math.PI * startAngle) / 180;
        const endRad = (Math.PI * endAngle) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        startAngle = endAngle;
        return <path key={i} d={path} fill={COLORS[i % COLORS.length]} stroke="#0b0b0b" strokeWidth="0.4" />;
      })}
      <circle cx={cx} cy={cy} r={r*0.56} fill="#0b0b0b" />
    </svg>
  );
}

/* ---------- main component ---------- */
export default function DashboardPage() {
  // core state
  const [assets, setAssets] = useState([]); // { id, symbol, qty, purchasePrice, currency, date, note }
  const [market, setMarket] = useState({});  // symbol -> { c, p, t }
  const [fx, setFx] = useState({ base: 'USD', rates: { USD: 1 } });
  const [displayCurrency, setDisplayCurrency] = useState('IDR');

  // UI state
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [modeAmount, setModeAmount] = useState(false);
  const [query, setQuery] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [status, setStatus] = useState('');
  const [liveFlash, setLiveFlash] = useState({});

  // websocket + subs
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* ---------- load localStorage on mount ---------- */
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) setAssets(JSON.parse(raw));
      }
    } catch (e) {
      console.warn('load local error', e);
    }
  }, []);

  /* ---------- persist helper (localStorage) ---------- */
  const persist = (next) => {
    setAssets(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (e) {}
  };

  /* ---------- Finnhub WebSocket ---------- */
  useEffect(() => {
    if (!WS_URL) { setStatus('No Finnhub key — realtime disabled'); return; }
    setStatus('Connecting realtime...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('Connected (realtime)');
      // subscribe existing symbols
      assets.forEach(a => {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          setMarket(prev => {
            const next = { ...prev };
            msg.data.forEach(tr => {
              next[tr.s] = { ...(next[tr.s]||{}), c: tr.p, t: tr.t, p: tr.p };
              setLiveFlash(f => ({ ...f, [tr.s]: Date.now() }));
            });
            return next;
          });
        }
      } catch (e) { console.error('ws parse', e); }
    };

    ws.onerror = (e) => { console.warn('ws err', e); setStatus('WebSocket error'); };
    ws.onclose = () => { setStatus('WebSocket closed — falling back to polling'); wsRef.current = null; };

    return () => {
      try { ws.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS_URL]);

  /* ---------- subscribe/unsubscribe when assets changes ---------- */
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(assets.map(a => a.symbol));
    desired.forEach(sym => {
      if (!subscribed.current.has(sym)) {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })); subscribed.current.add(sym); } catch {}
      }
    });
    Array.from(subscribed.current).forEach(sym => {
      if (!desired.has(sym)) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: sym })); subscribed.current.delete(sym); } catch {}
      }
    });
  }, [assets]);

  /* ---------- REST fallback and FX (every 60s) ---------- */
  useEffect(() => {
    let mounted = true;
    async function update() {
      if (!FINNHUB_KEY) return;
      // FX
      try {
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const j = await r.json();
        if (mounted && j && j.rates) setFx({ base: j.base || 'USD', rates: j.rates || {} });
      } catch (e) { console.warn('fx fetch', e); }

      // quotes for missing or stale
      const now = Date.now();
      const needs = assets.filter(a => {
        const m = market[a.symbol];
        if (!m || !m.t) return true;
        if (now - (m.t * 1000 || 0) > 60 * 1000) return true;
        return false;
      }).map(a => a.symbol);

      if (needs.length) {
        await Promise.all(needs.map(async (sym) => {
          try {
            const rr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`);
            const jj = await rr.json();
            setMarket(prev => ({ ...prev, [sym]: jj }));
          } catch (e) {}
        }));
      }
    }

    update();
    const iid = setInterval(update, 60 * 1000);
    return () => { mounted = false; clearInterval(iid); };
  }, [assets, market]);

  /* ---------- search (debounced) ---------- */
  const doSearch = useMemo(() => debounce(async (q) => {
    setLoadingSuggest(true);
    if (!q || !FINNHUB_KEY) { setSuggest([]); setLoadingSuggest(false); return; }
    try {
      const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      const j = await res.json();
      const arr = (j.result || []).slice(0, 8).map(x => ({ symbol: x.symbol, desc: x.description }));
      setSuggest(arr);
    } catch (e) { setSuggest([]); }
    setLoadingSuggest(false);
  }, 220), []);
  useEffect(() => { doSearch(query); }, [query, doSearch]);

  /* ---------- live flash cleanup ---------- */
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

  /* ---------- compute conversions & live portfolio ---------- */
  // fx.rates: USD -> CUR (e.g. rates['IDR'] = 15500)
  function convertToDisplay(value, from='USD') {
    const rates = fx.rates || {};
    if (from === displayCurrency) return value;
    const rFrom = (from === 'USD') ? 1 : (rates[from] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const valueUsd = (from === 'USD') ? value : (value / rFrom);
    return valueUsd * rTo;
  }

  const liveAssets = useMemo(() => {
    return assets.map(a => {
      const md = market[a.symbol] || {};
      const livePrice = md.c || md.p || a.purchasePrice || 0;
      const investedAbs = (Number(a.purchasePrice) || 0) * (Number(a.qty) || 0);
      const currentAbs = (Number(livePrice) || 0) * (Number(a.qty) || 0);
      const invested = convertToDisplay(investedAbs, a.currency || 'USD');
      const current = convertToDisplay(currentAbs, a.currency || 'USD');
      const pnl = current - invested;
      const pnlPct = invested ? (pnl / invested) * 100 : 0;
      return { ...a, livePrice, invested, current, pnl, pnlPct };
    });
  }, [assets, market, fx, displayCurrency]);

  const totals = useMemo(() => {
    const invested = liveAssets.reduce((s, x) => s + (x.invested || 0), 0);
    const current = liveAssets.reduce((s, x) => s + (x.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [liveAssets]);

  /* ---------- actions: open add, open edit, save, delete ---------- */
  const openAdd = () => { setEditing({ symbol: '', qty: '', purchasePrice: '', currency: 'USD', date: '' }); setModeAmount(false); setOpenModal(true); setQuery(''); setSuggest([]); };
  const openEdit = (a) => { setEditing({ ...a }); setModeAmount(false); setOpenModal(true); setQuery(''); setSuggest([]); };
  const closeModal = () => { setEditing(null); setOpenModal(false); setQuery(''); setSuggest([]); };

  // pick suggestion -> set editing.symbol + fetch quote + try fetch profile currency
  async function pickSuggestion(sym) {
    setEditing(ed => ({ ...(ed||{}), symbol: sym }));
    setQuery('');
    setSuggest([]);
    if (!FINNHUB_KEY) return;
    try {
      const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`).then(r => r.json());
      setMarket(prev => ({ ...prev, [sym]: q }));
      // try profile2 for currency detection (works for equities)
      try {
        const pr = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`).then(r=>r.json());
        if (pr && pr.currency) setEditing(ed => ({ ...(ed||{}), currency: pr.currency }));
      } catch {}
    } catch (e) {}
  }

  // save asset (from modal)
  async function saveAsset(form) {
    const symbol = (form.symbol || '').toString().trim().toUpperCase();
    if (!symbol) return alert('Symbol required');
    const currency = form.currency || 'USD';
    let qty = Number(form.qty || 0);
    let purchasePrice = Number(form.purchasePrice || 0);

    if (form.mode === 'amount') {
      const amount = Number(form.amount || 0); // in displayCurrency
      // compute priceInDisplay (assetCurrency -> displayCurrency)
      const md = market[symbol] || {};
      const live = md.c || md.p || purchasePrice || 0;
      const rates = fx.rates || {};
      const rFrom = (currency === 'USD') ? 1 : (rates[currency] || 1);
      const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
      const priceInDisplay = ((currency === 'USD') ? live : (live / rFrom)) * rTo;
      if (!priceInDisplay) return alert('Cannot compute qty: missing FX or price');
      qty = amount / priceInDisplay;
      if (!purchasePrice) purchasePrice = live;
    }

    const rec = {
      id: form.id || Date.now(),
      symbol,
      qty: Number(qty),
      purchasePrice: Number(purchasePrice),
      currency,
      date: form.date || new Date().toISOString().slice(0,10),
      note: form.note || ''
    };

    const exists = assets.find(a => a.id === rec.id);
    const next = exists ? assets.map(a => a.id === rec.id ? rec : a) : [...assets, rec];

    // subscribe WS immediately for new symbol if socket open
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: rec.symbol }));
        subscribed.current.add(rec.symbol);
      }
    } catch {}

    persist(next);
    closeModal();
  }

  // delete
  async function removeAsset(id) {
    const toRemove = assets.find(a => a.id === id);
    const next = assets.filter(a => a.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && toRemove) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: toRemove.symbol }));
        subscribed.current.delete(toRemove.symbol);
      }
    } catch {}
    persist(next);
  }

  /* ---------- small UI render helpers ---------- */
  const display = (v) => displayCurrency === 'IDR' ? fmtIDR(v) : `${displayCurrency} ${fmtNum(v)}`;
  const totalCount = liveAssets.length;

  /* ---------- JSX ---------- */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">Bloomboard — Portfolio</div>
            <div className="text-xs text-zinc-500 mt-1">{assets.length} assets • live</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <label className="text-xs text-zinc-400 mr-2">Currency</label>
              <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} className="bg-transparent outline-none">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {/* summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Invested</div>
            <div className="text-lg font-semibold">{display(totals(liveAssets).invested)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Market Value</div>
            <div className="text-lg font-semibold">{display(totals(liveAssets).current)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">P&amp;L</div>
            <div className={`text-lg font-semibold ${totals(liveAssets).pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{totals(liveAssets).pnl >= 0 ? '+' : ''}{display(totals(liveAssets).pnl)} <span className="text-xs text-zinc-400">({totals(liveAssets).pnlPct?.toFixed(2)}%)</span></div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Total Equity</div>
            <div className="text-lg font-semibold">{display(totals(liveAssets).current)}</div>
          </div>
        </div>

        {/* main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* left two columns */}
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
                {liveAssets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-500">Belum ada asset — tekan Add untuk menambah.</div>
                ) : liveAssets.map(a => (
                  <div key={a.id} className="px-4 py-4 flex items-center justify-between hover:bg-zinc-900">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-sm">{a.symbol}</div>
                        <div className="text-xs text-zinc-500">{Math.abs(a.qty)} qty</div>
                        {liveFlash[a.symbol] && <div className="ml-2 text-xs text-emerald-400">live</div>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{display(a.invested)} • <span className="text-xs text-zinc-400">{fmtNum(a.purchasePrice)}</span></div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 text-right">
                      <div className="w-24">{display(a.invested)}</div>
                      <div className="w-24">
                        <div className="text-sm font-medium text-emerald-400">{display(a.current)}</div>
                        <div className="text-xs text-zinc-400">{fmtNum(a.livePrice)}</div>
                      </div>
                      <div className="w-32 text-right">
                        <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{display(a.pnl)}</div>
                        <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                      </div>
                      <div className="w-12 flex gap-2 justify-end">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16} /></button>
                        <button onClick={() => removeAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16} /></button>
                      </div>
                    </div>

                    {/* mobile condensed */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{display(a.pnl)}</div>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white">✎</button>
                        <button onClick={() => removeAsset(a.id)} className="text-red-500 hover:text-red-400">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
                <div>{liveAssets.length} assets</div>
                <div>{status}</div>
              </div>
            </div>

            {/* P&L Bars */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>
              <div className="space-y-3">
                {liveAssets.map((a, i) => {
                  const max = Math.max(...liveAssets.map(x => Math.abs(x.pnl)), 1);
                  const pct = Math.min(100, (Math.abs(a.pnl) / max) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{a.symbol}</div>
                      <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                        <div style={{ width: `${pct}%` }} className={`${a.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full`} />
                      </div>
                      <div className={`w-36 text-right text-sm ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{a.pnl >= 0 ? '+' : ''}{display(a.pnl)}</div>
                    </div>
                  );
                })}
                {liveAssets.length === 0 && <div className="text-zinc-500 text-sm">No data</div>}
              </div>
            </div>

          </div>

          {/* right column: allocation + FX */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">Allocation</div>
                <div className="text-xs text-zinc-500">Live</div>
              </div>
              <div className="h-56 flex items-center justify-center">
                <Donut items={liveAssets.map(a => ({ name: a.symbol, value: a.current }))} size={180} />
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="text-sm font-medium text-zinc-300 mb-2">FX (USD base)</div>
              <div className="text-xs text-zinc-400 mb-2">Updated ~60s</div>
              <div className="text-sm">
                <div className="flex justify-between"><div>IDR</div><div className="font-medium">{fx.rates?.IDR || '—'}</div></div>
                <div className="flex justify-between"><div>EUR</div><div className="font-medium">{fx.rates?.EUR || '—'}</div></div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* modal */}
      {openModal && (
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
              const currency = fd.get('currency') || 'USD';
              const mode = fd.get('mode') || 'qty';
              const qty = Number(fd.get('qty') || 0);
              const price = Number(fd.get('price') || 0);
              const amount = Number(fd.get('amount') || 0);
              const date = fd.get('date') || '';

              if (!symbol) return alert('Symbol is required');

              if (mode === 'qty') {
                await saveAsset({ id: editing?.id, symbol, qty, purchasePrice: price, currency, date, mode });
              } else {
                // amount mode: compute qty from amount (displayCurrency)
                const md = market[symbol] || {};
                const live = md.c || md.p || price || 0;
                const rates = fx.rates || {};
                const rFrom = (currency === 'USD') ? 1 : (rates[currency] || 1);
                const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
                const priceInDisplay = ((currency === 'USD') ? live : (live / rFrom)) * rTo;
                if (!priceInDisplay) return alert('Cannot compute qty: missing FX or price');
                const computedQty = amount / priceInDisplay;
                await saveAsset({ id: editing?.id, symbol, qty: computedQty, purchasePrice: price || live, currency, date, mode });
              }
            }} className="space-y-3">

              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input name="symbol" value={editing?.symbol ?? query} onChange={(ev) => {
                  const v = ev.target.value; setQuery(v); setEditing(ed => ({ ...(ed||{}), symbol: v }));
                }} placeholder="AAPL, BINANCE:BTCUSDT, IDX:INCO" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                {(query && (suggest.length > 0 || loadingSuggest)) && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSuggest ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : suggest.map(s => (
                      <button key={s.symbol} type="button" onClick={() => pickSuggestion(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm">
                        <div><div className="font-medium">{s.symbol}</div><div className="text-xs text-zinc-500">{s.desc}</div></div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className={`px-3 py-1 rounded-lg text-sm ${!modeAmount ? 'bg-zinc-800':'bg-zinc-700'}`}>
                  <input type="radio" name="mode" value="qty" defaultChecked={!modeAmount} onChange={() => setModeAmount(false)} /> <span className="ml-2">Qty</span>
                </label>
                <label className={`px-3 py-1 rounded-lg text-sm ${modeAmount ? 'bg-zinc-800':'bg-zinc-700'}`}>
                  <input type="radio" name="mode" value="amount" defaultChecked={modeAmount} onChange={() => setModeAmount(true)} /> <span className="ml-2">Amount ({displayCurrency})</span>
                </label>
              </div>

              {!modeAmount ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-400">Qty</label>
                    <input name="qty" defaultValue={editing?.qty ?? ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Asset Currency</label>
                    <select name="currency" defaultValue={editing?.currency || 'USD'} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm">
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-400">Amount ({displayCurrency})</label>
                    <input name="amount" type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400">Asset Currency</label>
                    <select name="currency" defaultValue={editing?.currency || 'USD'} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm">
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Buy Price (optional)</label>
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

  /* ---------- helper inner functions used earlier ---------- */

  function fmtNum(v){ return (v==null||Number.isNaN(v))?'-':Number(v).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}); }

  function totals(list) {
    const invested = list.reduce((s,a)=> s + (a.invested || 0), 0);
    const current = list.reduce((s,a)=> s + (a.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }

  function removeAsset(id) {
    // wrapper for delete used in UI (to avoid duplicate name)
    return (async () => {
      const target = assets.find(a => a.id === id);
      const next = assets.filter(a => a.id !== id);
      try {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && target) {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol: target.symbol }));
          subscribed.current.delete(target.symbol);
        }
      } catch {}
      persist(next);
    })();
  }

  // small wrappers for totals used in summary above
  function investedOf(list) { return list.map(x=>x.invested); }
  function currentOf(list) { return list.map(x=>x.current); }
}