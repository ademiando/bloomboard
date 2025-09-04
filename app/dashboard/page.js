"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Final Dashboard Page (single-file)
 *
 * Requirements satisfied:
 * - Combined search (Finnhub for stocks/forex/indices + CoinGecko for crypto)
 * - Realtime prices: Finnhub WebSocket for tick data (stocks + OANDA:USD_IDR),
 *   CoinGecko polling for crypto prices
 * - Currency conversion USD <-> IDR (live)
 * - CRUD: add/edit/delete + buy/sell (realize)
 * - Donut allocation (SVG)
 * - Local persistence via localStorage
 * - Clean dark UI, responsive-ish
 *
 * Env required:
 * - NEXT_PUBLIC_FINNHUB_API_KEY (string)
 *
 * Notes:
 * - CoinGecko free endpoints used for crypto; Finnhub for stocks/FX.
 * - This file is self-contained; no external UI components required.
 */

/* ================== CONFIG ================== */
const FINNHUB_KEY =
  typeof process !== "undefined"
    ? process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY
    : "";
const FINNHUB_WS = FINNHUB_KEY ? `wss://ws.finnhub.io?token=${FINNHUB_KEY}` : null;
const FINNHUB_SEARCH = (q) =>
  `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;
const FINNHUB_QUOTE = (symbol) =>
  `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
const COINGECKO_SEARCH = (q) =>
  `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
const COINGECKO_PRICE = (ids, vs = "usd") =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids
  )}&vs_currencies=${vs}`;

/* ================== HELPERS ================== */
const isBrowser = typeof window !== "undefined";
const number = (v) => (isNaN(+v) ? 0 : +v);

function useDebounced(value, delay = 300) {
  const [val, setVal] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setVal(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return val;
}

function fmt(val, ccy = "USD") {
  const n = Number(val || 0);
  if (ccy === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

/* Guess quote currency from symbol */
function symbolToQuoteCurrency(symbol) {
  if (!symbol) return "USD";
  if (symbol.startsWith("IDX:") || symbol.includes("IDR")) return "IDR";
  if (symbol.toUpperCase().includes("USDT") || symbol.toUpperCase().includes("USD")) return "USD";
  return "USD";
}

/* Convert "maybe small" FX to large (safety): if value < 1000 it might be 16.4 => 16400 */
function normalizeUsdIdr(v) {
  if (!v || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  if (n > 1000) return n;
  // If API returned 16.4 style, scale up
  return Math.round(n * 1000);
}

/* ================== SVG DONUT ================== */
function Donut({ data = [], size = 140, inner = 62 }) {
  const total = data.reduce((s, i) => s + Math.max(0, i.value || 0), 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  let start = -90;
  const colors = ["#16a34a", "#06b6d4", "#f59e0b", "#ef4444", "#7c3aed", "#84cc16"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, idx) => {
        const portion = Math.max(0, d.value || 0) / total;
        const angle = portion * 360;
        const end = start + angle;
        const large = angle > 180 ? 1 : 0;
        const sRad = (Math.PI * start) / 180;
        const eRad = (Math.PI * end) / 180;
        const x1 = cx + r * Math.cos(sRad);
        const y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad);
        const y2 = cy + r * Math.sin(eRad);
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        start = end;
        return <path key={idx} d={path} fill={colors[idx % colors.length]} stroke="#000" strokeWidth="0.2" />;
      })}
      <circle cx={cx} cy={cy} r={inner} fill="#070707" />
    </svg>
  );
}

/* ================== MAIN COMPONENT ================== */
export default function DashboardPage() {
  /* === Persistent state: assets and realized PnL (USD base) ===
     asset shape:
     {
       id,
       source: 'finnhub'|'coingecko',
       symbol,            // e.g. 'NASDAQ:NVDA' or 'binance:bitcoin' or 'BTC' but we'll use standardized
       displayName,
       coingeckoId,       // set if crypto
       qty,
       avgInput,          // original input (in chosen inputCurrency)
       inputCurrency,     // 'USD'|'IDR'
       avgUSD,            // avg normalized to USD
       lastKnownNative,   // last quote in native quote currency (as returned)
       createdAt
     }
  */
  const [assets, setAssets] = useState(() => {
    try {
      if (!isBrowser) return [];
      return JSON.parse(localStorage.getItem("bb_assets_v2") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    try {
      if (!isBrowser) return 0;
      return Number(localStorage.getItem("bb_realized_usd_v2") || "0");
    } catch {
      return 0;
    }
  });

  // display currency
  const [displayCcy, setDisplayCcy] = useState("IDR"); // default IDR for you
  const [usdIdr, setUsdIdr] = useState(16000);

  // realtime price stores
  // prices keyed by symbol for stocks (Finnhub symbol), and by coingecko id for crypto
  const [stockPrices, setStockPrices] = useState({}); // { 'NASDAQ:NVDA': 410.12 }
  const [cryptoPricesUSD, setCryptoPricesUSD] = useState({}); // { 'bitcoin': 41000 }
  const [lastTickTs, setLastTickTs] = useState(null);

  // search UI
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 300);
  const [suggestions, setSuggestions] = useState([]); // unified list
  const [selected, setSelected] = useState(null); // selected suggestion object

  // add form inputs
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [avgCurrencyInput, setAvgCurrencyInput] = useState("USD");

  // edit inline
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvgInput, setEditAvgInput] = useState("");
  const [editAvgCurrency, setEditAvgCurrency] = useState("USD");

  // refs for WS & subscribed
  const wsRef = useRef(null);
  const subscribed = useRef(new Set());

  /* Persist */
  useEffect(() => {
    try {
      localStorage.setItem("bb_assets_v2", JSON.stringify(assets));
    } catch {}
  }, [assets]);
  useEffect(() => {
    try {
      localStorage.setItem("bb_realized_usd_v2", String(realizedUSD));
    } catch {}
  }, [realizedUSD]);

  /* ================== SEARCH (combine Finnhub & CoinGecko) ================== */
  useEffect(() => {
    let cancelled = false;
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const ac = new AbortController();
    (async () => {
      try {
        const q = debouncedQuery;
        // parallel fetch both sources
        const finnhubPromise = FINNHUB_KEY
          ? fetch(FINNHUB_SEARCH(q), { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
          : Promise.resolve(null);
        const cgPromise = fetch(COINGECKO_SEARCH(q), { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

        const [fh, cg] = await Promise.all([finnhubPromise, cgPromise]);
        if (cancelled) return;

        const fhList = (fh && fh.result && Array.isArray(fh.result)) ? fh.result.slice(0, 10).map(item => ({
          source: "finnhub",
          symbol: item.symbol,
          display: item.description || item.displaySymbol || item.symbol,
          type: (item.type || "").toLowerCase(), // "Common Stock" etc
        })) : [];

        const cgCoins = (cg && cg.coins && Array.isArray(cg.coins)) ? cg.coins.slice(0, 10).map(item => ({
          source: "coingecko",
          coingeckoId: item.id,
          symbol: item.symbol.toUpperCase(),
          display: item.name,
          market: item.market_cap_rank,
        })) : [];

        // Merge, favor exact symbol matches on top
        const merged = [];

        // Keep coins first if query looks crypto-like (contains btc/eth) but we'll just mix
        // But avoid duplicates
        const seen = new Set();
        cgCoins.forEach(c => {
          const key = `cg:${c.coingeckoId}`;
          if (!seen.has(key)) {
            merged.push(c);
            seen.add(key);
          }
        });
        fhList.forEach(f => {
          const key = `fh:${f.symbol}`;
          if (!seen.has(key)) {
            merged.push(f);
            seen.add(key);
          }
        });

        // limit to 12
        setSuggestions(merged.slice(0, 12));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("Search error", err);
        setSuggestions([]);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [debouncedQuery]);

  /* ================== FINNHUB WS (stocks + FX) ================== */
  useEffect(() => {
    if (!FINNHUB_WS) {
      // no key -> skip WebSocket; we'll still poll quotes on add
      return;
    }
    let ws;
    try {
      ws = new WebSocket(FINNHUB_WS);
    } catch (e) {
      console.warn("WS init failed", e);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe USD/IDR
      try {
        ws.send(JSON.stringify({ type: "subscribe", symbol: "OANDA:USD_IDR" }));
        subscribed.current.add("OANDA:USD_IDR");
      } catch {}
      // subscribe any existing stock symbols
      assets.forEach(a => {
        if (a.source === "finnhub" && a.symbol) {
          try {
            ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol }));
            subscribed.current.add(a.symbol);
          } catch {}
        }
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg) return;
        if (msg.type === "trade" && Array.isArray(msg.data)) {
          let fxCandidate = null;
          const updates = {};
          msg.data.forEach(t => {
            const s = t.s;
            const p = t.p;
            if (s === "OANDA:USD_IDR") {
              // normalize scale safety
              const maybe = normalizeUsdIdr(p);
              fxCandidate = maybe;
            } else {
              updates[s] = p;
            }
            setLastTickTs(t.ts || Date.now());
          });
          if (Object.keys(updates).length) {
            setStockPrices(prev => ({ ...prev, ...updates }));
          }
          if (fxCandidate != null) {
            setUsdIdr(prev => {
              if (!prev || Math.abs(prev - fxCandidate) / fxCandidate > 0.0005) {
                console.debug("[fx] update via WS", fxCandidate);
                return fxCandidate;
              }
              return prev;
            });
          }
        }
      } catch (e) {
        console.error("WS msg parse", e);
      }
    };

    ws.onerror = (e) => {
      console.warn("WS error", e);
    };

    ws.onclose = () => {
      // reconnect logic could be added but keep simple: effect will re-run on FINNHUB_WS change
      console.info("WS closed");
    };

    return () => {
      try { ws.close(); } catch {}
      wsRef.current = null;
      subscribed.current.clear();
    };
    // assets intentionally not in deps here to avoid re-create; we'll subscribe separately when assets change
  }, [/* FINNHUB_WS */]);

  /* subscribe newly added stock symbols when ws ready */
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    assets.forEach(a => {
      if (a.source === "finnhub" && a.symbol && !subscribed.current.has(a.symbol)) {
        try {
          ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol }));
          subscribed.current.add(a.symbol);
        } catch {}
      }
    });
  }, [assets]);

  /* ================== COINGECKO POLLING for crypto prices (every 6s) ================== */
  useEffect(() => {
    let mounted = true;
    let tickId = null;

    async function fetchPrices() {
      try {
        const cgIds = assets.filter(a => a.source === "coingecko" && a.coingeckoId).map(a => a.coingeckoId);
        if (cgIds.length === 0) return;
        const uniq = Array.from(new Set(cgIds)).join(",");
        const url = COINGECKO_PRICE(uniq, "usd");
        const res = await fetch(url);
        if (!mounted) return;
        if (!res.ok) return;
        const json = await res.json();
        // update cryptoPricesUSD
        setCryptoPricesUSD(prev => ({ ...prev, ...json }));
      } catch (e) {
        // ignore
      }
    }

    // fetch immediately then interval
    fetchPrices();
    tickId = setInterval(fetchPrices, 6000);

    return () => {
      mounted = false;
      if (tickId) clearInterval(tickId);
    };
  }, [assets]);

  /* fallback FX fetch (Coingecko tether->IDR) every minute if ws hasn't updated */
  useEffect(() => {
    let mounted = true;
    let iid = null;
    async function fetchFx() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr");
        if (!mounted) return;
        if (!res.ok) return;
        const json = await res.json();
        const idr = json?.tether?.idr ? normalizeUsdIdr(json.tether.idr) : null;
        if (idr) {
          setUsdIdr(prev => {
            if (!prev || Math.abs(prev - idr) / idr > 0.0005) {
              console.debug("[fx] update via coingecko fallback", idr);
              return idr;
            }
            return prev;
          });
        }
      } catch (e) {}
    }
    fetchFx();
    iid = setInterval(fetchFx, 60_000);
    return () => {
      mounted = false;
      if (iid) clearInterval(iid);
    };
  }, []);

  /* ================== UTILS: initial quote fetch for stock (REST) ================== */
  async function fetchInitialStockQuote(sym) {
    if (!FINNHUB_KEY) return null;
    try {
      const res = await fetch(FINNHUB_QUOTE(sym));
      if (!res.ok) return null;
      const j = await res.json();
      // Finnhub returns {c: current}
      if (typeof j.c === "number") return j.c;
      return null;
    } catch {
      return null;
    }
  }

  /* ================== COMPUTE rows & totals; store USD-based numbers for math accuracy ================== */
  const rows = useMemo(() => {
    // for each asset compute:
    // - nativeLast: last price in native quote
    // - priceUSD: convert nativeLast -> USD (for crypto cg returns USD already)
    // - marketUSD = priceUSD * qty
    // - investedUSD = avgUSD * qty
    // - pnlUSD = marketUSD - investedUSD
    return assets.map(a => {
      // figure native last
      let nativeLast = a.lastKnownNative ?? null;
      // if stock and stockPrices have it, prefer live
      if (a.source === "finnhub" && stockPrices[a.symbol] != null) nativeLast = stockPrices[a.symbol];
      // if crypto and cg has it
      if (a.source === "coingecko" && cryptoPricesUSD[a.coingeckoId] && cryptoPricesUSD[a.coingeckoId].usd != null) nativeLast = cryptoPricesUSD[a.coingeckoId].usd;

      // quote currency
      const quoteCcy = a.source === "coingecko" ? "USD" : symbolToQuoteCurrency(a.symbol);
      // price in USD
      let priceUSD = 0;
      if (a.source === "coingecko") {
        // crypto: nativeLast already USD
        priceUSD = number(nativeLast);
      } else {
        // stock: if quoteCcy IDR -> convert to USD via usdIdr
        if (quoteCcy === "IDR") {
          priceUSD = number(nativeLast) / (usdIdr || 1);
        } else {
          priceUSD = number(nativeLast);
        }
      }
      // investedUSD: avgUSD stored
      const investedUSD = number(a.avgUSD) * number(a.qty);
      const marketUSD = priceUSD * number(a.qty);
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;

      // display conversions
      const displayPrice = displayCcy === "IDR" ? priceUSD * (usdIdr || 1) : priceUSD;
      const displayInvested = displayCcy === "IDR" ? investedUSD * (usdIdr || 1) : investedUSD;
      const displayMarket = displayCcy === "IDR" ? marketUSD * (usdIdr || 1) : marketUSD;
      const displayPnl = displayCcy === "IDR" ? pnlUSD * (usdIdr || 1) : pnlUSD;

      return {
        ...a,
        nativeLast,
        quoteCcy,
        priceUSD,
        investedUSD,
        marketUSD,
        pnlUSD,
        pnlPct,
        displayPrice,
        displayInvested,
        displayMarket,
        displayPnl,
      };
    });
  }, [assets, stockPrices, cryptoPricesUSD, usdIdr, displayCcy]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + (r.investedUSD || 0), 0);
    const market = rows.reduce((s, r) => s + (r.marketUSD || 0), 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  const displayTotals = {
    invested: displayCcy === "IDR" ? totals.invested * (usdIdr || 1) : totals.invested,
    market: displayCcy === "IDR" ? totals.market * (usdIdr || 1) : totals.market,
    pnl: displayCcy === "IDR" ? totals.pnl * (usdIdr || 1) : totals.pnl,
    pnlPct: totals.pnlPct,
    realized: displayCcy === "IDR" ? realizedUSD * (usdIdr || 1) : realizedUSD,
  };

  /* ================== ACTIONS ================== */
  function onSelectSuggestion(item) {
    // normalized selection object
    setSelected(item);
    if (item.source === "coingecko") {
      setQuery(`${item.symbol.toUpperCase()} — ${item.display}`);
    } else {
      setQuery(`${item.symbol} — ${item.display}`);
    }
    setSuggestions([]);
  }

  async function onAddAsset() {
    // ensure selected present or fallback to typed symbol
    let picked = selected;
    if (!picked && query) {
      // try to construct if user typed full symbol (allow manual)
      // naive manual: treat as finnhub symbol if contains ":" else as search term
      picked = query.includes(":") ? { source: "finnhub", symbol: query, display: query } : null;
    }
    if (!picked) {
      alert("Please choose an asset from the suggestions.");
      return;
    }

    const q = number(qtyInput);
    const a = number(avgInput);
    if (q <= 0 || a <= 0) {
      alert("Qty and Avg price must be > 0");
      return;
    }

    // determine avgUSD based on input currency
    const avgUSD = avgCurrencyInput === "IDR" ? a / (usdIdr || 1) : a;

    // prepare asset object
    const base = {
      id: Date.now(),
      source: picked.source,
      createdAt: Date.now(),
      qty: q,
      avgInput: a,
      inputCurrency: avgCurrencyInput,
      avgUSD,
      lastKnownNative: undefined,
      displayName: picked.display || (picked.name || ""),
    };

    if (picked.source === "coingecko") {
      base.coingeckoId = picked.coingeckoId;
      base.symbol = picked.symbol.toUpperCase();
      // get initial price from coingecko immediately
      try {
        const res = await fetch(COINGECKO_PRICE(picked.coingeckoId, "usd"));
        if (res.ok) {
          const j = await res.json();
          if (j && j[picked.coingeckoId] && typeof j[picked.coingeckoId].usd === "number") {
            base.lastKnownNative = j[picked.coingeckoId].usd;
            setCryptoPricesUSD(prev => ({ ...prev, [picked.coingeckoId]: { usd: j[picked.coingeckoId].usd } }));
          }
        }
      } catch {}
    } else {
      // finnhub
      base.symbol = picked.symbol;
      // fetch rest quote initial
      try {
        const p = await fetchInitialStockQuote(picked.symbol);
        if (p != null) {
          base.lastKnownNative = p;
          setStockPrices(prev => ({ ...prev, [picked.symbol]: p }));
        }
      } catch {}
    }

    setAssets(prev => [...prev, base]);

    // subscribe via ws if stock
    try {
      if (base.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "subscribe", symbol: base.symbol }));
        subscribed.current.add(base.symbol);
      }
    } catch {}

    // reset form
    setSelected(null);
    setQuery("");
    setQtyInput("");
    setAvgInput("");
    setAvgCurrencyInput("USD");
  }

  function beginEdit(a) {
    setEditingId(a.id);
    setEditQty(String(a.qty));
    setEditAvgInput(String(a.avgInput || a.avgUSD || ""));
    setEditAvgCurrency(a.inputCurrency || "USD");
  }

  function saveEdit(id) {
    const q = number(editQty);
    const a = number(editAvgInput);
    if (q <= 0 || a <= 0) {
      setEditingId(null);
      return;
    }
    const avgUSD = editAvgCurrency === "IDR" ? a / (usdIdr || 1) : a;
    setAssets(prev => prev.map(x => x.id === id ? { ...x, qty: q, avgInput: a, inputCurrency: editAvgCurrency, avgUSD } : x));
    setEditingId(null);
  }

  function removeAsset(id) {
    const target = assets.find(a => a.id === id);
    setAssets(prev => prev.filter(a => a.id !== id));
    // unsubscribe if ws
    if (target && target.source === "finnhub" && wsRef.current && wsRef.current.readyState === 1) {
      try {
        wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol: target.symbol }));
        subscribed.current.delete(target.symbol);
      } catch {}
    }
  }

  function buyMore(a) {
    const qtyStr = prompt(`Buy qty for ${a.symbol || a.displayName}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Price per unit (in ${a.inputCurrency || "USD"}):`, String(a.avgInput || ""));
    const ccy = prompt("Currency of price (USD/IDR):", a.inputCurrency || "USD");
    const bq = number(qtyStr);
    const bp = number(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const bpUSD = curr === "IDR" ? bp / (usdIdr || 1) : bp;
    const oldQty = a.qty;
    const newQtyVal = oldQty + bq;
    const newAvgUSD = (a.avgUSD * oldQty + bpUSD * bq) / newQtyVal;
    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: newQtyVal, avgUSD: newAvgUSD, avgInput: (newAvgUSD * (usdIdr || 1)), inputCurrency: curr } : x));
  }

  function sellSome(a) {
    const qtyStr = prompt(`Sell qty for ${a.symbol || a.displayName}:`, "0");
    const sq = number(qtyStr);
    if (sq <= 0 || sq > a.qty) return;
    // use latest priceUSD
    const priceUSD = a.priceUSD ?? a.avgUSD ?? 0;
    const realized = (priceUSD - a.avgUSD) * sq;
    setRealizedUSD(prev => prev + realized);
    const remain = a.qty - sq;
    if (remain <= 0) {
      removeAsset(a.id);
    } else {
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, qty: remain } : x));
    }
  }

  /* ================== DONUT data */
  const pieData = useMemo(() => {
    return rows
      .map(r => ({ name: r.symbol || r.displayName || "?" , value: Math.max(0, r.marketUSD || 0) }))
      .filter(d => d.value > 0);
  }, [rows]);

  /* ================== RENDER UI ================== */
  return (
    <div className="min-h-screen bg-black text-gray-200 antialiased">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Live tick: {lastTickTs ? new Date(lastTickTs).toLocaleTimeString() : "-"} • FX USD/IDR: <span className="text-green-400 font-medium">{usdIdr ? Number(usdIdr).toLocaleString("id-ID") : "-"}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">Portfolio Value</div>
            <div className="text-lg font-semibold">
              {displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}
            </div>
            <select
              value={displayCcy}
              onChange={(e) => setDisplayCcy(e.target.value)}
              className="ml-3 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm"
            >
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between">
            <div className="text-gray-400">Invested</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.invested, "IDR") : fmt(displayTotals.invested, "USD")}</div>
          </div>
          <div className="flex justify-between">
            <div className="text-gray-400">Market</div>
            <div className="font-medium">{displayCcy === "IDR" ? fmt(displayTotals.market, "IDR") : fmt(displayTotals.market, "USD")}</div>
          </div>
          <div className="flex justify-between">
            <div className="text-gray-400">Unrealized P&L</div>
            <div className={`font-semibold ${displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {displayCcy === "IDR" ? fmt(displayTotals.pnl, "IDR") : fmt(displayTotals.pnl, "USD")} ({displayTotals.pnlPct.toFixed(2)}%)
            </div>
          </div>
          <div className="flex justify-between">
            <div className="text-gray-400">Realized P&L</div>
            <div className={`font-semibold ${displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(displayTotals.realized, "IDR") : fmt(displayTotals.realized, "USD")}</div>
          </div>
        </div>

        {/* ADD BAR */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative w-full sm:max-w-md">
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search symbol (e.g. AAPL, BINANCE:BTCUSDT, IDX:BBCA, BTC)..." className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none border border-gray-800" />
              {suggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full bg-gray-950 border border-gray-800 rounded overflow-hidden max-h-60 scroll-py-1">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => onSelectSuggestion(s)} className="w-full text-left px-3 py-2 hover:bg-gray-900 flex justify-between">
                      <div>
                        <div className="font-medium text-gray-100">{s.source === "coingecko" ? `${s.symbol.toUpperCase()} • ${s.display}` : `${s.symbol} • ${s.display}`}</div>
                        <div className="text-xs text-gray-500">{s.source === "coingecko" ? "Crypto (CoinGecko)" : "Stock/FX (Finnhub)"}</div>
                      </div>
                      <div className="text-xs text-gray-400">{s.source === "coingecko" ? `#${s.market || "-"}` : ""}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} placeholder="Qty / Lot" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-full sm:w-36" />
            <div className="flex items-center gap-2">
              <input value={avgInput} onChange={(e) => setAvgInput(e.target.value)} placeholder="Avg Price" className="rounded-md bg-gray-950 px-3 py-2 text-sm border border-gray-800 w-36" />
              <select value={avgCurrencyInput} onChange={(e) => setAvgCurrencyInput(e.target.value)} className="rounded-md bg-gray-950 px-2 py-2 text-sm border border-gray-800">
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>

            <button onClick={onAddAsset} className="bg-green-600 hover:bg-green-500 text-black font-semibold px-4 py-2 rounded w-full sm:w-auto">Add Asset</button>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-gray-400 border-b border-gray-800">
              <tr>
                <th className="text-left py-2 px-3">Symbol</th>
                <th className="text-right py-2 px-3">Qty</th>
                <th className="text-right py-2 px-3">Avg</th>
                <th className="text-right py-2 px-3">Last</th>
                <th className="text-right py-2 px-3">Invested</th>
                <th className="text-right py-2 px-3">Market</th>
                <th className="text-right py-2 px-3">P&amp;L</th>
                <th className="text-right py-2 px-3">%Gain</th>
                <th className="text-right py-2 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500">Add assets via search — e.g. AAPL, IDX:BBCA, BTC</td>
                </tr>
              ) : (
                rows.map(r => {
                  const isEditing = editingId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-gray-900 hover:bg-gray-950">
                      <td className="px-3 py-3">
                        <button onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.source === "finnhub" ? r.symbol : (r.symbol || r.coingeckoId))}`, "_blank")} className="font-semibold text-gray-100 hover:text-green-400">
                          {r.symbol || r.displayName}
                        </button>
                        <div className="text-xs text-gray-500">{r.displayName || ""}</div>
                      </td>

                      <td className="px-3 py-3 text-right tabular-nums">
                        {isEditing ? <input value={editQty} onChange={(e) => setEditQty(e.target.value)} className="bg-gray-950 rounded px-2 py-1 w-24 text-right" /> : (r.qty || 0)}
                      </td>

                      <td className="px-3 py-3 text-right tabular-nums">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <input value={editAvgInput} onChange={(e) => setEditAvgInput(e.target.value)} className="bg-gray-950 rounded px-2 py-1 w-28 text-right" />
                            <select value={editAvgCurrency} onChange={(e) => setEditAvgCurrency(e.target.value)} className="bg-gray-950 rounded px-2 py-1">
                              <option value="USD">USD</option>
                              <option value="IDR">IDR</option>
                            </select>
                          </div>
                        ) : (
                          <div>{r.inputCurrency === "IDR" ? fmt(r.avgInput, "IDR") : fmt(r.avgUSD, "USD")}</div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right tabular-nums">{r.displayPrice != null ? (displayCcy === "IDR" ? fmt(r.displayPrice, "IDR") : fmt(r.displayPrice, "USD")) : "-"}</td>

                      <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmt(r.displayInvested, "IDR") : fmt(r.displayInvested, "USD")}</td>

                      <td className="px-3 py-3 text-right tabular-nums">{displayCcy === "IDR" ? fmt(r.displayMarket, "IDR") : fmt(r.displayMarket, "USD")}</td>

                      <td className={`px-3 py-3 text-right tabular-nums font-semibold ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{displayCcy === "IDR" ? fmt(r.displayPnl, "IDR") : fmt(r.displayPnl, "USD")}</td>

                      <td className={`px-3 py-3 text-right tabular-nums ${r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"}`}>{isFinite(r.pnlPct) ? r.pnlPct.toFixed(2) : "0.00"}%</td>

                      <td className="px-3 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => saveEdit(r.id)} className="bg-green-600 px-3 py-1 rounded text-xs font-semibold text-black">Save</button>
                            <button onClick={() => setEditingId(null)} className="bg-gray-800 px-3 py-1 rounded text-xs">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => buyMore(r)} className="bg-gray-800 px-3 py-1 rounded text-xs">Buy</button>
                            <button onClick={() => sellSome(r)} className="bg-gray-800 px-3 py-1 rounded text-xs">Sell</button>
                            <button onClick={() => beginEdit(r)} className="bg-gray-800 px-3 py-1 rounded text-xs">Edit</button>
                            <button onClick={() => removeAsset(r.id)} className="bg-red-600 px-3 py-1 rounded text-xs font-semibold text-black">Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Donut + legend */}
        {pieData.length > 0 && (
          <div className="mt-6 flex gap-6 flex-col sm:flex-row items-start">
            <div className="w-40 h-40">
              <Donut data={pieData} size={140} inner={60} />
            </div>
            <div>
              {pieData.map((p, i) => {
                const pct = totals.market > 0 ? (p.value / totals.market) * 100 : 0;
                return (
                  <div key={p.name} className="flex items-center gap-3 text-sm text-gray-300 mb-2">
                    <div style={{ width: 12, height: 12, background: ["#16a34a","#06b6d4","#f59e0b","#ef4444","#7c3aed","#84cc16"][i % 6] }} className="rounded-sm" />
                    <div className="font-semibold text-gray-100">{p.name}</div>
                    <div className="text-gray-400">— {pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}