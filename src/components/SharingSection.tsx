"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { messageFromError } from "@/lib/api-client";
import { DOCUMENT_VAULT_ABI, vaultAddressFor } from "@/lib/contract";

type SharingSectionProps = {
  documentId: Hex;
  /** Wallet that owns the document on-chain; it cannot grant access to itself. */
  ownerAddress: string;
};

/**
 * Per-document access control: lists current grantees from the contract and
 * lets the owner grant or revoke access with on-chain transactions.
 */
export default function SharingSection({ documentId, ownerAddress }: SharingSectionProps) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [recipient, setRecipient] = useState("");
  const [pending, setPending] = useState<"grant" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const vault = vaultAddressFor(chainId);
  const granteesQuery = useQuery<Address[]>({
    queryKey: ["grantees", documentId, chainId],
    enabled: Boolean(vault),
    queryFn: async () => {
      if (!publicClient || !vault) {
        throw new Error("Wallet or contract address unavailable");
      }
      const list = await publicClient.readContract({
        address: vault,
        abi: DOCUMENT_VAULT_ABI,
        functionName: "granteesOf",
        args: [documentId],
      });
      return [...list];
    },
  });

  const grantees = granteesQuery.data ?? [];
  const trimmedRecipient = recipient.trim();
  const recipientIsValid = isAddress(trimmedRecipient);
  const normalizedRecipient = recipientIsValid ? getAddress(trimmedRecipient) : undefined;
  const recipientAlreadyGranted = normalizedRecipient
    ? grantees.some((grantee) => grantee.toLowerCase() === normalizedRecipient.toLowerCase())
    : false;
  const recipientIsOwner = normalizedRecipient
    ? normalizedRecipient.toLowerCase() === ownerAddress.toLowerCase()
    : false;

  const busy = pending !== null;
  const canGrant =
    recipientIsValid && !recipientAlreadyGranted && !recipientIsOwner && !busy && Boolean(vault);

  async function sendTx(functionName: "grantAccess" | "revokeAccess", grantee: Address) {
    const activeVault = vaultAddressFor(chainId);
    if (!activeVault) {
      throw new Error("The DocumentVault contract is not deployed on the current network");
    }
    if (!publicClient) {
      throw new Error("No public client available to confirm the transaction");
    }

    const hash = await writeContractAsync({
      address: activeVault,
      abi: DOCUMENT_VAULT_ABI,
      functionName,
      args: [documentId, grantee],
      chainId,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(
        functionName === "grantAccess"
          ? "The grant transaction reverted"
          : "The revoke transaction reverted",
      );
    }

    await queryClient.invalidateQueries({ queryKey: ["grantees", documentId, chainId] });
  }

  async function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!recipientIsValid) {
      setError("Enter a valid wallet address (0x followed by 40 hex characters)");
      return;
    }
    if (recipientIsOwner) {
      setError("That wallet already owns this document");
      return;
    }
    if (recipientAlreadyGranted) {
      setError("That wallet already has access");
      return;
    }

    setPending("grant");
    try {
      await sendTx("grantAccess", normalizedRecipient as Address);
      setRecipient("");
    } catch (grantError) {
      setError(messageFromError(grantError));
    } finally {
      setPending(null);
    }
  }

  async function handleRevoke(grantee: Address) {
    setError(null);
    setPending("revoke");
    try {
      await sendTx("revokeAccess", grantee);
    } catch (revokeError) {
      setError(messageFromError(revokeError));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Sharing</h3>

      <form onSubmit={handleGrant} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={recipient}
          onChange={(event) => {
            setRecipient(event.target.value);
            setError(null);
          }}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          aria-label="Grantee wallet address"
          placeholder="Wallet address (0x…)"
          className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 font-mono text-xs text-zinc-950 outline-none transition-colors focus:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50"
        />
        <button
          type="submit"
          disabled={!canGrant}
          className="h-10 shrink-0 rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-300"
        >
          {pending === "grant" ? "Granting…" : "Grant Access"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Wallets with access
        </p>

        {granteesQuery.isPending ? (
          <div className="mt-2 h-10 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ) : granteesQuery.isError ? (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {messageFromError(granteesQuery.error)}
          </p>
        ) : grantees.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No one else has access yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {grantees.map((grantee) => (
              <li
                key={grantee}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <span className="flex min-w-0 flex-col">
                  <code className="truncate font-mono text-xs text-zinc-950 dark:text-zinc-50">
                    {grantee}
                  </code>
                  {address?.toLowerCase() === grantee.toLowerCase() ? (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      granted to you
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRevoke(grantee)}
                  className="h-8 shrink-0 rounded-full border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition-colors hover:border-red-500 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:text-red-400"
                >
                  {pending === "revoke" ? "Revoking…" : "Revoke Access"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
