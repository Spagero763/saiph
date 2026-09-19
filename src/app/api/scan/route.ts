import { type Address, type Hex, getAddress, isAddress } from "viem";
import { scanWallet, type RawApproval } from "@/lib/engine/scanner";
import { discoverApprovals, DiscoveryError, type WireApproval } from "@/lib/engine/discover-server";
import type { TraceStep } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The whole scan runs here: discover the wallet's live approvals (held-key
 * Blockscout with block-cursor paging, or a committed snapshot for demo
 * wallets), then verify each one against the chain, prove the drains, price,
 * score, and let the agent investigate. It streams back as Server-Sent Events
 * so the console replays the work live instead of showing a spinner.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const { address } = (body ?? {}) as { address?: unknown };
  if (typeof address !== "string" || !isAddress(address)) {
    return Response.json({ error: "Enter a valid Base address (0x…)." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let seq = 0;
      const send = (event: string, data: unknown) => {
        // findings carry raw token amounts as bigint; JSON can't serialize those,
        // so emit them as decimal strings and the client revives the ones it needs.
        const json = JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v));
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${json}\n\n`));
      };
      const step = (label: string, detail?: string) =>
        send("step", { id: `d${seq++}`, actor: "engine", kind: "read", label, detail, ms: 0 } satisfies TraceStep);

      try {
        step("Reading approval history from Base", "held-key indexer");
        const wire = await discoverApprovals(address);
        const clean = sanitize(wire);
        step(
          `${clean.length} approval${clean.length === 1 ? "" : "s"} on record`,
          "handing off to the engine",
        );

        const result = await scanWallet(address, clean, (s: TraceStep) => send("step", s));
        send("result", result);
      } catch (err) {
        send("error", {
          message:
            err instanceof DiscoveryError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Scan failed. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Normalize discovered rows to the engine's types, dropping anything malformed. */
function sanitize(rows: WireApproval[]): RawApproval[] {
  const out: RawApproval[] = [];
  for (const r of rows) {
    if (!isAddress(r.token) || !isAddress(r.spender)) continue;
    let blockNumber: bigint;
    try {
      blockNumber = BigInt(String(r.blockNumber ?? "0"));
    } catch {
      continue;
    }
    out.push({
      token: getAddress(r.token) as Address,
      spender: getAddress(r.spender) as Address,
      txHash: (typeof r.txHash === "string" ? r.txHash : "0x") as Hex,
      blockNumber,
      timeStamp: typeof r.timeStamp === "number" ? r.timeStamp : null,
    });
  }
  return out;
}
