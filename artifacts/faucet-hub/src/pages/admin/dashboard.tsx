import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken, registerUnauthorizedHandler, adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LogOut, LayoutDashboard, Link as LinkIcon,
  HeadphonesIcon, ClipboardList, ShieldOff, Wallet,
  FileText, BarChart2, Settings2, Globe, Send, Users, Radio, ArrowLeftRight, Network, GitBranch,
  Download, Upload, Loader2, Megaphone, ShieldAlert, Database, Menu, X, ChevronRight,
} from "lucide-react";
import { StatsOverview } from "@/components/admin/Stats";
import { ChainManagement } from "@/components/admin/ChainManagement";
import { PostManagement } from "@/components/admin/PostManagement";
import { SupportManagement } from "@/components/admin/SupportManagement";
import { ClaimsLog } from "@/components/admin/ClaimsLog";
import { BlockedAddresses } from "@/components/admin/BlockedAddresses";
import { WalletHealth } from "@/components/admin/WalletHealth";
import { PagesManagement } from "@/components/admin/PagesManagement";
import { Analytics } from "@/components/admin/Analytics";
import { SiteConfig } from "@/components/admin/SiteConfig";
import { IPBlocking } from "@/components/admin/IPBlocking";
import { Audience } from "@/components/admin/Audience";
import { LiveMonitor } from "@/components/admin/LiveMonitor";
import { ExchangeManagement } from "@/components/admin/ExchangeManagement";
import { PaymentNetworkManagement } from "@/components/admin/PaymentNetworkManagement";
import { ReferralManagement } from "@/components/admin/ReferralManagement";
import { ChainLibrary } from "@/components/admin/ChainLibrary";
import { AdManagement } from "@/components/admin/AdManagement";
import { AntiAbusePanel } from "@/components/admin/AntiAbusePanel";
import { AdminTabErrorBoundary } from "@/components/admin/ErrorBoundary";

// ── Types ──────────────────────────────────────────────────────────────────────

type TopSection =
  | "dashboard" | "live" | "claims" | "exchange" | "referral" | "wallets" | "siteconfig"
  | "overview-group" | "chains-group" | "security-group" | "content-group";

type SubTab = {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
};

// ── Sub-tab definitions ────────────────────────────────────────────────────────

const OVERVIEW_TABS: SubTab[] = [
  { id: "stats",     label: "Stats",     icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: BarChart2 },
  { id: "audience",  label: "Audience",  icon: Users },
];

const CHAINS_TABS: SubTab[] = [
  { id: "chains",        label: "Chains",        icon: LinkIcon },
  { id: "chain-library", label: "Chain Library", icon: Database },
  { id: "paynetworks",   label: "Pay Networks",  icon: Network },
];

const SECURITY_TABS: SubTab[] = [
  { id: "blocked",   label: "Blocked",    icon: ShieldOff },
  { id: "ipblocks",  label: "IP Block",   icon: Globe },
  { id: "antiabuse", label: "Anti-Abuse", icon: ShieldAlert },
];

const CONTENT_TABS: SubTab[] = [
  { id: "post",    label: "Post",    icon: Send },
  { id: "ads",     label: "Ads",     icon: Megaphone },
  { id: "pages",   label: "Pages",   icon: FileText },
  { id: "support", label: "Support", icon: HeadphonesIcon },
];

// ── Sidebar nav structure ──────────────────────────────────────────────────────

interface NavEntry {
  section: TopSection;
  label: string;
  icon: React.ElementType;
  subTabs?: SubTab[];
}

const NAV: NavEntry[] = [
  { section: "overview-group", label: "Overview",        icon: LayoutDashboard, subTabs: OVERVIEW_TABS },
  { section: "live",           label: "Live Monitor",    icon: Radio },
  { section: "claims",         label: "Claims Log",      icon: ClipboardList },
  { section: "chains-group",   label: "Chains",          icon: LinkIcon,        subTabs: CHAINS_TABS },
  { section: "wallets",        label: "Wallet Health",   icon: Wallet },
  { section: "exchange",       label: "Exchange",        icon: ArrowLeftRight },
  { section: "referral",       label: "Referral",        icon: GitBranch },
  { section: "security-group", label: "Security",        icon: ShieldAlert,     subTabs: SECURITY_TABS },
  { section: "content-group",  label: "Content",         icon: Send,            subTabs: CONTENT_TABS },
  { section: "siteconfig",     label: "Settings",        icon: Settings2 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await adminFetch("/api/admin/support/unread-count");
    if (!res.ok) return 0;
    return ((await res.json() as { count: number }).count) ?? 0;
  } catch { return 0; }
}

function SubTabBar({
  tabs, active, onChange, supportUnread,
}: {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
  supportUnread: number;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-4 md:px-6 bg-card/40 overflow-x-auto shrink-0">
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-3 text-xs font-mono whitespace-nowrap transition-colors border-b-2 -mb-px",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <tab.icon className="w-3.5 h-3.5 shrink-0" />
            {tab.label}
            {tab.id === "support" && supportUnread > 0 && (
              <span className="flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[15px] h-[15px] leading-none bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.7)]">
                {supportUnread > 99 ? "99+" : supportUnread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<TopSection>("overview-group");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-tab state per group
  const [overviewSub, setOverviewSub]   = useState("stats");
  const [chainsSub,   setChainsSub]     = useState("chains");
  const [securitySub, setSecuritySub]   = useState("blocked");
  const [contentSub,  setContentSub]    = useState("post");

  // Active breadcrumb label
  const activeEntry = NAV.find(n => n.section === activeSection);
  const breadcrumb = (() => {
    if (activeSection === "overview-group") return OVERVIEW_TABS.find(t => t.id === overviewSub)?.label ?? "Stats";
    if (activeSection === "chains-group")   return CHAINS_TABS.find(t => t.id === chainsSub)?.label ?? "Chains";
    if (activeSection === "security-group") return SECURITY_TABS.find(t => t.id === securitySub)?.label ?? "Security";
    if (activeSection === "content-group")  return CONTENT_TABS.find(t => t.id === contentSub)?.label ?? "Content";
    return activeEntry?.label ?? "Dashboard";
  })();

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await adminFetch("/api/admin/backup");
      if (!res.ok) { alert("Backup failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chaindrop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Backup failed"); }
    finally { setBackingUp(false); }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm(`"${file.name}" থেকে data restore করবেন? এটা বিদ্যমান data overwrite করবে।`)) {
      e.target.value = ""; return;
    }
    setRestoring(true); setRestoreResult(null);
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const res = await adminFetch("/api/admin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const result = await res.json() as { success?: boolean; restored?: Record<string, number>; error?: string };
      if (!res.ok || !result.success) {
        setRestoreResult(`❌ Failed: ${result.error ?? "Unknown error"}`);
      } else {
        const summary = Object.entries(result.restored ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        setRestoreResult(`✅ Restored — ${summary}`);
      }
    } catch (err) {
      setRestoreResult(`❌ Error: ${err instanceof Error ? err.message : "Parse error"}`);
    } finally { setRestoring(false); e.target.value = ""; }
  };

  useEffect(() => {
    const redirectToLogin = () => setLocation("/admin/login");
    registerUnauthorizedHandler(redirectToLogin);
    if (!isAuthenticated()) { redirectToLogin(); return; }
    fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${getToken() ?? ""}` } })
      .then(res => { if (res.status === 401) { removeToken(); redirectToLogin(); } })
      .catch(() => {});
  }, [setLocation]);

  useEffect(() => {
    if (!isAuthenticated()) return;
    void fetchUnreadCount().then(setSupportUnread);
    const id = setInterval(() => void fetchUnreadCount().then(setSupportUnread), 20000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => { removeToken(); setLocation("/"); };

  const navigateTo = (section: TopSection) => {
    setActiveSection(section);
    setSidebarOpen(false);
  };

  if (!isAuthenticated()) return null;

  // Content sub-tab routing helpers
  const contentSupportBadge = contentSub === "support" ? supportUnread : 0;
  void contentSupportBadge;

  return (
    <div className="min-h-[100dvh] bg-background flex">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-56 bg-card border-r border-border z-50 flex flex-col transition-transform duration-200",
        "md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>

        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="CD" className="w-5 h-5 object-contain" />
          </div>
          <div className="min-w-0">
            <div className="font-bold font-mono text-sm tracking-tight leading-none">ChainDrop</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5 text-primary/70">Admin</div>
          </div>
          <button className="ml-auto md:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(entry => {
            const active = activeSection === entry.section;
            const hasSubTabs = (entry.subTabs?.length ?? 0) > 0;
            const showSupportBadge = entry.section === "content-group" && supportUnread > 0;

            return (
              <button
                key={entry.section}
                onClick={() => navigateTo(entry.section)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-mono transition-all text-left group",
                  active
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.2)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />}
                <entry.icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                <span className="flex-1 truncate">{entry.label}</span>
                {showSupportBadge && (
                  <span className="flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[15px] h-[15px] leading-none bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.7)]">
                    {supportUnread > 99 ? "99+" : supportUnread}
                  </span>
                )}
                {hasSubTabs && !showSupportBadge && (
                  <ChevronRight className={cn("w-3 h-3 shrink-0 transition-transform text-muted-foreground/50", active && "rotate-90 text-primary/50")} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-border p-3 space-y-1.5 shrink-0">
          <div className="flex gap-1.5">
            <Button
              variant="outline" size="sm" onClick={handleBackup} disabled={backingUp}
              className="flex-1 font-mono text-xs border-primary/30 text-primary hover:bg-primary/10 h-8"
            >
              {backingUp ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              Backup
            </Button>
            <Button
              variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={restoring}
              className="flex-1 font-mono text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8"
            >
              {restoring ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
              Restore
            </Button>
          </div>
          <Button
            variant="ghost" size="sm" onClick={handleLogout}
            className="w-full font-mono text-xs text-muted-foreground hover:text-foreground justify-start h-8"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Disconnect
          </Button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:ml-56 min-w-0">

        {/* Header */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur flex items-center gap-3 px-4 shrink-0">
          <button className="md:hidden text-muted-foreground hover:text-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5 text-sm font-mono min-w-0 text-muted-foreground">
            <span className="hidden sm:inline">Admin</span>
            <ChevronRight className="w-3 h-3 hidden sm:inline shrink-0" />
            <span className="text-foreground font-semibold truncate">{breadcrumb}</span>
          </div>
          {restoreResult && (
            <div className="ml-auto text-xs font-mono border border-border rounded px-2.5 py-1 max-w-[260px] truncate text-muted-foreground">
              {restoreResult}
            </div>
          )}
        </header>

        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleRestoreFile} />

        {/* Sub-tab bar (only for grouped sections) */}
        {activeSection === "overview-group" && (
          <SubTabBar tabs={OVERVIEW_TABS} active={overviewSub} onChange={setOverviewSub} supportUnread={0} />
        )}
        {activeSection === "chains-group" && (
          <SubTabBar tabs={CHAINS_TABS} active={chainsSub} onChange={setChainsSub} supportUnread={0} />
        )}
        {activeSection === "security-group" && (
          <SubTabBar tabs={SECURITY_TABS} active={securitySub} onChange={setSecuritySub} supportUnread={0} />
        )}
        {activeSection === "content-group" && (
          <SubTabBar tabs={CONTENT_TABS.map(t => t.id === "support" ? { ...t, badge: supportUnread } : t)} active={contentSub} onChange={setContentSub} supportUnread={supportUnread} />
        )}

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 min-w-0 overflow-auto">

          {/* Overview group */}
          {activeSection === "overview-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {overviewSub === "stats"     && <StatsOverview />}
              {overviewSub === "analytics" && <Analytics />}
              {overviewSub === "audience"  && <Audience />}
            </AdminTabErrorBoundary>
          )}

          {/* Standalone sections */}
          {activeSection === "live"     && <AdminTabErrorBoundary label="Live Monitor"><LiveMonitor /></AdminTabErrorBoundary>}
          {activeSection === "claims"   && <AdminTabErrorBoundary label="Claims Log"><ClaimsLog /></AdminTabErrorBoundary>}
          {activeSection === "wallets"  && <AdminTabErrorBoundary label="Wallet Health"><WalletHealth /></AdminTabErrorBoundary>}
          {activeSection === "exchange" && <AdminTabErrorBoundary label="Exchange"><ExchangeManagement /></AdminTabErrorBoundary>}
          {activeSection === "referral" && <AdminTabErrorBoundary label="Referral"><ReferralManagement /></AdminTabErrorBoundary>}
          {activeSection === "siteconfig" && <AdminTabErrorBoundary label="Settings"><SiteConfig /></AdminTabErrorBoundary>}

          {/* Chains group */}
          {activeSection === "chains-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {chainsSub === "chains"        && <ChainManagement />}
              {chainsSub === "chain-library" && <ChainLibrary />}
              {chainsSub === "paynetworks"   && <PaymentNetworkManagement />}
            </AdminTabErrorBoundary>
          )}

          {/* Security group */}
          {activeSection === "security-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {securitySub === "blocked"   && <BlockedAddresses />}
              {securitySub === "ipblocks"  && <IPBlocking />}
              {securitySub === "antiabuse" && <AntiAbusePanel />}
            </AdminTabErrorBoundary>
          )}

          {/* Content group */}
          {activeSection === "content-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {contentSub === "post"    && <PostManagement />}
              {contentSub === "ads"     && <AdManagement />}
              {contentSub === "pages"   && <PagesManagement />}
              {contentSub === "support" && <SupportManagement onUnreadCount={setSupportUnread} />}
            </AdminTabErrorBoundary>
          )}

        </main>
      </div>
    </div>
  );
}
