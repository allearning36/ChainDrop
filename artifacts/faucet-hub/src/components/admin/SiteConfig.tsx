import { useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Globe, Search, Wrench, Shield, AlertTriangle, Puzzle, Paintbrush, KeyRound, Upload, ImageIcon } from "lucide-react";
import { LogoManagement } from "./LogoManagement";
import { ChangePassword } from "./ChangePassword";


type Tab = "social" | "seo" | "maintenance" | "ratelimit" | "claimlimits" | "integrations" | "logo" | "password";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "social", label: "Social Links", icon: Globe },
  { id: "seo", label: "SEO Settings", icon: Search },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "ratelimit", label: "Rate Limit", icon: Shield },
  { id: "claimlimits", label: "Claim Limits", icon: AlertTriangle },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "logo", label: "Logo", icon: Paintbrush },
  { id: "password", label: "Password", icon: KeyRound },
];

interface SocialLinks { twitter: string; telegram: string; discord: string; github: string; }
interface SEOSettings { title: string; description: string; ogImage: string; }
interface MaintenanceMode { enabled: boolean; message: string; }
interface RateLimitConfig { maxAttempts: number; lockoutMinutes: number; }
interface IpClaimConfig { windowHours: number; maxClaimsPerWindow: number; }
interface IntegrationsConfig {
  googleAds: { enabled: boolean; publisherId: string; slots: { header: string; inContent: string; footer: string } };
  googleAnalytics: { enabled: boolean; measurementId: string };
  googleSearchConsole: { verificationCode: string };
}
interface SiteConfigData { socialLinks: SocialLinks; seoSettings: SEOSettings; maintenanceMode: MaintenanceMode; rateLimitConfig: RateLimitConfig; ipClaimConfig: IpClaimConfig; integrations: IntegrationsConfig; }

const DEFAULT: SiteConfigData = {
  socialLinks: { twitter: "", telegram: "", discord: "", github: "" },
  seoSettings: { title: "ChainDrop — Multi-Chain Crypto Faucet Hub", description: "Get free testnet crypto tokens from ChainDrop.", ogImage: "" },
  maintenanceMode: { enabled: false, message: "We're currently performing maintenance. Please check back soon." },
  rateLimitConfig: { maxAttempts: 5, lockoutMinutes: 15 },
  ipClaimConfig: { windowHours: 24, maxClaimsPerWindow: 2 },
  integrations: {
    googleAds: { enabled: false, publisherId: "", slots: { header: "", inContent: "", footer: "" } },
    googleAnalytics: { enabled: false, measurementId: "" },
    googleSearchConsole: { verificationCode: "" },
  },
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setForm(data), [data]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await adminFetch("/api/uploads/banner", { method: "POST", body: fd });
      const json = await res.json() as { url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setForm(p => ({ ...p, ogImage: json.url! }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
        <Label className="font-mono text-xs">OG Image</Label>
        <div className="flex gap-2">
          <Input
            value={form.ogImage}
            onChange={e => setForm(p => ({ ...p, ogImage: e.target.value }))}
            placeholder="https://..."
            className="font-mono bg-card border-border flex-1"
          />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            title="Upload from gallery"
            className="shrink-0"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Shown when shared on social media (1200×630px recommended).</p>
        {form.ogImage && (
          <div className="mt-2 rounded-lg overflow-hidden border border-border bg-muted/30">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <ImageIcon className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-mono">Preview</span>
            </div>
            <img
              src={form.ogImage}
              alt="OG preview"
              className="w-full object-cover max-h-40"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}
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

function IpClaimConfigTab({ data, onSave, saving }: { data: IpClaimConfig; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  return (
    <div className="space-y-6 max-w-lg">
      <p className="text-sm text-muted-foreground">
        Set how many chains a user can claim for free within a rolling time window.
        Once the limit is hit, users must wait for the window to slide forward — or watch an ad to keep claiming.
      </p>
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Time Window (hours)</Label>
          <Input
            type="number" min={1} max={168}
            value={form.windowHours}
            onChange={e => setForm(p => ({ ...p, windowHours: parseInt(e.target.value) || 24 }))}
            className="font-mono bg-background border-border"
          />
          <p className="text-xs text-muted-foreground">
            Rolling window length in hours. Default: <strong>24</strong> (= per day).
            Set to <strong>1</strong> for per-hour limits, <strong>168</strong> for per-week.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Max Claims Per Window (per IP)</Label>
          <Input
            type="number" min={1} max={200}
            value={form.maxClaimsPerWindow}
            onChange={e => setForm(p => ({ ...p, maxClaimsPerWindow: parseInt(e.target.value) || 2 }))}
            className="font-mono bg-background border-border"
          />
          <p className="text-xs text-muted-foreground">
            How many chains one IP can claim within the time window above. Default: <strong>2</strong>.
            Example: window = 1h, max = 2 → user can claim 2 chains per hour, then must wait.
            Set to a high number (e.g. 200) to effectively disable this limit.
          </p>
        </div>
      </div>
      <SaveBtn onClick={() => onSave("ipClaimConfig", form)} saving={saving} />
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-7" : "translate-x-1"}`} />
    </button>
  );
}

function IntegrationsTab({ data, onSave, saving }: { data: IntegrationsConfig; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);

  const setAds = (patch: Partial<IntegrationsConfig["googleAds"]>) =>
    setForm(p => ({ ...p, googleAds: { ...p.googleAds, ...patch } }));
  const setSlot = (slot: keyof IntegrationsConfig["googleAds"]["slots"], val: string) =>
    setForm(p => ({ ...p, googleAds: { ...p.googleAds, slots: { ...p.googleAds.slots, [slot]: val } } }));
  const setGA = (patch: Partial<IntegrationsConfig["googleAnalytics"]>) =>
    setForm(p => ({ ...p, googleAnalytics: { ...p.googleAnalytics, ...patch } }));
  const setGSC = (val: string) =>
    setForm(p => ({ ...p, googleSearchConsole: { verificationCode: val } }));

  return (
    <div className="space-y-8 max-w-lg">
      <p className="text-sm text-muted-foreground">Configure third-party services. Changes apply site-wide after saving.</p>

      {/* Google Ads */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono font-semibold text-sm">Google AdSense</p>
            <p className="text-xs text-muted-foreground mt-0.5">Display ads to monetise your faucet.</p>
          </div>
          <Toggle enabled={form.googleAds.enabled} onToggle={() => setAds({ enabled: !form.googleAds.enabled })} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Publisher ID</Label>
          <Input value={form.googleAds.publisherId} onChange={e => setAds({ publisherId: e.target.value })}
            placeholder="ca-pub-XXXXXXXXXXXXXXXX" className="font-mono bg-background border-border" />
          <p className="text-xs text-muted-foreground">Found in AdSense → Account → Account information.</p>
        </div>
        <div className="space-y-3">
          <Label className="font-mono text-xs">Ad Unit IDs (optional)</Label>
          {([["header", "Header (below navbar)"], ["inContent", "In-content (between chain cards)"], ["footer", "Footer (above bottom)"]] as const).map(([slot, label]) => (
            <div key={slot} className="space-y-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Input value={form.googleAds.slots[slot]} onChange={e => setSlot(slot, e.target.value)}
                placeholder="XXXXXXXXXX" className="font-mono bg-background border-border text-xs" />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Leave blank to skip that slot. Get slot IDs from AdSense → Ads → By ad unit.</p>
        </div>
      </div>

      {/* Google Analytics */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono font-semibold text-sm">Google Analytics 4</p>
            <p className="text-xs text-muted-foreground mt-0.5">Track visitor behaviour and traffic sources.</p>
          </div>
          <Toggle enabled={form.googleAnalytics.enabled} onToggle={() => setGA({ enabled: !form.googleAnalytics.enabled })} />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Measurement ID</Label>
          <Input value={form.googleAnalytics.measurementId} onChange={e => setGA({ measurementId: e.target.value })}
            placeholder="G-XXXXXXXXXX" className="font-mono bg-background border-border" />
          <p className="text-xs text-muted-foreground">Found in GA4 → Admin → Data Streams → your stream.</p>
        </div>
      </div>

      {/* Google Search Console */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="font-mono font-semibold text-sm">Google Search Console</p>
          <p className="text-xs text-muted-foreground mt-0.5">Verify site ownership for search indexing.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Verification Code</Label>
          <Input value={form.googleSearchConsole.verificationCode} onChange={e => setGSC(e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="font-mono bg-background border-border text-xs" />
          <p className="text-xs text-muted-foreground">
            In Search Console → Add property → HTML tag → copy only the <code className="bg-muted px-1 rounded">content="..."</code> value.
          </p>
        </div>
      </div>

      <SaveBtn onClick={() => onSave("integrations", form)} saving={saving} />
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
    adminFetch("/api/admin/site-config")
      .then(r => r.json())
      .then((d: Partial<SiteConfigData>) => setCfg(prev => ({
        socialLinks:       { ...DEFAULT.socialLinks,       ...(d.socialLinks       ?? {}) },
        seoSettings:       { ...DEFAULT.seoSettings,       ...(d.seoSettings       ?? {}) },
        maintenanceMode:   { ...DEFAULT.maintenanceMode,   ...(d.maintenanceMode   ?? {}) },
        rateLimitConfig:   { ...DEFAULT.rateLimitConfig,   ...(d.rateLimitConfig   ?? {}) },
        ipClaimConfig:     { ...DEFAULT.ipClaimConfig,     ...(d.ipClaimConfig     ?? {}) },
        integrations:      { ...prev.integrations,         ...(d.integrations      ?? {}) },
      })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save: SaveFn = async (section, value) => {
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/site-config/${section}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
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
      {tab === "claimlimits" && <IpClaimConfigTab data={cfg.ipClaimConfig} onSave={save} saving={saving} />}
      {tab === "integrations" && <IntegrationsTab data={cfg.integrations} onSave={save} saving={saving} />}
      {tab === "logo" && <LogoManagement />}
      {tab === "password" && <ChangePassword />}
    </div>
  );
}
