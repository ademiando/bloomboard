'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export default function TradingViewWidget({ symbol }) {
  const ref = useRef(null);
  const [fs, setFs] = useState(false);
  const id = "tv_"+Math.random().toString(36).slice(2);
  const tvSymbol = symbol || 'SP:SPX';
  useEffect(()=>{
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const s = document.createElement('script');
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.type = "text/javascript";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true, symbol: tvSymbol, interval: "D", timezone: "Etc/UTC", theme: "dark", style: "1", locale: "en", withdateranges: true, allow_symbol_change: true, container_id: id
    });
    el.appendChild(s);
    return ()=> { if (el) el.innerHTML = ""; };
  }, [tvSymbol, id]);
  return (
    <div className={fs?"fixed inset-0 bg-[#131722] z-50 p-4 flex flex-col":"bg-[#181A20] p-4 rounded-lg h-[500px] flex flex-col"}>
      <div className="flex justify-between items-center mb-2">
        <div><h2 className="text-lg font-semibold text-white">Main Chart</h2><p className="text-xs text-gray-400">Showing: {tvSymbol}</p></div>
        <button onClick={()=>setFs(!fs)} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700">{fs? <Minimize/> : <Maximize/>}</button>
      </div>
      <div id={id} ref={ref} className="flex-grow w-full h-full"></div>
    </div>
  );
}
