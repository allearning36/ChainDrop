import { useState, useEffect, useRef } from "react";
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

// Inject HTML+scripts directly into a container div.
// dangerouslySetInnerHTML does NOT execute <script> tags,
// so we manually recreate each script element.
function injectAdHtml(container: HTMLDivElement, html: string) {
  container.innerHTML = "";
  const temp = document.createElement("div");
  temp.innerHTML = html;

  Array.from(temp.childNodes).forEach(node => {
    if ((node as Element).tagName === "SCRIPT") {
      const orig = node as HTMLScriptElement;
      const s = document.createElement("script");
      if (orig.src) s.src = orig.src;
      if (orig.async) s.async = true;
      if (orig.getAttribute("data-cfasync") !== null)
        s.setAttribute("data-cfasync", orig.getAttribute("data-cfasync")!);
      if (orig.textContent) s.textContent = orig.textContent;
      container.appendChild(s);
    } else {
      container.appendChild(node.cloneNode(true));
    }
  });
}

export function AdSlot({ id, className }: AdSlotProps) {
  const [html, setHtml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch settings once
  useEffect(() => {
    const settingKey = SETTING_KEY[id];
    if (!settingKey) return;

    getSettings().then(data => {
      const content = (data[settingKey] ?? "").trim();
      setHtml(content || null);
    });

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Record<string, string>>).detail;
      if (detail && settingKey in detail) {
        const content = (detail[settingKey] ?? "").trim();
        setHtml(content || null);
        if (cachedSettings) cachedSettings[settingKey] = detail[settingKey];
      } else if ((e as CustomEvent).type === "adSettingsChanged") {
        cachedSettings = null;
        fetchPromise = null;
      }
    };
    window.addEventListener("adSettingsChanged", handler);
    return () => window.removeEventListener("adSettingsChanged", handler);
  }, [id]);

  // Re-inject whenever html changes
  useEffect(() => {
    if (!html || !containerRef.current) return;
    injectAdHtml(containerRef.current, html);
  }, [html]);

  if (!html) return null;

  return (
    <div
      id={`ad-slot-${id}`}
      ref={containerRef}
      className={cn("w-full overflow-hidden", className)}
      style={{ maxHeight: "120px" }}
    />
  );
}
