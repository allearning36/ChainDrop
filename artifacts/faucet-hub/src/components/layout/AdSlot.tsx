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

function buildSrcDoc(html: string, slotId: string): string {
  // Height reporter — uses MutationObserver to detect async ad content + long timeouts
  const heightScript = `<script>(function(){
    var slotId='${slotId}';
    function getH(){
      var h=document.body.scrollHeight||0;
      var els=document.body.children;
      for(var i=0;i<els.length;i++){
        var r=els[i].getBoundingClientRect();
        if(r.bottom>h)h=r.bottom;
      }
      return h;
    }
    function report(){
      var h=getH();
      if(h>10)window.parent.postMessage({type:'ad-height',slotId:slotId,height:h},'*');
    }
    // Poll at increasing intervals to catch async ad loads
    [500,1000,2000,3500,5000,7000,10000].forEach(function(t){setTimeout(report,t);});
    // MutationObserver: fires whenever the ad network injects content
    if(window.MutationObserver){
      var ob=new MutationObserver(function(){setTimeout(report,200);});
      ob.observe(document.body,{childList:true,subtree:true,attributes:true});
      setTimeout(function(){ob.disconnect();},12000);
    }
  })()</script>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;background:transparent;overflow:hidden;}body{display:flex;align-items:flex-start;justify-content:center;}</style></head><body>${html}${heightScript}</body></html>`;
}

export function AdSlot({ id, className }: AdSlotProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(0);

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
        setIframeHeight(0);
        if (cachedSettings) cachedSettings[settingKey] = detail[settingKey];
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
        const h = Number(e.data.height);
        if (h > 10) setIframeHeight(prev => Math.max(prev, h));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id]);

  if (!html) return null;

  // Use detected height; fall back to 100px minimum so the ad is never invisible while loading
  const displayHeight = iframeHeight > 10 ? iframeHeight : 100;

  return (
    <div
      id={`ad-slot-${id}`}
      className={cn("w-full overflow-hidden", className)}
      style={{ height: `${displayHeight}px`, transition: "height 0.3s ease" }}
    >
      <iframe
        key={html}
        srcDoc={buildSrcDoc(html, id)}
        className="w-full border-0"
        style={{ height: `${displayHeight}px`, display: "block" }}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        title={`Advertisement ${id}`}
        scrolling="no"
      />
    </div>
  );
}
