import { useGetBanners, getGetBannersQueryKey } from "@workspace/api-client-react";
import { useState, useEffect } from "react";

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
    }, 4000);
    
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const current = activeBanners[currentIndex];

  return (
    <div className="w-full max-w-[728px] mx-auto my-8 flex flex-col items-center gap-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground w-full text-center font-mono">
        - Sponsored -
      </div>
      
      <a 
        href={current.linkUrl || "#"} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block w-full aspect-[728/90] relative overflow-hidden rounded-md border border-border group"
      >
        <img 
          src={current.imageUrl} 
          alt={current.altText || "Ad banner"} 
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors duration-300" />
      </a>
      
      {activeBanners.length > 1 && (
        <div className="flex gap-2">
          {activeBanners.map((_, i) => (
            <button
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-primary w-4' : 'bg-muted'}`}
              onClick={() => setCurrentIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
