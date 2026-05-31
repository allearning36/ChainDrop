import { useState, useEffect, useCallback } from "react";
import {
  X, CheckCircle2, ExternalLink, Loader2, ChevronRight, Info,
  Twitter, Send, MessageCircle, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EarnDropCampaignDetail, EarnDropTaskPublic, EarnDropProgress,
} from "@workspace/api-client-react";

interface Props {
  campaign: EarnDropCampaignDetail;
  onClose: () => void;
}

function useCountdown(endDate: string) {
  const calc = () => {
    const diff = Math.max(0, new Date(endDate).getTime() - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, ended: diff === 0 };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [endDate]);
  return t;
}

function TaskCard({
  task, stepDone, onComplete,
}: {
  task: EarnDropTaskPublic;
  stepDone: boolean;
  onComplete: (stepNumber: number) => void;
}) {
  const hasAction = task.actionType === "link" && task.actionUrl;
  const hasLogo = task.logoUrl && task.logoUrl.trim() !== "";

  return (
    <div
      className="rounded-xl p-4 transition-all"
      style={{
        background: stepDone ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)",
        border: stepDone ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm font-mono"
          style={{
            background: stepDone ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)",
            color: stepDone ? "#22c55e" : "rgba(255,255,255,0.5)",
          }}
        >
          {stepDone ? <CheckCircle2 className="w-4 h-4" /> : task.stepNumber}
        </div>
        {hasLogo ? (
          <img src={task.logoUrl} alt="" className="w-9 h-9 rounded-lg object-contain shrink-0 mt-0.5"
            style={{ background: "rgba(255,255,255,0.08)" }} />
        ) : (
          <div className="w-9 h-9 rounded-lg shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.08)" }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm text-white">{task.title}</p>
              {task.description && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{task.description}</p>
              )}
            </div>
            {stepDone ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <span className="text-xs font-mono font-semibold" style={{ color: "#22c55e" }}>Done</span>
              </div>
            ) : hasAction ? (
              <a
                href={task.actionUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => setTimeout(() => onComplete(task.stepNumber), 1500)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 text-xs font-mono font-semibold transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}
              >
                {task.actionLabel || "Go"} <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <button
                onClick={() => onComplete(task.stepNumber)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg shrink-0 text-xs font-mono font-semibold transition-colors"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}
              >
                {task.actionLabel || "Complete"} <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EarnDropCampaignModal({ campaign, onClose }: Props) {
  // Address + promo only needed at claim time
  const [address, setAddress] = useState("");
  const [promoCode, setPromoCode] = useState("");

  // Local task completion tracking (no address needed to check tasks)
  const [localDone, setLocalDone] = useState<number[]>([]);

  // Server-side progress (loaded when address is entered)
  const [progress, setProgress] = useState<EarnDropProgress | null>(null);

  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{ txHash: string; rewardAmount: string; rewardToken: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const { d, h, m, s, ended } = useCountdown(campaign.endDate);

  const totalTasks = campaign.tasks.length;

  // Merge local + server completed steps
  const serverSteps = progress?.completedSteps ?? [];
  const completedSteps = Array.from(new Set([...localDone, ...serverSteps]));
  const completedCount = completedSteps.length;
  const allDone = totalTasks > 0 && completedCount >= totalTasks;
  const alreadyClaimed = progress?.claimed ?? false;
  const pct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  // Load server progress when address is provided
  const loadProgress = useCallback(async (addr: string) => {
    if (!addr.trim() || addr.length < 10) return;
    try {
      const res = await fetch(`/api/earn-drop/campaigns/${campaign.id}/progress?address=${encodeURIComponent(addr.trim().toLowerCase())}`);
      if (res.ok) setProgress(await res.json() as EarnDropProgress);
    } catch { /* ignore */ }
  }, [campaign.id]);

  useEffect(() => {
    if (address.length >= 10) {
      const t = setTimeout(() => void loadProgress(address), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [address, loadProgress]);

  // Mark task done locally — no address needed
  const handleCompleteTask = (stepNumber: number) => {
    setLocalDone(prev => prev.includes(stepNumber) ? prev : [...prev, stepNumber]);
    setError(null);
  };

  const handleClaim = async () => {
    if (!address.trim() || address.trim().length < 10) {
      setError("Enter your wallet address (0x...)");
      return;
    }
    if (!allDone) {
      setError("Complete all tasks first");
      return;
    }
    setError(null);
    setClaiming(true);
    try {
      // Record any locally-completed steps to the backend first
      const addr = address.trim().toLowerCase();
      for (const step of localDone) {
        if (serverSteps.includes(step)) continue; // already on server
        await fetch(`/api/earn-drop/campaigns/${campaign.id}/complete-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, stepNumber: step }),
        }).catch(() => null);
      }

      // Claim
      const res = await fetch("/api/earn-drop/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          address: addr,
          ...(campaign.promoCodeEnabled && promoCode ? { promoCode: promoCode.trim().toUpperCase() } : {}),
        }),
      });
      const data = await res.json() as { txHash: string; rewardAmount: string; rewardToken: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Claim failed"); return; }
      setClaimResult(data);
    } catch { setError("Network error. Try again."); }
    finally { setClaiming(false); }
  };

  // Social links
  const socials = [
    campaign.twitterUrl  ? { icon: <Twitter  className="w-4 h-4" />, url: campaign.twitterUrl,  color: "#1d9bf0", label: "Twitter"  } : null,
    campaign.telegramUrl ? { icon: <Send     className="w-4 h-4" />, url: campaign.telegramUrl, color: "#229ed9", label: "Telegram" } : null,
    campaign.discordUrl  ? { icon: <MessageCircle className="w-4 h-4" />, url: campaign.discordUrl,  color: "#5865f2", label: "Discord"  } : null,
    campaign.websiteUrl  ? { icon: <Globe    className="w-4 h-4" />, url: campaign.websiteUrl,  color: "#22c55e", label: "Website"  } : null,
  ].filter(Boolean) as { icon: React.ReactNode; url: string; color: string; label: string }[];

  if (claimResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
          style={{ background: "rgba(8,12,18,0.99)", border: "1px solid rgba(34,197,94,0.25)", boxShadow: "0 0 60px rgba(34,197,94,0.15)" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: "#22c55e" }} />
            </div>
            <h2 className="text-xl font-bold font-mono text-white mb-2">Reward Claimed!</h2>
            <p className="text-muted-foreground text-sm mb-4">Your reward has been sent to your wallet</p>
            <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <p className="text-2xl font-black font-mono" style={{ color: "#22c55e" }}>
                {claimResult.rewardAmount} {claimResult.rewardToken}
              </p>
            </div>
            <a
              href={`https://etherscan.io/tx/${claimResult.txHash}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs font-mono mb-6"
              style={{ color: "#60a5fa" }}
            >
              View Tx <ExternalLink className="w-3 h-3" />
            </a>
            <Button onClick={onClose} className="w-full" style={{ background: "linear-gradient(135deg,#166534,#22c55e)", color: "#fff" }}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: "rgba(8,12,18,0.99)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
          maxHeight: "92vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            {campaign.logoUrl ? (
              <img src={campaign.logoUrl} alt="" className="w-10 h-10 rounded-full object-contain"
                style={{ background: "rgba(255,255,255,0.08)" }} />
            ) : (
              <div className="w-10 h-10 rounded-full"
                style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }} />
            )}
            <div>
              <p className="font-bold font-mono text-white text-base leading-tight">{campaign.title}</p>
              <p className="text-xs font-mono font-semibold" style={{ color: "#22c55e" }}>{campaign.rewardToken}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Social link icons */}
            {socials.map(s => (
              <a key={s.label} href={s.url} target="_blank" rel="noreferrer"
                className="p-2 rounded-lg transition-all"
                style={{ color: s.color, background: "rgba(255,255,255,0.04)" }}
                title={s.label}>
                {s.icon}
              </a>
            ))}
            {campaign.rules && (
              <button onClick={() => setShowRules(v => !v)} className="p-2 rounded-lg transition-colors"
                style={{ background: showRules ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)" }}>
                <Info className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-white/8">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Rules panel */}
        {showRules && campaign.rules && (
          <div className="px-5 py-3 shrink-0 text-xs font-mono leading-relaxed text-muted-foreground"
            style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {campaign.rules}
          </div>
        )}

        {/* Countdown + reward info */}
        <div className="px-5 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {ended ? (
            <div className="text-center text-xs font-mono font-semibold text-red-400">Drop has ended</div>
          ) : (
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Drop ends in</span>
              <span className="font-bold" style={{ color: "#f59e0b" }}>
                {d}D {h}H {m}M {s}S
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs font-mono mt-1.5">
            <span className="text-muted-foreground">Reward</span>
            <span className="font-bold" style={{ color: "#22c55e" }}>{campaign.rewardAmount} {campaign.rewardToken}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-mono mt-1">
            <span className="text-muted-foreground">Total Participants</span>
            <span className="font-semibold text-white">{campaign.totalParticipants.toLocaleString()}</span>
          </div>
        </div>

        {/* Overall progress */}
        {totalTasks > 0 && (
          <div className="px-5 py-3 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold font-mono uppercase tracking-wider text-white">Overall Progress</p>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-white font-bold">{completedCount} / {totalTasks}</span>
                <span className="font-bold" style={{ color: "#22c55e" }}>{pct}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg,#16a34a,#22c55e)" }} />
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
          {campaign.tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              stepDone={completedSteps.includes(task.stepNumber)}
              onComplete={handleCompleteTask}
            />
          ))}
        </div>

        {/* Claim section — address + promo only here */}
        <div className="px-5 py-4 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.3)" }}>
          <Input
            placeholder="Your wallet address (0x...)"
            value={address}
            onChange={e => { setAddress(e.target.value); setError(null); }}
            className="mb-2 font-mono text-xs"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
          />
          {campaign.promoCodeEnabled && (
            <Input
              placeholder="Promo code (required)"
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              className="mb-2 font-mono text-xs uppercase"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          )}
          {error && <p className="text-xs text-red-400 font-mono mb-2">{error}</p>}

          {alreadyClaimed ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
              style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
              <span className="text-sm font-mono font-semibold" style={{ color: "#22c55e" }}>Already Claimed</span>
            </div>
          ) : ended ? (
            <div className="text-center py-2 text-xs text-red-400 font-mono">This drop has ended</div>
          ) : (
            <Button
              className="w-full font-mono font-bold text-sm py-6"
              style={{
                background: allDone ? "linear-gradient(135deg,#166534,#22c55e)" : "rgba(255,255,255,0.06)",
                color: allDone ? "#fff" : "rgba(255,255,255,0.35)",
                cursor: allDone ? "pointer" : "not-allowed",
              }}
              disabled={!allDone || claiming}
              onClick={() => void handleClaim()}
            >
              {claiming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {claiming
                ? "Processing..."
                : allDone
                ? `Claim ${campaign.rewardAmount} ${campaign.rewardToken}`
                : `Complete ${totalTasks - completedCount} more task${totalTasks - completedCount !== 1 ? "s" : ""} to claim`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
