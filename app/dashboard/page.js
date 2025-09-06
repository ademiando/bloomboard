"use client";

import React, { useEffect, useMemo, useState } from "react";
import { saveAs } from "file-saver";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export default function PortfolioDashboard() {
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [realized, setRealized] = useState(0);
  const [currency, setCurrency] = useState("USD");
  const [usdIdr, setUsdIdr] = useState(16000);

  // Load from localStorage
  useEffect(() => {
    const storedAssets = localStorage.getItem("pf_assets_v2");
    const storedRealized = localStorage.getItem("pf_realized_v2");
    const storedCurrency = localStorage.getItem("pf_display_ccy_v2");
    const storedUsdIdr = localStorage.getItem("pf_usdidr_v2");
    if (storedAssets) setAssets(JSON.parse(storedAssets));
    if (storedRealized) setRealized(parseFloat(storedRealized));
    if (storedCurrency) setCurrency(storedCurrency);
    if (storedUsdIdr) setUsdIdr(parseFloat(storedUsdIdr));
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("pf_assets_v2", JSON.stringify(assets));
    localStorage.setItem("pf_realized_v2", realized.toString());
    localStorage.setItem("pf_display_ccy_v2", currency);
    localStorage.setItem("pf_usdidr_v2", usdIdr.toString());
  }, [assets, realized, currency, usdIdr]);

  // Fetch USD/IDR
  useEffect(() => {
    async function fetchUsdIdr() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=idr");
        const j = await res.json();
        const rate = j?.tether?.idr;
        if (rate) setUsdIdr(rate);
      } catch (e) {
        console.warn("USD/IDR fetch failed", e);
      }
    }
    fetchUsdIdr();
    const id = setInterval(fetchUsdIdr, 60000);
    return () => clearInterval(id);
  }, []);

  // Search assets
  async function doSearch(q) {
    setSearch(q);
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const cryptoRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${q}`);
      const cryptoJson = await cryptoRes.json();
      const cryptoResults = cryptoJson.coins.map(c => ({
        type: "crypto",
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name
      }));
      const stockRes = await fetch(`/api/yahoo/quote?symbol=${encodeURIComponent(q)}`);
      const stockJson = await stockRes.json();
      const stockResults = stockJson.quoteResponse?.result?.map(s => ({
        type: "stock",
        id: s.symbol,
        symbol: s.symbol,
        name: s.shortName || s.longName || s.symbol
      })) || [];
      setResults([...cryptoResults, ...stockResults]);
    } catch (e) {
      console.warn("Search error", e);
    }
    setLoading(false);
  }

  // Fetch price
  async function fetchPrice(asset) {
    if (asset.type === "crypto") {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${asset.id}&vs_currencies=usd`
        );
        const j = await res.json();
        return { price: j[asset.id]?.usd || 0, currency: "USD" };
      } catch (e) {
        return { price: 0, currency: "USD" };
      }
    } else if (asset.type === "stock") {
      try {
        const res = await fetch(`/api/yahoo/quote?symbol=${asset.id}`);
        const j = await res.json();
        const q = j.quoteResponse?.result?.[0];
        return { price: q?.regularMarketPrice || 0, currency: q?.currency || "USD" };
      } catch (e) {
        return { price: 0, currency: "USD" };
      }
    }
    return { price: 0, currency: "USD" };
  }

  // Refresh prices periodically
  useEffect(() => {
    async function refresh() {
      const upd = await Promise.all(
        assets.map(async a => {
          const { price, currency } = await fetchPrice(a);
          return { ...a, lastPrice: price, currency };
        })
      );
      setAssets(upd);
    }
    if (assets.length > 0) {
      refresh();
      const id = setInterval(refresh, 30000);
      return () => clearInterval(id);
    }
  }, [assets.length]);

  // Derived metrics
  const totals = useMemo(() => {
    let mv = 0;
    let cost = 0;
    assets.forEach(a => {
      mv += a.qty * (a.lastPrice || 0);
      cost += a.qty * (a.avgPrice || 0);
    });
    const pnl = mv - cost;
    return { mv, cost, pnl };
  }, [assets]);

  const displayFactor = currency === "IDR" ? usdIdr : 1;
  const format = n => {
    if (currency === "IDR") return `Rp ${n.toLocaleString("id-ID")}`;
    return `$${n.toLocaleString("en-US")}`;
  };

  // Add asset manually
  function addAsset(r) {
    const exists = assets.find(a => a.id === r.id && a.type === r.type);
    if (exists) return;
    setAssets([...assets, { ...r, qty: 0, avgPrice: 0, lastPrice: 0 }]);
  }

  // Delete
  function delAsset(id) {
    setAssets(assets.filter(a => a.id !== id));
  }

  // Trade (buy/sell)
  function tradeAsset(id, qty, price, side) {
    setAssets(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        if (side === "buy") {
          const newQty = a.qty + qty;
          const newAvg = (a.avgPrice * a.qty + price * qty) / newQty;
          return { ...a, qty: newQty, avgPrice: newAvg };
        } else {
          const sellVal = price * qty;
          const cost = a.avgPrice * qty;
          setRealized(r => r + (sellVal - cost));
          return { ...a, qty: a.qty - qty };
        }
      })
    );
  }

  // CSV Export
  function exportCsv() {
    const rows = [
      ["id","symbol","name","type","qty","avgPrice","lastPrice","currency"],
      ...assets.map(a => [a.id,a.symbol,a.name,a.type,a.qty,a.avgPrice,a.lastPrice,a.currency])
    ];
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], {type:"text/csv"});
    saveAs(blob, "portfolio.csv");
  }

  // CSV Import
  function importCsv(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const txt = evt.target.result;
      const lines = txt.split("\n").slice(1).filter(l => l.trim());
      const parsed = lines.map(l => {
        const [id,symbol,name,type,qty,avgPrice,lastPrice,currency] = l.split(",");
        return {id,symbol,name,type,qty:parseFloat(qty),avgPrice:parseFloat(avgPrice),lastPrice:parseFloat(lastPrice),currency};
      });
      setAssets(parsed);
    };
    reader.readAsText(f);
  }

  // Chart data
  const chartData = useMemo(() => {
    const arr = assets.map(a => ({ name: a.symbol, value: a.qty * (a.lastPrice || 0) }));
    arr.sort((a,b) => b.value - a.value);
    const top = arr.slice(0,4);
    if (arr.length > 4) {
      const other = arr.slice(4).reduce((s,a) => s+a.value,0);
      top.push({ name:"Other", value: other });
    }
    return top;
  }, [assets]);

  const COLORS = ["#0088FE","#00C49F","#FFBB28","#FF8042","#999999"];

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-2">Portfolio Dashboard</h1>

      <div className="mb-2 flex gap-2 items-center">
        <input
          value={search}
          onChange={e => doSearch(e.target.value)}
          placeholder="Search crypto/stock"
          className="border px-2 py-1 rounded"
        />
        {loading && <span>Loading...</span>}
      </div>

      {results.length > 0 && (
        <ul className="mb-4 border rounded">
          {results.map(r => (
            <li key={r.id} className="p-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => addAsset(r)}>
              {r.symbol} - {r.name} ({r.type})
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4">
        <span className="mr-2">Currency:</span>
        <select value={currency} onChange={e => setCurrency(e.target.value)} className="border rounded px-2 py-1">
          <option value="USD">USD</option>
          <option value="IDR">IDR</option>
        </select>
      </div>

      <table className="w-full border mb-4">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Symbol</th>
            <th className="p-2 border">Qty</th>
            <th className="p-2 border">Avg Price</th>
            <th className="p-2 border">Last Price</th>
            <th className="p-2 border">Value</th>
            <th className="p-2 border">PnL</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(a => {
            const val = a.qty * (a.lastPrice || 0);
            const pnl = val - a.qty * a.avgPrice;
            return (
              <tr key={a.id}>
                <td className="p-2 border">{a.symbol}</td>
                <td className="p-2 border">{a.qty}</td>
                <td className="p-2 border">{format(a.avgPrice * displayFactor)}</td>
                <td className="p-2 border">{format((a.lastPrice||0) * displayFactor)}</td>
                <td className="p-2 border">{format(val * displayFactor)}</td>
                <td className={`p-2 border ${pnl>=0?"text-green-600":"text-red-600"}`}>{format(pnl * displayFactor)}</td>
                <td className="p-2 border">
                  <button className="bg-blue-500 text-white px-2 py-1 rounded mr-1"
                    onClick={()=>tradeAsset(a.id,1,a.lastPrice,"buy")}>Buy</button>
                  <button className="bg-red-500 text-white px-2 py-1 rounded mr-1"
                    onClick={()=>tradeAsset(a.id,1,a.lastPrice,"sell")}>Sell</button>
                  <button className="bg-gray-500 text-white px-2 py-1 rounded"
                    onClick={()=>delAsset(a.id)}>Del</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mb-4">
        <p>Total MV: {format(totals.mv * displayFactor)}</p>
        <p>Total Cost: {format(totals.cost * displayFactor)}</p>
        <p>Unrealized PnL: {format(totals.pnl * displayFactor)}</p>
        <p>Realized PnL: {format(realized * displayFactor)}</p>
      </div>

      <div style={{width:"100%",height:300}}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}>
              {chartData.map((entry,index)=><Cell key={index} fill={COLORS[index%COLORS.length]}/>)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={exportCsv} className="bg-green-600 text-white px-3 py-1 rounded">Export CSV</button>
        <input type="file" accept=".csv" onChange={importCsv} className="border p-1"/>
      </div>
    </div>
  );
}