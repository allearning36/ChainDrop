import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken, registerUnauthorizedHandler, adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LogOut, LayoutDashboard, Link as LinkIcon,
  HeadphonesIcon, ClipboardList, ShieldOff, Wallet,
  FileText, BarChart2, Settings2, Globe, Send, Users, Radio, ArrowLeftRight, Network, GitBranch,
  Download, Upload, Loader2, Megaphone, ShieldAlert, Database, Menu, X,
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

type SectionId =
  | "live" | "stats" | "analytics" | "audience"
  | "chain-library" | "chains" | "wallets"
  | "claims" | "blocked" | "ipblocks" | "antiabuse"
  | "exchange" | "paynetworks"
  | "referral"
  | "post" | "ads" | "pages" | "support"
  | "siteconfig";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { id: "stats",     label: "Dashboard",    icon: LayoutDashboard },
      { id: "live",      label: "Live Monitor", icon: Radio },
      { id: "analytics", label: "Analytics",    icon: BarChart2 },
      { id: "audience",  label: "Audience",     icon: Users },
    ],
  },
  {
    title: "Chains",
    items: [
      { id: "chains",         label: "Chain Management", icon: LinkIcon },
      { id: "chain-library",  label: "Chain Library",    icon: Database },
      { id: "wallets",        label: "Wallet Health",    icon: Wallet },
    ],
  },
  {
    title: "Claims & Security",
    items: [
      { id: "claims",    label: "Claims Log",        icon: ClipboardList },
      { id: "blocked",   label: "Blocked Addresses", icon: ShieldOff },
      { id: "ipblocks",  label: "IP Blocking",       icon: Globe },
      { id: "antiabuse", label: "Anti-Abuse",        icon: ShieldAlert },
    ],
  },
  {
    title: "Exchange",
    items: [
      { id: "exchange",    label: "Exchange",     icon: ArrowLeftRight },
      { id: "paynetworks", label: "Pay Networks", icon: Network },
    ],
  },
  {
    title: "Referrals",
    items: [
      { id: "referral", label: "Referral", icon: GitBranch },
    ],
  },
  {
    title: "Content",
    items: [
      { id: "post",    label: "Post Management", icon: Send },
      { id: "ads",     label: "Ads",             icon: Megaphone },
      { id: "pages",   label: "Pages",           icon: FileText },
      { id: "support", label: "Support",         icon: HeadphonesIcon },
    ],
  },
  {
    title: "Settings",
    items: [
      { id: "siteconfig", label: "Site Settings", icon: Settings2 },
    ],
  },
];

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await adminFetch("/api/admin/support/unread-count");
    if (!res.ok) return 0;
    const data = await res.json() as { count: number };
    return data.count ?? 0;
  } catch { return 0; }
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<SectionId>("stats");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeLabel = useMemo(() => {
    for (const group of NAV_GROUPS) {
      const item = group.items.find(i => i.id === activeSection);
      if (item) return item.label;
    }
    return "Dashboard";
  }, [activeSection]);

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
      e.target.value = "";
      return;
    }
    setRestoring(true);
    setRestoreResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
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
    } finally {
      setRestoring(false);
      e.target.value = "";
    }
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

  const navigate = (id: SectionId) => {
    setActiveSection(id);
    setSidebarOpen(false);
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-[100dvh] bg-background flex">

      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-60 bg-card border-r border-border z-50 flex flex-col transition-transform duration-200",
        "md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>

        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0">
          <img src="/logo.svg" alt="CD" className="w-8 h-8 object-contain" />
          <div className="min-w-0">
            <div className="font-bold font-mono text-sm tracking-tight leading-none">ChainDrop</div>
            <div className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">Admin Panel</div>
          </div>
          <button
            className="ml-auto md:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-5">
          {NAV_GROUPS.map(group => (
            <div key={group.title}>
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50 px-2.5 mb-1.5 select-none">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.id)}
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-mono transition-colors text-left group",
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                      )}
                      <item.icon className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.id === "support" && supportUnread > 0 && (
                        <span className="flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[16px] h-4 leading-none bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]">
                          {supportUnread > 99 ? "99+" : supportUnread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: Backup / Restore / Logout */}
        <div className="border-t border-border p-3 space-y-1.5 shrink-0">
          <div className="flex gap-1.5">
            <Button
              variant="outline" size="sm" onClick={handleBackup} disabled={backingUp}
              className="flex-1 font-mono text-xs border-primary/30 text-primary hover:bg-primary/10 h-8"
            >
              {backingUp
                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                : <Download className="w-3 h-3 mr-1" />}
              Backup
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={restoring}
              className="flex-1 font-mono text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 h-8"
            >
              {restoring
                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                : <Upload className="w-3 h-3 mr-1" />}
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

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:ml-60 min-w-0">

        {/* Top header bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/95 backdrop-blur flex items-center gap-3 px-4 shrink-0">
          <button
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5 text-sm font-mono min-w-0">
            <span className="text-muted-foreground hidden sm:inline">Admin</span>
            <span className="text-muted-foreground hidden sm:inline">/</span>
            <span className="text-foreground font-semibold truncate">{activeLabel}</span>
          </div>

          {restoreResult && (
            <div className="ml-auto text-xs font-mono border border-border rounded px-2.5 py-1 max-w-[260px] truncate text-muted-foreground">
              {restoreResult}
            </div>
          )}
        </header>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleRestoreFile}
        />

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 min-w-0">
          <AdminTabErrorBoundary label={activeLabel}>
            {activeSection === "stats"         && <StatsOverview />}
            {activeSection === "live"          && <LiveMonitor />}
            {activeSection === "analytics"     && <Analytics />}
            {activeSection === "audience"      && <Audience />}
            {activeSection === "chain-library" && <ChainLibrary />}
            {activeSection === "chains"        && <ChainManagement />}
            {activeSection === "wallets"       && <WalletHealth />}
            {activeSection === "claims"        && <ClaimsLog />}
            {activeSection === "blocked"       && <BlockedAddresses />}
            {activeSection === "ipblocks"      && <IPBlocking />}
            {activeSection === "antiabuse"     && <AntiAbusePanel />}
            {activeSection === "exchange"      && <ExchangeManagement />}
            {activeSection === "paynetworks"   && <PaymentNetworkManagement />}
            {activeSection === "referral"      && <ReferralManagement />}
            {activeSection === "post"          && <PostManagement />}
            {activeSection === "ads"           && <AdManagement />}
            {activeSection === "pages"         && <PagesManagement />}
            {activeSection === "support"       && <SupportManagement onUnreadCount={setSupportUnread} />}
            {activeSection === "siteconfig"    && <SiteConfig />}
          </AdminTabErrorBoundary>
        </main>
      </div>
    </div>
  );
}
