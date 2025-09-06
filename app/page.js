"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const chartContainerRef = useRef(null); // tempat tradingview mount
  const [isFullscreen, setIsFullscreen] = useState(false);

  // konstanta tinggi default chart (h-96 = 24rem = 384px)
  const DEFAULT_CHART_HEIGHT_PX = 384;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // bersihkan dulu sebelum inject
    chartContainerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "NASDAQ:NVDA",
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

  useEffect(() => {
    // handler untuk perubahan fullscreen (termasuk ketika user tekan Esc)
    const onFull = () => {
      const isFs = document.fullscreenElement === chartContainerRef.current;
      setIsFullscreen(!!isFs);

      // sesuaikan tinggi chart saat masuk/keluar fullscreen
      if (isFs) {
        // pastikan elemen memenuhi layar
        chartContainerRef.current.style.height = "100vh";
        chartContainerRef.current.style.width = "100%";
      } else {
        // kembalikan ke tinggi default
        chartContainerRef.current.style.height = `${DEFAULT_CHART_HEIGHT_PX}px`;
        chartContainerRef.current.style.width = "100%";
      }
    };

    document.addEventListener("fullscreenchange", onFull);
    return () => document.removeEventListener("fullscreenchange", onFull);
  }, []);

  const enterFullscreen = async () => {
    if (!chartContainerRef.current) return;
    try {
      // sebelum request, set height agar tidak "melebar" sementara
      chartContainerRef.current.style.height = "100vh";
      chartContainerRef.current.style.width = "100%";
      await chartContainerRef.current.requestFullscreen();
      // setIsFullscreen akan di-handle oleh event fullscreenchange
    } catch (err) {
      // jika gagal, kembalikan tampilan
      chartContainerRef.current.style.height = `${DEFAULT_CHART_HEIGHT_PX}px`;
      chartContainerRef.current.style.width = "100%";
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        // perubahan height dikembalikan oleh fullscreenchange handler
      }
    } catch (err) {
      // ignore
    }
  };

  const toggleFullscreen = () => {
    if (!chartContainerRef.current) return;
    if (!document.fullscreenElement) enterFullscreen();
    else exitFullscreen();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div>
          {/* Judul & Subjudul (tidak diubah selain styling) */}
          <h1 className="text-4xl font-bold text-white">
            Bloomboard — Portfolio Management & Trading Lab
          </h1>
          <p className="mt-3 text-lg text-gray-300">
            Monitor your investments in real-time, explore AI-powered insights,
            and visualize growth with professional-grade tools.
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
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="bg-[#0b1320] p-5 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold text-sm">Realtime Quotes</h4>
              <p className="text-xs text-gray-400 mt-2">
                Get live market prices directly integrated from top providers.
              </p>
            </div>
            <div className="bg-[#0b1320] p-5 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold text-sm">AI Strategy Lab</h4>
              <p className="text-xs text-gray-400 mt-2">
                Generate strategies, run backtests, and explore automation.
              </p>
            </div>
            <div className="bg-[#0b1320] p-5 rounded-lg shadow-sm">
              <h4 className="text-white font-semibold text-sm">Pro Charts</h4>
              <p className="text-xs text-gray-400 mt-2">
                Embedded TradingView advanced chart for deep analysis.
              </p>
            </div>
          </div>
        </div>

        {/* Chart + Gambar */}
        <div className="flex flex-col items-center justify-center w-full">
          {/* TradingView chart container (hanya elemen ini yang fullscreen) */}
          <div
            className="relative w-full rounded-lg overflow-hidden border border-gray-800 mb-6"
            // set default height via inline style to match Tailwind h-96 (384px)
            style={{ height: `${DEFAULT_CHART_HEIGHT_PX}px` }}
          >
            {/* chart mount point */}
            <div ref={chartContainerRef} className="w-full h-full" />

            {/* fullscreen button — unobtrusive, won't cover tradingview toolbar */}
            <button
              onClick={toggleFullscreen}
              className="absolute top-2 right-2 z-20 bg-gray-900/80 backdrop-blur text-white px-3 py-1 text-xs rounded-md hover:bg-gray-700"
              aria-label="Toggle fullscreen"
              title="Toggle fullscreen (chart only)"
            >
              ⛶
            </button>
          </div>

          {/* GIF + SVG sejajar di desktop, tapi di mobile dikecilkan supaya tidak melebar */}
          <div className="mt-6 flex flex-col lg:flex-row items-center justify-center gap-6 w-full">
            {/* wrapper 1 */}
            <div className="flex justify-center w-full">
              <div className="w-[85%] max-w-[220px] lg:max-w-[300px] bg-[#0b1320] rounded-lg p-2 flex items-center justify-center border border-gray-800">
                <Image
                  src="/alocation.gif"
                  alt="Allocation Chart"
                  width={400}
                  height={250}
                  unoptimized
                  className="w-full h-auto object-contain rounded-md"
                />
              </div>
            </div>

            {/* wrapper 2 */}
            <div className="flex justify-center w-full">
              <div className="w-[85%] max-w-[220px] lg:max-w-[300px] bg-[#0b1320] rounded-lg p-2 flex items-center justify-center border border-gray-800">
                <Image
                  src="/hero-illustration.svg"
                  alt="Portfolio Illustration"
                  width={400}
                  height={250}
                  className="w-full h-auto object-contain rounded-md"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Features (tidak diubah selain styling) */}
      <section id="features" className="mt-20">
        <h2 className="text-3xl font-bold text-white text-center">Key Features</h2>
        <p className="text-gray-400 text-center mt-2 max-w-2xl mx-auto">
          Everything you need to manage, analyze, and grow your portfolio in one
          integrated platform.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#0b1320] p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-white">Portfolio Tracking</h3>
            <p className="text-sm text-gray-400 mt-2">
              Track asset allocation, performance history, and growth trends.
            </p>
          </div>
          <div className="bg-[#0b1320] p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-white">AI Insights</h3>
            <p className="text-sm text-gray-400 mt-2">
              Leverage AI to identify opportunities and manage risks smarter.
            </p>
          </div>
          <div className="bg-[#0b1320] p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-white">News & Alerts</h3>
            <p className="text-sm text-gray-400 mt-2">
              Stay updated with market news and instant custom alerts.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}