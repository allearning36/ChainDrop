import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken, getToken } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Link as LinkIcon, Image, Megaphone, HeadphonesIcon, Paintbrush } from "lucide-react";
import { StatsOverview } from "@/components/admin/Stats";
import { ChainManagement } from "@/components/admin/ChainManagement";
import { BannerManagement } from "@/components/admin/BannerManagement";
import { AnnouncementManagement } from "@/components/admin/AnnouncementManagement";
import { SupportManagement } from "@/components/admin/SupportManagement";
import { LogoManagement } from "@/components/admin/LogoManagement";

async function fetchUnreadCount(): Promise<number> {
  try {
    const res = await fetch("/api/admin/support/unread-count", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    if (!res.ok) return 0;
    const data = await res.json() as { count: number };
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    if (!isAuthenticated()) setLocation("/admin/login");
  }, [setLocation]);

  // Poll unread count every 20s regardless of which tab is active
  useEffect(() => {
    if (!isAuthenticated()) return;
    void fetchUnreadCount().then(setSupportUnread);
    const id = setInterval(() => void fetchUnreadCount().then(setSupportUnread), 20000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    removeToken();
    setLocation("/");
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.svg" alt="CD" className="w-8 h-8 object-contain" />
          <span className="font-bold font-mono uppercase tracking-tight text-lg hidden sm:inline-block">
            Terminal Admin
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </Button>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <Tabs defaultValue="stats" className="w-full space-y-8">
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap w-full overflow-x-auto justify-start">
            <TabsTrigger value="stats" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <LayoutDashboard className="w-4 h-4" /> Stats
            </TabsTrigger>
            <TabsTrigger value="chains" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <LinkIcon className="w-4 h-4" /> Chains
            </TabsTrigger>
            <TabsTrigger value="banners" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <Image className="w-4 h-4" /> Banners
            </TabsTrigger>
            <TabsTrigger value="announcements" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <Megaphone className="w-4 h-4" /> Announcements
            </TabsTrigger>

            {/* Support tab — badge always visible from any tab */}
            <TabsTrigger value="support" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <HeadphonesIcon className="w-4 h-4" />
              Support
              {supportUnread > 0 && (
                <span
                  className="inline-flex items-center justify-center font-mono font-bold text-white rounded-full text-[9px] px-1 min-w-[16px] h-[16px] leading-none"
                  style={{
                    background: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,0.8)",
                    marginLeft: 2,
                  }}
                >
                  {supportUnread > 99 ? "99+" : supportUnread}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="logo" className="font-mono text-sm data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2 h-10 px-4">
              <Paintbrush className="w-4 h-4" /> Logo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-0 outline-none">
            <StatsOverview />
          </TabsContent>
          <TabsContent value="chains" className="mt-0 outline-none">
            <ChainManagement />
          </TabsContent>
          <TabsContent value="banners" className="mt-0 outline-none">
            <BannerManagement />
          </TabsContent>
          <TabsContent value="announcements" className="mt-0 outline-none">
            <AnnouncementManagement />
          </TabsContent>
          <TabsContent value="support" className="mt-0 outline-none">
            <SupportManagement onUnreadCount={setSupportUnread} />
          </TabsContent>
          <TabsContent value="logo" className="mt-0 outline-none">
            <LogoManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
