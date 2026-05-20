import { useGetBanners, getGetBannersQueryKey } from "@workspace/api-client-react";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Banners() {
  const { data: banners = [] } = useGetBanners({
    query: {
      queryKey: getGetBannersQueryKey()
    }
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeBanners = banners.filter(b => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const goTo = (next: number, dir: "left" | "right") => {
    if (animating || next === currentIndex) return;
    setDirection(dir);
    setPrevIndex(currentIndex);
    setCurrentIndex(next);
    setAnimating(true);
    setTimeout(() => {
      setPrevIndex(null);
      setAnimating(false);
    }, 500);
  };

  const prev = () => {
    const next = (currentIndex - 1 + activeBanners.length) % activeBanners.length;
    goTo(next, "left");
  };

  const next = () => {
    const next = (currentIndex + 1) % activeBanners.length;
    goTo(next, "right");
  };

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    timeoutRef.current = setInterval(() => {
      setDirection("right");
      setPrevIndex((prev) => prev ?? currentIndex);
      setCurrentIndex((prev) => {
        const next = (prev + 1) % activeBanners.length;
        setPrevIndex(prev);
        return next;
      });
      setAnimating(true);
      setTimeout(() => {
        setPrevIndex(null);
        setAnimating(false);
      }, 500);
    }, 5000);
    return () => { if (timeoutRef.current) clearInterval(timeoutRef.current); };
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const current = activeBanners[currentIndex];
  const prev_ = prevIndex !== null ? activeBanners[prevIndex] : null;

  const enterFrom = direction === "right" ? "translate-x-full" : "-translate-x-full";
  const exitTo   = direction === "right" ? "-translate-x-full" : "translate-x-full";

  return (
    <div className="w-full max-w-3xl mx-auto my-6 flex flex-col items-center gap-2">
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground/50 w-full text-center font-mono">
        — Sponsored —
      </div>

      <div className="relative w-full group overflow-hidden rounded-xl border border-white/10"
        style={{ boxShadow: "0 0 24px rgba(34,197,94,0.12), 0 4px 24px rgba(0,0,0,0.5)" }}
      >
        {/* Aspect ratio box */}
        <div className="relative w-full" style={{ aspectRatio: "1200/600" }}>

          {/* Exiting banner */}
          {prev_ && (
            <a
              href={prev_.linkUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className={`absolute inset-0 transition-transform duration-500 ease-in-out ${animating ? exitTo : "translate-x-0"}`}
              style={{ willChange: "transform" }}
            >
              <img
                src={prev_.imageUrl}
                alt={prev_.altText || "Ad banner"}
                className="w-full h-full object-cover"
              />
            </a>
          )}

          {/* Entering banner */}
          <a
            href={current.linkUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={`absolute inset-0 transition-transform duration-500 ease-in-out ${animating ? "translate-x-0" : "translate-x-0"} ${prev_ ? (animating ? "translate-x-0" : enterFrom) : "translate-x-0"}`}
            style={{
              transform: prev_ && animating ? "translateX(0)" : prev_ ? (direction === "right" ? "translateX(100%)" : "translateX(-100%)") : "translateX(0)",
              transition: "transform 500ms cubic-bezier(0.4,0,0.2,1)",
              willChange: "transform",
            }}
          >
            <img
              src={current.imageUrl}
              alt={current.altText || "Ad banner"}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10 group-hover:from-black/0 group-hover:to-black/0 transition-all duration-300" />
          </a>
        </div>

        {/* Prev / Next arrows */}
        {activeBanners.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70 z-10"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70 z-10"
            >
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {activeBanners.length > 1 && (
        <div className="flex gap-1.5 mt-1">
          {activeBanners.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i, i > currentIndex ? "right" : "left")}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === currentIndex ? "20px" : "6px",
                background: i === currentIndex ? "#22c55e" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
