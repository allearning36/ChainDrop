import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken, registerUnauthorizedHandler, adminFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LogOut, LayoutDashboard, Link as LinkIcon,
  HeadphonesIcon, ClipboardList, ShieldOff, Wallet,
  FileText, Settings2, Globe, Send, Users, Radio, ArrowLeftRight, Network, GitBranch,
  Download, Upload, Loader2, Megaphone, ShieldAlert, Database, Menu, X, ChevronRight, Gift, Zap,
} from "lucide-react";
import { DashboardHome } from "@/components/admin/DashboardHome";
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
import { PromoManagement } from "@/components/admin/PromoManagement";
import { ChainLibrary } from "@/components/admin/ChainLibrary";
import { AdManagement } from "@/components/admin/AdManagement";
import { AntiAbusePanel } from "@/components/admin/AntiAbusePanel";
import { EarnDropManagement } from "@/components/admin/EarnDropManagement";
import { AdminTabErrorBoundary } from "@/components/admin/ErrorBoundary";

// ── Types ──────────────────────────────────────────────────────────────────────

type TopSection =
  | "dashboard" | "live" | "claims" | "support"
  | "exchange" | "referral" | "promo" | "earn-drop" | "siteconfig"
  | "chains-group" | "analytics-group" | "security-group" | "content-group";

type SubTab = { id: string; label: string; icon: React.ElementType };

// ── Sub-tab groups ─────────────────────────────────────────────────────────────

const CHAINS_TABS: SubTab[] = [
  { id: "chains",        label: "Chains",        icon: LinkIcon },
  { id: "chain-library", label: "Chain Library", icon: Database },
  { id: "wallets",       label: "Wallet Health", icon: Wallet },
  { id: "paynetworks",   label: "Pay Networks",  icon: Network },
];

const ANALYTICS_TABS: SubTab[] = [
  { id: "analytics", label: "Analytics", icon: ShieldOff },
  { id: "audience",  label: "Audience",  icon: Users },
];

const SECURITY_TABS: SubTab[] = [
  { id: "blocked",   label: "Blocked",    icon: ShieldOff },
  { id: "ipblocks",  label: "IP Block",   icon: Globe },
  { id: "antiabuse", label: "Anti-Abuse", icon: ShieldAlert },
];

const CONTENT_TABS: SubTab[] = [
  { id: "post",  label: "Posts", icon: Send },
  { id: "ads",   label: "Ads",   icon: Megaphone },
  { id: "pages", label: "Pages", icon: FileText },
];

// ── Sidebar nav ────────────────────────────────────────────────────────────────

interface NavItem {
  section: TopSection;
  label: string;
  icon: React.ElementType;
  subTabs?: SubTab[];
  isSupportBadge?: boolean;
}

const NAV: NavItem[] = [
  { section: "dashboard",       label: "Dashboard",     icon: LayoutDashboard },
  { section: "live",            label: "Live Monitor",  icon: Radio },
  { section: "claims",          label: "Claims Log",    icon: ClipboardList },
  { section: "chains-group",    label: "Chains",        icon: LinkIcon,       subTabs: CHAINS_TABS },
  { section: "exchange",        label: "Exchange",      icon: ArrowLeftRight },
  { section: "referral",        label: "Referral",      icon: GitBranch },
  { section: "promo",           label: "Promo Codes",   icon: Gift },
  { section: "earn-drop",       label: "Earn Drop",     icon: Zap },
  { section: "analytics-group", label: "Analytics",     icon: ShieldOff,      subTabs: ANALYTICS_TABS },
  { section: "security-group",  label: "Security",      icon: ShieldAlert,    subTabs: SECURITY_TABS },
  { section: "content-group",   label: "Content",       icon: Send,           subTabs: CONTENT_TABS },
  { section: "support",         label: "Support",       icon: HeadphonesIcon, isSupportBadge: true },
  { section: "siteconfig",      label: "Settings",      icon: Settings2 },
];

// ── Helper: fetch unread count ─────────────────────────────────────────────────

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await adminFetch("/api/admin/support/unread-count");
    if (!res.ok) return 0;
    return ((await res.json() as { count: number }).count) ?? 0;
  } catch { return 0; }
}

// ── Sub-tab bar ────────────────────────────────────────────────────────────────

function SubTabBar({ tabs, active, onChange }: {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border px-4 md:px-6 bg-background/50 overflow-x-auto shrink-0">
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-mono whitespace-nowrap transition-colors border-b-2 -mb-px",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            <tab.icon className="w-3.5 h-3.5 shrink-0" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

// ── Hash helpers ───────────────────────────────────────────────────────────────
const VALID_SECTIONS: TopSection[] = [
  "dashboard","live","claims","support","exchange","referral","promo","earn-drop","siteconfig",
  "chains-group","analytics-group","security-group","content-group",
];
function readHashSection(): TopSection {
  const [sec] = window.location.hash.slice(1).split("/");
  return VALID_SECTIONS.includes(sec as TopSection) ? (sec as TopSection) : "dashboard";
}
function readHashSub(group: string, tabs: SubTab[], fallback: string): string {
  const [sec, sub] = window.location.hash.slice(1).split("/");
  if (sec === group && sub && tabs.some(t => t.id === sub)) return sub;
  return fallback;
}
function writeHash(section: TopSection, sub?: string) {
  window.location.hash = sub ? `${section}/${sub}` : section;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [activeSection, setActiveSection] = useState<TopSection>(readHashSection);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [supportUnread, setSupportUnread] = useState(0);
  const [backingUp, setBackingUp]       = useState(false);
  const [restoring, setRestoring]       = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sub-tab state per group — init from hash
  const [chainsSub,    _setChainsSub]    = useState(() => readHashSub("chains-group",    CHAINS_TABS,    "chains"));
  const [analyticsSub, _setAnalyticsSub] = useState(() => readHashSub("analytics-group", ANALYTICS_TABS, "analytics"));
  const [securitySub,  _setSecuritySub]  = useState(() => readHashSub("security-group",  SECURITY_TABS,  "blocked"));
  const [contentSub,   _setContentSub]   = useState(() => readHashSub("content-group",   CONTENT_TABS,   "post"));

  const setChainsSub    = (s: string) => { _setChainsSub(s);    writeHash("chains-group",    s); };
  const setAnalyticsSub = (s: string) => { _setAnalyticsSub(s); writeHash("analytics-group", s); };
  const setSecuritySub  = (s: string) => { _setSecuritySub(s);  writeHash("security-group",  s); };
  const setContentSub   = (s: string) => { _setContentSub(s);   writeHash("content-group",   s); };

  // Active breadcrumb
  const breadcrumb = (() => {
    if (activeSection === "chains-group")    return CHAINS_TABS.find(t => t.id === chainsSub)?.label ?? "Chains";
    if (activeSection === "analytics-group") return ANALYTICS_TABS.find(t => t.id === analyticsSub)?.label ?? "Analytics";
    if (activeSection === "security-group")  return SECURITY_TABS.find(t => t.id === securitySub)?.label ?? "Security";
    if (activeSection === "content-group")   return CONTENT_TABS.find(t => t.id === contentSub)?.label ?? "Content";
    return NAV.find(n => n.section === activeSection)?.label ?? "Dashboard";
  })();

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await adminFetch("/api/admin/backup");
      if (!res.ok) { alert("Backup failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `chaindrop-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json),
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
    writeHash(section);
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-[100dvh] bg-background flex">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed left-0 top-0 h-full w-56 z-50 flex flex-col transition-transform duration-200",
        "md:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )} style={{ background: "hsl(240 10% 5%)", borderRight: "1px solid rgba(255,255,255,0.07)" }}>

        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-4 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
            <img src="/logo.svg" alt="" className="w-5 h-5 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="font-bold font-mono text-sm leading-none tracking-tight text-white">ChainDrop</p>
            <p className="text-[9px] font-mono uppercase tracking-widest mt-0.5" style={{ color: "rgba(34,197,94,0.7)" }}>Admin Panel</p>
          </div>
          <button className="ml-auto md:hidden text-muted-foreground hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {NAV.map(item => {
            const active = activeSection === item.section;
            const hasGroup = (item.subTabs?.length ?? 0) > 0;
            const badge = item.isSupportBadge && supportUnread > 0 ? supportUnread : 0;

            return (
              <button
                key={item.section}
                onClick={() => navigateTo(item.section)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-mono transition-all text-left group",
                  active
                    ? "text-white"
                    : "text-muted-foreground hover:text-white",
                )}
                style={active ? { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.2)" } : { border: "1px solid transparent" }}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ background: "#22c55e" }} />
                )}
                <item.icon className={cn("w-4 h-4 shrink-0 transition-colors", active ? "text-green-400" : "text-muted-foreground group-hover:text-white")} />
                <span className="flex-1 truncate text-sm">{item.label}</span>
                {badge > 0 && (
                  <span className="flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[15px] h-[15px] bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                {hasGroup && !badge && (
                  <ChevronRight className={cn("w-3 h-3 shrink-0 transition-transform", active && "rotate-90")} style={{ color: active ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.2)" }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-3 space-y-1.5 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={handleBackup} disabled={backingUp}
              className="flex-1 font-mono text-xs h-8" style={{ borderColor: "rgba(34,197,94,0.3)", color: "#22c55e" }}
            >
              {backingUp ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              Backup
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={restoring}
              className="flex-1 font-mono text-xs h-8" style={{ borderColor: "rgba(96,165,250,0.3)", color: "#60a5fa" }}
            >
              {restoring ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
              Restore
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}
            className="w-full font-mono text-xs text-muted-foreground hover:text-white justify-start h-8"
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

        {/* Sub-tab bars */}
        {activeSection === "chains-group" && (
          <SubTabBar tabs={CHAINS_TABS} active={chainsSub} onChange={setChainsSub} />
        )}
        {activeSection === "analytics-group" && (
          <SubTabBar tabs={ANALYTICS_TABS} active={analyticsSub} onChange={setAnalyticsSub} />
        )}
        {activeSection === "security-group" && (
          <SubTabBar tabs={SECURITY_TABS} active={securitySub} onChange={setSecuritySub} />
        )}
        {activeSection === "content-group" && (
          <SubTabBar tabs={CONTENT_TABS} active={contentSub} onChange={setContentSub} />
        )}

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 min-w-0 overflow-auto">

          {activeSection === "dashboard"  && <AdminTabErrorBoundary label="Dashboard"><DashboardHome /></AdminTabErrorBoundary>}
          {activeSection === "live"       && <AdminTabErrorBoundary label="Live Monitor"><LiveMonitor /></AdminTabErrorBoundary>}
          {activeSection === "claims"     && <AdminTabErrorBoundary label="Claims Log"><ClaimsLog /></AdminTabErrorBoundary>}
          {activeSection === "support"    && <AdminTabErrorBoundary label="Support"><SupportManagement onUnreadCount={setSupportUnread} /></AdminTabErrorBoundary>}
          {activeSection === "exchange"   && <AdminTabErrorBoundary label="Exchange"><ExchangeManagement /></AdminTabErrorBoundary>}
          {activeSection === "referral"   && <AdminTabErrorBoundary label="Referral"><ReferralManagement /></AdminTabErrorBoundary>}
          {activeSection === "promo"      && <AdminTabErrorBoundary label="Promo Codes"><PromoManagement /></AdminTabErrorBoundary>}
          {activeSection === "earn-drop"  && <AdminTabErrorBoundary label="Earn Drop"><EarnDropManagement /></AdminTabErrorBoundary>}
          {activeSection === "siteconfig" && <AdminTabErrorBoundary label="Settings"><SiteConfig /></AdminTabErrorBoundary>}

          {activeSection === "chains-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {chainsSub === "chains"        && <ChainManagement />}
              {chainsSub === "chain-library" && <ChainLibrary />}
              {chainsSub === "wallets"       && <WalletHealth />}
              {chainsSub === "paynetworks"   && <PaymentNetworkManagement />}
            </AdminTabErrorBoundary>
          )}

          {activeSection === "analytics-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {analyticsSub === "analytics" && <Analytics />}
              {analyticsSub === "audience"  && <Audience />}
            </AdminTabErrorBoundary>
          )}

          {activeSection === "security-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {securitySub === "blocked"   && <BlockedAddresses />}
              {securitySub === "ipblocks"  && <IPBlocking />}
              {securitySub === "antiabuse" && <AntiAbusePanel />}
            </AdminTabErrorBoundary>
          )}

          {activeSection === "content-group" && (
            <AdminTabErrorBoundary label={breadcrumb}>
              {contentSub === "post"  && <PostManagement />}
              {contentSub === "ads"   && <AdManagement />}
              {contentSub === "pages" && <PagesManagement />}
            </AdminTabErrorBoundary>
          )}

        </main>
      </div>
    </div>
  );
}
