import { APPROVAL_TOPIC } from "./abi";
import { DEMO_SNAPSHOT } from "./demo-snapshot";

/**
 * Server-side approval discovery. Primary source is Moralis's wallet-approvals
 * endpoint, which returns a wallet's active ERC20 approvals in one call and needs
 * no log paging. Blockscout's etherscan-compat getLogs is the keyless fallback.
 * Known demo wallets short-circuit to a committed snapshot so they always resolve,
 * even if every live source is down. Every number is still verified live at scan.
 */
const MORALIS = "https://deep-index.moralis.io/api/v2.2";
const BLOCKSCOUT = "https://base.blockscout.com/api";
const PAGE = 1000;
const MAX_WINDOWS = 40;

export interface WireApproval {
  token: string;
  spender: string;
  txHash: string;
  blockNumber: string;
  timeStamp: number | null;
}

export class DiscoveryError extends Error {}

const pad32 = (a: string) => `0x${"0".repeat(24)}${a.slice(2)}`.toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Latest approval per token/spender for an owner. Demo wallets resolve from the
 * committed snapshot; otherwise Moralis first, Blockscout as fallback. Throws on
 * a data outage rather than returning empty, so a failure is never mistaken for
 * a clean wallet.
 */
export async function discoverApprovals(owner: string): Promise<WireApproval[]> {
  const snap = DEMO_SNAPSHOT[owner.toLowerCase()];
  if (snap) return snap;

  if (process.env.MORALIS_API_KEY) {
    try {
      return await fromMoralis(owner);
    } catch {
      // any Moralis failure (rejected or exhausted key, transient error) falls
      // through to Blockscout rather than failing the scan. Blockscout owns the
      // final error if it too cannot read the chain.
    }
  }
  return fromBlockscout(owner);
}

// --- Moralis: one call, active approvals with spender ---------------------

type MoralisApproval = {
  token?: { address?: string };
  token_address?: string;
  address?: string;
  spender?: { address?: string } | string;
  block_number?: string | number;
  block_timestamp?: string;
  transaction_hash?: string;
};

async function fromMoralis(owner: string): Promise<WireApproval[]> {
  const res = await fetch(`${MORALIS}/wallets/${owner}/approvals?chain=base`, {
    headers: { "X-API-Key": process.env.MORALIS_API_KEY as string, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`moralis http ${res.status}`);
  const json = await res.json();
  const rows: MoralisApproval[] = Array.isArray(json?.result) ? json.result : [];

  const out: WireApproval[] = [];
  for (const r of rows) {
    const token = r.token?.address ?? r.token_address ?? r.address;
    const spender = typeof r.spender === "string" ? r.spender : r.spender?.address;
    if (!token || !spender) continue;
    out.push({
      token,
      spender,
      txHash: r.transaction_hash ?? "0x",
      blockNumber: String(r.block_number ?? "0"),
      timeStamp: r.block_timestamp ? Math.floor(Date.parse(r.block_timestamp) / 1000) : null,
    });
  }
  return out;
}

// --- Blockscout fallback: block-cursor paging over Approval logs ----------

type EsLog = {
  address: string;
  topics: string[];
  transactionHash?: string;
  hash?: string;
  logIndex?: string;
  blockNumber: string;
  timeStamp?: string;
};

class RateLimited extends Error {}

function bsUrl(owner: string, fromBlock: number): string {
  const key = process.env.BLOCKSCOUT_API_KEY;
  return (
    `${BLOCKSCOUT}?module=logs&action=getLogs` +
    `&fromBlock=${fromBlock}&toBlock=latest&topic0=${APPROVAL_TOPIC}` +
    `&topic1=${pad32(owner)}&topic0_1_opr=and&offset=${PAGE}` +
    (key ? `&apikey=${key}` : "")
  );
}

async function fetchWindow(owner: string, fromBlock: number): Promise<EsLog[]> {
  const res = await fetch(bsUrl(owner, fromBlock), { signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) throw new Error(`http ${res.status}`);
  const json = await res.json();
  if (Array.isArray(json?.result)) return json.result as EsLog[];
  const text = String(json?.message ?? "") + String(json?.result ?? "");
  if (/no records found|not found/i.test(text)) return [];
  if (/rate limit|too many/i.test(text)) throw new RateLimited();
  throw new Error(text || "provider error");
}

function collapse(logs: EsLog[]): WireApproval[] {
  const latest = new Map<string, WireApproval>();
  for (const l of logs) {
    const spenderTopic = l.topics?.[2];
    if (!spenderTopic) continue;
    const token = l.address;
    const spender = `0x${spenderTopic.slice(26)}`;
    const bn = BigInt(l.blockNumber);
    const key = `${token.toLowerCase()}:${spender.toLowerCase()}`;
    const prev = latest.get(key);
    if (!prev || bn > BigInt(prev.blockNumber)) {
      latest.set(key, {
        token,
        spender,
        txHash: l.transactionHash ?? l.hash ?? "0x",
        blockNumber: l.blockNumber,
        timeStamp: l.timeStamp ? Number(l.timeStamp) : null,
      });
    }
  }
  return [...latest.values()];
}

async function fromBlockscout(owner: string): Promise<WireApproval[]> {
  const seen = new Set<string>();
  const all: EsLog[] = [];
  let cursor = 0;

  for (let window = 0; window < MAX_WINDOWS; window++) {
    let rows: EsLog[] | null = null;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        rows = await fetchWindow(owner, cursor);
        break;
      } catch (e) {
        lastErr = e;
        if (e instanceof RateLimited) break;
        await sleep(400 * (attempt + 1));
      }
    }
    if (rows === null) {
      if (lastErr instanceof RateLimited) {
        throw new DiscoveryError(
          "The block explorer is rate limiting right now. Wait a moment and scan again. This is a data outage, not a clean wallet.",
        );
      }
      throw new DiscoveryError(
        `Could not read approval history (${lastErr instanceof Error ? lastErr.message : "failed"}). This is a data outage, not a clean wallet.`,
      );
    }

    let maxBlock = cursor;
    let fresh = 0;
    for (const l of rows) {
      const id = `${l.transactionHash ?? l.hash}:${l.logIndex ?? ""}:${l.topics?.[2] ?? ""}`;
      const bn = parseInt(l.blockNumber, 16);
      if (bn > maxBlock) maxBlock = bn;
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(l);
      fresh++;
    }

    if (rows.length < PAGE) break;
    cursor = fresh > 0 ? maxBlock : maxBlock + 1;
  }

  return collapse(all);
}
