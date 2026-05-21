import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Bell, MessageCircle, ChevronDown, ChevronRight, Megaphone, Menu, ArrowLeftRight } from "lucide-react";
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logo, setLogo] = useState<LogoSettings>({ logoUrl: "/logo.svg", logoGlow: "medium", logoSize: "medium" });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLogoSettings().then(setLogo);
    const handler = (e: Event) => setLogo((e as CustomEvent<LogoSettings>).detail);
    window.addEventListener("logoSettingsChanged", handler);
    return () => window.removeEventListener("logoSettingsChanged", handler);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const activeAnnouncements = announcements.filter(a => a.isActive);
  const hasUnread = activeAnnouncements.length > 0;
  const px = SIZE_PX[logo.logoSize] ?? 40;

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-xl" style={{ background: "rgba(8,10,14,0.92)", borderBottom: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 1px 20px rgba(0,0,0,0.4)" }}>
      <div className="w-full flex h-16 items-center px-2 gap-2">

        {/* ── LEFT: Hamburger menu ── */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex flex-col justify-center items-center gap-[5px] w-10 h-10 rounded-lg transition-colors"
            style={{
              background: menuOpen ? "rgba(34,197,94,0.08)" : "transparent",
              border: menuOpen ? "1px solid rgba(34,197,94,0.2)" : "1px solid transparent",
            }}
            aria-label="Menu"
          >
            <span className="block w-5 h-[2px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "rgba(255,255,255,0.6)" }} />
            <span className="block w-5 h-[2px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "rgba(255,255,255,0.6)" }} />
            <span className="block w-5 h-[2px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "rgba(255,255,255,0.6)" }} />
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className="absolute left-0 top-[calc(100%+8px)] rounded-xl overflow-hidden z-50 min-w-[180px]"
              style={{
                background: "rgba(12,15,20,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                backdropFilter: "blur(16px)",
              }}
            >
              <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Navigation</span>
              </div>
              <div className="p-2">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(34,197,94,0.08)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                  </div>
                  <span className="font-mono font-semibold text-sm">Exchange</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: spacer ── */}
        <div className="flex-1" />

        {/* ── RIGHT: Logo + Name ── */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col leading-none min-w-0 items-end">
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
              className="font-mono uppercase whitespace-nowrap"
              style={{ fontSize: "7px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.13em" }}
            >
              Your Ultimate Faucet Hub
            </span>
          </div>
          <img
            src={logo.logoUrl}
            alt="ChainDrop"
            className="shrink-0"
            style={{ width: px, height: px, objectFit: "contain", filter: GLOW_FILTER[logo.logoGlow] ?? GLOW_FILTER.medium, transition: "all 0.3s" }}
          />
        </Link>

        {/* ── FAR RIGHT: Support + Bell ── */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSupportOpen(true)}
            className="h-9 gap-1.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground flex items-center"
          >
            <span className="relative flex items-center shrink-0">
              <MessageCircle className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            </span>
            Support
          </Button>

          <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setExpandedId(null); }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {hasUnread && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden" align="end">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <Megaphone className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-bold font-mono leading-none">Announcements</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {activeAnnouncements.length === 0
                      ? "No new announcements"
                      : `${activeAnnouncements.length} active`}
                  </p>
                </div>
              </div>

              <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
                {activeAnnouncements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Bell className="w-7 h-7 opacity-30" />
                    <span className="text-xs font-mono">Nothing new right now</span>
                  </div>
                ) : (
                  activeAnnouncements.map((a) => {
                    const isOpen = expandedId === a.id;
                    return (
                      <div key={a.id} className="bg-background hover:bg-card/60 transition-colors">
                        <button
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                          onClick={() => setExpandedId(isOpen ? null : a.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-primary mt-px" />
                            <span className="text-sm font-semibold font-mono truncate leading-snug">{a.title}</span>
                          </div>
                          {isOpen
                            ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          }
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 pt-0">
                            <div
                              className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap rounded-lg p-3"
                              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                            >
                              {a.content}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </nav>
  );
}
