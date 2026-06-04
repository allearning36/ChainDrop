import { useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Globe, Search, Wrench, Shield, AlertTriangle, Puzzle, Paintbrush, KeyRound, Upload, ImageIcon, LayoutTemplate, Heart, Plus, Trash2, FileCheck, X, Copy, ExternalLink } from "lucide-react";
import { LogoManagement } from "./LogoManagement";
import { ChangePassword } from "./ChangePassword";


type Tab = "social" | "seo" | "maintenance" | "ratelimit" | "claimlimits" | "integrations" | "logo" | "password" | "hero" | "donations" | "verifyfiles";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "social", label: "Social Links", icon: Globe },
  { id: "seo", label: "SEO Settings", icon: Search },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "ratelimit", label: "Rate Limit", icon: Shield },
  { id: "claimlimits", label: "Claim Limits", icon: AlertTriangle },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "verifyfiles", label: "Verify Files", icon: FileCheck },
  { id: "hero", label: "Hero Section", icon: LayoutTemplate },
  { id: "donations", label: "Donations", icon: Heart },
  { id: "logo", label: "Logo", icon: Paintbrush },
  { id: "password", label: "Password", icon: KeyRound },
];

interface SocialLinks { twitter: string; telegram: string; discord: string; github: string; email: string; }
interface SEOSettings { title: string; description: string; ogImage: string; }
interface MaintenanceMode { enabled: boolean; message: string; }
interface RateLimitConfig { maxAttempts: number; lockoutMinutes: number; }
interface IpClaimConfig { enabled: boolean; windowHours: number; maxClaimsPerWindow: number; }
interface IntegrationsConfig {
  googleAds: { enabled: boolean; publisherId: string; slots: { header: string; inContent: string; footer: string } };
  googleAnalytics: { enabled: boolean; measurementId: string };
  googleSearchConsole: { verificationCode: string };
  customMetaTags: string;
}
interface HeroConfig {
  enabled: boolean;
  size: "compact" | "medium" | "large";
  badge: string;
  headline: string;
  headlineHighlight: string;
  subtext: string;
  showStats: boolean;
}
export interface DonationAddress { chain: string; symbol: string; address: string; }
interface SiteConfigData { socialLinks: SocialLinks; seoSettings: SEOSettings; maintenanceMode: MaintenanceMode; rateLimitConfig: RateLimitConfig; ipClaimConfig: IpClaimConfig; integrations: IntegrationsConfig; heroSection: HeroConfig; donationAddresses: DonationAddress[]; }

const DEFAULT: SiteConfigData = {
  socialLinks: { twitter: "", telegram: "", discord: "", github: "", email: "" },
  seoSettings: { title: "ChainDrop — Multi-Chain Crypto Faucet Hub", description: "Get free testnet crypto tokens from ChainDrop.", ogImage: "" },
  maintenanceMode: { enabled: false, message: "We're currently performing maintenance. Please check back soon." },
  rateLimitConfig: { maxAttempts: 5, lockoutMinutes: 15 },
  ipClaimConfig: { enabled: false, windowHours: 24, maxClaimsPerWindow: 2 },
  integrations: {
    googleAds: { enabled: false, publisherId: "", slots: { header: "", inContent: "", footer: "" } },
    googleAnalytics: { enabled: false, measurementId: "" },
    googleSearchConsole: { verificationCode: "" },
    customMetaTags: "",
  },
  heroSection: {
    enabled: true,
    size: "compact",
    badge: "✦ Multi-Chain Faucet Hub",
    headline: "Get Free Crypto Tokens",
    headlineHighlight: "Instantly & For Free",
    subtext: "Claim testnet & mainnet tokens across multiple chains. No registration, no fees — just your wallet address.",
    showStats: true,
  },
  donationAddresses: [],
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
      {([["twitter", "Twitter / X URL", "https://x.com/..."], ["telegram", "Telegram URL", "https://t.me/..."], ["discord", "Discord URL", "https://discord.gg/..."], ["github", "GitHub URL", "https://github.com/..."], ["email", "Email Address", "contact@example.com"]] as [keyof SocialLinks, string, string][]).map(([key, label, placeholder]) => (
        <div key={key} className="space-y-1.5">
          <Label className="font-mono text-xs">{label}</Label>
          <Input value={form[key]} onChange={f(key)} placeholder={placeholder} className="font-mono bg-card border-border" />
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
  const [windowStr, setWindowStr] = useState(String(data.windowHours));
  const [maxStr, setMaxStr]       = useState(String(data.maxClaimsPerWindow));
  useEffect(() => {
    setForm(data);
    setWindowStr(String(data.windowHours));
    setMaxStr(String(data.maxClaimsPerWindow));
  }, [data]);

  const handleSave = () => {
    const parsed = {
      ...form,
      windowHours:        Math.max(1, Math.min(168, parseInt(windowStr) || 24)),
      maxClaimsPerWindow: Math.max(1, Math.min(200, parseInt(maxStr)    || 2)),
    };
    setWindowStr(String(parsed.windowHours));
    setMaxStr(String(parsed.maxClaimsPerWindow));
    onSave("ipClaimConfig", parsed);
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Master toggle */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono font-semibold text-sm">IP Claim Limit</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {form.enabled
                ? "Limit is active — users have a max number of free claims per time window."
                : "Limit is off — users can claim all listed chains freely."}
            </p>
          </div>
          <Toggle enabled={form.enabled} onToggle={() => setForm(p => ({ ...p, enabled: !p.enabled }))} />
        </div>
      </div>

      {/* Settings — only visible when enabled */}
      {form.enabled && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Time Window (hours)</Label>
            <Input
              type="number" min={1} max={168}
              value={windowStr}
              onChange={e => setWindowStr(e.target.value)}
              onBlur={() => {
                const v = Math.max(1, Math.min(168, parseInt(windowStr) || 24));
                setWindowStr(String(v));
                setForm(p => ({ ...p, windowHours: v }));
              }}
              className="font-mono bg-background border-border"
            />
            <p className="text-xs text-muted-foreground">
              Rolling window in hours. Example: <strong>1</strong> = per hour, <strong>24</strong> = per day, <strong>168</strong> = per week.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Max Claims Per Window (per IP)</Label>
            <Input
              type="number" min={1} max={200}
              value={maxStr}
              onChange={e => setMaxStr(e.target.value)}
              onBlur={() => {
                const v = Math.max(1, Math.min(200, parseInt(maxStr) || 2));
                setMaxStr(String(v));
                setForm(p => ({ ...p, maxClaimsPerWindow: v }));
              }}
              className="font-mono bg-background border-border"
            />
            <p className="text-xs text-muted-foreground">
              How many chains one IP can claim within the window above.
              Example: window = <strong>12h</strong>, max = <strong>3</strong> → user can claim 3 chains every 12 hours.
            </p>
          </div>
        </div>
      )}

      <SaveBtn onClick={handleSave} saving={saving} />
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={`text-xs font-bold font-mono w-7 text-right ${enabled ? "text-green-400" : "text-muted-foreground"}`}>
        {enabled ? "ON" : "OFF"}
      </span>
      <button
        onClick={onToggle}
        className={`relative shrink-0 rounded-full transition-colors duration-200 ${enabled ? "bg-green-500" : "bg-muted"}`}
        style={{ width: 44, height: 24, border: "none", padding: 0, cursor: "pointer" }}
        aria-pressed={enabled}
      >
        <span
          className="absolute rounded-full bg-white shadow transition-all duration-200"
          style={{ top: 3, left: enabled ? 23 : 3, width: 18, height: 18 }}
        />
      </button>
    </div>
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

      {/* Custom Meta Tags / Site Verification */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <p className="font-mono font-semibold text-sm">Site Verification &amp; Custom Tags</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Paste any verification meta tags here (Bitmedia, Coinzilla, Bing, etc.). Each tag on its own line. Injected into the page <code className="bg-muted px-1 rounded">&lt;head&gt;</code> automatically.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Meta Tags (HTML)</Label>
          <Textarea
            value={form.customMetaTags}
            onChange={e => setForm(p => ({ ...p, customMetaTags: e.target.value }))}
            rows={5}
            placeholder={`<meta name="bitmedia-verification" content="xxxxxxxxxxxxxxxx">\n<meta name="coinzilla-verification" content="yyyyyyyyyyyyyy">`}
            className="font-mono text-xs bg-background border-border resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Example: copy the full <code className="bg-muted px-1 rounded">&lt;meta ...&gt;</code> tag from Bitmedia / Google Search Console / Bing Webmaster and paste it here.
          </p>
        </div>
      </div>

      <SaveBtn onClick={() => onSave("integrations", form)} saving={saving} />
    </div>
  );
}

function HeroTab({ data, onSave, saving }: { data: HeroConfig; onSave: SaveFn; saving: boolean }) {
  const [form, setForm] = useState(data);
  useEffect(() => setForm(data), [data]);
  const toggle = (k: keyof HeroConfig) => setForm(p => ({ ...p, [k]: !p[k as keyof HeroConfig] }));
  const txt = (k: keyof HeroConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground">Control the hero banner shown at the top of the homepage.</p>

      {/* On/Off */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1">
          <p className="font-mono font-semibold text-sm">Hero Section Visible</p>
          <p className="text-xs text-muted-foreground mt-0.5">Show or hide the entire hero banner.</p>
        </div>
        <button
          onClick={() => toggle("enabled")}
          className={`relative w-12 h-6 rounded-full transition-colors ${form.enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white transition-transform ${form.enabled ? "translate-x-7" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Show Stats */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1">
          <p className="font-mono font-semibold text-sm">Show Stats Row</p>
          <p className="text-xs text-muted-foreground mt-0.5">Active Chains, Free, Instant, 24/7 badges.</p>
        </div>
        <button
          onClick={() => toggle("showStats")}
          className={`relative w-12 h-6 rounded-full transition-colors ${form.showStats ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-1 left-0 w-4 h-4 rounded-full bg-white transition-transform ${form.showStats ? "translate-x-7" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Size */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Size</Label>
        <div className="flex gap-2">
          {(["compact", "medium", "large"] as const).map(s => (
            <button key={s} onClick={() => setForm(p => ({ ...p, size: s }))}
              className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-colors capitalize ${form.size === s ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Compact = least space, Large = most space.</p>
      </div>

      {/* Badge */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Badge Text</Label>
        <Input value={form.badge} onChange={txt("badge")} className="font-mono bg-card border-border" placeholder="✦ Multi-Chain Faucet Hub" />
      </div>

      {/* Headline */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Headline (white)</Label>
        <Input value={form.headline} onChange={txt("headline")} className="font-mono bg-card border-border" />
      </div>

      {/* Headline Highlight */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Headline Highlight (green) — leave blank to hide</Label>
        <Input value={form.headlineHighlight} onChange={txt("headlineHighlight")} className="font-mono bg-card border-border" />
      </div>

      {/* Subtext */}
      <div className="space-y-1.5">
        <Label className="font-mono text-xs">Subtext — leave blank to hide</Label>
        <Textarea value={form.subtext} onChange={txt("subtext")} rows={3} className="font-mono bg-card border-border resize-none" />
      </div>

      <SaveBtn onClick={() => onSave("heroSection", form)} saving={saving} />
    </div>
  );
}

function DonationsTab({ data, saving, onSave }: { data: DonationAddress[]; saving: boolean; onSave: (section: keyof SiteConfigData, value: object) => Promise<void> }) {
  const [items, setItems] = useState<DonationAddress[]>(data);
  useEffect(() => setItems(data), [data]);

  const add = () => setItems(p => [...p, { chain: "", symbol: "", address: "" }]);
  const remove = (i: number) => setItems(p => p.filter((_, j) => j !== i));
  const update = (i: number, key: keyof DonationAddress, val: string) =>
    setItems(p => p.map((e, j) => j === i ? { ...e, [key]: val } : e));

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Add wallet addresses for each chain where users can donate to support ChainDrop. These will be shown on the site as a "Support ChainDrop" section.
      </p>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground font-mono">
          No donation addresses added yet.
        </div>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="grid grid-cols-3 gap-2 flex-1">
              <div className="space-y-1">
                <Label className="font-mono text-xs">Chain Name</Label>
                <Input
                  value={item.chain}
                  onChange={e => update(i, "chain", e.target.value)}
                  placeholder="e.g. Ethereum"
                  className="font-mono bg-background border-border text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs">Symbol</Label>
                <Input
                  value={item.symbol}
                  onChange={e => update(i, "symbol", e.target.value)}
                  placeholder="e.g. ETH"
                  className="font-mono bg-background border-border text-sm h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs">Wallet Address</Label>
                <Input
                  value={item.address}
                  onChange={e => update(i, "address", e.target.value)}
                  placeholder="0x..."
                  className="font-mono bg-background border-border text-sm h-8"
                />
              </div>
            </div>
            <button
              onClick={() => remove(i)}
              className="mt-5 p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={add} className="font-mono gap-2">
        <Plus className="w-4 h-4" /> Add Address
      </Button>

      <SaveBtn onClick={() => onSave("donationAddresses", items)} saving={saving} />
    </div>
  );
}

// ── Verify Files Tab ──────────────────────────────────────────────────────────

interface VerifyFile { filename: string; content: string; }

function VerifyFilesTab() {
  const { toast } = useToast();
  const [files, setFiles] = useState<VerifyFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminFetch("/api/admin/verify-files")
      .then(r => r.json())
      .then((d: VerifyFile[]) => setFiles(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!filename.trim()) { toast({ title: "Error", description: "Filename is required.", variant: "destructive" }); return; }
    if (!content.trim()) { toast({ title: "Error", description: "File content is required.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/verify-files", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: filename.trim(), content: content.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: "Error", description: e.error ?? "Failed to save.", variant: "destructive" }); return;
      }
      toast({ title: "Saved", description: `${filename.trim()} added successfully.` });
      setFilename(""); setContent(""); setAdding(false); load();
    } finally { setSaving(false); }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await adminFetch(`/api/admin/verify-files/${encodeURIComponent(name)}`, { method: "DELETE" });
    toast({ title: "Deleted", description: `${name} removed.` });
    load();
  };

  const copyUrl = (name: string) => {
    const url = `${window.location.origin}/${name}`;
    void navigator.clipboard.writeText(url);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <p className="font-mono font-semibold text-sm">Verification Files</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload verification files for Monetag, Bitmedia, Coinzilla, etc. Files are served directly at{" "}
          <code className="bg-muted px-1 rounded">chaindrop.app/filename.txt</code> — no JavaScript needed.
          Bots can read them immediately.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-400 font-mono">
          ⚡ After adding a file, click <strong>Verify</strong> in Monetag — the file is instantly accessible.
          If it fails, wait 30 seconds and try again.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {files.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground font-mono py-4 text-center">No verification files yet.</p>
          )}
          {files.map(f => (
            <div key={f.filename} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card">
              <FileCheck className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono font-semibold text-white truncate">{f.filename}</p>
                <p className="text-[10px] text-muted-foreground truncate">{f.content.slice(0, 60)}{f.content.length > 60 ? "…" : ""}</p>
              </div>
              <button
                onClick={() => copyUrl(f.filename)}
                title="Copy URL"
                className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors shrink-0"
              >
                {copied === f.filename ? <FileCheck className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a
                href={`/${f.filename}`} target="_blank" rel="noreferrer"
                className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors shrink-0"
                title="Open file"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => void handleDelete(f.filename)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
          <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">New Verification File</p>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Filename</Label>
            <Input
              value={filename} onChange={e => setFilename(e.target.value)}
              placeholder="e.g. monetag-abc123.txt"
              className="font-mono bg-background border-border text-sm h-8"
            />
            <p className="text-[10px] text-muted-foreground">Only letters, numbers, hyphens, underscores. Extension: .txt, .html or .js</p>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">File Content</Label>
            <Textarea
              value={content} onChange={e => setContent(e.target.value)}
              rows={4}
              placeholder="Paste the file content from Monetag / Bitmedia here..."
              className="font-mono text-xs bg-background border-border resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void handleAdd()} disabled={saving} className="gap-1.5 text-xs h-8" style={{ background: "#22c55e", color: "#000" }}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save File"}
            </Button>
            <Button variant="outline" onClick={() => { setAdding(false); setFilename(""); setContent(""); }} className="gap-1.5 text-xs h-8">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)} className="font-mono gap-2">
          <Plus className="w-4 h-4" /> Add Verification File
        </Button>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">How to use with Monetag</p>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside font-mono">
          <li>Monetag dashboard → Add Site → Download the verification file</li>
          <li>Open the file — copy its name and full content</li>
          <li>Click "Add Verification File" above, paste name + content, save</li>
          <li>Go back to Monetag and click "Verify" button</li>
        </ol>
      </div>
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
        socialLinks:         { ...DEFAULT.socialLinks,       ...(d.socialLinks       ?? {}) },
        seoSettings:         { ...DEFAULT.seoSettings,       ...(d.seoSettings       ?? {}) },
        maintenanceMode:     { ...DEFAULT.maintenanceMode,   ...(d.maintenanceMode   ?? {}) },
        rateLimitConfig:     { ...DEFAULT.rateLimitConfig,   ...(d.rateLimitConfig   ?? {}) },
        ipClaimConfig:       { ...DEFAULT.ipClaimConfig,     ...(d.ipClaimConfig     ?? {}) },
        integrations:        { ...prev.integrations,         ...(d.integrations      ?? {}) },
        heroSection:         { ...DEFAULT.heroSection,       ...(d.heroSection       ?? {}) },
        donationAddresses:   Array.isArray(d.donationAddresses) ? d.donationAddresses : [],
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
      {tab === "verifyfiles" && <VerifyFilesTab />}
      {tab === "hero" && <HeroTab data={cfg.heroSection} onSave={save} saving={saving} />}
      {tab === "donations" && <DonationsTab data={cfg.donationAddresses} onSave={save} saving={saving} />}
      {tab === "logo" && <LogoManagement />}
      {tab === "password" && <ChangePassword />}
    </div>
  );
}
