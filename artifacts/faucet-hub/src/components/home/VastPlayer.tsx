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

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  vastUrl: string;
  onComplete: () => void;
  onError: (msg: string) => void;
}

export function VastPlayer({ vastUrl, onComplete, onError }: Props) {
  const adContainerRef   = useRef<HTMLDivElement>(null);
  const videoRef         = useRef<HTMLVideoElement>(null);
  const adsManagerRef    = useRef<Ima>(null);
  const adsLoaderRef     = useRef<Ima>(null);
  const adDisplayRef     = useRef<Ima>(null);
  const completedRef     = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [muted,   setMuted]   = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const direct = isDirectVideo(vastUrl);

  // Single-fire complete — prevents double-complete from COMPLETE + ALL_ADS_COMPLETED
  const handleComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Destroy all IMA objects cleanly
  const destroyIma = useCallback(() => {
    try { adsManagerRef.current?.destroy(); }  catch { /* ignore */ }
    try { adsLoaderRef.current?.destroy?.(); } catch { /* ignore */ }
    adsManagerRef.current = null;
    adsLoaderRef.current  = null;
    adDisplayRef.current  = null;
  }, []);

  // ── IMA SDK path ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (direct) return;

    const container = adContainerRef.current;
    const video     = videoRef.current;
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

    // Create display container
    const adDisplayContainer = new ima.AdDisplayContainer(container, video);
    adDisplayRef.current = adDisplayContainer;
    adDisplayContainer.initialize();

    // Create ads loader
    const adsLoader = new ima.AdsLoader(adDisplayContainer);
    adsLoaderRef.current = adsLoader;

    // ── ADS_MANAGER_LOADED ───────────────────────────────────────────────────
    const onAdsManagerLoaded = (evt: Ima) => {
      const am: Ima = evt.getAdsManager(video);
      adsManagerRef.current = am;

      const Evt    = ima.AdEvent.Type;
      const ErrEvt = ima.AdErrorEvent.Type;

      // Show ad as soon as it starts
      am.addEventListener(Evt.LOADED,  () => setLoading(false));
      am.addEventListener(Evt.STARTED, () => setLoading(false));

      // Unlock claim only when ALL ads in the pod are done (not after first of many)
      am.addEventListener(Evt.ALL_ADS_COMPLETED, handleComplete);
      am.addEventListener(Evt.SKIPPED,           handleComplete);

      // Ad-manager level error (mid-playback)
      am.addEventListener(ErrEvt.AD_ERROR, (e: Ima) => {
        const msg: string = e.getError?.()?.getMessage?.() ?? "Ad error.";
        destroyIma();
        setLoading(false);
        setError(msg);
        onError(msg);
        // Let user claim even if mid-playback error
        setTimeout(handleComplete, 2000);
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
        // Silent complete — ad failed to start, don't punish user
        handleComplete();
      }
    };

    // ── ADS_LOADER level error (no fill, bad tag, network) ───────────────────
    // Do NOT show an error to the user — just silently unlock claim.
    // Fill rate <100% is the ad network's problem, not the user's.
    const onAdLoaderError = (_evt: Ima) => {
      destroyIma();
      setLoading(false);
      handleComplete(); // unlock claim silently
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

    // Request ads
    const adsRequest = new ima.AdsRequest();
    adsRequest.adTagUrl              = vastUrl;
    adsRequest.linearAdSlotWidth     = container.offsetWidth  || 640;
    adsRequest.linearAdSlotHeight    = container.offsetHeight || 360;
    adsRequest.nonLinearAdSlotWidth  = container.offsetWidth  || 640;
    adsRequest.nonLinearAdSlotHeight = 80;
    adsLoader.requestAds(adsRequest);

    return () => { destroyIma(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct, vastUrl, retryKey]);

  // ── Direct MP4 path ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!direct) return;

    const vid = videoRef.current;
    if (!vid) return;

    completedRef.current = false;
    setLoading(false);
    setError(null);
    setMuted(false);

    vid.src = vastUrl;
    vid.load();

    const tryPlay = () =>
      vid.play().catch(() => {
        vid.muted = true;
        setMuted(true);
        return vid.play().catch(() => setError("Tap the screen to start the ad."));
      });
    void tryPlay();

    const onEnded   = () => handleComplete();
    const onVidErr  = () => setError("Video failed to play. Please try again.");

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
    setError(null);
    setLoading(!direct); // IMA needs loading state; direct MP4 doesn't
    setMuted(false);
    setRetryKey(k => k + 1);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#000", overflow: "hidden" }}>

      {/* Content video — used by IMA as reference element; actual ad renders in adContainer */}
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

      {/* IMA ad container — IMA SDK renders the ad video + controls into this div */}
      {!direct && (
        <div
          ref={adContainerRef}
          style={{ position: "absolute", inset: 0, cursor: "pointer" }}
        />
      )}

      {/* Loading spinner */}
      {loading && (
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

      {/* Error overlay — only shown for mid-playback errors (no-fill is silent) */}
      {error && !loading && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 20,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "16px", padding: "24px",
          background: "rgba(0,0,0,0.9)",
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
