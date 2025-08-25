'use client';
import { Plus, ChevronUp, ChevronDown, Search } from 'lucide-react';
import TradingViewWidget from './TradingViewWidget';
export function AssetModal({ isOpen, onClose, onSave, asset }){
  if (!isOpen) return null;
  return null;
}
export function PortfolioHeader({ portfolio, marketData, currency }){
  return <div className="bg-[#181A20] p-4 rounded-lg"><p className="text-sm text-gray-400">Portfolio Value</p><p className="text-4xl font-bold text-white mt-1">$0.00</p></div>;
}
export function AssetTable(){ return <div className="bg-[#181A20] p-4 rounded-lg">Holdings table</div>; }
export function AllocationChart(){ return <div className="bg-[#181A20] p-4 rounded-lg">Allocation</div>; }
export function NewsFeed(){ return <div className="bg-[#181A20] p-4 rounded-lg">News</div>; }
