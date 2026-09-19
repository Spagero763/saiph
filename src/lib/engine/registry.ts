import type { Address } from "viem";

/**
 * Curated registry of well-known Base spenders. The trust tier here is
 * ground truth, not a model opinion. Anything not in this map is treated as
 * unverified until Basescan says otherwise.
 */
export const KNOWN_SPENDERS: Record<string, string> = {
  "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap Universal Router",
  "0x6ff5693b99212da76ad316178a184ab56d299b43": "Uniswap V4 Universal Router",
  "0x000000000022d473030f116ddee9f6b43ac78ba3": "Permit2",
  "0x6b2c0c7be2048daa9b5527982c29f48062b34d58": "Aerodrome Router",
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": "Aerodrome Router v2",
  "0x827922686190790b37229fd06084350e74485b72": "PancakeSwap Router",
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch Aggregation Router",
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
  "0x6a000f20005980200259b80c5102003040001068": "Odos Router",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch Router v6",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router (old)",
  "0x198ef79f1f515f02dfe9e3115ed9fc07183f02fc": "Morpho Blue",
};

/** ERC20s worth pricing on Base. reachable value math needs these. */
export const BASE_TOKENS: Record<
  string,
  { symbol: string; decimals: number; coingeckoId?: string }
> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
    symbol: "USDC",
    decimals: 6,
    coingeckoId: "usd-coin",
  },
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": {
    symbol: "DAI",
    decimals: 18,
    coingeckoId: "dai",
  },
  "0x4200000000000000000000000000000000000006": {
    symbol: "WETH",
    decimals: 18,
    coingeckoId: "weth",
  },
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": {
    symbol: "cbETH",
    decimals: 18,
    coingeckoId: "coinbase-wrapped-staked-eth",
  },
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": {
    symbol: "cbBTC",
    decimals: 8,
    coingeckoId: "coinbase-wrapped-btc",
  },
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": {
    symbol: "AERO",
    decimals: 18,
    coingeckoId: "aerodrome-finance",
  },
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": {
    symbol: "USDbC",
    decimals: 6,
    coingeckoId: "bridged-usd-coin-base",
  },
};

export function knownSpenderLabel(address: Address): string | null {
  return KNOWN_SPENDERS[address.toLowerCase()] ?? null;
}

export function tokenMeta(address: Address) {
  return BASE_TOKENS[address.toLowerCase()] ?? null;
}

export const UNLIMITED_THRESHOLD =
  BigInt(
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000",
  );
