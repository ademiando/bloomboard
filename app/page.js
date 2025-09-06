"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const chartContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "NASDAQ:NVDA", // Chart NVDA
      interval: "D",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      withdateranges: true,
      hide_top_toolbar: false,
      hide_legend: false,
      support_host: "https://www.tradingview.com",
    });

    chartContainerRef.current.appendChild(script);

    return () => {
      if (chartContainerRef.current) {
        chartContainerRef.current.innerHTML = "";
      }
    };
  }, []);

  const toggleFullscreen = () => {
    const el = chartContainerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl font-bold text-white">
            Bloomboard — Portfolio Management & Trading Lab
          </h1>
          <p className="mt-4 text-gray-300">
            Track portfolios in realtime, connect Wallet, TradingView charts,
            get AI insights, and manage positions — all in one beautiful app.
          </p>

          {/* Tombol */}
          <div className="mt-6 flex gap-3">
            <Link
              href="/dashboard"
              className="px-5 py-3 bg-cyan-500 rounded-md text-black font-semibold 
                         transition transform hover:bg-cyan-400 hover:scale-105"
            >
              Open Dashboard
            </Link>
            <a
              href="#features"
              className="px-5 py-3 border border-gray-700 rounded-md text-gray-300 
                         transition hover:text-white hover:border-white"
            >
              Learn more
            </a>
          </div>

          {/* Feature cards */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-[#0b1320] p-4 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold">Realtime Quotes</h4>
              <p className="text-xs text-gray-400 mt-2">
                Finnhub / provider integration for live prices.
              </p>
            </div>
            <div className="bg-[#0b1320] p-4 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold">AI Strategy Lab</h4>
              <p className="text-xs text-gray-400 mt-2">
                Generate trading robots & backtest code with OpenAI.
              </p>
            </div>
            <div className="bg-[#0b1320] p-4 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold">TradingView Charts</h4>
              <p className="text-xs text-gray-400 mt-2">
                Official TradingView Advanced Chart widget embedded.
              </p>
            </div>
          </div>
        </div>

        {/* Chart + Gambar */}
        <div className="flex flex-col items-center justify-center w-full">
          {/* TradingView chart + tombol fullscreen */}
          <div className="relative w-full h-96 mb-6 rounded-lg overflow-hidden border border-gray-800">
            <div ref={chartContainerRef} className="w-full h-full" />
            <button
              onClick={toggleFullscreen}
              className="absolute top-2 right-2 bg-black/60 text-white px-3 py-1 rounded-md text-xs hover:bg-black/80"
            >
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </button>
          </div>

          {/* GIF + SVG selalu atas-bawah */}
          <div className="flex flex-col items-center justify-center gap-6 w-full">
            <Image
              src="/alocation.gif"
              alt="Allocation Chart"
              width={350}
              height={220}
              unoptimized
              className="rounded-lg shadow-md"
            />
            <Image
              src="/hero-illustration.svg"
              alt="Hero"
              width={350}
              height={220}
              className="rounded-lg shadow-md"
            />
          </div>
        </div>
      </section>

      {/* Section Features */}
      <section id="features" className="mt-16">
        <h2 className="text-2xl font-bold text-white">Features</h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#0b1320] p-6 rounded-lg">
            <h3 className="font-semibold">Portfolio Tracking</h3>
            <p className="text-xs text-gray-400 mt-2">
              Per-device Supabase storage, CRUD UI.
            </p>
          </div>
          <div className="bg-[#0b1320] p-6 rounded-lg">
            <h3 className="font-semibold">AI Insights</h3>
            <p className="text-xs text-gray-400 mt-2">
              ChatGPT-backed assistant for trading strategies.
            </p>
          </div>
          <div className="bg-[#0b1320] p-6 rounded-lg">
            <h3 className="font-semibold">News & Alerts</h3>
            <p className="text-xs text-gray-400 mt-2">
              News API integration & watchlist alerts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}