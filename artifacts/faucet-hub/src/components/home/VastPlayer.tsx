import { useEffect, useRef, useState } from "react";
import { Play, AlertCircle } from "lucide-react";

interface VastAd {
  mediaUrl: string;
  mimeType: string;
  impressionUrls: string[];
  trackingUrls: Record<string, string[]>;
  skipOffsetSeconds: number | null;
}

// Resolve VAST via backend proxy — avoids CORS issues with ad servers
async function resolveVast(vastUrl: string): Promise<VastAd | null> {
  const res = await fetch(`/api/vast/resolve?url=${encodeURIComponent(vastUrl)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Proxy error: HTTP ${res.status}`);
  const data = await res.json() as {
    noFill: boolean;
    mediaUrl?: string;
    mimeType?: string;
    impressionUrls?: string[];
    trackingUrls?: Record<string, string[]>;
    skipOffsetSeconds?: number | null;
  };
  if (data.noFill || !data.mediaUrl) return null;
  return {
    mediaUrl: data.mediaUrl,
    mimeType: data.mimeType ?? "video/mp4",
    impressionUrls: data.impressionUrls ?? [],
    trackingUrls: data.trackingUrls ?? {},
    skipOffsetSeconds: data.skipOffsetSeconds ?? null,
  };
}

function beacon(urls: string[] | undefined): void {
  if (!urls) return;
  for (const url of urls) {
    try { navigator.sendBeacon(url); } catch { /* ignore */ }
  }
}

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

  useEffect(() => {
    let cancelled = false;

    resolveVast(vastUrl)
      .then(vast => {
        if (cancelled) return;
        if (!vast || !vast.mediaUrl) {
          setError("No playable ad found. Please try again.");
          onError("No playable ad found.");
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
  }, [vastUrl]);

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

    const handleEnded = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      beacon(vastRef.current?.trackingUrls["complete"]);
      onComplete();
    };

    const handleError = () => {
      setError("Video failed to play. Please try again.");
      onError("Video failed to play.");
    };

    vid.addEventListener("play", handlePlay);
    vid.addEventListener("timeupdate", handleTimeUpdate);
    vid.addEventListener("ended", handleEnded);
    vid.addEventListener("error", handleError);

    return () => {
      vid.removeEventListener("play", handlePlay);
      vid.removeEventListener("timeupdate", handleTimeUpdate);
      vid.removeEventListener("ended", handleEnded);
      vid.removeEventListener("error", handleError);
    };
  }, [canSkip, onComplete, onError]);

  const handleSkip = () => {
    beacon(vastRef.current?.trackingUrls["skip"]);
    completedRef.current = true;
    onComplete();
  };

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
        <button
          onClick={handleTapToPlay}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "10px", background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)", fontFamily: "monospace", fontSize: "12px", color: "#d97706", cursor: "pointer" }}
        >
          <Play style={{ width: "14px", height: "14px" }} /> Tap to Play
        </button>
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
