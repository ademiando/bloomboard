'use client';
import { useEffect, useState, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { Search, Trash2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const FINNHUB_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [ws, setWs] = useState(null);

  // === Kurs USD→IDR realtime dari Coingecko ===
  useEffect(() => {
    async function fetchFx() {
      try {
        const r = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr'
        );
        const d = await r.json();
        if (d.tether?.idr) setFxRate(d.tether.idr);
      } catch (e) {
        console.error('FX fetch error', e);
      }
    }
    fetchFx();
    const intv = setInterval(fetchFx, 60000);
    return () => clearInterval(intv);
  }, []);

  // === WebSocket Finnhub realtime ===
  useEffect(() => {
    if (!FINNHUB_KEY) return;
    const socket = new WebSocket(
      `wss://ws.finnhub.io?token=${FINNHUB_KEY}`
    );
    socket.onopen = () => {
      portfolio.forEach((a) => {
        socket.send(JSON.stringify({ type: 'subscribe', symbol: a.symbol }));
      });
    };
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'trade') {
        msg.data.forEach((t) => {
          setPortfolio((prev) =>
            prev.map((a) =>
              a.symbol === t.s ? { ...a, currentPrice: t.p } : a
            )
          );
        });
      }
    };
    setWs(socket);
    return () => socket.close();
  }, [portfolio]);

  // === Search symbol dari Finnhub ===
  useEffect(() => {
    if (!searchQuery) return setSearchResults([]);
    const handler = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/search?q=${searchQuery}&token=${FINNHUB_KEY}`
        );
        const d = await r.json();
        setSearchResults(d.result || []);
      } catch (e) {
        console.error(e);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // === CRUD ===
  const addAsset = (s) => {
    if (!s.symbol) return;
    const exists = portfolio.find((a) => a.symbol === s.symbol);
    if (exists) return alert('Asset already in portfolio');
    const newA = {
      id: nanoid(),
      symbol: s.symbol,
      description: s.description,
      quantity: 0,
      avgPrice: 0,
      currentPrice: 0,
    };
    setPortfolio((p) => [...p, newA]);
    if (ws) ws.send(JSON.stringify({ type: 'subscribe', symbol: s.symbol }));
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateAsset = (id, field, value) => {
    setPortfolio((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const removeAsset = (id) => {
    const asset = portfolio.find((a) => a.id === id);
    if (asset && ws) {
      ws.send(JSON.stringify({ type: 'unsubscribe', symbol: asset.symbol }));
    }
    setPortfolio((prev) => prev.filter((a) => a.id !== id));
  };

  // === Hitung summary ===
  const totals = useMemo(() => {
    let invested = 0,
      value = 0;
    portfolio.forEach((a) => {
      const inv = a.avgPrice * a.quantity;
      const val = (a.currentPrice || 0) * a.quantity;
      invested += inv;
      value += val;
    });
    const pnl = value - invested;
    return { invested, value, pnl };
  }, [portfolio]);

  const convert = (n) => {
    if (currency === 'USD') return n;
    return n * fxRate;
  };

  const fmt = (n) => {
    const v = convert(n);
    return (currency === 'USD' ? '$' : 'Rp') + v.toLocaleString();
  };

  // === Data untuk Pie Chart ===
  const pieData = useMemo(() => {
    return portfolio
      .map((a) => ({
        name: a.symbol,
        value: (a.currentPrice || 0) * a.quantity,
      }))
      .filter((d) => d.value > 0);
  }, [portfolio]);

  const COLORS = [
    '#00C49F',
    '#FFBB28',
    '#FF8042',
    '#0088FE',
    '#A020F0',
    '#FF1493',
  ];

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div className="space-y-1">
          <div>Total Invested: {fmt(totals.invested)}</div>
          <div>Total Value: {fmt(totals.value)}</div>
          <div className={totals.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
            PnL: {fmt(totals.pnl)} ({((totals.pnl / (totals.invested || 1)) * 100).toFixed(2)}%)
          </div>
        </div>
        <div className="mt-4 md:mt-0">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1"
          >
            <option value="USD">USD</option>
            <option value="IDR">IDR</option>
          </select>
        </div>
      </div>

      {/* Search Add */}
      <div className="relative mb-4">
        <div className="flex items-center bg-gray-900 border border-gray-700 rounded px-2">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search asset (e.g., AAPL, BBCA, BTCUSDT)..."
            className="flex-1 bg-transparent p-2 focus:outline-none"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="absolute bg-gray-900 border border-gray-700 w-full mt-1 max-h-60 overflow-y-auto z-10">
            {searchResults.map((s) => (
              <div
                key={s.symbol}
                onClick={() => addAsset(s)}
                className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-sm"
              >
                {s.symbol} — {s.description}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead className="border-b border-gray-700 text-gray-400">
          <tr>
            <th className="text-left py-2">Symbol</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Avg Price</th>
            <th className="text-right">Current</th>
            <th className="text-right">Value</th>
            <th className="text-right">PnL</th>
            <th className="text-right">%</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {portfolio.map((a) => {
            const inv = a.avgPrice * a.quantity;
            const val = (a.currentPrice || 0) * a.quantity;
            const pnl = val - inv;
            const pnlPct = (pnl / (inv || 1)) * 100;
            return (
              <tr
                key={a.id}
                className="border-b border-gray-800 hover:bg-gray-900"
              >
                <td
                  onClick={() =>
                    window.open(
                      `https://www.tradingview.com/chart/?symbol=${a.symbol}`,
                      '_blank'
                    )
                  }
                  className="cursor-pointer text-blue-400 underline py-2"
                >
                  {a.symbol}
                </td>
                <td className="text-right">
                  <input
                    type="number"
                    value={a.quantity}
                    onChange={(e) =>
                      updateAsset(a.id, 'quantity', Number(e.target.value))
                    }
                    className="bg-transparent w-16 text-right"
                  />
                </td>
                <td className="text-right">
                  <input
                    type="number"
                    value={a.avgPrice}
                    onChange={(e) =>
                      updateAsset(a.id, 'avgPrice', Number(e.target.value))
                    }
                    className="bg-transparent w-20 text-right"
                  />
                </td>
                <td className="text-right">
                  {a.currentPrice ? fmt(a.currentPrice) : '-'}
                </td>
                <td className="text-right">{fmt(val)}</td>
                <td
                  className={
                    pnl >= 0 ? 'text-green-400 text-right' : 'text-red-400 text-right'
                  }
                >
                  {fmt(pnl)}
                </td>
                <td
                  className={
                    pnlPct >= 0
                      ? 'text-green-400 text-right'
                      : 'text-red-400 text-right'
                  }
                >
                  {pnlPct.toFixed(2)}%
                </td>
                <td className="text-right">
                  <button onClick={() => removeAsset(a.id)}>
                    <Trash2 size={16} className="text-gray-500 hover:text-red-400" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Donut Chart */}
      {pieData.length > 0 && (
        <div className="mt-10 w-full h-80">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={120}
                innerRadius={60}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val) => fmt(val)}
                contentStyle={{ backgroundColor: '#1f1f1f', border: 'none' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}