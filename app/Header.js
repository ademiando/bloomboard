"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Tombol Hamburger (Floating Sticky) */}
      <button
        onClick={toggleMenu}
        className="fixed top-4 right-4 z-[60] p-2 bg-[#07102a] border border-gray-700 rounded-lg text-white"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          // Ikon Close (X)
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          // Ikon Hamburger
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16m-7 6h7"
            />
          </svg>
        )}
      </button>

      {/* Panel Menu (Overlay) */}
      {/* Muncul hanya jika isOpen true */}
      {isOpen && (
        <div className="fixed inset-0 bg-[#07102a] z-50 p-8 flex flex-col items-center pt-20">
          <div className="max-w-6xl w-full flex flex-col items-center">
            {/* Logo (dari header asli) */}
            <div className="mb-12">
              <Link href="/" onClick={closeMenu}>
                <Image
                  src="/logo.svg"
                  alt="Bloomboard"
                  width={140}
                  height={35}
                />
              </Link>
            </div>

            {/* Navbar (dari header asli) */}
            <nav className="flex flex-col items-center gap-6 text-lg text-gray-300">
              <Link
                href="/dashboard"
                onClick={closeMenu}
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Dashboard
              </Link>
              <Link
                href="/lab"
                onClick={closeMenu}
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Lab
              </Link>
              <Link
                href="/trade"
                onClick={closeMenu}
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Trade
              </Link>
              <a
                href="https://github.com/"
                target="_blank"
                rel="noreferrer"
                onClick={closeMenu}
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Docs
              </a>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
