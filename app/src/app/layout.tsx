import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Who's Right?",
  description: "Settle an argument with a jury of real people. 18+.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-zinc-900">
        <Providers>
          <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
            <Link href="/" className="font-semibold">
              Who&apos;s Right?
            </Link>
            <span className="rounded border border-zinc-400 px-1.5 text-xs font-semibold" aria-label="Adults only">
              18+
            </span>
          </header>
          <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">{children}</main>
          <footer className="px-4 py-4 border-t border-zinc-200 text-sm text-zinc-600 flex gap-4">
            <span>18+ only</span>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
