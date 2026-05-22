export default function ProfilePage() {
  const addr = "0x6fbC46bcb327da1De9acEB31b2c7Fe8F";
  const short = addr.slice(0, 6) + "..." + addr.slice(-4);

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", fontFamily: "monospace", color: "white" }}>

      {/* Navbar */}
      <nav style={{ background: "rgba(10,10,20,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}>C</div>
          <span className="font-bold text-sm tracking-widest uppercase">ChainDrop</span>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold"
          style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa" }}>
          {short}
        </button>
      </nav>

      <div className="px-4 py-5 space-y-4">

        {/* Profile header */}
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.1),rgba(167,139,250,0.06))", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0"
            style={{ background: "linear-gradient(135deg,#6366f1,#a78bfa)" }}>
            {addr.slice(2, 4).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{short}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Member since May 2026</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(250,204,21,0.12)", color: "#facc15" }}>🏆 Top Claimer</span>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>✓ Verified</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total Claims", value: "47", icon: "💧" },
            { label: "ETH Received", value: "2.35", icon: "⚡" },
            { label: "Referrals", value: "8", icon: "👥" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-lg">{s.icon}</p>
              <p className="font-black text-base" style={{ color: "#a78bfa" }}>{s.value}</p>
              <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Referral */}
        <div className="rounded-xl p-3 space-y-2"
          style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Your Referral Link</p>
          <div className="flex gap-2 items-center">
            <div className="flex-1 rounded-lg px-3 py-2 text-[10px] font-mono truncate"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
              chain-drop.replit.app/?ref=0x6fbC...
            </div>
            <button className="px-3 py-2 rounded-lg text-[10px] font-bold shrink-0"
              style={{ background: "rgba(99,102,241,0.2)", color: "#a78bfa" }}>Copy</button>
          </div>
          <p className="text-[10px] text-gray-400">Refer a friend → you both get +10% claim bonus</p>
        </div>

        {/* Claim history */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Recent Claims</p>
          <div className="space-y-1.5">
            {[
              { chain: "ETH Sepolia", amount: "0.05 ETH", time: "2h ago", tx: "0xabc..." },
              { chain: "BNB Testnet", amount: "0.10 BNB", time: "1d ago", tx: "0xdef..." },
              { chain: "ETH Sepolia", amount: "0.05 ETH", time: "2d ago", tx: "0x123..." },
            ].map((c, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: "rgba(99,102,241,0.15)" }}>⛓</div>
                <div className="flex-1">
                  <p className="text-xs font-bold">{c.chain}</p>
                  <p className="text-[9px] text-gray-400">{c.tx} · {c.time}</p>
                </div>
                <span className="text-[11px] font-bold" style={{ color: "#22c55e" }}>+{c.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
