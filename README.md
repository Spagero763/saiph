# Saiph

A wallet exposure scanner for Base. Paste an address and Saiph reads its live token
approvals, then proves on-chain exactly how much a spender could move right now.

It does not guess. Every figure it reports comes from a real on-chain call.

## What it does

A token approval is a standing permission for some contract to move your tokens.
Most wallets accumulate dozens of them and forget. An approval only matters when
three things are true at once: the allowance is still live, there is a balance
behind it, and the spender can actually pull the funds. Saiph checks all three.

For a given wallet it:

1. Reads the full `Approval` history from Base logs and keeps the latest allowance
   per token and spender.
2. Measures what is actually reachable: `min(allowance, balance)` per approval,
   dropping anything with no allowance or an empty balance.
3. Proves the drain. For each live approval it simulates
   `transferFrom(owner, attacker, reachable)` with the spender as `msg.sender` via
   `eth_call`. If the call does not revert, the drain is reachable at this block.
   This is a proof, not a heuristic.
4. Prices the reachable balances and scores the wallet 0 to 100.

## The engine proves, the model interprets

The number is never the model's to invent. A deterministic engine discovers the
approvals, proves each drain on-chain, prices them, and sets the health score and
verdict. That path runs identically whether or not a language model is configured.

On top of it, an analyst runs as a real tool-calling agent. Its tools are live
on-chain lookups, not restatements of cached data: list the exposure, inspect a
spender's bytecode, re-prove a specific drain, pull a token's spot price. It
chooses which approvals to investigate, iterates, and writes the diagnosis
grounded only in what the tools returned. It is barred from producing any figure,
and it is bound to the scanned wallet by construction: it passes an index into the
findings, never a raw address, so it can never point a drain proof at someone else.

If no model key is present the scan is fully deterministic and the diagnosis is
written by the engine. The verdict is identical either way.

## Running it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

Configuration is optional and lives only on the server. Copy `.env.example` to
`.env.local`:

- `OPENAI_API_KEY` or `GROQ_API_KEY` turns on the analyst agent. Without either,
  the engine writes the diagnosis.
- `ETHERSCAN_API_KEY` (one V2 key covers every chain) gives approval-history reads
  a higher rate budget. Without it, discovery falls back to a keyless indexer.
- `BASESCAN_API_KEY` adds source-verification lookups when profiling spenders.
- `BASE_RPC_URL` points contract reads and drain proofs at a private RPC.

## Stack

Next.js, viem, and a Server-Sent Events stream so the investigation is watched as
it happens rather than appearing as a finished block of text. On-chain reads are
batched through Multicall so a wallet with dozens of approvals resolves in seconds.

Saiph is a star in Orion. This is named for it.

## Not an audit

Saiph reports what is reachable at a block. It is not a security audit and not
financial advice. Revoking an approval it flags is a transaction you sign yourself.
