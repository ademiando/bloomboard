'use client';
import { useEffect, useState } from 'react';

const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || process.env.FINNHUB_API_KEY;

// ---------- Small UI Components ----------
const Card = ({ children }) => (
  <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-md">{children}</div>
);

const Button = ({ children, onClick, className }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium ${className}`}
  >
    {children}
  </button>
);

const Input = ({ value, onChange, placeholder, type = "text", className }) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
  />
);

const Modal = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-lg border border-gray-700 relative">
        {children}
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// ---------- Main Page ----------
export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]);
  const [currency, setCurrency] = useState("USD");
  const [fxRates, setFxRates] = useState({});
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  // Fetch FX rates
  useEffect(() => {
    async function loadRates() {
      try {
        const res = await fetch(`https://finnhub.io/api/v1/forex/rates?token=${FINNHUB_API_KEY}`);
        const data = await res.json();
        setFxRates(data.quote || {});
      } catch (err) {
        console.error("FX rates error", err);
      }
    }
    loadRates();
    const interval = setInterval(loadRates, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch realtime prices
  useEffect(() => {
    if (!portfolio.length) return;
    async function updatePrices() {
      try {
        const updated = await Promise.all(
          portfolio.map(async (asset) => {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${asset.symbol}&token=${FINNHUB_API_KEY}`
            );
            const data = await res.json();
            return { ...asset, price: data.c || asset.price || 0 };
          })
        );
        setPortfolio(updated);
      } catch (err) {
        console.error("Price fetch error", err);
      }
    }
    updatePrices();
    const interval = setInterval(updatePrices, 10000);
    return () => clearInterval(interval);
  }, [portfolio]);

  // Search asset
  useEffect(() => {
    if (!searchQuery) return setSearchResults([]);
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/search?q=${encodeURIComponent(searchQuery)}&token=${FINNHUB_API_KEY}`
        );
        const data = await res.json();
        setSearchResults(data.result || []);
      } catch (err) {
        console.error("Search error", err);
      }
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  // Modal save
  const saveAsset = (asset) => {
    if (editing) {
      setPortfolio((prev) => prev.map((a) => (a.id === editing.id ? { ...a, ...asset } : a)));
    } else {
      setPortfolio((prev) => [...prev, { ...asset, id: Date.now() }]);
    }
    setEditing(null);
    setModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeAsset = (id) => {
    setPortfolio((prev) => prev.filter((a) => a.id !== id));
  };

  // Summary calculation
  const rate = currency === "USD" ? 1 : fxRates[`USD${currency}`] || 1;
  const totalInvested = portfolio.reduce((sum, a) => sum + a.purchasePrice * a.quantity, 0) * rate;
  const totalValue = portfolio.reduce((sum, a) => sum + (a.price || 0) * a.quantity, 0) * rate;
  const totalPnL = totalValue - totalInvested;
  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold">Portfolio Tracker</h1>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
        >
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-gray-400 text-sm">Invested</div>
          <div className="text-xl font-semibold">{totalInvested.toFixed(2)} {currency}</div>
        </Card>
        <Card>
          <div className="text-gray-400 text-sm">Market Value</div>
          <div className="text-xl font-semibold">{totalValue.toFixed(2)} {currency}</div>
        </Card>
        <Card>
          <div className="text-gray-400 text-sm">PnL</div>
          <div className={`text-xl font-semibold ${totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {totalPnL.toFixed(2)} {currency} ({totalPnLPercent.toFixed(2)}%)
          </div>
        </Card>
      </div>

      {/* Assets Table */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Assets</h2>
          <Button onClick={() => { setModalOpen(true); setEditing(null); }}>+ Add Asset</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="p-2 text-left">Symbol</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Avg Price</th>
                <th className="p-2 text-right">Invested</th>
                <th className="p-2 text-right">Price</th>
                <th className="p-2 text-right">Value</th>
                <th className="p-2 text-right">PnL</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((a) => {
                const invested = a.purchasePrice * a.quantity * rate;
                const value = (a.price || 0) * a.quantity * rate;
                const pnl = value - invested;
                const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
                return (
                  <tr key={a.id} className="border-b border-gray-800">
                    <td className="p-2">{a.symbol}</td>
                    <td className="p-2 text-right">{a.quantity}</td>
                    <td className="p-2 text-right">{(a.purchasePrice * rate).toFixed(2)}</td>
                    <td className="p-2 text-right">{invested.toFixed(2)}</td>
                    <td className="p-2 text-right">{(a.price * rate).toFixed(2)}</td>
                    <td className="p-2 text-right">{value.toFixed(2)}</td>
                    <td className={`p-2 text-right ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
                    </td>
                    <td className="p-2 flex gap-2 justify-end">
                      <Button className="bg-gray-700 px-2 py-1 text-xs" onClick={() => { setEditing(a); setModalOpen(true); }}>Edit</Button>
                      <Button className="bg-red-600 px-2 py-1 text-xs" onClick={() => removeAsset(a.id)}>Del</Button>
                    </td>
                  </tr>
                );
              })}
              {!portfolio.length && (
                <tr><td colSpan="8" className="text-center text-gray-500 p-4">No assets yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)}>
        <h2 className="text-lg font-semibold mb-4">{editing ? "Edit Asset" : "Add Asset"}</h2>
        <div className="space-y-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol (e.g. AAPL, TSLA, BINANCE:BTCUSDT)"
          />
          {searchResults.length > 0 && (
            <div className="bg-gray-800 rounded-lg max-h-40 overflow-y-auto">
              {searchResults.slice(0, 5).map((r) => (
                <div
                  key={r.symbol}
                  onClick={() => {
                    setSearchQuery(r.symbol);
                    setSearchResults([]);
                  }}
                  className="px-3 py-2 hover:bg-gray-700 cursor-pointer"
                >
                  {r.symbol} – {r.description}
                </div>
              ))}
            </div>
          )}
          <Input
            type="number"
            placeholder="Quantity"
            value={editing?.quantity || ""}
            onChange={(e) => setEditing({ ...editing, quantity: parseFloat(e.target.value) || 0 })}
          />
          <Input
            type="number"
            placeholder="Purchase Price (in USD)"
            value={editing?.purchasePrice || ""}
            onChange={(e) => setEditing({ ...editing, purchasePrice: parseFloat(e.target.value) || 0 })}
          />
          <Button
            onClick={() =>
              saveAsset({
                symbol: searchQuery,
                quantity: editing?.quantity || 0,
                purchasePrice: editing?.purchasePrice || 0,
              })
            }
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}