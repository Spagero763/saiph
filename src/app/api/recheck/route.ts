import { type Address, getAddress, isAddress } from "viem";
import { baseClient } from "@/lib/engine/client";
import { erc20Abi } from "@/lib/engine/abi";
import { proveDrain } from "@/lib/engine/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Re-proves a single approval against the current block after the owner revokes
 * it. Reads the live allowance and balance, then runs the same transferFrom
 * simulation the scan used. This is what closes the loop: the UI can show the
 * exposure is gone with the same proof that showed it was there.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Malformed request." }, { status: 400 });
  }

  const { owner, token, spender } = (body ?? {}) as {
    owner?: unknown;
    token?: unknown;
    spender?: unknown;
  };
  if (
    typeof owner !== "string" || !isAddress(owner) ||
    typeof token !== "string" || !isAddress(token) ||
    typeof spender !== "string" || !isAddress(spender)
  ) {
    return Response.json({ error: "Bad address." }, { status: 400 });
  }

  const o = getAddress(owner) as Address;
  const t = getAddress(token) as Address;
  const s = getAddress(spender) as Address;

  try {
    const [allowance, balance, block] = await Promise.all([
      baseClient.readContract({ address: t, abi: erc20Abi, functionName: "allowance", args: [o, s] }),
      baseClient.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [o] }),
      baseClient.getBlockNumber(),
    ]);
    const reachable = allowance < balance ? allowance : balance;
    const stillReachable = reachable > 0n && (await proveDrain(t, o, s, reachable));

    return Response.json({
      allowanceRaw: allowance.toString(),
      reachableRaw: reachable.toString(),
      stillReachable,
      blockNumber: block.toString(),
    });
  } catch {
    return Response.json({ error: "Could not re-read the chain." }, { status: 502 });
  }
}
