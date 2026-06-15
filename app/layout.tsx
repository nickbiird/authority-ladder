import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Authority Ladder — where should AI act?',
  description:
    'Drop a backlog of candidate AI use cases; get a defended, priced, prioritized transformation roadmap. AI-or-not, an autonomy tier, a defended architecture, a risk tier, and a price per use case — adversarially reviewed and human-approved before it commits.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-baseline justify-between px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Authority&nbsp;Ladder
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600">
              <Link href="/evals" className="hover:text-stone-900">Evals</Link>
              <Link href="/methodology" className="hover:text-stone-900">Methodology</Link>
              <a href="https://github.com/nickbiird/authority-ladder" className="hover:text-stone-900">GitHub</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-stone-500">
          <p>
            Triage, not a transformation mandate. Runs on a synthetic, clean-room pattern corpus. Built by{' '}
            <a className="underline" href="https://github.com/nickbiird">Nicholas Bird</a>. Sibling repo:{' '}
            <a className="underline" href="https://github.com/nickbiird/ai-act-triage">ai-act-triage</a> (the deep EU-AI-Act version of the risk-tier box).
          </p>
        </footer>
      </body>
    </html>
  );
}
