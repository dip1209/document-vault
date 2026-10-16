"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";

import { grantedDocumentIds } from "@/lib/access";
import { DOCUMENT_VAULT_ABI, vaultAddressFor } from "@/lib/contract";

export type DashboardMetrics = {
  totalDocuments: number;
  sharedDocuments: number;
  sharedWithMe: number;
};

/**
 * Reads the three Dashboard metrics from the DocumentVault contract for the
 * connected wallet:
 *
 * 1. Total Documents       -> documentsOf(address)
 * 2. Shared Documents      -> granteesOf(id) for each owned id, count > 0
 * 3. Documents Shared With Me -> grantedDocumentIds() (events + checkAccess).
 */
export function useDashboardMetrics() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const vault = vaultAddressFor(chainId);

  return useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics", address, chainId],
    enabled: Boolean(address && publicClient && vault),
    queryFn: async () => {
      if (!address || !publicClient || !vault) {
        throw new Error("Wallet or contract address unavailable");
      }

      const contract = { address: vault, abi: DOCUMENT_VAULT_ABI } as const;

      const [ownedIds, sharedWithMeIds] = await Promise.all([
        publicClient.readContract({
          ...contract,
          functionName: "documentsOf",
          args: [address],
        }),
        grantedDocumentIds(publicClient, vault, address),
      ]);

      const granteeLists = await Promise.all(
        ownedIds.map((documentId) =>
          publicClient.readContract({
            ...contract,
            functionName: "granteesOf",
            args: [documentId],
          }),
        ),
      );
      const sharedDocuments = granteeLists.filter((grantees) => grantees.length > 0).length;

      return {
        totalDocuments: ownedIds.length,
        sharedDocuments,
        sharedWithMe: sharedWithMeIds.length,
      };
    },
  });
}
