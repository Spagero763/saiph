"use client";

import type { ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

const ease = [0.16, 1, 0.3, 1] as const;

function MagneticCta({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // low mass so the button chases the cursor without lag; damping keeps it from wobbling on release
  const sx = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
  const sy = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

  return (
    <motion.a
      href={href}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.35);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.35);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      className={className}
    >
      {children}
    </motion.a>
  );
}

export function Hero() {
  return (
    <section className="grain relative overflow-hidden bg-paper">
      {/* faint constellation line-work */}
      <ConstellationField />

      <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-32 sm:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease }}
          className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-faint"
        >
          <span className="h-px w-8 bg-ink-faint/50" />
          Saiph · wallet security agent · Base
        </motion.div>

        <h1 className="mt-8 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight text-ink sm:text-7xl">
          {["It doesn’t guess", "what you’re exposed to.", ""].map((line, i) =>
            line === "" ? (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.12 }}
                className="block italic text-solar-deep"
              >
                It proves it.
              </motion.span>
            ) : (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.12 }}
                className="block"
              >
                {line}
              </motion.span>
            ),
          )}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.5 }}
          className="mt-8 max-w-xl text-lg leading-relaxed text-ink-soft"
        >
          Saiph reads a Base wallet’s live token approvals, then simulates the drain
          on-chain to show exactly how much a spender could take right now. The model
          decides where to look. The chain settles the number.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease, delay: 0.65 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <MagneticCta
            href="#scan"
            className="group relative inline-block overflow-hidden rounded-lg bg-ink px-7 py-3.5 font-mono text-sm uppercase tracking-wider text-paper"
          >
            Scan a wallet
          </MagneticCta>
          <a
            href="#how"
            className="font-mono text-sm uppercase tracking-wider text-ink-soft underline decoration-hairline underline-offset-4 transition-colors hover:text-ink"
          >
            How it proves it
          </a>
        </motion.div>

        {/* proof strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-20 grid max-w-3xl grid-cols-3 gap-px overflow-hidden rounded-xl border border-hairline bg-hairline"
        >
          {[
            { k: "read", v: "live approvals", d: "from Base logs" },
            { k: "prove", v: "eth_call drain", d: "no revert, reachable" },
            { k: "score", v: "0–100 health", d: "deterministic" },
          ].map((c) => (
            <div key={c.k} className="bg-paper-raised px-5 py-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-solar-deep">
                {c.k}
              </div>
              <div className="mt-2 font-display text-lg text-ink">{c.v}</div>
              <div className="font-mono text-[11px] text-ink-faint">{c.d}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function ConstellationField() {
  // Saiph is a star in Orion, a quiet constellation motif, not decoration for its own sake
  const stars = [
    [12, 22], [22, 38], [30, 18], [44, 30], [58, 14],
    [66, 40], [78, 26], [86, 52], [40, 60], [20, 70],
  ];
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <motion.polyline
        points="12,22 22,38 30,18 44,30 58,14 66,40 78,26 86,52"
        fill="none"
        stroke="var(--solar)"
        strokeWidth="0.12"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.4 }}
        transition={{ duration: 2.4, ease: "easeInOut", delay: 0.4 }}
      />
      {stars.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r="0.35"
          fill="var(--solar-deep)"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 0.8, 0.5], scale: 1 }}
          transition={{ duration: 1.2, delay: 0.6 + i * 0.08 }}
        />
      ))}
    </svg>
  );
}
