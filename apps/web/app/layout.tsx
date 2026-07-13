import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NetworkSnapshot } from "@/components/NetworkSnapshot";

export const metadata: Metadata = {
  title: "Fiber Preflight — route confidence & failure diagnostics",
  description:
    "Payment route confidence scoring and human-readable failure diagnostics for Fiber Network on Nervos CKB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b" style={{ background: "var(--surface)" }}>
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />
              Fiber&nbsp;Preflight
            </Link>
            <nav className="flex items-center gap-4 text-sm" style={{ color: "var(--ink-2)" }}>
              <Link href="/" className="hover:underline" style={{ color: "var(--ink)" }}>
                Preflight
              </Link>
              <Link href="/decoder" className="hover:underline" style={{ color: "var(--ink)" }}>
                Error decoder
              </Link>
              <a
                href="https://github.com/BigDella/Fiber-Preflight"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                GitHub
              </a>
            </nav>
            <div className="ml-auto">
              <NetworkSnapshot />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs" style={{ color: "var(--ink-3)" }}>
          Confidence scores are heuristic: public gossip announces total channel capacity, not directional
          balance, so a high score improves odds — it is never a guarantee. Built for the Fiber Network
          Infrastructure Hackathon.
        </footer>
      </body>
    </html>
  );
}
