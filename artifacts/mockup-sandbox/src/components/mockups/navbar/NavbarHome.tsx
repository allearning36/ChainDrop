export default function NavbarHome() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a0f", fontFamily: "monospace", color: "white" }}>

      {/* Navbar */}
      <nav style={{ background: "rgba(10,10,20,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
        className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}>C</div>
          <span className="font-bold text-sm tracking-widest uppercase text-white">ChainDrop</span>
        </div>
        <div className="flex items-center gap-1">
          {["Home","Leaderboard","Tools"].map(item => (
            <button key={item} className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
              style={{ color: item === "Home" ? "#a78bfa" : "rgba(255,255,255,0.4)", background: item === "Home" ? "rgba(99,102,241,0.12)" : "transparent" }}>
              {item}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa" }}>
          <span>🔗</span> Connect
        </button>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center pt-10 pb-6 px-4 text-center gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-1"
          style={{ background: "rgba(99,102,241,0.12)", color: "#a78bfa", border: "1px solid rgba(99,102,241,0.2)" }}>
          Multi-Chain Testnet Faucet
        </div>
        <h1 className="text-2xl font-black tracking-tight">Get Free<br /><span style={{ color: "#a78bfa" }}>Testnet Tokens</span></h1>
        <p className="text-[11px] text-gray-400 max-w-xs">Claim ETH, BNB, and more for smart contract development. No sign-up needed.</p>
      </div>

      {/* Chain cards */}
      <div className="px-4 space-y-2 flex-1 pb-6">
        {[
          { name: "Ethereum Sepolia", sym: "ETH", amount: "0.05", cool: "24h", color: "#627eea", enabled: true },
          { name: "BNB Testnet", sym: "BNB", amount: "0.1", cool: "24h", color: "#f0b90b", enabled: true },
          { name: "Polygon Mumbai", sym: "MATIC", amount: "0.5", cool: "12h", color: "#8247e5", enabled: false },
        ].map(c => (
          <div key={c.sym} className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: c.color + "22", color: c.color }}>{c.sym.slice(0,2)}</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{c.name}</p>
              <p className="text-[10px] text-gray-400">{c.amount} {c.sym} · {c.cool} cooldown</p>
            </div>
            <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase shrink-0"
              style={{ background: c.enabled ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)", color: c.enabled ? "#a78bfa" : "rgba(255,255,255,0.25)" }}>
              {c.enabled ? "Claim" : "Soon"}
            </button>
          </div>
        ))}
      </div>

      {/* Bottom nav hint */}
      <div className="px-4 pb-4">
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2 text-[11px]"
          style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", color: "rgba(255,255,255,0.5)" }}>
          <span>👆</span>
          <span>Connect wallet to see your claim history & referral link</span>
        </div>
      </div>
    </div>
  );
}
