import { useState } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

async function changePassword(current: string, newPwd: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch("/api/admin/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
    body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
  });
  return res.json();
}

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const strength = (() => {
    if (!newPwd) return null;
    let s = 0;
    if (newPwd.length >= 8) s++;
    if (newPwd.length >= 12) s++;
    if (/[A-Z]/.test(newPwd)) s++;
    if (/[0-9]/.test(newPwd)) s++;
    if (/[^A-Za-z0-9]/.test(newPwd)) s++;
    if (s <= 1) return { label: "Weak", color: "#ef4444", width: "25%" };
    if (s <= 3) return { label: "Fair", color: "#eab308", width: "55%" };
    return { label: "Strong", color: "#22c55e", width: "100%" };
  })();

  async function handleSubmit() {
    setError(""); setSuccess(false);
    if (!current) { setError("Enter your current password"); return; }
    if (newPwd.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (newPwd !== confirm) { setError("Passwords do not match"); return; }

    setLoading(true);
    try {
      const res = await changePassword(current, newPwd);
      if (res.error) { setError(res.error); return; }
      setSuccess(true);
      setCurrent(""); setNewPwd(""); setConfirm("");
    } catch { setError("Request failed. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-primary mb-1">Change Password</h2>
        <p className="text-xs text-muted-foreground font-mono">Update your admin panel login password.</p>
      </div>

      <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="w-4 h-4 text-primary" />
          <span className="font-mono font-semibold text-sm uppercase tracking-widest">Update Credentials</span>
        </div>

        {/* Current password */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Current Password</Label>
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              placeholder="Your current password"
              className="pr-10 font-mono text-sm h-10"
            />
            <button type="button" onClick={() => setShowCurrent(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New password */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">New Password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="At least 8 characters"
              className="pr-10 font-mono text-sm h-10"
            />
            <button type="button" onClick={() => setShowNew(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {strength && (
            <div className="space-y-1">
              <div className="h-1 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, background: strength.color }} />
              </div>
              <p className="text-[10px] font-mono" style={{ color: strength.color }}>{strength.label} password</p>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Confirm New Password</Label>
          <Input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void handleSubmit()}
            placeholder="Repeat new password"
            className="font-mono text-sm h-10"
            style={confirm && confirm !== newPwd ? { borderColor: "#ef4444" } : {}}
          />
          {confirm && confirm !== newPwd && (
            <p className="text-[10px] font-mono text-red-400">Passwords do not match</p>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 font-mono">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 text-sm text-green-400 font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> Password changed successfully!
          </div>
        )}

        <Button onClick={handleSubmit} disabled={loading} className="w-full h-10 font-mono font-semibold gap-2"
          style={{ background: "linear-gradient(135deg,#166534,#22c55e)", color: "#fff" }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Update Password
        </Button>
      </div>

      <div className="rounded-xl p-4 text-xs font-mono space-y-1.5" style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)" }}>
        <p className="font-semibold text-yellow-400/90 uppercase tracking-widest">Note</p>
        <p className="text-muted-foreground leading-relaxed">
          After changing your password, your current login session stays active. Next login will require the new password.
          The original <span className="text-foreground/70">ADMIN_PASSWORD</span> secret will no longer be used.
        </p>
      </div>
    </div>
  );
}
