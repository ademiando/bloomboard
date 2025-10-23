"use client";

import { useState } from "react";
import Link from "next/link";

// Komponen Ikon Close (X) sudah dihapus karena tidak lagi digunakan

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  // Sekarang toggleMenu menangani buka dan tutup
  const toggleMenu = () => setIsOpen(!isOpen);
  
  // Fungsi closeMenu yang spesifik masih berguna untuk item link
  const closeMenu = () => setIsOpen(false); 

  // Mencegah scroll di body saat menu terbuka
  if (typeof window !== "undefined") {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }

  return (
    <>
      {/* Tombol Hamburger (Lebih Kecil dan Rapat) */}
      <button
        onClick={toggleMenu} // Menggunakan toggleMenu untuk buka/tutup
        className={`fixed top-3 left-3 z-[60] w-7 h-7 p-1.5 flex flex-col justify-center items-center gap-1 
                   bg-black/30 backdrop-blur-sm rounded-md
                   transition-all duration-300 ease-in-out
                   hover:bg-black/50`}
        aria-label="Toggle menu"
      >
        {/* Animasi Garis menjadi X */}
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "transform rotate-45 translate-y-[3px]" : "" 
          }`}
        ></span>
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "opacity-0" : ""
          }`}
        ></span>
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "transform -rotate-45 -translate-y-[3px]" : "" 
          }`}
        ></span>
      </button>

      {/* --- Panel Menu (Lebar 75% dari Kiri) --- */}
      
      {/* 1. Latar Belakang Overlay (Klik untuk menutup) */}
      <div
        onClick={closeMenu} // Tetap bisa klik overlay untuk menutup
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm
                    transition-opacity duration-500 ease-in-out
                    ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
      ></div>

      {/* 2. Konten Menu (Slide-in 75%) */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[75%] max-w-sm 
                    p-8 flex flex-col items-center 
                    bg-black/80 backdrop-blur-lg shadow-2xl
                    transition-transform duration-500 ease-in-out
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`} // Slide dari kiri
      >
        {/* Tombol Close 'X' (DIHAPUS) */}

        <div className="w-full h-full flex flex-col items-center">
          {/* Konten Atas & Tengah (Hanya Nav) */}
          <div className="flex-grow flex flex-col items-center justify-center text-center">
            
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
        </div>
      </div>
    </>
  );
}
