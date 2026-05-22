import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken, registerUnauthorizedHandler, adminFetch } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  LogOut, LayoutDashboard, Link as LinkIcon,
  HeadphonesIcon, ClipboardList, ShieldOff, Wallet,
  FileText, BarChart2, Settings2, Globe, Send, Users, Radio, ArrowLeftRight, Network, GitBranch
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

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await adminFetch("/api/admin/support/unread-count");
    if (!res.ok) return 0;
    const data = await res.json() as { count: number };
    return data.count ?? 0;
  } catch { return 0; }
}

const TAB = "font-mono text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1 h-9 px-2.5 flex-shrink-0";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    const redirectToLogin = () => setLocation("/admin/login");
    registerUnauthorizedHandler(redirectToLogin);
    if (!isAuthenticated()) { redirectToLogin(); return; }
    // Verify token is actually valid — if 401, the handler will redirect
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

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="CD" className="w-8 h-8 object-contain" />
          <span className="font-bold font-mono uppercase tracking-tight text-lg hidden sm:inline-block">Terminal Admin</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4 mr-2" /> Disconnect
        </Button>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <Tabs defaultValue="stats" className="w-full space-y-8">
          <TabsList className="bg-card border border-border p-1 gap-0.5 flex flex-wrap h-auto w-full">
            <TabsTrigger value="live" className={TAB} title="Live">
              <Radio className="w-3.5 h-3.5" /> Live
            </TabsTrigger>
            <TabsTrigger value="stats" className={TAB} title="Stats">
              <LayoutDashboard className="w-3.5 h-3.5" /> Stats
            </TabsTrigger>
            <TabsTrigger value="analytics" className={TAB} title="Analytics">
              <BarChart2 className="w-3.5 h-3.5" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="audience" className={TAB} title="Audience">
              <Users className="w-3.5 h-3.5" /> Audience
            </TabsTrigger>
            <TabsTrigger value="chains" className={TAB} title="Chains">
              <LinkIcon className="w-3.5 h-3.5" /> Chains
            </TabsTrigger>
            <TabsTrigger value="wallets" className={TAB} title="Wallets">
              <Wallet className="w-3.5 h-3.5" /> Wallets
            </TabsTrigger>
            <TabsTrigger value="claims" className={TAB} title="Claims">
              <ClipboardList className="w-3.5 h-3.5" /> Claims
            </TabsTrigger>
            <TabsTrigger value="blocked" className={TAB} title="Blocked">
              <ShieldOff className="w-3.5 h-3.5" /> Blocked
            </TabsTrigger>
            <TabsTrigger value="ipblocks" className={TAB} title="IP Block">
              <Globe className="w-3.5 h-3.5" /> IP Block
            </TabsTrigger>
            <TabsTrigger value="post" className={TAB} title="Post">
              <Send className="w-3.5 h-3.5" /> Post
            </TabsTrigger>
            <TabsTrigger value="support" className={TAB} title="Support">
              <HeadphonesIcon className="w-3.5 h-3.5" />
              Support
              {supportUnread > 0 && (
                <span className="inline-flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[14px] h-[14px] leading-none"
                  style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.8)" }}>
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pages" className={TAB} title="Pages">
              <FileText className="w-3.5 h-3.5" /> Pages
            </TabsTrigger>
            <TabsTrigger value="exchange" className={TAB} title="Exchange">
              <ArrowLeftRight className="w-3.5 h-3.5" /> Exchange
            </TabsTrigger>
            <TabsTrigger value="paynetworks" className={TAB} title="Pay Networks">
              <Network className="w-3.5 h-3.5" /> Pay Networks
            </TabsTrigger>
            <TabsTrigger value="referral" className={TAB} title="Referral">
              <GitBranch className="w-3.5 h-3.5" /> Referral
            </TabsTrigger>
            <TabsTrigger value="siteconfig" className={TAB} title="Settings">
              <Settings2 className="w-3.5 h-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="mt-0 outline-none"><LiveMonitor /></TabsContent>
          <TabsContent value="stats" className="mt-0 outline-none"><StatsOverview /></TabsContent>
          <TabsContent value="analytics" className="mt-0 outline-none"><Analytics /></TabsContent>
          <TabsContent value="audience" className="mt-0 outline-none"><Audience /></TabsContent>
          <TabsContent value="chains" className="mt-0 outline-none"><ChainManagement /></TabsContent>
          <TabsContent value="wallets" className="mt-0 outline-none"><WalletHealth /></TabsContent>
          <TabsContent value="claims" className="mt-0 outline-none"><ClaimsLog /></TabsContent>
          <TabsContent value="blocked" className="mt-0 outline-none"><BlockedAddresses /></TabsContent>
          <TabsContent value="ipblocks" className="mt-0 outline-none"><IPBlocking /></TabsContent>
          <TabsContent value="post" className="mt-0 outline-none"><PostManagement /></TabsContent>
          <TabsContent value="support" className="mt-0 outline-none">
            <SupportManagement onUnreadCount={setSupportUnread} />
          </TabsContent>
          <TabsContent value="pages" className="mt-0 outline-none"><PagesManagement /></TabsContent>
          <TabsContent value="exchange" className="mt-0 outline-none"><ExchangeManagement /></TabsContent>
          <TabsContent value="paynetworks" className="mt-0 outline-none"><PaymentNetworkManagement /></TabsContent>
          <TabsContent value="referral" className="mt-0 outline-none"><ReferralManagement /></TabsContent>
          <TabsContent value="siteconfig" className="mt-0 outline-none"><SiteConfig /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
