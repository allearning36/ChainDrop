interface HeroSectionProps {
  totalChains: number;
}

export function HeroSection({ totalChains }: HeroSectionProps) {
  const stats = [
    { value: totalChains > 0 ? `${totalChains}+` : "50+", label: "Active Chains" },
    { value: "Free", label: "No Registration" },
    { value: "Instant", label: "Token Delivery" },
    { value: "24/7", label: "Always Online" },
  ];

  return (
    <div
      className="w-full relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(34,197,94,0.04) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Ambient glow top-center */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-60px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "200px",
          background: "radial-gradient(ellipse, rgba(34,197,94,0.12) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-4 py-10 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-4">
          <span
            className="px-3 py-1 rounded-full text-[11px] font-mono font-semibold uppercase tracking-widest"
            style={{
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)",
              color: "#22c55e",
            }}
          >
            ✦ Multi-Chain Faucet Hub
          </span>
        </div>

        {/* Headline */}
        <h1
          className="text-3xl sm:text-4xl md:text-5xl font-bold font-mono leading-tight mb-3"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Get Free Crypto Tokens
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #22c55e 0%, #86efac 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Instantly & For Free
          </span>
        </h1>

        {/* Subtext */}
        <p
          className="text-sm sm:text-base mb-8 max-w-xl mx-auto leading-relaxed"
          style={{ color: "rgba(255,255,255,0.45)", fontFamily: "sans-serif" }}
        >
          Claim testnet &amp; mainnet tokens across multiple chains. No registration, no fees — just your wallet address.
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap justify-center gap-3 sm:gap-6">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <span
                className="text-xl sm:text-2xl font-bold font-mono"
                style={{ color: "#22c55e" }}
              >
                {s.value}
              </span>
              <span
                className="text-[11px] font-mono uppercase tracking-wider"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
