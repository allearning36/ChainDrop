import { useEffect, useState } from "react";

interface HeroConfig {
  enabled: boolean;
  size: "compact" | "medium" | "large";
  badge: string;
  headline: string;
  headlineHighlight: string;
  subtext: string;
  showStats: boolean;
}

const DEFAULT: HeroConfig = {
  enabled: true,
  size: "compact",
  badge: "✦ Multi-Chain Faucet Hub",
  headline: "Get Free Crypto Tokens",
  headlineHighlight: "Instantly & For Free",
  subtext: "Claim testnet & mainnet tokens across multiple chains. No registration, no fees — just your wallet address.",
  showStats: true,
};

const SIZE = {
  compact: { py: "py-5",    h1: "text-xl sm:text-2xl",    sub: "text-xs sm:text-sm", statVal: "text-lg sm:text-xl",   mb1: "mb-2", mb2: "mb-3", mb3: "mb-5" },
  medium:  { py: "py-8",    h1: "text-2xl sm:text-3xl",   sub: "text-sm",             statVal: "text-xl sm:text-2xl",  mb1: "mb-3", mb2: "mb-4", mb3: "mb-6" },
  large:   { py: "py-12",   h1: "text-3xl sm:text-4xl md:text-5xl", sub: "text-sm sm:text-base", statVal: "text-2xl sm:text-3xl", mb1: "mb-3", mb2: "mb-5", mb3: "mb-8" },
};

const STATS = [
  { value: "Free",    label: "No Registration" },
  { value: "Instant", label: "Token Delivery"  },
  { value: "24/7",    label: "Always Online"   },
];

export function HeroSection({ totalChains }: { totalChains: number }) {
  const [cfg, setCfg] = useState<HeroConfig>(DEFAULT);

  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.json())
      .then((d: { heroSection?: Partial<HeroConfig> }) => {
        if (d.heroSection) setCfg(prev => ({ ...prev, ...d.heroSection }));
      })
      .catch(() => {});
  }, []);

  if (!cfg.enabled) return null;

  const s = SIZE[cfg.size] ?? SIZE.compact;
  const chainStat = { value: totalChains > 0 ? `${totalChains}+` : "50+", label: "Active Chains" };
  const stats = cfg.showStats ? [chainStat, ...STATS] : [];

  return (
    <div
      className="w-full relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(34,197,94,0.04) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-60px", left: "50%", transform: "translateX(-50%)",
          width: "500px", height: "160px",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.1) 0%, transparent 70%)",
          filter: "blur(28px)",
        }}
      />

      <div className={`relative max-w-3xl mx-auto px-4 ${s.py} text-center`}>
        {cfg.badge && (
          <div className={`inline-flex items-center gap-2 ${s.mb1}`}>
            <span
              className="px-3 py-1 rounded-full text-[11px] font-mono font-semibold uppercase tracking-widest"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}
            >
              {cfg.badge}
            </span>
          </div>
        )}

        <h1
          className={`${s.h1} font-bold font-mono leading-tight ${s.mb2}`}
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}
        >
          {cfg.headline}
          {cfg.headlineHighlight && (
            <>
              <br />
              <span style={{
                background: "linear-gradient(135deg, #22c55e 0%, #86efac 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>
                {cfg.headlineHighlight}
              </span>
            </>
          )}
        </h1>

        {cfg.subtext && (
          <p
            className={`${s.sub} ${s.mb3} max-w-xl mx-auto leading-relaxed`}
            style={{ color: "rgba(255,255,255,0.45)", fontFamily: "sans-serif" }}
          >
            {cfg.subtext}
          </p>
        )}

        {stats.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 sm:gap-8">
            {stats.map((st) => (
              <div key={st.label} className="flex flex-col items-center gap-0.5">
                <span className={`${s.statVal} font-bold font-mono`} style={{ color: "#22c55e" }}>
                  {st.value}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {st.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
