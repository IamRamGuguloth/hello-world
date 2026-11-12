import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CA OS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="font-sans antialiased">
        <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">{children}</main>
      </body>
    </html>
  );
}
