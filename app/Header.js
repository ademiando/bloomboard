"use client";

import { useState } from "react";
import Link from "next/link";

// Ikon Close (X)
const CloseIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    {...props}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);


export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false); // Fungsi khusus untuk menutup

  // Mencegah scroll di body saat menu terbuka
  if (typeof window !== "undefined") {
    document.body.style.overflow = isOpen ? "hidden" : "auto";
  }

  return (
    <>
      {/* Tombol Hamburger (Lebih Kecil dan Rapat) */}
      <button
        onClick={toggleMenu}
        className={`fixed top-3 left-3 z-[60] w-7 h-7 p-1.5 flex flex-col justify-center items-center gap-1 
                   bg-black/30 backdrop-blur-sm rounded-md
                   transition-all duration-300 ease-in-out
                   hover:bg-black/50`}
        aria-label="Toggle menu"
      >
        {/* Animasi Garis menjadi X */}
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "transform rotate-45 translate-y-[3px]" : "" // Disesuaikan
          }`}
        ></span>
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "opacity-0" : ""
          }`}
        ></span>
        <span
          className={`block w-full h-[1.5px] bg-gray-300 transition-all duration-300 ease-in-out ${
            isOpen ? "transform -rotate-45 -translate-y-[3px]" : "" // Disesuaikan
          }`}
        ></span>
      </button>

      {/* --- Panel Menu (Lebar 75% dari Kiri) --- */}
      
      {/* 1. Latar Belakang Overlay (Klik untuk menutup) */}
      <div
        onClick={closeMenu}
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
        {/* Tombol Close 'X' di dalam menu */}
        <button
          onClick={closeMenu}
          className="absolute top-3 right-3 z-[60] w-8 h-8 p-1.5 flex justify-center items-center 
                     text-gray-400 hover:text-white transition-colors duration-200"
          aria-label="Close menu"
        >
          <CloseIcon className="w-full h-full" />
        </button>

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
