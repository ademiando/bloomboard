"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** ========= CONFIG ========= **/
const FINNHUB_KEY =
  process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY; // fallback
const WS_URL = `wss://ws.finnhub.io?token=${FINNHUB_KEY}`;
const SEARCH_URL = (q) =>
  `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`;

/** ========= UTILS ========= **/
const number = (v) => (isNaN(+v) ? 0 : +v);

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function fmtCurrency(val, ccy = "USD") {
  const n = Number(val || 0);
  const locale = ccy === "IDR" ? "id-ID" : "en-US";
  const style = "currency";
  const currency = ccy;
  return new Intl.NumberFormat(locale, { style, currency, maximumFractionDigits: 2 }).format(n);
}

// Kasar: tebak currency harga dari simbol
function priceCurrencyFromSymbol(sym) {
  if (!sym) return "USD";
  if (sym.startsWith("IDX:") || sym.includes("IDR")) return "IDR";
  // crypto USDT dianggap USD
  if (sym.includes("USDT")) return "USD";
  return "USD";
}

// Convert harga saat ini ke USD
function toUSDFromQuote(price, quoteCcy, usdIdr) {
  if (quoteCcy === "IDR") return price / usdIdr;
  return price; // USD already
}

// Convert USD -> tampilan user (USD/IDR)
function fromUSDForDisplay(usd, displayCcy, usdIdr) {
  return displayCcy === "IDR" ? usd * usdIdr : usd;
}

/** ========= MAIN PAGE ========= **/
export default function DashboardPage() {
  const [assets, setAssets] = useState(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("bb_assets") || "[]");
    } catch {
      return [];
    }
  });
  const [realizedUSD, setRealizedUSD] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Number(localStorage.getItem("bb_realized_usd") || "0");
    } catch {
      return 0;
    }
  });

  const [displayCcy, setDisplayCcy] = useState("USD"); // dropdown USD/IDR
  const [usdIdr, setUsdIdr] = useState(16000); // live dari websocket OANDA:USD_IDR
  const [prices, setPrices] = useState({}); // live last price per symbol
  const [lastTickTs, setLastTickTs] = useState(null);

  // --- Add Asset form (inline, minimal) ---
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSym, setSelectedSym] = useState("");
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [avgCcy, setAvgCcy] = useState("USD"); // price input ccy

  // Inline edit state per row
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [editAvgCcy, setEditAvgCcy] = useState("USD");

  // WS ref
  const wsRef = useRef(null);
  const subscribedRef = useRef(new Set()); // symbols subscribed

  /** ========= EFFECT: Persist ========= **/
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bb_assets", JSON.stringify(assets));
    }
  }, [assets]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("bb_realized_usd", String(realizedUSD));
    }
  }, [realizedUSD]);

  /** ========= EFFECT: Search Typeahead Finnhub ========= **/
  useEffect(() => {
    // improved: abortable, checks response.ok, defensive against empty results and rate-limit
    if (!FINNHUB_KEY) {
      setSuggestions([]);
      return;
    }
    if (!debouncedSearch || debouncedSearch.length < 2) {
      setSuggestions([]);
      return;
    }

    const ac = new AbortController();
    let mounted = true;

    (async () => {
      try {
        const url = SEARCH_URL(debouncedSearch);
        const res = await fetch(url, { signal: ac.signal });
        if (!mounted) return;
        if (!res.ok) {
          // server returned non-200 (rate-limited or bad key) -> clear suggestions
          console.warn("Finnhub search returned", res.status);
          setSuggestions([]);
          return;
        }
        const json = await res.json();
        const list = Array.isArray(json?.result) ? json.result : json?.result ? json.result : [];
        // some responses might include displaySymbol/description
        const filtered = (list || [])
          .filter((r) => (r.symbol || r.displaySymbol) && (r.description || r.displaySymbol))
          .slice(0, 12)
          .map((r) => ({
            symbol: r.symbol || r.displaySymbol || "",
            description: r.description || r.displaySymbol || "",
          }));
        setSuggestions(filtered);
      } catch (err) {
        if (err.name === "AbortError") {
          // aborted - ignore
          return;
        }
        console.error("Search fetch error", err);
        setSuggestions([]);
      }
    })();

    return () => {
      mounted = false;
      ac.abort();
    };
  }, [debouncedSearch]);

  /** ========= EFFECT: WebSocket Finnhub ========= **/
  useEffect(() => {
    if (!FINNHUB_KEY) return;

    // open ws once
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe USD/IDR kurs
      try {
        ws.send(JSON.stringify({ type: "subscribe", symbol: "OANDA:USD_IDR" }));
        subscribedRef.current.add("OANDA:USD_IDR");
      } catch {}
      // subscribe semua asset
      assets.forEach((a) => {
        try {
          ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol }));
          subscribedRef.current.add(a.symbol);
        } catch {}
      });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "trade" && Array.isArray(msg.data)) {
          let fx = usdIdr;
          const updates = {};
          msg.data.forEach((t) => {
            const s = t.s;
            const p = t.p;
            setLastTickTs(t.ts || Date.now());
            if (s === "OANDA:USD_IDR") {
              fx = p;
            } else {
              updates[s] = p;
            }
          });
          if (Object.keys(updates).length) {
            setPrices((prev) => ({ ...prev, ...updates }));
          }
          if (fx && fx !== usdIdr) setUsdIdr(fx);
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => {
      try {
        ws.close();
      } catch {}
      subscribedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FINNHUB_KEY]);

  // Re-subscribe when assets change (if ws already open)
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const subscribed = subscribedRef.current;
    assets.forEach((a) => {
      if (!subscribed.has(a.symbol)) {
        try {
          ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol }));
          subscribed.add(a.symbol);
        } catch {}
      }
    });
  }, [assets]);

  /** ========= COMPUTATIONS ========= **/
  const rows = useMemo(() => {
    return assets.map((a) => {
      const quoteCcy = priceCurrencyFromSymbol(a.symbol);
      const live = prices[a.symbol]; // undefined kalau belum ada tick
      const lastPrice = number(live ?? a.lastKnownPrice ?? a.avgUSD); // fallback
      const priceUSD = toUSDFromQuote(lastPrice, quoteCcy, usdIdr);
      const marketUSD = priceUSD * a.qty;
      const investedUSD = a.avgUSD * a.qty;
      const pnlUSD = marketUSD - investedUSD;
      const pnlPct = investedUSD > 0 ? (pnlUSD / investedUSD) * 100 : 0;

      const displayPrice = fromUSDForDisplay(priceUSD, displayCcy, usdIdr);
      const displayInvested = fromUSDForDisplay(investedUSD, displayCcy, usdIdr);
      const displayMarket = fromUSDForDisplay(marketUSD, displayCcy, usdIdr);
      const displayPnl = fromUSDForDisplay(pnlUSD, displayCcy, usdIdr);

      return {
        ...a,
        quoteCcy,
        lastPrice,
        priceUSD,
        marketUSD,
        investedUSD,
        pnlUSD,
        pnlPct,
        displayPrice,
        displayInvested,
        displayMarket,
        displayPnl,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, prices, usdIdr, displayCcy]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.investedUSD, 0);
    const market = rows.reduce((s, r) => s + r.marketUSD, 0);
    const pnl = market - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, market, pnl, pnlPct };
  }, [rows]);

  const displayTotals = {
    invested: fromUSDForDisplay(totals.invested, displayCcy, usdIdr),
    market: fromUSDForDisplay(totals.market, displayCcy, usdIdr),
    pnl: fromUSDForDisplay(totals.pnl, displayCcy, usdIdr),
    pnlPct: totals.pnlPct,
    realized: fromUSDForDisplay(realizedUSD, displayCcy, usdIdr),
  };

  /** ========= ACTIONS ========= **/
  function selectSuggestion(s) {
    setSelectedSym(s.symbol);
    setSearch(s.symbol);
    setSuggestions([]);
  }

  function addAsset() {
    const sym = (selectedSym || search || "").trim().toUpperCase();
    const q = number(qty);
    const a = number(avg);
    if (!sym || q <= 0 || a <= 0) return;

    // convert avg to USD
    const thisUsdIdr = usdIdr || 16000;
    const avgUSD = avgCcy === "IDR" ? a / thisUsdIdr : a;

    const newAsset = {
      id: Date.now(),
      symbol: sym,
      qty: q,
      avgUSD,
      avgOriginal: a,
      avgOriginalCcy: avgCcy,
      lastKnownPrice: undefined,
    };
    setAssets((prev) => [...prev, newAsset]);

    // reset form
    setSelectedSym("");
    setSearch("");
    setQty("");
    setAvg("");
    setAvgCcy("USD");
  }

  function beginEdit(row) {
    setEditingId(row.id);
    setEditQty(String(row.qty));
    setEditAvg(String(row.avgOriginal ?? row.avgUSD));
    setEditAvgCcy(row.avgOriginalCcy || "USD");
  }

  function saveEdit(id) {
    const q = number(editQty);
    const a = number(editAvg);
    if (q <= 0 || a <= 0) {
      setEditingId(null);
      return;
    }
    const thisUsdIdr = usdIdr || 16000;
    const avgUSD = editAvgCcy === "IDR" ? a / thisUsdIdr : a;

    setAssets((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, qty: q, avgUSD, avgOriginal: a, avgOriginalCcy: editAvgCcy }
          : x
      )
    );
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function removeAsset(id) {
    setAssets((prev) => prev.filter((x) => x.id !== id));
  }

  // Weighted average buy
  function buyMore(row) {
    const qtyStr = prompt(`Buy quantity for ${row.symbol}:`, "0");
    if (!qtyStr) return;
    const priceStr = prompt(`Buy price (${avgCcy} USD or IDR?)`, "0");
    const ccy = prompt("Price currency (USD/IDR):", "USD");
    const bq = number(qtyStr);
    const bp = number(priceStr);
    const curr = (ccy || "USD").toUpperCase() === "IDR" ? "IDR" : "USD";
    if (bq <= 0 || bp <= 0) return;
    const thisUsdIdr = usdIdr || 16000;
    const bpUSD = curr === "IDR" ? bp / thisUsdIdr : bp;

    const oldQty = row.qty;
    const newQty = oldQty + bq;
    const newAvgUSD = (row.avgUSD * oldQty + bpUSD * bq) / newQty;

    setAssets((prev) =>
      prev.map((x) =>
        x.id === row.id ? { ...x, qty: newQty, avgUSD: newAvgUSD } : x
      )
    );
  }

  // Realize PnL by selling
  function sellSome(row) {
    const qtyStr = prompt(`Sell quantity for ${row.symbol}:`, "0");
    const sq = number(qtyStr);
    if (sq <= 0 || sq > row.qty) return;

    const priceUSD = row.priceUSD; // sell at current market USD
    const realized = (priceUSD - row.avgUSD) * sq; // USD
    setRealizedUSD((r) => r + realized);

    const remain = row.qty - sq;
    if (remain === 0) {
      // remove asset
      setAssets((prev) => prev.filter((x) => x.id !== row.id));
    } else {
      setAssets((prev) =>
        prev.map((x) => (x.id === row.id ? { ...x, qty: remain } : x))
      );
    }
  }

  /** ========= RENDER ========= **/
  return (
    <div className="min-h-screen w-full bg-black text-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* TOP SUMMARY (tanpa card) */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
            <p className="text-xs text-gray-500">
              Live tick: {lastTickTs ? new Date(lastTickTs).toLocaleTimeString() : "-"} • FX USD/IDR:{" "}
              <span className="text-green-500 font-medium">
                {usdIdr ? Math.round(usdIdr).toLocaleString("id-ID") : "-"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Portfolio Value</span>
            <span className="text-lg font-semibold">
              {fmtCurrency(displayTotals.market, displayCcy)}
            </span>
            <select
              value={displayCcy}
              onChange={(e) => setDisplayCcy(e.target.value)}
              className="ml-3 rounded-md bg-gray-900 px-3 py-2 text-sm outline-none ring-1 ring-gray-800 hover:ring-gray-700"
            >
              <option value="USD">USD</option>
              <option value="IDR">IDR</option>
            </select>
          </div>
        </div>

        {/* KPI Bar */}
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
          <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-gray-900 to-gray-950 px-3 py-2 ring-1 ring-gray-800">
            <span className="text-gray-400">Invested</span>
            <span className="font-medium">{fmtCurrency(displayTotals.invested, displayCcy)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-gray-900 to-gray-950 px-3 py-2 ring-1 ring-gray-800">
            <span className="text-gray-400">Market</span>
            <span className="font-medium">{fmtCurrency(displayTotals.market, displayCcy)}</span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-gray-900 to-gray-950 px-3 py-2 ring-1 ring-gray-800">
            <span className="text-gray-400">Unrealized P&amp;L</span>
            <span
              className={`font-semibold ${
                displayTotals.pnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {fmtCurrency(displayTotals.pnl, displayCcy)} ({displayTotals.pnlPct.toFixed(2)}%)
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md bg-gradient-to-r from-gray-900 to-gray-950 px-3 py-2 ring-1 ring-gray-800">
            <span className="text-gray-400">Realized P&amp;L</span>
            <span
              className={`font-semibold ${
                displayTotals.realized >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {fmtCurrency(displayTotals.realized, displayCcy)}
            </span>
          </div>
        </div>

        {/* ADD ASSET BAR (typeahead + qty + avg + ccy) */}
        <div className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedSym("");
                }}
                placeholder="Search symbol… e.g. AAPL, BINANCE:BTCUSDT, IDX:BBCA"
                className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none ring-1 ring-gray-800 placeholder:text-gray-600 focus:ring-gray-600"
              />
              {suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-gray-800 bg-gray-950 text-sm shadow-2xl">
                  {suggestions.map((s) => (
                    <button
                      key={`${s.symbol}-${s.description}`}
                      onClick={() => selectSuggestion(s)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-900"
                    >
                      <span className="font-medium text-gray-100">{s.symbol}</span>
                      <span className="truncate text-gray-500">{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              type="number"
              step="any"
              min="0"
              placeholder="Qty / Lot"
              className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none ring-1 ring-gray-800 placeholder:text-gray-600 focus:ring-gray-600 sm:max-w-[140px]"
            />
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <input
                value={avg}
                onChange={(e) => setAvg(e.target.value)}
                type="number"
                step="any"
                min="0"
                placeholder="Avg Price"
                className="w-full rounded-md bg-gray-950 px-3 py-2 text-sm outline-none ring-1 ring-gray-800 placeholder:text-gray-600 focus:ring-gray-600 sm:max-w-[160px]"
              />
              <select
                value={avgCcy}
                onChange={(e) => setAvgCcy(e.target.value)}
                className="rounded-md bg-gray-950 px-2 py-2 text-sm outline-none ring-1 ring-gray-800 hover:ring-gray-700"
              >
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>

            <button
              onClick={addAsset}
              className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-black hover:bg-green-500 sm:w-auto"
            >
              Add Asset
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-6 overflow-x-auto rounded-md ring-1 ring-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-normal">Symbol</th>
                <th className="px-3 py-2 text-right font-normal">Qty</th>
                <th className="px-3 py-2 text-right font-normal">Avg</th>
                <th className="px-3 py-2 text-right font-normal">Last</th>
                <th className="px-3 py-2 text-right font-normal">Invested</th>
                <th className="px-3 py-2 text-right font-normal">Market</th>
                <th className="px-3 py-2 text-right font-normal">P&amp;L</th>
                <th className="px-3 py-2 text-right font-normal">%Gain</th>
                <th className="px-3 py-2 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                    Add your first asset above — contoh: <code className="text-gray-300">AAPL</code>,{" "}
                    <code className="text-gray-300">BINANCE:BTCUSDT</code>,{" "}
                    <code className="text-gray-300">IDX:BBCA</code>
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isEditing = editingId === r.id;
                  const avgDisplayBase =
                    r.avgOriginalCcy === "IDR"
                      ? fmtCurrency(r.avgOriginal, "IDR")
                      : fmtCurrency(r.avgOriginal ?? r.avgUSD, "USD");
                  const lastDisp = fmtCurrency(r.displayPrice, displayCcy);
                  const invDisp = fmtCurrency(r.displayInvested, displayCcy);
                  const mktDisp = fmtCurrency(r.displayMarket, displayCcy);
                  const pnlDisp = fmtCurrency(r.displayPnl, displayCcy);

                  return (
                    <tr key={r.id} className="border-t border-gray-900 hover:bg-gray-950">
                      {/* Symbol */}
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(r.symbol)}`,
                              "_blank",
                              "noopener,noreferrer"
                            )
                          }
                          className="font-semibold text-gray-100 hover:text-green-400"
                          title="Open TradingView"
                        >
                          {r.symbol}
                        </button>
                      </td>

                      {/* Qty */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {isEditing ? (
                          <input
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            type="number"
                            step="any"
                            className="w-24 rounded bg-gray-950 px-2 py-1 ring-1 ring-gray-800"
                          />
                        ) : (
                          r.qty
                        )}
                      </td>

                      {/* Avg */}
                      <td className="px-3 py-2 text-right tabular-nums">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <input
                              value={editAvg}
                              onChange={(e) => setEditAvg(e.target.value)}
                              type="number"
                              step="any"
                              className="w-28 rounded bg-gray-950 px-2 py-1 ring-1 ring-gray-800"
                            />
                            <select
                              value={editAvgCcy}
                              onChange={(e) => setEditAvgCcy(e.target.value)}
                              className="rounded bg-gray-950 px-2 py-1 ring-1 ring-gray-800"
                            >
                              <option value="USD">USD</option>
                              <option value="IDR">IDR</option>
                            </select>
                          </div>
                        ) : (
                          <span title="Original avg input">{avgDisplayBase}</span>
                        )}
                      </td>

                      {/* Last */}
                      <td className="px-3 py-2 text-right tabular-nums">{lastDisp}</td>

                      {/* Invested */}
                      <td className="px-3 py-2 text-right tabular-nums">{invDisp}</td>

                      {/* Market */}
                      <td className="px-3 py-2 text-right tabular-nums">{mktDisp}</td>

                      {/* P&L */}
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {pnlDisp}
                      </td>

                      {/* %Gain */}
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          r.pnlUSD >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {isFinite(r.pnlPct) ? r.pnlPct.toFixed(2) : "0.00"}%
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => saveEdit(r.id)}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-black hover:bg-green-500"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => buyMore(r)}
                              className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
                              title="Add lot (weighted avg)"
                            >
                              Buy
                            </button>
                            <button
                              onClick={() => sellSome(r)}
                              className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
                              title="Realize PnL at market"
                            >
                              Sell
                            </button>
                            <button
                              onClick={() => beginEdit(r)}
                              className="rounded bg-gray-800 px-3 py-1 text-xs text-gray-300 hover:bg-gray-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => removeAsset(r.id)}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-black hover:bg-red-500"
                            >
                              Delete
                            </button>
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

        {/* Allocation Bar (clean, tanpa chart lib) */}
        {rows.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wider text-gray-500">
              Allocation by Market Value
            </div>
            <div className="flex h-3 overflow-hidden rounded bg-gray-900 ring-1 ring-gray-800">
              {rows.map((r) => {
                const w = totals.market > 0 ? (r.marketUSD / totals.market) * 100 : 0;
                return (
                  <div
                    key={r.id}
                    style={{ width: `${w}%` }}
                    className="h-full"
                    title={`${r.symbol} ${w.toFixed(1)}%`}
                  >
                    {/* gunakan gradient hijau berbeda via opacity */}
                    <div className="h-full w-full bg-green-600/70 hover:bg-green-500/90 transition-colors"></div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
              {rows.map((r) => {
                const w = totals.market > 0 ? (r.marketUSD / totals.market) * 100 : 0;
                return (
                  <div key={`legend-${r.id}`} className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded bg-green-600/70"></span>
                    <span className="text-gray-300">{r.symbol}</span>
                    <span>• {w.toFixed(1)}%</span>
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