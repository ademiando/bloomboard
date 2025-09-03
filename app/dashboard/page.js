'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Edit3, Trash2, Plus } from 'lucide-react';
import { getDeviceId } from '@/lib/deviceId';
import { loadPortfolio, savePortfolio } from '@/lib/supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/* ---------------- Config ---------------- */
const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
const COLORS = ['#06b6d4', '#10b981', '#84cc16', '#f97316', '#ef4444', '#8b5cf6'];

/* ---------------- Helpers ---------------- */
const fmtIDR = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
};
const fmtNum = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
};

/* ---------------- Main ---------------- */
export default function DashboardPage() {
  const deviceId = useMemo(()=> getDeviceId(), []);
  const [portfolio, setPortfolio] = useState([]); // {id, symbol, qty, avg, currency, date}
  const [marketData, setMarketData] = useState({}); // symbol -> {c, t, p}
  const [fx, setFx] = useState({ USD: 1, IDR: 16000 }); // minimal fallback
  const [displayCurrency, setDisplayCurrency] = useState('IDR');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Typeahead
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // websocket ref
  const wsRef = useRef(null);
  const subscribedRef = useRef(new Set());

  // load portfolio (supabase fallback localStorage)
  useEffect(() => {
    let mounted = true;
    (async ()=>{
      try {
        const res = await loadPortfolio(deviceId);
        if (mounted && res && Array.isArray(res.data)) {
          setPortfolio(res.data);
        } else if (mounted) {
          // fallback localStorage
          const raw = localStorage.getItem('bb_portfolio');
          if (raw) setPortfolio(JSON.parse(raw));
        }
      } catch (e) {
        const raw = localStorage.getItem('bb_portfolio');
        if (raw) setPortfolio(JSON.parse(raw));
      }
    })();
    return ()=>{ mounted = false; };
  }, [deviceId]);

  // persist helper (writes supabase, fallback localStorage)
  const persist = async (next) => {
    setPortfolio(next);
    try {
      await savePortfolio(deviceId, next);
      localStorage.setItem('bb_portfolio', JSON.stringify(next));
    } catch (e) {
      // fallback local
      localStorage.setItem('bb_portfolio', JSON.stringify(next));
    }
  };

  /* ---------------- Finnhub WS ---------------- */
  useEffect(() => {
    if (!FINNHUB_KEY) {
      console.warn('Finnhub key missing — realtime disabled');
      return;
    }
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe to existing portfolio symbols
      portfolio.forEach(a => {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol })); subscribedRef.current.add(a.symbol);} catch {}
      });
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          setMarketData(prev => {
            const next = {...prev};
            msg.data.forEach(tr => {
              const s = tr.s; // symbol
              next[s] = {...(next[s]||{}), c: tr.p, t: tr.t, p: tr.p};
            });
            return next;
          });
        }
      } catch(e) { console.error('ws parse', e); }
    };

    ws.onerror = (e) => { console.warn('ws err', e); };

    ws.onclose = () => {
      // try reconnect after delay
      setTimeout(()=> {
        if (wsRef.current === ws) wsRef.current = null;
      }, 2000);
    };

    return ()=> {
      try {
        portfolio.forEach(a => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type:'unsubscribe', symbol: a.symbol }));
          }
        });
        ws.close();
      } catch {}
      wsRef.current = null;
    };
    // intentionally not including portfolio in deps to avoid re-opening; we will send subscribe messages separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FINNHUB_KEY]);

  // subscribe/unsubscribe when portfolio changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const desired = new Set(portfolio.map(p=>p.symbol));
    // subscribe new
    desired.forEach(s => {
      if (!subscribedRef.current.has(s)) {
        try { ws.send(JSON.stringify({ type: 'subscribe', symbol: s })); subscribedRef.current.add(s); } catch {}
      }
    });
    // unsubscribe removed
    Array.from(subscribedRef.current).forEach(s => {
      if (!desired.has(s)) {
        try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol: s })); subscribedRef.current.delete(s); } catch {}
      }
    });
  }, [portfolio]);

  /* ---------------- FX + REST price fallback ---------------- */
  useEffect(()=> {
    let mounted = true;
    const updateFxAndMissing = async () => {
      if (!FINNHUB_KEY) return;
      try {
        // FX rates base USD
        const r = await fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`);
        const jr = await r.json(); // { base: 'USD', rates: { IDR: 15500, ... } }
        if (mounted && jr && jr.rates) {
          setFx(prev => ({ ...prev, ...jr.rates, USD:1 })); // store rates like {IDR:15500, EUR:0.93, USD:1}
        }
      } catch(e) { /* ignore */ }

      // check missing quotes or stale >60s and fetch via REST
      const now = Date.now();
      const needs = portfolio.filter(a => {
        const md = marketData[a.symbol];
        if (!md || !md.t) return true;
        // md.t is seconds
        if (now - (md.t*1000 || 0) > 60*1000) return true;
        return false;
      }).map(a=>a.symbol);

      if (needs.length && FINNHUB_KEY) {
        await Promise.all(needs.map(async s=>{
          try {
            const rr = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_KEY}`);
            const jj = await rr.json();
            setMarketData(prev => ({ ...prev, [s]: jj }));
          } catch {}
        }));
      }
    };

    updateFxAndMissing();
    const iid = setInterval(updateFxAndMissing, 60*1000);
    return ()=> { mounted=false; clearInterval(iid); };
  // include portfolio & marketData lengths
  }, [portfolio, marketData, FINNHUB_KEY]);

  /* ---------------- Typeahead search ---------------- */
  const doSearch = useMemo(()=> debounce(async (qstr)=> {
    if (!qstr || !FINNHUB_KEY) { setSuggestions([]); return; }
    setLoadingSearch(true);
    try {
      const res = await fetch(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(qstr)}&token=${FINNHUB_KEY}`);
      const j = await res.json(); // { result: [{symbol, description, ...}]}
      const arr = (j.result || []).slice(0,8).map(r=>({ symbol: r.symbol, desc: r.description }));
      setSuggestions(arr);
    } catch(e) { setSuggestions([]); }
    setLoadingSearch(false);
  }, 260), [FINNHUB_KEY]);

  useEffect(()=> { doSearch(q); }, [q, doSearch]);

  /* ---------------- Portfolio live computations ---------------- */
  const portLive = useMemo(()=> {
    // convert everything to displayCurrency (IDR preferred)
    const rateToDisplay = (cur='USD') => {
      // fx rates mapping USD->X, we want value in displayCurrency
      if (cur === displayCurrency) return 1;
      const rates = fx || {};
      const toRate = rates[displayCurrency] || (displayCurrency === 'USD' ? 1 : null);
      const fromRate = rates[cur] || (cur === 'USD' ? 1 : null);
      if (fromRate == null || toRate == null) return 1; // fallback
      // value in USD = val / fromRate (if fromRate is USD->FROM)
      // Finnhub rates are USD -> CUR. So 1 USD = rates[CUR], so 1 CUR = 1/rates[CUR] USD.
      // To convert value(from) to display: value_in_USD = value / rates[from]; result = value_in_USD * rates[display]
      const conv = (v) => ( (v / (fromRate)) * (toRate) );
      return conv;
    };

    // easier: compute per-asset using fx mapping: compute absolute invested in USD first then to display
    const rates = fx || {};
    return portfolio.map(a=>{
      const sym = a.symbol;
      const md = marketData[sym] || {};
      const live = md.c || md.p || a.purchasePrice || 0;
      // invested in asset's currency absolute
      const investedAbs = (Number(a.purchasePrice) || 0) * (Number(a.qty) || Number(a.quantity) || 0);
      const currentAbs = (Number(live) || 0) * (Number(a.qty) || Number(a.quantity) || 0);

      // convert asset currency -> displayCurrency using rates where rates maps USD->CUR
      const convert = (val, from= (a.currency || 'USD')) => {
        if (from === displayCurrency) return val;
        // if from === USD and displayCurrency === IDR: val * rates['IDR']
        if (from === 'USD') {
          const to = rates[displayCurrency] || (displayCurrency === 'USD' ? 1 : 1);
          return val * to;
        }
        // from != USD: first to USD: val_in_USD = val / rates[from]
        const rFrom = rates[from] || (from === 'USD' ? 1 : 1);
        const rTo = rates[displayCurrency] || (displayCurrency === 'USD' ? 1 : 1);
        return (val / rFrom) * rTo;
      };

      const investedDisp = convert(investedAbs, a.currency);
      const currentDisp = convert(currentAbs, a.currency);
      const pnl = currentDisp - investedDisp;
      const pnlPct = investedDisp ? (pnl / investedDisp)*100 : 0;
      return {
        ...a,
        live,
        investedDisp,
        currentDisp,
        pnl,
        pnlPct
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolio, marketData, fx, displayCurrency]);

  const totals = useMemo(()=> {
    const invested = portLive.reduce((s,a)=> s + (a.investedDisp||0), 0);
    const current = portLive.reduce((s,a)=> s + (a.currentDisp||0), 0);
    const pnl = current - invested;
    const pnlPct = invested ? (pnl / invested)*100 : 0;
    return { invested, current, pnl, pnlPct };
  }, [portLive]);

  /* ---------------- UI actions ---------------- */
  const openAdd = () => { setEditing(null); setIsModalOpen(true); setQ(''); setSuggestions([]); };
  const openEdit = (asset) => { setEditing(asset); setIsModalOpen(true); setQ(''); setSuggestions([]); };
  const removeAsset = async (id) => {
    const next = portfolio.filter(p=>p.id !== id);
    // unsubscribe ws if open
    try {
      const ws = wsRef.current;
      const removed = portfolio.find(p=>p.id===id);
      if (ws && ws.readyState === WebSocket.OPEN && removed) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: removed.symbol }));
        subscribedRef.current.delete(removed.symbol);
      }
    } catch {}
    await persist(next);
  };

  const submitAsset = async (payload) => {
    const cleaned = {
      id: payload.id || Date.now(),
      symbol: (payload.symbol || '').toString().trim().toUpperCase(),
      qty: Number(payload.qty || payload.quantity || payload.qty === 0 ? payload.qty : payload.quantity) || Number(payload.quantity) || 0,
      purchasePrice: Number(payload.purchasePrice || payload.avg || payload.price) || 0,
      currency: payload.currency || 'USD',
      date: payload.date || ''
    };
    if (!cleaned.symbol) return alert('Symbol required');
    const exists = portfolio.find(p=>p.id === cleaned.id);
    let next;
    if (exists) next = portfolio.map(p => p.id===cleaned.id ? {...p, ...cleaned} : p);
    else next = [...portfolio, cleaned];

    // subscribe WS immediately if new
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN && !subscribedRef.current.has(cleaned.symbol)) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: cleaned.symbol }));
        subscribedRef.current.add(cleaned.symbol);
      }
    } catch {}

    await persist(next);
    setIsModalOpen(false);
    setEditing(null);
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="min-h-screen bg-black text-zinc-100 p-4">
      <div className="max-w-4xl mx-auto">

        {/* Top summary */}
        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-5 items-start sm:items-center">
          <div>
            <div className="text-xs text-zinc-400">PORTFOLIO</div>
            <div className="text-2xl font-semibold">My Portfolio</div>
            <div className="text-xs text-zinc-500 mt-1">{portfolio.length} assets • live prices</div>
          </div>

          <div className="flex gap-3 items-center">
            <div className="text-right">
              <div className="text-xs text-zinc-400">Invested</div>
              <div className="font-medium text-lg">{fmtIDR(totals.invested)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400">Market</div>
              <div className="font-medium text-lg">{fmtIDR(totals.current)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400">P&amp;L</div>
              <div className={`font-medium text-lg ${totals.pnl >=0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totals.pnl >= 0 ? '+' : ''}{fmtIDR(totals.pnl)} <span className="text-xs text-zinc-400">({totals.pnlPct?.toFixed(2)}%)</span>
              </div>
            </div>

            <button onClick={openAdd} className="ml-2 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-xl text-sm">
              <Plus size={16}/> Add
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-900 flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-300">Code</div>
            <div className="hidden sm:flex gap-6 text-xs text-zinc-500">
              <div className="w-20 text-right">Invested</div>
              <div className="w-20 text-right">Market</div>
              <div className="w-28 text-right">P&amp;L</div>
              <div className="w-12" />
            </div>
          </div>

          <div className="divide-y divide-zinc-900">
            {portLive.length === 0 ? (
              <div className="px-4 py-8 text-center text-zinc-500">Belum ada asset. Tekan Add untuk menambah.</div>
            ) : portLive.map((a) => (
              <div key={a.id} className="px-4 py-4 flex items-center justify-between hover:bg-zinc-900">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="font-semibold text-sm">{a.symbol}</div>
                    <div className="text-xs text-zinc-500">{a.qty} Lot</div>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {fmtIDR(a.investedDisp)} • <span className="text-zinc-400">{fmtNum(a.purchasePrice)}</span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-6 text-right">
                  <div className="w-20">{fmtIDR(a.investedDisp)}</div>
                  <div className="w-20">
                    <div className="text-sm font-medium text-emerald-400">{fmtIDR(a.currentDisp)}</div>
                    <div className="text-xs text-zinc-400">{fmtNum(a.live || 0)}</div>
                  </div>
                  <div className="w-28 text-right">
                    <div className={`${a.pnl>=0?'text-emerald-400':'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{fmtIDR(a.pnl)}</div>
                    <div className="text-xs text-zinc-400">{a.pnlPct?.toFixed(2)}%</div>
                  </div>
                  <div className="w-12 flex gap-2 justify-end">
                    <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16}/></button>
                    <button onClick={()=>removeAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
                  </div>
                </div>

                {/* mobile condensed */}
                <div className="sm:hidden flex items-center gap-3">
                  <div className={`${a.pnl>=0?'text-emerald-400':'text-red-400'} font-medium`}>{a.pnl >= 0 ? '+' : ''}{fmtIDR(a.pnl)}</div>
                  <div className="flex gap-2">
                    <button onClick={()=>openEdit(a)} className="text-zinc-300 hover:text-white"><Edit3 size={16}/></button>
                    <button onClick={()=>removeAsset(a.id)} className="text-red-500 hover:text-red-400"><Trash2 size={16}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom row: allocation simple */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-sm text-zinc-300 mb-2">Allocation</div>
            <div className="h-40">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={portLive.map(p=>({name:p.symbol, value: p.currentDisp}))} dataKey="value" nameKey="name" outerRadius={70}>
                    {portLive.map((_,i)=>(<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                  </Pie>
                  <Tooltip formatter={(v)=>fmtIDR(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4">
            <div className="text-sm text-zinc-300 mb-2">FX (USD base)</div>
            <div className="text-xs text-zinc-400 mb-2">Rates updated ~60s</div>
            <div className="text-sm"><div className="flex justify-between"><div>IDR</div><div className="font-medium">{fx?.IDR || '—'}</div></div></div>
          </div>
        </div>

      </div>

      {/* Modal: Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">{editing ? 'Edit Asset' : 'Add Asset'}</div>
              <button onClick={()=>{ setIsModalOpen(false); setEditing(null); setQ(''); setSuggestions([]); }} className="text-zinc-400">Close</button>
            </div>

            <form onSubmit={(e)=>{ e.preventDefault();
                const fd = new FormData(e.target);
                submitAsset({ id: editing?.id, symbol: fd.get('symbol'), qty: fd.get('qty'), purchasePrice: fd.get('price'), currency: fd.get('currency'), date: fd.get('date') });
              }} className="space-y-3">

              <div>
                <label className="text-xs text-zinc-400">Symbol</label>
                <input
                  name="symbol"
                  value={editing?.symbol ?? q}
                  onChange={(ev)=> {
                    const v = ev.target.value;
                    setQ(v);
                    setEditing(ed => ({ ...(ed||{}), symbol: v }));
                  }}
                  placeholder="Search symbol..."
                  autoComplete="off"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm"
                />
                {/* suggestions */}
                { (q && (suggestions.length>0 || loadingSearch)) && (
                  <div className="mt-1 max-h-44 overflow-auto bg-zinc-900 border border-zinc-800 rounded-md">
                    {loadingSearch ? <div className="p-2 text-xs text-zinc-500">Searching…</div> : suggestions.map(s=>(
                      <button key={s.symbol} type="button"
                        onClick={()=> { setEditing(ed=> ({ ...(ed||{}), symbol: s.symbol })); setQ(''); setSuggestions([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between text-sm"
                      >
                        <div>
                          <div className="font-medium">{s.symbol}</div>
                          <div className="text-xs text-zinc-500">{s.desc}</div>
                        </div>
                        <div className="text-xs text-zinc-400">pick</div>
                      </button>
                    )) }
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Qty</label>
                  <input name="qty" defaultValue={editing?.qty || editing?.quantity || ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
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
                  <input name="price" defaultValue={editing?.purchasePrice || editing?.avg || ''} type="number" step="any" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Date</label>
                  <input name="date" defaultValue={editing?.date || ''} type="date" className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={()=>{ setIsModalOpen(false); setEditing(null); setQ(''); setSuggestions([]); }} className="px-3 py-2 rounded-xl bg-zinc-800">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-600">Save</button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}

/* ----------------- End ----------------- */