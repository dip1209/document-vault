"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import WalletGuard from "@/components/WalletGuard";
import { messageFromError, unwrap } from "@/lib/api-client";
import {
  DOCUMENT_VAULT_ABI,
  documentIdForCid,
  metadataUriForCid,
  vaultAddressFor,
} from "@/lib/contract";
import { PDF_MIME_TYPE, validatePdfFile } from "@/lib/pdf";

type StepId = 1 | 2 | 3;
type StepStatus = "pending" | "active" | "done" | "failed";

type UploadPayload = {
  cid: string;
  size: number;
  gatewayUrl?: string;
  pinataFileId?: string;
};

type SavePayload = {
  document: { _id: string };
};

const STEPS: { id: StepId; title: string; detail: string }[] = [
  { id: 1, title: "Upload to IPFS", detail: "The PDF is pinned via Pinata / Kubo" },
  { id: 2, title: "Save metadata", detail: "Title, description, CID and owner go to MongoDB" },
  { id: 3, title: "Record ownership", detail: "registerDocument() on the DocumentVault contract" },
];

const INITIAL_STATUSES: Record<StepId, StepStatus> = {
  1: "pending",
  2: "pending",
  3: "pending",
};

function UploadContent() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const router = useRouter();

  const [documentTitle, setDocumentTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [statuses, setStatuses] = useState<Record<StepId, StepStatus>>(INITIAL_STATUSES);
  const [cid, setCid] = useState<string | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState<string | undefined>(undefined);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = statuses[1] === "active" || statuses[2] === "active" || statuses[3] === "active";
  const succeeded = statuses[1] === "done" && statuses[2] === "done" && statuses[3] === "done";
  const chainReady = Boolean(vaultAddressFor(chainId));

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileName(selected?.name ?? null);
    if (!documentTitle.trim() && selected) {
      setDocumentTitle(selected.name.replace(/\.pdf$/i, ""));
    }
  }

  function reset() {
    setStatuses(INITIAL_STATUSES);
    setCid(null);
    setGatewayUrl(undefined);
    setTxHash(null);
    setError(null);
  }

  /** Step 3 only: signs registerDocument with the connected wallet. */
  async function registerOnChain(registeredCid: string): Promise<Hex> {
    const vault = vaultAddressFor(chainId);
    if (!vault) {
      throw new Error("The DocumentVault contract is not deployed on the current network");
    }

    const hash = await writeContractAsync({
      address: vault,
      abi: DOCUMENT_VAULT_ABI,
      functionName: "registerDocument",
      args: [documentIdForCid(registeredCid), metadataUriForCid(registeredCid)],
      chainId,
    });

    const receipt = await publicClient?.waitForTransactionReceipt({ hash });
    if (!receipt) {
      throw new Error("No public client available to confirm the transaction");
    }
    if (receipt.status !== "success") {
      throw new Error("The registration transaction reverted");
    }

    return hash;
  }

  /** Runs steps 1 -> 2 -> 3, stopping at the first failure. */
  async function runFullFlow(): Promise<void> {
    setError(null);
    setTxHash(null);
    setCid(null);
    setGatewayUrl(undefined);
    setStatuses({ 1: "active", 2: "pending", 3: "pending" });

    if (!documentTitle.trim() || !description.trim()) {
      setStatuses({ ...INITIAL_STATUSES, 1: "failed" });
      setError("Document Title and Description are required");
      return;
    }
    if (!file) {
      setStatuses({ ...INITIAL_STATUSES, 1: "failed" });
      setError("Select a PDF file to upload");
      return;
    }

    // Mirrors the server-side rules so bad files fail before any network call.
    try {
      await validatePdfFile(file);
    } catch (validationError) {
      setStatuses({ ...INITIAL_STATUSES, 1: "failed" });
      setError(messageFromError(validationError));
      return;
    }

    let upload: UploadPayload;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/ipfs/upload", { method: "POST", body: form });
      upload = await unwrap<UploadPayload>(response);
      if (!upload.cid) throw new Error("Upload did not return a CID");
    } catch (uploadError) {
      setStatuses({ ...INITIAL_STATUSES, 1: "failed" });
      setError(messageFromError(uploadError));
      return;
    }

    setCid(upload.cid);
    setGatewayUrl(upload.gatewayUrl);
    setStatuses({ 1: "done", 2: "active", 3: "pending" });

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          documentTitle: documentTitle.trim(),
          description: description.trim(),
          cid: upload.cid,
          ownerWalletAddress: address,
          fileSize: upload.size,
          ...(upload.pinataFileId ? { pinataFileId: upload.pinataFileId } : {}),
        }),
      });
      await unwrap<SavePayload>(response);
    } catch (saveError) {
      setStatuses({ 1: "done", 2: "failed", 3: "pending" });
      setError(
        `${messageFromError(saveError)} — the file is already on IPFS (CID ${upload.cid}); ` +
          "retrying will not re-upload it.",
      );
      return;
    }

    setStatuses({ 1: "done", 2: "done", 3: "active" });

    try {
      const hash = await registerOnChain(upload.cid);
      setTxHash(hash);
      setStatuses({ 1: "done", 2: "done", 3: "done" });
    } catch (chainError) {
      setStatuses({ 1: "done", 2: "done", 3: "failed" });
      setError(messageFromError(chainError));
    }
  }

  /** Re-runs only step 3 after a failed or rejected transaction. */
  async function retryChainRegistration(): Promise<void> {
    if (!cid) return;
    setError(null);
    setStatuses((current) => ({ ...current, 3: "active" }));

    try {
      const hash = await registerOnChain(cid);
      setTxHash(hash);
      setStatuses({ 1: "done", 2: "done", 3: "done" });
    } catch (chainError) {
      setStatuses({ 1: "done", 2: "done", 3: "failed" });
      setError(messageFromError(chainError));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runFullFlow();
  }

  function startOver() {
    reset();
    setFile(null);
    setFileName(null);
    setDocumentTitle("");
    setDescription("");
  }

  const explorerUrl =
    txHash && chainId === 11155111 ? `https://sepolia.etherscan.io/tx/${txHash}` : undefined;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Upload Document
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            PDF only. The file goes to IPFS, its metadata to MongoDB, and ownership to the
            DocumentVault contract — in that order.
          </p>
        </header>

        <ol className="mt-8 flex flex-col gap-3">
          {STEPS.map((step) => {
            const status = statuses[step.id];
            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  status === "failed"
                    ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                    : status === "done"
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                      : status === "active"
                        ? "border-zinc-400 bg-white dark:border-zinc-600 dark:bg-zinc-950"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    status === "done"
                      ? "bg-emerald-600 text-white"
                      : status === "failed"
                        ? "bg-red-600 text-white"
                        : status === "active"
                          ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                          : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  aria-hidden
                >
                  {status === "done" ? (
                    "✓"
                  ) : status === "failed" ? (
                    "✕"
                  ) : status === "active" ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    step.id
                  )}
                </span>
                <span>
                  <span className="block text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">
                    {step.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {error ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-200 bg-white p-4 dark:border-red-900 dark:bg-zinc-950"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {statuses[3] === "failed" && cid ? (
                <button
                  type="button"
                  onClick={() => void retryChainRegistration()}
                  disabled={busy}
                  className="h-9 rounded-full bg-zinc-950 px-4 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
                >
                  Retry blockchain registration
                </button>
              ) : null}
              {!chainReady ? (
                <p className="text-xs leading-9 text-zinc-600 dark:text-zinc-400">
                  Wrong network? Switch to a supported chain from the navigation bar.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {succeeded && cid ? (
          <section className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/40">
            <h2 className="text-base font-semibold text-emerald-800 dark:text-emerald-400">
              Document registered
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-700 dark:text-zinc-300">CID:</dt>
                <dd className="break-all font-mono text-zinc-950 dark:text-zinc-50">{cid}</dd>
              </div>
              {gatewayUrl ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-zinc-700 dark:text-zinc-300">Gateway:</dt>
                  <dd>
                    <a
                      href={gatewayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all underline text-zinc-950 dark:text-zinc-50"
                    >
                      {gatewayUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              {txHash ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-zinc-700 dark:text-zinc-300">Transaction:</dt>
                  <dd className="break-all font-mono text-zinc-950 dark:text-zinc-50">
                    {explorerUrl ? (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        {txHash}
                      </a>
                    ) : (
                      txHash
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
              >
                View Dashboard
              </Link>
              <button
                type="button"
                onClick={startOver}
                className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
              >
                Upload another
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Document Title
              <input
                type="text"
                value={documentTitle}
                onChange={(event) => setDocumentTitle(event.target.value)}
                maxLength={200}
                required
                disabled={busy}
                placeholder="Quarterly Report 2026 Q1"
                className="h-11 rounded-xl border border-zinc-300 bg-white px-3 font-normal text-zinc-950 outline-none transition-colors focus:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                required
                disabled={busy}
                rows={4}
                placeholder="What is this document and why was it uploaded?"
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 font-normal text-zinc-950 outline-none transition-colors focus:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              PDF file
              <input
                type="file"
                accept={`${PDF_MIME_TYPE},.pdf`}
                onChange={handleFileChange}
                required
                disabled={busy}
                className="file:mr-4 file:rounded-full file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:file:bg-zinc-50 dark:file:text-zinc-950 dark:hover:file:bg-zinc-300 flex h-11 items-center rounded-xl border border-zinc-300 bg-white px-3 font-normal text-zinc-600 file:cursor-pointer dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
              />
              {fileName ? (
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  Selected: {fileName}
                </span>
              ) : null}
            </div>

            <label className="flex flex-col gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Owner wallet address
              <input
                type="text"
                readOnly
                value={address ?? ""}
                className="h-11 rounded-xl border border-zinc-200 bg-zinc-100 px-3 font-mono text-xs font-normal text-zinc-500 outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="h-11 rounded-full bg-zinc-950 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
            >
              {busy ? "Working…" : "Upload Document"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="h-10 text-sm font-medium text-zinc-600 underline transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Back to Dashboard
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default function UploadPage() {
  return (
    <WalletGuard requireVault>
      <UploadContent />
    </WalletGuard>
  );
}
