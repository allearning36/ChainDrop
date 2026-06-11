import { useEffect, useRef, useState, useCallback } from "react";
import { AlertCircle, RefreshCw, Play, Clock } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ima = any;
function getIma(): Ima | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).google?.ima ?? null;
}

const VIDEO_EXTS = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
function isDirectVideo(url: string) {
  return VIDEO_EXTS.test(url.split("?")[0] ?? "");
}

interface Props {
  vastUrl: string;
  /** Admin-set ad duration — used as fallback countdown when no ad is available */
  durationSeconds: number;
  onComplete: () => void;
  onError: (msg: string) => void;
}

export function VastPlayer({ vastUrl, durationSeconds, onComplete, onError }: Props) {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef       = useRef<HTMLVideoElement>(null);
  const adsManagerRef  = useRef<Ima>(null);
  const adsLoaderRef   = useRef<Ima>(null);
  const adDisplayRef   = useRef<Ima>(null);
  const completedRef   = useRef(false);
  const adStartedAtRef = useRef<number | null>(null);

  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [muted,            setMuted]            = useState(false);
  const [retryKey,         setRetryKey]         = useState(0);
  /** null = not in fallback mode; >0 = counting down; 0 = ready to complete */
  const [fallbackSecs,     setFallbackSecs]     = useState<number | null>(null);

  const direct = isDirectVideo(vastUrl);

  // ── Single-fire complete ──────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // ── Destroy all IMA objects cleanly ──────────────────────────────────────────
  const destroyIma = useCallback(() => {
    try { adsManagerRef.current?.destroy(); }  catch { /* ignore */ }
    try { adsLoaderRef.current?.destroy?.(); } catch { /* ignore */ }
    adsManagerRef.current = null;
    adsLoaderRef.current  = null;
    adDisplayRef.current  = null;
  }, []);

  // ── Fallback countdown (fires when no ad available) ───────────────────────────
  useEffect(() => {
    if (fallbackSecs === null) return;
    if (fallbackSecs <= 0) {
      handleComplete();
      return;
    }
    const t = setTimeout(() => setFallbackSecs(s => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [fallbackSecs, handleComplete]);

  // ── IMA SDK path ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (direct) return;

    const container = adContainerRef.current;
    const video     = videoRef.current;
    if (!container || !video) return;

    const ima: Ima = getIma();
    if (!ima) {
      setLoading(false);
      // IMA SDK not available — start fallback countdown
      setFallbackSecs(durationSeconds > 0 ? durationSeconds : 10);
      return;
    }

    completedRef.current = false;
    setLoading(true);
    setError(null);
    setFallbackSecs(null);

    const adDisplayContainer = new ima.AdDisplayContainer(container, video);
    adDisplayRef.current = adDisplayContainer;
    adDisplayContainer.initialize();

    const adsLoader = new ima.AdsLoader(adDisplayContainer);
    adsLoaderRef.current = adsLoader;

    // ── ADS_MANAGER_LOADED ──────────────────────────────────────────────────
    const onAdsManagerLoaded = (evt: Ima) => {
      const am: Ima = evt.getAdsManager(video);
      adsManagerRef.current = am;

      const Evt    = ima.AdEvent.Type;
      const ErrEvt = ima.AdErrorEvent.Type;

      am.addEventListener(Evt.LOADED,  () => setLoading(false));
      am.addEventListener(Evt.STARTED, () => {
        setLoading(false);
        adStartedAtRef.current = Date.now();
      });
      // Use ALL_ADS_COMPLETED so multi-ad pods complete fully before unlocking claim
      am.addEventListener(Evt.ALL_ADS_COMPLETED, handleComplete);
      // SKIPPED: user pressed Skip — wait out the remaining server-side duration
      am.addEventListener(Evt.SKIPPED, () => {
        destroyIma();
        setLoading(false);
        const elapsed = adStartedAtRef.current
          ? Math.floor((Date.now() - adStartedAtRef.current) / 1000)
          : 0;
        const remaining = Math.max(0, durationSeconds - elapsed);
        if (remaining <= 0) {
          handleComplete();
        } else {
          // Show countdown so the server token timer is satisfied
          setFallbackSecs(remaining);
        }
      });

      // Mid-playback error → destroy, show error, start fallback countdown
      am.addEventListener(ErrEvt.AD_ERROR, (_e: Ima) => {
        destroyIma();
        setLoading(false);
        setError("Ad interrupted. Unlocking claim shortly…");
        setFallbackSecs(5); // short wait — ad already started
      });

      try {
        am.init(
          container.offsetWidth  || 640,
          container.offsetHeight || 360,
          ima.ViewMode.NORMAL,
        );
        am.start();
      } catch {
        destroyIma();
        setLoading(false);
        setFallbackSecs(5);
      }
    };

    // ── Loader error (no fill, bad tag, network timeout) ─────────────────────
    // No ad available — run full fallback countdown so server timer aligns
    const onAdLoaderError = (_evt: Ima) => {
      destroyIma();
      setLoading(false);
      setFallbackSecs(durationSeconds > 0 ? durationSeconds : 10);
    };

    adsLoader.addEventListener(
      ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      onAdsManagerLoaded,
      false,
    );
    adsLoader.addEventListener(
      ima.AdErrorEvent.Type.AD_ERROR,
      onAdLoaderError,
      false,
    );

    const adsRequest = new ima.AdsRequest();
    adsRequest.adTagUrl              = vastUrl;
    adsRequest.linearAdSlotWidth     = container.offsetWidth  || 640;
    adsRequest.linearAdSlotHeight    = container.offsetHeight || 360;
    adsRequest.nonLinearAdSlotWidth  = container.offsetWidth  || 640;
    adsRequest.nonLinearAdSlotHeight = 80;
    adsLoader.requestAds(adsRequest);

    return () => { destroyIma(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, vastUrl, durationSeconds, retryKey]);

  // ── Direct MP4 path ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!direct) return;

    const vid = videoRef.current;
    if (!vid) return;

    completedRef.current = false;
    setLoading(false);
    setError(null);
    setMuted(false);
    setFallbackSecs(null);

    vid.src = vastUrl;
    vid.load();

    void vid.play().catch(() => {
      vid.muted = true;
      setMuted(true);
      void vid.play().catch(() => setError("Tap the screen to start the ad."));
    });

    const onEnded  = () => handleComplete();
    const onVidErr = () => setError("Video failed to play. Please try again.");

    vid.addEventListener("ended", onEnded);
    vid.addEventListener("error", onVidErr);
    return () => {
      vid.removeEventListener("ended", onEnded);
      vid.removeEventListener("error", onVidErr);
      vid.pause();
      vid.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, vastUrl, retryKey]);

  // ── Visibility change — user clicked the ad link and came back ───────────────
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible" && hiddenAt !== null) {
        const wasHiddenMs = Date.now() - hiddenAt;
        hiddenAt = null;
        if (!completedRef.current && wasHiddenMs > 300) {
          // User came back after clicking the ad — destroy IMA and start short fallback
          destroyIma();
          setLoading(false);
          setFallbackSecs(prev => (prev !== null ? prev : 3));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [destroyIma]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
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
    destroyIma();
    completedRef.current = false;
    adStartedAtRef.current = null;
    setError(null);
    setLoading(!direct);
    setMuted(false);
    setFallbackSecs(null);
    setRetryKey(k => k + 1);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>

      {/* Content video ref for IMA; actual player for direct MP4 */}
      <video
        ref={videoRef}
        style={{
          width: "100%", height: "100%",
          objectFit: "contain", display: "block",
          visibility: direct ? "visible" : "hidden",
          position: "absolute", inset: 0,
        }}
        playsInline
        controls={false}
      />

      {/* IMA ad container */}
      {!direct && (
        <div
          ref={adContainerRef}
          style={{ position: "absolute", inset: 0, cursor: "pointer" }}
        />
      )}

      {/* Loading spinner */}
      {loading && fallbackSecs === null && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "12px", background: "#000",
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
          }}>Loading video ad…</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Fallback countdown (no fill / SDK unavailable) */}
      {fallbackSecs !== null && fallbackSecs > 0 && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 15,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "16px", background: "#000",
        }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            border: "3px solid rgba(217,119,6,0.25)",
            borderTopColor: "#d97706",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontFamily: "monospace", fontSize: "22px", fontWeight: 900, color: "#d97706" }}>
              {fallbackSecs}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock style={{ width: "12px", height: "12px", color: "rgba(255,255,255,0.3)" }} />
            <p style={{
              fontFamily: "monospace", fontSize: "11px",
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>No ad available — please wait</p>
          </div>
        </div>
      )}

      {/* Error overlay (mid-playback errors only) */}
      {error && fallbackSecs === null && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "16px", padding: "24px", background: "rgba(0,0,0,0.92)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 16px", borderRadius: "10px",
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
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
                  background: "rgba(217,119,6,0.15)", border: "1px solid rgba(217,119,6,0.3)",
                  fontFamily: "monospace", fontSize: "12px", color: "#d97706", cursor: "pointer",
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
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
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
          onClick={() => { if (videoRef.current) { videoRef.current.muted = false; setMuted(false); } }}
          style={{
            position: "absolute", top: "12px", right: "12px", zIndex: 30,
            padding: "6px 12px", borderRadius: "8px",
            background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.2)",
            fontFamily: "monospace", fontSize: "11px",
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
          }}
        >
          🔇 Tap to unmute
        </button>
      )}
    </div>
  );
}
