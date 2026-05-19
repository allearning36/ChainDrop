import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PriceMarquee } from "@/components/home/PriceMarquee";
import { Banners } from "@/components/home/Banners";
import { ChainCard } from "@/components/home/ChainCard";
import { RecentFeed } from "@/components/home/RecentFeed";
import { ClaimModal } from "@/components/home/ClaimModal";
import { useGetChains, getGetChainsQueryKey, ChainPublic } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [networkType, setNetworkType] = useState<"testnet" | "mainnet">("testnet");
  const [selectedChain, setSelectedChain] = useState<ChainPublic | null>(null);

  const { data: chains = [], isLoading } = useGetChains({ type: networkType }, {
    query: {
      queryKey: getGetChainsQueryKey({ type: networkType })
    }
  });

  const toggleNetwork = () => {
    setNetworkType(prev => prev === "testnet" ? "mainnet" : "testnet");
  };

  const coinIds = chains.map(c => c.coingeckoId).filter(Boolean) as string[];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <Navbar />
      
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        <PriceMarquee coinIds={coinIds} />
        
        <Banners />

        <div className="flex flex-col items-center gap-3 mb-8 mt-12">
          <h2 className="text-2xl font-bold font-mono tracking-tight uppercase mb-2">
            {networkType} Faucets
          </h2>

          {/* Testnet toggle pill */}
          <button
            onClick={() => setNetworkType("testnet")}
            aria-label="Enable Testnet"
            className="relative flex items-center w-52 h-12 rounded-full cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60 transition-all duration-300"
            style={{
              background: networkType === "testnet"
                ? "linear-gradient(135deg, #15803d 0%, #22c55e 100%)"
                : "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
              boxShadow: networkType === "testnet"
                ? "inset 0 2px 8px rgba(0,0,0,0.3), 0 0 16px rgba(34,197,94,0.4)"
                : "inset 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {/* Knob — left when active */}
            <span
              className="absolute top-1.5 w-9 h-9 rounded-full transition-all duration-300 ease-in-out"
              style={{
                left: networkType === "testnet" ? "6px" : "calc(100% - 42px)",
                background: "radial-gradient(circle at 35% 35%, #ffffff, #d1d5db)",
                boxShadow: "0 3px 10px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.8)",
              }}
            />
            {/* Label */}
            <span
              className="absolute inset-0 flex items-center font-bold text-base text-white/95 transition-all duration-300"
              style={{
                justifyContent: networkType === "testnet" ? "flex-end" : "flex-start",
                paddingRight: networkType === "testnet" ? "16px" : undefined,
                paddingLeft: networkType !== "testnet" ? "16px" : undefined,
                fontFamily: "sans-serif",
                letterSpacing: "0.05em",
              }}
            >
              Testnet
            </span>
          </button>

          {/* Mainnet toggle pill */}
          <button
            onClick={() => setNetworkType("mainnet")}
            aria-label="Enable Mainnet"
            className="relative flex items-center w-52 h-12 rounded-full cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 transition-all duration-300"
            style={{
              background: networkType === "mainnet"
                ? "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)"
                : "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
              boxShadow: networkType === "mainnet"
                ? "inset 0 2px 8px rgba(0,0,0,0.3), 0 0 16px rgba(168,85,247,0.4)"
                : "inset 0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            {/* Knob — left when active */}
            <span
              className="absolute top-1.5 w-9 h-9 rounded-full transition-all duration-300 ease-in-out"
              style={{
                left: networkType === "mainnet" ? "6px" : "calc(100% - 42px)",
                background: "radial-gradient(circle at 35% 35%, #ffffff, #d1d5db)",
                boxShadow: "0 3px 10px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.8)",
              }}
            />
            {/* Label */}
            <span
              className="absolute inset-0 flex items-center font-bold text-base text-white/95 transition-all duration-300"
              style={{
                justifyContent: networkType === "mainnet" ? "flex-end" : "flex-start",
                paddingRight: networkType === "mainnet" ? "16px" : undefined,
                paddingLeft: networkType !== "mainnet" ? "16px" : undefined,
                fontFamily: "sans-serif",
                letterSpacing: "0.05em",
              }}
            >
              Mainnet
            </span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : chains.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/20">
            <p className="text-muted-foreground font-mono">No {networkType} chains available right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {chains.map(chain => (
              <ChainCard 
                key={chain.id} 
                chain={chain} 
                onClick={() => setSelectedChain(chain)} 
              />
            ))}
          </div>
        )}

        <RecentFeed />
      </main>

      <Footer />

      <ClaimModal 
        chain={selectedChain} 
        onClose={() => setSelectedChain(null)} 
      />
    </div>
  );
}
