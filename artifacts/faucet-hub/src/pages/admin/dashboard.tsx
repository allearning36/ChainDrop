import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  LogOut, LayoutDashboard, Link as LinkIcon, Image, Megaphone,
  HeadphonesIcon, Paintbrush, ClipboardList, ShieldOff, Wallet, KeyRound, FileText
} from "lucide-react";
import { StatsOverview } from "@/components/admin/Stats";
import { ChainManagement } from "@/components/admin/ChainManagement";
import { BannerManagement } from "@/components/admin/BannerManagement";
import { AnnouncementManagement } from "@/components/admin/AnnouncementManagement";
import { SupportManagement } from "@/components/admin/SupportManagement";
import { LogoManagement } from "@/components/admin/LogoManagement";
import { ClaimsLog } from "@/components/admin/ClaimsLog";
import { BlockedAddresses } from "@/components/admin/BlockedAddresses";
import { WalletHealth } from "@/components/admin/WalletHealth";
import { ChangePassword } from "@/components/admin/ChangePassword";
import { PagesManagement } from "@/components/admin/PagesManagement";

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await fetch("/api/admin/support/unread-count", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) return 0;
    const data = await res.json() as { count: number };
    return data.count ?? 0;
  } catch { return 0; }
}

const TAB = "font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 h-10 px-3";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    if (!isAuthenticated()) setLocation("/admin/login");
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
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap w-full gap-0.5">
            <TabsTrigger value="stats" className={TAB}>
              <LayoutDashboard className="w-3.5 h-3.5" /> Stats
            </TabsTrigger>
            <TabsTrigger value="chains" className={TAB}>
              <LinkIcon className="w-3.5 h-3.5" /> Chains
            </TabsTrigger>
            <TabsTrigger value="wallets" className={TAB}>
              <Wallet className="w-3.5 h-3.5" /> Wallets
            </TabsTrigger>
            <TabsTrigger value="claims" className={TAB}>
              <ClipboardList className="w-3.5 h-3.5" /> Claims
            </TabsTrigger>
            <TabsTrigger value="blocked" className={TAB}>
              <ShieldOff className="w-3.5 h-3.5" /> Blocked
            </TabsTrigger>
            <TabsTrigger value="banners" className={TAB}>
              <Image className="w-3.5 h-3.5" /> Banners
            </TabsTrigger>
            <TabsTrigger value="announcements" className={TAB}>
              <Megaphone className="w-3.5 h-3.5" /> Announcements
            </TabsTrigger>
            <TabsTrigger value="support" className={TAB}>
              <HeadphonesIcon className="w-3.5 h-3.5" />
              Support
              {supportUnread > 0 && (
                <span className="inline-flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[16px] h-[16px] leading-none"
                  style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.8)" }}>
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="logo" className={TAB}>
              <Paintbrush className="w-3.5 h-3.5" /> Logo
            </TabsTrigger>
            <TabsTrigger value="pages" className={TAB}>
              <FileText className="w-3.5 h-3.5" /> Pages
            </TabsTrigger>
            <TabsTrigger value="password" className={TAB}>
              <KeyRound className="w-3.5 h-3.5" /> Password
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-0 outline-none"><StatsOverview /></TabsContent>
          <TabsContent value="chains" className="mt-0 outline-none"><ChainManagement /></TabsContent>
          <TabsContent value="wallets" className="mt-0 outline-none"><WalletHealth /></TabsContent>
          <TabsContent value="claims" className="mt-0 outline-none"><ClaimsLog /></TabsContent>
          <TabsContent value="blocked" className="mt-0 outline-none"><BlockedAddresses /></TabsContent>
          <TabsContent value="banners" className="mt-0 outline-none"><BannerManagement /></TabsContent>
          <TabsContent value="announcements" className="mt-0 outline-none"><AnnouncementManagement /></TabsContent>
          <TabsContent value="support" className="mt-0 outline-none">
            <SupportManagement onUnreadCount={setSupportUnread} />
          </TabsContent>
          <TabsContent value="logo" className="mt-0 outline-none"><LogoManagement /></TabsContent>
          <TabsContent value="pages" className="mt-0 outline-none"><PagesManagement /></TabsContent>
          <TabsContent value="password" className="mt-0 outline-none"><ChangePassword /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
