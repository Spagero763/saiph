"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { Verdict } from "@/lib/engine/types";

const COLOR: Record<Verdict, string> = {
  breach: "var(--breach)",
  watch: "var(--watch)",
  clear: "var(--clear)",
};
const LABEL: Record<Verdict, string> = {
  breach: "Exposed",
  watch: "Worth clearing",
  clear: "Clean",
};

export function VerdictDial({
  score,
  verdict,
}: {
  score: number;
  verdict: Verdict;
}) {
  const progress = useMotionValue(0);
  const display = useTransform(progress, (v) => Math.round(v));
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = useTransform(progress, (v) => `${(v / 100) * C} ${C}`);

  useEffect(() => {
    // overdamped: the score decelerates hard into its value and never overshoots.
    // a bouncing number reads as decoration; a settling one reads as measured.
    const controls = animate(progress, score, { type: "spring", stiffness: 90, damping: 30 });
    return controls.stop;
  }, [score, progress]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--graphite-line)" strokeWidth="6" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={COLOR[verdict]}
            strokeWidth="6"
            strokeLinecap="round"
            style={{ strokeDasharray: dash }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span className="tnum font-display text-5xl font-semibold text-graphite-text">
            {display}
          </motion.span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-graphite-faint">
            health
          </span>
        </div>
      </div>
      <span
        className="mt-4 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-widest"
        style={{ color: COLOR[verdict], border: `1px solid ${COLOR[verdict]}55` }}
      >
        {LABEL[verdict]}
      </span>
    </div>
  );
}
