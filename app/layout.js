import "./globals.css";
import Image from "next/image";
import Link from "next/link";
export const metadata = { title: "Bloomboard", description: "Premium portfolio tracker & trading lab" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="bg-[#07102a] border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src="/logo.svg" alt="Bloomboard" width={120} height={30} />
            </div>
            <nav className="flex items-center gap-4 text-sm text-gray-300">
              <Link href="/">Home</Link>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/lab">Lab</Link>
              <Link href="/trade">Trade</Link>
              <a href="https://github.com/" target="_blank" rel="noreferrer">Docs</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="bg-[#07102a] border-t border-gray-800 mt-16">
          <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-400">
            <div>
              <Image src="/logo.svg" alt="Bloomboard" width={120} height={30} />
              <p className="mt-3 text-xs">Premium portfolio tracker — TradingView, Supabase, OpenAI integrated.</p>
            </div>
            <div>
              <h4 className="text-white font-semibold">Product</h4>
              <ul className="mt-2 space-y-1">
                <li>Dashboard</li>
                <li>AI Lab</li>
                <li>Trading</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold">Company</h4>
              <ul className="mt-2 space-y-1">
                <li>Terms</li>
                <li>Privacy</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 text-center py-4 text-xs text-gray-500">© 2025 Bloomboard</div>
        </footer>
      </body>
    </html>
  );
}
