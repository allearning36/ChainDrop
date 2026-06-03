import { useState, useEffect } from "react";
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

function buildSrcDoc(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;background:transparent;overflow:hidden;}body{display:flex;align-items:center;justify-content:center;}</style></head><body>${html}</body></html>`;
}

export function AdSlot({ id, className }: AdSlotProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(90);

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
      } else if ((e as CustomEvent).type === "adSettingsChanged") {
        cachedSettings = null;
        fetchPromise = null;
      }
    };
    window.addEventListener("adSettingsChanged", handler);
    return () => window.removeEventListener("adSettingsChanged", handler);
  }, [id]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "ad-height" && e.data.slotId === id) {
        setIframeHeight(Math.max(60, Number(e.data.height) || 90));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id]);

  if (!html) return null;

  const slotId = id;
  const srcDocWithHeightMsg = buildSrcDoc(
    html +
    `<script>(function(){function send(){var h=document.body.scrollHeight||90;window.parent.postMessage({type:'ad-height',slotId:'${slotId}',height:h},'*');}setTimeout(send,800);setTimeout(send,2000);})()</script>`
  );

  return (
    <div
      id={`ad-slot-${id}`}
      className={cn("w-full overflow-hidden", className)}
      style={{ height: `${iframeHeight}px`, transition: "height 0.3s ease" }}
    >
      <iframe
        key={html}
        srcDoc={srcDocWithHeightMsg}
        className="w-full border-0"
        style={{ height: "100%", display: "block" }}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title={`Advertisement ${id}`}
        scrolling="no"
      />
    </div>
  );
}
