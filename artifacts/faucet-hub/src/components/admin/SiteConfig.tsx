import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Globe, Search, Wrench, Shield, AlertTriangle } from "lucide-react";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

type Tab = "social" | "seo" | "maintenance" | "ratelimit";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "social", label: "Social Links", icon: Globe },
  { id: "seo", label: "SEO Settings", icon: Search },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "ratelimit", label: "Rate Limit", icon: Shield },
];

interface SocialLinks { twitter: string; telegram: string; discord: string; github: string; }
interface SEOSettings { title: string; description: string; ogImage: string; }
interface MaintenanceMode { enabled: boolean; message: string; }
interface RateLimitConfig { maxAttempts: number; lockoutMinutes: number; }
interface SiteConfigData { socialLinks: SocialLinks; seoSettings: SEOSettings; maintenanceMode: MaintenanceMode; rateLimitConfig: RateLimitConfig; }

const DEFAULT: SiteConfigData = {
  socialLinks: { twitter: "", telegram: "", discord: "", github: "" },
  seoSettings: { title: "ChainDrop — Multi-Chain Crypto Faucet Hub", description: "Get free testnet crypto tokens from ChainDrop.", ogImage: "" },
  maintenanceMode: { enabled: false, message: "We're currently performing maintenance. Please check back soon." },
  rateLimitConfig: { maxAttempts: 5, lockoutMinutes: 15 },
};

type SaveFn = (section: keyof SiteConfigData, value: object) => Promise<void>;

function SaveBtn({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <Button onClick={onClick} disabled={saving} className="font-mono mt-4">
      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
      Save Changes
    </Button>
  );
}

function SocialTab({ data, onSave, saving }: { data: SocialLinks; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const f = (k: keyof SocialLinks) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-muted-foreground">These links appear in the footer. Leave blank to hide.</p>
      {([["twitter", "Twitter / X URL"], ["telegram", "Telegram URL"], ["discord", "Discord URL"], ["github", "GitHub URL"]] as [keyof SocialLinks, string][]).map(([key, label]) => (
        <div key={key} className="space-y-1.5">
          <Label className="font-mono text-xs">{label}</Label>
          <Input value={form[key]} onChange={f(key)} placeholder="https://..." className="font-mono bg-card border-border" />
        </div>
      ))}
      <SaveBtn onClick={() => onSave("socialLinks", form)} saving={saving} />
    </div>
  );
}

function SEOTab({ data, onSave, saving }: { data: SEOSettings; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-muted-foreground">Controls browser tab title and search engine preview.</p>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Site Title</Label>
        <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="font-mono bg-card border-border" />
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Meta Description</Label>
        <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} className="font-mono bg-card border-border resize-none" />
        <p className="text-xs text-muted-foreground">{form.description.length}/160 recommended</p>
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">OG Image URL</Label>
        <Input value={form.ogImage} onChange={e => setForm(p => ({ ...p, ogImage: e.target.value }))} placeholder="https://..." className="font-mono bg-card border-border" />
        <p className="text-xs text-muted-foreground">Shown when shared on social media (1200×630px recommended).</p>
      </div>
      <SaveBtn onClick={() => onSave("seoSettings", form)} saving={saving} />
    </div>
  );
}

function MaintenanceTab({ data, onSave, saving }: { data: MaintenanceMode; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  return (
    <div className="space-y-4 max-w-lg">
      {form.enabled && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive font-mono">Maintenance mode is ON — users cannot claim tokens.</p>
        </div>
      )}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1">
          <p className="font-mono font-semibold text-sm">Maintenance Mode</p>
          <p className="text-xs text-muted-foreground mt-0.5">Disables all faucet claims with a custom message.</p>
        </div>
        <button
          onClick={() => setForm(p => ({ ...p, enabled: !p.enabled }))}
          className={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? "bg-destructive" : "bg-muted"}`}
        >
          <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white transition-transform ${form.enabled ? "translate-x-7" : "translate-x-1"}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Message shown to users</Label>
        <Textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={3} className="font-mono bg-card border-border resize-none" />
      </div>
      <SaveBtn onClick={() => onSave("maintenanceMode", form)} saving={saving} />
    </div>
  );
}

function RateLimitTab({ data, onSave, saving }: { data: RateLimitConfig; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  return (
    <div className="space-y-4 max-w-lg">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground font-mono">
        ⚠ Changes take effect within ~5 minutes (server refreshes config every 5 min).
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Max Failed Attempts (before lockout)</Label>
        <Input type="number" min={1} max={20} value={form.maxAttempts}
          onChange={e => setForm(p => ({ ...p, maxAttempts: parseInt(e.target.value) || 5 }))}
          className="font-mono bg-card border-border" />
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Lockout Duration (minutes)</Label>
        <Input type="number" min={1} max={1440} value={form.lockoutMinutes}
          onChange={e => setForm(p => ({ ...p, lockoutMinutes: parseInt(e.target.value) || 15 }))}
          className="font-mono bg-card border-border" />
      </div>
      <SaveBtn onClick={() => onSave("rateLimitConfig", form)} saving={saving} />
    </div>
  );
}

export function SiteConfig() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("social");
  const [cfg, setCfg] = useState<SiteConfigData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/site-config", { headers: authHeaders() })
      .then(r => r.json())
      .then((d: SiteConfigData) => setCfg(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save: SaveFn = async (section, value) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/site-config/${section}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(value),
      });
      if (!res.ok) throw new Error();
      setCfg(prev => ({ ...prev, [section]: value }));
      toast({ title: "Saved", description: "Settings updated successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="animate-spin w-8 h-8 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono">Site Configuration</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage social links, SEO, maintenance mode, and security settings.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono border transition-colors ${tab === id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>
      {tab === "social" && <SocialTab data={cfg.socialLinks} onSave={save} saving={saving} />}
      {tab === "seo" && <SEOTab data={cfg.seoSettings} onSave={save} saving={saving} />}
      {tab === "maintenance" && <MaintenanceTab data={cfg.maintenanceMode} onSave={save} saving={saving} />}
      {tab === "ratelimit" && <RateLimitTab data={cfg.rateLimitConfig} onSave={save} saving={saving} />}
    </div>
  );
}
