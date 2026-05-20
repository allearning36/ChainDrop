import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Bell, MessageCircle } from "lucide-react";
import { useGetAnnouncements, getGetAnnouncementsQueryKey } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SupportModal } from "@/components/support/SupportModal";

interface LogoSettings { logoUrl: string; logoGlow: string; logoSize: string; }

const GLOW_FILTER: Record<string, string> = {
  none: "none",
  subtle: "drop-shadow(0 0 4px rgba(34,197,94,0.3))",
  medium: "drop-shadow(0 0 10px rgba(34,197,94,0.6))",
  bright: "drop-shadow(0 0 18px rgba(34,197,94,1))",
};
const SIZE_PX: Record<string, number> = { small: 32, medium: 40, large: 52 };

async function loadLogoSettings(): Promise<LogoSettings> {
  try {
    const r = await fetch("/api/settings");
    return await r.json();
  } catch {
    return { logoUrl: "/logo.svg", logoGlow: "medium", logoSize: "medium" };
  }
}

export function Navbar() {
  const { data: announcements = [] } = useGetAnnouncements({
    query: { queryKey: getGetAnnouncementsQueryKey() }
  });
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [logo, setLogo] = useState<LogoSettings>({ logoUrl: "/logo.svg", logoGlow: "medium", logoSize: "medium" });

  useEffect(() => {
    loadLogoSettings().then(setLogo);
    const handler = (e: Event) => setLogo((e as CustomEvent<LogoSettings>).detail);
    window.addEventListener("logoSettingsChanged", handler);
    return () => window.removeEventListener("logoSettingsChanged", handler);
  }, []);

  const activeAnnouncements = announcements.filter(a => a.isActive);
  const hasUnread = activeAnnouncements.length > 0;
  const px = SIZE_PX[logo.logoSize] ?? 40;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <img
            src={logo.logoUrl}
            alt="ChainDrop"
            style={{ width: px, height: px, objectFit: "contain", filter: GLOW_FILTER[logo.logoGlow] ?? GLOW_FILTER.medium, transition: "all 0.3s" }}
          />
          <div className="flex flex-col leading-none">
            <span
              className="font-black tracking-wider uppercase"
              style={{
                fontSize: "clamp(18px, 4vw, 26px)",
                fontFamily: "'Courier New', monospace",
                color: "#22c55e",
                textShadow: "0 0 12px rgba(34,197,94,0.5)",
                letterSpacing: "0.12em",
              }}
            >
              ChainDrop
            </span>
            <span
              className="font-mono uppercase tracking-widest"
              style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em" }}
            >
              Your Ultimate Faucet Hub
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSupportOpen(true)}
            className="h-9 gap-1.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground flex items-center"
          >
            <span className="relative flex items-center shrink-0">
              <MessageCircle className="h-4 w-4" />
              {/* Live indicator dot */}
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            </span>
            Support
          </Button>

          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {hasUnread && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Announcements</h4>
                  <p className="text-sm text-muted-foreground">Latest news and updates.</p>
                </div>
                <div className="grid gap-2">
                  {activeAnnouncements.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No new announcements</div>
                  ) : (
                    activeAnnouncements.map((a) => (
                      <div key={a.id} className="text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </nav>
  );
}
