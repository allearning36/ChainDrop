import { useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SEOHead } from "@/components/layout/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, Clock, CheckCircle, Loader2 } from "lucide-react";

interface ClaimRecord {
  chainName: string;
  chainSymbol: string;
  amount: string;
  txHash: string | null;
  claimedAt: string;
}

interface LookupResult {
  address: string;
  totalClaims: number;
  totalEth: string;
  claims: ClaimRecord[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LookupPage() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLookup() {
    const addr = address.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/i.test(addr)) {
      setError("Please enter a valid EVM wallet address.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/lookup/${addr}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json() as LookupResult;
      setResult(data);
    } catch {
      setError("No records found for this address.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <SEOHead title="Address Lookup — ChainDrop" />
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-mono mb-2">Address Lookup</h1>
          <p className="text-muted-foreground">Enter a wallet address to view its claim history across all chains.</p>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-8">
          <Input
            placeholder="0x..."
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
            className="font-mono bg-card border-border"
          />
          <Button onClick={handleLookup} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Lookup</span>
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive font-mono mb-6">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Claims", value: result.totalClaims },
                { label: "Total Received", value: `${result.totalEth} ETH` },
                { label: "Address", value: `${result.address.slice(0, 6)}…${result.address.slice(-4)}` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-xs text-muted-foreground font-mono mb-1">{label}</p>
                  <p className="font-bold font-mono text-primary">{value}</p>
                </div>
              ))}
            </div>

            {/* Claims list */}
            {result.claims.length === 0 ? (
              <p className="text-muted-foreground text-sm font-mono text-center py-8">No claims found for this address.</p>
            ) : (
              <div className="space-y-3">
                <h2 className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Claim History ({result.claims.length})</h2>
                {result.claims.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p className="font-mono font-semibold text-sm">{c.chainName}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" /> {formatDate(c.claimedAt)} · {timeAgo(c.claimedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-bold text-primary text-sm">+{c.amount} {c.chainSymbol}</span>
                      {c.txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${c.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 font-mono"
                        >
                          TX <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
