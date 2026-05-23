import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AdSlotProps {
  id: "home-top" | "home-bottom";
  className?: string;
}

const SETTING_KEY: Record<string, string> = {
  "home-top":    "adTopHtml",
  "home-bottom": "adBottomHtml",
};

let cachedSettings: Record<string, string> | null = null;
let fetchPromise: Promise<Record<string, string>> | null = null;

function getSettings(): Promise<Record<string, string>> {
  if (cachedSettings) return Promise.resolve(cachedSettings);
  if (!fetchPromise) {
    fetchPromise = fetch("/api/settings")
      .then(r => r.json() as Promise<Record<string, string>>)
      .then(d => { cachedSettings = d; return d; })
      .catch(() => {
        fetchPromise = null;
        return {} as Record<string, string>;
      });
  }
  return fetchPromise;
}

export function AdSlot({ id, className }: AdSlotProps) {
  const [html, setHtml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const settingKey = SETTING_KEY[id];
    if (!settingKey) return;

    getSettings().then(data => {
      const content = (data[settingKey] ?? "").trim();
      setHtml(content || null);
    });

    const handler = (e: Event) => {
      const d = (e as CustomEvent<Record<string, string>>).detail;
      if (settingKey in d) {
        const content = (d[settingKey] ?? "").trim();
        setHtml(content || null);
        if (cachedSettings) cachedSettings[settingKey] = d[settingKey];
      }
    };
    window.addEventListener("adSettingsChanged", handler);
    return () => window.removeEventListener("adSettingsChanged", handler);
  }, [id]);

  // Execute scripts inside ad HTML after render
  useEffect(() => {
    if (!html || !containerRef.current) return;
    const container = containerRef.current;
    const scripts = Array.from(container.querySelectorAll("script"));
    scripts.forEach(oldScript => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [html]);

  if (!html) return null;

  return (
    <div
      ref={containerRef}
      id={`ad-slot-${id}`}
      className={cn("w-full overflow-hidden", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
