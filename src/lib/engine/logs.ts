import { type Address, type Hex, getAddress } from "viem";
import { APPROVAL_TOPIC } from "./abi";
import { BASE_RPC_URL } from "./client";

/**
 * Approval discovery. A security tool must never confuse "the provider failed"
 * with "this wallet is clean", so every provider distinguishes an empty result
 * from an error, retries transient rate limits, and if all live providers fail
 * we fall back to the last good result rather than lie. Silence is not a verdict.
 *
 * There is no keyless RPC that serves full-history logs on Base; the only keyless
 * full-history source is a block-explorer indexer. Blockscout's etherscan-compat
 * getLogs is that source. It rate-limits hard, so the cache below is load-bearing:
 * repeat and demo scans never touch the provider, and a throttled provider serves
 * the last good answer instead of failing the scan.
 */
const PROVIDERS: { name: string; base: string; keyed: boolean }[] = [
  { name: "etherscan-v2", base: "https://api.etherscan.io/v2/api", keyed: true },
  { name: "blockscout", base: "https://base.blockscout.com/api", keyed: false },
];

/** Fresh cache window. Approvals are append-only, so a recent answer is safe to reuse. */
const FRESH_MS = 90_000;

export class DiscoveryError extends Error {}

export interface RawApproval {
  token: Address;
  spender: Address;
  txHash: Hex;
  blockNumber: bigint;
  timeStamp: number | null;
}

export interface Discovery {
  approvals: RawApproval[];
  /** true when the live providers failed and this is the last good answer */
  stale: boolean;
  /** epoch ms the served data was fetched */
  fetchedAt: number;
}

interface CacheEntry {
  approvals: RawApproval[];
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

const pad32 = (a: Address) => (`0x${"0".repeat(24)}${a.slice(2)}`).toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type EsLog = {
  address: string;
  topics: string[];
  transactionHash?: string;
  hash?: string;
  blockNumber: string;
  timeStamp?: string;
};

function collapse(logs: EsLog[]): RawApproval[] {
  const latest = new Map<string, RawApproval>();
  for (const l of logs) {
    const spenderTopic = l.topics?.[2];
    if (!spenderTopic) continue;
    const token = getAddress(l.address);
    const spender = getAddress(`0x${spenderTopic.slice(26)}`);
    const bn = BigInt(l.blockNumber);
    const key = `${token}:${spender}`;
    const prev = latest.get(key);
    if (!prev || bn > prev.blockNumber) {
      latest.set(key, {
        token,
        spender,
        txHash: (l.transactionHash ?? l.hash ?? "0x") as Hex,
        blockNumber: bn,
        timeStamp: l.timeStamp ? Number(l.timeStamp) : null,
      });
    }
  }
  return [...latest.values()];
}

/** One page. Returns rows, or throws so the caller can retry / fall through. */
async function fetchPage(
  base: string,
  keyed: boolean,
  owner: Address,
  page: number,
): Promise<EsLog[]> {
  const key = keyed ? `&apikey=${process.env.ETHERSCAN_API_KEY}` : "";
  const chain = keyed ? "chainid=8453&" : "";
  const url =
    `${base}?${chain}module=logs&action=getLogs` +
    `&fromBlock=0&toBlock=latest&topic0=${APPROVAL_TOPIC}` +
    `&topic1=${pad32(owner)}&topic0_1_opr=and&page=${page}&offset=1000${key}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });

  // 429 carries a reset hint; surface it so the caller backs off correctly.
  if (res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("retry-after") ?? 0);
    throw new RateLimited(reset);
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  const json = await res.json();

  // Etherscan-shaped APIs use status "1"=ok, "0"=error OR empty.
  // "No records found" is a legitimate empty; anything else at status 0 is an error.
  if (Array.isArray(json?.result)) return json.result as EsLog[];
  const message = String(json?.message ?? "");
  const detail = String(json?.result ?? "");
  if (/no records found|not found/i.test(message + detail)) return [];
  if (/rate limit|too many/i.test(message + detail)) throw new RateLimited(0);
  throw new Error(detail || message || "provider error");
}

class RateLimited extends Error {
  constructor(public resetSeconds: number) {
    super("rate limited");
  }
}

async function fromProvider(
  base: string,
  keyed: boolean,
  owner: Address,
): Promise<EsLog[]> {
  const all: EsLog[] = [];
  // Pages run sequentially, never as a burst, since a burst is what trips the multi-minute
  // penalty on the keyless explorer. Most wallets fit in one page anyway.
  for (let page = 1; page <= 8; page++) {
    let rows: EsLog[] | null = null;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rows = await fetchPage(base, keyed, owner, page);
        break;
      } catch (e) {
        lastErr = e;
        // a rate-limit penalty outlasts any wait we can afford in one request,
        // so bail to the next provider / cache instead of hammering it
        if (e instanceof RateLimited) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
    if (rows === null) throw lastErr instanceof Error ? lastErr : new Error("provider failed");
    all.push(...rows);
    if (rows.length < 1000) break; // last page
  }
  return all;
}

/**
 * Full-history Approval logs straight from an archive RPC (Alchemy et al). This
 * is the primary path when BASE_RPC_URL is set: one wallet, every ERC20 at once,
 * no explorer rate limit. The only cap is results-per-response, so on a "too many
 * results / range too large" error we bisect the block range and recurse, exactly
 * as revoke.cash does. A single block that still overflows is a terminal case.
 */
async function rpcGetLogs(owner: Address): Promise<EsLog[]> {
  const url = BASE_RPC_URL!;
  const ownerTopic = pad32(owner);

  const head = await rpcCall(url, "eth_blockNumber", []);
  const latest = BigInt(head as string);

  const out: EsLog[] = [];
  async function range(from: bigint, to: bigint): Promise<void> {
    const params = [
      {
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${to.toString(16)}`,
        topics: [APPROVAL_TOPIC, null, ownerTopic],
      },
    ];
    try {
      const logs = (await rpcCall(url, "eth_getLogs", params)) as RpcLog[];
      for (const l of logs) {
        out.push({
          address: l.address,
          topics: l.topics,
          transactionHash: l.transactionHash,
          blockNumber: l.blockNumber,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const overflow = /too many results|range|limit|response size|10000|exceed/i.test(msg);
      if (overflow && to > from) {
        const mid = from + (to - from) / 2n;
        await range(from, mid);
        await range(mid + 1n, to);
        return;
      }
      throw e;
    }
  }
  await range(0n, latest);
  return out;
}

interface RpcLog {
  address: string;
  topics: string[];
  transactionHash: string;
  blockNumber: string;
}

async function rpcCall(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`rpc http ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message ?? "rpc error");
  return json.result;
}

export async function discoverApprovals(owner: Address): Promise<Discovery> {
  const cacheKey = owner.toLowerCase();
  const cached = cache.get(cacheKey);
  const now = Date.now();

  // fresh cache: skip the provider entirely (instant repeat/demo scans)
  if (cached && now - cached.fetchedAt < FRESH_MS) {
    return { approvals: cached.approvals, stale: false, fetchedAt: cached.fetchedAt };
  }

  const errors: string[] = [];

  // Primary: archive RPC when configured. No explorer rate limit.
  if (BASE_RPC_URL) {
    try {
      const approvals = collapse(await rpcGetLogs(owner));
      cache.set(cacheKey, { approvals, fetchedAt: now });
      return { approvals, stale: false, fetchedAt: now };
    } catch (e) {
      errors.push(`rpc: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  // Keyless fallbacks.
  for (const p of PROVIDERS) {
    if (p.keyed && !process.env.ETHERSCAN_API_KEY) continue;
    try {
      const logs = await fromProvider(p.base, p.keyed, owner);
      const approvals = collapse(logs);
      cache.set(cacheKey, { approvals, fetchedAt: now });
      return { approvals, stale: false, fetchedAt: now };
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  // every live provider failed. If we have a prior good answer, serve it stale
  // rather than tell an exposed wallet it is clean.
  if (cached) {
    return { approvals: cached.approvals, stale: true, fetchedAt: cached.fetchedAt };
  }

  throw new DiscoveryError(
    `Could not read approval history from any source (${errors.join("; ")}). This is a data outage, not a clean wallet. Try again in a moment.`,
  );
}

/** Seed the cache for known demo wallets so the first live hit is instant. */
export function primeCache(owner: Address, approvals: RawApproval[]) {
  cache.set(owner.toLowerCase(), { approvals, fetchedAt: Date.now() });
}
