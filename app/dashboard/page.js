import React, { useState, useEffect } from "react"; import { Card, CardContent } from "@/components/ui/card"; import { Button } from "@/components/ui/button"; import { Input } from "@/components/ui/input"; import { motion } from "framer-motion"; import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts"; import { Plus, Trash2, Edit, ShoppingCart, ArrowDown, Loader2 } from "lucide-react";

export default function PortfolioDashboard() { const [assets, setAssets] = useState([]); const [showAdd, setShowAdd] = useState(false); const [search, setSearch] = useState(""); const [searchType, setSearchType] = useState("crypto"); const [searchResults, setSearchResults] = useState([]); const [loading, setLoading] = useState(false);

// Warna pastel lembut untuk chart const COLORS = ["#A5D8FF", "#FFC9DE", "#FFD8A8", "#C0EB75", "#E5CFFF", "#FFE066"];

// Load from localStorage useEffect(() => { const stored = localStorage.getItem("assets"); if (stored) setAssets(JSON.parse(stored)); }, []);

// Save to localStorage useEffect(() => { localStorage.setItem("assets", JSON.stringify(assets)); }, [assets]);

// Search function const searchAsset = async () => { setLoading(true); let url = ""; if (searchType === "crypto") { url = https://api.coingecko.com/api/v3/search?query=${search}; } else if (searchType === "id") { url = https://query1.finance.yahoo.com/v1/finance/search?q=${search}.JK; } else { url = https://query1.finance.yahoo.com/v1/finance/search?q=${search}; }

try {
  const res = await fetch(url);
  const data = await res.json();
  if (searchType === "crypto") {
    setSearchResults(data.coins.map(c => ({ id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, type: "crypto" })));
  } else {
    setSearchResults(
      data.quotes.map(q => ({ id: q.symbol, symbol: q.symbol, name: q.shortname, type: "stock" }))
    );
  }
} catch (e) {
  console.error(e);
}
setLoading(false);

};

// Update prices periodically useEffect(() => { const fetchPrices = async () => { const updated = await Promise.all( assets.map(async asset => { try { if (asset.type === "crypto") { const res = await fetch( https://api.coingecko.com/api/v3/simple/price?ids=${asset.id}&vs_currencies=usd ); const data = await res.json(); return { ...asset, lastKnownNative: data[asset.id]?.usd || asset.lastKnownNative, lastUpdated: new Date().toLocaleTimeString() }; } else { const res = await fetch( https://query1.finance.yahoo.com/v8/finance/chart/${asset.id}?interval=1m ); const data = await res.json(); const price = data.chart.result[0].meta.regularMarketPrice; return { ...asset, lastKnownNative: price || asset.lastKnownNative, lastUpdated: new Date().toLocaleTimeString() }; } } catch { return asset; } }) ); setAssets(updated); };

fetchPrices();
const interval = setInterval(fetchPrices, 30000);
return () => clearInterval(interval);

}, [assets.length]);

const addAsset = (asset) => { if (!assets.some(a => a.id === asset.id)) { setAssets([...assets, { ...asset, amount: 0, buyPrice: 0, lastKnownNative: 0 }]); } setShowAdd(false); setSearch(""); setSearchResults([]); };

const editAsset = (id, field, value) => { setAssets(assets.map(a => (a.id === id ? { ...a, [field]: value } : a))); };

const confirmDelete = (id) => { if (window.confirm("Are you sure you want to delete this asset?")) { setAssets(assets.filter(a => a.id !== id)); } };

const confirmSell = (id) => { if (window.confirm("Are you sure you want to sell this asset?")) { setAssets(assets.map(a => (a.id === id ? { ...a, amount: 0 } : a))); } };

const totalValue = assets.reduce( (sum, a) => sum + a.amount * (a.lastKnownNative || 0), 0 );

const chartData = assets.map(a => ({ name: a.symbol, value: a.amount * (a.lastKnownNative || 0) }));

return ( <div className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 min-h-screen"> <Card className="shadow-xl rounded-2xl p-6"> <CardContent> <div className="flex justify-between items-center mb-4"> <h1 className="text-2xl font-bold text-gray-700">Portfolio Dashboard</h1> <button onClick={() => setShowAdd(!showAdd)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-100" > <Plus className="text-gray-600" /> </button> </div>

{showAdd && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1"
            />
            <Button onClick={searchAsset} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Search"}
            </Button>
          </div>
          <div className="bg-white rounded-lg shadow p-2 max-h-40 overflow-y-auto">
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
        <div>
          {assets.map(asset => (
            <div key={asset.id} className="flex justify-between items-center bg-white rounded-xl p-4 mb-3 shadow">
              <div>
                <p className="font-semibold text-gray-700">{asset.symbol} ({asset.name})</p>
                <p className="text-sm text-gray-500">Price: ${asset.lastKnownNative || "-"} {asset.lastUpdated && <span className="text-green-500">• {asset.lastUpdated}</span>}</p>
                <Input
                  type="number"
                  value={asset.amount}
                  onChange={(e) => editAsset(asset.id, "amount", parseFloat(e.target.value))}
                  placeholder="Amount"
                  className="mt-2"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => confirmSell(asset.id)}><ArrowDown className="w-4 h-4" /></Button>
                <Button size="sm" variant="destructive" onClick={() => confirmDelete(asset.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <PieChart width={300} height={300}>
            <Pie
              data={chartData}
              dataKey="value"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
          <p className="mt-2 font-bold text-gray-700">Total: ${totalValue.toFixed(2)}</p>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

); }

