'use client';

import { useEffect, useState, useMemo } from "react";
import { getDeviceId } from "@/lib/deviceId";
import { loadPortfolio, savePortfolio } from "@/lib/supabaseClient";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PlusCircle, Edit, Trash2 } from "lucide-react";

// Warna chart
const COLORS = ["#00C49F", "#0088FE", "#FFBB28", "#FF8042", "#AA46BE", "#FF5A5F"];

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]);
  const [marketData, setMarketData] = useState({});
  const [currency, setCurrency] = useState("USD");
  const [rates, setRates] = useState({});
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const deviceId = useMemo(() => getDeviceId(), []);

  // Load portfolio dari Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await loadPortfolio(deviceId);
        setPortfolio(
          data.length
            ? data
            : [{ id: Date.now(), symbol: "AAPL", quantity: 5, purchasePrice: 120, currency: "USD" }]
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, [deviceId]);

  // Fetch forex rates untuk konversi
  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/forex/rates?token=${process.env.NEXT_PUBLIC_FINNHUB_API_KEY}`
        );
        const data = await res.json();
        setRates(data.quote || {});
      } catch (e) {
        console.error("Failed to fetch forex rates", e);
      }
    }
    fetchRates();
  }, []);

  // Fetch harga realtime
  useEffect(() => {
    if (!portfolio.length) return;

    async function fetchQuotes() {
      try {
        const symbols = portfolio.map((a) => a.symbol);
        const results = {};

        await Promise.all(
          symbols.map(async (s) => {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${s}&token=${process.env.NEXT_PUBLIC_FINNHUB_API_KEY}`
            );
            const d = await res.json();
            results[s] = d;
          })
        );

        setMarketData(results);
      } catch (e) {
        console.error("Failed to fetch quotes", e);
      }
    }

    fetchQuotes();
    const interval = setInterval(fetchQuotes, 10000); // update tiap 10 detik
    return () => clearInterval(interval);
  }, [portfolio]);

  // Open/close modal
  const openModal = (asset = null) => {
    setEditing(asset);
    setModalOpen(true);
  };
  const closeModal = () => {
    setEditing(null);
    setModalOpen(false);
  };

  // Save asset baru/edited
  const save = async (d) => {
    if (!d.symbol) return alert("Symbol required");
    let newPortfolio;
    if (d.id) {
      newPortfolio = portfolio.map((x) => (x.id === d.id ? { ...x, ...d } : x));
    } else {
      newPortfolio = [...portfolio, { ...d, id: Date.now() }];
    }
    setPortfolio(newPortfolio);
    await savePortfolio(deviceId, newPortfolio);
    closeModal();
  };

  // Remove asset
  const remove = async (id) => {
    const newPortfolio = portfolio.filter((x) => x.id !== id);
    setPortfolio(newPortfolio);
    await savePortfolio(deviceId, newPortfolio);
  };

  // Hitung nilai dalam currency terpilih
  const convertValue = (value, from = "USD") => {
    if (currency === from) return value;
    const rate = rates?.[`${from}${currency}`] || 1;
    return value * rate;
  };

  // Hitung PnL dan nilai total
  const portfolioWithPnL = portfolio.map((a) => {
    const q = marketData[a.symbol]?.c || a.purchasePrice;
    const currentValue = convertValue(q * a.quantity, a.currency);
    const invested = convertValue(a.purchasePrice * a.quantity, a.currency);
    return {
      ...a,
      currentPrice: q,
      currentValue,
      invested,
      pnl: currentValue - invested,
      pnlPct: ((currentValue - invested) / invested) * 100,
    };
  });

  const totalInvested = portfolioWithPnL.reduce((acc, a) => acc + a.invested, 0);
  const totalValue = portfolioWithPnL.reduce((acc, a) => acc + a.currentValue, 0);
  const totalPnL = totalValue - totalInvested;

  return (
    <div className="min-h-screen bg-black text-gray-200 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Portfolio Dashboard</h1>
        <div className="flex items-center gap-4">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="bg-gray-900 border border-gray-700 p-2 rounded-lg"
          >
            <option value="USD">USD</option>
            <option value="IDR">IDR</option>
            <option value="EUR">EUR</option>
          </select>
          <button
            onClick={() => openModal(null)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg"
          >
            <PlusCircle size={18} /> Add Asset
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400">Total Invested</p>
          <p className="text-xl font-bold">{currency} {totalInvested.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400">Current Value</p>
          <p className="text-xl font-bold">{currency} {totalValue.toFixed(2)}</p>
        </div>
        <div className="bg-gray-900 p-4 rounded-lg">
          <p className="text-gray-400">PnL</p>
          <p className={`text-xl font-bold ${totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {currency} {totalPnL.toFixed(2)} ({((totalPnL / totalInvested) * 100).toFixed(2)}%)
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="p-3 text-left">Symbol</th>
              <th className="p-3 text-right">Quantity</th>
              <th className="p-3 text-right">Buy Price</th>
              <th className="p-3 text-right">Current Price</th>
              <th className="p-3 text-right">Invested</th>
              <th className="p-3 text-right">Value</th>
              <th className="p-3 text-right">PnL</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolioWithPnL.map((a) => (
              <tr key={a.id} className="border-t border-gray-800">
                <td className="p-3">{a.symbol}</td>
                <td className="p-3 text-right">{a.quantity}</td>
                <td className="p-3 text-right">{a.purchasePrice}</td>
                <td className="p-3 text-right">{a.currentPrice?.toFixed(2)}</td>
                <td className="p-3 text-right">{currency} {a.invested.toFixed(2)}</td>
                <td className="p-3 text-right">{currency} {a.currentValue.toFixed(2)}</td>
                <td
                  className={`p-3 text-right ${
                    a.pnl >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {currency} {a.pnl.toFixed(2)} ({a.pnlPct.toFixed(2)}%)
                </td>
                <td className="p-3 text-center flex gap-2 justify-center">
                  <button onClick={() => openModal(a)} className="text-blue-400 hover:text-blue-600">
                    <Edit size={16} />
                  </button>
                  <button onClick={() => remove(a.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Allocation Chart */}
      <div className="bg-gray-900 mt-6 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Portfolio Allocation</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={portfolioWithPnL}
              dataKey="currentValue"
              nameKey="symbol"
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {portfolioWithPnL.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Modal Add/Edit Asset */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">{editing ? "Edit Asset" : "Add Asset"}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.target);
                save({
                  id: editing?.id,
                  symbol: form.get("symbol"),
                  quantity: parseFloat(form.get("quantity")),
                  purchasePrice: parseFloat(form.get("purchasePrice")),
                  currency: form.get("currency"),
                });
              }}
              className="space-y-4"
            >
              <input
                name="symbol"
                placeholder="Symbol (e.g. AAPL, TSLA, BINANCE:BTCUSDT)"
                defaultValue={editing?.symbol || ""}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              />
              <input
                name="quantity"
                type="number"
                step="any"
                placeholder="Quantity"
                defaultValue={editing?.quantity || ""}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              />
              <input
                name="purchasePrice"
                type="number"
                step="any"
                placeholder="Purchase Price"
                defaultValue={editing?.purchasePrice || ""}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              />
              <select
                name="currency"
                defaultValue={editing?.currency || "USD"}
                className="w-full p-2 rounded bg-gray-800 border border-gray-700"
              >
                <option value="USD">USD</option>
                <option value="IDR">IDR</option>
                <option value="EUR">EUR</option>
              </select>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-green-600 hover:bg-green-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}