import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Globe, Trash2, PlusCircle, ShieldBan, List } from "lucide-react";

interface IpBlock { ip: string; reason: string; blockedAt: string; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isValidIp(ip: string) {
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-f:]+$/i;
  return v4.test(ip) || v6.test(ip);
}

function parseIpList(raw: string): string[] {
  return raw
    .split(/[\n,\s]+/)
    .map(s => s.trim())
    .filter(s => isValidIp(s));
}

export function IPBlocking() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<IpBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);

  const load = () =>
    adminFetch("/api/admin/ip-blocks")
      .then(r => r.json())
      .then((d: unknown) => setBlocks(Array.isArray(d) ? d as IpBlock[] : []))
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false));

  useEffect(() => { void load(); }, []);

  async function handleBlock() {
    if (!isValidIp(ip.trim())) {
      toast({ title: "Invalid IP", description: "Enter a valid IPv4 or IPv6 address.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await adminFetch("/api/admin/ip-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ip.trim(), reason: reason.trim() }),
      });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const row = await res.json() as IpBlock;
      setBlocks(prev => [row, ...prev.filter(b => b.ip !== row.ip)]);
      setIp(""); setReason("");
      toast({ title: "IP Blocked", description: `${row.ip} has been blocked.` });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to block IP.", variant: "destructive" });
    } finally { setAdding(false); }
  }

  async function handleBulkBlock() {
    const ips = parseIpList(bulkText);
    if (ips.length === 0) {
      toast({ title: "No valid IPs", description: "Enter at least one valid IP address.", variant: "destructive" });
      return;
    }
    setBulkAdding(true);
    try {
      const res = await adminFetch("/api/admin/ip-blocks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ips, reason: bulkReason.trim() }),
      });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }
      const data = await res.json() as { blocked: number; ips: string[] };
      setBulkText(""); setBulkReason("");
      await load();
      toast({ title: `${data.blocked} IP${data.blocked !== 1 ? "s" : ""} Blocked`, description: "All valid IPs have been blocked." });
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to block IPs.", variant: "destructive" });
    } finally { setBulkAdding(false); }
  }

  async function handleUnblock(ipAddr: string) {
    setRemoving(ipAddr);
    try {
      await adminFetch(`/api/admin/ip-blocks/${encodeURIComponent(ipAddr)}`, { method: "DELETE" });
      setBlocks(prev => prev.filter(b => b.ip !== ipAddr));
      toast({ title: "Unblocked", description: `${ipAddr} has been unblocked.` });
    } catch {
      toast({ title: "Error", description: "Failed to unblock.", variant: "destructive" });
    } finally { setRemoving(null); }
  }

  const parsedBulkCount = parseIpList(bulkText).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono">IP Blocking</h2>
        <p className="text-sm text-muted-foreground mt-1">Block specific IP addresses from accessing the faucet.</p>
      </div>

      {/* Single block form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-mono font-semibold flex items-center gap-2">
          <PlusCircle className="w-4 h-4 text-primary" /> Block Single IP
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">IP Address</Label>
            <Input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.1"
              onKeyDown={e => e.key === "Enter" && void handleBlock()}
              className="font-mono bg-background border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Reason (optional)</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Abuse, spam, etc."
              className="font-mono bg-background border-border" />
          </div>
        </div>
        <Button onClick={handleBlock} disabled={adding || !ip.trim()} className="font-mono">
          {adding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusCircle className="w-4 h-4 mr-2" />}
          Block IP
        </Button>
      </div>

      {/* Bulk block form */}
      <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-mono font-semibold flex items-center gap-2">
            <ShieldBan className="w-4 h-4 text-primary" /> Bulk Block IPs
          </h3>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Enter multiple IP addresses — one per line, or comma/space separated.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">IP Addresses</Label>
          <Textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            placeholder={"103.230.105.27\n103.230.106.24\n156.59.24.41\n129.227.79.186"}
            className="font-mono bg-background border-border text-xs min-h-[120px] resize-y"
          />
          {bulkText.trim() && (
            <p className="text-xs font-mono text-primary">
              {parsedBulkCount} valid IP{parsedBulkCount !== 1 ? "s" : ""} detected
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Reason (optional)</Label>
          <Input value={bulkReason} onChange={e => setBulkReason(e.target.value)}
            placeholder="Bot abuse, datacenter IPs, etc."
            className="font-mono bg-background border-border" />
        </div>
        <Button
          onClick={handleBulkBlock}
          disabled={bulkAdding || parsedBulkCount === 0}
          className="font-mono"
          style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff" }}
        >
          {bulkAdding
            ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
            : <ShieldBan className="w-4 h-4 mr-2" />}
          Block {parsedBulkCount > 0 ? `${parsedBulkCount} IP${parsedBulkCount !== 1 ? "s" : ""}` : "IPs"}
        </Button>
      </div>

      {/* Blocked list */}
      <div className="space-y-2">
        <h3 className="text-sm font-mono text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <List className="w-3.5 h-3.5" /> Blocked IPs ({blocks.length})
        </h3>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin w-6 h-6 text-primary" /></div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground font-mono text-sm">No IPs blocked.</div>
        ) : (
          blocks.map(b => (
            <div key={b.ip} className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <Globe className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-mono font-semibold text-sm">{b.ip}</p>
                  {b.reason && <p className="text-xs text-muted-foreground mt-0.5">{b.reason}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">Blocked {formatDate(b.blockedAt)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleUnblock(b.ip)}
                disabled={removing === b.ip}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 font-mono text-xs"
              >
                {removing === b.ip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
