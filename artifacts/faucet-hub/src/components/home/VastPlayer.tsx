import { useEffect, useRef, useState, useCallback } from "react";
import { Play, AlertCircle, RefreshCw } from "lucide-react";

interface VastAd {
  mediaUrl: string;
  mimeType: string;
  impressionUrls: string[];
  trackingUrls: Record<string, string[]>;
  skipOffsetSeconds: number | null;
}

// ── VAST XML parser (browser-side) ───────────────────────────────────────────
// Strips CDATA wrappers and handles any whitespace around them.
function extractCdata(raw: string): string {
  return raw.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

function parseVastXml(xml: string): VastAd | null {
  // Wrapper → recurse (caller handles via resolveVastBrowser)
  const wrapperRe = /<(?:VASTAdTagURI|vastadtaguri)[^>]*>([\s\S]*?)<\/(?:VASTAdTagURI|vastadtaguri)>/i;
  const wrapperMatch = xml.match(wrapperRe);
  if (wrapperMatch) {
    const nextUrl = extractCdata(wrapperMatch[1] ?? "");
    if (nextUrl) return { mediaUrl: "__wrapper__:" + nextUrl, mimeType: "", impressionUrls: [], trackingUrls: {}, skipOffsetSeconds: null };
  }

  // Find the first mp4-capable MediaFile — prefer video/mp4, fallback to others
  const mediaRe = /<MediaFile[^>]*>([\s\S]*?)<\/MediaFile>/gi;
  const typeRe = /\btype="([^"]+)"/i;
  let mediaUrl = "";
  let mimeType = "video/mp4";
  let bestPriority = 999;
  let m: RegExpExecArray | null;

  while ((m = mediaRe.exec(xml)) !== null) {
    const tag = m[0] ?? "";
    const content = m[1] ?? "";
    const typeMatch = tag.match(typeRe);
    const mime = typeMatch ? typeMatch[1].toLowerCase().trim() : "video/mp4";
    const url = extractCdata(content);
    if (!url) continue;

    // Priority: mp4 > webm > other (skip HLS/DASH for now — needs MSE)
    let priority = 10;
    if (mime.includes("mp4")) priority = 0;
    else if (mime.includes("webm")) priority = 1;
    else if (mime.includes("ogg")) priority = 2;
    else if (mime.includes("mpegurl") || mime.includes("dash")) continue; // skip adaptive

    if (priority < bestPriority) {
      bestPriority = priority;
      mediaUrl = url;
      mimeType = mime;
    }
  }

  if (!mediaUrl) return null;

  const impressionUrls: string[] = [];
  const impressionRe = /<Impression[^>]*>([\s\S]*?)<\/Impression>/gi;
  while ((m = impressionRe.exec(xml)) !== null) {
    const u = extractCdata(m[1] ?? "");
    if (u) impressionUrls.push(u);
  }

  const trackingUrls: Record<string, string[]> = {};
  const trackingRe = /<Tracking\s+event="([^"]+)"[^>]*>([\s\S]*?)<\/Tracking>/gi;
  while ((m = trackingRe.exec(xml)) !== null) {
    const ev = (m[1] ?? "").trim();
    const u = extractCdata(m[2] ?? "");
    if (ev && u) {
      if (!trackingUrls[ev]) trackingUrls[ev] = [];
      trackingUrls[ev].push(u);
    }
  }

  let skipOffsetSeconds: number | null = null;
  const skipMatch = xml.match(/skipoffset="([^"]+)"/i);
  if (skipMatch && skipMatch[1] && !skipMatch[1].endsWith("%")) {
    const parts = skipMatch[1].split(":").map(Number);
    if (parts.length === 3) skipOffsetSeconds = (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!;
  }

  return { mediaUrl, mimeType, impressionUrls, trackingUrls, skipOffsetSeconds };
}

// ── VAST resolution ───────────────────────────────────────────────────────────
// 1. Direct MP4/video URL  → use as-is
// 2. VAST tag URL          → fetch browser-side first, fallback to proxy
const VIDEO_EXTS = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;

async function fetchVastXml(url: string, useProxy: boolean): Promise<string> {
  if (useProxy) {
    const res = await fetch(`/api/vast/resolve-xml?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
    const data = await res.json() as { xml?: string; error?: string };
    if (!data.xml) throw new Error(data.error ?? "Empty proxy response");
    return data.xml;
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function resolveVast(vastUrl: string, depth = 0): Promise<VastAd | null> {
  if (depth > 5) return null;

  // Direct video file — no VAST parsing needed
  if (VIDEO_EXTS.test(vastUrl.split("?")[0] ?? "")) {
    return {
      mediaUrl: vastUrl,
      mimeType: "video/mp4",
      impressionUrls: [],
      trackingUrls: {},
      skipOffsetSeconds: null,
    };
  }

  // Try browser-side first, then proxy fallback
  let xml: string;
  try {
    xml = await fetchVastXml(vastUrl, false);
  } catch {
    // Browser-side failed (likely CORS) — try our proxy
    try {
      xml = await fetchVastXml(vastUrl, true);
    } catch {
      return null;
    }
  }

  const parsed = parseVastXml(xml);
  if (!parsed) return null;

  // Wrapper chain — follow it
  if (parsed.mediaUrl.startsWith("__wrapper__:")) {
    const nextUrl = parsed.mediaUrl.slice("__wrapper__:".length);
    return resolveVast(nextUrl, depth + 1);
  }

  return parsed;
}

// ── Beacon helper ─────────────────────────────────────────────────────────────
function beacon(urls: string[] | undefined): void {
  if (!urls) return;
  for (const url of urls) {
    try { navigator.sendBeacon(url); } catch { /* ignore */ }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  vastUrl: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

export function VastPlayer({ vastUrl, onComplete, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const [skipIn, setSkipIn] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const vastRef = useRef<VastAd | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const completedRef = useRef(false);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    beacon(vastRef.current?.trackingUrls["complete"]);
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    if (completedRef.current) return;
    beacon(vastRef.current?.trackingUrls["skip"]);
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Load and resolve the VAST / MP4 URL
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    completedRef.current = false;
    firedRef.current = new Set();

    resolveVast(vastUrl)
      .then(vast => {
        if (cancelled) return;
        if (!vast) {
          const msg = "No playable video ad found. Please try again.";
          setError(msg);
          onError(msg);
          return;
        }
        vastRef.current = vast;
        setLoading(false);

        if (vast.skipOffsetSeconds !== null) {
          setSkipIn(vast.skipOffsetSeconds);
        }

        const vid = videoRef.current;
        if (!vid) return;

        vid.src = vast.mediaUrl;
        vid.load();

        const tryPlay = () =>
          vid.play().catch(() => {
            vid.muted = true;
            setMuted(true);
            return vid.play().catch(() => {
              setError("Tap the screen to start the ad.");
            });
          });

        void tryPlay();
      })
      .catch(err => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load ad.";
        setError(msg);
        onError(msg);
      });

    return () => { cancelled = true; };
  }, [vastUrl, onError]);

  // Video event listeners
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const handlePlay = () => {
      if (!firedRef.current.has("start")) {
        firedRef.current.add("start");
        beacon(vastRef.current?.impressionUrls);
        beacon(vastRef.current?.trackingUrls["start"]);
      }
    };

    const handleTimeUpdate = () => {
      const vast = vastRef.current;
      if (!vast) return;
      const pct = vid.currentTime / (vid.duration || 1);

      if (pct >= 0.25 && !firedRef.current.has("firstQuartile")) {
        firedRef.current.add("firstQuartile");
        beacon(vast.trackingUrls["firstQuartile"]);
      }
      if (pct >= 0.5 && !firedRef.current.has("midpoint")) {
        firedRef.current.add("midpoint");
        beacon(vast.trackingUrls["midpoint"]);
      }
      if (pct >= 0.75 && !firedRef.current.has("thirdQuartile")) {
        firedRef.current.add("thirdQuartile");
        beacon(vast.trackingUrls["thirdQuartile"]);
      }

      if (vast.skipOffsetSeconds !== null && !canSkip) {
        const remaining = Math.ceil(vast.skipOffsetSeconds - vid.currentTime);
        if (remaining <= 0) {
          setCanSkip(true);
          setSkipIn(0);
        } else {
          setSkipIn(remaining);
        }
      }
    };

    const handleEnded = () => handleComplete();

    const handleVideoError = () => {
      setError("Video failed to play. Please try again.");
      onError("Video failed to play.");
    };

    vid.addEventListener("play", handlePlay);
    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("ended", handleEnded);
    vid.addEventListener("error", handleVideoError);

    return () => {
      vid.removeEventListener("play", handlePlay);
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("ended", handleEnded);
      vid.removeEventListener("error", handleVideoError);
    };
  }, [canSkip, handleComplete, onError]);

  const handleTapToPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setError(null);
    void vid.play().catch(() => {
      vid.muted = true;
      setMuted(true);
      void vid.play();
    });
  };

  const handleRetry = () => {
    completedRef.current = false;
    firedRef.current = new Set();
    setError(null);
    setLoading(true);
    setCanSkip(false);
    setSkipIn(null);
    vastRef.current = null;

    resolveVast(vastUrl)
      .then(vast => {
        if (!vast) {
          const msg = "No playable video ad found. Please try again.";
          setError(msg);
          onError(msg);
          return;
        }
        vastRef.current = vast;
        setLoading(false);

        if (vast.skipOffsetSeconds !== null) setSkipIn(vast.skipOffsetSeconds);

        const vid = videoRef.current;
        if (!vid) return;
        vid.src = vast.mediaUrl;
        vid.load();
        void vid.play().catch(() => {
          vid.muted = true;
          setMuted(true);
          void vid.play();
        });
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : "Failed to load ad.";
        setError(msg);
        onError(msg);
      });
  };

  if (loading) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" }}>
        <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "3px solid rgba(217,119,6,0.3)", borderTopColor: "#d97706", animation: "spin 1s linear infinite" }} />
        <p style={{ fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Loading video ad…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle style={{ width: "14px", height: "14px", color: "#f87171", flexShrink: 0 }} />
          <p style={{ fontFamily: "monospace", fontSize: "12px", color: "#f87171" }}>{error}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleTapToPlay}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "10px", background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", fontFamily: "monospace", fontSize: "12px", color: "#d97706", cursor: "pointer" }}
          >
            <Play style={{ width: "14px", height: "14px" }} /> Tap to Play
          </button>
          <button
            onClick={handleRetry}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
          >
            <RefreshCw style={{ width: "13px", height: "13px" }} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000" }}>
      <video
        ref={videoRef}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        playsInline
        controls={false}
      />

      {muted && (
        <button
          onClick={() => { if (videoRef.current) { videoRef.current.muted = false; setMuted(false); } }}
          style={{ position: "absolute", top: "12px", right: "12px", padding: "6px 12px", borderRadius: "8px", background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "monospace", fontSize: "11px", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
        >
          🔇 Tap to unmute
        </button>
      )}

      {vastRef.current?.skipOffsetSeconds !== null && (
        <div style={{ position: "absolute", bottom: "12px", right: "12px" }}>
          {canSkip ? (
            <button
              onClick={handleSkip}
              style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "white", cursor: "pointer" }}
            >
              Skip Ad ›
            </button>
          ) : (
            <div style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.15)", fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Skip in {skipIn}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}
