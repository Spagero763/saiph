/**
 * Captures the committed demo-wallet snapshot. Run with the wallets to freeze:
 *   npx tsx scripts/snapshot.ts 0xabc... 0xdef...
 * Writes src/lib/engine/demo-snapshot.ts. Discovery is live, so run it when the
 * indexer is healthy; the result is a discovery list only, verified live at scan.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverApprovals } from "../src/lib/engine/discover-server";

async function main() {
  const wallets = process.argv.slice(2);
  if (wallets.length === 0) {
    console.error("usage: tsx scripts/snapshot.ts <address> [address...]");
    process.exit(1);
  }

  const snapshot: Record<string, unknown> = {};
  for (const w of wallets) {
    process.stdout.write(`discovering ${w} ... `);
    const rows = await discoverApprovals(w);
    snapshot[w.toLowerCase()] = rows;
    console.log(`${rows.length} approvals`);
  }

  const body =
    `import type { WireApproval } from "./discover-server";\n\n` +
    `/**\n` +
    ` * Committed discovery snapshot for the wallets shown on the landing page. These\n` +
    ` * resolve without touching the live indexer, so they stay fast and dependable\n` +
    ` * regardless of the explorer's uptime or tier. This is only the discovery list;\n` +
    ` * allowances, balances, drain reachability and prices are all re-read live on\n` +
    ` * the current block at scan time, so a snapshot can never show a stale figure,\n` +
    ` * only a stale set of which approvals exist.\n` +
    ` *\n` +
    ` * Keyed by lowercase owner address. Regenerate with scripts/snapshot.ts.\n` +
    ` */\n` +
    `export const DEMO_SNAPSHOT: Record<string, WireApproval[]> = ${JSON.stringify(snapshot, null, 2)};\n`;

  const out = join(process.cwd(), "src/lib/engine/demo-snapshot.ts");
  writeFileSync(out, body);
  console.log(`\nwrote ${out}`);
}

main().catch((e) => {
  console.error("SNAPSHOT FAILED:", e);
  process.exit(1);
});
