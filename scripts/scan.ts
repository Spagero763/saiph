import { scanWallet } from "../src/lib/engine/scanner";
import { discoverApprovals } from "../src/lib/engine/discover-server";
import { getAddress, type Address, type Hex } from "viem";

const addr = process.argv[2] || "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9";

async function main() {
  // mirror the server: discover first, then hand approvals to the engine
  const wire = await discoverApprovals(addr);
  const approvals = wire.map((w) => ({
    token: getAddress(w.token) as Address,
    spender: getAddress(w.spender) as Address,
    txHash: w.txHash as Hex,
    blockNumber: BigInt(w.blockNumber),
    timeStamp: w.timeStamp,
  }));

  const result = await scanWallet(addr, approvals, (step) => {
    const tag = step.actor === "model" ? "◆ model" : "● engine";
    console.log(`[${String(step.ms).padStart(5)}ms] ${tag}  ${step.label}${step.detail ? `  · ${step.detail}` : ""}`);
  });

  console.log("\n================ RESULT ================");
  console.log("verdict:", result.verdict, "| health:", result.healthScore);
  console.log("reachable USD:", result.totalReachableUsd.toFixed(2));
  console.log("approvals kept:", result.approvals.length);
  console.log("\nTOP FINDINGS:");
  for (const f of result.approvals.slice(0, 8)) {
    console.log(
      `  ${f.severity.toUpperCase().padEnd(6)} ${f.token.symbol.padEnd(8)} $${(f.reachableUsd ?? 0).toFixed(2).padStart(10)}  ${f.unlimited ? "∞" : " "}  ${f.spender.label ?? f.spender.trust}  proven=${f.drainProven}`,
    );
  }
  console.log("\nSUMMARY:\n", result.summary);
}

main().catch((e) => {
  console.error("SCAN FAILED:", e);
  process.exit(1);
});
