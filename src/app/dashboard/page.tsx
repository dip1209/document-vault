"use client";

import Link from "next/link";
import { useAccount } from "wagmi";

import WalletGuard from "@/components/WalletGuard";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const METRICS = [
  {
    key: "totalDocuments",
    label: "Total Documents",
    description: "Documents you own, registered under your address.",
  },
  {
    key: "sharedDocuments",
    label: "Shared Documents",
    description: "Your documents that have at least one grantee.",
  },
  {
    key: "sharedWithMe",
    label: "Shared With Me",
    description: "Documents other wallets have granted you access to.",
  },
] as const;

function MetricCard({
  label,
  description,
  value,
}: {
  label: string;
  description: string;
  value: number | undefined;
}) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {value === undefined ? "—" : value}
      </p>
      <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
    </article>
  );
}

function DashboardContent() {
  const { address } = useAccount();
  const { data, isPending, isError, error, refetch, isFetching } = useDashboardMetrics();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              On-chain activity for{" "}
              <code className="font-mono text-xs sm:text-sm">{address}</code>
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
          >
            Upload Document
          </Link>
        </header>

        {isPending ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-3" aria-busy>
            {METRICS.map((metric) => (
              <div
                key={metric.key}
                className="h-40 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-10 rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
              Could not load metrics
            </h2>
            <p className="mt-2 break-words text-sm text-zinc-600 dark:text-zinc-400">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
            >
              {isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {METRICS.map((metric) => (
              <MetricCard
                key={metric.key}
                label={metric.label}
                description={metric.description}
                value={data?.[metric.key]}
              />
            ))}
          </div>
        )}

        {!isPending && !isError && data?.totalDocuments === 0 ? (
          <p className="mt-10 text-sm text-zinc-600 dark:text-zinc-400">
            No documents yet —{" "}
            <Link href="/upload" className="font-medium text-zinc-950 underline dark:text-zinc-50">
              upload your first PDF
            </Link>
            .
          </p>
        ) : null}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <WalletGuard requireVault>
      <DashboardContent />
    </WalletGuard>
  );
}
