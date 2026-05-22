export default function LeaderboardPage() {
  const leaders = [
    { rank: 1, addr: "0x3fA1...c8dE", claims: 142, eth: "7.10", badge: "🥇" },
    { rank: 2, addr: "0xBc22...91aF", claims: 118, eth: "5.90", badge: "🥈" },
    { rank: 3, addr: "0x71dD...02c1", claims: 97, eth: "4.85", badge: "🥉" },
    { rank: 4, addr: "0x6fbC...Fe8F", claims: 47, eth: "2.35", badge: "4" },
    { rank: 5, addr: "0xA3e9...7b12", claims: 39, eth: "1.95", badge: "5" },
    { rank: 6, addr: "0x12Cd...8E3f", claims: 31, eth: "1.55", badge: "6" },
    { rank: 7, addr: "0xF7a0...4c9B", claims: 28, eth: "1.40", badge: "7" },
  ];

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
        <div className="flex gap-1">
          {["Home","Leaderboard","Tools"].map(item => (
            <button key={item} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
              style={{ color: item === "Leaderboard" ? "#a78bfa" : "rgba(255,255,255,0.4)", background: item === "Leaderboard" ? "rgba(99,102,241,0.12)" : "transparent" }}>
              {item}
            </button>
          ))}
        </div>
      </nav>

      <div className="px-4 py-5 space-y-4">

        {/* Header */}
        <div className="text-center space-y-1">
          <p className="text-2xl">🏆</p>
          <h1 className="text-xl font-black uppercase tracking-tight">Leaderboard</h1>
          <p className="text-[11px] text-gray-400">Top claimers this week across all chains</p>
        </div>

        {/* Period tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          {["This Week", "This Month", "All Time"].map((t, i) => (
            <button key={t} className="flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
              style={{ background: i === 0 ? "rgba(99,102,241,0.2)" : "transparent", color: i === 0 ? "#a78bfa" : "rgba(255,255,255,0.35)" }}>
              {t}
            </button>
          ))}
        </div>

        {/* You highlight */}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <span className="text-lg">📍</span>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400">Your rank</p>
            <p className="font-bold text-sm" style={{ color: "#a78bfa" }}>#4 — 0x6fbC...Fe8F</p>
          </div>
          <div className="text-right">
            <p className="font-black text-sm">47 claims</p>
            <p className="text-[10px] text-green-400">2.35 ETH</p>
          </div>
        </div>

        {/* List */}
        <div className="space-y-1.5">
          {leaders.map(u => {
            const isMe = u.rank === 4;
            const isTop3 = u.rank <= 3;
            return (
              <div key={u.rank} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{
                  background: isMe ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isMe ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)"}`,
                }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                  style={{ background: isTop3 ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.06)" }}>
                  {isTop3 ? u.badge : <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>{u.badge}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: isMe ? "#a78bfa" : "white" }}>{u.addr}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="h-1 rounded-full" style={{ width: `${(u.claims / 142) * 80}px`, background: isTop3 ? "rgba(250,204,21,0.5)" : "rgba(99,102,241,0.4)" }} />
                    <span className="text-[9px] text-gray-500">{u.claims} claims</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black" style={{ color: "#22c55e" }}>{u.eth} ETH</p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-gray-500">Updates every 10 minutes · Wallet address is your identity</p>
      </div>
    </div>
  );
}
