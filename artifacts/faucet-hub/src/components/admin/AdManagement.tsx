import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, Megaphone } from "lucide-react";

interface AdForm {
  adTopHtml: string;
  adBottomHtml: string;
}

const DEFAULTS: AdForm = {
  adTopHtml: "",
  adBottomHtml: "",
};

export function AdManagement() {
  const { toast } = useToast();
  const [form, setForm] = useState<AdForm>(DEFAULTS);
  const [saving, setSaving] = useState<"top" | "bottom" | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setForm({
          adTopHtml:    data.adTopHtml    ?? "",
          adBottomHtml: data.adBottomHtml ?? "",
        });
      })
      .catch(() => {});
  }, []);

  async function saveSlot(slot: "top" | "bottom") {
    setSaving(slot);
    const key = slot === "top" ? "adTopHtml" : "adBottomHtml";
    const value = form[key as keyof AdForm];
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error("Save failed");
      window.dispatchEvent(new CustomEvent("adSettingsChanged", { detail: { [key]: value } }));
      toast({ title: `Ad slot saved`, description: `${slot === "top" ? "Top" : "Bottom"} ad is now live.` });
    } catch {
      toast({ title: "Error", description: "Could not save ad.", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  async function clearSlot(slot: "top" | "bottom") {
    const key = slot === "top" ? "adTopHtml" : "adBottomHtml";
    setForm(p => ({ ...p, [key]: "" }));
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: "" }),
      });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new CustomEvent("adSettingsChanged", { detail: { [key]: "" } }));
      toast({ title: "Ad cleared", description: `${slot === "top" ? "Top" : "Bottom"} ad slot is now empty.` });
    } catch {
      toast({ title: "Error", description: "Could not clear ad.", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold font-mono flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> Ad Slots
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste Google AdSense code, image banners, or any HTML ad code for each slot. Leave empty to hide the slot.
        </p>
      </div>

      <div className="p-3 rounded-lg border border-border/50 bg-card/30 text-xs font-mono text-muted-foreground space-y-1">
        <p className="text-foreground/70 font-semibold">Slot locations:</p>
        <p>• <span className="text-primary">Top</span> — appears just below the navbar / headline banner</p>
        <p>• <span className="text-primary">Bottom</span> — appears just above the footer</p>
      </div>

      {/* Top Ad Slot */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-card/40">
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm font-semibold">Top Ad Slot</Label>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${form.adTopHtml.trim() ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
            {form.adTopHtml.trim() ? "ACTIVE" : "EMPTY"}
          </span>
        </div>
        <Textarea
          value={form.adTopHtml}
          onChange={e => setForm(p => ({ ...p, adTopHtml: e.target.value }))}
          placeholder={'<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXXX"\n  data-ad-slot="XXXXXX"\n  data-ad-format="auto"></ins>'}
          className="font-mono text-xs resize-none min-h-[120px]"
          rows={6}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveSlot("top")}
            disabled={saving === "top"}
            className="font-mono text-xs"
          >
            {saving === "top" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save Top Ad
          </Button>
          {form.adTopHtml.trim() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => clearSlot("top")}
              className="font-mono text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Bottom Ad Slot */}
      <div className="space-y-3 p-4 rounded-lg border border-border bg-card/40">
        <div className="flex items-center justify-between">
          <Label className="font-mono text-sm font-semibold">Bottom Ad Slot</Label>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${form.adBottomHtml.trim() ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
            {form.adBottomHtml.trim() ? "ACTIVE" : "EMPTY"}
          </span>
        </div>
        <Textarea
          value={form.adBottomHtml}
          onChange={e => setForm(p => ({ ...p, adBottomHtml: e.target.value }))}
          placeholder={'<ins class="adsbygoogle"\n  style="display:block"\n  data-ad-client="ca-pub-XXXXXX"\n  data-ad-slot="XXXXXX"\n  data-ad-format="auto"></ins>'}
          className="font-mono text-xs resize-none min-h-[120px]"
          rows={6}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => saveSlot("bottom")}
            disabled={saving === "bottom"}
            className="font-mono text-xs"
          >
            {saving === "bottom" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save Bottom Ad
          </Button>
          {form.adBottomHtml.trim() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => clearSlot("bottom")}
              className="font-mono text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-xs font-mono text-yellow-500/80">
        <p className="font-semibold mb-1">Google AdSense Setup:</p>
        <p>1. Add the AdSense &lt;script&gt; tag in your index.html &lt;head&gt;</p>
        <p>2. Paste your &lt;ins&gt; ad unit code in the slot above</p>
        <p>3. Click Save — the ad will appear immediately on the site</p>
      </div>
    </div>
  );
}
