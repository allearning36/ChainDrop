import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldOff, ShieldCheck, Trash2, Plus, Loader2, AlertTriangle } from "lucide-react";

type BlockedAddr = { address: string; reason: string; blockedAt: string };

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}`, ...(opts?.headers ?? {}) },
  });
  if (res.status === 204) return null;
  return res.json();
}

function timeStr(iso: string) { return new Date(iso).toLocaleDateString([], { dateStyle: "medium" }); }
function shortAddr(a: string) { return `${a.slice(0, 10)}…${a.slice(-6)}`; }

export function BlockedAddresses() {
  const [list, setList] = useState<BlockedAddr[]>([]);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await apiFetch("/api/admin/blocked-addresses");
      if (Array.isArray(result)) setList(result as BlockedAddr[]);
    }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleAdd() {
    const addr = address.trim().toLowerCase();
    if (!addr) { setError("Enter a wallet address"); return; }
    setError(""); setAdding(true);
    try {
      const result = await apiFetch("/api/admin/blocked-addresses", { method: "POST", body: JSON.stringify({ address: addr, reason: reason.trim() }) }) as { error?: string };
      if (result?.error) { setError(result.error); return; }
      setAddress(""); setReason("");
      await load();
    } catch { setError("Failed to block address"); }
    finally { setAdding(false); }
  }

  async function handleRemove(addr: string) {
    setRemovingId(addr);
    try { await apiFetch(`/api/admin/blocked-addresses/${addr}`, { method: "DELETE" }); await load(); }
    finally { setRemovingId(null); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-primary mb-1">Blocked Addresses</h2>
        <p className="text-xs text-muted-foreground font-mono">Blocked wallets cannot claim from any faucet.</p>
      </div>

      {/* Add form */}
      <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldOff className="w-4 h-4 text-red-400" />
          <span className="font-mono font-semibold text-sm uppercase tracking-widest">Block Address</span>
        </div>
        <Input
          placeholder="0x… wallet address"
          value={address}
          onChange={e => setAddress(e.target.value)}
          className="font-mono text-sm h-9"
        />
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="font-mono text-sm h-9"
        />
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 font-mono">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
        <Button onClick={handleAdd} disabled={adding} className="gap-2 font-mono font-semibold text-sm h-9"
          style={{ background: "linear-gradient(135deg,#7f1d1d,#ef4444)", color: "#fff" }}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Block Address
        </Button>
      </div>

      {/* List */}
      <div className="rounded-2xl overflow-hidden border border-border">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border" style={{ background: "rgba(255,255,255,0.03)" }}>
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span className="font-mono text-sm font-semibold uppercase tracking-widest">Blocked List</span>
          <span className="ml-auto text-xs font-mono text-muted-foreground">{list.length} address{list.length !== 1 ? "es" : ""}</span>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>

        {list.length === 0 && !loading && (
          <div className="py-10 text-center text-muted-foreground text-sm font-mono">No blocked addresses</div>
        )}

        <div className="divide-y divide-border/50">
          {list.map(item => (
            <div key={item.address} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
              >
                <ShieldOff className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-semibold" title={item.address}>{shortAddr(item.address)}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  {item.reason && <span className="truncate italic">"{item.reason}"</span>}
                  <span className="shrink-0">Blocked {timeStr(item.blockedAt)}</span>
                </div>
              </div>
              <Button
                size="icon" variant="ghost"
                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10 shrink-0"
                onClick={() => void handleRemove(item.address)}
                disabled={removingId === item.address}
              >
                {removingId === item.address ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
