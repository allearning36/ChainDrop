import { useState } from "react";
import { Twitter, MessageCircle, Send, Globe, CheckCircle2, ChevronRight, ArrowLeft, ExternalLink, Zap, Users, Clock, Gift } from "lucide-react";

type TaskType = "twitter_follow" | "discord" | "telegram" | "visit" | "retweet";

interface Task {
  id: number;
  type: TaskType;
  label: string;
  url: string;
  done: boolean;
}

interface Campaign {
  id: number;
  projectName: string;
  projectLogo: string;
  chainName: string;
  chainSymbol: string;
  rewardAmount: string;
  totalSlots: number;
  claimedSlots: number;
  expiresIn: string;
  tasks: Task[];
  color: string;
}

const CAMPAIGNS: Campaign[] = [
  {
    id: 1,
    projectName: "OnChainGM",
    projectLogo: "GM",
    chainName: "Base",
    chainSymbol: "ETH",
    rewardAmount: "0.01",
    totalSlots: 500,
    claimedSlots: 312,
    expiresIn: "3 days",
    color: "59,130,246",
    tasks: [
      { id: 1, type: "twitter_follow", label: "Follow @OnChainGM on X", url: "https://x.com", done: false },
      { id: 2, type: "discord", label: "Join Discord server", url: "https://discord.gg", done: false },
      { id: 3, type: "visit", label: "Visit onchaingm.xyz", url: "https://onchaingm.xyz", done: false },
    ],
  },
  {
    id: 2,
    projectName: "DeFi Labs",
    projectLogo: "DL",
    chainName: "Polygon",
    chainSymbol: "POL",
    rewardAmount: "0.5",
    totalSlots: 1000,
    claimedSlots: 789,
    expiresIn: "1 day",
    color: "168,85,247",
    tasks: [
      { id: 1, type: "twitter_follow", label: "Follow @DeFiLabs on X", url: "https://x.com", done: false },
      { id: 2, type: "telegram", label: "Join Telegram group", url: "https://t.me", done: false },
      { id: 3, type: "retweet", label: "Retweet launch post", url: "https://x.com", done: false },
      { id: 4, type: "visit", label: "Visit defilabs.io", url: "https://defilabs.io", done: false },
    ],
  },
  {
    id: 3,
    projectName: "ZK Network",
    projectLogo: "ZK",
    chainName: "Ethereum",
    chainSymbol: "ETH",
    rewardAmount: "0.005",
    totalSlots: 200,
    claimedSlots: 200,
    expiresIn: "Ended",
    color: "34,197,94",
    tasks: [
      { id: 1, type: "twitter_follow", label: "Follow @ZKNetwork on X", url: "https://x.com", done: true },
      { id: 2, type: "discord", label: "Join Discord server", url: "https://discord.gg", done: true },
    ],
  },
];

const taskIcon = (type: TaskType) => {
  if (type === "twitter_follow" || type === "retweet") return <Twitter style={{ width: 14, height: 14 }} />;
  if (type === "discord") return <MessageCircle style={{ width: 14, height: 14 }} />;
  if (type === "telegram") return <Send style={{ width: 14, height: 14 }} />;
  return <Globe style={{ width: 14, height: 14 }} />;
};

function CampaignCard({ c, onClick }: { c: Campaign; onClick: () => void }) {
  const pct = Math.round((c.claimedSlots / c.totalSlots) * 100);
  const isFull = c.claimedSlots >= c.totalSlots;
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", padding: "14px 16px",
        borderRadius: 16, cursor: isFull ? "default" : "pointer",
        background: `rgba(${c.color},0.06)`,
        border: `1px solid rgba(${c.color},0.2)`,
        transition: "all 0.15s",
        opacity: isFull ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Logo */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `rgba(${c.color},0.15)`, border: `1px solid rgba(${c.color},0.3)`,
          fontFamily: "monospace", fontWeight: 800, fontSize: 13, color: `rgb(${c.color})`,
        }}>
          {c.projectLogo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 14 }}>{c.projectName}</span>
            {isFull
              ? <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 6 }}>FULL</span>
              : <ChevronRight style={{ width: 15, height: 15, color: `rgba(${c.color},0.7)` }} />
            }
          </div>
          {/* Chain + reward */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{c.chainName}</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>•</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: `rgb(${c.color})` }}>
              +{c.rewardAmount} {c.chainSymbol}
            </span>
            <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              <Clock style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />{c.expiresIn}
            </span>
          </div>
          {/* Progress */}
          <div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: `rgb(${c.color})`, transition: "width 0.4s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{c.tasks.length} tasks</span>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{c.claimedSlots}/{c.totalSlots} claimed</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function CampaignDetail({ c, onBack }: { c: Campaign; onBack: () => void }) {
  const [tasks, setTasks] = useState(c.tasks);
  const [walletInput, setWalletInput] = useState("");
  const [claimed, setClaimed] = useState(false);
  const allDone = tasks.every(t => t.done);

  function markDone(id: number) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: true } : t));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "linear-gradient(160deg,#0f0a1e 0%,#0a0814 100%)" }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 0", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer" }}>
          <ArrowLeft style={{ width: 15, height: 15, color: "rgba(255,255,255,0.6)" }} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#fff", fontSize: 15 }}>{c.projectName}</p>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Earn Drops Campaign</p>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `rgba(${c.color},0.15)`, border: `1px solid rgba(${c.color},0.3)`, fontFamily: "monospace", fontWeight: 800, fontSize: 12, color: `rgb(${c.color})` }}>
          {c.projectLogo}
        </div>
      </div>

      {/* Reward banner */}
      <div style={{ margin: "16px 16px 0", padding: "16px", borderRadius: 16, background: `rgba(${c.color},0.08)`, border: `1px solid rgba(${c.color},0.2)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `rgba(${c.color},0.15)` }}>
            <Gift style={{ width: 18, height: 18, color: `rgb(${c.color})` }} />
          </div>
          <div>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Reward</p>
            <p style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 20, color: `rgb(${c.color})` }}>+{c.rewardAmount} {c.chainSymbol}</p>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              <Users style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />{c.claimedSlots}/{c.totalSlots}
            </p>
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              <Clock style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />{c.expiresIn}
            </p>
          </div>
        </div>
      </div>

      {/* Tasks list */}
      <div style={{ padding: "16px", flex: 1 }}>
        <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
          Complete all tasks — {tasks.filter(t => t.done).length}/{tasks.length}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((task, i) => (
            <div key={task.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
              borderRadius: 12, background: task.done ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.04)",
              border: task.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
              transition: "all 0.2s",
            }}>
              {/* Step number / check */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: task.done ? "rgba(34,197,94,0.15)" : `rgba(${c.color},0.1)`,
                border: task.done ? "1px solid rgba(34,197,94,0.35)" : `1px solid rgba(${c.color},0.25)`,
              }}>
                {task.done
                  ? <CheckCircle2 style={{ width: 14, height: 14, color: "#4ade80" }} />
                  : <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 11, color: `rgb(${c.color})` }}>{i + 1}</span>
                }
              </div>
              {/* Task info */}
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "monospace", fontSize: 13, color: task.done ? "rgba(255,255,255,0.4)" : "#fff", textDecoration: task.done ? "line-through" : "none" }}>
                  {task.label}
                </p>
              </div>
              {/* Action */}
              {!task.done && (
                <button
                  onClick={() => { window.open(task.url, "_blank"); setTimeout(() => markDone(task.id), 1500); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                    borderRadius: 8, background: `rgba(${c.color},0.12)`, border: `1px solid rgba(${c.color},0.25)`,
                    color: `rgb(${c.color})`, fontFamily: "monospace", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {taskIcon(task.type)} GO
                  <ExternalLink style={{ width: 10, height: 10 }} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Claim footer */}
      <div style={{ padding: "0 16px 32px" }}>
        {allDone && !claimed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Your Wallet Address</p>
            <input
              value={walletInput}
              onChange={e => setWalletInput(e.target.value)}
              placeholder="0x..."
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 10, fontFamily: "monospace", fontSize: 13,
                background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
                outline: "none", boxSizing: "border-box",
              }}
            />
            <button
              onClick={() => { if (walletInput.startsWith("0x")) setClaimed(true); }}
              style={{
                padding: "13px", borderRadius: 12, fontFamily: "monospace", fontWeight: 700, fontSize: 14,
                background: `linear-gradient(135deg,rgba(${c.color},0.25),rgba(${c.color},0.15))`,
                border: `1px solid rgba(${c.color},0.4)`, color: `rgb(${c.color})`, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: `0 0 20px rgba(${c.color},0.12)`,
              }}
            >
              <Zap style={{ width: 15, height: 15 }} /> Claim {c.rewardAmount} {c.chainSymbol}
            </button>
          </div>
        ) : claimed ? (
          <div style={{ textAlign: "center", padding: "20px", borderRadius: 16, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <CheckCircle2 style={{ width: 32, height: 32, color: "#4ade80", margin: "0 auto 10px" }} />
            <p style={{ fontFamily: "monospace", fontWeight: 700, color: "#4ade80", fontSize: 15 }}>Claimed!</p>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Tokens sent to your wallet</p>
          </div>
        ) : (
          <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
              Complete all {tasks.length} tasks to unlock claim
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TasksPage() {
  const [selected, setSelected] = useState<Campaign | null>(null);

  if (selected) {
    return <CampaignDetail c={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(160deg,#0f0a1e 0%,#0a0814 100%)",
      padding: "20px 16px", fontFamily: "monospace",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Zap style={{ width: 18, height: 18, color: "#c084fc" }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.01em" }}>Earn Drops</h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Complete tasks from partner projects and earn free crypto</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Active", value: "2", color: "34,197,94" },
          { label: "Partners", value: "3", color: "168,85,247" },
          { label: "Earned", value: "0.51 ETH", color: "251,191,36" },
        ].map(s => (
          <div key={s.label} style={{ padding: "10px 8px", borderRadius: 12, background: `rgba(${s.color},0.07)`, border: `1px solid rgba(${s.color},0.18)`, textAlign: "center" }}>
            <p style={{ fontWeight: 800, fontSize: 13, color: `rgb(${s.color})` }}>{s.value}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Active campaigns */}
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>— Active Campaigns —</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {CAMPAIGNS.map(c => (
          <CampaignCard key={c.id} c={c} onClick={() => c.claimedSlots < c.totalSlots && setSelected(c)} />
        ))}
      </div>
    </div>
  );
}
