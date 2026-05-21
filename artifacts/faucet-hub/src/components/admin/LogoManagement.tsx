import { useState, useRef } from "react";
import { Upload, RefreshCw, Check, Image as ImageIcon, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/auth";

interface LogoSettings {
  logoUrl: string;
  logoGlow: string;
  logoSize: string;
}

async function fetchSettings(): Promise<LogoSettings> {
  const res = await fetch("/api/settings");
  return res.json();
}

async function patchSettings(updates: Partial<LogoSettings>): Promise<LogoSettings> {
  const res = await adminFetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.json();
}

async function uploadLogo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await adminFetch("/api/admin/upload", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Upload failed");
  return json.url;
}

const GLOW_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Subtle", value: "subtle" },
  { label: "Medium", value: "medium" },
  { label: "Bright", value: "bright" },
];

const SIZE_OPTIONS = [
  { label: "Small", value: "small" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
];

export function LogoManagement() {
  const [settings, setSettings] = useState<LogoSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Load settings on first render
  useState(() => {
    fetchSettings().then(setSettings);
  });

  const handleSave = async (updates: Partial<LogoSettings>) => {
    if (!settings) return;
    setLoading(true);
    setError("");
    try {
      const updated = await patchSettings(updates);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      // Trigger navbar to reload logo
      window.dispatchEvent(new CustomEvent("logoSettingsChanged", { detail: updated }));
    } catch {
      setError("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadLogo(file);
      await handleSave({ logoUrl: url });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = () => handleSave({ logoUrl: "/logo.svg" });

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const glowStyle = {
    none: "none",
    subtle: "drop-shadow(0 0 4px rgba(34,197,94,0.3))",
    medium: "drop-shadow(0 0 10px rgba(34,197,94,0.6))",
    bright: "drop-shadow(0 0 18px rgba(34,197,94,1))",
  }[settings.logoGlow] ?? "none";

  const sizeMap = { small: 32, medium: 44, large: 60 };
  const previewSize = sizeMap[settings.logoSize as keyof typeof sizeMap] ?? 44;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-primary mb-1">Logo Management</h2>
        <p className="text-sm text-muted-foreground font-mono">Upload a custom logo and adjust how it appears in the navbar.</p>
      </div>

      {/* Preview */}
      <div
        className="rounded-2xl p-6 flex flex-col items-center gap-4"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Live Preview</p>

        {/* Navbar preview mock */}
        <div
          className="w-full rounded-xl flex items-center gap-3 px-4 py-3"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <img
            src={settings.logoUrl}
            alt="Logo preview"
            style={{ width: previewSize, height: previewSize, objectFit: "contain", filter: glowStyle, transition: "all 0.3s" }}
          />
          <div>
            <p className="font-black font-mono uppercase tracking-widest text-primary" style={{ fontSize: 20 }}>ChainDrop</p>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Your Ultimate Faucet Hub</p>
          </div>
        </div>

        <p className="text-[10px] font-mono text-muted-foreground">This is how your logo looks in the navbar</p>
      </div>

      {/* Upload */}
      <div
        className="rounded-2xl p-5 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="font-mono font-semibold text-sm uppercase tracking-widest">Upload Logo</span>
        </div>

        <p className="text-xs text-muted-foreground font-mono">PNG, JPG, SVG, WebP supported. Square image recommended.</p>

        <div className="flex gap-3 flex-wrap">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="gap-2 font-mono font-semibold"
            style={{ background: "linear-gradient(135deg,#166534,#22c55e)", color: "#fff" }}
          >
            {uploading ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Uploading...</>
            ) : (
              <><Upload className="w-4 h-4" /> Choose from Gallery</>
            )}
          </Button>

          <Button variant="outline" onClick={handleReset} disabled={loading} className="gap-2 font-mono text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Reset to Default
          </Button>
        </div>
      </div>

      {/* Adjustments */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary" />
          <span className="font-mono font-semibold text-sm uppercase tracking-widest">Adjustments</span>
        </div>

        {/* Logo Size */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Logo Size</p>
          <div className="flex gap-2">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSettings(s => s ? { ...s, logoSize: opt.value } : s); handleSave({ logoSize: opt.value }); }}
                className="flex-1 py-2 rounded-xl font-mono text-sm font-semibold transition-all"
                style={{
                  background: settings.logoSize === opt.value ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                  border: settings.logoSize === opt.value ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.08)",
                  color: settings.logoSize === opt.value ? "#22c55e" : "rgba(255,255,255,0.5)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Glow Effect */}
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Glow Effect</p>
          <div className="flex gap-2">
            {GLOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setSettings(s => s ? { ...s, logoGlow: opt.value } : s); handleSave({ logoGlow: opt.value }); }}
                className="flex-1 py-2 rounded-xl font-mono text-sm font-semibold transition-all"
                style={{
                  background: settings.logoGlow === opt.value ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                  border: settings.logoGlow === opt.value ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.08)",
                  color: settings.logoGlow === opt.value ? "#22c55e" : "rgba(255,255,255,0.5)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status */}
      {error && (
        <p className="text-sm font-mono text-red-400 px-1">{error}</p>
      )}
      {saved && (
        <div className="flex items-center gap-2 text-sm font-mono text-green-400 px-1">
          <Check className="w-4 h-4" /> Saved successfully
        </div>
      )}
    </div>
  );
}
