"use client";

import Link from "next/link";
import { useAccount } from "wagmi";

import WalletGuard from "@/components/WalletGuard";
import { messageFromError } from "@/lib/api-client";
import { ipfsGatewayUrl } from "@/lib/ipfs";
import { useSharedDocuments, type SharedDocument } from "@/hooks/useSharedDocuments";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatUnixSeconds(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function SharedDocumentCard({ document: doc }: { document: SharedDocument }) {
  const title = doc.metadata?.documentTitle ?? "Metadata removed by the owner";

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{title}</h2>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {doc.metadata
            ? formatDate(doc.metadata.uploadDate)
            : `Registered ${formatUnixSeconds(doc.registeredAt)}`}
        </span>
      </div>

      {doc.metadata ? (
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {doc.metadata.description}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          The owner deleted the metadata, but your on-chain access to this document is still
          valid. Open it on IPFS using the CID below.
        </p>
      )}

      <dl className="mt-4 flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">CID:</dt>
          <dd className="break-all font-mono text-xs text-zinc-950 dark:text-zinc-50">{doc.cid}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">Owner:</dt>
          <dd className="font-mono text-xs text-zinc-950 dark:text-zinc-50">{doc.owner}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={ipfsGatewayUrl(doc.cid)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          Open on IPFS
        </a>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 text-[11px] font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          Access verified on-chain
        </span>
      </div>
    </article>
  );
}

function SharedWithMeContent() {
  const { address } = useAccount();
  const { data, isPending, isError, error, refetch, isFetching } = useSharedDocuments();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Shared With Me
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Documents other wallets granted to{" "}
            <code className="font-mono text-xs sm:text-sm">{shortAddress(address ?? "")}</code>,
            verified against the DocumentVault contract.
          </p>
        </header>

        {isPending ? (
          <div className="mt-10 flex flex-col gap-6" aria-busy>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-10 rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
              Could not verify shared documents
            </h2>
            <p className="mt-2 break-words text-sm text-zinc-600 dark:text-zinc-400">
              {messageFromError(error)}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-4 h-10 rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
            >
              {isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : data && data.length > 0 ? (
          <div className="mt-10 flex flex-col gap-6">
            {data.map((doc) => (
              <SharedDocumentCard key={doc.documentId} document={doc} />
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No documents have been shared with this wallet yet. When another owner grants you
              access, it will appear here —{" "}
              <Link href="/dashboard" className="font-medium text-zinc-950 underline dark:text-zinc-50">
                back to dashboard
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SharedWithMePage() {
  return (
    <WalletGuard requireVault>
      <SharedWithMeContent />
    </WalletGuard>
  );
}
