import React, { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Droplet, ExternalLink, RefreshCw, AlertCircle, CheckCircle2, History, Database, ArrowRight } from "lucide-react";
import { 
  useClaimFaucet, 
  useGetFaucetStatus, 
  useGetFaucetStats, 
  useGetFaucetHistory,
  getGetFaucetStatusQueryKey,
  getGetFaucetStatsQueryKey,
  getGetFaucetHistoryQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// Hook for debouncing input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export default function Home() {
  const [address, setAddress] = useState("");
  const debouncedAddress = useDebounce(address, 500);
  const queryClient = useQueryClient();

  const isValidAddress = debouncedAddress.length === 42 && debouncedAddress.startsWith("0x");

  const { data: stats, isLoading: statsLoading } = useGetFaucetStats();
  const { data: history, isLoading: historyLoading } = useGetFaucetHistory();
  
  const { data: status, isLoading: statusLoading } = useGetFaucetStatus(debouncedAddress, {
    query: {
      enabled: isValidAddress,
      queryKey: getGetFaucetStatusQueryKey(debouncedAddress)
    }
  });

  const claimMutation = useClaimFaucet();

  const handleClaim = () => {
    if (!isValidAddress) return;
    claimMutation.mutate({ data: { address: debouncedAddress } }, {
      onSuccess: () => {
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: getGetFaucetStatusQueryKey(debouncedAddress) });
        queryClient.invalidateQueries({ queryKey: getGetFaucetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFaucetHistoryQueryKey() });
      }
    });
  };

  const formatAddress = (addr: string) => `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/30">
      <main className="container mx-auto px-4 py-12 max-w-5xl flex flex-col gap-12">
        {/* Header Section */}
        <header className="flex flex-col items-center text-center space-y-4 pt-10">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 text-primary mb-4 border border-primary/20 shadow-[0_0_30px_-5px_rgba(0,119,255,0.3)]">
            <Droplet className="h-8 w-8" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white">
            Sepolia Faucet
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-2xl font-mono">
            Fast, reliable testnet ETH for developers.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Action Area */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            <Card className="border-primary/20 bg-card/50 backdrop-blur-sm shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
              <CardHeader>
                <CardTitle className="text-2xl">Claim Testnet ETH</CardTitle>
                <CardDescription className="text-base">
                  Enter your EVM wallet address to receive Sepolia ETH.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="0x..."
                      className="font-mono text-lg h-14 bg-background/50 border-muted-foreground/30 focus-visible:ring-primary focus-visible:border-primary pl-4 pr-12"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                    {isValidAddress && status && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                        {status.canClaim ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        )}
                      </div>
                    )}
                    {isValidAddress && statusLoading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                        <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  {isValidAddress && status && !status.canClaim && status.nextClaimAt && (
                    <p className="text-sm text-destructive font-mono flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Cooldown active. Next claim available at {new Date(status.nextClaimAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>

                {claimMutation.isError && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Claim Failed</AlertTitle>
                    <AlertDescription className="font-mono mt-2">
                      {(claimMutation.error as { error?: string } | null)?.error || "An unexpected error occurred."}
                    </AlertDescription>
                  </Alert>
                )}

                {claimMutation.isSuccess && claimMutation.data && (
                  <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Successfully Claimed!</AlertTitle>
                    <AlertDescription className="font-mono mt-2 space-y-2">
                      <div>Sent <span className="font-bold text-emerald-400">{claimMutation.data.amount} Sepolia ETH</span></div>
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${claimMutation.data.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
                      >
                        View Transaction <ExternalLink className="h-3 w-3" />
                      </a>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  size="lg" 
                  className="w-full h-14 text-lg font-medium shadow-[0_0_20px_-5px_rgba(0,119,255,0.4)] hover:shadow-[0_0_25px_-5px_rgba(0,119,255,0.6)] transition-all"
                  onClick={handleClaim}
                  disabled={!isValidAddress || statusLoading || (status && !status.canClaim) || claimMutation.isPending}
                >
                  {claimMutation.isPending ? (
                    <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Processing...</>
                  ) : (
                    <>Request Funds <ArrowRight className="ml-2 h-5 w-5" /></>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Network Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-card/30 border-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Database className="h-4 w-4" /> Total Claims
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? <Skeleton className="h-8 w-24" /> : (
                    <div className="text-3xl font-mono text-white">{stats?.totalClaims.toLocaleString() || "0"}</div>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-card/30 border-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Droplet className="h-4 w-4" /> ETH Distributed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? <Skeleton className="h-8 w-24" /> : (
                    <div className="text-3xl font-mono text-primary">{stats?.totalEthDistributed || "0"}</div>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-card/30 border-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <History className="h-4 w-4" /> Faucet Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? <Skeleton className="h-8 w-24" /> : (
                    <div className="text-3xl font-mono text-white">{stats?.faucetBalanceEth ? `${stats.faucetBalanceEth}` : "N/A"}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sidebar / History */}
          <div className="lg:col-span-4">
            <Card className="bg-card/30 border-muted/50 h-full flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" /> Recent Claims
                </CardTitle>
                <CardDescription>Latest testnet distributions</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                {historyLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="flex justify-between items-center">
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))}
                  </div>
                ) : history && history.length > 0 ? (
                  <div className="space-y-6">
                    {history.map((record) => (
                      <div key={record.id} className="flex justify-between items-center group">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-sm text-foreground">
                            {formatAddress(record.address)}
                          </span>
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${record.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-mono"
                          >
                            {formatAddress(record.txHash)} <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        </div>
                        <Badge variant="secondary" className="font-mono bg-primary/10 text-primary hover:bg-primary/20">
                          +{record.amount}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                    <Database className="h-8 w-8 opacity-20" />
                    <p>No recent claims found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}