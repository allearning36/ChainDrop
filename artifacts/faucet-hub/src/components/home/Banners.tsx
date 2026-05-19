import { useGetBanners, getGetBannersQueryKey } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Banners() {
  const { data: banners = [] } = useGetBanners({
    query: {
      queryKey: getGetBannersQueryKey()
    }
  });
  const [currentIndex, setCurrentIndex] = useState(0);

  const activeBanners = banners.filter(b => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const current = activeBanners[currentIndex];

  const prev = () => setCurrentIndex((i) => (i - 1 + activeBanners.length) % activeBanners.length);
  const next = () => setCurrentIndex((i) => (i + 1) % activeBanners.length);

  return (
    <div className="w-full max-w-3xl mx-auto my-6 flex flex-col items-center gap-2">
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground/50 w-full text-center font-mono">
        — Sponsored —
      </div>

      <div className="relative w-full group">
        <a
          href={current.linkUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full overflow-hidden rounded-xl border border-white/10"
          style={{
            boxShadow: "0 0 24px rgba(34,197,94,0.12), 0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div className="relative w-full" style={{ aspectRatio: "1200/600" }}>
            <img
              src={current.imageUrl}
              alt={current.altText || "Ad banner"}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.015]"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10 group-hover:from-black/0 group-hover:to-black/0 transition-all duration-300" />
          </div>
        </a>

        {/* Prev / Next arrows */}
        {activeBanners.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/70"
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
