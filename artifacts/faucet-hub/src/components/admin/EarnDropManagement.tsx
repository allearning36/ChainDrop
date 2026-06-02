import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/auth";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2,
  RefreshCw, X, Key, ListChecks, Zap, Eye, EyeOff,
  Upload, Twitter, MessageCircle, Globe, Send, Copy,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Chain { id: number; name: string; symbol: string; logoUrl?: string; }

interface Campaign {
  id: number; title: string; logoUrl: string;
  rewardAmount: string; rewardToken: string; chainId: number;
  endDate: string; rules: string;
  twitterUrl: string; telegramUrl: string; discordUrl: string; websiteUrl: string;
  promoCodeEnabled: boolean; promoScheduleEnabled: boolean; promoScheduleAt: string | null;
  isActive: boolean; totalParticipants: number; createdAt: string;
}
interface Task {
  id: number; campaignId: number; stepNumber: number; title: string;
  description: string; logoUrl: string; actionType: string; actionUrl: string; actionLabel: string;
}
interface PromoCode {
  id: number; campaignId: number; code: string; maxUses: number;
  usedCount: number; isActive: boolean; createdAt: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const FIELD = "w-full px-3 py-2 rounded-lg text-xs font-mono outline-none";
const FS: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" };

// ── ImageUpload helper ────────────────────────────────────────────────────────

function ImageUpload({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await adminFetch("/api/admin/upload", { method: "POST", body: fd });
      if (!res.ok) { alert("Upload failed"); return; }
      const d = await res.json() as { url: string };
      onChange(d.url); setImgErr(false);
    } finally { setUploading(false); }
  };

  return (
    <div>
      <label className="text-[10px] text-muted-foreground font-mono">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <input
          className={FIELD} style={FS} value={value}
          onChange={e => { onChange(e.target.value); setImgErr(false); }}
          placeholder="https://... or upload →"
        />
        <button
          type="button"
          onClick={() => ref.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-mono shrink-0 transition-colors"
          style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#22c55e" }}
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "" : "Upload"}
        </button>
        {value && !imgErr && (
          <img src={value} alt="" className="w-8 h-8 rounded-full object-contain shrink-0"
            style={{ background: "rgba(255,255,255,0.06)" }} onError={() => setImgErr(true)} />
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) void handleFile(e.target.files[0]); }} />
    </div>
  );
}

// ── CampaignForm ──────────────────────────────────────────────────────────────

interface CampaignFormProps {
  initial?: Campaign | null;
  chains: Chain[];
  onSave: () => void;
  onCancel: () => void;
}
function CampaignForm({ initial, chains, onSave, onCancel }: CampaignFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount ?? "");
  const [rewardToken, setRewardToken] = useState(initial?.rewardToken ?? "");
  const [chainId, setChainId] = useState(String(initial?.chainId ?? (chains[0]?.id ?? "")));
  const [chainSearch, setChainSearch] = useState("");
  const [chainDropOpen, setChainDropOpen] = useState(false);
  const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.slice(0, 16) : "");
  const [rules, setRules] = useState(initial?.rules ?? "");
  const [twitterUrl, setTwitterUrl] = useState(initial?.twitterUrl ?? "");
  const [telegramUrl, setTelegramUrl] = useState(initial?.telegramUrl ?? "");
  const [discordUrl, setDiscordUrl] = useState(initial?.discordUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial?.websiteUrl ?? "");
  const [promoCodeEnabled, setPromoCodeEnabled] = useState(initial?.promoCodeEnabled ?? false);
  const [promoScheduleEnabled, setPromoScheduleEnabled] = useState(initial?.promoScheduleEnabled ?? false);
  const [promoScheduleAt, setPromoScheduleAt] = useState(
    initial?.promoScheduleAt ? initial.promoScheduleAt.slice(0, 16) : ""
  );
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  // inline promo codes for new campaign
  const [promoCodes, setPromoCodes] = useState<{ code: string; maxUses: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const addPromoRow = () => setPromoCodes(prev => [...prev, { code: "", maxUses: "0" }]);
  const removePromoRow = (i: number) => setPromoCodes(prev => prev.filter((_, idx) => idx !== i));
  const updatePromoRow = (i: number, key: "code" | "maxUses", val: string) =>
    setPromoCodes(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const handleSave = async () => {
    if (!title.trim()) { alert("Title is required"); return; }
    if (!rewardAmount.trim()) { alert("Reward amount is required"); return; }
    if (!rewardToken.trim()) { alert("Reward token is required"); return; }
    if (!chainId) { alert("Please select a chain"); return; }
    if (!endDate) { alert("End date is required"); return; }
    setSaving(true);
    try {
      const url = initial ? `/api/admin/earn-drop/campaigns/${initial.id}` : "/api/admin/earn-drop/campaigns";
      const method = initial ? "PUT" : "POST";
      const res = await adminFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), logoUrl, rewardAmount: rewardAmount.trim(),
          rewardToken: rewardToken.trim(), chainId: Number(chainId),
          endDate: new Date(endDate).toISOString(),
          rules, twitterUrl, telegramUrl, discordUrl, websiteUrl,
          promoCodeEnabled,
          promoScheduleEnabled,
          promoScheduleAt: promoCodeEnabled && promoScheduleEnabled && promoScheduleAt
            ? new Date(promoScheduleAt).toISOString()
            : null,
          isActive,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        alert(err.error ?? "Save failed"); return;
      }
      const created = await res.json() as Campaign;
      // add inline promo codes if any
      if (!initial && promoCodeEnabled && promoCodes.length > 0) {
        for (const p of promoCodes) {
          if (!p.code.trim()) continue;
          await adminFetch(`/api/admin/earn-drop/campaigns/${created.id}/promo-codes`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: p.code.trim().toUpperCase(), maxUses: Number(p.maxUses) }),
          });
        }
      }
      onSave();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) => (
    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-muted-foreground select-none" onClick={onChange}>
      <div className="w-9 h-5 rounded-full relative transition-colors shrink-0"
        style={{ background: value ? "#22c55e" : "rgba(255,255,255,0.15)" }}>
        <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all"
          style={{ left: value ? "18px" : "4px" }} />
      </div>
      {label}
    </label>
  );

  return (
    <div className="space-y-4 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">
        {initial ? "✏️ Edit Campaign" : "✨ New Campaign"}
      </p>

      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-[10px] text-muted-foreground font-mono">Title *</label>
          <input className={`${FIELD} mt-1`} style={FS} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. POL Giveaway" />
        </div>
        <div className="sm:col-span-2">
          <ImageUpload value={logoUrl} onChange={setLogoUrl} label="Campaign Logo" />
        </div>
      </div>

      {/* Reward */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Reward Amount *</label>
          <input className={`${FIELD} mt-1`} style={FS} value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} placeholder="10" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Reward Token *</label>
          <input className={`${FIELD} mt-1`} style={FS} value={rewardToken} onChange={e => setRewardToken(e.target.value)} placeholder="POL" />
        </div>
      </div>

      {/* Chain dropdown — searchable */}
      <div className="relative">
        <label className="text-[10px] text-muted-foreground font-mono">Reward Chain * (rewards sent from this chain)</label>
        <div
          className={`${FIELD} mt-1 cursor-pointer flex items-center justify-between`}
          style={FS}
          onClick={() => setChainDropOpen(v => !v)}
        >
          <span style={{ color: chainId ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)" }}>
            {chains.find(c => String(c.id) === chainId)
              ? `${chains.find(c => String(c.id) === chainId)!.name} (${chains.find(c => String(c.id) === chainId)!.symbol})`
              : "— Select chain —"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>▼</span>
        </div>
        {chainDropOpen && (
          <div
            className="absolute z-50 w-full top-full left-0 mt-0.5 rounded-lg overflow-hidden"
            style={{ background: "#0c1018", border: "1px solid rgba(255,255,255,0.14)", maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
          >
            <div className="p-1.5 sticky top-0" style={{ background: "#0c1018", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <input
                autoFocus
                value={chainSearch}
                onChange={e => setChainSearch(e.target.value)}
                placeholder="Search chains…"
                className="w-full px-2 py-1 text-xs font-mono outline-none rounded"
                style={{ background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}
                onClick={e => e.stopPropagation()}
              />
            </div>
            {chains
              .filter(c =>
                chainSearch.trim() === "" ||
                c.name.toLowerCase().includes(chainSearch.toLowerCase()) ||
                c.symbol.toLowerCase().includes(chainSearch.toLowerCase())
              )
              .map(c => (
                <div
                  key={c.id}
                  onClick={() => { setChainId(String(c.id)); setChainDropOpen(false); setChainSearch(""); }}
                  className="px-3 py-2 text-xs font-mono cursor-pointer transition-colors"
                  style={{
                    color: String(c.id) === chainId ? "#22c55e" : "rgba(255,255,255,0.8)",
                    background: String(c.id) === chainId ? "rgba(34,197,94,0.08)" : "transparent",
                  }}
                  onMouseEnter={e => { if (String(c.id) !== chainId) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = String(c.id) === chainId ? "rgba(34,197,94,0.08)" : "transparent"; }}
                >
                  {c.name} ({c.symbol})
                </div>
              ))
            }
            {chains.filter(c =>
              chainSearch.trim() === "" ||
              c.name.toLowerCase().includes(chainSearch.toLowerCase()) ||
              c.symbol.toLowerCase().includes(chainSearch.toLowerCase())
            ).length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground font-mono">No chains found</div>
            )}
          </div>
        )}
      </div>

      {/* End date */}
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">End Date *</label>
        <input className={`${FIELD} mt-1`} style={FS} type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>

      {/* Rules */}
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Rules / Description</label>
        <textarea className={`${FIELD} mt-1 resize-none`} style={{ ...FS, minHeight: 64 }}
          value={rules} onChange={e => setRules(e.target.value)} placeholder="Campaign rules and conditions..." />
      </div>

      {/* Social links */}
      <div>
        <p className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground mb-2">Social Links (optional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mb-1">
              <Twitter className="w-3 h-3" style={{ color: "#1d9bf0" }} /> Twitter / X
            </label>
            <input className={FIELD} style={FS} value={twitterUrl} onChange={e => setTwitterUrl(e.target.value)} placeholder="https://twitter.com/..." />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mb-1">
              <Send className="w-3 h-3" style={{ color: "#229ed9" }} /> Telegram
            </label>
            <input className={FIELD} style={FS} value={telegramUrl} onChange={e => setTelegramUrl(e.target.value)} placeholder="https://t.me/..." />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mb-1">
              <MessageCircle className="w-3 h-3" style={{ color: "#5865f2" }} /> Discord
            </label>
            <input className={FIELD} style={FS} value={discordUrl} onChange={e => setDiscordUrl(e.target.value)} placeholder="https://discord.gg/..." />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mb-1">
              <Globe className="w-3 h-3" style={{ color: "#22c55e" }} /> Website
            </label>
            <input className={FIELD} style={FS} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-6 flex-wrap">
        <Toggle value={promoCodeEnabled} onChange={() => setPromoCodeEnabled(v => !v)} label="Promo Code Required" />
        <Toggle value={isActive} onChange={() => setIsActive(v => !v)} label="Active" />
      </div>

      {/* Promo schedule — only when promoCodeEnabled */}
      {promoCodeEnabled && (
        <div className="space-y-3 rounded-lg p-3" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)" }}>
          <p className="text-[10px] font-mono" style={{ color: "#22c55e" }}>
            <Key className="w-3 h-3 inline mr-1" />
            After saving, go to the <strong>Promo Codes</strong> tab to add codes for this campaign.
          </p>
          <Toggle
            value={promoScheduleEnabled}
            onChange={() => setPromoScheduleEnabled(v => !v)}
            label="Schedule Promo Code Unlock"
          />
          {promoScheduleEnabled && (
            <div>
              <label className="text-[10px] text-muted-foreground font-mono">
                Unlock Time — until this time, a countdown is shown instead of the claim form
              </label>
              <input
                type="datetime-local"
                className={`${FIELD} mt-1`}
                style={FS}
                value={promoScheduleAt}
                onChange={e => setPromoScheduleAt(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving}
          style={{ background: "#22c55e", color: "#000" }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          {saving ? "Saving..." : "Save Campaign"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}

// ── TaskForm ──────────────────────────────────────────────────────────────────

interface TaskFormProps { campaignId: number; initial?: Task | null; onSave: () => void; onCancel: () => void; }
function TaskForm({ campaignId, initial, onSave, onCancel }: TaskFormProps) {
  const [stepNumber, setStepNumber] = useState(String(initial?.stepNumber ?? ""));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [actionType, setActionType] = useState(initial?.actionType ?? "link");
  const [actionUrl, setActionUrl] = useState(initial?.actionUrl ?? "");
  const [actionLabel, setActionLabel] = useState(initial?.actionLabel ?? "Go");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !stepNumber) { alert("Title and step number required"); return; }
    setSaving(true);
    try {
      const url = initial ? `/api/admin/earn-drop/tasks/${initial.id}` : `/api/admin/earn-drop/campaigns/${campaignId}/tasks`;
      const method = initial ? "PUT" : "POST";
      const res = await adminFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepNumber: Number(stepNumber), title: title.trim(), description, logoUrl, actionType, actionUrl, actionLabel }),
      });
      if (!res.ok) { alert("Save failed"); return; }
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3 p-3 rounded-xl mt-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[10px] font-bold font-mono uppercase text-muted-foreground">{initial ? "Edit Task" : "Add Task"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Step #</label>
          <input className={`${FIELD} mt-1`} style={FS} type="number" value={stepNumber} onChange={e => setStepNumber(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Action Type</label>
          <select className={`${FIELD} mt-1`} style={FS} value={actionType} onChange={e => setActionType(e.target.value)}>
            <option value="link">Link (opens URL)</option>
            <option value="none">No action</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Task Title *</label>
        <input className={`${FIELD} mt-1`} style={FS} value={title} onChange={e => setTitle(e.target.value)} placeholder="Follow us on Twitter" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Description</label>
        <input className={`${FIELD} mt-1`} style={FS} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional task description" />
      </div>
      <div>
        <ImageUpload value={logoUrl} onChange={setLogoUrl} label="Task Icon (optional)" />
      </div>
      {actionType === "link" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">Action URL</label>
            <input className={`${FIELD} mt-1`} style={FS} value={actionUrl} onChange={e => setActionUrl(e.target.value)} placeholder="https://twitter.com/..." />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-mono">Button Label</label>
            <input className={`${FIELD} mt-1`} style={FS} value={actionLabel} onChange={e => setActionLabel(e.target.value)} placeholder="Go to Twitter" />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} style={{ background: "#22c55e", color: "#000" }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Save Task
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────

function CampaignRow({ campaign, chains, onRefresh }: { campaign: Campaign; chains: Chain[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addingPromo, setAddingPromo] = useState(false);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoMaxUses, setNewPromoMaxUses] = useState("0");
  const [savingPromo, setSavingPromo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "promos">("tasks");

  const loadDetails = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/tasks`),
        adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/promo-codes`),
      ]);
      if (tRes.ok) setTasks(await tRes.json() as Task[]);
      if (pRes.ok) setPromoCodes(await pRes.json() as PromoCode[]);
    } finally { setLoading(false); }
  }, [campaign.id]);

  const handleExpand = () => {
    if (!expanded) void loadDetails();
    setExpanded(v => !v);
  };

  const deleteTask = async (taskId: number) => {
    if (!confirm("Delete this task?")) return;
    await adminFetch(`/api/admin/earn-drop/tasks/${taskId}`, { method: "DELETE" });
    void loadDetails();
  };

  const deletePromo = async (id: number) => {
    if (!confirm("Delete this promo code?")) return;
    await adminFetch(`/api/admin/earn-drop/promo-codes/${id}`, { method: "DELETE" });
    void loadDetails();
  };

  const deleteCampaign = async () => {
    if (!confirm(`Delete campaign "${campaign.title}" and all its data?`)) return;
    await adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}`, { method: "DELETE" });
    onRefresh();
  };

  const copyCampaign = async () => {
    const res = await adminFetch("/api/admin/earn-drop/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${campaign.title} (Copy)`,
        logoUrl: campaign.logoUrl,
        rewardAmount: campaign.rewardAmount,
        rewardToken: campaign.rewardToken,
        chainId: campaign.chainId,
        endDate: campaign.endDate,
        rules: campaign.rules,
        twitterUrl: campaign.twitterUrl,
        telegramUrl: campaign.telegramUrl,
        discordUrl: campaign.discordUrl,
        websiteUrl: campaign.websiteUrl,
        promoCodeEnabled: campaign.promoCodeEnabled,
        promoScheduleEnabled: false,
        promoScheduleAt: null,
        isActive: false,
      }),
    });
    if (res.ok) onRefresh();
    else alert("Failed to copy campaign");
  };

  const addPromo = async () => {
    if (!newPromoCode.trim()) { alert("Enter a promo code"); return; }
    setSavingPromo(true);
    try {
      const res = await adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/promo-codes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newPromoCode.trim().toUpperCase(), maxUses: Number(newPromoMaxUses) }),
      });
      if (res.ok) { setNewPromoCode(""); setNewPromoMaxUses("0"); setAddingPromo(false); void loadDetails(); }
      else alert("Failed to create promo code");
    } finally { setSavingPromo(false); }
  };

  const toggleActive = async () => {
    await adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !campaign.isActive }),
    });
    onRefresh();
  };

  const chainName = chains.find(c => c.id === campaign.chainId)?.name ?? `Chain #${campaign.chainId}`;
  const isEnded = new Date(campaign.endDate) < new Date();

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {campaign.logoUrl ? (
          <img src={campaign.logoUrl} alt="" className="w-10 h-10 rounded-full object-contain shrink-0"
            style={{ background: "rgba(255,255,255,0.06)" }} />
        ) : (
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(34,197,94,0.1)" }}>
            <Zap className="w-5 h-5" style={{ color: "#22c55e" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold font-mono text-sm text-white truncate">{campaign.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs font-mono font-bold" style={{ color: "#22c55e" }}>
              {campaign.rewardAmount} {campaign.rewardToken}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">· {chainName}</span>
            <span className="text-[10px] text-muted-foreground font-mono">· {campaign.totalParticipants} participants</span>
            <span className="text-[10px] text-muted-foreground font-mono">· {isEnded ? "⛔ ended" : `ends ${fmtDate(campaign.endDate)}`}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-2 h-2 rounded-full" style={{ background: campaign.isActive && !isEnded ? "#22c55e" : "#6b7280" }} />
          <button onClick={() => void toggleActive()} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title={campaign.isActive ? "Disable" : "Enable"}>
            {campaign.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditingCampaign(v => !v)} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => void copyCampaign()} className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-400 transition-colors" title="Copy campaign">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => void deleteCampaign()} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleExpand} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editingCampaign && (
        <div className="px-4 pb-3">
          <CampaignForm
            initial={campaign} chains={chains}
            onSave={() => { setEditingCampaign(false); onRefresh(); }}
            onCancel={() => setEditingCampaign(false)}
          />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex gap-1 mb-3">
            {(["tasks", "promos"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors"
                style={{
                  background: activeTab === tab ? "rgba(34,197,94,0.15)" : "transparent",
                  color: activeTab === tab ? "#22c55e" : "rgba(255,255,255,0.4)",
                  border: activeTab === tab ? "1px solid rgba(34,197,94,0.25)" : "1px solid transparent",
                }}>
                {tab === "tasks" ? <><ListChecks className="w-3 h-3 inline mr-1" />Tasks</> : <><Key className="w-3 h-3 inline mr-1" />Promo Codes</>}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#22c55e" }} /></div>
          ) : activeTab === "tasks" ? (
            <>
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono py-2">No tasks yet. Add tasks below.</p>
                ) : tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-xs font-mono font-bold text-muted-foreground w-5">{task.stepNumber}.</span>
                    {task.logoUrl && <img src={task.logoUrl} alt="" className="w-6 h-6 rounded object-contain shrink-0"
                      style={{ background: "rgba(255,255,255,0.06)" }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-white truncate">{task.title}</p>
                      {task.description && <p className="text-[10px] text-muted-foreground truncate">{task.description}</p>}
                      {task.actionUrl && <p className="text-[10px] truncate" style={{ color: "rgba(34,197,94,0.7)" }}>{task.actionUrl}</p>}
                    </div>
                    <button onClick={() => setEditingTask(editingTask?.id === task.id ? null : task)} className="p-1 text-muted-foreground hover:text-white">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => void deleteTask(task.id)} className="p-1 text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {editingTask && (
                <TaskForm campaignId={campaign.id} initial={editingTask}
                  onSave={() => { setEditingTask(null); void loadDetails(); }}
                  onCancel={() => setEditingTask(null)} />
              )}
              {addingTask ? (
                <TaskForm campaignId={campaign.id}
                  onSave={() => { setAddingTask(false); void loadDetails(); }}
                  onCancel={() => setAddingTask(false)} />
              ) : (
                <Button size="sm" variant="outline" className="mt-2 gap-1.5 text-xs" onClick={() => setAddingTask(true)}>
                  <Plus className="w-3 h-3" /> Add Task
                </Button>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                {promoCodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-mono py-2">No promo codes yet.</p>
                ) : promoCodes.map(code => (
                  <div key={code.id} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="font-mono font-bold text-xs text-white tracking-widest flex-1">{code.code}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {code.usedCount}{code.maxUses > 0 ? `/${code.maxUses}` : ""} uses
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: code.isActive ? "#22c55e" : "#6b7280" }} />
                    <button onClick={() => void deletePromo(code.id)} className="p-1 text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {addingPromo ? (
                <div className="flex gap-2 mt-2 items-end flex-wrap">
                  <div className="flex-1 min-w-32">
                    <label className="text-[10px] text-muted-foreground font-mono">Code</label>
                    <Input value={newPromoCode} onChange={e => setNewPromoCode(e.target.value.toUpperCase())}
                      placeholder="PROMO2025" className="font-mono text-xs h-8 uppercase mt-1"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono">Max Uses (0=∞)</label>
                    <Input type="number" value={newPromoMaxUses} onChange={e => setNewPromoMaxUses(e.target.value)}
                      className="font-mono text-xs h-8 w-24 mt-1"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </div>
                  <Button size="sm" onClick={() => void addPromo()} disabled={savingPromo} style={{ background: "#22c55e", color: "#000" }}>
                    {savingPromo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingPromo(false)}><X className="w-3 h-3" /></Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="mt-2 gap-1.5 text-xs" onClick={() => setAddingPromo(true)}>
                  <Plus className="w-3 h-3" /> Add Promo Code
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EarnDropManagement() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, chRes] = await Promise.all([
        adminFetch("/api/admin/earn-drop/campaigns"),
        fetch("/api/chains"),
      ]);
      if (cRes.ok) setCampaigns(await cRes.json() as Campaign[]);
      if (chRes.ok) setChains(await chRes.json() as Chain[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <Zap className="w-5 h-5" style={{ color: "#22c55e" }} />
          </div>
          <div>
            <h2 className="text-base font-bold font-mono text-white">Earn Drop</h2>
            <p className="text-xs text-muted-foreground font-mono">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNewForm(v => !v)} className="gap-1.5 text-xs"
            style={{ background: "#22c55e", color: "#000" }}>
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {showNewForm && (
        <CampaignForm
          chains={chains}
          onSave={() => { setShowNewForm(false); void load(); }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#22c55e" }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "#22c55e" }} />
          <p className="text-sm text-muted-foreground font-mono">No campaigns yet.</p>
          <p className="text-xs text-muted-foreground font-mono mt-1 opacity-60">Click "+ New Campaign" to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <CampaignRow key={c.id} campaign={c} chains={chains} onRefresh={() => void load()} />
          ))}
        </div>
      )}
    </div>
  );
}
