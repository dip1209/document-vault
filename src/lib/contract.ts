import {
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";

export const LOCAL_HARDHAT_CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;

/** First contract deployed from the default Hardhat account (deterministic). */
const DEFAULT_LOCAL_VAULT = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

/**
 * ABI for DocumentVault. `parseAbi` converts the human-readable signatures
 * into typed ABI objects at module load — viem's action types only resolve
 * against object ABIs. Every custom error is included so viem can decode
 * reverts into readable names instead of raw revert data.
 */
export const DOCUMENT_VAULT_ABI = parseAbi([
  "function registerDocument(bytes32 documentId, string metadataURI)",
  "function documentsOf(address owner) view returns (bytes32[])",
  "function granteesOf(bytes32 documentId) view returns (address[])",
  "function checkAccess(bytes32 documentId, address account) view returns (bool)",
  "function getDocument(bytes32 documentId) view returns ((bytes32 documentId, address owner, string metadataURI, uint256 registeredAt, bool exists))",
  "function grantAccess(bytes32 documentId, address grantee)",
  "function revokeAccess(bytes32 documentId, address grantee)",
  "event DocumentRegistered(bytes32 indexed documentId, address indexed owner, string metadataURI)",
  "event AccessGranted(bytes32 indexed documentId, address indexed grantee, address indexed grantedBy)",
  "error AccessNotGranted(bytes32 documentId, address grantee)",
  "error DocumentAlreadyExists(bytes32 documentId)",
  "error DocumentNotFound(bytes32 documentId)",
  "error EmptyMetadataURI()",
  "error InvalidAddress()",
  "error InvalidRecipient(bytes32 documentId, address recipient)",
  "error NotDocumentOwner(bytes32 documentId, address caller)",
]);

function addressFromEnv(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  return isAddress(value) ? getAddress(value) : undefined;
}

function buildAddressMap(): Partial<Record<number, Address>> {
  const map: Partial<Record<number, Address>> = {};

  const local =
    addressFromEnv(process.env.NEXT_PUBLIC_VAULT_ADDRESS_31337) ?? getAddress(DEFAULT_LOCAL_VAULT);
  map[LOCAL_HARDHAT_CHAIN_ID] = local;

  const sepolia = addressFromEnv(process.env.NEXT_PUBLIC_VAULT_ADDRESS_11155111);
  if (sepolia) map[SEPOLIA_CHAIN_ID] = sepolia;

  return map;
}

/** DocumentVault address per chain. A chain missing from this map is unsupported. */
export const VAULT_ADDRESS_BY_CHAIN = buildAddressMap();

/** Configured chains offered by the switch-network prompt, in preference order. */
export const SUPPORTED_VAULT_CHAINS = (
  [
    { id: LOCAL_HARDHAT_CHAIN_ID, name: "Hardhat (localhost)" },
    { id: SEPOLIA_CHAIN_ID, name: "Sepolia" },
  ] as const
).filter((chain) => VAULT_ADDRESS_BY_CHAIN[chain.id] !== undefined);

export function vaultAddressFor(chainId: number | undefined): Address | undefined {
  if (chainId === undefined) return undefined;
  return VAULT_ADDRESS_BY_CHAIN[chainId];
}

/**
 * Block to start `AccessGranted` log scans from. Defaults to 0 (correct on
 * local nodes); set per-deployment on public networks to avoid provider
 * range limits on eth_getLogs.
 */
function startBlockFromEnv(): bigint {
  const raw = process.env.NEXT_PUBLIC_VAULT_START_BLOCK;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : BigInt(0);
}

export const VAULT_START_BLOCK = startBlockFromEnv();

/**
 * Deterministic on-chain id for a document: the CID already has a unique index
 * in MongoDB, and keccak256 never produces bytes32(0) for real inputs.
 */
export function documentIdForCid(cid: string): Hex {
  return keccak256(toHex(cid));
}

export function metadataUriForCid(cid: string): string {
  return `ipfs://${cid}`;
}

/**
 * Inverse of metadataUriForCid. Accepts both `ipfs://<cid>` and the alternate
 * `ipfs://ipfs/<cid>` gateway form; returns undefined for anything else.
 */
export function cidFromMetadataUri(uri: string): string | undefined {
  const match = /^ipfs:\/\/(?:ipfs\/)?(\S+)$/.exec(uri.trim());
  return match?.[1];
}
