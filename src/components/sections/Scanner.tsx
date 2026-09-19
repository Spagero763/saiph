"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { encodeFunctionData, isAddress } from "viem";
import { useScan } from "@/lib/useScan";
import { TraceConsole } from "@/components/console/TraceConsole";
import { VerdictDial } from "@/components/console/VerdictDial";
import { Findings } from "@/components/console/Findings";
import { erc20Abi } from "@/lib/engine/abi";
import { usd } from "@/lib/format";
import type { ApprovalFinding } from "@/lib/engine/types";

const DEMO = [
  { label: "jesse.base.eth", addr: "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9" },
  { label: "vitalik.eth", addr: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
];

const BASE_HEX = "0x2105";

export function Scanner() {
  const { state, steps, result, error, run, reset } = useScan();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);

  const submit = (addr?: string) => {
    const target = (addr ?? value).trim();
    if (!isAddress(target)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setRevokeMsg(null);
    if (addr) setValue(addr);
    run(target);
  };

  const revoke = async (f: ApprovalFinding) => {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [f.spender.address, 0n],
    });
    const eth = (globalThis as unknown as { ethereum?: EthereumProvider }).ethereum;
    if (eth?.request) {
      try {
        const chainId = (await eth.request({ method: "eth_chainId" })) as string;
        if (chainId !== BASE_HEX) {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_HEX }] });
        }
        const [from] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
        await eth.request({
          method: "eth_sendTransaction",
          params: [{ from, to: f.token.address, data }],
        });
        setRevokeMsg(`Revoke sent for ${f.token.symbol}. Re-scan to confirm.`);
      } catch {
        setRevokeMsg("Revoke cancelled or failed in wallet.");
      }
    } else {
      await navigator.clipboard?.writeText(
        JSON.stringify({ to: f.token.address, data }, null, 2),
      );
      setRevokeMsg(`No wallet detected. Revoke calldata for ${f.token.symbol} copied to clipboard.`);
    }
  };

  const busy = state === "running";
  const active = state !== "idle";

  return (
    <section id="scan" className="grain-console relative overflow-hidden scroll-mt-20 bg-graphite py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-solar">
            live · base mainnet
          </span>
          <h2 className="max-w-2xl font-display text-3xl text-graphite-text sm:text-4xl">
            Paste any Base address. Watch the agent prove what’s reachable.
          </h2>
        </div>

        {/* input */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-graphite-line bg-graphite-raised px-4 py-3 focus-within:border-solar/60">
            <span className="font-mono text-sm text-graphite-faint">0x</span>
            <input
              value={value.startsWith("0x") ? value.slice(2) : value}
              onChange={(e) => {
                setValue("0x" + e.target.value.replace(/^0x/, ""));
                setInvalid(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="wallet address to inspect"
              spellCheck={false}
              className="w-full bg-transparent font-mono text-sm text-graphite-text outline-none placeholder:text-graphite-faint/50"
            />
          </div>
          <button
            onClick={() => submit()}
            disabled={busy}
            className="rounded-lg bg-solar px-7 py-3 font-mono text-sm uppercase tracking-wider text-graphite transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {busy ? "Scanning…" : "Scan"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] text-graphite-faint">try:</span>
          {DEMO.map((d) => (
            <button
              key={d.addr}
              onClick={() => submit(d.addr)}
              disabled={busy}
              className="font-mono text-[11px] text-solar underline decoration-graphite-line underline-offset-4 hover:decoration-solar disabled:opacity-50"
            >
              {d.label}
            </button>
          ))}
          {invalid && <span className="font-mono text-[11px] text-breach">enter a valid 0x address</span>}
          {error && <span className="font-mono text-[11px] text-breach">{error}</span>}
        </div>

        {/* results */}
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
            >
              <div className="min-h-[22rem] lg:h-[26rem]">
                <TraceConsole steps={steps} running={busy} />
              </div>

              <div className="flex flex-col gap-6">
                {result && state === "done" ? (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-6 rounded-xl border border-graphite-line bg-graphite-raised p-6"
                  >
                    <VerdictDial score={result.healthScore} verdict={result.verdict} />
                    <div className="text-center">
                      <div className="tnum font-display text-3xl text-graphite-text">
                        {usd(result.totalReachableUsd)}
                      </div>
                      <div className="font-mono text-[11px] uppercase tracking-widest text-graphite-faint">
                        reachable right now
                      </div>
                      <div className="mt-3 font-mono text-[10px] uppercase tracking-widest text-graphite-faint/70">
                        checked {result.approvals.length} live · block{" "}
                        <span className="tnum">{Number(result.blockNumber).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-center text-sm leading-relaxed text-graphite-faint">
                      {result.summary}
                    </p>
                  </motion.div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-graphite-line bg-graphite-raised/40 p-6">
                    <p className="font-mono text-xs text-graphite-faint">
                      reading the chain…
                    </p>
                  </div>
                )}
              </div>

              {result && state === "done" && (
                <div className="lg:col-span-2">
                  {revokeMsg && (
                    <div className="mb-4 rounded-lg border border-solar/30 bg-solar/5 px-4 py-3 font-mono text-xs text-solar">
                      {revokeMsg}
                    </div>
                  )}
                  <Findings findings={result.approvals} onRevoke={revoke} />
                  <div className="mt-4 flex items-center justify-between">
                    <p className="font-mono text-[11px] text-graphite-faint">
                      block {result.blockNumber} · every figure traces to an on-chain call · not an audit, not financial advice
                    </p>
                    <button
                      onClick={() => {
                        reset();
                        setValue("");
                      }}
                      className="font-mono text-[11px] uppercase tracking-wider text-graphite-faint hover:text-graphite-text"
                    >
                      new scan
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}
