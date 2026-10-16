"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAccount, useDisconnect } from "wagmi";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const emptySubscribe = () => () => {};

/**
 * App navigation with wallet controls: connect via RainbowKit's modal,
 * display the active address, and disconnect through wagmi.
 */
export default function NavBar() {
  const { isConnected } = useAccount();
  const { disconnect, isPending } = useDisconnect();
  // false during SSR/hydration, true on the client afterwards. Wallet state is
  // read only after hydration so the first client render matches the server.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
        >
          Document Vault
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {mounted && isConnected ? (
            <div className="flex items-center gap-0.5">
              <Link
                href="/dashboard"
                className="rounded-full px-2.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                Dashboard
              </Link>
              <Link
                href="/upload"
                className="rounded-full px-2.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                Upload
              </Link>
              <span className="hidden items-center gap-0.5 md:flex">
                <Link
                  href="/my-documents"
                  className="rounded-full px-2.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  My Documents
                </Link>
                <Link
                  href="/shared-with-me"
                  className="rounded-full px-2.5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
                >
                  Shared With Me
                </Link>
              </span>
            </div>
          ) : null}
          <ConnectButton.Custom>
            {({ account, openConnectModal, mounted }) => {
              // RainbowKit reads wallet state after hydration; render a
              // placeholder until then to avoid a server/client mismatch.
              if (!mounted) {
                return (
                  <div
                    className="h-10 w-44 rounded-full bg-zinc-100 dark:bg-zinc-900"
                    aria-hidden
                  />
                );
              }

              if (!account) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="h-10 rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
                  >
                    Connect Wallet
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-500"
                      title="Connected"
                      aria-hidden
                    />
                    <code className="font-mono text-xs text-zinc-700 sm:text-sm dark:text-zinc-300">
                      {shortAddress(account.address)}
                    </code>
                  </span>
                  <button
                    type="button"
                    onClick={() => disconnect()}
                    disabled={isPending}
                    className="h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
                  >
                    {isPending ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </nav>
    </header>
  );
}
