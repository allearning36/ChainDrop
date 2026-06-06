interface Props {
  adCode: string;
  slotIndex: number;
}

export function InFeedAdCard({ adCode, slotIndex }: Props) {
  if (!adCode) return null;

  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: transparent;
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    img { max-width: 100%; height: auto; display: block; }
    a { display: block; }
    gif { image-rendering: auto; }
  </style>
</head>
<body>${adCode}</body>
</html>`;

  return (
    <div
      className="rounded-2xl overflow-hidden w-full"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.08)",
        minHeight: "130px",
        position: "relative",
      }}
      aria-label={`Advertisement ${slotIndex + 1}`}
    >
      <span
        className="absolute top-1 left-2 text-[9px] font-mono uppercase tracking-widest pointer-events-none select-none z-10"
        style={{ color: "rgba(255,255,255,0.15)" }}
      >
        ad
      </span>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-same-origin"
        scrolling="no"
        title={`Advertisement ${slotIndex + 1}`}
        style={{
          width: "100%",
          height: "250px",
          border: "none",
          background: "transparent",
          display: "block",
        }}
      />
    </div>
  );
}
