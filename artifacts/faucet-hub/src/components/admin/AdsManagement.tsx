import { useEffect, useState, useCallback } from "react";
import { adminFetch } from "@/lib/auth";
import { getBaseUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Save, Trash2, Megaphone, AlertCircle, Plus,
  ArrowUp, ArrowDown, ToggleLeft, ToggleRight, Tv2, Layers,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BannerSlot { html: string; name: string; }
interface Banners { top: BannerSlot; bottom: BannerSlot; processing: BannerSlot; }

interface InFeedAd {
  enabled: boolean;
  adCode: string;
  firstPosition: number;
  interval: number;
  name: string;
}

interface VideoAd {
  id: string;
  name: string;
  url: string;
  type: "vast" | "mp4" | "url" | "script" | "hypelab";
  enabled: boolean;
  priority: number;
}

type AdTab = "banners" | "infeed" | "video";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SLOT: BannerSlot = { html: "", name: "" };
const DEFAULT_BANNERS: Banners = {
  top:        { ...DEFAULT_SLOT },
  bottom:     { ...DEFAULT_SLOT },
  processing: { ...DEFAULT_SLOT },
};
const DEFAULT_INFEED: InFeedAd = { enabled: false, adCode: "", firstPosition: 4, interval: 6, name: "" };

// ── SlotBadge helper ──────────────────────────────────────────────────────────

function SlotBadge({ active, dirty }: { active: boolean; dirty: boolean }) {
  if (dirty) return (
    <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
      <AlertCircle className="w-2.5 h-2.5" /> UNSAVED
    </span>
  );
  return (
    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${active ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
      {active ? "ACTIVE" : "EMPTY"}
    </span>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AdsManagement() {
  const { toast } = useToast();
  const [tab, setTab] = useState<AdTab>("banners");

  // Banner state
  const [banners, setBanners] = useState<Banners>(DEFAULT_BANNERS);
  const [savedBanners, setSavedBanners] = useState<Banners>(DEFAULT_BANNERS);
  const [savingSlot, setSavingSlot] = useState<"top" | "bottom" | "processing" | null>(null);
  const [bannersLoaded, setBannersLoaded] = useState(false);

  // InFeed state
  const [inFeed, setInFeed] = useState<InFeedAd>(DEFAULT_INFEED);
  const [savedInFeed, setSavedInFeed] = useState<InFeedAd>(DEFAULT_INFEED);
  const [savingInFeed, setSavingInFeed] = useState(false);
  const [inFeedLoaded, setInFeedLoaded] = useState(false);

  // Video ads state
  const [videoAds, setVideoAds] = useState<VideoAd[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [newAd, setNewAd] = useState({ name: "", url: "", type: "vast" });
  const [addingAd, setAddingAd] = useState(false);

  // Global daily ad limit state
  const [globalLimit, setGlobalLimit] = useState("0");
  const [savingLimit, setSavingLimit] = useState(false);

  // ── Load banner data ─────────────────────────────────────────────────────────

  useEffect(() => {
    adminFetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        const loaded: Banners = {
          top:        { html: data.adTopHtml        ?? "", name: data.adTopName        ?? "" },
          bottom:     { html: data.adBottomHtml      ?? "", name: data.adBottomName      ?? "" },
          processing: { html: data.adProcessingHtml  ?? "", name: data.adProcessingName  ?? "" },
        };
        setBanners(loaded);
        setSavedBanners(loaded);
        setBannersLoaded(true);
      })
      .catch(() => setBannersLoaded(true));
  }, []);

  // ── Load InFeed data ─────────────────────────────────────────────────────────

  useEffect(() => {
    adminFetch("/api/admin/site-config")
      .then(r => r.json())
      .then((data: { inFeedAd?: Partial<InFeedAd> }) => {
        const loaded: InFeedAd = { ...DEFAULT_INFEED, ...(data.inFeedAd ?? {}) };
        setInFeed(loaded);
        setSavedInFeed(loaded);
        setInFeedLoaded(true);
      })
      .catch(() => setInFeedLoaded(true));
  }, []);

  // ── Load global ad limit ─────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${getBaseUrl()}/api/settings`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, string> | null) => {
        if (d?.adDailyGlobalLimit !== undefined) setGlobalLimit(d.adDailyGlobalLimit);
      })
      .catch(() => {});
  }, []);

  async function saveGlobalLimit() {
    setSavingLimit(true);
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adDailyGlobalLimit: globalLimit }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Saved", description: "Daily ad limit updated." });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    } finally { setSavingLimit(false); }
  }

  // ── Load video ads ───────────────────────────────────────────────────────────

  const loadVideoAds = useCallback(() => {
    setVideoLoading(true);
    adminFetch("/api/admin/ads/video-ads")
      .then(r => r.json())
      .then((data: VideoAd[]) => setVideoAds(data))
      .catch(() => setVideoAds([]))
      .finally(() => setVideoLoading(false));
  }, []);

  useEffect(() => { loadVideoAds(); }, [loadVideoAds]);

  // ── Save banner slot ─────────────────────────────────────────────────────────

  async function saveBannerSlot(slot: "top" | "bottom" | "processing") {
    setSavingSlot(slot);
    const htmlKey  = slot === "top" ? "adTopHtml"   : slot === "bottom" ? "adBottomHtml"   : "adProcessingHtml";
    const nameKey  = slot === "top" ? "adTopName"   : slot === "bottom" ? "adBottomName"   : "adProcessingName";
    const slotData = banners[slot];
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [htmlKey]: slotData.html, [nameKey]: slotData.name }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedBanners(p => ({ ...p, [slot]: { ...slotData } }));
      window.dispatchEvent(new CustomEvent("adSettingsChanged", {
        detail: { [htmlKey]: slotData.html, [nameKey]: slotData.name },
      }));
      const label = slot === "top" ? "Top" : slot === "bottom" ? "Bottom" : "Processing Screen";
      toast({ title: "Ad slot saved", description: `${label} ad is now live.` });
    } catch {
      toast({ title: "Error", description: "Could not save ad.", variant: "destructive" });
    } finally {
      setSavingSlot(null);
    }
  }

  function clearBannerSlot(slot: "top" | "bottom" | "processing") {
    setBanners(p => ({ ...p, [slot]: { ...p[slot], html: "" } }));
  }

  // ── Save InFeed ──────────────────────────────────────────────────────────────

  async function saveInFeed() {
    setSavingInFeed(true);
    try {
      const res = await adminFetch("/api/admin/site-config/inFeedAd", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inFeed),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedInFeed({ ...inFeed });
      toast({ title: "In-Feed Ad saved" });
    } catch {
      toast({ title: "Error", description: "Could not save In-Feed Ad.", variant: "destructive" });
    } finally {
      setSavingInFeed(false);
    }
  }

  // ── Video Ads actions ────────────────────────────────────────────────────────

  async function addVideoAd() {
    if (!newAd.name.trim() || !newAd.url.trim()) return;
    setAddingAd(true);
    try {
      const res = await adminFetch("/api/admin/ads/video-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAd),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Server error");
      }
      setNewAd({ name: "", url: "", type: "vast" });
      loadVideoAds();
      toast({ title: "Video ad added" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Could not add ad", variant: "destructive" });
    } finally {
      setAddingAd(false); }
  }

  async function toggleVideoAd(ad: VideoAd) {
    await adminFetch(`/api/admin/ads/video-ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !ad.enabled }),
    });
    loadVideoAds();
  }

  async function deleteVideoAd(id: string) {
    await adminFetch(`/api/admin/ads/video-ads/${id}`, { method: "DELETE" });
    loadVideoAds();
  }

  async function moveVideoPriority(ad: VideoAd, dir: -1 | 1) {
    const sorted = [...videoAds].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(a => a.id === ad.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swap = sorted[swapIdx]!;
    await Promise.all([
      adminFetch(`/api/admin/ads/video-ads/${ad.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: swap.priority }),
      }),
      adminFetch(`/api/admin/ads/video-ads/${swap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: ad.priority }),
      }),
    ]);
    loadVideoAds();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const TABS: { id: AdTab; label: string; icon: React.ElementType }[] = [
    { id: "banners", label: "Banner Slots", icon: Megaphone },
    { id: "infeed",  label: "In-Feed Ad",   icon: Layers },
    { id: "video",   label: "Video Ads",    icon: Tv2 },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> Ads Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all ad slots in one place. Banner slots, in-feed ads, and global video ads for chains.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── BANNERS TAB ─────────────────────────────────────────────────────── */}
      {tab === "banners" && (
        <div className="space-y-6">
          <div className="p-3 rounded-lg border border-border/50 bg-card/30 text-xs font-mono text-muted-foreground space-y-1">
            <p className="text-foreground/70 font-semibold">Slot locations:</p>
            <p>• <span className="text-primary">Top</span> — below the navbar / headline banner</p>
            <p>• <span className="text-primary">Bottom</span> — above the footer</p>
            <p>• <span className="text-primary">Processing Screen</span> — inside the claim modal while tx is broadcasting</p>
          </div>

          {(["top", "bottom", "processing"] as const).map(slot => {
            const labels = { top: "Top Ad Slot", bottom: "Bottom Ad Slot", processing: "Processing Screen Ad" };
            const htmlDirty = banners[slot].html !== savedBanners[slot].html;
            const nameDirty = banners[slot].name !== savedBanners[slot].name;
            const isDirty   = htmlDirty || nameDirty;
            const isActive  = savedBanners[slot].html.trim().length > 0;
            return (
              <div key={slot} className="space-y-3 p-4 rounded-lg border border-border bg-card/40">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-sm font-semibold">{labels[slot]}</Label>
                  <SlotBadge active={isActive} dirty={isDirty} />
                </div>

                {/* Optional name */}
                <div className="space-y-1">
                  <Label className="text-[11px] font-mono text-muted-foreground">Ad Network Name <span className="opacity-60">(optional)</span></Label>
                  <Input
                    value={banners[slot].name}
                    onChange={e => setBanners(p => ({ ...p, [slot]: { ...p[slot], name: e.target.value } }))}
                    placeholder="e.g. Coinzilla, Bitmedia, AdSense…"
                    className="font-mono text-xs h-8"
                  />
                </div>

                {/* Ad code */}
                <Textarea
                  value={banners[slot].html}
                  onChange={e => setBanners(p => ({ ...p, [slot]: { ...p[slot], html: e.target.value } }))}
                  placeholder={slot === "processing"
                    ? `<!-- Banner image -->\n<img src="https://your-banner.com/ad.gif" style="width:100%" />`
                    : `<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXXX"\n  data-ad-slot="XXXXXX"\n  data-ad-format="auto"></ins>`}
                  className="font-mono text-xs resize-none min-h-[120px]"
                  rows={6}
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveBannerSlot(slot)}
                    disabled={savingSlot === slot || !isDirty}
                    className="font-mono text-xs"
                  >
                    {savingSlot === slot
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                  {banners[slot].html.trim() && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => clearBannerSlot(slot)}
                      className="font-mono text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear Code
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-xs font-mono text-yellow-500/80">
            <p className="font-semibold mb-1">Google AdSense Setup:</p>
            <p>1. Add the AdSense &lt;script&gt; tag in your index.html &lt;head&gt;</p>
            <p>2. Paste your &lt;ins&gt; ad unit code in the slot above</p>
            <p>3. Click Save — the ad will appear immediately on the site</p>
          </div>
        </div>
      )}

      {/* ── IN-FEED TAB ─────────────────────────────────────────────────────── */}
      {tab === "infeed" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Show a banner/GIF ad card inside the chain grid — appears between chain cards at a fixed interval.
          </p>

          {/* Name */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Ad Network Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={inFeed.name}
              onChange={e => setInFeed(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Coinzilla, Bitmedia, A-ADS…"
              className="font-mono bg-card border-border"
            />
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/30">
            <div>
              <p className="text-sm font-mono font-semibold">Enable In-Feed Ads</p>
              <p className="text-xs text-muted-foreground mt-0.5">Show ad cards between chain cards in Testnet &amp; Mainnet grids</p>
            </div>
            <Toggle checked={inFeed.enabled} onChange={v => setInFeed(p => ({ ...p, enabled: v }))} />
          </div>

          {/* Positions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">First Ad Position</Label>
              <Input
                type="number" min={1} max={20}
                value={inFeed.firstPosition}
                onChange={e => setInFeed(p => ({ ...p, firstPosition: Math.max(1, Math.min(20, Number(e.target.value) || 4)) }))}
                className="font-mono bg-card border-border"
              />
              <p className="text-[10px] text-muted-foreground">After how many cards to show first ad (default: 4)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs">Repeat Every N Cards</Label>
              <Input
                type="number" min={2} max={50}
                value={inFeed.interval}
                onChange={e => setInFeed(p => ({ ...p, interval: Math.max(2, Math.min(50, Number(e.target.value) || 6)) }))}
                className="font-mono bg-card border-border"
              />
              <p className="text-[10px] text-muted-foreground">Show another ad every N cards after the first (default: 6)</p>
            </div>
          </div>

          {/* Ad code */}
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Ad Code / HTML</Label>
            <Textarea
              value={inFeed.adCode}
              onChange={e => setInFeed(p => ({ ...p, adCode: e.target.value }))}
              placeholder={`Paste your ad code here. Examples:\n\n<!-- Image/GIF banner -->\n<a href="https://ad-link.com" target="_blank">\n  <img src="https://banner.gif" width="300" height="250" />\n</a>\n\n<!-- Script-based (Coinzilla/Bitmedia) -->\n<div id="zone_12345"></div>\n<script src="https://cdn.coinzilla.io/..."></script>`}
              className="font-mono text-xs bg-card border-border min-h-[180px] resize-y"
            />
            <p className="text-[10px] text-muted-foreground">
              Supports: image/GIF banners, script-based ad network codes (Coinzilla, Bitmedia, Hilltopads). Each slot runs in an isolated iframe.
            </p>
          </div>

          {/* Supported networks */}
          <div className="rounded-xl border border-border bg-card/20 p-4 space-y-2">
            <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Supported Ad Networks</p>
            <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground font-mono">
              {["Coinzilla", "Bitmedia.io", "Hilltopads (banner)", "A-ADS", "Custom GIF/image", "Any HTML banner"].map(n => (
                <span key={n} className="flex items-center gap-1.5">
                  <span className="text-primary">✓</span> {n}
                </span>
              ))}
            </div>
          </div>

          <Button
            onClick={saveInFeed}
            disabled={savingInFeed || (
              inFeed.enabled        === savedInFeed.enabled &&
              inFeed.adCode         === savedInFeed.adCode &&
              inFeed.firstPosition  === savedInFeed.firstPosition &&
              inFeed.interval       === savedInFeed.interval &&
              inFeed.name           === savedInFeed.name
            )}
            className="font-mono text-sm"
          >
            {savingInFeed ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save In-Feed Ad
          </Button>

          {!inFeedLoaded && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          )}
        </div>
      )}

      {/* ── VIDEO ADS TAB ───────────────────────────────────────────────────── */}
      {tab === "video" && (
        <div className="space-y-5">

          {/* ── Daily Limit ── */}
          <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Tv2 className="w-4 h-4 text-primary" />
              <p className="font-mono text-sm font-bold">Daily Ad Watch Limit</p>
            </div>
            <p className="text-xs text-muted-foreground">
              একজন user সব chain মিলিয়ে দিনে সর্বোচ্চ কতটা ad দেখতে পারবে। প্রতিটি chain-এর নিজস্ব limit Chains → chain edit থেকে set করা যায়।
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono">Global Daily Ad Limit <span className="text-muted-foreground font-normal">(0 = unlimited)</span></Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" min="0" step="1"
                  value={globalLimit}
                  onChange={e => setGlobalLimit(e.target.value)}
                  className="font-mono text-sm h-9 w-32"
                  placeholder="0"
                />
                <Button onClick={saveGlobalLimit} disabled={savingLimit} size="sm" className="font-mono">
                  {savingLimit ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save
                </Button>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground">
                {Number(globalLimit) > 0
                  ? `Wallets can watch max ${globalLimit} ad${Number(globalLimit) === 1 ? "" : "s"}/day across all chains`
                  : "No global limit — unlimited ad watches per day"}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg border border-border/50 bg-card/30 text-xs font-mono text-muted-foreground space-y-1">
            <p className="text-foreground/70 font-semibold">Global VAST Video Ads Pool</p>
            <p>These ads are played on any chain that has "Ad Claims" enabled. The player tries them in priority order — if one has no fill, the next is tried automatically.</p>
          </div>

          {/* Video ads list */}
          {videoLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading video ads…
            </div>
          ) : videoAds.length === 0 ? (
            <div className="py-6 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg">
              No video ads configured yet. Add one below.
            </div>
          ) : (
            <div className="space-y-2">
              {[...videoAds].sort((a, b) => a.priority - b.priority).map((ad, idx) => (
                <div
                  key={ad.id}
                  className="flex items-center gap-2 p-3 rounded-lg border"
                  style={{ background: "rgba(255,255,255,0.02)", borderColor: ad.enabled ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.07)" }}
                >
                  <span className="text-[10px] font-mono text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-semibold truncate" style={{ color: ad.enabled ? "#c7d2fe" : "rgba(255,255,255,0.3)" }}>
                      {ad.name}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground truncate">{ad.url}</p>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    {ad.type.toUpperCase()}
                  </span>
                  <button
                    onClick={() => moveVideoPriority(ad, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 shrink-0"
                  >
                    <ArrowUp className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => moveVideoPriority(ad, 1)}
                    disabled={idx === videoAds.length - 1}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 shrink-0"
                  >
                    <ArrowDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => toggleVideoAd(ad)} className="p-1 rounded hover:bg-white/10 shrink-0">
                    {ad.enabled
                      ? <ToggleRight className="w-4 h-4" style={{ color: "#818cf8" }} />
                      : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={() => deleteVideoAd(ad.id)}
                    className="p-1 rounded hover:bg-red-500/20 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new video ad form */}
          <div className="space-y-3 pt-3 border-t border-border">
            <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider">Add Video Ad</p>
            <div className="grid grid-cols-1 gap-2">
              <Input
                placeholder="Ad Network Name (e.g. HilltopAds VAST, Adsterra, HypeLab)"
                value={newAd.name}
                onChange={e => setNewAd(a => ({ ...a, name: e.target.value }))}
                className="font-mono text-xs h-9"
              />
              <select
                value={newAd.type}
                onChange={e => setNewAd(a => ({ ...a, type: e.target.value }))}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring h-9"
              >
                <option value="vast">VAST tag URL — video ad (Adsterra, ExoClick, Clickadu, HilltopAds…)</option>
                <option value="mp4">Direct MP4 URL — self-hosted or CDN video file</option>
                <option value="url">URL / Popunder — opens ad in new tab (PropellerAds, PopAds, AdMaven…)</option>
                <option value="script">Script / HTML — injected embed code (Coinzilla, Bitmedia, custom…)</option>
                <option value="hypelab">HypeLab — rewarded video SDK (placement ID format: id|placement)</option>
              </select>
              <Input
                placeholder={
                  newAd.type === "vast"    ? "https://adsterra.com/vast/tag?... OR https://clickadu.com/vast/..." :
                  newAd.type === "mp4"     ? "https://cdn.example.com/ad-video.mp4" :
                  newAd.type === "url"     ? "https://propellerads.com/your-link OR https://popcash.net/..." :
                  newAd.type === "hypelab" ? "rewarded-3c1099a1d4|3c1099a1d4  (HypeLab placement id|placement)" :
                  newAd.type === "script"  ? "Paste HTML/script embed code here" :
                  "Ad URL, VAST tag, or embed code"
                }
                value={newAd.url}
                onChange={e => setNewAd(a => ({ ...a, url: e.target.value }))}
                className="font-mono text-xs h-9"
              />
            </div>
            <Button
              className="w-full font-mono text-sm"
              disabled={!newAd.name.trim() || !newAd.url.trim() || addingAd}
              onClick={addVideoAd}
            >
              {addingAd ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Video Ad
            </Button>
          </div>

          {/* Supported networks reference */}
          <div className="p-3 rounded-lg border border-border/50 bg-card/20 text-xs font-mono text-muted-foreground space-y-2">
            <p className="text-foreground/70 font-semibold">Ad type reference:</p>
            <div className="space-y-1.5">
              <p><span className="text-primary">VAST tag URL</span> — ✓ Adsterra &nbsp;✓ ExoClick &nbsp;✓ Clickadu &nbsp;✓ HilltopAds &nbsp;✓ TrafficJunky &nbsp;✓ Any IAB VAST-compatible network</p>
              <p><span className="text-primary">Direct MP4</span> — ✓ Self-hosted video &nbsp;✓ CDN file &nbsp;✓ Any direct .mp4 link</p>
              <p><span className="text-primary">URL / Popunder</span> — ✓ PropellerAds &nbsp;✓ PopAds &nbsp;✓ AdMaven &nbsp;✓ Popcash &nbsp;✓ Any redirect/popunder URL</p>
              <p><span className="text-primary">Script / HTML</span> — ✓ Coinzilla &nbsp;✓ Bitmedia.io &nbsp;✓ A-ADS &nbsp;✓ Custom banner/script embed</p>
              <p><span className="text-primary">HypeLab</span> — ✓ HypeLab rewarded video SDK &nbsp;(requires HypeLab account + placement ID)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
