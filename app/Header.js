"use client";

import { useState } from "react";
import Link from "next/link";

// Ikon Profile SVG
const ProfileIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M18.685 19.027a.75.75 0 011.086.745c-.328 1.1-.96 2.03-1.843 2.768a16.828 16.828 0 01-5.467 1.152c-2.433 0-4.782-.445-6.892-1.272a.75.75 0 01.385-1.46c2.015.797 4.382 1.205 6.818 1.205 1.765 0 3.492-.262 5.093-.76a15.352 15.352 0 001.203-.432A.75.75 0 0118.685 19.027zM12 11.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zM12 9.75a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM12 12.75c3.55 0 6.786 1.114 9.172 2.903.684.512 1.054 1.34 1.054 2.247v1.5a.75.75 0 01-.75.75H1.5a.75.75 0 01-.75-.75v-1.5c0-.907.37-1.735 1.054-2.247C5.214 13.864 8.45 12.75 12 12.75z"
      clipRule="evenodd"
    />
  </svg>
);


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
      {/* Tombol Profile (Bulat, Putih, Lebih Kecil) */}
      <button
        onClick={toggleMenu}
        className={`fixed top-3 left-3 z-[60] w-9 h-9 p-2 flex justify-center items-center 
                   bg-white text-black rounded-full shadow-lg
                   transition-all duration-300 ease-in-out
                   ${isOpen ? "bg-white/80" : ""}`} 
        aria-label="Toggle menu"
      >
        <ProfileIcon className="w-full h-full" />
      </button>

      {/* Panel Menu (Animasi Slide-in + Glassmorphism) */}
      <div
        className={`fixed inset-0 z-50 p-8 flex flex-col items-center 
                    bg-black/80 backdrop-blur-lg 
                    transition-all duration-500 ease-in-out
                    ${isOpen ? "opacity-100 visible translate-x-0" : "opacity-0 invisible -translate-x-full"}`}
      >
        <div className="max-w-6xl w-full h-full flex flex-col items-center">
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
