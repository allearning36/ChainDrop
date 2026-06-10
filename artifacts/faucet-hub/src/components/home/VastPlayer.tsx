import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Play } from "lucide-react";

// ── Minimal IMA SDK type shim ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ima = any;
function getIma(): Ima | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).google?.ima ?? null;
}

// ── Direct video URL detection ────────────────────────────────────────────────
const VIDEO_EXTS = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
function isDirectVideo(url: string) {
  return VIDEO_EXTS.test(url.split("?")[0] ?? "");
}

// ── Beacon helper ─────────────────────────────────────────────────────────────
function beacon(url: string) {
  try { navigator.sendBeacon(url); } catch { /* ignore */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  vastUrl: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

export function VastPlayer({ vastUrl, onComplete, onError }: Props) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adsManagerRef = useRef<Ima>(null);
  const completedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const direct = isDirectVideo(vastUrl);

  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ── IMA SDK path ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (direct) return;

    const container = adContainerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const ima: Ima = getIma();
    if (!ima) {
      setLoading(false);
      const msg = "Ad player SDK not available.";
      setError(msg);
      onError(msg);
      return;
    }

    completedRef.current = false;
    setLoading(true);
    setError(null);

    // AdDisplayContainer must be initialized on user interaction in some browsers,
    // but for pre-roll we call it here — browsers allow it when triggered by user click.
    const adDisplayContainer = new ima.AdDisplayContainer(container, video);
    adDisplayContainer.initialize();

    const adsLoader = new ima.AdsLoader(adDisplayContainer);

    const onAdsManagerLoaded = (evt: Ima) => {
      const am: Ima = evt.getAdsManager(video);
      adsManagerRef.current = am;

      const Evt = ima.AdEvent.Type;
      const ErrEvt = ima.AdErrorEvent.Type;

      am.addEventListener(Evt.LOADED,    () => setLoading(false));
      am.addEventListener(Evt.STARTED,   () => setLoading(false));
      am.addEventListener(Evt.COMPLETE,          handleComplete);
      am.addEventListener(Evt.ALL_ADS_COMPLETED, handleComplete);
      am.addEventListener(Evt.SKIPPED,           handleComplete);

      // IMA SDK fires VAST tracking beacons automatically — no manual beacons needed.

      am.addEventListener(ErrEvt.AD_ERROR, (e: Ima) => {
        const code: number = e.getError?.()?.getErrorCode?.() ?? 0;
        const msg: string  = e.getError?.()?.getMessage?.() ?? "Ad error.";
        // No-fill (303) or any other error — unlock claim so user isn't stuck
        setLoading(false);
        if (code === 303 || code === 1205) {
          // No ad available — complete silently
          handleComplete();
        } else {
          setError(msg);
          onError(msg);
          // Also complete after 3 s so user can still claim
          setTimeout(() => { handleComplete(); }, 3000);
        }
      });

      try {
        am.init(
          container.offsetWidth  || 640,
          container.offsetHeight || 360,
          ima.ViewMode.NORMAL,
        );
        am.start();
      } catch {
        setLoading(false);
        setError("Ad failed to start.");
        onError("Ad failed to start.");
        setTimeout(() => { handleComplete(); }, 3000);
      }
    };

    const onAdError = (evt: Ima) => {
      const msg: string = evt.getError?.()?.getMessage?.() ?? "Failed to load ad.";
      setLoading(false);
      setError(msg);
      onError(msg);
      // Unlock claim after 3 s on loader error too
      setTimeout(() => { handleComplete(); }, 3000);
    };

    adsLoader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onAdsManagerLoaded,
      false,
    );
    adsLoader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      onAdError,
      false,
    );

    const adsRequest = new ima.AdsRequest();
    adsRequest.adTagUrl               = vastUrl;
    adsRequest.linearAdSlotWidth      = container.offsetWidth  || 640;
    adsRequest.linearAdSlotHeight     = container.offsetHeight || 360;
    adsRequest.nonLinearAdSlotWidth   = container.offsetWidth  || 640;
    adsRequest.nonLinearAdSlotHeight  = 80;

    adsLoader.requestAds(adsRequest);

    return () => {
      try { adsManagerRef.current?.destroy?.(); } catch { /* ignore */ }
      adsManagerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, vastUrl, retryKey, handleComplete, onError]);

  // ── Direct MP4 path ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!direct) return;

    const vid = videoRef.current;
    if (!vid) return;

    completedRef.current = false;
    setLoading(false);
    setError(null);

    vid.src = vastUrl;
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

    const onEnded = () => handleComplete();
    const onVidError = () => setError("Video failed to play. Please try again.");

    vid.addEventListener("ended",  onEnded);
    vid.addEventListener("error",  onVidError);
    return () => {
      vid.removeEventListener("ended",  onEnded);
      vid.removeEventListener("error",  onVidError);
    };
  }, [direct, vastUrl, retryKey, handleComplete]);

  // ── Tap-to-play (direct MP4 only) ────────────────────────────────────────────
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
    setError(null);
    setLoading(true);
    setMuted(false);
    setRetryKey(k => k + 1);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>

      {/* Video element — used by IMA SDK as content-video reference, or as player for direct MP4 */}
      <video
        ref={videoRef}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          // For IMA VAST: IMA renders its own video inside adContainer;
          // this element sits beneath and is hidden by the ad layer.
          visibility: direct ? "visible" : "hidden",
          position: direct ? "relative" : "absolute",
        }}
        playsInline
        controls={false}
      />

      {/* IMA ad container — IMA SDK renders the ad video + UI into this div */}
      {!direct && (
        <div
          ref={adContainerRef}
          style={{ position: "absolute", inset: 0, cursor: "pointer" }}
        />
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "12px", background: "#000",
          zIndex: 10,
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            border: "3px solid rgba(217,119,6,0.3)",
            borderTopColor: "#d97706",
            animation: "spin 1s linear infinite",
          }} />
          <p style={{
            fontFamily: "monospace", fontSize: "11px",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Loading video ad…
          </p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Error overlay (non-fatal — shows on top but claim unlocks after timeout) */}
      {error && !loading && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "16px", padding: "24px", background: "rgba(0,0,0,0.85)",
          zIndex: 20,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 16px", borderRadius: "10px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}>
            <AlertCircle style={{ width: "14px", height: "14px", color: "#f87171", flexShrink: 0 }} />
            <p style={{ fontFamily: "monospace", fontSize: "12px", color: "#f87171" }}>{error}</p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {direct && (
              <button
                onClick={handleTapToPlay}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "10px 20px", borderRadius: "10px",
                  background: "rgba(217,119,6,0.15)",
                  border: "1px solid rgba(217,119,6,0.3)",
                  fontFamily: "monospace", fontSize: "12px",
                  color: "#d97706", cursor: "pointer",
                }}
              >
                <Play style={{ width: "14px", height: "14px" }} /> Tap to Play
              </button>
            )}
            <button
              onClick={handleRetry}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "10px 20px", borderRadius: "10px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontFamily: "monospace", fontSize: "12px",
                color: "rgba(255,255,255,0.5)", cursor: "pointer",
              }}
            >
              <RefreshCw style={{ width: "13px", height: "13px" }} /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Unmute button — direct MP4 only */}
      {muted && direct && !error && (
        <button
          onClick={() => {
            if (videoRef.current) { videoRef.current.muted = false; setMuted(false); }
          }}
          style={{
            position: "absolute", top: "12px", right: "12px",
            padding: "6px 12px", borderRadius: "8px",
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(255,255,255,0.2)",
            fontFamily: "monospace", fontSize: "11px",
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
            zIndex: 30,
          }}
        >
          🔇 Tap to unmute
        </button>
      )}
    </div>
  );
}
