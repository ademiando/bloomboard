// app/dashboard/page.js
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * page.js — single-file portfolio dashboard (siap pakai)
 *
 * Fitur utama yang diminta:
 * - Satu tombol hijau "Add Assets" (hapus tombol Add lama)
 * - Tombol Deposit (IDR / USD) di panel Add
 * - Invested = akumulasi deposit (depositedUSD)
 * - tradingBalance (dalam USD) bertambah saat deposit, berkurang saat buy
 * - Buy diblokir jika tradingBalance < cost
 * - Donut alokasi bulat sempurna, ditempatkan di bawah asset table
 * - Legend compact; kotak warna bulat; mobile: legend di samping donut
 * - Klik nama asset buka modal TradingView; fallback ke CoinGecko untuk crypto yang tidak tersedia
 * - Tombol "All portfolio" diganti dropdown filter
 * - Realtime price: CoinGecko untuk crypto; server-proxy (Yahoo/Finnhub) untuk saham (endpoint /api/yahoo/quote)
 * - Kurs USD/IDR diambil dari CoinGecko (tether->idr)
 *
 * Catatan: file ini berdiri sendiri. Paste ke projectmu langsung.
 */

/* ========== CONFIG & HELPERS ========== */
const COINGECKO_API = "https://api.coingecko.com/api/v3";
const COINGECKO_SIMPLE = (ids) => `${COINGECKO_API}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
const COINGECKO_TETHER_IDR = `${COINGECKO_API}/simple/price?ids=tether&vs_currencies=idr`;
const YAHOO_QUOTE = (symbols) => `/api/yahoo/quote?symbol=${encodeURIComponent(symbols)}`;

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

/* ========== DONUT (perfect circle) ========== */
function CakeAllocation({ data = [], size = 200, inner = 48, gap = 0.02, displayTotal = "", displayCcy = "USD", usdIdr = 16000 }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value || 0), 0) || 1;
  const cx = size / 2, cy = size / 2;
  const outer = Math.round(size / 2 - 6);
  const innerR = inner;
  const colors = ["#FF6B6B","#FFD93D","#6BCB77","#4D96FF","#FF9CEE","#B28DFF","#FFB26B","#6BFFA0","#FF6BE5","#00C49F"];
  const [hoverIndex, setHoverIndex] = useState(null);

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

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6 mt-8">
      <div style={{ width: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={innerR - 4} fill="#0b1220" />
          <text x={cx} y={cy - 8} textAnchor="middle" fontSize="10" fill="#9CA3AF">Total</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="12" fontWeight={700} fill="#E5E7EB">{displayTotal}</text>
        </svg>
      </div>
      
      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors[i % colors.length] }}
            ></div>
            <span className="text-xs text-gray-300">{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== Growth chart ========== */
function CandlesWithLines({ seriesMap = {}, width = 900, height = 300, displayCcy = "USD", usdIdr = 16000 }) {
  const padding = { left: 56, right: 12, top: 12, bottom: 28 };
  const w = Math.min(width, 1200);
  const h = height;
  const innerW = w - padding.left - padding.right;
  const innerH = h - padding.top - padding.bottom;
  const all = seriesMap.all || [];
  if (!all || all.length < 2) return <div className="text-xs text-gray-400">Not enough data for growth chart</div>;

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

/* ========== Asset Chart Modal ========== */
function AssetChartModal({ asset, onClose, usdIdr = 16000 }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!asset) return;
    
    const fetchChartData = async () => {
      try {
        setLoading(true);
        let url;
        
        if (asset.type === 'crypto') {
          // Try TradingView first, fallback to CoinGecko
          try {
            url = `https://api.coingecko.com/api/v3/coins/${asset.coinGeckoId}/market_chart?vs_currency=usd&days=30`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.prices) {
              setChartData({
                prices: data.prices.map(([timestamp, price]) => ({ 
                  time: timestamp / 1000, 
                  value: price 
                }))
              });
            }
          } catch (err) {
            // Fallback to CoinGecko
            url = `https://api.coingecko.com/api/v3/coins/${asset.coinGeckoId}/market_chart?vs_currency=usd&days=30`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.prices) {
              setChartData({
                prices: data.prices.map(([timestamp, price]) => ({ 
                  time: timestamp / 1000, 
                  value: price 
                }))
              });
            }
          }
        } else if (asset.type === 'stock') {
          // Use Yahoo/Finnhub proxy
          url = `/api/yahoo/chart?symbol=${asset.symbol}`;
          const response = await fetch(url);
          const data = await response.json();
          
          if (data.chart && data.chart.result && data.chart.result[0]) {
            const result = data.chart.result[0];
            const timestamps = result.timestamp;
            const quotes = result.indicators.quote[0];
            
            setChartData({
              prices: timestamps.map((timestamp, i) => ({
                time: timestamp,
                value: quotes.close[i]
              }))
            });
          }
        }
      } catch (err) {
        setError('Failed to load chart data');
        console.error('Error fetching chart data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [asset]);

  if (!asset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-4xl border border-gray-800">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-semibold">{asset.name} ({asset.symbol})</h3>
            <div className="text-sm text-gray-400">{asset.type.toUpperCase()}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="text-center text-red-400 py-8">{error}</div>
        ) : chartData ? (
          <div className="h-96">
            <CandlesWithLines 
              seriesMap={{ all: chartData.prices }} 
              width={800} 
              height={384}
              displayCcy="USD"
              usdIdr={usdIdr}
            />
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">No chart data available</div>
        )}
      </div>
    </div>
  );
}

/* ========== Trade Modal ========== */
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
          <input type="number" step="any" value={qty} onChange={(e)=>setQty(e.target.value)} className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" />

          <label className="text-xs text-gray-400 mt-3">Price per unit</label>
          <div className="flex mt-1">
            <input type="number" step="any" value={price} onChange={(e)=>setPrice(e.target.value)} className="flex-1 bg-gray-800 px-3 py-2 rounded-l border border-gray-700" />
            <select value={priceCcy} onChange={(e)=>setPriceCcy(e.target.value)} className="bg-gray-800 px-2 py-2 border border-gray-700 rounded-r">
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

/* ========== Main Component ========== */
export default function PortfolioDashboard() {
  /* ---------- state (persisted) ---------- */
  const loadAssets = () => { try { return (JSON.parse(localStorage.getItem("pf_assets") || "[]") || []).map(ensureNumeric); } catch { return []; } };
  const [assets, setAssets] = useState(loadAssets);

  const loadTx = () => { try { return JSON.parse(localStorage.getItem("pf_transactions") || "[]"); } catch { return []; } };
  const [transactions, setTransactions] = useState(loadTx);

  const loadDeposited = () => { try { return toNum(localStorage.getItem("pf_deposited_usd") || 0); } catch { return 0; } };
  const [depositedUSD, setDepositedUSD] = useState(loadDeposited);

  const loadTrading = () => { try { return toNum(localStorage.getItem("pf_trading_balance_usd") || 0); } catch { return 0; } };
  const [tradingBalanceUSD, setTradingBalanceUSD] = useState(loadTrading);

  const [displayCcy, setDisplayCcy] = useState(localStorage.getItem("pf_display_ccy") || "USD");
  const [usdIdr, setUsdIdr] = useState(toNum(localStorage.getItem("pf_usd_idr") || 16000));
  const [openAdd, setOpenAdd] = useState(false);
  const [searchMode, setSearchMode] = useState("deposit");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [initQty, setInitQty] = useState("");
  const [initPrice, setInitPrice] = useState("");
  const [initPriceCcy, setInitPriceCcy] = useState("USD");
  const [depositIDR, setDepositIDR] = useState("");
  const [depositUSD, setDepositUSD] = useState("");
  const [chartRange, setChartRange] = useState("all");
  const [tradeModal, setTradeModal] = useState({ open: false, mode: null, assetId: null, defaultPrice: 0 });
  const [assetChartOpen, setAssetChartOpen] = useState(false);
  const [chartAsset, setChartAsset] = useState(null);
  const [filter, setFilter] = useState("all");

  const assetsRef = useRef(assets);
  const usdIdrRef = useRef(usdIdr);
  useEffect(() => { assetsRef.current = assets; }, [assets]);
  useEffect(() => { usdIdrRef.current = usdIdr; }, [usdIdr]);

  /* ---------- computed values ---------- */
  const totalInvestedUSD = depositedUSD;
  const totalMarketValueUSD = assets.reduce((sum, a) => sum + a.marketValueUSD, 0);
  const totalGrowthUSD = totalMarketValueUSD - totalInvestedUSD;
  const totalGrowthPct = totalInvestedUSD > 0 ? (totalGrowthUSD / totalInvestedUSD) * 100 : 0;

  /* ---------- effects ---------- */
  useEffect(() => {
    localStorage.setItem("pf_assets", JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem("pf_transactions", JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem("pf_deposited_usd", depositedUSD);
  }, [depositedUSD]);

  useEffect(() => {
    localStorage.setItem("pf_trading_balance_usd", tradingBalanceUSD);
  }, [tradingBalanceUSD]);

  useEffect(() => {
    localStorage.setItem("pf_display_ccy", displayCcy);
  }, [displayCcy]);

  useEffect(() => {
    localStorage.setItem("pf_usd_idr", usdIdr);
  }, [usdIdr]);

  // Fetch USD/IDR rate
  useEffect(() => {
    const fetchUsdIdr = async () => {
      try {
        const res = await fetch(COINGECKO_TETHER_IDR);
        const data = await res.json();
        if (data.tether && data.tether.idr) {
          setUsdIdr(data.tether.idr);
        }
      } catch (err) {
        console.error("Failed to fetch USD/IDR rate:", err);
      }
    };
    fetchUsdIdr();
    const interval = setInterval(fetchUsdIdr, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch asset prices
  useEffect(() => {
    const fetchPrices = async () => {
      const cryptoIds = assets.filter(a => a.type === 'crypto' && a.coinGeckoId).map(a => a.coinGeckoId);
      const stockSymbols = assets.filter(a => a.type === 'stock').map(a => a.symbol);

      try {
        // Fetch crypto prices
        if (cryptoIds.length > 0) {
          const res = await fetch(COINGECKO_SIMPLE(cryptoIds.join(',')));
          const data = await res.json();
          
          setAssets(prev => prev.map(a => {
            if (a.type === 'crypto' && data[a.coinGeckoId]) {
              const lastPriceUSD = data[a.coinGeckoId].usd;
              return {
                ...a,
                lastPriceUSD,
                marketValueUSD: a.shares * lastPriceUSD
              };
            }
            return a;
          }));
        }

        // Fetch stock prices
        if (stockSymbols.length > 0) {
          const res = await fetch(YAHOO_QUOTE(stockSymbols.join(',')));
          const data = await res.json();
          
          if (data.quoteResponse && data.quoteResponse.result) {
            setAssets(prev => prev.map(a => {
              if (a.type === 'stock') {
                const stockData = data.quoteResponse.result.find(s => s.symbol === a.symbol);
                if (stockData) {
                  const lastPriceUSD = stockData.regularMarketPrice;
                  return {
                    ...a,
                    lastPriceUSD,
                    marketValueUSD: a.shares * lastPriceUSD
                  };
                }
              }
              return a;
            }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch prices:", err);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [assets.length]);

  /* ---------- handlers ---------- */
  const addDeposit = (amountIDR, amountUSD) => {
    const usdAmount = toNum(amountUSD) + (toNum(amountIDR) / usdIdr);
    
    // Update deposited amount (invested)
    setDepositedUSD(prev => {
      const newVal = prev + usdAmount;
      localStorage.setItem("pf_deposited_usd", newVal);
      return newVal;
    });
    
    // Update trading balance
    setTradingBalanceUSD(prev => {
      const newVal = prev + usdAmount;
      localStorage.setItem("pf_trading_balance_usd", newVal);
      return newVal;
    });
    
    // Add transaction
    const newTx = {
      id: Date.now(),
      type: 'deposit',
      amountIDR: toNum(amountIDR),
      amountUSD: toNum(amountUSD),
      usdIdr,
      timestamp: Date.now(),
    };
    
    setTransactions(prev => {
      const newTxs = [...prev, newTx];
      localStorage.setItem("pf_transactions", JSON.stringify(newTxs));
      return newTxs;
    });
    
    // Reset form
    setDepositIDR("");
    setDepositUSD("");
  };

  const handleBuy = (assetId, qty, priceUSD) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;

    const cost = qty * priceUSD;
    if (tradingBalanceUSD < cost) {
      alert("Insufficient trading balance");
      return;
    }

    // Update trading balance
    setTradingBalanceUSD(prev => {
      const newVal = prev - cost;
      localStorage.setItem("pf_trading_balance_usd", newVal);
      return newVal;
    });

    // Update asset
    const newShares = asset.shares + qty;
    const newInvestedUSD = asset.investedUSD + cost;
    const newAvgPrice = newInvestedUSD / newShares;

    setAssets(prev => prev.map(a => {
      if (a.id === assetId) {
        return {
          ...a,
          shares: newShares,
          avgPrice: newAvgPrice,
          investedUSD: newInvestedUSD,
          lastPriceUSD: priceUSD,
          marketValueUSD: newShares * priceUSD
        };
      }
      return a;
    }));

    // Add transaction
    const newTx = {
      id: Date.now(),
      type: 'buy',
      assetId,
      assetSymbol: asset.symbol,
      qty,
      priceUSD,
      totalUSD: cost,
      timestamp: Date.now(),
    };

    setTransactions(prev => {
      const newTxs = [...prev, newTx];
      localStorage.setItem("pf_transactions", JSON.stringify(newTxs));
      return newTxs;
    });

    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: 0 });
  };

  const handleSell = (assetId, qty, priceUSD) => {
    const asset = assets.find(a => a.id === assetId);
    if (!asset || asset.shares < qty) return;

    const proceeds = qty * priceUSD;

    // Update trading balance
    setTradingBalanceUSD(prev => {
      const newVal = prev + proceeds;
      localStorage.setItem("pf_trading_balance_usd", newVal);
      return newVal;
    });

    // Update asset
    const newShares = asset.shares - qty;
    const newInvestedUSD = asset.investedUSD * (newShares / asset.shares);
    
    setAssets(prev => prev.map(a => {
      if (a.id === assetId) {
        return {
          ...a,
          shares: newShares,
          investedUSD: newInvestedUSD,
          lastPriceUSD: priceUSD,
          marketValueUSD: newShares * priceUSD
        };
      }
      return a;
    }));

    // Add transaction
    const newTx = {
      id: Date.now(),
      type: 'sell',
      assetId,
      assetSymbol: asset.symbol,
      qty,
      priceUSD,
      totalUSD: proceeds,
      timestamp: Date.now(),
    };

    setTransactions(prev => {
      const newTxs = [...prev, newTx];
      localStorage.setItem("pf_transactions", JSON.stringify(newTxs));
      return newTxs;
    });

    setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: 0 });
  };

  const handleAssetClick = (asset) => {
    setChartAsset(asset);
    setAssetChartOpen(true);
  };

  /* ---------- render ---------- */
  const filteredAssets = filter === "all" 
    ? assets 
    : assets.filter(a => a.type === filter);

  const donutData = filteredAssets
    .filter(a => a.marketValueUSD > 0)
    .map(a => ({ name: a.symbol, value: a.marketValueUSD }));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Dashboard</h1>
          <div className="text-sm text-gray-400">Track your investments</div>
        </div>
        
        <div className="flex gap-2 items-center">
          <select 
            value={displayCcy} 
            onChange={(e) => setDisplayCcy(e.target.value)}
            className="bg-gray-800 text-sm px-3 py-1 rounded border border-gray-700"
          >
            <option value="USD">USD</option>
            <option value="IDR">IDR</option>
          </select>
          
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-800 text-sm px-3 py-1 rounded border border-gray-700"
          >
            <option value="all">All Portfolio</option>
            <option value="crypto">Crypto</option>
            <option value="stock">Stocks</option>
          </select>
          
          <button 
            onClick={() => setOpenAdd(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-4 py-2 rounded"
          >
            Add Assets
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
          <div className="text-sm text-gray-400">Invested</div>
          <div className="text-xl font-semibold">
            {displayCcy === "IDR" ? fmtIDR(totalInvestedUSD * usdIdr) : fmtUSD(totalInvestedUSD)}
          </div>
        </div>
        
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
          <div className="text-sm text-gray-400">Market Value</div>
          <div className="text-xl font-semibold">
            {displayCcy === "IDR" ? fmtIDR(totalMarketValueUSD * usdIdr) : fmtUSD(totalMarketValueUSD)}
          </div>
          <div className={`text-xs ${totalGrowthPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalGrowthPct.toFixed(2)}%
          </div>
        </div>
        
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
          <div className="text-sm text-gray-400">Trading Balance</div>
          <div className="text-xl font-semibold">
            {displayCcy === "IDR" ? fmtIDR(tradingBalanceUSD * usdIdr) : fmtUSD(tradingBalanceUSD)}
          </div>
        </div>
        
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
          <div className="text-sm text-gray-400">Growth</div>
          <div className={`text-xl font-semibold ${totalGrowthUSD >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {displayCcy === "IDR" ? fmtIDR(totalGrowthUSD * usdIdr) : fmtUSD(totalGrowthUSD)}
          </div>
        </div>
      </div>

      {/* Assets Table */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="p-3 text-left text-sm font-semibold">Asset</th>
                <th className="p-3 text-right text-sm font-semibold">Shares</th>
                <th className="p-3 text-right text-sm font-semibold">Avg Price</th>
                <th className="p-3 text-right text-sm font-semibold">Invested</th>
                <th className="p-3 text-right text-sm font-semibold">Last Price</th>
                <th className="p-3 text-right text-sm font-semibold">Market Value</th>
                <th className="p-3 text-right text-sm font-semibold">Growth</th>
                <th className="p-3 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => {
                const growthUSD = asset.marketValueUSD - asset.investedUSD;
                const growthPct = asset.investedUSD > 0 ? (growthUSD / asset.investedUSD) * 100 : 0;
                
                return (
                  <tr key={asset.id} className="border-t border-gray-800 hover:bg-gray-850">
                    <td className="p-3">
                      <button 
                        onClick={() => handleAssetClick(asset)}
                        className="text-left hover:underline font-medium"
                      >
                        {asset.name}
                      </button>
                      <div className="text-xs text-gray-400">{asset.symbol}</div>
                    </td>
                    <td className="p-3 text-right">{asset.shares.toFixed(4)}</td>
                    <td className="p-3 text-right">{fmtUSD(asset.avgPrice)}</td>
                    <td className="p-3 text-right">
                      {displayCcy === "IDR" ? fmtIDR(asset.investedUSD * usdIdr) : fmtUSD(asset.investedUSD)}
                    </td>
                    <td className="p-3 text-right">
                      {displayCcy === "IDR" ? fmtIDR(asset.lastPriceUSD * usdIdr) : fmtUSD(asset.lastPriceUSD)}
                    </td>
                    <td className="p-3 text-right">
                      {displayCcy === "IDR" ? fmtIDR(asset.marketValueUSD * usdIdr) : fmtUSD(asset.marketValueUSD)}
                    </td>
                    <td className="p-3 text-right">
                      <div className={growthUSD >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {displayCcy === "IDR" ? fmtIDR(growthUSD * usdIdr) : fmtUSD(growthUSD)}
                      </div>
                      <div className={`text-xs ${growthPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {growthPct.toFixed(2)}%
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => setTradeModal({ 
                            open: true, 
                            mode: 'buy', 
                            assetId: asset.id, 
                            defaultPrice: asset.lastPriceUSD 
                          })}
                          className="text-xs bg-emerald-500 hover:bg-emerald-600 text-black px-2 py-1 rounded"
                        >
                          Buy
                        </button>
                        <button 
                          onClick={() => setTradeModal({ 
                            open: true, 
                            mode: 'sell', 
                            assetId: asset.id, 
                            defaultPrice: asset.lastPriceUSD 
                          })}
                          className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded"
                        >
                          Sell
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-400">
                    No assets found. Add some assets to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocation Donut Chart */}
      {donutData.length > 0 && (
        <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 mb-8">
          <h2 className="text-lg font-semibold mb-4">Portfolio Allocation</h2>
          <CakeAllocation 
            data={donutData} 
            displayTotal={displayCcy === "IDR" ? fmtIDR(totalMarketValueUSD * usdIdr) : fmtUSD(totalMarketValueUSD)}
            displayCcy={displayCcy}
            usdIdr={usdIdr}
          />
        </div>
      )}

      {/* Growth Chart */}
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Portfolio Growth</h2>
          <select 
            value={chartRange} 
            onChange={(e) => setChartRange(e.target.value)}
            className="bg-gray-800 text-sm px-3 py-1 rounded border border-gray-700"
          >
            <option value="1d">1D</option>
            <option value="1w">1W</option>
            <option value="1m">1M</option>
            <option value="3m">3M</option>
            <option value="1y">1Y</option>
            <option value="all">All</option>
          </select>
        </div>
        <CandlesWithLines 
          seriesMap={{ all: [] }} // You'll need to implement this with real data
          width={900}
          height={300}
          displayCcy={displayCcy}
          usdIdr={usdIdr}
        />
      </div>

      {/* Add Assets Modal */}
      {openAdd && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-gray-900 p-4 rounded w-full max-w-md border border-gray-800">
            <div className="flex justify-between items-start">
              <h3 className="text-lg font-semibold">Add Assets</h3>
              <button onClick={() => setOpenAdd(false)} className="text-gray-400">×</button>
            </div>

            <div className="flex mt-4 border-b border-gray-700">
              <button 
                className={`px-4 py-2 text-sm ${searchMode === 'deposit' ? 'border-b-2 border-emerald-500' : ''}`}
                onClick={() => setSearchMode('deposit')}
              >
                Deposit
              </button>
              <button 
                className={`px-4 py-2 text-sm ${searchMode === 'crypto' ? 'border-b-2 border-emerald-500' : ''}`}
                onClick={() => setSearchMode('crypto')}
              >
                Crypto
              </button>
              <button 
                className={`px-4 py-2 text-sm ${searchMode === 'stock' ? 'border-b-2 border-emerald-500' : ''}`}
                onClick={() => setSearchMode('stock')}
              >
                Stock
              </button>
            </div>

            {searchMode === 'deposit' && (
              <div className="mt-4">
                <h4 className="text-sm font-medium">Add Deposit (IDR or USD)</h4>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Amount in IDR</label>
                  <input 
                    type="number" 
                    value={depositIDR} 
                    onChange={e => setDepositIDR(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="Enter IDR amount"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Amount in USD</label>
                  <input 
                    type="number" 
                    value={depositUSD} 
                    onChange={e => setDepositUSD(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="Enter USD amount"
                  />
                </div>
                <button 
                  onClick={() => {
                    if (!depositIDR && !depositUSD) {
                      alert("Please enter deposit amount");
                      return;
                    }
                    addDeposit(depositIDR, depositUSD);
                  }} 
                  className="w-full mt-4 py-2 bg-emerald-500 text-black rounded font-semibold"
                >
                  Add Deposit
                </button>
              </div>
            )}

            {searchMode === 'crypto' && (
              <div className="mt-4">
                <h4 className="text-sm font-medium">Add Crypto Asset</h4>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Search Crypto</label>
                  <input 
                    type="text" 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="Search crypto..."
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Quantity</label>
                  <input 
                    type="number" 
                    step="any" 
                    value={initQty} 
                    onChange={e => setInitQty(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="Enter quantity"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Price per unit</label>
                  <div className="flex mt-1">
                    <input 
                      type="number" 
                      step="any" 
                      value={initPrice} 
                      onChange={e => setInitPrice(e.target.value)} 
                      className="flex-1 bg-gray-800 px-3 py-2 rounded-l border border-gray-700" 
                      placeholder="Enter price"
                    />
                    <select 
                      value={initPriceCcy} 
                      onChange={e => setInitPriceCcy(e.target.value)} 
                      className="bg-gray-800 px-2 py-2 border border-gray-700 rounded-r"
                    >
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (!selectedSuggestion || !initQty || !initPrice) {
                      alert("Please fill all fields");
                      return;
                    }
                    
                    const priceUSD = initPriceCcy === "IDR" ? (toNum(initPrice) / usdIdr) : toNum(initPrice);
                    const cost = toNum(initQty) * priceUSD;
                    
                    if (tradingBalanceUSD < cost) {
                      alert("Insufficient trading balance");
                      return;
                    }
                    
                    const newAsset = {
                      id: Date.now(),
                      name: selectedSuggestion.name,
                      symbol: selectedSuggestion.symbol.toUpperCase(),
                      type: 'crypto',
                      coinGeckoId: selectedSuggestion.id,
                      shares: toNum(initQty),
                      avgPrice: priceUSD,
                      investedUSD: cost,
                      lastPriceUSD: priceUSD,
                      marketValueUSD: cost
                    };
                    
                    setAssets(prev => [...prev, newAsset]);
                    setTradingBalanceUSD(prev => prev - cost);
                    
                    // Add transaction
                    const newTx = {
                      id: Date.now(),
                      type: 'buy',
                      assetId: newAsset.id,
                      assetSymbol: newAsset.symbol,
                      qty: toNum(initQty),
                      priceUSD,
                      totalUSD: cost,
                      timestamp: Date.now(),
                    };
                    
                    setTransactions(prev => [...prev, newTx]);
                    
                    // Reset form
                    setQuery("");
                    setInitQty("");
                    setInitPrice("");
                    setSelectedSuggestion(null);
                  }} 
                  className="w-full mt-4 py-2 bg-emerald-500 text-black rounded font-semibold"
                >
                  Add Crypto
                </button>
              </div>
            )}

            {searchMode === 'stock' && (
              <div className="mt-4">
                <h4 className="text-sm font-medium">Add Stock Asset</h4>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Stock Symbol</label>
                  <input 
                    type="text" 
                    value={query} 
                    onChange={e => setQuery(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="e.g., AAPL, TSLA"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Quantity</label>
                  <input 
                    type="number" 
                    step="any" 
                    value={initQty} 
                    onChange={e => setInitQty(e.target.value)} 
                    className="w-full bg-gray-800 px-3 py-2 rounded border border-gray-700 mt-1" 
                    placeholder="Enter quantity"
                  />
                </div>
                <div className="mt-2">
                  <label className="text-xs text-gray-400">Price per unit</label>
                  <div className="flex mt-1">
                    <input 
                      type="number" 
                      step="any" 
                      value={initPrice} 
                      onChange={e => setInitPrice(e.target.value)} 
                      className="flex-1 bg-gray-800 px-3 py-2 rounded-l border border-gray-700" 
                      placeholder="Enter price"
                    />
                    <select 
                      value={initPriceCcy} 
                      onChange={e => setInitPriceCcy(e.target.value)} 
                      className="bg-gray-800 px-2 py-2 border border-gray-700 rounded-r"
                    >
                      <option value="USD">USD</option>
                      <option value="IDR">IDR</option>
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    if (!query || !initQty || !initPrice) {
                      alert("Please fill all fields");
                      return;
                    }
                    
                    const priceUSD = initPriceCcy === "IDR" ? (toNum(initPrice) / usdIdr) : toNum(initPrice);
                    const cost = toNum(initQty) * priceUSD;
                    
                    if (tradingBalanceUSD < cost) {
                      alert("Insufficient trading balance");
                      return;
                    }
                    
                    const newAsset = {
                      id: Date.now(),
                      name: query,
                      symbol: query.toUpperCase(),
                      type: 'stock',
                      shares: toNum(initQty),
                      avgPrice: priceUSD,
                      investedUSD: cost,
                      lastPriceUSD: priceUSD,
                      marketValueUSD: cost
                    };
                    
                    setAssets(prev => [...prev, newAsset]);
                    setTradingBalanceUSD(prev => prev - cost);
                    
                    // Add transaction
                    const newTx = {
                      id: Date.now(),
                      type: 'buy',
                      assetId: newAsset.id,
                      assetSymbol: newAsset.symbol,
                      qty: toNum(initQty),
                      priceUSD,
                      totalUSD: cost,
                      timestamp: Date.now(),
                    };
                    
                    setTransactions(prev => [...prev, newTx]);
                    
                    // Reset form
                    setQuery("");
                    setInitQty("");
                    setInitPrice("");
                  }} 
                  className="w-full mt-4 py-2 bg-emerald-500 text-black rounded font-semibold"
                >
                  Add Stock
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trade Modal */}
      {tradeModal.open && (
        <TradeModal
          asset={assets.find(a => a.id === tradeModal.assetId)}
          mode={tradeModal.mode}
          defaultPrice={tradeModal.defaultPrice}
          onClose={() => setTradeModal({ open: false, mode: null, assetId: null, defaultPrice: 0 })}
          onConfirmBuy={(qty, price) => handleBuy(tradeModal.assetId, qty, price)}
          onConfirmSell={(qty, price) => handleSell(tradeModal.assetId, qty, price)}
          usdIdr={usdIdr}
          tradingBalanceUSD={tradingBalanceUSD}
        />
      )}

      {/* Asset Chart Modal */}
      {assetChartOpen && (
        <AssetChartModal
          asset={chartAsset}
          onClose={() => setAssetChartOpen(false)}
          usdIdr={usdIdr}
        />
      )}
    </div>
  );
}