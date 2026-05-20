import { useEffect, useState } from "react";

interface HeadlineSettings {
  headline: string;
  headlineColor: string;
  headlineBg: string;
  headlineEmoji: string;
}

const DEFAULTS: HeadlineSettings = {
  headline: "",
  headlineColor: "#ffffff",
  headlineBg: "#16a34a",
  headlineEmoji: "📢",
};

export function HeadlineBanner() {
  const [cfg, setCfg] = useState<HeadlineSettings>(DEFAULTS);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setCfg({
          headline: data.headline ?? "",
          headlineColor: data.headlineColor ?? DEFAULTS.headlineColor,
          headlineBg: data.headlineBg ?? DEFAULTS.headlineBg,
          headlineEmoji: data.headlineEmoji ?? DEFAULTS.headlineEmoji,
        });
      })
      .catch(() => {});

    const handler = (e: Event) => {
      const d = (e as CustomEvent<Partial<HeadlineSettings>>).detail;
      setCfg(prev => ({ ...prev, ...d }));
    };
    window.addEventListener("headlineSettingsChanged", handler);
    return () => window.removeEventListener("headlineSettingsChanged", handler);
  }, []);

  if (!cfg.headline.trim()) return null;

  return (
    <div
      className="w-full py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-mono font-semibold tracking-wide select-none"
      style={{
        background: cfg.headlineBg,
        color: cfg.headlineColor,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {cfg.headlineEmoji && (
        <span className="shrink-0 text-base leading-none">{cfg.headlineEmoji}</span>
      )}
      <span className="text-center leading-snug">{cfg.headline}</span>
    </div>
  );
}
