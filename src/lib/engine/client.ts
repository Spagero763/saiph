import { createPublicClient, http, fallback } from "viem";
import { base } from "viem/chains";

/**
 * Read-only Base client with redundant public RPCs. Falls back on failure so a
 * single flaky endpoint never breaks a scan. An Alchemy/Infura key in the env
 * takes priority for log queries.
 */
export const BASE_RPC_URL = process.env.BASE_RPC_URL;

const endpoints = [
  BASE_RPC_URL,
  "https://mainnet.base.org",
  "https://base.publicnode.com",
  "https://base-mainnet.public.blastapi.io",
  "https://1rpc.io/base",
].filter(Boolean) as string[];

export const baseClient = createPublicClient({
  chain: base,
  batch: {
    multicall: { batchSize: 2048, wait: 12 },
  },
  transport: fallback(
    endpoints.map((url) => http(url, { timeout: 12_000, retryCount: 2, batch: true })),
    { rank: false },
  ),
});

export const BASESCAN_API = "https://api.basescan.org/api";
