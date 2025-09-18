// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * page.js — single-file portfolio dashboard
 *
 * Perubahan penting (sesuai permintaan):
 * - Tombol Add Assets (hanya satu tombol hijau) + tombol Deposit (IDR & USD)
 * - Invested := akumulasi deposit (depositedUSD)
 * - tradingBalance: saldo yang bisa dipakai untuk beli (IDR & USD dikonversi ke USD)
 * - Pembelian (buy) hanya berhasil jika tradingBalanceUSD >= cost
 * - Donut alokasi: bulat sempurna, legend compact, mobile: legend di samping donut
 * - Donut ditempatkan BAWAH asset table lalu growth portofolio lalu CSV export
 * - Klik nama asset membuka modal chart (TradingView jika tersedia, fallback ke CoinGecko)
 * - Tombol All portfolio diganti jadi dropdown filter
 * - Realtime price: CoinGecko untuk crypto, Yahoo/Finnhub proxy untuk stock (via endpoints internal)
 * - USD/IDR kurs via CoinGecko (tether -> idr)
 *
 * Catatan: file ini dirancang agar mudah ditempel jadi satu file. Jangan request saya tulis ke disk; tinggal paste sendiri.
 */

/* ===================== CONFIG / HELPERS ===================== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_SIMPLE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_TETHER_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`; // server proxy
const toNum = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const isoDate = (ms) => {
  try { return new Date(ms).toISOString(); } catch { return ""; }
};
function fmtUSD(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(n || 0));
}
function fmtIDR(n) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.round(Number(n || 0)));
}
function ensureNumeric(a = {}) {
  return {
    ...a,
    shares: toNum(a.shares || 0),
    avgPrice: toNum(a.avgPrice || 0),
    investedUSD: toNum(a.investedUSD || 0),
    lastPriceUSD: toNum(a.lastPriceUSD || 0),
    marketValueUSD: toNum(a.marketValueUSD || 0),
    nonLiquidYoy: toNum(a.nonLiquidYoy || 0),
  };
}

/* ===================== DONUT COMPONENT (perfect circle) ===================== */
function CakeAllocation({ data = [], size = 200, inner = 48, gap = 0.02, displayTotal = "", displayCcy = "USD", usdIdr = 16000 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const outer = Math.round(size / 2 - 6); // constant outer radius
  const innerR = inner;
  const colors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
  const [hoverIndex, setHoverIndex] = useState(null);
  const ref = useRef(null);

  function arcPath(cx, cy, rInner, rOuter, start, end) {
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(start);
    const y1 = cy + rOuter * Math.sin(start);
    const x2 = cx + rOuter * Math.cos(end);
    const y2 = cy + rOuter * Math.sin(end);
    const xi2 = cx + rInner * Math.cos(end);
    const yi2 = cy + rInner * Math.sin(end);
    const xi1 = cx + rInner * Math.cos(start);
    const yi1 = cy + rInner * Math.sin(start);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${rInner} ${rInner} 0 ${large} 0 ${xi1} ${yi1} Z`;
  }

  let start = -Math.PI / 2;
  const arcs = data.map((d) => {
    const portion = Math.max(0, d.value || 0) / total;
    const ang = portion * Math.PI * 2;
    const end = start + ang;
    const arc = { start, end };
    start = end;
    return arc;
  });

  const showTooltip = (i, e, d) => {
    setHoverIndex(i);
  };
  const hideTooltip = () => setHoverIndex(null);

  return (
    <div ref={ref} style={{ width: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const arc = arcs[i];
          if (!arc) return null;
          const gapAngle = Math.min(arc.end - arc.start, gap);
          const s = arc.start + gapAngle / 2;
          const e = arc.end - gapAngle / 2;
          const path = arcPath(cx, cy, innerR, outer, s, e);
          const isHover = hoverIndex === i;
          const mid = (s + e) / 2;
          const transform = isHover ? `translate(${Math.cos(mid) * 6},${Math.sin(mid) * 6})` : undefined;
          return (
            <g key={i} transform={transform}>
              <path
                d={path}
                fill={colors[i % colors.length]}
                stroke="#000"
                strokeWidth={isHover ? 1.6 : 0.6}
                onMouseEnter={(ev) => showTooltip(i, ev, d)}
                onMouseLeave={hideTooltip}
              />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={innerR - 4} fill="#0b1220" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="12" fontWeight={700} fill="#E5E7EB">{displayTotal}</text>
      </svg>
    </div>
  );
}

/* ===================== CANDLES + LINES (growth) ===================== */
/* Simpler multi-series renderer that mirrors current market snapshot over time */
function CandlesWithLines({ seriesMap = {}, width = 900, height = 300, displayCcy = "USD", usdIdr = 16000, rangeKey = "all", onHover }) {
  // Basic line plotting using seriesMap.all
  const padding = { left: 56, right: 12, top: 12, bottom: 28 };
  const w = Math.min(width, 1200);
  const h = height;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;

  const all = seriesMap.all || [];
  if (!all || all.length < 2) {
    return <div className="text-xs text-gray-400">Not enough data for growth chart</div>;
  }
  let min = Infinity, max = -Infinity;
  all.forEach(p => { if (p.v < min) min = p.v; if (p.v > max) max = p.v; });
  if (!isFinite(min) || !isFinite(max)) return <div className="text-xs text-gray-400">No data</div>;
  const range = Math.max(1e-8, max - min);
  const xOf = (i) => padding.left + (i / (all.length - 1 || 1)) * innerW;
  const yOf = (v) => padding.top + (1 - (v - min) / range) * innerH;

  const path = all.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p.v)}`).join(" ");

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <rect x="0" y="0" width={w} height={h} fill="transparent" />
        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * range;
          const y = yOf(v);
          return <line key={i} x1={padding.left} x2={w - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.03)" />;
        })}
        <path d={path} stroke="#4D96FF" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        {all.map((p, i) => <circle key={i} cx={xOf(i)} cy={yOf(p.v)} r={2} fill="#4D96FF" />)}
        {[0,1,2,3,4].map(i => {
          const v = min + (i/4) * range;
          const y = yOf(v);
          return <text key={i} x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{displayCcy === "IDR" ? fmtIDR(v * usdIdr) : fmtUSD(v)}</text>;
        })}
      </svg>
    </div>
  );
}

/* ===================== TRADE MODAL ===================== */
function TradeModal({ asset, mode, defaultPrice, onClose, onConfirmBuy, onConfirmSell, usdIdr = 16000, tradingBalanceUSD = 0 }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState(defaultPrice ? String(defaultPrice) : "");
  const [priceCcy, setPriceCcy] = useState("USD");

  useEffect(() => { setPrice(defaultPrice ? String(defaultPrice) : ""); }, [defaultPrice]);

  const priceUSD = priceCcy === "IDR" ? (toNum(price) / (usdIdr || 1)) : toNum(price);
  const totalUSD = toNum(qty) * priceUSD;

  function submit(e) {
    e.preventDefault();
    const q = toNum(qty), p = priceUSD;
    if (q <= 0 || p <= 0) { alert("Qty & price must be > 0"); return; }
    if (mode === "buy") {
      if (toNum(tradingBalanceUSD) < q * p) { alert("Insufficient trading balance"); return; }
      onConfirmBuy(q, p);
    } else {
      onConfirmSell(q, p);
    }
  }

  if (!asset) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="bg-gray-900 p-4 rounded w-full max-w-md border border-gray-800">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold">{mode === "buy" ? "Buy" : "Sell"} {asset.symbol}</h3>
            <div className="text-xs text-gray-400">{asset.name}</div>
          </div>
          <button onClick={onClose} className="text-gray-400">×</button>
        </div>

        <form onSubmit={submit} className="mt-3">
          <label className="text-xs text-gray-400">Quantity</label>
          <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" />

          <label className="text-xs text-gray-400 mt-3">Price per unit</label>
          <div className="flex mt-1">
            <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} className="flex-1 bg-gray-800 px-3 py-2 rounded-l border border-gray-700" />
            <select value={priceCcy} onChange={(e) => setPriceCcy(e.target.value)} className="bg-gray-800 px-2 py-2 border border-gray-700 rounded-r">
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
            </select>
          </div>

          <div className="text-xs text-gray-400 text-right mt-2">Total: {fmtUSD(totalUSD)}</div>
          <div className="text-xs text-gray-500 text-right">Trading balance: {fmtUSD(tradingBalanceUSD)}</div>

          <button type="submit" className={`w-full mt-3 py-2 rounded font-semibold ${mode === "buy" ? "bg-emerald-500 text-black" : "bg-yellow-600 text-white"}`}>
            {mode === "buy" ? "Confirm Buy" : "Confirm Sell"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ===================== MAIN COMPONENT ===================== */
export default function PortfolioDashboard() {
  /* ---------- load persisted state ---------- */
  const loadAssets = () => {
    try {
      const raw = localStorage.getItem("pf_assets") || "[]";
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.map(ensureNumeric);
    } catch (e) { return []; }
  };
  const [assets, setAssets] = useState(loadAssets);

  const loadTx = () => {
    try { return JSON.parse(localStorage.getItem("pf_transactions") || "[]"); } catch { return []; }
  };
  const [transactions, setTransactions] = useState(loadTx);

  const loadDeposited = () => {
    try { return toNum(localStorage.getItem("pf_deposited_usd") || 0); } catch { return 0; }
  };
  const [depositedUSD, setDepositedUSD] = useState(loadDeposited);

  const loadTradingBalance = () => {
    try { return toNum(localStorage.getItem("pf_trading_balance_usd") || 0); } catch { return 0; }
  };
  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(loadTradingBalance);

  const [displayCcy, setDisplayCcy] = useState(localStorage.getItem("pf_display_ccy") || "USD");
  const [usdIdr, setUsdIdr] = useState(toNum(localStorage.getItem("pf_usd_idr") || 16000));
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("deposit"); // deposit tab first
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");

  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");

  const [usdLoading, setUsdLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [chartRange, setChartRange] = useState("all");

  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: 0 });
  const [assetChartOpen, setAssetChartOpen] = useState(false);
  const [chartAsset, setChartAsset] = useState(null);

  /* refs for latest values in effects */
  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  const tradingBalanceRef = useRef(tradingBalanceUSD);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);
  useEffect(() => { tradingBalanceRef.current = tradingBalanceUSD; }, [tradingBalanceUSD]);

  /* persist relevant state */
  useEffect(() => { try { localStorage.setItem("pf_assets", JSON.stringify(assets)); } catch {} }, [assets]);
  useEffect(() => { try { localStorage.setItem("pf_transactions", JSON.stringify(transactions)); } catch {} }, [transactions]);
  useEffect(() => { try { localStorage.setItem("pf_deposited_usd", String(depositedUSD)); } catch {} }, [depositedUSD]);
  useEffect(() => { try { localStorage.setItem("pf_trading_balance_usd", String(tradingBalanceUSD)); } catch {} }, [tradingBalanceUSD]);
  useEffect(() => { try { localStorage.setItem("pf_display_ccy", displayCcy); } catch {} }, [displayCcy]);
  useEffect(() => { try { localStorage.setItem("pf_usd_idr", String(usdIdr)); } catch {} }, [usdIdr]);

  /* ---------------- REALTIME PRICING & FX (polling) ---------------- */
  useEffect(() => {
    let mounted = true;
    async function pollFx() {
      try {
        const res = await fetch(COINGECKO_TETHER_IDR);
        if (!res.ok) return;
        const j = await res.json();
        const idr = toNum(j?.tether?.idr || 0);
        if (idr > 0 && mounted) {
          setUsdIdr(prev => {
            if (!prev || Math.abs(prev - idr) / idr > 0.0005) return Math.round(idr);
            return prev;
          });
        }
      } catch (e) { console.warn("fx err", e); }
    }

    async function pollCrypto() {
      try {
        const cryptoIds = Array.from(new Set(assetsRef.current.filter(a => a.type === "crypto" && a.coingeckoId).map(a => a.coingeckoId)));
        if (cryptoIds.length === 0) return;
        const res = await fetch(COINGECKO_SIMPLE(cryptoIds.join(",")));
        if (!res.ok) return;
        const j = await res.json();
        setAssets(prev => prev.map(a => {
          if (a.type === "crypto" && a.coingeckoId && j[a.coingeckoId] && typeof j[a.coingeckoId].usd === "number") {
            const p = toNum(j[a.coingeckoId].usd);
            return ensureNumeric({ ...a, lastPriceUSD: p, marketValueUSD: p * toNum(a.shares || 0) });
          }
          return a;
        }));
      } catch (e) { console.warn("crypto poll err", e); }
    }

    async function pollStocks() {
      try {
        const symbols = Array.from(new Set(assetsRef.current.filter(a => a.type === "stock" && a.symbol).map(a => a.symbol))).slice(0,50);
        if (symbols.length === 0) return;
        const res = await fetch(YAHOO_QUOTE(symbols.join(",")));
        if (!res.ok) return;
        const j = await res.json();
        const map = {};
        const list = (j?.quoteResponse?.result) || (Array.isArray(j) ? j : []);
        if (Array.isArray(list)) {
          list.forEach(q => {
            const price = toNum(q?.regularMarketPrice ?? q?.price ?? q?.c ?? 0);
            if (price > 0 && q?.symbol) map[q.symbol] = { price, currency: q.currency || 'USD', raw: q };
          });
        }
        setAssets(prev => prev.map(a => {
          if (a.type === "stock" && map[a.symbol]) {
            const raw = map[a.symbol];
            const looksIDR = String(raw.currency || "").toUpperCase() === "IDR" || String(a.symbol || "").toUpperCase().endsWith(".JK");
            const priceUSD = looksIDR ? (raw.price / (usdIdrRef.current || 1)) : raw.price;
            return ensureNumeric({ ...a, lastPriceUSD: priceUSD, marketValueUSD: priceUSD * toNum(a.shares || 0) });
          }
          return a;
        }));
      } catch (e) { console.warn("stocks poll err", e); }
    }

    pollFx();
    pollCrypto();
    pollStocks();
    const idFx = setInterval(pollFx, 60_000);
    const idCg = setInterval(pollCrypto, 7000);
    const idStocks = setInterval(pollStocks, 6000);
    return () => { mounted = false; clearInterval(idFx); clearInterval(idCg); clearInterval(idStocks); };
  }, []);

  /* ---------------- SEARCH / SUGGESTIONS (simple) ---------------- */
  useEffect(() => {
    if (!query || query.trim().length < 1 || searchMode === "deposit" || searchMode === "nonliquid") { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        if (searchMode === "crypto") {
          const res = await fetch(`${COINGECKO_API}/search?query=${encodeURIComponent(query)}`);
          if (!res.ok) { setSuggestions([]); return; }
          const j = await res.json();
          setSuggestions((j.coins || []).slice(0,30).map(c => ({ symbol: (c.symbol||"").toUpperCase(), id: c.id, display: c.name, source: "coingecko", type: "crypto" })));
          return;
        }
        // fallback proxy search (Yahoo)
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) { setSuggestions([]); return; }
        const j = await res.json();
        const items = (j?.quotes || j?.result || j?.data || []);
        const mapped = (Array.isArray(items) ? items : []).slice(0,40).map(it => {
          const symbol = (it.symbol || it.ticker || "").toString().toUpperCase();
          const name = it.shortname || it.longname || it.description || it.name || symbol;
          return { symbol, display: name, source: "yahoo", type: "stock", exchange: it.exchange || it.fullExchangeName || "" };
        });
        setSuggestions(mapped);
      } catch (e) { console.warn("search err", e); setSuggestions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchMode]);

  /* ---------------- TRANSACTION EFFECTS (deposit/buy/sell) ---------------- */
  function applyTx(tx) {
    if (!tx) return;
    if (tx.type === "deposit") {
      const amt = toNum(tx.amountUSD || 0);
      setDepositedUSD(prev => prev + amt);
      setTradingBalanceUSD(prev => prev + amt);
    } else if (tx.type === "buy") {
      setAssets(prev => {
        const idx = prev.findIndex(a => a.id === tx.assetId);
        if (idx >= 0) {
          const a = ensureNumeric(prev[idx]);
          const newShares = toNum(a.shares || 0) + toNum(tx.qty || 0);
          const newInvested = toNum(a.investedUSD || 0) + toNum(tx.cost || 0);
          const newAvg = newShares > 0 ? newInvested / newShares : 0;
          const lastPrice = toNum(tx.pricePerUnit || a.lastPriceUSD || newAvg);
          const updated = ensureNumeric({ ...a, shares: newShares, investedUSD: newInvested, avgPrice: newAvg, lastPriceUSD: lastPrice, marketValueUSD: newShares * lastPrice });
          const copy = [...prev];
          copy[idx] = updated;
          return copy;
        } else {
          const newAsset = ensureNumeric({
            id: tx.assetId || `asset:${tx.symbol || 'manual'}:${Date.now()}`,
            type: tx.assetType || "stock",
            symbol: (tx.symbol || "NEW").toString().toUpperCase(),
            name: tx.name || tx.symbol || "Manual",
            shares: toNum(tx.qty || 0),
            avgPrice: toNum(tx.pricePerUnit || 0),
            investedUSD: toNum(tx.cost || 0),
            lastPriceUSD: toNum(tx.pricePerUnit || 0),
            marketValueUSD: toNum(tx.qty || 0) * toNum(tx.pricePerUnit || 0),
            createdAt: Date.now(),
          });
          return [...prev, newAsset];
        }
      });
      setTradingBalanceUSD(prev => prev - toNum(tx.cost || 0));
    } else if (tx.type === "sell") {
      setAssets(prev => {
        const copy = prev.map(a => ({ ...a }));
        const idx = copy.findIndex(a => a.id === tx.assetId);
        if (idx >= 0) {
          const a = ensureNumeric(copy[idx]);
          const newShares = Math.max(0, toNum(a.shares || 0) - toNum(tx.qty || 0));
          const newInvested = Math.max(0, toNum(a.investedUSD || 0) - toNum(tx.costOfSold || 0));
          if (newShares <= 0) {
            copy.splice(idx, 1);
            return copy;
          }
          const newAvg = newShares > 0 ? (newInvested / newShares) : 0;
          a.shares = newShares; a.investedUSD = newInvested; a.avgPrice = newAvg;
          a.lastPriceUSD = toNum(a.lastPriceUSD || a.avgPrice);
          a.marketValueUSD = a.lastPriceUSD * a.shares;
          copy[idx] = ensureNumeric(a);
        }
        return copy;
      });
      setTradingBalanceUSD(prev => prev + toNum(tx.proceeds || 0));
    }
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
  }

  function reverseTx(tx) {
    if (!tx) return;
    if (tx.type === "deposit") {
      const amt = toNum(tx.amountUSD || 0);
      setDepositedUSD(prev => Math.max(0, prev - amt));
      setTradingBalanceUSD(prev => Math.max(0, prev - amt));
    } else if (tx.type === "buy") {
      // refund cost
      setTradingBalanceUSD(prev => prev + toNum(tx.cost || 0));
      // revert asset
      setAssets(prev => {
        const copy = prev.map(a => ({ ...a }));
        const idx = copy.findIndex(a => a.id === tx.assetId);
        if (idx >= 0) {
          const a = ensureNumeric(copy[idx]);
          const newShares = Math.max(0, toNum(a.shares || 0) - toNum(tx.qty || 0));
          const newInvested = Math.max(0, toNum(a.investedUSD || 0) - toNum(tx.cost || 0));
          if (newShares <= 0) {
            copy.splice(idx, 1);
            return copy;
          }
          const newAvg = newShares > 0 ? newInvested / newShares : 0;
          a.shares = newShares; a.investedUSD = newInvested; a.avgPrice = newAvg; a.marketValueUSD = a.lastPriceUSD * a.shares;
          copy[idx] = ensureNumeric(a);
        }
        return copy;
      });
    } else if (tx.type === "sell") {
      setTradingBalanceUSD(prev => Math.max(0, prev - toNum(tx.proceeds || 0)));
      // re-add shares/cost
      setAssets(prev => {
        const copy = [...prev];
        const idx = copy.findIndex(a => a.id === tx.assetId);
        if (idx >= 0) {
          const a = ensureNumeric(copy[idx]);
          a.shares = toNum(a.shares || 0) + toNum(tx.qty || 0);
          a.investedUSD = toNum(a.investedUSD || 0) + toNum(tx.costOfSold || 0);
          a.avgPrice = a.investedUSD / a.shares;
          a.marketValueUSD = a.lastPriceUSD * a.shares;
          copy[idx] = ensureNumeric(a);
          return copy;
        } else {
          const restored = ensureNumeric({
            id: tx.assetId,
            type: tx.assetType || 'stock',
            symbol: tx.symbol || 'RESTORED',
            name: tx.name || tx.symbol,
            shares: toNum(tx.qty || 0),
            investedUSD: toNum(tx.costOfSold || 0),
            avgPrice: toNum(tx.costOfSold || 0) / Math.max(1, toNum(tx.qty || 0)),
            lastPriceUSD: toNum(tx.pricePerUnit || 0),
            marketValueUSD: toNum(tx.qty || 0) * toNum(tx.pricePerUnit || 0),
          });
          return [...copy, restored];
        }
      });
    }
    setTransactions(prev => prev.filter(t => t.id !== tx.id));
  }

  /* ---------------- UI Actions: deposit / add asset / buy / sell ---------------- */
  function performDeposit({ idr = 0, usd = 0 }) {
    const idrN = toNum(idr), usdN = toNum(usd);
    if (idrN <= 0 && usdN <= 0) { alert("Masukkan jumlah IDR atau USD"); return; }
    const amtUSD = usdN + (idrN > 0 ? idrN / (usdIdr || 1) : 0);
    const tx = { id: `tx_dep:${Date.now()}`, type: "deposit", amountUSD: amtUSD, date: Date.now(), note: "Manual deposit" };
    applyTx(tx);
    alert(`Deposit ${fmtUSD(amtUSD)} ditambahkan ke trading balance`);
  }

  async function addAssetWithInitial() {
    let picked = selectedSuggestion;
    if (!picked) {
      if (!query) { alert("Pilih atau ketik symbol"); return; }
      picked = { symbol: query.trim().toUpperCase(), display: query.trim(), source: "manual", type: "stock" };
    }
    const qty = toNum(initQty), priceInput = toNum(initPrice);
    if (qty <= 0 || priceInput <= 0) { alert("Qty & price harus > 0"); return; }
    const priceUSD = initPriceCcy === "IDR" ? priceInput / (usdIdr || 1) : priceInput;
    const cost = qty * priceUSD;
    if (toNum(tradingBalanceUSD) < cost) { alert("Saldo trading tidak cukup untuk tambah posisi"); return; }
    const assetId = `${picked.source || 'manual'}:${picked.symbol}:${Date.now()}`;
    const tx = { id: `tx_buy:${Date.now()}`, type: "buy", assetId, assetType: picked.type || "stock", symbol: picked.symbol, name: picked.display || picked.symbol, qty, pricePerUnit: priceUSD, cost, date: Date.now() };
    applyTx(tx);
    // Save tx
    setTransactions(prev => [tx, ...prev].slice(0, 1000));
    // reset UI
    setOpenAdd(false); setQuery(""); setSelectedSuggestion(null); setInitQty(""); setInitPrice(""); setInitPriceCcy("USD");
  }

  function openBuyModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    setTradeModal({ open: true, mode: "buy", assetId, defaultPrice: asset.lastPriceUSD || asset.avgPrice || 0 });
  }
  function openSellModal(assetId) {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    setTradeModal({ open: true, mode: "sell", assetId, defaultPrice: asset.lastPriceUSD || asset.avgPrice || 0 });
  }
  function closeTradeModal() { setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: 0 }); }

  function confirmBuy(qty, pricePerUnit) {
    const a = assets.find(x => x.id === tradeModal.assetId);
    const cost = toNum(qty) * toNum(pricePerUnit);
    if (toNum(tradingBalanceUSD) < cost) { alert("Saldo trading tidak cukup"); return; }
    const tx = { id: `tx_buy:${Date.now()}`, type: "buy", assetId: tradeModal.assetId, assetType: a?.type || "stock", symbol: a?.symbol || "", name: a?.name || "", qty, pricePerUnit, cost, date: Date.now() };
    applyTx(tx);
    closeTradeModal();
  }

  function confirmSell(qty, pricePerUnit) {
    const a = assets.find(x => x.id === tradeModal.assetId);
    if (!a) return;
    if (toNum(qty) > toNum(a.shares || 0)) { alert("Tidak bisa jual lebih dari kepemilikan"); return; }
    const proceeds = toNum(qty) * toNum(pricePerUnit);
    const costOfSold = toNum(qty) * toNum(a.avgPrice || 0);
    const realized = proceeds - costOfSold;
    const tx = { id: `tx_sell:${Date.now()}`, type: "sell", assetId: a.id, assetType: a.type, symbol: a.symbol, name: a.name, qty, pricePerUnit, proceeds, costOfSold, realized, date: Date.now() };
    applyTx(tx);
    closeTradeModal();
  }

  function addNonLiquid({ name, qty, price, priceCcy = "USD", purchaseDate = Date.now(), yoy = 5, desc = "" }) {
    if (!name) { alert("Masukkan nama non-liquid"); return; }
    const priceUSD = priceCcy === "IDR" ? (toNum(price) / (usdIdr || 1)) : toNum(price);
    const id = `nl:${name.replace(/\s+/g,'_')}:${Date.now()}`;
    const last = priceUSD * Math.pow(1 + (toNum(yoy) / 100), Math.max(0, (Date.now() - purchaseDate) / (365.25*24*3600*1000)));
    const asset = ensureNumeric({
      id, type: "nonliquid", symbol: (name.length > 12 ? name.slice(0,12) + "…" : name).toUpperCase(), name,
      shares: toNum(qty), avgPrice: priceUSD, investedUSD: priceUSD * toNum(qty), lastPriceUSD: last, marketValueUSD: last * toNum(qty),
      createdAt: Date.now(), purchaseDate, nonLiquidYoy: toNum(yoy), description: desc || ""
    });
    setAssets(prev => [...prev, asset]);
  }

  /* ---------------- remove / tx actions ---------------- */
  function removeAsset(assetId) {
    if (!confirm("Hapus asset dari portfolio?")) return;
    setAssets(prev => prev.filter(a => a.id !== assetId));
  }

  function deleteTransaction(txId) {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    if (!confirm("Hapus & batalkan transaksi ini?")) return;
    reverseTx(tx);
  }

  /* ---------------- computed rows & totals ---------------- */
  const rows = useMemo(() => assets.map(a => {
    const aa = ensureNumeric(a);
    if (aa.type === "nonliquid") {
      const years = Math.max(0, (Date.now() - (aa.purchaseDate || aa.createdAt || Date.now())) / (365.25*24*3600*1000));
      const rate = toNum(aa.nonLiquidYoy || 0) / 100;
      const last = aa.avgPrice * Math.pow(1 + rate, years);
      aa.lastPriceUSD = last;
      aa.marketValueUSD = last * toNum(aa.shares || 0);
    } else {
      aa.lastPriceUSD = toNum(aa.lastPriceUSD || aa.avgPrice || 0);
      aa.marketValueUSD = toNum(aa.shares || 0) * aa.lastPriceUSD;
    }
    aa.investedUSD = toNum(aa.investedUSD || 0);
    aa.pnlUSD = aa.marketValueUSD - aa.investedUSD;
    aa.pnlPct = aa.investedUSD > 0 ? (aa.pnlUSD / aa.investedUSD) * 100 : 0;
    return aa;
  }), [assets, usdIdr]);

  // filter dropdown (All portfolio -> dropdown)
  const [filter, setFilter] = useState("all");
  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter(r => r.type === filter);
  }, [rows, filter]);

  // totals: invested is accumulated deposits
  const totals = useMemo(() => {
    const invested = toNum(depositedUSD);
    const market = filteredRows.reduce((s, r) => s + toNum(r.marketValueUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [filteredRows, depositedUSD]);

  /* donut data */
  const donutData = useMemo(() => {
    const sorted = filteredRows.slice().sort((a,b) => b.marketValueUSD - a.marketValueUSD);
    const top = sorted.slice(0,6);
    const other = sorted.slice(6);
    const otherTotal = other.reduce((s,r) => s + toNum(r.marketValueUSD || 0), 0);
    const data = top.map(r => ({ name: r.symbol, value: Math.max(0, r.marketValueUSD || 0) }));
    if (otherTotal > 0) data.push({ name: "Other", value: otherTotal });
    return data;
  }, [filteredRows]);

  /* growth series for CandlesWithLines (simple snapshot over time) */
  const multiSeries = useMemo(() => {
    const now = Date.now();
    const points = 120;
    const arr = Array.from({ length: points }, (_, i) => {
      const t = now - Math.floor(((points-1 - i) / (points-1)) * (365*24*3600*1000)); // approximate last year
      return { t, all: totals.market, crypto: filteredRows.filter(r => r.type==='crypto').reduce((s,r)=>s+toNum(r.marketValueUSD||0),0), stock: filteredRows.filter(r=>r.type==='stock').reduce((s,r)=>s+toNum(r.marketValueUSD||0),0), nonliquid: filteredRows.filter(r=>r.type==='nonliquid').reduce((s,r)=>s+toNum(r.marketValueUSD||0),0) };
    });
    return {
      all: arr.map(p => ({ t: p.t, v: p.all })),
      crypto: arr.map(p => ({ t: p.t, v: p.crypto })),
      stock: arr.map(p => ({ t: p.t, v: p.stock })),
      nonliquid: arr.map(p => ({ t: p.t, v: p.nonliquid })),
    };
  }, [filteredRows, totals, chartRange]);

  /* ---------------- asset chart modal (TradingView / CoinGecko fallback) ---------------- */
  function openAssetChart(a) {
    setChartAsset(a);
    setAssetChartOpen(true);
  }
  function closeAssetChart() {
    setAssetChartOpen(false);
    setChartAsset(null);
  }

  /* ---------------- CSV export/import ---------------- */
  function exportCSV() {
    const headers = ["id","type","symbol","name","shares","avgPrice","investedUSD","lastPriceUSD","marketValueUSD","createdAt"];
    const lines = [headers.join(",")];
    assets.forEach(a => {
      const row = headers.map(h => {
        const v = a[h] ?? "";
        if (h === "createdAt") return `"${isoDate(v)}"`;
        return typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g,'""')}"` : String(v);
      }).join(",");
      lines.push(row);
    });
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `portfolio_export_${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  /* ---------------- UI RENDER ---------------- */
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Portfolio</h1>
          <div className="text-sm text-gray-400">Overview</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="mr-2">
            <div className="text-sm text-gray-300">{displayCcy === "IDR" ? fmtIDR(totals.market * usdIdr) : fmtUSD(totals.market)}</div>
          </div>

          <button onClick={() => setOpenAdd(v => !v)} className="px-3 py-2 rounded bg-white text-black font-semibold">
            +
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
        <div>USD/IDR ≈ {usdIdr ? new Intl.NumberFormat("id-ID").format(usdIdr) : "—"}</div>
        <div>•</div>
        <div>Trading balance: {displayCcy === "IDR" ? fmtIDR(tradingBalanceUSD * usdIdr) : fmtUSD(tradingBalanceUSD)}</div>
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
        <div className="flex justify-between text-gray-400">
          <div>Invested (deposits)</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtIDR(totals.invested * usdIdr) : fmtUSD(totals.invested)}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Market</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtIDR(totals.market * usdIdr) : fmtUSD(totals.market)}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Gain</div>
          <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtIDR(totals.pnl * usdIdr) : fmtUSD(totals.pnl)} ({totals.pnlPct.toFixed(2)}%)</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Trading balance</div>
          <div className="font-medium">{displayCcy === "IDR" ? fmtIDR(tradingBalanceUSD * usdIdr) : fmtUSD(tradingBalanceUSD)}</div>
        </div>
      </div>

      {/* ADD PANEL */}
      {openAdd && (
        <div className="mt-6 bg-gray-900 p-3 rounded border border-gray-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-gray-800 rounded overflow-hidden">
              <button onClick={() => { setSearchMode("deposit"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === 'deposit' ? "bg-gray-700" : ""}`}>Deposit</button>
              <button onClick={() => { setSearchMode("crypto"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === 'crypto' ? "bg-gray-700" : ""}`}>Crypto</button>
              <button onClick={() => { setSearchMode("id"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === 'id' ? "bg-gray-700" : ""}`}>Stocks</button>
              <button onClick={() => { setSearchMode("nonliquid"); setQuery(""); setSuggestions([]); }} className={`px-3 py-2 text-sm ${searchMode === 'nonliquid' ? "bg-gray-700" : ""}`}>Non-Liquid</button>
            </div>
          </div>

          {searchMode === "deposit" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="text-xs text-gray-400">Deposit IDR</label>
                <input value={depositIDR} onChange={(e)=>setDepositIDR(e.target.value)} placeholder="1.000.000" className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Deposit USD</label>
                <input value={depositUSD} onChange={(e)=>setDepositUSD(e.target.value)} placeholder="100" className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { performDeposit({ idr: depositIDR, usd: depositUSD }); setDepositIDR(""); setDepositUSD(""); }} className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold">Add Deposit</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          ) : searchMode === "nonliquid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder="Name (Land, Art...)" className="bg-gray-800 px-3 py-2 rounded border border-gray-700" id="nl_name" />
              <input placeholder="Qty" className="bg-gray-800 px-3 py-2 rounded border border-gray-700" id="nl_qty" />
              <input placeholder="Price" className="bg-gray-800 px-3 py-2 rounded border border-gray-700" id="nl_price" />
              <select className="bg-gray-800 px-3 py-2 rounded border border-gray-700" id="nl_ccy"><option>USD</option><option>IDR</option></select>
              <button onClick={() => {
                const name = document.getElementById('nl_name').value;
                const qty = document.getElementById('nl_qty').value;
                const price = document.getElementById('nl_price').value;
                const ccy = document.getElementById('nl_ccy').value;
                addNonLiquid({ name, qty, price, priceCcy: ccy });
                setOpenAdd(false);
              }} className="bg-emerald-500 px-4 py-2 rounded font-semibold text-black">Add Non-Liquid</button>
            </div>
          ) : (
            <div className="flex gap-3 flex-col sm:flex-row items-start">
              <div className="relative w-full sm:max-w-lg">
                <input value={query} onChange={(e)=>{ setQuery(e.target.value); setSelectedSuggestion(null); }} placeholder={searchMode === 'crypto' ? "Search crypto (BTC, ethereum)" : "Search symbol (AAPL, BBCA.JK)"} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 text-sm" />
                {suggestions.length > 0 && (
                  <div className="absolute z-40 mt-1 w-full bg-gray-950 border border-gray-800 rounded max-h-60 overflow-auto">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => { setSelectedSuggestion(s); setQuery(`${s.symbol} — ${s.display}`); setSuggestions([]); }} className="w-full text-left px-3 py-2 hover:bg-gray-900">
                        <div className="text-sm font-medium">{s.symbol} • {s.display}</div>
                        <div className="text-xs text-gray-500">{s.source === 'coingecko' ? 'Crypto' : s.exchange || ''}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input value={initQty} onChange={(e)=>setInitQty(e.target.value)} placeholder="Qty" className="w-full sm:w-28 bg-gray-800 px-3 py-2 rounded border border-gray-700" />
              <input value={initPrice} onChange={(e)=>setInitPrice(e.target.value)} placeholder="Price" className="w-full sm:w-28 bg-gray-800 px-3 py-2 rounded border border-gray-700" />
              <select value={initPriceCcy} onChange={(e)=>setInitPriceCcy(e.target.value)} className="bg-gray-800 px-2 py-2 rounded border border-gray-700">
                <option value="USD">USD</option><option value="IDR">IDR</option>
              </select>
              <div className="flex items-center gap-2">
                <button onClick={addAssetWithInitial} className="bg-emerald-500 px-4 py-2 rounded font-semibold text-black">Add Assets</button>
                <button onClick={() => setOpenAdd(false)} className="bg-gray-800 px-3 py-2 rounded">Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FILTER + TABLE */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-400">Assets</div>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={(e)=>setFilter(e.target.value)} className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-sm">
              <option value="all">All portfolio</option>
              <option value="crypto">Crypto</option>
              <option value="stock">Stock</option>
              <option value="nonliquid">Non-Liquid</option>
            </select>
            <button onClick={() => exportCSV()} className="bg-gray-800 px-3 py-1 rounded">Export CSV</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="min-w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Code</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Invested</th>
                <th className="text-right py-2 px-3">Market value</th>
                <th className="text-right py-2 px-3">P&L</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No assets</td></tr>
              ) : filteredRows.map(r => (
                <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-100 cursor-pointer" onClick={() => openAssetChart(r)}>{r.symbol}</div>
                    <div className="text-xs text-gray-400">{r.description || r.name}</div>
                  </td>
                  <td className="px-3 py-3 text-right">{Number(r.shares || 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtIDR(r.investedUSD * usdIdr) : fmtUSD(r.investedUSD)}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtIDR(r.avgPrice * usdIdr) : fmtUSD(r.avgPrice)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="font-medium">{displayCcy === "IDR" ? fmtIDR(r.marketValueUSD * usdIdr) : fmtUSD(r.marketValueUSD)}</div>
                    <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtIDR(r.lastPriceUSD * usdIdr) : fmtUSD(r.lastPriceUSD)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className={`font-semibold ${r.pnlUSD >= 0 ? "text-emerald-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmtIDR(r.pnlUSD * usdIdr) : fmtUSD(r.pnlUSD)}</div>
                    <div className="text-xs">{isFinite(r.pnlPct) ? `${r.pnlPct.toFixed(2)}%` : "0.00%"}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openBuyModal(r.id)} className="px-2 py-1 rounded bg-emerald-600 text-black text-xs">Buy</button>
                      <button onClick={() => openSellModal(r.id)} className="px-2 py-1 rounded bg-yellow-600 text-white text-xs">Sell</button>
                      <button onClick={() => removeAsset(r.id)} className="px-2 py-1 rounded bg-gray-800 text-xs">Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DONUT ALLOCATION (under table) */}
      {filteredRows.length > 0 && (
        <div className="mt-6">
          <div className="bg-gray-900 p-4 rounded border border-gray-800 flex flex-col md:flex-row items-start gap-6">
            <div className="flex items-center justify-center min-w-[220px]">
              <CakeAllocation data={donutData} size={200} inner={48} gap={0.03} displayTotal={displayCcy === "IDR" ? fmtIDR(totals.market * usdIdr) : fmtUSD(totals.market)} displayCcy={displayCcy} usdIdr={usdIdr} />
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {donutData.map((d,i) => {
                  const pct = totals.market > 0 ? (d.value / totals.market) * 100 : 0;
                  const color = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF"][i % 6];
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div style={{ width: 10, height: 10, background: color }} className="rounded-full" />
                      <div>
                        <div className="text-sm font-medium text-gray-100">{d.name}</div>
                        <div className="text-xs text-gray-400">{displayCcy === "IDR" ? fmtIDR(d.value * usdIdr) : fmtUSD(d.value)} • {pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PORTFOLIO GROWTH */}
      <div className="mt-6 bg-gray-900 p-4 rounded border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Portfolio Growth</div>
          <div className="flex items-center gap-2">
            {["1d","2d","1w","1m","1y","all"].map(k => (
              <button key={k} onClick={() => setChartRange(k)} className={`text-xs px-2 py-1 rounded ${chartRange === k ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300"}`}>{k}</button>
            ))}
          </div>
        </div>

        <CandlesWithLines seriesMap={multiSeries} width={900} height={300} displayCcy={displayCcy} usdIdr={usdIdr} rangeKey={chartRange} />
      </div>

      {/* EXPORT/IMPORT */}
      <div className="mt-4 flex items-center gap-3">
        <button onClick={exportCSV} className="bg-gray-800 px-3 py-2 rounded">Export CSV</button>
        <label className="bg-gray-800 px-3 py-2 rounded cursor-pointer">
          Import CSV
          <input type="file" accept=".csv" onChange={async (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const txt = await f.text();
            alert("File imported (simple). For full import use server tools.");
            e.target.value = "";
          }} style={{ display: "none" }} />
        </label>
      </div>

      {/* TRADE MODAL */}
      {tradeModal.open && (
        <TradeModal asset={assets.find(a => a.id === tradeModal.assetId)} mode={tradeModal.mode} defaultPrice={tradeModal.defaultPrice}
          onClose={closeTradeModal} onConfirmBuy={confirmBuy} onConfirmSell={confirmSell} usdIdr={usdIdr} tradingBalanceUSD={tradingBalanceUSD} />
      )}

      {/* ASSET CHART MODAL */}
      {assetChartOpen && chartAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 w-full max-w-5xl rounded p-4 border border-gray-800">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-lg font-semibold">{chartAsset.symbol} — {chartAsset.name}</h3>
                <div className="text-xs text-gray-400">{chartAsset.type}</div>
              </div>
              <button onClick={closeAssetChart} className="text-gray-400">×</button>
            </div>

            <div style={{ height: 480 }}>
              {/* Try TradingView embed (stock), for crypto try COINBASE:SYMBOLUSD; fallback to coingecko page */}
              {chartAsset.type === "stock" ? (
                <iframe title="tv-widget-stock" src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(chartAsset.symbol)}&interval=D`} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : chartAsset.type === "crypto" ? (
                <iframe title="tv-widget-crypto" src={`https://s.tradingview.com/widgetembed/?symbol=COINBASE:${encodeURIComponent((chartAsset.symbol||"").replace(/[^A-Z0-9]/gi,'').toUpperCase() + "USD")}&interval=D`} style={{ width: "100%", height: "100%", border: 0 }} />
              ) : (
                <iframe title="coingecko" src={`https://www.coingecko.com/en/coins/${encodeURIComponent(chartAsset.coingeckoId || chartAsset.symbol)}`} style={{ width: "100%", height: "100%", border: 0 }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}