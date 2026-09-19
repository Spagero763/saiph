"use client";

import { useCallback, useRef, useState } from "react";
import type { ScanResult, TraceStep } from "@/lib/engine/types";

export type ScanState = "idle" | "running" | "done" | "error";

export function useScan() {
  const [state, setState] = useState<ScanState>("idle");
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("idle");
    setSteps([]);
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(async (address: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState("running");
    setSteps([]);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? "Scan failed. Try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) handleFrame(frame);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Connection lost.");
      setState("error");
    }

    function handleFrame(frame: string) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) return;
      if (event === "step") {
        setSteps((prev) => [...prev, JSON.parse(data) as TraceStep]);
      } else if (event === "result") {
        setResult(reviveResult(JSON.parse(data)));
        setState("done");
      } else if (event === "error") {
        try {
          setError(JSON.parse(data).message ?? "Scan failed.");
        } catch {
          setError("Scan failed.");
        }
        setState("error");
      }
    }
  }, []);

  return { state, steps, result, error, run, reset };
}

// raw token amounts crossed the wire as decimal strings; turn the ones the UI
// formats back into bigint so viem's formatUnits has what it expects.
function reviveResult(raw: unknown): ScanResult {
  const r = raw as ScanResult & {
    approvals: (Omit<ScanResult["approvals"][number], "allowanceRaw" | "balanceRaw" | "reachableRaw"> & {
      allowanceRaw: string | bigint;
      balanceRaw: string | bigint;
      reachableRaw: string | bigint;
    })[];
  };
  return {
    ...r,
    approvals: r.approvals.map((f) => ({
      ...f,
      allowanceRaw: BigInt(f.allowanceRaw),
      balanceRaw: BigInt(f.balanceRaw),
      reachableRaw: BigInt(f.reachableRaw),
    })),
  };
}
