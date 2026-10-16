"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";

import { SUPPORTED_VAULT_CHAINS, vaultAddressFor } from "@/lib/contract";

type WalletGuardProps = {
  children: ReactNode;
  /** Additionally require the connected chain to have a configured DocumentVault address. */
  requireVault?: boolean;
};

const emptySubscribe = () => () => {};

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}

function WalletGlyph() {
  return (
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        className="h-7 w-7"
        aria-hidden
      >
        <path
          d="M3 7.5A2.5 2.5 0 015.5 5H18a2 2 0 012 2v1H6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="3" y="7.5" width="18" height="11.5" rx="2.5" />
        <path d="M16.5 13.5h1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const GATE_POINTS = ["Upload and pin PDFs to IPFS", "Register ownership on-chain", "Share access by wallet"];

function Skeleton() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="h-48 w-full max-w-md animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
    </div>
  );
}

/**
 * Wallet gate for protected pages. The app has no server-side sessions, so
 * "protected" means: no wallet -> inline connect prompt; wallet on an
 * unsupported chain -> switch-network prompt.
 */
export default function WalletGuard({ children, requireVault = false }: WalletGuardProps) {
  const { isConnected, status, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  // false during SSR/hydration, true on the client afterwards, without a
  // setState-in-effect. Wallet state is read only after hydration to avoid a
  // server/client mismatch.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted || status === "reconnecting") return <Skeleton />;

  if (!isConnected) {
    return (
      <Card>
        <WalletGlyph />
        <h1 className="mt-5 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Connect your wallet to continue
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This page is only available to connected wallets. Your address owns every document you
          register.
        </p>
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="mt-6 h-10 w-full rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          Connect Wallet
        </button>
        <ul className="mt-6 flex flex-col gap-2 text-left">
          {GATE_POINTS.map((point) => (
            <li key={point} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400" aria-hidden>
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
          New here?{" "}
          <Link href="/" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Learn how it works
          </Link>
        </p>
      </Card>
    );
  }

  if (requireVault && !vaultAddressFor(chainId)) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Network not supported
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The DocumentVault contract is not deployed on the network you are connected to. Switch
          to one of the supported networks:
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {SUPPORTED_VAULT_CHAINS.map((chain) => (
            <button
              key={chain.id}
              type="button"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: chain.id })}
              className="h-10 rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
            >
              Switch to {chain.name}
            </button>
          ))}
        </div>
        {switchError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{switchError.message}</p>
        ) : null}
      </Card>
    );
  }

  return <>{children}</>;
}
