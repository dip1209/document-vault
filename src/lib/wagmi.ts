import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

/**
 * viem's built-in `localhost` chain uses id 1337; Hardhat nodes default to
 * 31337, matching hardhat/deployments/default.json.
 */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/**
 * WalletConnect Cloud project id. Only needed for the WalletConnect/QR wallet;
 * injected wallets (MetaMask, Rabby, ...) work without it.
 *
 * RainbowKit throws during config construction when projectId is empty and
 * substitutes its public demo id for the literal "YOUR_PROJECT_ID", so that
 * sentinel keeps `next build` working before a real id is configured.
 */
export const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";

/**
 * Shared wagmi config. Kept at module scope so the provider and any future
 * server-side wagmi actions reuse one connection pool.
 */
export const wagmiConfig = getDefaultConfig({
  appName: "Document Vault",
  appDescription: "Upload PDFs to IPFS and register their metadata on-chain",
  projectId: walletConnectProjectId,
  chains: [hardhatLocal, sepolia, mainnet],
  ssr: true,
});
