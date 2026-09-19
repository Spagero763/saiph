"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";

const LEAD =
  "Most agents hand you a number and ask you to trust it. Saiph never produces the number itself. It reasons about where the risk is, then makes the chain settle the amount, in the open, one call at a time.";

function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  // off-state is 0.15, never 0, so the sentence keeps its shape before it lights up
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {children}&nbsp;
    </motion.span>
  );
}

function ScrollReveal({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "start 0.35"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => {
        const start = i / words.length;
        const end = start + 1 / words.length;
        return (
          <Word key={i} progress={scrollYProgress} range={[start, end]}>
            {w}
          </Word>
        );
      })}
    </p>
  );
}

const STEPS = [
  {
    n: "01",
    t: "Read, don’t assume",
    b: "Every Approval this wallet ever signed is pulled straight from Base logs, latest state per spender. No cached list, no guesswork.",
    who: "engine",
  },
  {
    n: "02",
    t: "The model decides where to look",
    b: "It picks the approvals that sit over a live balance, flags spenders that are plain wallets or unverified, and skips the ones that can’t touch anything.",
    who: "model",
  },
  {
    n: "03",
    t: "The chain proves the number",
    b: "For each candidate it simulates the actual transferFrom drain with the spender as caller. If the call doesn’t revert, that value is reachable at this block. Provable, not asserted.",
    who: "engine",
  },
  {
    n: "04",
    t: "One deterministic score",
    b: "Reachable value, spender trust and unlimited flags fold into a 0–100 health number the model never touches. Same wallet, same block, same score, every time.",
    who: "engine",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="grain scroll-mt-20 bg-paper py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-solar-deep">
            the method
          </span>
          <h2 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
            The model proposes.
            <br />
            <span className="italic text-solar-deep">The chain proves.</span>
          </h2>
          <ScrollReveal text={LEAD} className="mt-6 text-lg leading-relaxed text-ink" />
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              className="bg-paper-raised p-8"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl text-solar-deep">{s.n}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                  {s.who === "model" ? "◆ model" : "● engine"}
                </span>
              </div>
              <h3 className="mt-5 font-display text-xl text-ink">{s.t}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{s.b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
