import { useEffect } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, removeToken } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Link as LinkIcon, Image, Megaphone } from "lucide-react";
import { StatsOverview } from "@/components/admin/Stats";
import { ChainManagement } from "@/components/admin/ChainManagement";
import { BannerManagement } from "@/components/admin/BannerManagement";
import { AnnouncementManagement } from "@/components/admin/AnnouncementManagement";

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated()) {
      setLocation("/admin/login");
    }
  }, [setLocation]);

  const handleLogout = () => {
    removeToken();
    setLocation("/");
  };

  if (!isAuthenticated()) return null;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono rounded">
            CD
          </div>
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
          <TabsList className="bg-card border border-border h-auto p-1 flex-wrap sm:flex-nowrap w-full sm:w-auto overflow-x-auto justify-start sm:justify-center">
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
        </Tabs>
      </main>
    </div>
  );
}
