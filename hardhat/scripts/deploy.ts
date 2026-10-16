import { network } from "hardhat";
import { getAddress, keccak256, toHex } from "viem";

const docId = (label: string) => keccak256(toHex(label));

const DEMO_GRANTEE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

async function main(): Promise<void> {
  const { viem, networkName } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, configuredGrantee] = await viem.getWalletClients();
  const grantee = configuredGrantee ?? { account: { address: DEMO_GRANTEE } };

  console.log(`Deploying DocumentVault to ${networkName}...`);
  console.log("Deployer:", deployer.account.address);

  const vault = await viem.deployContract("DocumentVault");
  console.log("DocumentVault deployed at:", vault.address);

  const chainId = await publicClient.getChainId();
  console.log("Chain ID:", chainId);

  const explorer = explorerUrl(chainId, vault.address);
  if (explorer) console.log("Explorer:", explorer);

  const documentId = docId("quarterly-report-2026-q1");

  const registerHash = await vault.write.registerDocument(
    [documentId, "ipfs://QmExampleDocumentHash"],
    { account: deployer.account },
  );
  await publicClient.waitForTransactionReceipt({ hash: registerHash });
  console.log("\nRegistered document:", documentId);

  const grantHash = await vault.write.grantAccess([documentId, grantee.account.address], { account: deployer.account });
  await publicClient.waitForTransactionReceipt({ hash: grantHash });
  console.log("Granted access to:", grantee.account.address);

  const granteeHasAccess = await vault.read.checkAccess([documentId, grantee.account.address]);
  const ownerHasAccess = await vault.read.checkAccess([documentId, deployer.account.address]);
  console.log("Grantee access:", granteeHasAccess);
  console.log("Owner access:", ownerHasAccess);

  const record = {
    network: networkName,
    chainId: Number(chainId),
    address: vault.address,
    deployer: deployer.account.address,
    blockNumber: Number(await publicClient.getBlockNumber()),
  };

  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const outDir = path.join(process.cwd(), "deployments");
  await mkdir(outDir, { recursive: true });

  const outFile = path.join(outDir, `${networkName}.json`);
  await writeFile(outFile, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log("\nDeployment record written to:", outFile);
}

function explorerUrl(chainId: number, address: string): string | undefined {
  const suffix = `/address/${getAddress(address)}`;
  switch (chainId) {
    case 1:
      return `https://etherscan.io${suffix}`;
    case 11155111:
      return `https://sepolia.etherscan.io${suffix}`;
    default:
      return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});