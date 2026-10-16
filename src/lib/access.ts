import type { Address, Hex, PublicClient } from "viem";

import { DOCUMENT_VAULT_ABI, VAULT_START_BLOCK } from "@/lib/contract";

/**
 * Document ids the contract currently grants `account` permission to read.
 *
 * Candidates come from AccessGranted events (grantee = account) so the scan
 * scales with grants rather than total supply; each candidate is then
 * re-verified with checkAccess so revoked grants drop out even though their
 * events remain in history. The owner's own documents never appear because
 * the contract does not emit AccessGranted for them.
 *
 * Shared by the Dashboard metric and the Shared With Me page so both always
 * agree.
 */
export async function grantedDocumentIds(
  publicClient: PublicClient,
  vault: Address,
  account: Address,
): Promise<Hex[]> {
  const contract = { address: vault, abi: DOCUMENT_VAULT_ABI } as const;

  const grantedLogs = await publicClient.getContractEvents({
    ...contract,
    eventName: "AccessGranted",
    args: { grantee: account },
    fromBlock: VAULT_START_BLOCK,
    toBlock: "latest",
  });

  const candidateIds = [
    ...new Set<Hex>(
      grantedLogs
        .map((log) => log.args.documentId)
        .filter((documentId): documentId is Hex => documentId !== undefined),
    ),
  ];

  if (candidateIds.length === 0) return [];

  const accessFlags = await Promise.all(
    candidateIds.map((documentId) =>
      publicClient.readContract({
        ...contract,
        functionName: "checkAccess",
        args: [documentId, account],
      }),
    ),
  );

  return candidateIds.filter((_, index) => accessFlags[index]);
}
