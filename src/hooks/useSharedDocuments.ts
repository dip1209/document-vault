"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { unwrap } from "@/lib/api-client";
import { grantedDocumentIds } from "@/lib/access";
import { DOCUMENT_VAULT_ABI, cidFromMetadataUri, vaultAddressFor } from "@/lib/contract";
import type { OwnedDocument } from "@/hooks/useMyDocuments";

export type SharedDocument = {
  documentId: Hex;
  cid: string;
  owner: Address;
  /** Unix seconds the owner registered the document, straight from the chain. */
  registeredAt: number;
  /** MongoDB metadata, present unless the owner deleted it. */
  metadata?: OwnedDocument;
};

type OnChainDocument = Omit<SharedDocument, "metadata">;

/**
 * Documents the connected wallet is allowed to read, verified against the
 * DocumentVault contract: candidate ids come from AccessGranted events, each
 * is re-checked with checkAccess (revoked grants drop out), then metadata is
 * fetched from MongoDB by the CID encoded in the on-chain metadataURI.
 */
export function useSharedDocuments() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const vault = vaultAddressFor(chainId);

  return useQuery<SharedDocument[]>({
    queryKey: ["shared-documents", address, chainId],
    enabled: Boolean(address && publicClient && vault),
    queryFn: async () => {
      if (!address || !publicClient || !vault) {
        throw new Error("Wallet or contract address unavailable");
      }

      const grantedIds = await grantedDocumentIds(publicClient, vault, address);
      if (grantedIds.length === 0) return [];

      const contract = { address: vault, abi: DOCUMENT_VAULT_ABI } as const;

      const chainDocuments = await Promise.all(
        grantedIds.map(async (documentId): Promise<OnChainDocument | null> => {
          const document = await publicClient.readContract({
            ...contract,
            functionName: "getDocument",
            args: [documentId],
          });
          if (!document.exists) return null;

          const cid = cidFromMetadataUri(document.metadataURI);
          if (!cid) return null;

          return {
            documentId,
            cid,
            owner: document.owner,
            registeredAt: Number(document.registeredAt),
          };
        }),
      );

      const onChain = chainDocuments.filter(
        (document): document is OnChainDocument => document !== null,
      );
      if (onChain.length === 0) return [];

      const params = new URLSearchParams({ cids: onChain.map((document) => document.cid).join(",") });
      const response = await fetch(`/api/documents?${params.toString()}`);
      const body = await unwrap<{ documents: OwnedDocument[] }>(response);
      const byCid = new Map(body.documents.map((document) => [document.cid, document]));

      return onChain.map((document) => ({
        ...document,
        metadata: byCid.get(document.cid),
      }));
    },
  });
}
