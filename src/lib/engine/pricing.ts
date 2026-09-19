import type { Address } from "viem";

/**
 * USD prices from DefiLlama's coins API, one batched request, no key. Values
 * are cached per-process for a short window so repeated scans stay cheap.
 */
const cache = new Map<string, { price: number; at: number }>();
const TTL = 60_000;

export async function priceTokens(
  addresses: Address[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const stale: Address[] = [];

  for (const a of addresses) {
    const key = a.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) out.set(key, hit.price);
    else stale.push(a);
  }
  if (stale.length === 0) return out;

  const ids = stale.map((a) => `base:${a.toLowerCase()}`).join(",");
  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${ids}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        coins: Record<string, { price: number }>;
      };
      for (const [k, v] of Object.entries(json.coins ?? {})) {
        const addr = k.split(":")[1]?.toLowerCase();
        if (addr && typeof v.price === "number") {
          out.set(addr, v.price);
          cache.set(addr, { price: v.price, at: Date.now() });
        }
      }
    }
  } catch {
    // pricing is best-effort; a missing price yields a null reachableUsd, never a guess
  }
  return out;
}
