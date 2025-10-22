"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

// Komponen Ikon (ditempatkan di file yang sama untuk kemudahan)
const GithubIcon = (props) => (
  <svg
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm.792 17.208c.112.02.16.14.16.28v.01c0 .14-.048.26-.16.28-1.15.2-2.356.3-3.59.3-1.234 0-2.44-.1-3.59-.3-.112-.02-.16-.14-.16-.28v-.01c0-.14.048-.26.16-.28 1.113-.193 2.28-.293 3.5-.293 1.22 0 2.387.1 3.5.293zM12 5.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125S10.875 9 10.875 8.375v-1.5c0-.621.504-1.125 1.125-1.125zM12 3.75c-2.43 0-4.432 1.825-4.783 4.156-.23.14-.448.315-.644.522-.56.58-.923 1.37-.923 2.272 0 .09.008.178.02.265-.11.02-.218.04-.326.06-.324.06-.658.09-1.004.09-.64 0-1.255-.09-1.83-.258-.1-.03-.17-.13-.17-.24v-.02c0-.11.07-.21.17-.24 1.13-.3 2.36-.45 3.68-.45 1.32 0 2.55.15 3.68.45.1.03.17.13.17.24v.02c0 .11-.07.21-.17.24-.575.168-1.19.258-1.83.258-.346 0-.68-.03-1.004-.09-.108-.02-.216-.04-.326-.06.012-.087.02-.175.02-.265 0-.902-.363-1.692-.924-2.272-.195-.207-.413-.382-.643-.522C7.568 5.575 9.57 3.75 12 3.75zM16.5 6c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125S15.375 9 15.375 8.375v-1.5c0-.621.504-1.125 1.125-1.125z"
      clipRule="evenodd"
    />
  </svg>
);

const InstagramIcon = (props) => (
  <svg
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M12.315 2.468c.273.006.547.01.82.016 2.408.06 4.35.204 5.943.83 1.7.64 2.983 1.92 3.62 3.616.628 1.59.773 3.53.83 5.94.007.274.012.547.016.82s-.009.547-.016.82c-.058 2.41-.203 4.35-.83 5.943-.637 1.695-1.92 2.978-3.617 3.618-1.59.626-3.53.77-5.94.828-.273.006-.547.01-.82.016s-.547-.004-.82-.016c-2.408-.058-4.35-.203-5.943-.83-1.696-.64-2.978-1.92-3.618-3.617-.626-1.59-.77-3.53-.828-5.94-.006-.273-.01-.547-.016-.82s.004-.547.016-.82c.058-2.41.203-4.35.83-5.943.64-1.696 1.92-2.978 3.617-3.618 1.59-.626 3.53-.77 5.94-.828.273-.006.547-.01.82-.016zM12 6.82a5.18 5.18 0 100 10.36 5.18 5.18 0 000-10.36zM12 15a3 3 0 110-6 3 3 0 010 6zm4.804-6.84a1.14 1.14 0 100-2.28 1.14 1.14 0 000 2.28z"
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
      {/* Tombol Hamburger (Floating Sticky Kiri + Animasi) */}
      <button
        onClick={toggleMenu}
        className="fixed top-4 left-4 z-[60] w-12 h-12 p-3 space-y-[6px] flex flex-col justify-center items-center 
                   bg-black/30 backdrop-blur-sm border border-white/20 rounded-lg text-white
                   transition-all duration-300"
        aria-label="Toggle menu"
      >
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "transform rotate-45 translate-y-[4px]" : ""
          }`}
        ></span>
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "opacity-0" : ""
          }`}
        ></span>
        <span
          className={`block w-full h-0.5 bg-white transition-all duration-300 ease-in-out ${
            isOpen ? "transform -rotate-45 -translate-y-[10px]" : ""
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
          {/* Konten Atas & Tengah (Logo & Nav) */}
          <div className="flex-grow flex flex-col items-center justify-center text-center">
            {/* Logo */}
            <div className="mb-16">
              <Link href="/" onClick={closeMenu}>
                <Image
                  src="/logo.svg"
                  alt="Bloomboard"
                  width={160}
                  height={40}
                />
              </Link>
            </div>

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

          {/* Ikon Sosial (Bawah) */}
          <div className="flex items-center gap-8 mb-4">
            <a
              href="https://github.com/" // Ganti dengan link Github Anda
              target="_blank"
              rel="noreferrer"
              className="text-white hover:opacity-70 transition-opacity"
              aria-label="GitHub"
            >
              <GithubIcon className="w-7 h-7" />
            </a>
            <a
              href="https://instagram.com/" // Ganti dengan link Instagram Anda
              target="_blank"
              rel="noreferrer"
              className="text-white hover:opacity-70 transition-opacity"
              aria-label="Instagram"
            >
              <InstagramIcon className="w-7 h-7" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
