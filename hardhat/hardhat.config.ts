import { existsSync } from "node:fs";
import { join } from "node:path";

import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";

/**
 * Hardhat 3 does not read .env files on its own; `configVariable` only sees real
 * environment variables (or the keystore plugin). Load a local .env as a
 * fallback so `SEPOLIA_RPC_URL`/`SEPOLIA_PRIVATE_KEY` can live there. Real
 * env vars still win, matching Node's --env-file precedence.
 */
const envFile = join(import.meta.dirname, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.34",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  test: {
    solidity: {
      fuzz: {
        runs: 512,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: {
      nodejs: "./test",
    },
  },
});