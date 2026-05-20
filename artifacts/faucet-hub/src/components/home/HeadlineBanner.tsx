import { useEffect, useState } from "react";

interface HeadlineSettings {
  headline: string;
  headlineColor: string;
  headlineBg: string;
  headlineEmoji: string;
}

interface SocialLinks {
  twitter: string;
  telegram: string;
}

const DEFAULTS: HeadlineSettings = {
  headline: "",
  headlineColor: "#ffffff",
  headlineBg: "#16a34a",
  headlineEmoji: "📢",
};

function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function HeadlineBanner() {
  const [cfg, setCfg] = useState<HeadlineSettings>(DEFAULTS);
  const [social, setSocial] = useState<SocialLinks>({ twitter: "", telegram: "" });

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setCfg({
          headline:      data.headline      ?? "",
          headlineColor: data.headlineColor ?? DEFAULTS.headlineColor,
          headlineBg:    data.headlineBg    ?? DEFAULTS.headlineBg,
          headlineEmoji: data.headlineEmoji ?? DEFAULTS.headlineEmoji,
        });
      })
      .catch(() => {});

    fetch("/api/site-config/public")
      .then(r => r.json())
      .then((d: { socialLinks?: { twitter?: string; telegram?: string } }) => {
        setSocial({
          twitter:  d.socialLinks?.twitter  ?? "",
          telegram: d.socialLinks?.telegram ?? "",
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

  const hasSocial = social.twitter || social.telegram;

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
      {/* scrolling track — duplicated for seamless loop */}
      <div className="headline-marquee-track" style={{ color: cfg.headlineColor }}>
        {item}{item}{item}{item}
      </div>

      {/* left fade shadow */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "60px",
          pointerEvents: "none",
          background: `linear-gradient(to right, rgba(${rgb},1) 0%, rgba(${rgb},0) 100%)`,
        }}
      />
      {/* right fade shadow — shorter when social icons present */}
      <div
        style={{
          position: "absolute",
          right: hasSocial ? 72 : 0,
          top: 0,
          bottom: 0,
          width: "60px",
          pointerEvents: "none",
          background: `linear-gradient(to left, rgba(${rgb},1) 0%, rgba(${rgb},0) 100%)`,
        }}
      />

      {/* Social icon buttons — pinned right */}
      {hasSocial && (
        <div
          className="absolute right-0 top-0 bottom-0 flex items-center gap-1 px-2 z-10"
          style={{ background: `rgba(${rgb},1)` }}
        >
          {social.telegram && (
            <a
              href={social.telegram}
              target="_blank"
              rel="noopener noreferrer"
              title="Telegram"
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: cfg.headlineColor,
              }}
            >
              <TelegramIcon size={14} />
            </a>
          )}
          {social.twitter && (
            <a
              href={social.twitter}
              target="_blank"
              rel="noopener noreferrer"
              title="X (Twitter)"
              className="flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
              style={{
                background: "rgba(255,255,255,0.15)",
                color: cfg.headlineColor,
              }}
            >
              <XIcon size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
