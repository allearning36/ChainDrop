import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PriceMarquee } from "@/components/home/PriceMarquee";
import { Banners } from "@/components/home/Banners";
import { ChainCard } from "@/components/home/ChainCard";
import { RecentFeed } from "@/components/home/RecentFeed";
import { ClaimModal } from "@/components/home/ClaimModal";
import { useGetChains, getGetChainsQueryKey, ChainPublic } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
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
        <div className="flex flex-col items-center justify-center text-center space-y-4 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-6xl font-bold font-mono tracking-tighter uppercase text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.3)]">
            ChainDrop
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-mono tracking-widest uppercase max-w-2xl">
            Your Ultimate Faucet Hub — Get Free Tokens For Every Chain
          </p>
        </div>

        <PriceMarquee coinIds={coinIds} />
        
        <Banners />

        <div className="flex flex-col md:flex-row items-center justify-between mb-8 mt-12 gap-4">
          <h2 className="text-2xl font-bold font-mono tracking-tight uppercase">
            {networkType} Faucets
          </h2>
          
          <Button 
            onClick={toggleNetwork}
            variant={networkType === "testnet" ? "outline" : "default"}
            className="font-mono uppercase tracking-widest w-full md:w-auto h-12 md:h-10"
          >
            Enable {networkType === "testnet" ? "Mainnet" : "Testnet"}
          </Button>
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
