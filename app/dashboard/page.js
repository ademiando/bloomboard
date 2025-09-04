"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";

// ✅ Supabase init
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ✅ Colors untuk chart
const COLORS = ["#4ade80", "#60a5fa", "#facc15", "#f87171", "#a78bfa"];

export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [symbolInput, setSymbolInput] = useState("");
  const [qtyInput, setQtyInput] = useState("");
  const [avgInput, setAvgInput] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [usdIdr, setUsdIdr] = useState(16000); // default sementara
  const [prices, setPrices] = useState({});

  // 🔹 Load data dari Supabase
  useEffect(() => {
    const loadAssets = async () => {
      const { data } = await supabase.from("assets").select("*");
      setAssets(data || []);
    };
    loadAssets();
  }, []);

  // 🔹 Stream harga realtime dari Finnhub
  useEffect(() => {
    if (!assets.length) return;
    const ws = new WebSocket(
      `wss://ws.finnhub.io?token=${process.env.FINNHUB_API_KEY}`
    );

    ws.onopen = () => {
      assets.forEach((a) => {
        ws.send(JSON.stringify({ type: "subscribe", symbol: a.symbol }));
      });
      // USD/IDR kurs
      ws.send(JSON.stringify({ type: "subscribe", symbol: "OANDA:USD_IDR" }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "trade") {
        msg.data.forEach((t) => {
          if (t.s === "OANDA:USD_IDR") {
            setUsdIdr(t.p);
          } else {
            setPrices((prev) => ({ ...prev, [t.s]: t.p }));
          }
        });
      }
    };

    return () => ws.close();
  }, [assets]);

  // 🔹 Add Asset
  const addAsset = async (e) => {
    e.preventDefault();
    if (!symbolInput || !qtyInput || !avgInput) return;
    const { data, error } = await supabase
      .from("assets")
      .insert([
        {
          symbol: symbolInput.toUpperCase(),
          quantity: parseFloat(qtyInput),
          avgPrice: parseFloat(avgInput),
        },
      ])
      .select();
    if (!error) {
      setAssets([...assets, data[0]]);
      setSymbolInput("");
      setQtyInput("");
      setAvgInput("");
    }
  };

  // 🔹 Delete Asset
  const deleteAsset = async (id) => {
    await supabase.from("assets").delete().eq("id", id);
    setAssets(assets.filter((a) => a.id !== id));
  };

  // 🔹 Hitung total & alokasi
  const totals = assets.reduce(
    (acc, a) => {
      const price = prices[a.symbol] || a.avgPrice;
      const marketValue = price * a.quantity;
      const invested = a.avgPrice * a.quantity;
      acc.invested += invested;
      acc.market += marketValue;
      return acc;
    },
    { invested: 0, market: 0 }
  );
  const totalPnL = totals.market - totals.invested;
  const gainPct =
    totals.invested > 0 ? (totalPnL / totals.invested) * 100 : 0;

  const conv = (val) =>
    currency === "USD" ? val : val * usdIdr;

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="bg-gray-800 p-2 rounded mt-2"
        >
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-gray-900 p-4 rounded-xl shadow"
        >
          <p className="text-sm text-gray-400">Invested</p>
          <p className="text-xl font-bold">
            {conv(totals.invested).toLocaleString()} {currency}
          </p>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-gray-900 p-4 rounded-xl shadow"
        >
          <p className="text-sm text-gray-400">Market Value</p>
          <p className="text-xl font-bold">
            {conv(totals.market).toLocaleString()} {currency}
          </p>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className="bg-gray-900 p-4 rounded-xl shadow"
        >
          <p className="text-sm text-gray-400">PnL</p>
          <p
            className={`text-xl font-bold ${
              totalPnL >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {conv(totalPnL).toLocaleString()} ({gainPct.toFixed(2)}%)
          </p>
        </motion.div>
      </div>

      {/* Asset Table */}
      <div className="bg-gray-900 rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="p-3 text-left">Code</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Invested</th>
              <th className="p-3">Market</th>
              <th className="p-3">PnL</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const price = prices[a.symbol] || a.avgPrice;
              const invested = a.avgPrice * a.quantity;
              const market = price * a.quantity;
              const pnl = market - invested;
              const pnlPct = (pnl / invested) * 100;

              return (
                <tr
                  key={a.id}
                  className="border-b border-gray-800 hover:bg-gray-800"
                >
                  <td
                    className="p-3 cursor-pointer font-bold"
                    onClick={() =>
                      window.open(
                        `https://www.tradingview.com/chart/?symbol=${a.symbol}`,
                        "_blank"
                      )
                    }
                  >
                    {a.symbol}
                  </td>
                  <td className="p-3">{a.quantity}</td>
                  <td className="p-3">
                    {conv(invested).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {conv(market).toLocaleString()}
                  </td>
                  <td
                    className={`p-3 font-bold ${
                      pnl >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {conv(pnl).toLocaleString()} ({pnlPct.toFixed(2)}%)
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => deleteAsset(a.id)}
                      className="text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pie Chart Allocation */}
      <div className="mt-6 bg-gray-900 p-4 rounded-xl shadow">
        <h2 className="mb-2 font-bold">Allocation</h2>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={assets.map((a) => {
                const price = prices[a.symbol] || a.avgPrice;
                return {
                  name: a.symbol,
                  value: price * a.quantity,
                };
              })}
              dataKey="value"
              outerRadius={80}
              label
            >
              {assets.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Add Asset Form */}
      <form
        onSubmit={addAsset}
        className="mt-6 bg-gray-900 p-4 rounded-xl shadow flex flex-col gap-2"
      >
        <h2 className="font-bold">Add Asset</h2>
        <input
          placeholder="Symbol (e.g. AAPL, TSLA, BTC-USD)"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          className="p-2 rounded bg-gray-800"
        />
        <input
          placeholder="Quantity"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          className="p-2 rounded bg-gray-800"
        />
        <input
          placeholder="Average Price"
          value={avgInput}
          onChange={(e) => setAvgInput(e.target.value)}
          className="p-2 rounded bg-gray-800"
        />
        <button
          type="submit"
          className="bg-green-500 text-black font-bold p-2 rounded mt-2"
        >
          Add
        </button>
      </form>
    </div>
  );
}