import { useGetBanners, getGetBannersQueryKey } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Banners() {
  const { data: banners = [] } = useGetBanners({
    query: { queryKey: getGetBannersQueryKey() }
  });
  const [currentIndex, setCurrentIndex] = useState(0);

  const activeBanners = banners
    .filter(b => b.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const id = setInterval(() => {
      setCurrentIndex(i => (i + 1) % activeBanners.length);
    }, 5000);
    return () => clearInterval(id);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const prev = () =>
    setCurrentIndex(i => (i - 1 + activeBanners.length) % activeBanners.length);
  const next = () =>
    setCurrentIndex(i => (i + 1) % activeBanners.length);

  return (
    <div className="w-full max-w-3xl mx-auto my-6 flex flex-col items-center gap-2">
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground/50 w-full text-center font-mono">
        — Sponsored —
      </div>

      <div
        className="relative w-full group rounded-xl overflow-hidden border border-white/10"
        style={{ boxShadow: "0 0 24px rgba(34,197,94,0.12), 0 4px 24px rgba(0,0,0,0.5)" }}
      >
        {/* Aspect-ratio wrapper — max-height keeps banner compact on wide screens */}
        <div className="relative w-full" style={{ aspectRatio: "1200/600", maxHeight: "220px" }}>

          {/* Sliding track — all banners side by side */}
          <div
            className="absolute inset-0 flex"
            style={{
              width: `${activeBanners.length * 100}%`,
              transform: `translateX(-${(currentIndex * 100) / activeBanners.length}%)`,
              transition: "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
              willChange: "transform",
            }}
          >
            {activeBanners.map((banner, i) => {
              const inner = (
                <img
                  src={banner.imageUrl}
                  alt={banner.altText || "Ad banner"}
                  className="w-full h-full object-cover select-none"
                  draggable={false}
                  key={i}
                />
              );
              return banner.linkUrl ? (
                <a
                  key={banner.id}
                  href={banner.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block shrink-0"
                  style={{ width: `${100 / activeBanners.length}%` }}
                >
                  {inner}
                </a>
              ) : (
                <div
                  key={banner.id}
                  className="relative block shrink-0"
                  style={{ width: `${100 / activeBanners.length}%` }}
                >
                  {inner}
                </div>
              );
            })}
          </div>

          {/* Gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10 group-hover:opacity-0 transition-opacity duration-300" />
        </div>

        {/* Arrows */}
        {activeBanners.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
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
              onClick={() => setCurrentIndex(i)}
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
