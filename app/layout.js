import "./globals.css";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Bloomboard",
  description: "Portfolio tracker & trading lab",
};

export default function RootLayout({ children }) {
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

            {/* Navbar */}
            <nav className="flex items-center gap-4 text-sm text-gray-300">
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
        </header>

        <main>{children}</main>

        {/* Footer */}
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