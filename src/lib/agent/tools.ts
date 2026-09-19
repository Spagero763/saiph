import { formatUnits, getAddress } from "viem";
import { baseClient } from "../engine/client";
import { profileSpender, proveDrain } from "../engine/scanner";
import { priceTokens } from "../engine/pricing";
import type { SweepResult } from "../engine/scanner";
import type { TraceStep } from "../engine/types";
import type { ToolSchema } from "./provider";

/**
 * The agent's tools are live on-chain lookups, not echoes of cached state. The
 * model passes an index into the swept findings, never a raw address, so it can
 * never redirect a drain proof at an arbitrary owner. The target is bound by
 * construction. Every value a tool returns comes from a real RPC round-trip.
 */
export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "list_exposure",
      description:
        "List the wallet's live approvals the engine already found, each with an index, token, spender, reachable USD, and whether a drain was proven. Start here to see the lay of the land.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_spender",
      description:
        "Look up the spender contract behind one approval live on-chain: is it a known router, an unverified contract, or a plain wallet (EOA) holding an approval. Pass the finding index from list_exposure.",
      parameters: {
        type: "object",
        properties: { index: { type: "integer", description: "index from list_exposure" } },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verify_drain",
      description:
        "Prove whether the spender can move the funds right now by simulating transferFrom with the spender as caller (eth_call). Returns whether the call succeeds and how much is reachable. Pass the finding index.",
      parameters: {
        type: "object",
        properties: { index: { type: "integer", description: "index from list_exposure" } },
        required: ["index"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "token_price",
      description:
        "Fetch the live spot price of the token behind one approval and the current USD value of what is reachable. Pass the finding index.",
      parameters: {
        type: "object",
        properties: { index: { type: "integer", description: "index from list_exposure" } },
        required: ["index"],
      },
    },
  },
];

type Emit = (s: Omit<TraceStep, "id" | "ms">) => void;

function pick(sweep: SweepResult, args: Record<string, unknown>) {
  const index = Number(args?.index);
  if (!Number.isInteger(index) || index < 0 || index >= sweep.findings.length) {
    return { error: `index must be between 0 and ${sweep.findings.length - 1}` } as const;
  }
  return { finding: sweep.findings[index], index } as const;
}

export async function runTool(
  name: string,
  rawArgs: string,
  sweep: SweepResult,
  emit: Emit,
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { error: "arguments were not valid JSON" };
  }

  switch (name) {
    case "list_exposure": {
      emit({ actor: "model", kind: "decide", label: "Listing the wallet's live exposure" });
      return {
        wallet: sweep.owner,
        approvals: sweep.findings.map((f, i) => ({
          index: i,
          token: f.token.symbol,
          spender: f.spender.label ?? shorten(f.spender.address),
          reachableUsd: f.reachableUsd,
          unlimited: f.unlimited,
          drainProven: f.drainProven,
        })),
      };
    }

    case "inspect_spender": {
      const p = pick(sweep, args);
      if ("error" in p) return p;
      const { finding } = p;
      emit({
        actor: "model",
        kind: "decide",
        label: `Inspecting ${finding.token.symbol} spender`,
        detail: shorten(finding.spender.address),
      });
      const profile = await profileSpender(finding.spender.address);
      emit({
        actor: "engine",
        kind: "read",
        label:
          profile.trust === "eoa"
            ? "Spender is a plain wallet, not a contract"
            : profile.trust === "known"
              ? `Spender is ${profile.label}`
              : profile.trust === "unverified"
                ? "Spender source is not verified on Basescan"
                : "Spender is an unlabeled contract",
        detail: "eth_getCode",
      });
      return {
        spender: profile.address,
        label: `[untrusted external label] ${profile.label ?? "none"}`,
        trust: profile.trust,
        isContract: !profile.isEoa,
        sourceVerified: profile.verified,
      };
    }

    case "verify_drain": {
      const p = pick(sweep, args);
      if ("error" in p) return p;
      const { finding } = p;
      emit({
        actor: "model",
        kind: "decide",
        label: `Re-proving the ${finding.token.symbol} drain on-chain`,
      });
      const proven = await proveDrain(
        finding.token.address,
        sweep.owner,
        finding.spender.address,
        finding.reachableRaw,
      );
      const amount = formatUnits(finding.reachableRaw, finding.token.decimals);
      emit({
        actor: "engine",
        kind: "simulate",
        label: proven
          ? `Confirmed: ${amount} ${finding.token.symbol} is movable now`
          : `${finding.token.symbol} approval reverts, nothing movable`,
        detail: "eth_call transferFrom, spender as caller",
        evidence: proven ? "call succeeded" : "call reverted",
      });
      return { token: finding.token.symbol, drainProven: proven, reachableAmount: amount };
    }

    case "token_price": {
      const p = pick(sweep, args);
      if ("error" in p) return p;
      const { finding } = p;
      emit({
        actor: "model",
        kind: "decide",
        label: `Pricing reachable ${finding.token.symbol}`,
      });
      const prices = await priceTokens([getAddress(finding.token.address)]);
      const price = prices.get(finding.token.address.toLowerCase()) ?? null;
      const reachableUsd =
        price != null
          ? Number(formatUnits(finding.reachableRaw, finding.token.decimals)) * price
          : null;
      emit({ actor: "engine", kind: "price", label: `${finding.token.symbol} priced`, detail: "DefiLlama spot" });
      return { token: finding.token.symbol, priceUsd: price, reachableUsd };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
