"use client";

import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { saveAs } from "file-saver";

// Utility functions
function fmtMoney(v, ccy = "USD") {
  if (ccy === "IDR") {
    return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
  } else {
    return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}
function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// Main component
export default function Dashboard() {
  const [assets, setAssets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [depositIdrInput, setDepositIdrInput] = useState("");
  const [depositUsdInput, setDepositUsdInput] = useState("");
  const [depositTotal, setDepositTotal] = useState(0);
  const [depositFormOpen, setDepositFormOpen] = useState(false);
  const [chartModal, setChartModal] = useState({ open: false, symbol: "", coingeckoId: "", type: "" });
  function openChartModal(asset) {
    setChartModal({
      open: true,
      symbol: asset.symbol,
      coingeckoId: asset.coingeckoId || asset.id,
      type: asset.type || "stock",
    });
  }
  function closeChartModal() {
    setChartModal({ open: false, symbol: "", coingeckoId: "", type: "" });
  }

  const totals = useMemo(() => {
    let invested = 0;
    let market = 0;
    let pnl = 0;
    let investedUSD = 0;
    assets.forEach((a) => {
      invested += toNum(a.investedUSD || 0);
      market += toNum(a.marketValueUSD || 0);
    });
    pnl = market - invested;
    return { invested, market, pnl, pnlPct: invested > 0 ? (pnl / invested) * 100 : 0 };
  }, [assets]);

  const tradingBalance = useMemo(() => {
    const investedSum = totals.invested || 0;
    const deposits = depositTotal || 0;
    return Math.max(0, deposits - investedSum);
  }, [totals, depositTotal]);

  // Add asset
  function addAsset(asset) {
    if (tradingBalance <= 0) return;
    setAssets((prev) => [...prev, asset]);
  }

  // Add deposit
  function addDeposit() {
    const idr = Number(depositIdrInput) || 0;
    const usd = Number(depositUsdInput) || 0;
    const addUSD = (idr > 0 ? idr / 15000 : 0) + usd; // asumsi kurs dummy
    if (addUSD > 0) {
      setDepositTotal((t) => t + addUSD);
      setDepositIdrInput("");
      setDepositUsdInput("");
      setDepositFormOpen(false);
    }
  }

  // Donut allocation data
  const donutData = assets.map((a) => ({
    name: a.symbol,
    value: a.marketValueUSD,
  }));

  const COLORS = ["#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d", "#ffc658"];

  // Growth portfolio data dummy
  const growthData = [
    { date: "2023-01", value: 1000 },
    { date: "2023-02", value: 1100 },
    { date: "2023-03", value: 1050 },
    { date: "2023-04", value: 1200 },
  ];

  return (
    <div className="p-4">
      {/* KPIs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-sm items-center">
        <div className="flex justify-between text-gray-400">
          <div>Invested</div>
          <div className="font-medium">{fmtMoney(totals.invested, "USD")}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Market</div>
          <div className="font-medium">{fmtMoney(totals.market, "USD")}</div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Gain P&L</div>
          <div className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtMoney(totals.pnl, "USD")} ({totals.pnlPct.toFixed(2)}%)
          </div>
        </div>
        <div className="flex justify-between text-gray-400">
          <div>Trading Balance</div>
          <div className="font-medium">{fmtMoney(tradingBalance, "USD")}</div>
        </div>
      </div>

      {/* Add Panel */}
      {openAdd && (
        <div className="bg-gray-800 p-4 rounded mt-4">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setDepositFormOpen((v) => !v)}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-2 rounded font-semibold btn mr-2"
            >
              Deposit
            </button>
            {depositFormOpen && (
              <div className="flex items-center gap-2 mr-4">
                <input
                  value={depositIdrInput}
                  onChange={(e) => setDepositIdrInput(e.target.value)}
                  placeholder="IDR"
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800"
                />
                <input
                  value={depositUsdInput}
                  onChange={(e) => setDepositUsdInput(e.target.value)}
                  placeholder="USD"
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-800"
                />
                <button
                  onClick={addDeposit}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded font-semibold btn"
                >
                  Add Deposit
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => addAsset({ symbol: "BTC", investedUSD: 100, marketValueUSD: 120 })}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold btn"
            >
              Add Assets
            </button>
            <button
              onClick={() => setOpenAdd(false)}
              className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded font-semibold btn"
            >
              Close
            </button>
          </div>
        </div>
      )}

{/* Asset Table */}
      <div className="overflow-x-auto mt-6">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="px-4 py-2 text-left">Asset</th>
              <th className="px-4 py-2 text-right">Invested</th>
              <th className="px-4 py-2 text-right">Market Value</th>
              <th className="px-4 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => {
              const pnl = (a.marketValueUSD || 0) - (a.investedUSD || 0);
              const pnlPct = (a.investedUSD || 0) > 0 ? (pnl / a.investedUSD) * 100 : 0;
              return (
                <tr key={i} className="border-t border-gray-700 hover:bg-gray-800">
                  <td
                    className="px-4 py-2 cursor-pointer text-emerald-400 hover:underline"
                    onClick={() => openChartModal(a)}
                  >
                    {a.symbol}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtMoney(a.investedUSD, "USD")}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(a.marketValueUSD, "USD")}</td>
                  <td className={`px-4 py-2 text-right ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtMoney(pnl, "USD")} ({pnlPct.toFixed(2)}%)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Donut Allocation */}
      <div className="flex flex-col items-center justify-center mt-8">
        <div className="w-full sm:w-1/2">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center mt-4 gap-3">
          {donutData.map((entry, index) => (
            <div key={index} className="flex items-center space-x-2 text-xs">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              ></span>
              <span>{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Growth Portfolio */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Portfolio Growth</h2>
        <div className="bg-gray-800 p-4 rounded-lg">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={growthData}>
              <XAxis dataKey="date" stroke="#888" />
              <YAxis stroke="#888" />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#00C49F" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Export CSV */}
      <div className="mt-6">
        <button
          onClick={() => {
            const header = "Symbol,InvestedUSD,MarketValueUSD\n";
            const rows = assets
              .map((a) => `${a.symbol},${a.investedUSD},${a.marketValueUSD}`)
              .join("\n");
            const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
            saveAs(blob, "portfolio.csv");
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-semibold btn"
        >
          Export CSV
        </button>
      </div>

      {/* Modal Chart */}
      {chartModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-4 w-full sm:w-3/4 lg:w-1/2 relative">
            <button
              onClick={closeChartModal}
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-lg font-semibold mb-3 text-emerald-400">{chartModal.symbol}</h3>
            <div className="h-96">
              <iframe
                src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${chartModal.symbol}&symbol=${chartModal.symbol}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc/UTC&withdateranges=1&hideideas=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]`}
                className="w-full h-full"
                frameBorder="0"
                allowTransparency
                allowFullScreen
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// Extra utility hooks and helpers
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });
  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };
  return [storedValue, setValue];
}

export function PortfolioApp() {
  const [assets, setAssets] = useLocalStorage("assets", []);
  const [transactions, setTransactions] = useLocalStorage("transactions", []);
  const [deposits, setDeposits] = useLocalStorage("deposits", []);
  const [openAdd, setOpenAdd] = useState(false);
  const [depositFormOpen, setDepositFormOpen] = useState(false);
  const [depositIdrInput, setDepositIdrInput] = useState("");
  const [depositUsdInput, setDepositUsdInput] = useState("");
  const [chartModal, setChartModal] = useState({ open: false, symbol: "" });

  const totals = useMemo(() => {
    let invested = 0;
    let market = 0;
    assets.forEach((a) => {
      invested += toNum(a.investedUSD || 0);
      market += toNum(a.marketValueUSD || 0);
    });
    return { invested, market, pnl: market - invested };
  }, [assets]);

  const depositTotal = deposits.reduce((acc, d) => acc + d.amount, 0);
  const tradingBalance = depositTotal - totals.invested;

  function addDeposit() {
    const idr = Number(depositIdrInput) || 0;
    const usd = Number(depositUsdInput) || 0;
    const addUSD = (idr > 0 ? idr / 15000 : 0) + usd;
    if (addUSD > 0) {
      const newDeposit = { id: Date.now(), amount: addUSD };
      setDeposits([...deposits, newDeposit]);
      setDepositIdrInput("");
      setDepositUsdInput("");
      setDepositFormOpen(false);
    }
  }

  function addAsset(asset) {
    if (tradingBalance <= 0) return;
    setAssets([...assets, asset]);
  }

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-bold text-emerald-400">My Portfolio</h1>
        <button
          onClick={() => setOpenAdd(!openAdd)}
          className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold"
        >
          {openAdd ? "Close" : "Add Assets"}
        </button>
      </div>

      {openAdd && (
        <div className="bg-gray-800 p-4 rounded-lg mb-4">
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setDepositFormOpen(!depositFormOpen)}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-2 rounded font-semibold"
            >
              Deposit
            </button>
            {depositFormOpen && (
              <div className="flex items-center gap-2">
                <input
                  value={depositIdrInput}
                  onChange={(e) => setDepositIdrInput(e.target.value)}
                  placeholder="IDR"
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-700"
                />
                <input
                  value={depositUsdInput}
                  onChange={(e) => setDepositUsdInput(e.target.value)}
                  placeholder="USD"
                  className="rounded-md bg-gray-900 px-3 py-2 text-sm border border-gray-700"
                />
                <button
                  onClick={addDeposit}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded font-semibold"
                >
                  Add Deposit
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => addAsset({ symbol: "ETH", investedUSD: 200, marketValueUSD: 250 })}
              className="bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded font-semibold"
            >
              Add Assets
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 text-sm">
        <div className="flex flex-col items-center">
          <span className="text-gray-400">Invested</span>
          <span className="font-semibold">{fmtMoney(totals.invested, "USD")}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-400">Market</span>
          <span className="font-semibold">{fmtMoney(totals.market, "USD")}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-400">P&L</span>
          <span
            className={`font-semibold ${totals.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {fmtMoney(totals.pnl, "USD")}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-400">Trading Balance</span>
          <span className="font-semibold">{fmtMoney(tradingBalance, "USD")}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-gray-400">
              <th className="px-4 py-2 text-left">Asset</th>
              <th className="px-4 py-2 text-right">Invested</th>
              <th className="px-4 py-2 text-right">Market Value</th>
              <th className="px-4 py-2 text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => {
              const pnl = (a.marketValueUSD || 0) - (a.investedUSD || 0);
              const pnlPct = (a.investedUSD || 0) > 0 ? (pnl / a.investedUSD) * 100 : 0;
              return (
                <tr key={i} className="border-t border-gray-700 hover:bg-gray-800">
                  <td
                    className="px-4 py-2 cursor-pointer text-emerald-400 hover:underline"
                    onClick={() => setChartModal({ open: true, symbol: a.symbol })}
                  >
                    {a.symbol}
                  </td>
                  <td className="px-4 py-2 text-right">{fmtMoney(a.investedUSD, "USD")}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(a.marketValueUSD, "USD")}</td>
                  <td className={`px-4 py-2 text-right ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtMoney(pnl, "USD")} ({pnlPct.toFixed(2)}%)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// Chart Modal for PortfolioApp
export function ChartModal({ chartModal, close }) {
  if (!chartModal.open) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-4 w-full sm:w-3/4 lg:w-1/2 relative">
        <button
          onClick={close}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        <h3 className="text-lg font-semibold mb-3 text-emerald-400">{chartModal.symbol}</h3>
        <div className="h-96">
          <iframe
            src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${chartModal.symbol}&symbol=${chartModal.symbol}&interval=D&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Etc/UTC&withdateranges=1&hideideas=1`}
            className="w-full h-full"
            frameBorder="0"
            allowTransparency
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  );
}

// Root App (renders Dashboard and PortfolioApp)
export function RootApp() {
  const [view, setView] = useState("dashboard");
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="flex justify-between items-center px-6 py-4 border-b border-gray-800">
        <h1 className="text-2xl font-bold text-emerald-400">Bloomboard</h1>
        <nav className="flex gap-4 text-sm">
          <button
            onClick={() => setView("dashboard")}
            className={`${view === "dashboard" ? "text-emerald-400" : "text-gray-400"} hover:text-white`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView("portfolio")}
            className={`${view === "portfolio" ? "text-emerald-400" : "text-gray-400"} hover:text-white`}
          >
            Portfolio
          </button>
        </nav>
      </header>
      <main className="p-6">
        {view === "dashboard" ? <Dashboard /> : <PortfolioApp />}
      </main>
    </div>
  );
}
