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
    <div className="bg-[#07102a] min-h-screen text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-[#07102a] border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Image src="/logo.svg" alt="Bloomboard" width={120} height={30} />
          <nav className="flex items-center gap-6 text-sm text-gray-300">
            <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
            <Link href="/lab" className="hover:text-white">Lab</Link>
            <Link href="/trade" className="hover:text-white">Trade</Link>
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-white">Docs</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h1 className="text-5xl font-bold text-white leading-tight">
              Bloomboard — Portfolio Management & Trading Lab
            </h1>
            <p className="mt-4 text-gray-300 text-lg">
              Track portfolios in realtime, connect Wallet, TradingView charts,
              get AI insights, and manage positions — all in one beautiful app.
            </p>

            {/* Tombol */}
            <div className="mt-8 flex gap-4">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-cyan-500 rounded-lg text-black font-semibold 
                           transition transform hover:bg-cyan-400 hover:scale-105 shadow-md"
              >
                Open Dashboard
              </Link>
              <a
                href="#features"
                className="px-6 py-3 border border-gray-700 rounded-lg text-gray-300 
                           transition hover:text-white hover:border-white"
              >
                Learn more
              </a>
            </div>
          </div>

          {/* Chart + GIF + SVG */}
          <div className="flex flex-col items-center justify-center w-full">
            {/* TradingView chart + tombol fullscreen */}
            <div className="relative w-full h-96 mb-8 rounded-xl overflow-hidden border border-gray-800 shadow-lg">
              <div ref={chartContainerRef} className="w-full h-full" />
              <button
                onClick={toggleFullscreen}
                className="absolute top-3 right-3 bg-black/70 text-white p-2 rounded-md text-xs hover:bg-black/90"
                title="Fullscreen"
              >
                ⛶
              </button>
            </div>

            {/* GIF + SVG sampingan */}
            <div className="flex flex-row gap-6 w-full justify-center">
              <Image
                src="/alocation.gif"
                alt="Allocation Chart"
                width={280}
                height={200}
                unoptimized
                className="rounded-xl shadow-lg border border-gray-800"
              />
              <Image
                src="/hero-illustration.svg"
                alt="Hero"
                width={280}
                height={200}
                className="rounded-xl shadow-lg border border-gray-800"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}