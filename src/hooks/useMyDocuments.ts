"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { unwrap } from "@/lib/api-client";

export type OwnedDocument = {
  _id: string;
  documentTitle: string;
  description: string;
  cid: string;
  ownerWalletAddress: string;
  uploadDate: string;
  fileSize?: number;
};

type ListResponse = { documents: OwnedDocument[] };
type DeleteResponse = { deleted: boolean; cid: string };

/** All metadata records whose owner matches the connected wallet. */
export function useMyDocuments() {
  const { address } = useAccount();

  return useQuery<ListResponse>({
    queryKey: ["my-documents", address],
    enabled: Boolean(address),
    queryFn: async () => {
      if (!address) throw new Error("Connect a wallet to list documents");
      const response = await fetch(`/api/documents?owner=${address}`);
      return unwrap<ListResponse>(response);
    },
  });
}

/** Removes a document's MongoDB metadata (the on-chain record stays). */
export function useDeleteDocument() {
  const { address } = useAccount();
  const queryClient = useQueryClient();

  return useMutation<DeleteResponse, Error, string>({
    mutationFn: async (cid: string) => {
      if (!address) throw new Error("Connect a wallet to delete documents");
      const params = new URLSearchParams({ cid, owner: address });
      const response = await fetch(`/api/documents?${params.toString()}`, { method: "DELETE" });
      return unwrap<DeleteResponse>(response);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-documents", address] });
    },
  });
}
