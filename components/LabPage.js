'use client';
import { useState } from 'react';
export default function LabPage(){
  const [input,setInput]=useState('');
  const [messages,setMessages]=useState([{from:'ai',text:'Welcome to Lab'}]);
  async function send(){
    if(!input) return;
    setMessages(prev=>[...prev,{from:'user',text:input}]);
    const res = await fetch('/api/ai', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ prompt: input }) });
    const data = await res.json();
    setMessages(prev=>[...prev,{from:'ai',text: data.message||'No response'}]);
    setInput('');
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-[#181A20] p-4 rounded-lg">AI Chat</div>
      <div className="bg-[#181A20] p-4 rounded-lg">Strategy Editor</div>
    </div>
  );
}
