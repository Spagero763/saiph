import type { Address, Hex } from "viem";

export type Verdict = "breach" | "watch" | "clear";

export interface TokenMeta {
  address: Address;
  symbol: string;
  decimals: number;
  priceUsd: number | null;
}

export interface SpenderProfile {
  address: Address;
  /** human label if we know it (router, permit2, known protocol) */
  label: string | null;
  /** is the spender's source verified on Basescan */
  verified: boolean | null;
  /** is it an EOA (externally owned account) holding an approval, a red flag */
  isEoa: boolean;
  /** curated trust tier derived from the registry, not the model */
  trust: "known" | "unverified" | "eoa" | "unknown";
}

export interface ApprovalFinding {
  token: TokenMeta;
  spender: SpenderProfile;
  /** raw allowance from the ERC20 contract */
  allowanceRaw: bigint;
  /** true when allowance is the unlimited sentinel */
  unlimited: boolean;
  /** current wallet balance of the token */
  balanceRaw: bigint;
  /** min(allowance, balance): the ceiling of what this approval can move */
  reachableRaw: bigint;
  reachableUsd: number | null;
  /** proven on-chain: an eth_call transferFrom that did not revert */
  drainProven: boolean;
  approvalTxHash: Hex | null;
  approvedAt: number | null;
  severity: Verdict;
}

export interface ScanResult {
  address: Address;
  scannedAt: number;
  blockNumber: string;
  /** deterministic 0-100, lower = more exposed */
  healthScore: number;
  verdict: Verdict;
  totalReachableUsd: number;
  approvals: ApprovalFinding[];
  /** the agent's ordered decision log, streamed to the console */
  trace: TraceStep[];
  summary: string;
}

export interface TraceStep {
  id: string;
  /** which actor produced this step */
  actor: "engine" | "model";
  kind:
    | "resolve"
    | "read"
    | "decide"
    | "simulate"
    | "price"
    | "score"
    | "narrate";
  label: string;
  detail?: string;
  /** on-chain call reference so every claim is auditable */
  evidence?: string;
  ms?: number;
}
