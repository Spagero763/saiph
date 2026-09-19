"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TraceStep } from "@/lib/engine/types";
import { cn } from "@/lib/cn";

const KIND_COLOR: Record<TraceStep["kind"], string> = {
  resolve: "text-graphite-faint",
  read: "text-clear",
  decide: "text-solar",
  simulate: "text-breach",
  price: "text-graphite-faint",
  score: "text-solar",
  narrate: "text-graphite-faint",
};

export function TraceConsole({
  steps,
  running,
}: {
  steps: TraceStep[];
  running: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-graphite-line bg-graphite">
      <div className="flex items-center justify-between border-b border-graphite-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-breach/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-watch/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-clear/80" />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-graphite-faint">
          agent trace · base mainnet
        </span>
      </div>

      <div className="console-scroll flex-1 space-y-1 overflow-y-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed">
        <AnimatePresence initial={false}>
          {steps.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="flex gap-3"
            >
              <span className="shrink-0 text-graphite-faint/60">
                {String(s.ms ?? 0).padStart(5, " ")}ms
              </span>
              <span className={cn("shrink-0", s.actor === "model" ? "text-solar" : "text-graphite-faint")}>
                {s.actor === "model" ? "◆" : "●"}
              </span>
              <span className="min-w-0">
                <span className={cn(KIND_COLOR[s.kind])}>{s.label}</span>
                {s.detail && <span className="text-graphite-faint"> · {s.detail}</span>}
                {s.evidence && (
                  <span className="ml-2 rounded border border-graphite-line px-1.5 py-0.5 text-[10px] text-graphite-faint">
                    {s.evidence}
                  </span>
                )}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {running && (
          <div className="flex gap-3 text-graphite-faint">
            <span className="shrink-0 opacity-0">00000ms</span>
            <span className="caret text-solar">▍</span>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
