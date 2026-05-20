import { useState } from "react";
import { Link } from "wouter";
import { Bell, MessageCircle } from "lucide-react";
import { useGetAnnouncements, getGetAnnouncementsQueryKey } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SupportModal } from "@/components/support/SupportModal";

export function Navbar() {
  const { data: announcements = [] } = useGetAnnouncements({
    query: {
      queryKey: getGetAnnouncementsQueryKey()
    }
  });
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  
  const activeAnnouncements = announcements.filter(a => a.isActive);
  const hasUnread = activeAnnouncements.length > 0;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="ChainDrop"
            className="h-10 w-10 object-contain shrink-0"
            style={{ filter: "drop-shadow(0 0 8px rgba(34,197,94,0.5))" }}
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
          {/* Support button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSupportOpen(true)}
            className="h-9 gap-1.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground flex"
          >
            <MessageCircle className="h-4 w-4 shrink-0" />
            Support
          </Button>

          {/* Announcements bell */}
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
                  <p className="text-sm text-muted-foreground">
                    Latest news and updates.
                  </p>
                </div>
                <div className="grid gap-2">
                  {activeAnnouncements.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No new announcements</div>
                  ) : (
                    activeAnnouncements.map((announcement) => (
                      <div key={announcement.id} className="text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                        <div className="font-medium">{announcement.title}</div>
                        <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{announcement.content}</div>
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
