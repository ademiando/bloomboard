"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ArrowDown, Download, Upload } from "lucide-react";

// warna pastel cerah
const COLORS = [
  "#FFADAD", "#FFD6A5", "#FDFFB6",
  "#CAFFBF", "#9BF6FF", "#A0C4FF",
  "#BDB2FF", "#FFC6FF", "#FFFFFC"
];

export default function DashboardPage() {
  const [assets, setAssets] = useState([]);
  const [usdIdr, setUsdIdr] = useState(16000);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("crypto");
  const [searchResults, setSearchResults] = useState([]);

  // load dari localStorage
  useEffect(() => {
    const stored = localStorage.getItem("bb_assets_final");
    if (stored) setAssets(JSON.parse(stored));
    const storedRate = localStorage.getItem("usdIdr_final");
    if (storedRate) setUsdIdr(parseFloat(storedRate));
  }, []);

  // simpan ke localStorage
  useEffect(() => {
    localStorage.setItem("bb_assets_final", JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem("usdIdr_final", usdIdr);
  }, [usdIdr]);

  // fetch kurs realtime
  useEffect(() => {
    const fetchRate = async () => {
      try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD");
        const j = await r.json();
        if (j?.rates?.IDR) setUsdIdr(j.rates.IDR);
      } catch (e) {
        console.error("Failed to fetch USD/IDR", e);
      }
    };
    fetchRate();
    const i = setInterval(fetchRate, 60000);
    return () => clearInterval(i);
  }, []);

  // normalisasi harga saham IDR (biar ga salah skala)
  const normalizeIdr = (price) => {
    if (!price) return 0;
    if (price < 100) return price * 1000;
    return price;
  };

  // pencarian aset
  const searchAsset = async () => {
    try {
      if (!searchQuery) return;
      if (searchType === "crypto") {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/search?query=${searchQuery}`
        );
        const data = await res.json();
        setSearchResults(
          data.coins.map(c => ({
            id: c.id,
            symbol: c.symbol.toUpperCase(),
            name: c.name,
            type: "crypto"
          }))
        );
      } else {
        const res = await fetch(`/api/yahoo/search?q=${encodeURIComponent(searchQuery)}`, {
          cache: "no-store"
        });
        const j = await res.json();
        const list = (j.quotes || []).slice(0, 15).map(it => ({
          id: it.symbol,
          symbol: it.symbol,
          name: it.shortname || it.longname || it.symbol,
          type: "stock"
        }));
        setSearchResults(list);
      }
    } catch (err) {
      console.error("search error:", err);
    }
  };

  // fetch harga tiap aset
  useEffect(() => {
    const fetchPrices = async () => {
      const updated = await Promise.all(
        assets.map(async asset => {
          try {
            if (asset.type === "crypto") {
              const res = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${asset.id}&vs_currencies=usd`
              );
              const data = await res.json();
              return {
                ...asset,
                lastKnownNative: data[asset.id]?.usd || asset.lastKnownNative
              };
            } else {
              const res = await fetch(
                `https://query1.finance.yahoo.com/v8/finance/chart/${asset.id}?interval=1d`
              );
              const data = await res.json();
              const price = normalizeIdr(data.chart.result[0].meta.regularMarketPrice);
              return {
                ...asset,
                lastKnownNative: price || asset.lastKnownNative
              };
            }
          } catch {
            return asset;
          }
        })
      );
      setAssets(updated);
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [assets.length]);

  // tambah aset
  const addAsset = (asset) => {
    if (!assets.some(a => a.id === asset.id)) {
      setAssets([...assets, {
        ...asset,
        amount: 0,
        buyPrice: 0,
        lastKnownNative: 0,
        avgBuy: 0,
        realizedPL: 0
      }]);
    }
    setShowAdd(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  // buy/sell logic
  const buyAsset = (id, qty, price) => {
    setAssets(assets.map(a => {
      if (a.id !== id) return a;
      const totalCost = a.avgBuy * a.amount + price * qty;
      const newAmount = a.amount + qty;
      const newAvg = newAmount > 0 ? totalCost / newAmount : 0;
      return { ...a, amount: newAmount, avgBuy: newAvg };
    }));
  };

  const sellAsset = (id, qty, price) => {
    setAssets(assets.map(a => {
      if (a.id !== id) return a;
      const sellQty = Math.min(qty, a.amount);
      const pl = (price - a.avgBuy) * sellQty;
      return {
        ...a,
        amount: a.amount - sellQty,
        realizedPL: (a.realizedPL || 0) + pl
      };
    }));
  };

  const deleteAsset = (id) => {
    if (window.confirm("Hapus aset ini dari portofolio?")) {
      setAssets(assets.filter(a => a.id !== id));
    }
  };

  // total porto
  const totalValue = assets.reduce(
    (sum, a) => sum + a.amount * (a.lastKnownNative || 0),
    0
  );

  const chartData = assets.map(a => ({
    name: a.symbol,
    value: a.amount * (a.lastKnownNative || 0)
  }));

  return (
    <div className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-700">Portfolio Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-100"
          >
            <Plus className="text-gray-600" />
          </button>
        </div>
      </div>

      {showAdd && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <div className="flex gap-2 mb-2">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="border rounded-lg p-2"
            >
              <option value="crypto">Crypto</option>
              <option value="id">Saham ID</option>
              <option value="global">US/Global</option>
            </select>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1"
            />
            <Button onClick={searchAsset}>Search</Button>
          </div>
          <div className="rounded-lg p-2 max-h-40 overflow-y-auto bg-white/60">
            {searchResults.map(r => (
              <div
                key={r.id}
                className="p-2 hover:bg-gray-100 cursor-pointer rounded"
                onClick={() => addAsset(r)}
              >
                {r.symbol} - {r.name}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* list asset */}
        <div>
          {assets.map(asset => (
            <div
              key={asset.id}
              className="flex justify-between items-center rounded-xl p-4 mb-3 border-b border-gray-200 bg-transparent"
            >
              <div>
                <p className="font-semibold text-gray-700">
                  {asset.symbol} ({asset.name})
                </p>
                <p className="text-sm text-gray-500">
                  Last:{" "}
                  {asset.lastKnownNative
                    ? `$${asset.lastKnownNative.toFixed(2)}`
                    : "-"}
                </p>
                <p className="text-sm text-gray-500">
                  Avg Buy: ${asset.avgBuy?.toFixed(2) || 0} | Realized P/L:{" "}
                  {asset.realizedPL?.toFixed(2) || 0}
                </p>
                <div className="flex gap-2 mt-2">
                  <Input
                    type="number"
                    placeholder="Qty"
                    id={`buy-qty-${asset.id}`}
                    className="w-20"
                  />
                  <Input
                    type="number"
                    placeholder="Price"
                    id={`buy-price-${asset.id}`}
                    className="w-28"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      buyAsset(
                        asset.id,
                        parseFloat(
                          document.getElementById(`buy-qty-${asset.id}`).value
                        ),
                        parseFloat(
                          document.getElementById(`buy-price-${asset.id}`).value
                        )
                      )
                    }
                  >
                    Buy
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      sellAsset(
                        asset.id,
                        parseFloat(
                          document.getElementById(`buy-qty-${asset.id}`).value
                        ),
                        parseFloat(
                          document.getElementById(`buy-price-${asset.id}`).value
                        )
                      )
                    }
                  >
                    Sell
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteAsset(asset.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* donut */}
        <div className="flex flex-col items-center">
          <PieChart width={320} height={320}>
            <Pie
              data={chartData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={120}
              innerRadius={60}
              label={({ name, percent }) =>
                `${name}: ${(percent * 100).toFixed(1)}%`
              }
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
          <p className="mt-4 font-bold text-gray-700">
            Total Portfolio: ${totalValue.toFixed(2)} | Rp{" "}
            {(totalValue * usdIdr).toLocaleString("id-ID")}
          </p>
        </div>
      </div>
    </div>
  );
}