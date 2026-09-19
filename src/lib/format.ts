export function usd(n: number | null | undefined): string {
  if (n == null) return "·";
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function compactAmount(s: string): string {
  const n = Number(s);
  if (!isFinite(n)) return s;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 0.0001) return n.toExponential(1);
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
