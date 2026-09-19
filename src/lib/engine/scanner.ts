import {
  type Address,
  type Hex,
  getAddress,
  formatUnits,
  maxUint256,
  encodeFunctionData,
} from "viem";
import { baseClient, BASESCAN_API } from "./client";
import { erc20Abi } from "./abi";
import { knownSpenderLabel, tokenMeta, UNLIMITED_THRESHOLD } from "./registry";
import { priceTokens } from "./pricing";
import { runAgent } from "../agent/loop";
import type {
  ApprovalFinding,
  ScanResult,
  SpenderProfile,
  TraceStep,
  Verdict,
} from "./types";

export async function profileSpender(spender: Address): Promise<SpenderProfile> {
  const label = knownSpenderLabel(spender);
  const code = await baseClient.getCode({ address: spender }).catch(() => undefined);
  const isEoa = !code || code === "0x";

  let verified: boolean | null = null;
  if (!isEoa && process.env.BASESCAN_API_KEY) {
    try {
      const res = await fetch(
        `${BASESCAN_API}?module=contract&action=getsourcecode&address=${spender}&apikey=${process.env.BASESCAN_API_KEY}`,
        { signal: AbortSignal.timeout(6000) },
      );
      const json = await res.json();
      const src = json?.result?.[0]?.SourceCode;
      verified = typeof src === "string" && src.length > 0;
    } catch {
      verified = null;
    }
  }

  const trust: SpenderProfile["trust"] = label
    ? "known"
    : isEoa
      ? "eoa"
      : verified === false
        ? "unverified"
        : "unknown";

  return { address: spender, label, verified, isEoa, trust };
}

/**
 * The proof step. We simulate `transferFrom(owner -> attacker, reachable)`
 * with the spender as msg.sender via an eth_call state override on the caller.
 * If it does not revert, the drain is reachable at this block. No opinion.
 */
export async function proveDrain(
  token: Address,
  owner: Address,
  spender: Address,
  amount: bigint,
): Promise<boolean> {
  if (amount === 0n) return false;
  const attacker = "0x000000000000000000000000000000000000dEaD" as Address;
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transferFrom",
    args: [owner, attacker, amount],
  });
  try {
    await baseClient.call({
      account: spender,
      to: token,
      data,
    });
    return true;
  } catch {
    return false;
  }
}

function severityFor(
  reachableUsd: number | null,
  unlimited: boolean,
  trust: SpenderProfile["trust"],
  proven: boolean,
): Verdict {
  const value = reachableUsd ?? 0;
  const risky = trust === "eoa" || trust === "unverified";
  if (proven && value >= 50 && (risky || unlimited)) return "breach";
  if (proven && value >= 1) return "watch";
  if (unlimited && risky) return "watch";
  return "clear";
}

/**
 * Deterministic health score. Starts at 100, subtracts calibrated penalties
 * per proven-reachable finding. Identical inputs always yield the identical
 * number. The model never touches it.
 */
function scoreOf(findings: ApprovalFinding[]): number {
  let score = 100;
  for (const f of findings) {
    if (!f.drainProven) continue;
    const v = f.reachableUsd ?? 0;
    const magnitude = Math.min(35, Math.log10(v + 1) * 12);
    const trustMult =
      f.spender.trust === "eoa"
        ? 1.4
        : f.spender.trust === "unverified"
          ? 1.2
          : f.spender.trust === "unknown"
            ? 1.0
            : 0.4;
    const unlimitedBump = f.unlimited ? 6 : 0;
    score -= magnitude * trustMult + unlimitedBump;
  }
  return Math.max(0, Math.round(score));
}

export interface SweepResult {
  owner: Address;
  block: bigint;
  findings: ApprovalFinding[];
  totalReachableUsd: number;
  healthScore: number;
  verdict: Verdict;
  dormant: number;
}

/** An approval as discovered in the browser, before any on-chain verification. */
export interface RawApproval {
  token: Address;
  spender: Address;
  txHash: Hex;
  blockNumber: bigint;
  timeStamp: number | null;
}

/**
 * The deterministic core. Takes the approvals discovered in the browser, then
 * measures reachable value, proves each drain on-chain, prices, and scores. Every
 * number the product reports is set here and nowhere else. Runs identically with
 * or without an LLM. Discovery is the browser's job, verification is the engine's.
 */
export async function sweepWallet(
  owner: Address,
  raw: RawApproval[],
  step: (s: Omit<TraceStep, "id" | "ms">) => void,
): Promise<SweepResult> {
  step({ actor: "engine", kind: "resolve", label: `Target ${owner}`, evidence: "Base mainnet" });

  const block = await baseClient.getBlockNumber();
  step({
    actor: "engine",
    kind: "read",
    label: `${raw.length} approval${raw.length === 1 ? "" : "s"} on record`,
    detail: raw.length ? "verifying each against the chain" : "wallet has no outstanding approvals",
  });

  // Phase 1: batch every allowance/balance/metadata read. viem coalesces these
  // into Multicall3 calls, so ~200 reads collapse into a handful of RPC roundtrips.
  const uniqueBalanceTokens = [...new Set(raw.map((r) => r.token.toLowerCase()))];
  const balancePromises = new Map<string, Promise<bigint>>();
  for (const t of uniqueBalanceTokens) {
    balancePromises.set(
      t,
      baseClient
        .readContract({ address: getAddress(t), abi: erc20Abi, functionName: "balanceOf", args: [owner] })
        .catch(() => 0n),
    );
  }

  const reads = await Promise.all(
    raw.map(async (r) => {
      const meta = tokenMeta(r.token);
      const [allowanceRaw, balanceRaw, decimals, symbol] = await Promise.all([
        baseClient
          .readContract({ address: r.token, abi: erc20Abi, functionName: "allowance", args: [owner, r.spender] })
          .catch(() => 0n),
        balancePromises.get(r.token.toLowerCase())!,
        meta?.decimals ??
          baseClient
            .readContract({ address: r.token, abi: erc20Abi, functionName: "decimals" })
            .catch(() => 18),
        meta?.symbol ??
          baseClient
            .readContract({ address: r.token, abi: erc20Abi, functionName: "symbol" })
            .catch(() => "UNKNOWN"),
      ]);
      return { r, allowanceRaw, balanceRaw, decimals: Number(decimals), symbol: symbol as string };
    }),
  );

  // keep only approvals that still have allowance and a balance behind them
  const live = reads.filter((x) => x.allowanceRaw > 0n && x.balanceRaw > 0n);
  const dormant = reads.filter((x) => x.allowanceRaw > 0n && x.balanceRaw === 0n).length;

  step({
    actor: "engine",
    kind: "read",
    label: `${live.length} approval${live.length === 1 ? "" : "s"} sit over a live balance`,
    detail: dormant ? `${dormant} more are approved but the balance is empty` : undefined,
  });

  // Phase 2: profile spenders and prove drains, in parallel, only for live ones.
  const findings: ApprovalFinding[] = [];
  const tokensToPrice = new Set<string>();

  await Promise.all(
    live.map(async ({ r, allowanceRaw, balanceRaw, decimals, symbol }) => {
      const reachableRaw = allowanceRaw < balanceRaw ? allowanceRaw : balanceRaw;
      const unlimited = allowanceRaw >= UNLIMITED_THRESHOLD || allowanceRaw === maxUint256;
      const [spender, drainProven] = await Promise.all([
        profileSpender(r.spender),
        proveDrain(r.token, owner, r.spender, reachableRaw),
      ]);

      step({
        actor: "engine",
        kind: "simulate",
        label: drainProven
          ? `Proven: ${formatUnits(reachableRaw, decimals)} ${symbol} is movable now`
          : `${symbol} approval is inert at this block`,
        detail: "eth_call transferFrom, spender as caller",
        evidence: drainProven ? "call succeeded" : "call reverted",
      });

      tokensToPrice.add(r.token.toLowerCase());
      findings.push({
        token: { address: r.token, symbol, decimals, priceUsd: null },
        spender,
        allowanceRaw,
        unlimited,
        balanceRaw,
        reachableRaw,
        reachableUsd: null,
        drainProven,
        approvalTxHash: r.txHash,
        approvedAt: r.timeStamp,
        severity: "clear",
      });
    }),
  );

  // price everything in one shot, then finalize reachable USD + severity
  const prices = await priceTokens([...tokensToPrice].map((a) => getAddress(a)));
  step({ actor: "engine", kind: "price", label: "Priced reachable balances", detail: "DefiLlama spot" });

  let totalReachableUsd = 0;
  for (const f of findings) {
    const price = prices.get(f.token.address.toLowerCase()) ?? null;
    f.token.priceUsd = price;
    if (price != null) {
      f.reachableUsd = Number(formatUnits(f.reachableRaw, f.token.decimals)) * price;
      totalReachableUsd += f.reachableUsd;
    }
    f.severity = severityFor(f.reachableUsd, f.unlimited, f.spender.trust, f.drainProven);
  }

  findings.sort((a, b) => (b.reachableUsd ?? 0) - (a.reachableUsd ?? 0));

  const healthScore = scoreOf(findings);
  const verdict: Verdict = healthScore < 55 ? "breach" : healthScore < 82 ? "watch" : "clear";

  step({
    actor: "engine",
    kind: "score",
    label: `Health ${healthScore}/100`,
    detail: `$${totalReachableUsd.toFixed(2)} reachable across ${findings.length} approval${findings.length === 1 ? "" : "s"}`,
  });

  return { owner, block, findings, totalReachableUsd, healthScore, verdict, dormant };
}

export async function scanWallet(
  input: string,
  approvals: RawApproval[],
  emit?: (step: TraceStep) => void,
): Promise<ScanResult> {
  const t0 = Date.now();
  const owner = getAddress(input.trim());
  const trace: TraceStep[] = [];
  let seq = 0;
  const step = (s: Omit<TraceStep, "id" | "ms">) => {
    const full: TraceStep = { ...s, id: `t${seq++}`, ms: Date.now() - t0 };
    trace.push(full);
    emit?.(full);
    return full;
  };

  const sweep = await sweepWallet(owner, approvals, step);

  // The model investigates the swept evidence with live on-chain tools and writes
  // the diagnosis. It cannot change a single number, the engine already set them.
  // With no provider key it falls back to the deterministic writer, result unchanged.
  const summary = await runAgent(sweep, step).catch(() =>
    deterministicSummary(sweep.findings, sweep.totalReachableUsd, sweep.verdict),
  );

  return {
    address: owner,
    scannedAt: Date.now(),
    blockNumber: sweep.block.toString(),
    healthScore: sweep.healthScore,
    verdict: sweep.verdict,
    totalReachableUsd: sweep.totalReachableUsd,
    approvals: sweep.findings,
    trace,
    summary,
  };
}

export function deterministicSummary(
  findings: ApprovalFinding[],
  totalUsd: number,
  verdict: Verdict,
): string {
  const proven = findings.filter((f) => f.drainProven);
  if (proven.length === 0) {
    return "No approval on this wallet can move funds right now. Either allowances are revoked or the balances behind them are empty. Nothing reachable at this block.";
  }
  const worst = proven[0];
  const worstLine = worst.reachableUsd
    ? `The largest is ${worst.token.symbol}: $${worst.reachableUsd.toFixed(2)} reachable through ${worst.spender.label ?? "an " + (worst.spender.trust === "eoa" ? "externally owned account" : "unlabeled contract")}.`
    : `The largest sits behind ${worst.spender.label ?? "an unlabeled spender"}.`;
  const verdictLine =
    verdict === "breach"
      ? "This wallet is exposed. Revoke the flagged approvals before you do anything else."
      : verdict === "watch"
        ? "There is live exposure worth clearing, though nothing catastrophic."
        : "Exposure is minor. Worth tidying, not urgent.";
  return `${proven.length} approval${proven.length === 1 ? "" : "s"} can move a combined $${totalUsd.toFixed(2)} from this wallet at the current block. ${worstLine} ${verdictLine}`;
}
