import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search, ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { formatTokenAmount } from "@/lib/utils";

type ClaimRow = {
  id: number; address: string; chainId: number; chainName: string;
  chainSymbol: string; txHash: string; amount: string; claimedAt: string;
};
type Page = { claims: ClaimRow[]; total: number; page: number; limit: number; pages: number };

async function apiFetch(path: string) {
  const res = await adminFetch(path);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

function timeStr(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}
function shortHash(h: string) { return `${h.slice(0, 8)}…${h.slice(-6)}`; }
function shortAddr(a: string) { return `${a.slice(0, 8)}…${a.slice(-4)}`; }

export function ClaimsLog() {
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("address", search);
      const d = await apiFetch(`/api/admin/claims?${params.toString()}`) as Page;
      setData(d);
    } catch { /* auth error or network — leave previous data */ }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  function handleSearch() { setPage(1); setSearch(searchInput.trim()); }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await adminFetch("/api/admin/claims/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `claims-${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-primary">Claims Log</h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {data ? `${data.total.toLocaleString()} total claims` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1">
            <Input
              placeholder="Search address…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="h-9 w-52 font-mono text-xs"
            />
            <Button size="icon" variant="outline" className="h-9 w-9" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 font-mono text-xs" onClick={() => void load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" className="h-9 gap-1.5 font-mono text-xs" onClick={handleExport} disabled={exporting}
            style={{ background: "linear-gradient(135deg,#166534,#22c55e)", color: "#fff" }}>
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Export CSV
          </Button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                {["#", "Address", "Chain", "Amount", "Tx Hash", "Time"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading && !data && (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…
                </td></tr>
              )}
              {data?.claims.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No claims found</td></tr>
              )}
              {data?.claims.map((c, i) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground">{(data.page - 1) * data.limit + i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="text-primary cursor-pointer hover:underline" title={c.address}
                      onClick={() => navigator.clipboard.writeText(c.address)}>
                      {shortAddr(c.address)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
                      {c.chainSymbol}
                    </span>
                    <span className="ml-1 text-muted-foreground">{c.chainName}</span>
                  </td>
                  <td className="px-3 py-2 text-green-400 font-semibold">{formatTokenAmount(c.amount)}</td>
                  <td className="px-3 py-2">
                    <a href={`https://sepolia.etherscan.io/tx/${c.txHash}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300" title={c.txHash}>
                      {shortHash(c.txHash)} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{timeStr(c.claimedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <span>Page {data.page} of {data.pages}</span>
          <div className="flex gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
