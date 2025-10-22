"use client";

import { useState } from "react";
// Image dan komponen Ikon dihapus karena tidak lagi digunakan di header ini
import Link from "next/link";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  // Mencegah scroll di body saat menu terbuka
  if (typeof window !== "undefined") {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }

  return (
    <>
      {/* Tombol Hamburger (Lebih kecil dan lebih ke atas/kiri) */}
      <button
        onClick={toggleMenu}
        className="fixed top-3 left-3 z-[60] w-10 h-10 p-2.5 space-y-1 flex flex-col justify-center items-center 
                   bg-black/30 backdrop-blur-sm border border-white/20 rounded-lg text-white
                   transition-all duration-300"
        aria-label="Toggle menu"
      >
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "transform rotate-45 translate-y-[6px]" : "" // Disesuaikan
          }`}
        ></span>
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "opacity-0" : ""
          }`}
        ></span>
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "transform -rotate-45 -translate-y-[6px]" : "" // Disesuaikan
          }`}
        ></span>
      </button>

      {/* Panel Menu (Overlay + Glassmorphism + Font Besar) */}
      <div
        className={`fixed inset-0 z-50 p-8 flex flex-col items-center 
                    bg-black/80 backdrop-blur-lg transition-opacity duration-300
                    ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
      >
        <div className="max-w-6xl w-full h-full flex flex-col items-center">
          {/* Konten Atas & Tengah (Hanya Nav) */}
          <div className="flex-grow flex flex-col items-center justify-center text-center">
            
            {/* Logo (DIHAPUS SESUAI PERMINTAAN) */}

            {/* Navbar (Font Besar & Bold) */}
            <nav className="flex flex-col items-center gap-8 text-4xl font-bold text-white">
              <Link
                href="/dashboard"
                onClick={closeMenu}
                className="hover:opacity-70 transition-opacity"
              >
                Dashboard
              </Link>
              <Link
                href="/lab"
                onClick={closeMenu}
                className="hover:opacity-70 transition-opacity"
              >
                Lab
              </Link>
              <Link
                href="/trade"
                onClick={closeMenu}
                className="hover:opacity-70 transition-opacity"
              >
                Trade
              </Link>
              <a
                href="https://github.com/"
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                className="hover:opacity-70 transition-opacity"
              >
                Docs
              </a>
            </nav>
          </div>

          {/* Ikon Sosial (DIHAPUS SESUAI PERMINTAAN) */}
        </div>
      </div>
    </>
  );
}
