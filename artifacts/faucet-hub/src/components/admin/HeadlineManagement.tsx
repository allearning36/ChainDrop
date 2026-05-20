import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, Type } from "lucide-react";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

interface HeadlineForm {
  headline: string;
  headlineColor: string;
  headlineBg: string;
  headlineEmoji: string;
}

const DEFAULTS: HeadlineForm = {
  headline: "",
  headlineColor: "#ffffff",
  headlineBg: "#16a34a",
  headlineEmoji: "📢",
};

export function HeadlineManagement() {
  const { toast } = useToast();
  const [form, setForm] = useState<HeadlineForm>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setForm({
          headline: data.headline ?? "",
          headlineColor: data.headlineColor ?? DEFAULTS.headlineColor,
          headlineBg: data.headlineBg ?? DEFAULTS.headlineBg,
          headlineEmoji: data.headlineEmoji ?? DEFAULTS.headlineEmoji,
        });
      })
      .catch(() => {});
  }, []);

  const set = <K extends keyof HeadlineForm>(k: K, v: HeadlineForm[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      window.dispatchEvent(new CustomEvent("headlineSettingsChanged", { detail: form }));
      toast({ title: "Headline saved", description: "The headline bar is now live." });
    } catch {
      toast({ title: "Error", description: "Could not save headline.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      const cleared = { ...form, headline: "" };
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ headline: "" }),
      });
      if (!res.ok) throw new Error("Clear failed");
      setForm(cleared);
      window.dispatchEvent(new CustomEvent("headlineSettingsChanged", { detail: cleared }));
      toast({ title: "Headline cleared", description: "The headline bar is now hidden." });
    } catch {
      toast({ title: "Error", description: "Could not clear headline.", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" /> Headline Bar
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set a headline message shown at the top of the site. Leave blank to hide the bar.
        </p>
      </div>

      {/* Live Preview */}
      {form.headline.trim() && (
        <div className="rounded-lg overflow-hidden border border-border">
          <p className="text-[10px] font-mono text-muted-foreground px-3 py-1 bg-card border-b border-border">
            PREVIEW
          </p>
          <div
            className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-mono font-semibold tracking-wide"
            style={{ background: form.headlineBg, color: form.headlineColor }}
          >
            {form.headlineEmoji && <span className="text-base leading-none">{form.headlineEmoji}</span>}
            <span>{form.headline}</span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs">Headline Text</Label>
          <Textarea
            value={form.headline}
            onChange={e => set("headline", e.target.value)}
            placeholder="e.g. 🚀 New chains added! Claim your testnet tokens now."
            className="font-mono text-sm resize-none"
            rows={3}
          />
          <p className="text-[11px] text-muted-foreground font-mono">
            Leave empty to hide the headline bar completely.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Emoji / Icon</Label>
            <Input
              value={form.headlineEmoji}
              onChange={e => set("headlineEmoji", e.target.value)}
              placeholder="📢"
              className="font-mono text-base"
              maxLength={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Text Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.headlineColor}
                onChange={e => set("headlineColor", e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border bg-transparent p-0.5"
              />
              <Input
                value={form.headlineColor}
                onChange={e => set("headlineColor", e.target.value)}
                placeholder="#ffffff"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-xs">Background Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.headlineBg}
                onChange={e => set("headlineBg", e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border bg-transparent p-0.5"
              />
              <Input
                value={form.headlineBg}
                onChange={e => set("headlineBg", e.target.value)}
                placeholder="#16a34a"
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Quick presets */}
        <div className="space-y-1.5">
          <Label className="font-mono text-xs text-muted-foreground">Quick Color Presets</Label>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Green", bg: "#16a34a", color: "#ffffff" },
              { label: "Blue", bg: "#1d4ed8", color: "#ffffff" },
              { label: "Purple", bg: "#7c3aed", color: "#ffffff" },
              { label: "Orange", bg: "#ea580c", color: "#ffffff" },
              { label: "Red", bg: "#dc2626", color: "#ffffff" },
              { label: "Dark", bg: "#111827", color: "#22c55e" },
              { label: "Gold", bg: "#92400e", color: "#fbbf24" },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => setForm(p => ({ ...p, headlineBg: preset.bg, headlineColor: preset.color }))}
                className="px-3 py-1 rounded text-xs font-mono border border-border/50 transition-all hover:scale-105"
                style={{ background: preset.bg, color: preset.color }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving} className="font-mono">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Headline
        </Button>
        {form.headline.trim() && (
          <Button onClick={clear} disabled={clearing} variant="outline" className="font-mono text-destructive border-destructive/40 hover:bg-destructive/10">
            {clearing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
