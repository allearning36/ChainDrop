interface LogoIconProps {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function LogoIcon({ size = 40, style, className }: LogoIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      width={size}
      height={size}
      style={style}
      className={className}
    >
      <defs>
        <radialGradient id="li_bgGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="li_hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#166534" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
        <linearGradient id="li_hexStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="li_dropGrad" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#15803d" />
        </linearGradient>
        <linearGradient id="li_chainGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <filter id="li_glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="li_dropShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#22c55e" floodOpacity="0.4" />
        </filter>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#li_bgGlow)" />
      <polygon
        points="50,6 88,28 88,72 50,94 12,72 12,28"
        fill="url(#li_hexGrad)"
        stroke="url(#li_hexStroke)"
        strokeWidth="2"
        filter="url(#li_dropShadow)"
      />
      <polygon
        points="50,11 83,30.5 83,69.5 50,89 17,69.5 17,30.5"
        fill="none"
        stroke="#22c55e"
        strokeWidth="0.5"
        strokeOpacity="0.3"
      />
      <rect x="13" y="44" width="18" height="12" rx="6" fill="none" stroke="url(#li_chainGrad)" strokeWidth="3" />
      <rect x="16" y="47" width="12" height="6" rx="3" fill="#166534" />
      <rect x="69" y="44" width="18" height="12" rx="6" fill="none" stroke="url(#li_chainGrad)" strokeWidth="3" />
      <rect x="72" y="47" width="12" height="6" rx="3" fill="#166534" />
      <rect x="28" y="48" width="10" height="4" rx="2" fill="#22c55e" opacity="0.7" />
      <rect x="62" y="48" width="10" height="4" rx="2" fill="#22c55e" opacity="0.7" />
      <path
        d="M50 22 C50 22 34 42 34 55 C34 63.8 41.2 71 50 71 C58.8 71 66 63.8 66 55 C66 42 50 22 50 22Z"
        fill="url(#li_dropGrad)"
        filter="url(#li_glow)"
      />
      <ellipse cx="44" cy="48" rx="4" ry="7" fill="white" opacity="0.2" transform="rotate(-20 44 48)" />
      <ellipse cx="42.5" cy="46" rx="1.5" ry="3" fill="white" opacity="0.35" transform="rotate(-20 42.5 46)" />
      <path
        d="M50 30 C50 30 40 46 40 55 C40 59.4 44.5 63 50 63"
        stroke="white"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.15"
        fill="none"
      />
      <circle cx="50" cy="57" r="3" fill="white" opacity="0.25" />
      <circle cx="50" cy="57" r="1.5" fill="white" opacity="0.5" />
      <circle cx="50" cy="18" r="1.2" fill="#86efac" opacity="0.8" />
      <circle cx="58" cy="22" r="0.8" fill="#86efac" opacity="0.5" />
      <circle cx="42" cy="22" r="0.8" fill="#86efac" opacity="0.5" />
    </svg>
  );
}

export function isDefaultLogo(url: string): boolean {
  return !url || url.includes("logo.svg");
}
