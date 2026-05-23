import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminReferralSettings,
  getGetAdminReferralSettingsQueryKey,
  useUpdateAdminReferralSettings,
  useGetAdminReferralUsers,
  getGetAdminReferralUsersQueryKey,
  useGetAdminReferralClaimRequests,
  getGetAdminReferralClaimRequestsQueryKey,
  useApproveReferralClaimRequest,
  useRejectReferralClaimRequest,
  useGetAdminReferralUser,
  getGetAdminReferralUserQueryKey,
  useAdminAdjustReferralBalance,
  useGetChains,
  getGetChainsQueryKey,
} from "@workspace/api-client-react";
import type { ReferralSettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Settings2, Users, CheckCircle, XCircle, AlertCircle, ChevronRight, ChevronLeft, Plus, Minus, History } from "lucide-react";
import { adminFetch } from "@/lib/auth";

function ChainMultiSelect({ label, chainIds, value, onChange }: {
  label: string;
  chainIds: { id: number; name: string }[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter(x => x !== id));
    else onChange([...value, id]);
  };
  return (
    <div>
      <p className="text-xs font-mono text-muted-foreground mb-1.5">{label} <span className="text-green-400">(empty = all chains)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {chainIds.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            className="px-2.5 py-1 rounded-lg text-xs font-mono transition-colors"
            style={{
              background: value.includes(c.id) ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${value.includes(c.id) ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
              color: value.includes(c.id) ? "#22c55e" : "rgba(255,255,255,0.6)",
            }}
          >
            {c.name}
          </button>
        ))}
        {chainIds.length === 0 && <span className="text-xs font-mono text-muted-foreground">No chains configured</span>}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetAdminReferralSettings({
    query: { queryKey: getGetAdminReferralSettingsQueryKey() }
  });
  const { data: chains = [] } = useGetChains(undefined, { query: { queryKey: getGetChainsQueryKey() } });
  const evmChains = chains.filter(c => c.chainType === "evm").map(c => ({ id: c.id, name: c.name }));

  const updateMutation = useUpdateAdminReferralSettings();
  const [form, setForm] = useState<Partial<ReferralSettings> | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const current = form ?? settings;

  const set = (patch: Partial<ReferralSettings>) => setForm(prev => ({ ...(prev ?? settings ?? {}), ...patch } as ReferralSettings));

  const handleSave = async () => {
    if (!current) return;
    setSaveErr("");
    try {
      await updateMutation.mutateAsync({ data: current as ReferralSettings });
      await qc.invalidateQueries({ queryKey: getGetAdminReferralSettingsQueryKey() });
      setForm(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveErr(err?.response?.data?.error ?? err?.message ?? "Save failed");
    }
  };

  if (isLoading || !current) {
    return <div className="space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Master toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: "Referral System Enabled", key: "enabled" as const },
          { label: "Maintenance Mode", key: "maintenanceMode" as const },
          { label: "Commission on Exchange", key: "commissionOnExchange" as const },
          { label: "Commission on Buy", key: "commissionOnBuy" as const },
        ].map(({ label, key }) => (
          <div key={key} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="font-mono text-sm">{label}</span>
            <Switch
              checked={!!(current as any)[key]}
              onCheckedChange={v => set({ [key]: v })}
            />
          </div>
        ))}
      </div>

      {/* Maintenance message */}
      {current.maintenanceMode && (
        <div>
          <label className="text-xs font-mono text-muted-foreground block mb-1.5">Maintenance Message</label>
          <input
            className="w-full rounded-lg px-3 py-2 font-mono text-sm bg-transparent outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
            value={current.maintenanceMessage ?? ""}
            onChange={e => set({ maintenanceMessage: e.target.value })}
          />
        </div>
      )}

      {/* Exchange & Buy commission percentages */}
      {[
        {
          label: "Exchange Commission",
          toggle: "commissionOnExchange" as const,
          l1Key: "exchangeLevel1Pct" as const,
          l2Key: "exchangeLevel2Pct" as const,
          chainKey: "exchangeChainIds" as const,
          chainLabel: "Exchange Commission Chains",
        },
        {
          label: "Buy Commission",
          toggle: "commissionOnBuy" as const,
          l1Key: "buyLevel1Pct" as const,
          l2Key: "buyLevel2Pct" as const,
          chainKey: "buyChainIds" as const,
          chainLabel: "Buy Commission Chains",
        },
      ].map(({ label, toggle, l1Key, l2Key, chainKey, chainLabel }) => (
        (current as any)[toggle] && (
          <div key={toggle} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-xs font-mono font-semibold text-green-400">{label}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1.5">Level 1 %</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  className="w-full rounded-lg px-3 py-2 font-mono text-sm bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
                  value={(current as any)[l1Key] ?? 0}
                  onChange={e => set({ [l1Key]: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-xs font-mono text-muted-foreground block mb-1.5">Level 2 %</label>
                <input
                  type="number" min="0" max="100" step="0.01"
                  className="w-full rounded-lg px-3 py-2 font-mono text-sm bg-transparent outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
                  value={(current as any)[l2Key] ?? 0}
                  onChange={e => set({ [l2Key]: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <ChainMultiSelect label={chainLabel} chainIds={evmChains} value={(current as any)[chainKey] ?? []} onChange={ids => set({ [chainKey]: ids })} />
          </div>
        )
      ))}

      {/* Faucet Claim: per-chain commission */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-xs font-mono font-semibold text-green-400">Faucet Claim Commission (Per Chain)</p>
        <p className="text-xs font-mono text-muted-foreground">Enable commission per chain and set individual L1/L2 percentages.</p>
        <div className="space-y-3">
          {evmChains.map(chain => {
            const chainCommissions = current.faucetClaimChainCommissions ?? [];
            const existing = chainCommissions.find(c => c.chainId === chain.id);
            const isEnabled = existing?.enabled ?? false;
            const l1 = existing?.level1Pct ?? 0.1;
            const l2 = existing?.level2Pct ?? 0.05;

            const updateChain = (patch: Partial<{ enabled: boolean; level1Pct: number; level2Pct: number }>) => {
              const updated = chainCommissions.filter(c => c.chainId !== chain.id);
              updated.push({ chainId: chain.id, level1Pct: l1, level2Pct: l2, enabled: isEnabled, ...patch });
              set({ faucetClaimChainCommissions: updated });
            };

            return (
              <div key={chain.id} className="rounded-lg p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${isEnabled ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium" style={{ color: isEnabled ? "#22c55e" : "rgba(255,255,255,0.6)" }}>{chain.name}</span>
                  <Switch checked={isEnabled} onCheckedChange={v => updateChain({ enabled: v })} />
                </div>
                {isEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground block mb-1">Level 1 %</label>
                      <input
                        type="number" min="0" max="100" step="0.01"
                        className="w-full rounded-md px-2 py-1.5 font-mono text-xs bg-transparent outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
                        value={l1}
                        onChange={e => updateChain({ level1Pct: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-muted-foreground block mb-1">Level 2 %</label>
                      <input
                        type="number" min="0" max="100" step="0.01"
                        className="w-full rounded-md px-2 py-1.5 font-mono text-xs bg-transparent outline-none"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
                        value={l2}
                        onChange={e => updateChain({ level2Pct: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {evmChains.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground">No EVM chains configured yet.</p>
          )}
        </div>
      </div>

      {/* Min claim amount */}
      <div>
        <label className="text-xs font-mono text-muted-foreground block mb-1.5">Minimum Claim Amount (ETH)</label>
        <input
          type="number" min="0" step="0.001"
          className="w-full rounded-lg px-3 py-2 font-mono text-sm bg-transparent outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
          value={current.minClaimEth ?? 0.001}
          onChange={e => set({ minClaimEth: parseFloat(e.target.value) || 0.001 })}
        />
      </div>

      {/* Allowed claim chains */}
      <div className="space-y-2">
        <ChainMultiSelect label="Allowed Claim Chains" chainIds={evmChains} value={current.claimChainIds ?? []} onChange={ids => set({ claimChainIds: ids })} />
      </div>

      {saveErr && (
        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs font-mono text-red-400">{saveErr}</span>
        </div>
      )}

      <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full font-mono gap-2">
        {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings2 className="w-4 h-4" />}
        {saved ? "Saved!" : "Save Settings"}
      </Button>
    </div>
  );
}

function ClaimRequestsPanel() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | undefined>("pending");
  const [rejectNote, setRejectNote] = useState<{ [id: number]: string }>({});
  const [actionId, setActionId] = useState<number | null>(null);

  const { data: requests = [], isLoading } = useGetAdminReferralClaimRequests(
    statusFilter ? { status: statusFilter as any } : undefined,
    {
      query: {
        queryKey: getGetAdminReferralClaimRequestsQueryKey(statusFilter ? { status: statusFilter as any } : undefined),
        refetchInterval: 10000,
      }
    }
  );

  const approveMutation = useApproveReferralClaimRequest();
  const rejectMutation = useRejectReferralClaimRequest();

  const handleApprove = async (id: number) => {
    setActionId(id);
    try {
      await approveMutation.mutateAsync({ id, data: { chainId: requests.find(r => r.id === id)?.claimChainId ?? 0 } });
      await qc.invalidateQueries({ queryKey: getGetAdminReferralClaimRequestsQueryKey() });
    } catch { /* show nothing */ }
    setActionId(null);
  };

  const handleReject = async (id: number) => {
    setActionId(id);
    try {
      await rejectMutation.mutateAsync({ id, data: { note: rejectNote[id] || "Rejected by admin" } });
      await qc.invalidateQueries({ queryKey: getGetAdminReferralClaimRequestsQueryKey() });
      setRejectNote(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch { /* show nothing */ }
    setActionId(null);
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {(["pending", "approved", "rejected", undefined] as const).map(s => (
          <button
            key={s ?? "all"}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-lg font-mono text-xs transition-colors"
            style={{
              background: statusFilter === s ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${statusFilter === s ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
              color: statusFilter === s ? "#22c55e" : "rgba(255,255,255,0.6)",
            }}
          >
            {s ?? "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle className="w-8 h-8 opacity-30 mb-2" />
          <p className="text-sm font-mono">No {statusFilter ?? ""} claim requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
                  <span className="font-mono text-sm font-semibold text-green-400">{parseFloat(r.amountEth).toFixed(6)} ETH</span>
                </div>
                <Badge
                  className="font-mono text-[10px]"
                  style={{
                    background: r.status === "approved" ? "rgba(34,197,94,0.15)" : r.status === "rejected" ? "rgba(239,68,68,0.15)" : "rgba(234,179,8,0.15)",
                    color: r.status === "approved" ? "#22c55e" : r.status === "rejected" ? "#ef4444" : "#eab308",
                    border: "none"
                  }}
                >
                  {r.status}
                </Badge>
              </div>
              <div className="font-mono text-xs text-muted-foreground truncate">{r.walletAddress}</div>
              <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
                <span>Chain ID: {r.claimChainId}</span>
                <span>{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              {r.adminNote && <p className="text-xs font-mono text-muted-foreground">{r.adminNote}</p>}
              {r.txHash && (
                <a href={`https://etherscan.io/tx/${r.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-green-400 hover:underline truncate block">
                  {r.txHash}
                </a>
              )}

              {r.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <input
                    className="flex-1 rounded-lg px-3 py-1.5 font-mono text-xs bg-transparent outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                    placeholder="Rejection note (optional)"
                    value={rejectNote[r.id] ?? ""}
                    onChange={e => setRejectNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    className="gap-1 font-mono text-xs bg-green-600 hover:bg-green-700"
                    disabled={actionId === r.id}
                    onClick={() => handleApprove(r.id)}
                  >
                    {actionId === r.id && approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1 font-mono text-xs"
                    disabled={actionId === r.id}
                    onClick={() => handleReject(r.id)}
                  >
                    {actionId === r.id && rejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdjustBalanceForm({ wallet, onSuccess }: { wallet: string; onSuccess: () => void }) {
  const [type, setType] = useState<"add" | "deduct">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const adjustMutation = useAdminAdjustReferralBalance();

  const handleSubmit = async () => {
    setErr(""); setOk(false);
    const eth = parseFloat(amount);
    if (isNaN(eth) || eth <= 0) { setErr("Enter a valid positive amount"); return; }
    try {
      await adjustMutation.mutateAsync({ wallet, data: { type, amountEth: eth.toFixed(10), note: note || undefined } });
      setAmount(""); setNote(""); setOk(true);
      setTimeout(() => setOk(false), 3000);
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Failed");
    }
  };

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <p className="font-mono font-semibold text-sm flex items-center gap-2">
        <History className="w-4 h-4 text-yellow-400" /> Adjust Balance
      </p>

      {/* Add / Deduct toggle */}
      <div className="flex gap-2">
        {(["add", "deduct"] as const).map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-mono text-xs font-semibold transition-all"
            style={{
              background: type === t ? (t === "add" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)") : "rgba(255,255,255,0.05)",
              border: `1px solid ${type === t ? (t === "add" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)") : "rgba(255,255,255,0.1)"}`,
              color: type === t ? (t === "add" ? "#22c55e" : "#f87171") : "rgba(255,255,255,0.5)",
            }}
          >
            {t === "add" ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {t === "add" ? "Add" : "Deduct"}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-mono text-muted-foreground block mb-1">Amount (ETH)</label>
        <input
          type="number"
          min="0"
          step="0.001"
          placeholder="0.000000"
          className="w-full rounded-lg px-3 py-2 font-mono text-sm bg-transparent outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </div>

      {/* Notice */}
      <div>
        <label className="text-xs font-mono text-muted-foreground block mb-1">Notice / Note <span className="opacity-50">(optional)</span></label>
        <input
          type="text"
          placeholder="e.g. Bonus reward, Fraud deduction..."
          className="w-full rounded-lg px-3 py-2 font-mono text-xs bg-transparent outline-none"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {err && (
        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-xs font-mono text-red-400">{err}</span>
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <span className="text-xs font-mono text-green-400">Balance adjusted successfully</span>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={adjustMutation.isPending || !amount}
        className="w-full font-mono text-xs gap-2"
        style={{
          background: type === "add" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${type === "add" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: type === "add" ? "#22c55e" : "#f87171",
        }}
        variant="outline"
      >
        {adjustMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (type === "add" ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />)}
        {type === "add" ? "Add Balance" : "Deduct Balance"}
      </Button>
    </div>
  );
}

function UsersPanel() {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useGetAdminReferralUsers({
    query: { queryKey: getGetAdminReferralUsersQueryKey(), refetchInterval: 30000 }
  });

  const { data: userDetail, isLoading: detailLoading } = useGetAdminReferralUser(
    selectedWallet ?? "",
    { query: { enabled: !!selectedWallet, queryKey: getGetAdminReferralUserQueryKey(selectedWallet ?? "") } }
  );

  const refreshDetail = () => {
    if (selectedWallet) {
      void qc.invalidateQueries({ queryKey: getGetAdminReferralUserQueryKey(selectedWallet) });
    }
  };

  if (selectedWallet) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedWallet(null)}
          className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-green-400 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to list
        </button>
        {detailLoading ? (
          <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : userDetail ? (
          <div className="space-y-4">
            <div className="font-mono text-xs break-all" style={{ color: "rgba(255,255,255,0.6)" }}>{userDetail.wallet}</div>

            {/* ── Adjust Balance ── */}
            <AdjustBalanceForm wallet={userDetail.wallet} onSuccess={refreshDetail} />

            {/* ── Adjustment History ── */}
            {(userDetail as any).adjustments?.length > 0 && (
              <div>
                <p className="font-mono font-semibold text-sm mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-yellow-400" /> Adjustment History ({(userDetail as any).adjustments.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(userDetail as any).adjustments.map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: a.type === "add" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: a.type === "add" ? "#22c55e" : "#f87171" }}>
                          {a.type === "add" ? "+" : "−"}{parseFloat(a.amountEth).toFixed(6)}
                        </span>
                        {a.note && <span className="font-mono text-[10px] text-muted-foreground truncate">{a.note}</span>}
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* L1 referrals */}
            <div>
              <p className="font-mono font-semibold text-sm mb-2">Level 1 Referrals ({userDetail.level1Referrals.length})</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {userDetail.level1Referrals.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="font-mono text-xs truncate">{r.refereeAddress}</span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {userDetail.level1Referrals.length === 0 && <p className="text-xs font-mono text-muted-foreground">None</p>}
              </div>
            </div>
            {/* L2 referrals */}
            <div>
              <p className="font-mono font-semibold text-sm mb-2">Level 2 Referrals ({userDetail.level2Referrals.length})</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {userDetail.level2Referrals.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className="font-mono text-xs truncate">{r.refereeAddress}</span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-2">{new Date(r.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {userDetail.level2Referrals.length === 0 && <p className="text-xs font-mono text-muted-foreground">None</p>}
              </div>
            </div>
            {/* Commissions */}
            <div>
              <p className="font-mono font-semibold text-sm mb-2">Commissions ({userDetail.commissions.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {userDetail.commissions.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] px-1 rounded shrink-0" style={{ background: c.level === 1 ? "rgba(34,197,94,0.1)" : "rgba(167,139,250,0.1)", color: c.level === 1 ? "#22c55e" : "#a78bfa" }}>L{c.level}</span>
                      <span className="font-mono text-xs text-muted-foreground">{c.sourceType}</span>
                      <span className="font-mono text-xs text-green-400">+{parseFloat(c.amountEth).toFixed(6)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                      <Badge className="font-mono text-[9px]" style={{ background: c.status === "paid" ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)", color: c.status === "paid" ? "#22c55e" : "#eab308", border: "none" }}>{c.status}</Badge>
                    </div>
                  </div>
                ))}
                {userDetail.commissions.length === 0 && <p className="text-xs font-mono text-muted-foreground">None</p>}
              </div>
            </div>
            {/* Claim Requests */}
            {userDetail.claimRequests.length > 0 && (
              <div>
                <p className="font-mono font-semibold text-sm mb-2">Claim Requests ({userDetail.claimRequests.length})</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {userDetail.claimRequests.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-green-400">{parseFloat(r.amountEth).toFixed(6)} ETH</span>
                        {r.adminNote && <span className="font-mono text-[10px] text-muted-foreground truncate">{r.adminNote}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                        <Badge className="font-mono text-[9px]" style={{ background: r.status === "approved" ? "rgba(34,197,94,0.1)" : r.status === "rejected" ? "rgba(239,68,68,0.1)" : "rgba(234,179,8,0.1)", color: r.status === "approved" ? "#22c55e" : r.status === "rejected" ? "#f87171" : "#eab308", border: "none" }}>{r.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-mono text-muted-foreground">No data found</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-2">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Users className="w-8 h-8 opacity-30 mb-2" />
          <p className="text-sm font-mono">No referrers yet</p>
        </div>
      ) : (
        users.map(u => (
          <button
            key={u.wallet}
            onClick={() => setSelectedWallet(u.wallet)}
            className="w-full flex items-center justify-between p-4 rounded-xl text-left transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
          >
            <div className="min-w-0">
              <p className="font-mono text-xs truncate" style={{ color: "rgba(255,255,255,0.8)" }}>{u.wallet}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-mono text-[10px] text-muted-foreground">L1: {u.level1Count} L2: {u.level2Count}</span>
                <span className="font-mono text-[10px] text-green-400">{parseFloat(u.pendingCommissionEth).toFixed(6)} ETH pending</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
          </button>
        ))
      )}
    </div>
  );
}

export function ReferralManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <Users className="w-4 h-4 text-green-400" />
        </div>
        <div>
          <h2 className="font-mono font-bold text-lg">Referral System</h2>
          <p className="text-xs font-mono text-muted-foreground">2-level affiliate commissions</p>
        </div>
      </div>

      <Tabs defaultValue="requests" className="space-y-4">
        <TabsList className="bg-card border border-border p-1 gap-0.5">
          <TabsTrigger value="requests" className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1 h-8 px-3">
            <CheckCircle className="w-3.5 h-3.5" /> Claims
          </TabsTrigger>
          <TabsTrigger value="users" className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1 h-8 px-3">
            <Users className="w-3.5 h-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="settings" className="font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1 h-8 px-3">
            <Settings2 className="w-3.5 h-3.5" /> Settings
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-0 outline-none">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Commission Claim Requests</CardTitle>
            </CardHeader>
            <CardContent><ClaimRequestsPanel /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users" className="mt-0 outline-none">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Referral Users</CardTitle>
            </CardHeader>
            <CardContent><UsersPanel /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-0 outline-none">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="font-mono text-sm">Referral Settings</CardTitle>
            </CardHeader>
            <CardContent><SettingsPanel /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
