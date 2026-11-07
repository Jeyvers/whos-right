import type { Metadata } from "next";
import { Bricolage_Grotesque, Nunito } from "next/font/google";
import Link from "next/link";
import { HeaderNav } from "@/components/HeaderNav";
import { Scales } from "@/components/Scales";
import { Providers } from "./providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Who's Right?",
  description: "Settle an argument with a jury of real people. 18+.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <header className="bg-court text-white">
            <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold">
                <Scales className="h-9 w-9 rounded-full bg-white p-0.5" />
                Who&apos;s Right?
              </Link>
              <div className="flex items-center gap-3">
                <HeaderNav />
                <span
                  className="rounded-full border-2 border-ink bg-side-a px-2.5 py-0.5 font-display text-sm font-extrabold text-white"
                  aria-label="Adults only, 18 and over"
                >
                  18+
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="bg-ink text-sm text-white/80">
            <div className="mx-auto flex max-w-2xl flex-wrap gap-x-5 gap-y-1 px-4 py-5">
              <span>For adults 18+ only</span>
              <Link href="/terms" className="underline-offset-4 hover:underline">Terms</Link>
              <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy</Link>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
