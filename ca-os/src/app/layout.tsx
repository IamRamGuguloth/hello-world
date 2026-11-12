import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "CA OS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="font-sans antialiased">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
          <nav className="mb-10 flex gap-6 text-sm text-muted print:hidden">
            <Link href="/" className="hover:text-ink">Dashboard</Link>
            <Link href="/documents?side=sales" className="hover:text-ink">Sales</Link>
            <Link href="/documents?side=purchases" className="hover:text-ink">Purchases</Link>
          </nav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
