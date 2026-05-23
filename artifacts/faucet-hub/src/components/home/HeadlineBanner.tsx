import { useEffect, useState } from "react";

interface HeadlineSettings {
  headline: string;
  headlineColor: string;
  headlineBg: string;
  headlineEmoji: string;
  headlineSpeed: number;
}

const DEFAULTS: HeadlineSettings = {
  headline: "",
  headlineColor: "#ffffff",
  headlineBg: "#16a34a",
  headlineEmoji: "📢",
  headlineSpeed: 5,
};

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function speedToDuration(speed: number): string {
  // speed 1 = 50s (slow), speed 5 = 30s (normal), speed 10 = 5s (fast)
  const clamped = Math.max(1, Math.min(10, speed));
  const duration = Math.round(55 - clamped * 5);
  return `${duration}s`;
}

export function HeadlineBanner() {
  const [cfg, setCfg] = useState<HeadlineSettings>(DEFAULTS);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setCfg({
          headline:      data.headline      ?? "",
          headlineColor: data.headlineColor ?? DEFAULTS.headlineColor,
          headlineBg:    data.headlineBg    ?? DEFAULTS.headlineBg,
          headlineEmoji: data.headlineEmoji ?? DEFAULTS.headlineEmoji,
          headlineSpeed: data.headlineSpeed ? Number(data.headlineSpeed) : DEFAULTS.headlineSpeed,
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

  const rgb = hexToRgb(cfg.headlineBg);

  const item = (
    <span className="inline-flex items-center gap-3 px-12 text-sm font-mono font-semibold tracking-wide">
      {cfg.headlineEmoji && (
        <span className="text-base leading-none shrink-0">{cfg.headlineEmoji}</span>
      )}
      <span>{cfg.headline}</span>
    </span>
  );

  return (
    <div
      className="w-full overflow-hidden select-none"
      style={{
        background: cfg.headlineBg,
        color: cfg.headlineColor,
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        position: "relative",
        height: "38px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        className="headline-marquee-track"
        style={{
          color: cfg.headlineColor,
          animationDuration: speedToDuration(cfg.headlineSpeed),
        }}
      >
        {item}{item}{item}{item}
      </div>

      {/* left fade shadow */}
      <div
        style={{
          position: "absolute",
          left: 0, top: 0, bottom: 0,
          width: "80px",
          pointerEvents: "none",
          background: `linear-gradient(to right, rgba(${rgb},1) 0%, rgba(${rgb},0) 100%)`,
        }}
      />
      {/* right fade shadow */}
      <div
        style={{
          position: "absolute",
          right: 0, top: 0, bottom: 0,
          width: "80px",
          pointerEvents: "none",
          background: `linear-gradient(to left, rgba(${rgb},1) 0%, rgba(${rgb},0) 100%)`,
        }}
      />
    </div>
  );
}
