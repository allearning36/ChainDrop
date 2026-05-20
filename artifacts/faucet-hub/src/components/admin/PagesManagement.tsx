import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ExternalLink } from "lucide-react";

interface PageData {
  slug: string;
  title: string;
  content: string;
  updatedAt: string | null;
}

const PAGE_LABELS: Record<string, string> = {
  about: "About",
  contact: "Contact",
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
};
const SLUGS = ["about", "contact", "privacy", "terms"];

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` };
}

export function PagesManagement() {
  const { toast } = useToast();
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState("about");
  const [form, setForm] = useState<{ title: string; content: string }>({ title: "", content: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/pages", { headers: authHeaders() })
      .then(r => r.json())
      .then((data: PageData[]) => {
        setPages(data);
        const first = data.find(p => p.slug === "about");
        if (first) setForm({ title: first.title, content: first.content });
      })
      .catch(() => toast({ title: "Error", description: "Failed to load pages", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  function selectPage(slug: string) {
    setActiveSlug(slug);
    const p = pages.find(p => p.slug === slug);
    if (p) setForm({ title: p.title, content: p.content });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/pages/${activeSlug}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setPages(prev => prev.map(p => p.slug === activeSlug ? { ...p, ...form } : p));
      toast({ title: "Saved", description: `${PAGE_LABELS[activeSlug]} page updated.` });
    } catch {
      toast({ title: "Error", description: "Failed to save page", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin w-8 h-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono">Page Content</h2>
        <p className="text-sm text-muted-foreground mt-1">Edit the content of your public pages. Supports markdown headings (#, ##), bold (**text**), and bullet lists (-).</p>
      </div>

      {/* Page selector tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {SLUGS.map(slug => (
          <button
            key={slug}
            onClick={() => selectPage(slug)}
            className={`px-4 py-2 rounded-lg text-sm font-mono transition-colors border ${
              activeSlug === slug
                ? "bg-primary/20 border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            {PAGE_LABELS[slug]}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            /{activeSlug}
          </span>
          <a
            href={`/${activeSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            Preview <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-2">
          <Label htmlFor="page-title" className="font-mono text-xs">Page Title</Label>
          <Input
            id="page-title"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            className="font-mono bg-card border-border"
            placeholder="Page title..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="page-content" className="font-mono text-xs flex items-center justify-between">
            <span>Content</span>
            <span className="text-muted-foreground">{form.content.length} chars</span>
          </Label>
          <Textarea
            id="page-content"
            value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            className="font-mono bg-card border-border text-sm leading-relaxed resize-none"
            rows={22}
            placeholder="Write your page content here..."
          />
          <p className="text-xs text-muted-foreground font-mono">
            # Heading 1 &nbsp;|&nbsp; ## Heading 2 &nbsp;|&nbsp; **bold** &nbsp;|&nbsp; - list item &nbsp;|&nbsp; blank line = new paragraph
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !form.title.trim() || !form.content.trim()}
          className="font-mono"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save {PAGE_LABELS[activeSlug]}
        </Button>
      </div>
    </div>
  );
}
