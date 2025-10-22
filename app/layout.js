"use client"; // Diperlukan untuk useState
import { useState } from "react"; // Diimpor untuk state menu
import "./globals.css";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Bloomboard",
  description: "Portfolio tracker & trading lab",
};

export default function RootLayout({ children }) {
  // State untuk mengelola menu hamburger
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <html lang="en">
      <body>
        {/* Header sticky */}
        <header className="bg-[#07102a] border-b border-gray-800 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            {/* Logo jadi link ke home */}
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.svg" alt="Bloomboard" width={120} height={30} />
            </Link>

            {/* Tombol Hamburger (Hanya Mobile) */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              aria-controls="mobile-menu"
              aria-expanded={isMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {/* Ikon X atau Hamburger */}
              {isMenuOpen ? (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              )}
            </button>

            {/* Navbar (Hanya Desktop) */}
            <nav className="hidden md:flex items-center gap-4 text-sm text-gray-300">
              <Link
                href="/dashboard"
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Dashboard
              </Link>
              <Link
                href="/lab"
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Lab
              </Link>
              <Link
                href="/trade"
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
                className="relative px-2 py-1 transition-colors hover:text-white 
                  after:content-[''] after:absolute after:left-0 after:bottom-0 
                  after:h-[2px] after:w-0 after:bg-white after:transition-all 
                  after:duration-300 hover:after:w-full"
              >
                Docs
              </a>
            </nav>
          </div>

          {/* Menu Dropdown (Hanya Mobile) */}
          {isMenuOpen && (
            <div className="md:hidden" id="mobile-menu">
              <nav className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col">
                <Link
                  href="/dashboard"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Dashboard
                </Link>
                <Link
                  href="/lab"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Lab
                </Link>
                <Link
                  href="/trade"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Trade
                </Link>
                <a
                  href="https://github.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Docs
                </a>
              </nav>
            </div>
          )}
        </header>

        <main>{children}</main>

        {/* Footer (Tidak berubah) */}
        <footer className="bg-[#07102a] border-t border-gray-800 mt-16">
          <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400">
            <div>
              <Image src="/logo.svg" alt="Bloomboard" width={120} height={30} />
              <p className="mt-3 text-xs leading-relaxed">
                Bloomboard is your all-in-one portfolio tracker.  
                Designed for investors who want clarity and control.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold">Product</h4>
              <ul className="mt-2 space-y-1">
                <li>
                  <Link href="/dashboard" className="hover:text-white">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/lab" className="hover:text-white">
                    AI Lab
                  </Link>
                </li>
                <li>
                  <Link href="/trade" className="hover:text-white">
                    Trading
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold">Company</h4>
              <ul className="mt-2 space-y-1">
                <li>
                  <Link href="/terms" className="hover:text-white">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 text-center py-4 text-xs text-gray-500">
            © 2025 Bloomboard. All rights reserved.
          </div>
        </footer>
      </body>
    </html>
  );
}
