import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEOHead } from "@/components/layout/SEOHead";
import { EarnDropCampaignModal } from "@/components/home/EarnDropCampaignModal";
import { useGetEarnDropCampaigns, getGetEarnDropCampaignsQueryKey, EarnDropCampaignPublic, EarnDropCampaignDetail } from "@workspace/api-client-react";
import { Loader2, Zap, Info, ArrowLeft } from "lucide-react";

// ── Countdown ─────────────────────────────────────────────────────────────────

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

// ── Campaign Card ─────────────────────────────────────────────────────────────

function CampaignCard({ campaign, onOpen }: { campaign: EarnDropCampaignPublic; onOpen: () => void }) {
  const { d, h, m, s, ended } = useCountdown(campaign.endDate);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden relative cursor-pointer"
      style={{
        background: "linear-gradient(145deg, rgba(12,18,26,0.98) 0%, rgba(8,12,18,0.98) 100%)",
        border: "1px solid rgba(34,197,94,0.15)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.03)",
      }}
    >
      {/* Top bar */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-3">
          {campaign.logoUrl ? (
            <img
              src={campaign.logoUrl}
              alt=""
              className="w-12 h-12 rounded-full object-contain shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}
            >
              <Zap className="w-6 h-6" style={{ color: "#22c55e" }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold font-mono text-white text-base leading-tight truncate">{campaign.title}</p>
            <p className="text-xs font-mono font-semibold mt-0.5" style={{ color: "#22c55e" }}>{campaign.rewardToken}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setShowInfo(v => !v); }}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: ended ? "#ef4444" : "#22c55e", boxShadow: ended ? "0 0 6px #ef4444" : "0 0 8px rgba(34,197,94,0.6)" }} />
          </div>
        </div>

        {showInfo && (
          <div className="mt-3 rounded-xl px-3 py-2 text-xs font-mono text-muted-foreground" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            Complete tasks to earn {parseFloat(campaign.rewardAmount)} {campaign.rewardToken}. Click Claim to see all tasks.
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4" style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />

      {/* Stats */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>⏱</span>
            <span>Drop End in</span>
          </div>
          {ended ? (
            <span className="text-xs font-mono font-bold text-red-400">Ended</span>
          ) : (
            <span className="text-xs font-bold font-mono" style={{ color: "#f59e0b" }}>
              {d}D {h}H {m}M {s}S
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>⚡</span>
            <span>Reward</span>
          </div>
          <span className="text-xs font-bold font-mono" style={{ color: "#22c55e" }}>
            {parseFloat(campaign.rewardAmount)} {campaign.rewardToken}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span>👥</span>
            <span>Total Participants</span>
          </div>
          <span className="text-xs font-semibold font-mono text-white">
            {campaign.totalParticipants.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Claim button */}
      <div className="px-4 pb-4 pt-1">
        <button
          onClick={onOpen}
          disabled={ended}
          className="w-full py-3.5 rounded-xl font-bold font-mono text-sm transition-all"
          style={{
            background: ended ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg,#166534 0%,#22c55e 100%)",
            color: ended ? "rgba(255,255,255,0.3)" : "#ffffff",
            boxShadow: ended ? "none" : "0 4px 20px rgba(34,197,94,0.3)",
            letterSpacing: "0.05em",
          }}
          onMouseEnter={(e: any) => { if (!ended) e.currentTarget.style.boxShadow = "0 6px 28px rgba(34,197,94,0.45)"; }}
          onMouseLeave={(e: any) => { if (!ended) e.currentTarget.style.boxShadow = "0 4px 20px rgba(34,197,94,0.3)"; }}
        >
          {ended ? "Drop Ended" : `Claim ${parseFloat(campaign.rewardAmount)} ${campaign.rewardToken}`}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EarnDropPage() {
  const { data: campaigns, isLoading } = useGetEarnDropCampaigns({
    query: { queryKey: getGetEarnDropCampaignsQueryKey(), refetchInterval: 120_000, staleTime: 60_000 }
  });
  const [selected, setSelected] = useState<EarnDropCampaignDetail | null>(null);

  const openCampaign = async (id: number) => {
    try {
      const res = await fetch(`/api/earn-drop/campaigns/${id}`);
      if (res.ok) setSelected(await res.json() as EarnDropCampaignDetail);
    } catch { /* ignore */ }
  };

  return (
    <>
      <SEOHead
        title="Earn Drop — ChainDrop"
        description="Complete tasks and earn free crypto rewards from ChainDrop"
      />
      <div className="min-h-screen flex flex-col" style={{ background: "#080c12" }}>
        <Navbar />
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">

          {/* Back link */}
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-white transition-colors mb-6 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
            Back to Home
          </a>

          {/* Page header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <Zap className="w-5 h-5" style={{ color: "#22c55e" }} />
              </div>
              <h1 className="text-2xl font-black font-mono" style={{ color: "#22c55e", textShadow: "0 0 20px rgba(34,197,94,0.4)" }}>
                Earn Drop
              </h1>
            </div>
            <p className="text-sm text-muted-foreground font-mono ml-14">
              Complete tasks & earn free crypto rewards
            </p>
          </div>

          {/* Campaign list */}
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#22c55e" }} />
            </div>
          ) : !campaigns || campaigns.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Zap className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: "#22c55e" }} />
              <p className="text-muted-foreground font-mono text-sm">No active drops right now.</p>
              <p className="text-muted-foreground font-mono text-xs mt-1 opacity-60">Check back soon!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(campaigns as EarnDropCampaignPublic[]).map(campaign => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  onOpen={() => void openCampaign(campaign.id)}
                />
              ))}
            </div>
          )}
        </main>
        <Footer />
      </div>

      {selected && (
        <EarnDropCampaignModal
          campaign={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
