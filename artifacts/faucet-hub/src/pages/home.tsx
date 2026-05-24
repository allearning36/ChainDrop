import { useState, useMemo, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEOHead } from "@/components/layout/SEOHead";
import { AdSlot } from "@/components/layout/AdSlot";
import { HeadlineBanner } from "@/components/home/HeadlineBanner";
import { HeroSection } from "@/components/home/HeroSection";
import { Banners } from "@/components/home/Banners";
import { ChainCard } from "@/components/home/ChainCard";
import { RecentFeed } from "@/components/home/RecentFeed";
import { ClaimModal } from "@/components/home/ClaimModal";
import { useGetChains, getGetChainsQueryKey, ChainPublic } from "@workspace/api-client-react";
import { Loader2, Search, X, SlidersHorizontal, Check } from "lucide-react";

export default function Home() {
  const [networkType, setNetworkType] = useState<"testnet" | "mainnet">("testnet");
  const [selectedChain, setSelectedChain] = useState<ChainPublic | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "YES" | "SOON" | "NO">("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const STATUS_FILTERS: { value: "all" | "YES" | "SOON" | "NO"; label: string; color: string }[] = [
    { value: "all",  label: "All Chains",   color: "rgba(255,255,255,0.6)" },
    { value: "YES",  label: "Available",    color: "#22c55e" },
    { value: "SOON", label: "Coming Soon",  color: "#f59e0b" },
    { value: "NO",   label: "Offline/Down", color: "#ef4444" },
  ];

  // Handle ?ref= referral registration
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    // Store referrer in sessionStorage until user connects wallet
    sessionStorage.setItem("pendingReferrer", ref.toLowerCase());
    // Clean URL
    const url = new URL(window.location.href);
    url.searchParams.delete("ref");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const { data: testnetChains = [], isLoading: loadingTestnet } = useGetChains({ type: "testnet" }, {
    query: { queryKey: getGetChainsQueryKey({ type: "testnet" }) }
  });
  const { data: mainnetChains = [], isLoading: loadingMainnet } = useGetChains({ type: "mainnet" }, {
    query: { queryKey: getGetChainsQueryKey({ type: "mainnet" }) }
  });

  const isLoading = loadingTestnet || loadingMainnet;
  const chains = networkType === "testnet" ? testnetChains : mainnetChains;

  const isSearching = search.trim().length > 0;

  const filteredChains = useMemo(() => {
    const q = search.trim().toLowerCase();
    // When searching, look across all chains; otherwise use current network
    const base = q ? (() => {
      const all = [...testnetChains, ...mainnetChains];
      const seen = new Set<number>();
      return all.filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
      });
    })() : chains;
    // Apply status filter
    if (statusFilter === "all") return base;
    return base.filter(c => c.availableStatus === statusFilter);
  }, [chains, testnetChains, mainnetChains, search, statusFilter]);

  const coinIds = chains.map(c => c.coingeckoId).filter(Boolean) as string[];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-primary-foreground">
      <SEOHead />
      <Navbar />
      <HeadlineBanner />
      <HeroSection totalChains={testnetChains.length + mainnetChains.length} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 relative">
        {/* Page ambient background */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden>
          <div
            style={{
              position: "absolute", top: "-20%", left: "10%",
              width: "500px", height: "500px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(34,197,94,0.04) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            style={{
              position: "absolute", top: "40%", right: "5%",
              width: "400px", height: "400px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(6,182,212,0.035) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            style={{
              position: "absolute", bottom: "10%", left: "30%",
              width: "600px", height: "300px", borderRadius: "50%",
              background: "radial-gradient(circle, rgba(168,85,247,0.03) 0%, transparent 70%)",
              filter: "blur(50px)",
            }}
          />
        </div>
        <AdSlot id="home-top" className="my-2" />
        <Banners />

        {/* Premium Search bar — below banners so it stays near the chain list */}
        <div className="w-full px-0 py-5 relative" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 60% 80% at 50% 100%, rgba(34,197,94,0.06) 0%, transparent 70%)" }}
          />
          <div className="relative max-w-2xl mx-auto flex items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1 group">
              <div
                className="absolute -inset-[1px] rounded-2xl opacity-0 group-focus-within:opacity-100 transition-all duration-700"
                style={{
                  background: "linear-gradient(135deg, rgba(34,197,94,0.7) 0%, rgba(6,182,212,0.5) 50%, rgba(168,85,247,0.4) 100%)",
                  filter: "blur(1px)",
                }}
              />
              <div
                className="relative flex items-center rounded-2xl overflow-hidden transition-all duration-300"
                style={{
                  background: "rgba(8,10,14,0.9)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <div className="pl-5 pr-3 flex items-center shrink-0">
                  <Search className="w-5 h-5 transition-all duration-300 group-focus-within:scale-110" style={{ color: "rgba(34,197,94,0.65)" }} />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search chains by name or symbol…"
                  className="flex-1 h-14 text-sm font-mono bg-transparent focus:outline-none text-foreground"
                  style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.01em" }}
                />
                <div className="pr-4 flex items-center shrink-0">
                  {search ? (
                    <button
                      onClick={() => setSearch("")}
                      className="flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 hover:scale-110"
                      style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Filter button */}
            <div className="relative shrink-0">
              <button
                onClick={() => setFilterOpen(o => !o)}
                className="flex items-center gap-2 h-14 px-4 rounded-2xl transition-all duration-200 font-mono text-xs uppercase tracking-widest"
                style={{
                  background: statusFilter !== "all"
                    ? `rgba(${statusFilter === "YES" ? "34,197,94" : statusFilter === "SOON" ? "245,158,11" : "239,68,68"},0.15)`
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${statusFilter !== "all"
                    ? statusFilter === "YES" ? "rgba(34,197,94,0.4)" : statusFilter === "SOON" ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)"
                    : "rgba(255,255,255,0.1)"}`,
                  color: statusFilter !== "all"
                    ? STATUS_FILTERS.find(f => f.value === statusFilter)?.color
                    : "rgba(255,255,255,0.5)",
                }}
                aria-label="Filter chains"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {statusFilter === "all" ? "Filter" : STATUS_FILTERS.find(f => f.value === statusFilter)?.label}
                </span>
              </button>

              {/* Dropdown */}
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 z-20 rounded-xl overflow-hidden py-1 min-w-[170px]"
                    style={{
                      background: "rgba(10,12,18,0.98)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                    }}
                  >
                    {STATUS_FILTERS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => { setStatusFilter(f.value); setFilterOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-mono text-left transition-colors hover:bg-white/5"
                        style={{ color: f.color }}
                      >
                        <span className="w-4 shrink-0">
                          {statusFilter === f.value && <Check className="w-3.5 h-3.5" />}
                        </span>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Active filter badge */}
          {statusFilter !== "all" && (
            <div className="flex justify-center mt-3">
              <button
                onClick={() => setStatusFilter("all")}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono transition-all hover:opacity-70"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                <X className="w-3 h-3" />
                Clear filter: {STATUS_FILTERS.find(f => f.value === statusFilter)?.label}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 mb-8 mt-12">
          <h2
            className="text-2xl font-bold font-mono tracking-tight uppercase mb-2"
            style={{
              color: networkType === "testnet" ? "#22c55e" : "#a855f7",
              textShadow: networkType === "testnet"
                ? "0 0 24px rgba(34,197,94,0.45), 0 0 8px rgba(34,197,94,0.25)"
                : "0 0 24px rgba(168,85,247,0.45), 0 0 8px rgba(168,85,247,0.25)",
            }}
          >
            {networkType} Faucets
          </h2>

          <div className="flex flex-row items-center gap-3">
            {/* Testnet toggle pill */}
            <button
              onClick={() => setNetworkType("testnet")}
              aria-label="Enable Testnet"
              className="relative flex items-center h-10 rounded-full cursor-pointer select-none focus:outline-none transition-all duration-300"
              style={{
                width: "clamp(120px, 38vw, 160px)",
                background: networkType === "testnet"
                  ? "linear-gradient(135deg, #15803d 0%, #22c55e 100%)"
                  : "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
                boxShadow: networkType === "testnet"
                  ? "inset 0 2px 6px rgba(0,0,0,0.25), 0 0 14px rgba(34,197,94,0.4)"
                  : "inset 0 2px 6px rgba(0,0,0,0.4)",
              }}
            >
              {/* Knob — RIGHT = ON (active), LEFT = OFF (inactive) */}
              <span
                className="absolute top-1 w-8 h-8 rounded-full transition-all duration-300 ease-in-out"
                style={{
                  left: networkType === "testnet" ? "calc(100% - 36px)" : "4px",
                  background: "radial-gradient(circle at 35% 35%, #ffffff, #d1d5db)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.8)",
                }}
              />
              {/* Label — LEFT when ON, RIGHT when OFF */}
              <span
                className="absolute inset-0 flex items-center font-bold text-sm text-white/95 transition-all duration-300"
                style={{
                  justifyContent: networkType === "testnet" ? "flex-start" : "flex-end",
                  paddingLeft: networkType === "testnet" ? "14px" : undefined,
                  paddingRight: networkType !== "testnet" ? "14px" : undefined,
                  fontFamily: "sans-serif",
                  letterSpacing: "0.04em",
                }}
              >
                Testnet
              </span>
            </button>

            {/* Mainnet toggle pill */}
            <button
              onClick={() => setNetworkType("mainnet")}
              aria-label="Enable Mainnet"
              className="relative flex items-center h-10 rounded-full cursor-pointer select-none focus:outline-none transition-all duration-300"
              style={{
                width: "clamp(120px, 38vw, 160px)",
                background: networkType === "mainnet"
                  ? "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)"
                  : "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
                boxShadow: networkType === "mainnet"
                  ? "inset 0 2px 6px rgba(0,0,0,0.25), 0 0 14px rgba(168,85,247,0.4)"
                  : "inset 0 2px 6px rgba(0,0,0,0.4)",
              }}
            >
              {/* Knob — RIGHT = ON, LEFT = OFF */}
              <span
                className="absolute top-1 w-8 h-8 rounded-full transition-all duration-300 ease-in-out"
                style={{
                  left: networkType === "mainnet" ? "calc(100% - 36px)" : "4px",
                  background: "radial-gradient(circle at 35% 35%, #ffffff, #d1d5db)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.8)",
                }}
              />
              {/* Label — LEFT when ON, RIGHT when OFF */}
              <span
                className="absolute inset-0 flex items-center font-bold text-sm text-white/95 transition-all duration-300"
                style={{
                  justifyContent: networkType === "mainnet" ? "flex-start" : "flex-end",
                  paddingLeft: networkType === "mainnet" ? "14px" : undefined,
                  paddingRight: networkType !== "mainnet" ? "14px" : undefined,
                  fontFamily: "sans-serif",
                  letterSpacing: "0.04em",
                }}
              >
                Mainnet
              </span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredChains.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/20">
            {search.trim() ? (
              <p className="text-muted-foreground font-mono">No chains match <span className="text-foreground">"{search.trim()}"</span>.</p>
            ) : (
              <p className="text-muted-foreground font-mono">No {networkType} chains available right now.</p>
            )}
          </div>
        ) : (
          <>
            {search.trim() && (
              <p className="text-xs text-muted-foreground font-mono mb-4">
                {filteredChains.length} result{filteredChains.length !== 1 ? "s" : ""} for "{search.trim()}"
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredChains.map(chain => (
                <ChainCard
                  key={chain.id}
                  chain={chain}
                  onClick={() => setSelectedChain(chain)}
                  showNetworkBadge={isSearching}
                />
              ))}
            </div>
          </>
        )}

        <RecentFeed />
        <AdSlot id="home-bottom" className="mt-6" />
      </main>

      <Footer />

      <ClaimModal 
        chain={selectedChain} 
        onClose={() => setSelectedChain(null)} 
      />
    </div>
  );
}
