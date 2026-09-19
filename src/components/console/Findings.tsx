"use client";

import { motion } from "framer-motion";
import type { ApprovalFinding, Verdict } from "@/lib/engine/types";
import { usd, shortAddr, compactAmount } from "@/lib/format";
import { formatUnits } from "viem";
import { cn } from "@/lib/cn";

const DOT: Record<Verdict, string> = {
  breach: "bg-breach",
  watch: "bg-watch",
  clear: "bg-clear/60",
};

export function Findings({
  findings,
  onRevoke,
}: {
  findings: ApprovalFinding[];
  onRevoke: (f: ApprovalFinding) => void;
}) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-graphite-line bg-graphite-raised p-8 text-center">
        <p className="font-display text-lg text-graphite-text">Nothing reachable</p>
        <p className="mt-1 font-mono text-xs text-graphite-faint">
          No approval on this wallet can move funds at the current block.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-graphite-line bg-graphite-raised">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-graphite-line px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-graphite-faint">
        <span>Approval</span>
        <span className="text-right">Reachable now</span>
        <span />
      </div>
      {findings.map((f, i) => (
        <motion.div
          key={`${f.token.address}-${f.spender.address}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-graphite-line/60 px-5 py-4 last:border-0"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[f.severity])} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-graphite-text">{f.token.symbol}</span>
                {f.unlimited && (
                  <span className="rounded bg-breach/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-breach">
                    unlimited
                  </span>
                )}
                {f.drainProven && (
                  <span className="rounded bg-graphite px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-clear">
                    proven
                  </span>
                )}
              </div>
              <div className="truncate font-mono text-[11px] text-graphite-faint">
                → {f.spender.label ?? shortAddr(f.spender.address)}
                {f.spender.trust === "eoa" && " · plain wallet"}
                {f.spender.trust === "unverified" && " · unverified"}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="tnum font-mono text-sm text-graphite-text">{usd(f.reachableUsd)}</div>
            <div className="tnum font-mono text-[11px] text-graphite-faint">
              {compactAmount(formatUnits(f.reachableRaw, f.token.decimals))} {f.token.symbol}
            </div>
          </div>
          <button
            onClick={() => onRevoke(f)}
            disabled={f.severity === "clear"}
            className="rounded-md border border-graphite-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-graphite-text transition-colors hover:border-breach hover:text-breach disabled:cursor-not-allowed disabled:opacity-30"
          >
            Revoke
          </button>
        </motion.div>
      ))}
    </div>
  );
}
