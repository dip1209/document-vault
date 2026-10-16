import type { ReactNode } from "react";

import ConnectWalletButton from "@/components/ConnectWalletButton";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" strokeLinejoin="round" />
      <path d="M9.5 12l1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden>
      <circle cx="8.5" cy="12" r="3.5" />
      <path d="M12 12h9m-3 0v3m-3-3v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden>
      <path d="M3 7.5A2.5 2.5 0 015.5 5H18a2 2 0 012 2v1H6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="7.5" width="18" height="11.5" rx="2.5" />
      <path d="M16.5 13.5h1.5" strokeLinecap="round" />
    </svg>
  );
}

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <WalletIcon />,
    title: "Bring your own wallet",
    body: "Connect in one click. Your address becomes the owner of every document you register — no signup, no custodial account.",
  },
  {
    icon: <CubeIcon />,
    title: "PDFs live on IPFS",
    body: "Files are pinned through Pinata or a local Kubo node. Only the content identifier (CID) is ever stored.",
  },
  {
    icon: <ShieldIcon />,
    title: "Ownership on-chain",
    body: "Each document is registered to the DocumentVault contract, so ownership and sharing stay verifiable.",
  },
  {
    icon: <KeyIcon />,
    title: "Share by wallet",
    body: "Grant or revoke access to specific wallet addresses at any time, straight from the contract.",
  },
];

const STEPS: { step: string; title: string; body: string }[] = [
  {
    step: "01",
    title: "Connect",
    body: "Link any EVM wallet supported by RainbowKit. Nothing is uploaded yet.",
  },
  {
    step: "02",
    title: "Upload",
    body: "Pick a PDF and add a title and description. The file is pinned to IPFS.",
  },
  {
    step: "03",
    title: "Register",
    body: "One signature records the CID and metadata as yours on-chain.",
  },
];

const TRUST: { label: string; value: string }[] = [
  { label: "Storage", value: "IPFS via Pinata / Kubo" },
  { label: "Metadata", value: "Title, CID, owner, date" },
  { label: "Ownership", value: "DocumentVault contract" },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 0%, rgba(16,185,129,0.14), transparent 70%)",
        }}
      />

      <main className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="pt-20 pb-16 sm:pt-28 sm:pb-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Decentralized document storage
          </span>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl dark:text-zinc-50">
            Store documents where only the{" "}
            <span className="text-emerald-600 dark:text-emerald-400">CID</span> matters.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Document Vault pins your PDFs to IPFS and records their metadata against your wallet
            address. The file stays decentralized; the record stays verifiable.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ConnectWalletButton label="Connect Wallet" className="w-full sm:w-auto" />
            <a
              href="#how"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 sm:w-auto dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
            >
              See how it works
            </a>
          </div>

          <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-500">
            No account required · Non-custodial · Metadata on-chain ready
          </p>
        </section>

        {/* Trust strip */}
        <section className="grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
          {TRUST.map((item) => (
            <div key={item.label} className="bg-white p-6 dark:bg-zinc-950">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                {item.label}
              </p>
              <p className="mt-2 text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {item.value}
              </p>
            </div>
          ))}
        </section>

        {/* Features */}
        <section className="pt-20 sm:pt-24">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
              Everything you need to own your documents
            </h2>
            <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
              A verifiable workflow that keeps files off centralized servers and ownership with you.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-2xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                  {feature.icon}
                </span>
                <h3 className="mt-4 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 pt-20 sm:pt-24">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
              Three steps to a vaulted document
            </h2>
            <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
              The file goes to IPFS, the metadata to the database, and ownership to the contract —
              in that order.
            </p>
          </div>

          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((item) => (
              <li
                key={item.step}
                className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {item.step}
                </span>
                <h3 className="mt-3 text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {item.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="pb-20 pt-20 sm:pb-24 sm:pt-24">
          <div className="rounded-3xl border border-zinc-200 bg-white p-10 text-center sm:p-14 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
              Ready to vault your first document?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
              Connect a wallet to upload, register, and share PDFs — all from your address.
            </p>
            <div className="mt-8 flex justify-center">
              <ConnectWalletButton label="Connect Wallet" />
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-zinc-500">
          <p>Document Vault — decentralized PDF storage with on-chain ownership.</p>
          <p className="font-mono text-xs">IPFS · MongoDB · DocumentVault</p>
        </div>
      </footer>
    </div>
  );
}
