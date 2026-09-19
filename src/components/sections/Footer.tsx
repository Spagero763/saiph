export function Footer() {
  return (
    <footer className="border-t border-graphite-line bg-graphite py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-display text-2xl text-graphite-text">Saiph</div>
          <p className="mt-2 max-w-sm font-mono text-[11px] leading-relaxed text-graphite-faint">
            A wallet security agent for Base. It reads live approvals, proves the drain
            on-chain, and hands back signable revoke routes. Built on the principle that a
            security tool should never ask you to trust its arithmetic.
          </p>
        </div>
        <div className="flex flex-col gap-2 font-mono text-[11px] text-graphite-faint">
          <a href="#scan" className="hover:text-solar">Scan a wallet</a>
          <a href="#how" className="hover:text-solar">The method</a>
          <a href="/api/x402/info" className="hover:text-solar">x402 endpoint</a>
        </div>
      </div>
    </footer>
  );
}
