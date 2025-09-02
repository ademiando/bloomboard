'use client';
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getDeviceId } from "@/lib/deviceId";
import { loadPortfolio, savePortfolio } from "@/lib/supabaseClient";
import TradingViewWidget from "@/components/TradingViewWidget";
import { AssetModal, PortfolioHeader, AssetTable, AllocationChart, NewsFeed } from "@/components/PortfolioUI";

export default function DashboardPage() {
  const [portfolio, setPortfolio] = useState([]);
  const [marketData, setMarketData] = useState({});
  const [currency, setCurrency] = useState('USD');
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const deviceId = useMemo(()=> getDeviceId(), []);

  useEffect(()=>{
    (async ()=>{
      try {
        const { rowId, data } = await loadPortfolio(deviceId);
        setPortfolio(data.length ? data : [{ id: Date.now(), symbol: 'NASDAQ:NVDA', quantity: 10, purchasePrice: 160, currency: 'USD', date: '2023-01-15' }]);
      } catch(e) {
        console.error(e);
        setPortfolio([{ id: Date.now(), symbol: 'NASDAQ:NVDA', quantity: 10, purchasePrice: 160, currency: 'USD', date: '2023-01-15' }]);
      }
    })();
  }, [deviceId]);

  useEffect(()=>{
    if (!portfolio.length) return;
    // simplistic initial fetch for quotes: use Finnhub REST /quote if key available via serverless route later
    // For now we keep marketData empty until realtime WS updates or API call.
  }, [portfolio]);

  const openModal = (a=null)=>{ setEditing(a); setModalOpen(true); };
  const closeModal = ()=>{ setEditing(null); setModalOpen(false); };
  const save = async (d)=>{
    if (!d.symbol) return alert("Symbol required");
    if (d.id) setPortfolio(prev=> prev.map(x=> x.id===d.id? {...x,...d}: x));
    else setPortfolio(prev=> [...prev, {...d, id: Date.now()}]);
    closeModal();
  };
  const remove = (id)=> setPortfolio(prev=> prev.filter(x=> x.id!==id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <PortfolioHeader portfolio={portfolio} marketData={marketData} currency={currency} />
          <TradingViewWidget symbol={portfolio[0]?.symbol || 'SP:SPX'} />
          <AssetTable portfolio={portfolio} marketData={marketData} onEdit={openModal} onRemove={remove} onAdd={()=>openModal(null)} currency={currency} />
        </div>
        <div className="lg:col-span-1 space-y-4">
          <AllocationChart portfolio={portfolio} marketData={marketData} />
          <NewsFeed articles={[]} />
        </div>
      </div>
      <AssetModal isOpen={isModalOpen} onClose={closeModal} onSave={save} asset={editing} />
    </div>
  );
}