import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddressEqual,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  DOCUMENT_VAULT_ABI,
  LOCAL_HARDHAT_CHAIN_ID,
  documentIdForCid,
  metadataUriForCid,
  vaultAddressFor,
} from "../src/lib/contract.ts";

/**
 * End-to-end check against a running Hardhat node (npm run node in hardhat/,
 * then npm run deploy: localhost). It replicates exactly what the Upload page
 * does — registerDocument with documentIdForCid/metadataUriForCid — and the
 * Dashboard metrics algorithm, using the app's own contract module.
 *
 * Skips itself when nothing is listening on 127.0.0.1:8545.
 */

const RPC_URL = "http://127.0.0.1:8545";

// Well-known Hardhat development keys (publicly documented test mnemonics).
const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const SECOND_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const localChain = defineChain({
  id: LOCAL_HARDHAT_CHAIN_ID,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

type Metrics = { totalDocuments: number; sharedDocuments: number; sharedWithMe: number };

/** Mirrors src/hooks/useDashboardMetrics.ts. */
async function collectMetrics(
  client: ReturnType<typeof createPublicClient>,
  vault: Address,
  account: Address,
): Promise<Metrics> {
  const contract = { address: vault, abi: DOCUMENT_VAULT_ABI } as const;

  const ownedIds = await client.readContract({
    ...contract,
    functionName: "documentsOf",
    args: [account],
  });

  const granteeLists = await Promise.all(
    ownedIds.map((documentId) =>
      client.readContract({ ...contract, functionName: "granteesOf", args: [documentId] }),
    ),
  );

  const grantedLogs = await client.getContractEvents({
    ...contract,
    eventName: "AccessGranted",
    args: { grantee: account },
    fromBlock: BigInt(0),
    toBlock: "latest",
  });

  const candidateIds = [
    ...new Set<Hex>(
      grantedLogs
        .map((log) => log.args.documentId)
        .filter((documentId): documentId is Hex => documentId !== undefined),
    ),
  ];

  const accessFlags = await Promise.all(
    candidateIds.map((documentId) =>
      client.readContract({ ...contract, functionName: "checkAccess", args: [documentId, account] }),
    ),
  );

  return {
    totalDocuments: ownedIds.length,
    sharedDocuments: granteeLists.filter((grantees) => grantees.length > 0).length,
    sharedWithMe: accessFlags.filter(Boolean).length,
  };
}

async function nodeIsUp(): Promise<boolean> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** evm_snapshot/evm_revert are Hardhat extensions outside viem's typed schema. */
async function evmCall(method: "evm_snapshot" | "evm_revert", params: unknown[] = []): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method} failed: ${body.error.message}`);
  return body.result;
}

const skip: string | false = (await nodeIsUp())
  ? false
  : "Hardhat node not reachable on 127.0.0.1:8545";

describe("DocumentVault E2E", { skip }, () => {
  const vault = vaultAddressFor(LOCAL_HARDHAT_CHAIN_ID);
  assert.ok(vault, "expected a configured address for chain 31337");

  const publicClient = createPublicClient({ chain: localChain, transport: http(RPC_URL) });
  const deployer = privateKeyToAccount(DEPLOYER_KEY);
  const second = privateKeyToAccount(SECOND_KEY);

  const secondClient = createWalletClient({
    account: second,
    chain: localChain,
    transport: http(RPC_URL),
  });

  const CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const documentId = documentIdForCid(CID);

  let snapshotId: Hex | null = null;

  before(async () => {
    // Restore the post-deploy seed state afterwards so the suite can be
    // re-run against the same node.
    snapshotId = (await evmCall("evm_snapshot")) as Hex;
  });

  after(async () => {
    if (snapshotId) {
      await evmCall("evm_revert", [snapshotId]);
    }
  });

  it("deploy seed state matches the metrics algorithm", async () => {
    const deployerMetrics = await collectMetrics(publicClient, vault, deployer.address);
    assert.equal(deployerMetrics.totalDocuments, 1, "deployer registered the seed document");
    assert.equal(deployerMetrics.sharedDocuments, 1, "seed document was granted to account #1");
    assert.equal(deployerMetrics.sharedWithMe, 0);

    const secondMetrics = await collectMetrics(publicClient, vault, second.address);
    assert.equal(secondMetrics.totalDocuments, 0);
    assert.equal(secondMetrics.sharedDocuments, 0);
    assert.equal(secondMetrics.sharedWithMe, 1, "seed grant targets account #1");
  });

  it("registers ownership the way the Upload page does", async () => {
    const hash = await secondClient.writeContract({
      address: vault,
      abi: DOCUMENT_VAULT_ABI,
      functionName: "registerDocument",
      args: [documentId, metadataUriForCid(CID)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");

    const document = await publicClient.readContract({
      address: vault,
      abi: DOCUMENT_VAULT_ABI,
      functionName: "getDocument",
      args: [documentId],
    });
    assert.ok(isAddressEqual(document.owner, second.address), "owner is the signing wallet");
    assert.equal(document.metadataURI, `ipfs://${CID}`);
    assert.equal(document.exists, true);

    const metrics = await collectMetrics(publicClient, vault, second.address);
    assert.equal(metrics.totalDocuments, 1);
  });

  it("reflects new grants, revocations, and stale events in the metrics", async () => {
    const grantHash = await secondClient.writeContract({
      address: vault,
      abi: DOCUMENT_VAULT_ABI,
      functionName: "grantAccess",
      args: [documentId, deployer.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: grantHash });

    const secondAfterGrant = await collectMetrics(publicClient, vault, second.address);
    assert.equal(secondAfterGrant.sharedDocuments, 1);

    const deployerAfterGrant = await collectMetrics(publicClient, vault, deployer.address);
    assert.equal(deployerAfterGrant.sharedWithMe, 1, "grant from account #1 is visible");

    const revokeHash = await secondClient.writeContract({
      address: vault,
      abi: DOCUMENT_VAULT_ABI,
      functionName: "revokeAccess",
      args: [documentId, deployer.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: revokeHash });

    const deployerAfterRevoke = await collectMetrics(publicClient, vault, deployer.address);
    assert.equal(
      deployerAfterRevoke.sharedWithMe,
      0,
      "the stale AccessGranted event must be filtered by checkAccess",
    );

    const secondAfterRevoke = await collectMetrics(publicClient, vault, second.address);
    assert.equal(secondAfterRevoke.sharedDocuments, 0);
  });

  it("rejects duplicate registration for the same CID", async () => {
    await assert.rejects(
      secondClient.writeContract({
        address: vault,
        abi: DOCUMENT_VAULT_ABI,
        functionName: "registerDocument",
        args: [documentId, metadataUriForCid(CID)],
      }),
      "expected DocumentAlreadyExists",
    );
  });
});
