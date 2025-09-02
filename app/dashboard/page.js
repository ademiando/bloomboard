'use client';
import { useEffect, useMemo, useState } from "react";
import { getDeviceId } from "@/lib/deviceId";
import { loadPortfolio, savePortfolio } from "@/lib/supabaseClient";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const TradingViewWidget = dynamic(() => import("@/components/TradingViewWidget"), { ssr: false });

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]);
  const [marketData, setMarketData] = useState({});
  const [currency, setCurrency] = useState("USD");
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const deviceId = useMemo(() => getDeviceId(), []);

  // Load portfolio from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { data } = await loadPortfolio(deviceId);
        setPortfolio(
          data.length
            ? data
            : [{ id: Date.now(), symbol: "NASDAQ:NVDA", quantity: 10, purchasePrice: 160, currency: "USD", date: "2023-01-15" }]
        );
      } catch (e) {
        console.error(e);
        setPortfolio([{ id: Date.now(), symbol: "NASDAQ:NVDA", quantity: 10, purchasePrice: 160, currency: "USD", date: "2023-01-15" }]);
      }
    })();
  }, [deviceId]);

  // Fetch market data from /api/quotes (already connected to Finnhub)
  useEffect(() => {
    if (!portfolio.length) return;
    const fetchQuotes = async () => {
      try {
        const symbols = portfolio.map((p) => p.symbol).join(",");
        const res = await fetch(`/api/quotes?symbols=${symbols}`);
        const data = await res.json();
        setMarketData(data);
      } catch (err) {
        console.error("Failed to fetch quotes", err);
      }
    };
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, [portfolio]);

  // Modal helpers
  const openModal = (a = null) => {
    setEditing(a);
    setModalOpen(true);
  };
  const closeModal = () => {
    setEditing(null);
    setModalOpen(false);
  };
  const save = async (d) => {
    if (!d.symbol) return alert("Symbol required");
    if (d.id) {
      setPortfolio((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d } : x)));
    } else {
      setPortfolio((prev) => [...prev, { ...d, id: Date.now() }]);
    }
    await savePortfolio(deviceId, portfolio);
    closeModal();
  };
  const remove = (id) => {
    setPortfolio((prev) => prev.filter((x) => x.id !== id));
  };

  // Allocation data for Pie Chart
  const allocation = portfolio.map((a) => {
    const price = marketData[a.symbol]?.c || a.purchasePrice;
    return { name: a.symbol, value: price * a.quantity };
  });
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

  // PnL data for Line Chart
  const pnlData = portfolio.map((a) => {
    const currentPrice = marketData[a.symbol]?.c || a.purchasePrice;
    const pnl = (currentPrice - a.purchasePrice) * a.quantity;
    return { name: a.symbol, pnl };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <Card className="flex justify-between items-center p-4">
        <div>
          <h2 className="text-2xl font-bold">My Portfolio</h2>
          <p className="text-gray-500">{portfolio.length} Assets</p>
        </div>
        <Button onClick={() => openModal(null)}>+ Add Asset</Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left side */}
        <div className="lg:col-span-2 space-y-6">
          {/* TradingView Chart */}
          <Card className="p-2">
            <TradingViewWidget symbol={portfolio[0]?.symbol || "SP:SPX"} />
          </Card>

          {/* Asset Table */}
          <Card className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th>Symbol</th>
                  <th>Quantity</th>
                  <th>Avg. Price</th>
                  <th>Current Price</th>
                  <th>PnL</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((a) => {
                  const currentPrice = marketData[a.symbol]?.c || a.purchasePrice;
                  const pnl = (currentPrice - a.purchasePrice) * a.quantity;
                  return (
                    <tr key={a.id} className="border-b">
                      <td>{a.symbol}</td>
                      <td>{a.quantity}</td>
                      <td>{a.purchasePrice} {currency}</td>
                      <td>{currentPrice} {currency}</td>
                      <td className={pnl >= 0 ? "text-green-600" : "text-red-600"}>
                        {pnl.toFixed(2)}
                      </td>
                      <td className="space-x-2">
                        <Button size="sm" onClick={() => openModal(a)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => remove(a.id)}>Remove</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* PnL Chart */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">PnL by Asset</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={pnlData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Right side */}
        <div className="lg:col-span-1 space-y-6">
          {/* Allocation Chart */}
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-2">Allocation</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" outerRadius={120} label>
                  {allocation.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      {/* Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <Card className="p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-semibold">{editing ? "Edit Asset" : "Add Asset"}</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newAsset = {
                  id: editing?.id,
                  symbol: formData.get("symbol"),
                  quantity: parseFloat(formData.get("quantity")),
                  purchasePrice: parseFloat(formData.get("purchasePrice")),
                  currency: formData.get("currency") || "USD",
                  date: formData.get("date"),
                };
                save(newAsset);
              }}
              className="space-y-3"
            >
              <Input name="symbol" placeholder="Symbol (e.g., NASDAQ:AAPL)" defaultValue={editing?.symbol} />
              <Input name="quantity" type="number" step="any" placeholder="Quantity" defaultValue={editing?.quantity} />
              <Input name="purchasePrice" type="number" step="any" placeholder="Purchase Price" defaultValue={editing?.purchasePrice} />
              <Input name="currency" placeholder="Currency" defaultValue={editing?.currency || "USD"} />
              <Input name="date" type="date" defaultValue={editing?.date} />
              <div className="flex justify-end space-x-2 pt-2">
                <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
                       }
