// app/dashboard/page.js
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * FINAL single-file dashboard (self-contained)
 * - Finnhub WebSocket realtime ticks + REST fallback
 * - Finnhub Search (typeahead)
 * - Add/Edit/Delete assets
 * - Add by qty or by amount (display currency)
 * - FX rates from Finnhub (/forex/rates?base=USD)
 * - Persist to localStorage (easy to swap with Supabase save/load)
 *
 * REQUIRED env on Vercel: NEXT_PUBLIC_FINNHUB_API_KEY
 */

const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
const WS_URL = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const LS_KEY = 'portfolio_tracker_v1';
const COLORS = ['#06b6d4', '#6366f1', '#10b981', '#f97316', '#ef4444', '#8b5cf6'];

function fmtCurrency(val, cur) {
  if (val === null || val === undefined || Number.isNaN(val)) return '-';
  if (cur === 'IDR') return 'Rp ' + Math.round(val).toLocaleString('id-ID');
  return `${cur} ${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* Simple SVG Pie (no external lib) */
function PieSVG({ data, size = 160 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  let angle = -90; // start at top
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="allocation">
      {data.map((slice, i) => {
        const portion = Math.max(0, slice.value) / total;
        const angleDelta = portion * 360;
        const start = angle;
        const end = angle + angleDelta;
        const large = angleDelta > 180 ? 1 : 0;
        const startRad = (Math.PI * (start)) / 180;
        const endRad = (Math.PI * (end)) / 180;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        angle += angleDelta;
        return <path key={i} d={path} fill={COLORS[i % COLORS.length]} stroke="#0b0b0b" strokeWidth={0.5} />;
      })}
      {/* center circle to make donut */}
      <circle cx={cx} cy={cy} r={r * 0.56} fill="#0b0b0b" />
    </svg>
  );
}

export default function DashboardPage() {
  // data
  const [assets, setAssets] = useState([]); // {id, symbol, qty, purchasePrice, currency, date, note}
  const [market, setMarket] = useState({}); // symbol -> {c,p,t}
  const [fx, setFx] = useState({ base: 'USD', rates: { USD: 1 } }); // USD -> CUR
  const [displayCurrency, setDisplayCurrency] = useState('IDR');

  // UI
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [modeAmount, setModeAmount] = useState(false); // add mode: qty or amount
  const [search, setSearch] = useState('');
  const [suggest, setSuggest] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [liveFlash, setLiveFlash] = useState({}); // symbol -> timestamp

  // WS
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  // load localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setAssets(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }, []);

  // persist helper (localStorage)
  const persist = (next) => {
    setAssets(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (e) {}
  };

  // WS connect
  useEffect(() => {
    if (!WS_URL) {
      setStatusMsg('Finnhub API key not set (NEXT_PUBLIC_FINNHUB_API_KEY). Realtime disabled.');
      return;
    }
    setStatusMsg('Connecting to Finnhub...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatusMsg('Connected (realtime on)');
      // subscribe current
      assets.forEach(a => {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol })); subscribed.current.add(a.symbol); } catch {}
      });
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          setMarket(prev => {
            const copy = { ...prev };
            msg.data.forEach(tr => {
              copy[tr.s] = { ...(copy[tr.s]||{}), c: tr.p, t: tr.t, p: tr.p };
              setLiveFlash(f => ({ ...f, [tr.s]: Date.now() }));
            });
            return copy;
          });
        }
      } catch (e) { console.error(e); }
    };
    ws.onerror = (e) => { console.warn('WS error', e); setStatusMsg('WebSocket error'); };
    ws.onclose = () => { setStatusMsg('WebSocket closed — will fallback to polling'); wsRef.current = null; };

    return () => { try { ws.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WS_URL]);

  // subscribe/unsubscribe when assets change
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(assets.map(a => a.symbol));
    desired.forEach(sym => { if (!subscribed.current.has(sym)) {
      try { ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })); subscribed.current.add(sym); } catch {}
    }});
    Array.from(subscribed.current).forEach(sym => { if (!desired.has(sym)) {
      try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: sym })); subscribed.current.delete(sym); } catch {}
    }});
  }, [assets]);

  // REST fallback: fetch missing/stale quotes + fx every 60s; also initial fetch
  useEffect(() => {
    let mounted = true;
    async function update() {
      if (!FINNHUB_KEY) return;
      try {
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const j = await r.json();
        if (mounted && j && j.rates) setFx({ base: j.base || 'USD', rates: j.rates || {} });
      } catch (e) { console.warn('fx fetch', e); }

      // fetch quotes for symbols missing or stale (>60s)
      const now = Date.now();
      const needs = assets.filter(a => {
        const m = market[a.symbol];
        if (!m || !m.t) return true;
        if (now - (m.t * 1000 || 0) > 60 * 1000) return true;
        return false;
      }).map(a => a.symbol);

      if (needs.length) {
        await Promise.all(needs.map(async sym => {
          try {
            const r2 = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`);
            const j2 = await r2.json();
            setMarket(prev => ({ ...prev, [sym]: j2 }));
          } catch (e) { /*ignore*/ }
        }));
      }
    }
    update();
    const id = setInterval(update, 60 * 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [assets, market]);

  // typeahead search (debounced)
  const doSearch = useMemo(() => debounce(async (q) => {
    setLoadingSearch(true);
    if (!q || !FINNHUB_KEY) { setSuggest([]); setLoadingSearch(false); return; }
    try {
      const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      const j = await res.json();
      const arr = (j.result || []).slice(0, 8).map(x => ({ symbol: x.symbol, desc: x.description }));
      setSuggest(arr);
    } catch (e) { setSuggest([]); }
    setLoadingSearch(false);
  }, 220), []);
  useEffect(() => { doSearch(search); }, [search, doSearch]);

  // clear liveFlash after short time
  useEffect(() => {
    if (!Object.keys(liveFlash).length) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - 700;
      setLiveFlash(prev => {
        const copy = {};
        Object.entries(prev).forEach(([k, t]) => { if (t > cutoff) copy[k] = t; });
        return copy;
      });
    }, 200);
    return () => clearInterval(id);
  }, [liveFlash]);

  // computed portfolio (converted to displayCurrency)
  function convertToDisplay(value, from = 'USD') {
    const rates = fx.rates || {};
    if (from === displayCurrency) return value;
    // Finnhub rates: USD -> CUR (rates[CUR] = X means 1 USD = X CUR)
    // To convert value (in FROM currency) -> USD -> to DISPLAY
    // value_in_USD = (from === 'USD') ? value : value / rates[from]
    const rFrom = (from === 'USD') ? 1 : (rates[from] || 1);
    const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
    const valUsd = (from === 'USD') ? value : (value / rFrom);
    return valUsd * rTo;
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
    const invested = liveAssets.reduce((s, a) => s + (a.invested || 0), 0);
    const current = liveAssets.reduce((s, a) => s + (a.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [liveAssets]);

  /* ACTIONS */
  const openAdd = () => { setEditing({ symbol: '', qty: '', purchasePrice: '', currency: 'USD', date: '' }); setModeAmount(false); setIsOpen(true); setSearch(''); setSuggest([]); };
  const openEdit = (a) => { setEditing({ ...a }); setModeAmount(false); setIsOpen(true); setSearch(''); setSuggest([]); };
  const closeModal = () => { setEditing(null); setIsOpen(false); setSearch(''); setSuggest([]); };

  // choose suggestion
  async function chooseSuggestion(sym) {
    setEditing(ed => ({ ...(ed||{}), symbol: sym }));
    setSearch('');
    setSuggest([]);
    // fetch quote and possibly profile to auto detect currency
    if (!FINNHUB_KEY) return;
    try {
      const q = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`).then(r=>r.json());
      setMarket(prev => ({ ...prev, [sym]: q }));
      // try profile2 to get currency
      const pr = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`).then(r=>r.json());
      if (pr && pr.currency) setEditing(ed => ({ ...(ed||{}), currency: pr.currency }));
    } catch (e) { /* ignore */ }
  }

  // upsert
  async function saveAsset(form) {
    // form: { symbol, qty, purchasePrice, currency, date } OR if modeAmount true -> includes amount (in displayCurrency)
    const sym = (form.symbol || '').toString().trim().toUpperCase();
    if (!sym) return alert('Symbol required');
    let qty = Number(form.qty || 0);
    let purchasePrice = Number(form.purchasePrice || 0);
    const currencyOfAsset = form.currency || 'USD';
    if (form.mode === 'amount') {
      const amount = Number(form.amount || 0); // in displayCurrency
      // need live price in asset currency then convert to display -> qty = amount / priceInDisplay
      const md = market[sym] || {};
      const live = md.c || md.p || purchasePrice || 0;
      // convert live (assetCurrency) to displayCurrency
      const priceInDisplay = (function(price) {
        if (currencyOfAsset === displayCurrency) return price;
        const rates = fx.rates || {};
        const rFrom = (currencyOfAsset === 'USD') ? 1 : (rates[currencyOfAsset] || 1);
        const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
        const priceUsd = (currencyOfAsset === 'USD') ? price : (price / rFrom);
        return priceUsd * rTo;
      })(live);
      if (!priceInDisplay) return alert('Cannot compute qty: missing FX or price');
      qty = amount / priceInDisplay;
      if (!purchasePrice) purchasePrice = live;
    }
    const rec = {
      id: form.id || Date.now(),
      symbol: sym,
      qty: Number(qty),
      purchasePrice: Number(purchasePrice),
      currency: currencyOfAsset,
      date: form.date || new Date().toISOString().slice(0,10),
      note: form.note || ''
    };
    const exists = assets.find(a => a.id === rec.id);
    const next = exists ? assets.map(a => a.id === rec.id ? rec : a) : [...assets, rec];
    // subscribe WS immediately if needed
    try {
      const ws = wsRef.current;
      if (!exists && ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'subscribe', symbol: rec.symbol })); subscribed.current.add(rec.symbol); }
    } catch {}
    persist(next);
    closeModal();
  }

  async function deleteAsset(id) {
    const removed = assets.find(a => a.id === id);
    const next = assets.filter(a => a.id !== id);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && removed) { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol })); subscribed.current.delete(removed.symbol); }
    } catch {}
    persist(next);
  }

  // helper to provide form initial values
  const formInitial = editing ? { ...editing } : { symbol:'', qty:'', purchasePrice:'', currency:'USD', date:'' };

  /* UI below */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">Live Portfolio Tracker</div>
            <div className="text-xs text-zinc-500 mt-1">{assets.length} assets • realtime</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <label className="text-xs text-zinc-400 mr-2">Currency</label>
              <select value={displayCurrency} onChange={(e)=>setDisplayCurrency(e.target.value)} className="bg-transparent outline-none">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500">
              <span style={{fontSize:14}}>＋</span> Add
            </button>
          </div>
        </div>

        {/* summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Invested</div>
            <div className="text-lg font-semibold">{fmtCurrency(totals(investedOf(liveAssets)), displayCurrency)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Market Value</div>
            <div className="text-lg font-semibold">{fmtCurrency(totals(currentOf(liveAssets)), displayCurrency)}</div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">P&amp;L</div>
            <div className={`text-lg font-semibold ${totals(liveAssets).pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totals(liveAssets).pnl >=0 ? '+' : ''}{fmtCurrency(totals(liveAssets).pnl, displayCurrency)} <span className="text-xs text-zinc-400">({totals(liveAssets).pnlPct?.toFixed(2)}%)</span>
            </div>
          </div>
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-xs text-zinc-400">Total Equity</div>
            <div className="text-lg font-semibold">{fmtCurrency(totals(liveAssets).current, displayCurrency)}</div>
          </div>
        </div>

        {/* grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* left */}
          <div className="lg:col-span-2 space-y-4">
            {/* table */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
                <div className="text-sm font-medium text-zinc-300">Assets</div>
                <div className="text-xs text-zinc-500">Realtime via Finnhub</div>
              </div>

              <div className="divide-y divide-zinc-900">
                {liveAssets.length === 0 ? (
                  <div className="px-4 py-8 text-center text-zinc-500">No assets — click Add to begin tracking.</div>
                ) : liveAssets.map((a, idx) => (
                  <div key={a.id} className="px-4 py-4 flex items-center justify-between hover:bg-zinc-900">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-sm">{a.symbol}</div>
                        <div className="text-xs text-zinc-500">{Math.abs(a.qty)} qty</div>
                        {liveFlash[a.symbol] && <div className="ml-2 text-xs text-emerald-400">live</div>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">{fmtCurrency(a.invested, displayCurrency)} • <span className="text-xs text-zinc-400">{fmtNum(a.purchasePrice)}</span></div>
                    </div>

                    <div className="hidden sm:flex items-center gap-6 text-right">
                      <div className="w-28">{fmtCurrency(a.invested, displayCurrency)}</div>
                      <div className="w-28">
                        <div className="text-sm font-medium text-emerald-400">{fmtCurrency(a.current, displayCurrency)}</div>
                        <div className="text-xs text-zinc-400">{fmtNum(a.livePrice)}</div>
                      </div>
                      <div className="w-32 text-right">
                        <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{fmtCurrency(a.pnl, displayCurrency)}</div>
                        <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                      </div>
                      <div className="w-12 flex gap-2 justify-end">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white">✎</button>
                        <button onClick={() => deleteAsset(a.id)} className="text-red-500 hover:text-red-400">🗑</button>
                      </div>
                    </div>

                    {/* mobile condensed */}
                    <div className="sm:hidden flex items-center gap-3">
                      <div className={`${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{fmtCurrency(a.pnl, displayCurrency)}</div>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(a)} className="text-zinc-300 hover:text-white">✎</button>
                        <button onClick={() => deleteAsset(a.id)} className="text-red-500 hover:text-red-400">🗑</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-zinc-900 text-xs text-zinc-500 flex items-center justify-between">
                <div>{liveAssets.length} assets</div>
                <div>{statusMsg}</div>
              </div>
            </div>

            {/* pnl bars */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">PnL per asset</div>
                <div className="text-xs text-zinc-500">Realtime</div>
              </div>
              <div className="space-y-3">
                {liveAssets.map((a, idx) => {
                  const max = Math.max(...liveAssets.map(x => Math.abs(x.pnl)), 1);
                  const pct = Math.min(100, (Math.abs(a.pnl) / max) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="w-28 text-sm">{a.symbol}</div>
                      <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                        <div style={{width: `${pct}%`}} className={`${a.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'} h-full`} />
                      </div>
                      <div className={`w-36 text-right text-sm ${a.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{a.pnl >= 0 ? '+' : ''}{fmtCurrency(a.pnl, displayCurrency)}</div>
                    </div>
                  );
                })}
                {liveAssets.length === 0 && <div className="text-zinc-500 text-sm">No data</div>}
              </div>
            </div>
          </div>

          {/* right */}
          <div className="space-y-4">
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium text-zinc-300">Allocation</div>
                <div className="text-xs text-zinc-500">Live</div>
              </div>
              <div className="h-56 flex items-center justify-center">
                <PieSVG data={liveAssets.map(a => ({ name: a.symbol, value: a.current }))} size={200} />
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

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{editing && editing.id ? 'Edit Asset' : 'Add Asset'}</div>
              <button onClick={closeModal} className="text-zinc-400">✕</button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const symbol = (fd.get('symbol') || '').toString().trim();
              const currency = fd.get('currency') || 'USD';
              const mode = fd.get('mode') || 'qty';
              const qty = Number(fd.get('qty') || 0);
              const price = Number(fd.get('price') || 0);
              const amount = Number(fd.get('amount') || 0);
              const date = fd.get('date') || '';

              if (!symbol) return alert('Symbol required');

              if (mode === 'qty') {
                await saveAsset({ id: editing?.id, symbol, qty, purchasePrice: price, currency, date, mode });
              } else {
                // amount mode: compute qty from amount (in displayCurrency)
                const md = market[symbol] || {};
                const live = md.c || md.p || price || 0;
                // convert live (assetCurrency) -> displayCurrency:
                const rates = fx.rates || {};
                const rFrom = (currency === 'USD') ? 1 : (rates[currency] || 1);
                const rTo = (displayCurrency === 'USD') ? 1 : (rates[displayCurrency] || 1);
                const priceInDisplay = ((currency === 'USD') ? live : (live / rFrom)) * rTo;
                if (!priceInDisplay) return alert('Cannot compute qty: missing FX or price');
                const computedQty = amount / priceInDisplay;
                await saveAsset({ id: editing?.id, symbol, qty: computedQty, purchasePrice: price || live, currency, date, mode });
              }
            }} className="space-y-3">

              {/* symbol + suggestions */}
              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input name="symbol" value={editing?.symbol ?? search} onChange={(ev) => {
                  const v = ev.target.value;
                  setSearch(v);
                  setEditing(ed => ({ ...(ed||{}), symbol: v }));
                }} placeholder="AAPL, BINANCE:BTCUSDT, IDX:INCO" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                {(search && (suggest.length > 0 || loadingSearch)) && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : suggest.map(s => (
                      <button key={s.symbol} type="button" onClick={() => chooseSuggestion(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm">
                        <div><div className="font-medium">{s.symbol}</div><div className="text-xs text-zinc-500">{s.desc}</div></div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* mode toggle */}
              <div className="flex items-center gap-2">
                <label className={`px-3 py-1 rounded-lg text-sm ${!modeAmount ? 'bg-zinc-800' : 'bg-zinc-700'}`}>
                  <input type="radio" name="mode" value="qty" defaultChecked={!modeAmount} onChange={() => setModeAmount(false)} /> <span className="ml-2">Qty</span>
                </label>
                <label className={`px-3 py-1 rounded-lg text-sm ${modeAmount ? 'bg-zinc-800' : 'bg-zinc-700'}`}>
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

  // Helper small wrappers used above for tidy totals/formatting
  function totals(list) {
    const invested = list.reduce((s, a) => s + (a.invested || 0), 0);
    const current = list.reduce((s, a) => s + (a.current || 0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested) * 100 : 0;
    return { invested, current, pnl, pnlPct };
  }
  function investedOf(list){ return list.map(x=>x.invested); }
  function currentOf(list){ return list.map(x=>x.current); }

  function fmtNum(v){ return (v===null||v===undefined)?'-':Number(v).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2}); }

} // end DashboardPage