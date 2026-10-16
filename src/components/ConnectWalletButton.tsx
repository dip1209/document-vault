"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

type ConnectWalletButtonProps = {
  label?: string;
  /** Label shown once a wallet is connected, linking to the dashboard. */
  connectedLabel?: string;
  className?: string;
};

const emptySubscribe = () => () => {};

const BASE =
  "inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors " +
  "bg-zinc-950 text-white hover:bg-zinc-700 " +
  "dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300";

/**
 * Primary call-to-action shown before a wallet is connected. Opens the
 * RainbowKit modal, or links to the dashboard once connected. Wallet state is
 * read only after hydration to keep the first client render matching the server.
 */
export default function ConnectWalletButton({
  label = "Connect Wallet",
  connectedLabel = "Open Dashboard",
  className,
}: ConnectWalletButtonProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (mounted && isConnected) {
    return (
      <Link href="/dashboard" className={`${BASE} ${className ?? ""}`}>
        {connectedLabel}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => openConnectModal?.()} className={`${BASE} ${className ?? ""}`}>
      {label}
    </button>
  );
}
