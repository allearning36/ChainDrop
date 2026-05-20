import { useEffect, useRef, useState } from "react";

interface AdSlotProps {
  slot: "header" | "inContent" | "footer";
  className?: string;
}

interface AdsIntegration {
  enabled: boolean;
  publisherId: string;
  slots: { header: string; inContent: string; footer: string };
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdSlot({ slot, className }: AdSlotProps) {
  const [adConfig, setAdConfig] = useState<AdsIntegration | null>(null);
  const pushed = useRef(false);

  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.json() as Promise<{ integrations?: { googleAds?: AdsIntegration } }>)
      .then(cfg => {
        const ads = cfg.integrations?.googleAds;
        if (ads?.enabled && ads.publisherId && ads.slots[slot]) {
          setAdConfig(ads);
        }
      })
      .catch(() => {});
  }, [slot]);

  useEffect(() => {
    if (adConfig && !pushed.current) {
      pushed.current = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {}
    }
  }, [adConfig]);

  if (!adConfig) return null;

  const slotId = adConfig.slots[slot];
  if (!slotId) return null;

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={adConfig.publisherId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
