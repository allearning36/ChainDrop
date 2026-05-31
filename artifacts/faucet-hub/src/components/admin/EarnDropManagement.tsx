import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/auth";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, X, Users, Key, ListChecks, Zap, Eye, EyeOff,
} from "lucide-react";

interface Campaign {
  id: number; title: string; logoUrl: string; rewardAmount: string; rewardToken: string;
  chainId: number; endDate: string; rules: string; promoCodeEnabled: boolean;
  isActive: boolean; totalParticipants: number; createdAt: string;
}
interface Task {
  id: number; campaignId: number; stepNumber: number; title: string; description: string;
  logoUrl: string; actionType: string; actionUrl: string; actionLabel: string;
}
interface PromoCode {
  id: number; campaignId: number; code: string; maxUses: number; usedCount: number;
  isActive: boolean; createdAt: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toast(msg: string) { alert(msg); }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── CampaignForm ──────────────────────────────────────────────────────────────

interface CampaignFormProps {
  initial?: Campaign | null;
  onSave: () => void;
  onCancel: () => void;
}
function CampaignForm({ initial, onSave, onCancel }: CampaignFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [rewardAmount, setRewardAmount] = useState(initial?.rewardAmount ?? "");
  const [rewardToken, setRewardToken] = useState(initial?.rewardToken ?? "");
  const [chainId, setChainId] = useState(String(initial?.chainId ?? ""));
  const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.slice(0, 16) : "");
  const [rules, setRules] = useState(initial?.rules ?? "");
  const [promoCodeEnabled, setPromoCodeEnabled] = useState(initial?.promoCodeEnabled ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title || !rewardAmount || !rewardToken || !chainId || !endDate) {
      toast("Please fill in all required fields"); return;
    }
    setSaving(true);
    try {
      const url = initial ? `/api/admin/earn-drop/campaigns/${initial.id}` : "/api/admin/earn-drop/campaigns";
      const method = initial ? "PUT" : "POST";
      const res = await adminFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, logoUrl, rewardAmount, rewardToken, chainId: Number(chainId), endDate: new Date(endDate).toISOString(), rules, promoCodeEnabled, isActive }),
      });
      if (!res.ok) { toast("Save failed"); return; }
      onSave();
    } finally { setSaving(false); }
  };

  const field = "w-full px-3 py-2 rounded-lg text-xs font-mono outline-none";
  const fStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" };

  return (
    <div className="space-y-3 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-bold font-mono uppercase tracking-wider text-muted-foreground">{initial ? "Edit Campaign" : "New Campaign"}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Title *</label>
          <input className={field} style={fStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Arbitrum ETH" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Logo URL</label>
          <input className={field} style={fStyle} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Reward Amount *</label>
          <input className={field} style={fStyle} value={rewardAmount} onChange={e => setRewardAmount(e.target.value)} placeholder="1.5" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Reward Token *</label>
          <input className={field} style={fStyle} value={rewardToken} onChange={e => setRewardToken(e.target.value)} placeholder="POL" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Chain ID * (send from)</label>
          <input className={field} style={fStyle} type="number" value={chainId} onChange={e => setChainId(e.target.value)} placeholder="1" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">End Date *</label>
          <input className={field} style={fStyle} type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Rules / Info</label>
        <textarea
          className={`${field} resize-none`} style={{ ...fStyle, minHeight: 72 }}
          value={rules} onChange={e => setRules(e.target.value)}
          placeholder="Rules that users must follow..."
        />
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-muted-foreground">
          <div
            className="w-9 h-5 rounded-full relative transition-colors"
            style={{ background: promoCodeEnabled ? "#22c55e" : "rgba(255,255,255,0.15)" }}
            onClick={() => setPromoCodeEnabled(v => !v)}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: promoCodeEnabled ? "18px" : "4px" }} />
          </div>
          Promo Code Required
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-muted-foreground">
          <div
            className="w-9 h-5 rounded-full relative transition-colors"
            style={{ background: isActive ? "#22c55e" : "rgba(255,255,255,0.15)" }}
            onClick={() => setIsActive(v => !v)}
          >
            <div className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all" style={{ left: isActive ? "18px" : "4px" }} />
          </div>
          Active
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} style={{ background: "#22c55e", color: "#000" }}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null} Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── TaskForm ──────────────────────────────────────────────────────────────────

interface TaskFormProps {
  campaignId: number;
  initial?: Task | null;
  onSave: () => void;
  onCancel: () => void;
}
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
    if (!title || !stepNumber) { toast("Title and step number required"); return; }
    setSaving(true);
    try {
      const url = initial ? `/api/admin/earn-drop/tasks/${initial.id}` : `/api/admin/earn-drop/campaigns/${campaignId}/tasks`;
      const method = initial ? "PUT" : "POST";
      const res = await adminFetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepNumber: Number(stepNumber), title, description, logoUrl, actionType, actionUrl, actionLabel }),
      });
      if (!res.ok) { toast("Save failed"); return; }
      onSave();
    } finally { setSaving(false); }
  };

  const field = "w-full px-3 py-2 rounded-lg text-xs font-mono outline-none";
  const fStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" };

  return (
    <div className="space-y-3 p-3 rounded-xl mt-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[10px] font-bold font-mono uppercase text-muted-foreground">{initial ? "Edit Task" : "Add Task"}</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Step #</label>
          <input className={field} style={fStyle} type="number" value={stepNumber} onChange={e => setStepNumber(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Logo URL</label>
          <input className={field} style={fStyle} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Title *</label>
        <input className={field} style={fStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Follow ChainDrop on X" />
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground font-mono">Description</label>
        <input className={field} style={fStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Task description..." />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Action Type</label>
          <select className={field} style={fStyle} value={actionType} onChange={e => setActionType(e.target.value)}>
            <option value="link">Link</option>
            <option value="none">None</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Action URL</label>
          <input className={field} style={fStyle} value={actionUrl} onChange={e => setActionUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-mono">Button Label</label>
          <input className={field} style={fStyle} value={actionLabel} onChange={e => setActionLabel(e.target.value)} placeholder="Go to Twitter" />
        </div>
      </div>
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

function CampaignRow({ campaign, onRefresh }: { campaign: Campaign; onRefresh: () => void }) {
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
  const [activeTab, setActiveTab] = useState<"tasks"|"promos">("tasks");

  const loadDetails = async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/tasks`),
        adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/promo-codes`),
      ]);
      if (tRes.ok) setTasks(await tRes.json() as Task[]);
      if (pRes.ok) setPromoCodes(await pRes.json() as PromoCode[]);
    } finally { setLoading(false); }
  };

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

  const addPromo = async () => {
    if (!newPromoCode.trim()) { toast("Enter a promo code"); return; }
    setSavingPromo(true);
    try {
      const res = await adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}/promo-codes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newPromoCode.trim().toUpperCase(), maxUses: Number(newPromoMaxUses) }),
      });
      if (res.ok) { setNewPromoCode(""); setNewPromoMaxUses("0"); setAddingPromo(false); void loadDetails(); }
      else toast("Failed to create promo code");
    } finally { setSavingPromo(false); }
  };

  const toggleActive = async () => {
    await adminFetch(`/api/admin/earn-drop/campaigns/${campaign.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !campaign.isActive }),
    });
    onRefresh();
  };

  const isEnded = new Date(campaign.endDate) < new Date();

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.015)" }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {campaign.logoUrl ? (
          <img src={campaign.logoUrl} alt="" className="w-9 h-9 rounded-full object-contain shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />
        ) : (
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.1)" }}>
            <Zap className="w-4 h-4" style={{ color: "#22c55e" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold font-mono text-sm text-white truncate">{campaign.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-mono font-bold" style={{ color: "#22c55e" }}>{campaign.rewardAmount} {campaign.rewardToken}</span>
            <span className="text-[10px] text-muted-foreground font-mono">· {campaign.totalParticipants} participants</span>
            <span className="text-[10px] text-muted-foreground font-mono">· ends {fmtDate(campaign.endDate)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-2 h-2 rounded-full" style={{ background: campaign.isActive && !isEnded ? "#22c55e" : "#6b7280" }} />
          <button onClick={() => void toggleActive()} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" title={campaign.isActive ? "Disable" : "Enable"}>
            {campaign.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setEditingCampaign(v => !v)} className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => void deleteCampaign()} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 transition-colors">
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
          <CampaignForm initial={campaign} onSave={() => { setEditingCampaign(false); onRefresh(); }} onCancel={() => setEditingCampaign(false)} />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {/* Tab bar */}
          <div className="flex gap-1 mb-3">
            {(["tasks", "promos"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors"
                style={{ background: activeTab === tab ? "rgba(34,197,94,0.15)" : "transparent", color: activeTab === tab ? "#22c55e" : "rgba(255,255,255,0.4)", border: activeTab === tab ? "1px solid rgba(34,197,94,0.25)" : "1px solid transparent" }}>
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
                  <p className="text-xs text-muted-foreground font-mono py-2">No tasks yet.</p>
                ) : tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-xs font-mono font-bold text-muted-foreground w-5">{task.stepNumber}.</span>
                    {task.logoUrl && <img src={task.logoUrl} alt="" className="w-6 h-6 rounded object-contain" style={{ background: "rgba(255,255,255,0.06)" }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-white truncate">{task.title}</p>
                      {task.description && <p className="text-[10px] text-muted-foreground truncate">{task.description}</p>}
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
                  <div key={code.id} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="font-mono font-bold text-xs text-white tracking-widest">{code.code}</span>
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                      {code.usedCount}{code.maxUses > 0 ? `/${code.maxUses}` : ""} uses
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: code.isActive ? "#22c55e" : "#6b7280" }} />
                    <button onClick={() => void deletePromo(code.id)} className="p-1 text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {addingPromo ? (
                <div className="flex gap-2 mt-2 items-end">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono">Code</label>
                    <Input value={newPromoCode} onChange={e => setNewPromoCode(e.target.value.toUpperCase())} placeholder="SUMMERQ" className="font-mono text-xs h-8 uppercase" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-mono">Max Uses (0=unlimited)</label>
                    <Input type="number" value={newPromoMaxUses} onChange={e => setNewPromoMaxUses(e.target.value)} className="font-mono text-xs h-8 w-24" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
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
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/earn-drop/campaigns");
      if (res.ok) setCampaigns(await res.json() as Campaign[]);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
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
          <Button size="sm" onClick={() => setShowNewForm(v => !v)} className="gap-1.5 text-xs" style={{ background: "#22c55e", color: "#000" }}>
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {showNewForm && (
        <CampaignForm
          onSave={() => { setShowNewForm(false); void load(); }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#22c55e" }} /></div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "#22c55e" }} />
          <p className="text-sm text-muted-foreground font-mono">No campaigns yet.</p>
          <p className="text-xs text-muted-foreground font-mono mt-1 opacity-60">Create one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => <CampaignRow key={c.id} campaign={c} onRefresh={() => void load()} />)}
        </div>
      )}
    </div>
  );
}
