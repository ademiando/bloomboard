'use client';
import { Wallet } from 'lucide-react';
export default function TradePage(){
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-[#181A20] p-8 rounded-lg text-center">
        <Wallet size={48} className="mx-auto text-cyan-400"/>
        <h2 className="text-2xl font-bold text-white mt-4">Connect Wallet</h2>
      </div>
    </div>
  );
}
