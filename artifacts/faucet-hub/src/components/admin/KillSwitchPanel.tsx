import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Power, Loader2, ShieldOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface KillSwitchState {
  buy: boolean;
  exchange: boolean;
  chains: { id: number; name: string; symbol: string; buyEnabled: boolean; killed: boolean }[];
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <span className="font-mono text-sm text-white/80">{label}</span>
      <button
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        className={cn(
          "relative w-12 h-6 rounded-full transition-all duration-200 focus:outline-none",
          on ? "bg-red-500/80" : "bg-green-500/50",
          disabled && "opacity-40 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200",
            on ? "translate-x-6" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

export function KillSwitchPanel() {
  const [state, setState] = useState<KillSwitchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/kill-switches");
      if (res.ok) setState(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function toggle(field: "buy" | "exchange", value: boolean) {
    setSaving(field);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/kill-switches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) setState(await res.json());
      else setError("Failed to update kill switch");
    } catch { setError("Network error"); }
    setSaving(null);
  }

  async function toggleChain(chainId: number, killed: boolean) {
    setSaving(`chain-${chainId}`);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/kill-switches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, chainKilled: killed }),
      });
      if (res.ok) {
        const updated = await res.json();
        setState(prev => prev ? { ...prev, chains: prev.chains.map(c => c.id === chainId ? { ...c, killed } : c) } : prev);
        void updated;
      } else setError("Failed to update");
    } catch { setError("Network error"); }
    setSaving(null);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono text-white mb-1 flex items-center gap-2">
          <Power className="w-5 h-5 text-red-400" /> Emergency Kill Switches
        </h2>
        <p className="text-sm text-muted-foreground font-mono">
          Instantly disable features without code changes. Active orders will continue processing — only new orders are blocked.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm font-mono px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Global switches */}
      <div className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider px-1 mb-3">Global Controls</p>
        <div className="relative">
          <Toggle
            label={state?.buy ? "🔴 Faucet Buy — DISABLED" : "🟢 Faucet Buy — Enabled"}
            on={state?.buy ?? false}
            onChange={(v) => void toggle("buy", v)}
            disabled={saving === "buy"}
          />
          {saving === "buy" && <Loader2 className="absolute right-12 top-3 w-4 h-4 animate-spin text-white/50" />}
        </div>
        <div className="relative">
          <Toggle
            label={state?.exchange ? "🔴 Exchange — DISABLED" : "🟢 Exchange — Enabled"}
            on={state?.exchange ?? false}
            onChange={(v) => void toggle("exchange", v)}
            disabled={saving === "exchange"}
          />
          {saving === "exchange" && <Loader2 className="absolute right-12 top-3 w-4 h-4 animate-spin text-white/50" />}
        </div>
      </div>

      {/* Per-chain switches */}
      {state && state.chains.length > 0 && (
        <div>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider px-1 mb-3">Per-Chain Controls (Faucet Buy)</p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {state.chains.filter(c => c.buyEnabled).map(chain => (
              <div key={chain.id} className="relative">
                <Toggle
                  label={chain.killed ? `🔴 ${chain.name} (${chain.symbol}) — DISABLED` : `🟢 ${chain.name} (${chain.symbol})`}
                  on={chain.killed}
                  onChange={(v) => void toggleChain(chain.id, v)}
                  disabled={saving === `chain-${chain.id}`}
                />
                {saving === `chain-${chain.id}` && <Loader2 className="absolute right-12 top-3 w-4 h-4 animate-spin text-white/50" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs font-mono text-muted-foreground px-1 flex items-start gap-2" style={{ color: "rgba(255,200,0,0.6)" }}>
        <ShieldOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Kill switches take effect immediately — no restart required. Turning OFF (disabled) blocks new orders/payments from being accepted.
      </div>
    </div>
  );
}
