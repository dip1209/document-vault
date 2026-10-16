"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";

import SharingSection from "@/components/SharingSection";
import WalletGuard from "@/components/WalletGuard";
import { messageFromError } from "@/lib/api-client";
import { documentIdForCid } from "@/lib/contract";
import { ipfsGatewayUrl } from "@/lib/ipfs";
import { useDeleteDocument, useMyDocuments, type OwnedDocument } from "@/hooks/useMyDocuments";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function DocumentCard({ document: doc }: { document: OwnedDocument }) {
  const deleteDocument = useDeleteDocument();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    void deleteDocument
      .mutateAsync(doc.cid)
      .then(() => setConfirmingDelete(false))
      .catch(() => {
        // The error stays on the mutation for display below.
      });
  }

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {doc.documentTitle}
        </h2>
        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
          {formatDate(doc.uploadDate)}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{doc.description}</p>

      <dl className="mt-4 flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">CID:</dt>
          <dd className="break-all font-mono text-xs text-zinc-950 dark:text-zinc-50">{doc.cid}</dd>
        </div>
        {doc.fileSize ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">Size:</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">{formatFileSize(doc.fileSize)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={ipfsGatewayUrl(doc.cid)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-950 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          Open on IPFS
        </a>
        <button
          type="button"
          disabled={deleteDocument.isPending}
          onClick={handleDelete}
          onBlur={() => setConfirmingDelete(false)}
          className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-medium transition-colors disabled:opacity-50 ${
            confirmingDelete
              ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
              : "border-zinc-300 text-zinc-700 hover:border-red-500 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:text-red-400"
          }`}
        >
          {deleteDocument.isPending
            ? "Deleting…"
            : confirmingDelete
              ? "Click again to confirm"
              : "Delete metadata"}
        </button>
      </div>

      {deleteDocument.isError ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {messageFromError(deleteDocument.error)}
        </p>
      ) : null}

      <SharingSection documentId={documentIdForCid(doc.cid)} ownerAddress={doc.ownerWalletAddress} />
    </article>
  );
}

function MyDocumentsContent() {
  const { address } = useAccount();
  const { data, isPending, isError, error, refetch, isFetching } = useMyDocuments();
  const documents = data?.documents;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              My Documents
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Uploaded by <code className="font-mono text-xs sm:text-sm">{address}</code>
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
          <div className="mt-10 flex flex-col gap-6" aria-busy>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-10 rounded-2xl border border-red-200 bg-white p-6 dark:border-red-900 dark:bg-zinc-950">
            <h2 className="text-base font-semibold text-red-700 dark:text-red-400">
              Could not load your documents
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
        ) : documents && documents.length > 0 ? (
          <div className="mt-10 flex flex-col gap-6">
            {documents.map((doc) => (
              <DocumentCard key={doc._id} document={doc} />
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You have not uploaded any documents yet —{" "}
              <Link href="/upload" className="font-medium text-zinc-950 underline dark:text-zinc-50">
                upload your first PDF
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MyDocumentsPage() {
  return (
    <WalletGuard requireVault>
      <MyDocumentsContent />
    </WalletGuard>
  );
}
