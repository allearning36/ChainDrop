import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Bell, MessageCircle, ChevronDown, ChevronRight, Megaphone, ArrowLeftRight, Users } from "lucide-react";
import { useGetAnnouncements, getGetAnnouncementsQueryKey, useGetReferralSettings, getGetReferralSettingsQueryKey } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SupportModal } from "@/components/support/SupportModal";
import { ReferralDashboardModal } from "@/components/home/ReferralDashboardModal";

interface LogoSettings { logoUrl: string; logoGlow: string; logoSize: string; }

const GLOW_FILTER: Record<string, string> = {
  none: "none",
  subtle: "drop-shadow(0 0 4px rgba(34,197,94,0.3))",
  medium: "drop-shadow(0 0 10px rgba(34,197,94,0.6))",
  bright: "drop-shadow(0 0 18px rgba(34,197,94,1))",
};
const SIZE_PX: Record<string, number> = { small: 32, medium: 40, large: 52 };
const SEEN_KEY = "chainDrop_seenAnnouncements";
const SUPPORT_CONV_KEY = "chainDrop_supportConvId";
const SUPPORT_TOKEN_KEY = "chainDrop_supportToken";

async function loadLogoSettings(): Promise<LogoSettings> {
  try {
    const r = await fetch("/api/settings");
    return await r.json();
  } catch {
    return { logoUrl: "/logo.svg", logoGlow: "medium", logoSize: "medium" };
  }
}

function getSeenIds(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function markAllSeen(ids: number[]) {
  try {
    const existing = getSeenIds();
    ids.forEach(id => existing.add(id));
    localStorage.setItem(SEEN_KEY, JSON.stringify([...existing]));
  } catch { /* ignore */ }
}

export function Navbar() {
  const { data: announcements = [] } = useGetAnnouncements({
    query: { queryKey: getGetAnnouncementsQueryKey(), refetchInterval: 30000 }
  });
  const { data: referralSettings } = useGetReferralSettings({
    query: { queryKey: getGetReferralSettingsQueryKey() }
  });
  const referralEnabled = referralSettings?.enabled ?? true;
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [referralOpen, setReferralOpen] = useState(false);
  const [logo, setLogo] = useState<LogoSettings>({ logoUrl: "/logo.svg", logoGlow: "medium", logoSize: "medium" });
  const [seenIds, setSeenIds] = useState<Set<number>>(getSeenIds);
  const [supportUnread, setSupportUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

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

  // SSE: instant notification when admin replies in support
  useEffect(() => {
    const storedId = localStorage.getItem(SUPPORT_CONV_KEY);
    const storedToken = localStorage.getItem(SUPPORT_TOKEN_KEY);
    if (!storedId || !storedToken) return;
    const id = parseInt(storedId);
    if (isNaN(id)) return;

    // Fetch current unread count on mount
    fetch(`/api/support/conversations/${id}/unread`, {
      headers: { "x-user-token": storedToken },
    })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { count: number } | null) => { if (d) setSupportUnread(d.count); })
      .catch(() => {});

    const token = storedToken as string;
    // Re-fetch actual unread count (accurate, avoids race conditions)
    async function refreshCount() {
      try {
        const r = await fetch(`/api/support/conversations/${id}/unread`, {
          headers: { "x-user-token": token },
        });
        if (r.ok) setSupportUnread(((await r.json()) as { count: number }).count);
      } catch { /* ignore */ }
    }

    // Open SSE stream — admin reply pushes event instantly
    const es = new EventSource(
      `/api/support/conversations/${id}/stream?token=${encodeURIComponent(storedToken)}`
    );
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { type: string };
        if (data.type === "new_reply") void refreshCount();
      } catch { /* ignore */ }
    };
    sseRef.current = es;
    return () => { es.close(); sseRef.current = null; };
  }, []);

  // Clear support unread when modal opens
  function handleSupportOpen() {
    setSupportOpen(true);
    setSupportUnread(0);
  }

  const activeAnnouncements = announcements.filter(a => a.isActive);
  const unseenCount = activeAnnouncements.filter(a => !seenIds.has(a.id)).length;
  const px = SIZE_PX[logo.logoSize] ?? 40;

  function handleBellOpen(o: boolean) {
    setOpen(o);
    if (!o) setExpandedId(null);
  }

  function handleMarkAllRead() {
    const ids = activeAnnouncements.map(a => a.id);
    markAllSeen(ids);
    setSeenIds(getSeenIds());
  }

  function handleAnnouncementClick(id: number, isExpanded: boolean) {
    const newId = isExpanded ? null : id;
    setExpandedId(newId);
    if (newId !== null) {
      markAllSeen([id]);
      setSeenIds(getSeenIds());
    }
  }

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-xl" style={{ background: "rgba(8,10,14,0.92)", borderBottom: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 1px 20px rgba(0,0,0,0.4)" }}>
      <div className="w-full flex h-16 items-center pl-2 pr-4 gap-2">

        {/* ── LEFT: Hamburger menu ── */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex flex-col justify-center items-center gap-[5px] w-10 h-10 rounded-lg transition-colors"
            style={{
              background: menuOpen ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.06)",
              border: menuOpen ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(255,255,255,0.15)",
            }}
            aria-label="Menu"
          >
            <span className="block w-[22px] h-[2.5px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "#ffffff" }} />
            <span className="block w-[22px] h-[2.5px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "#ffffff" }} />
            <span className="block w-[22px] h-[2.5px] rounded-full transition-all" style={{ background: menuOpen ? "#22c55e" : "#ffffff" }} />
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
              <div className="p-2 space-y-0.5">
                <Link href="/exchange"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                  onMouseEnter={(e: any) => (e.currentTarget.style.background = "rgba(167,139,250,0.08)")}
                  onMouseLeave={(e: any) => (e.currentTarget.style.background = "transparent")}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)" }}>
                    <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} />
                  </div>
                  <span className="font-mono font-semibold text-sm">Exchange</span>
                </Link>
                {referralEnabled && (
                  <button
                    onClick={() => { setMenuOpen(false); setReferralOpen(true); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                    style={{ color: "rgba(255,255,255,0.75)" }}
                    onMouseEnter={(e: any) => (e.currentTarget.style.background = "rgba(34,197,94,0.08)")}
                    onMouseLeave={(e: any) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <Users className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
                    </div>
                    <span className="font-mono font-semibold text-sm">Referral</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Logo + Name ── */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img
            src={logo.logoUrl}
            alt="ChainDrop"
            className="shrink-0"
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
              className="font-mono uppercase whitespace-nowrap"
              style={{ fontSize: "7px", color: "rgba(255,255,255,0.4)", letterSpacing: "0.13em" }}
            >
              Your Ultimate Faucet Hub
            </span>
          </div>
        </Link>

        <div className="flex-1" />

        {/* ── FAR RIGHT: Support + Bell ── */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Support button with unread badge */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSupportOpen}
            className="h-9 gap-1.5 text-xs font-mono font-semibold text-muted-foreground hover:text-foreground flex items-center"
          >
            <span className="relative flex items-center shrink-0">
              <MessageCircle className="h-4 w-4" />
              {supportUnread > 0 ? (
                <span
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white font-mono leading-none"
                  style={{
                    minWidth: 14,
                    height: 14,
                    padding: "0 3px",
                    background: "linear-gradient(135deg,#dc2626,#ef4444)",
                    boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                  }}
                >
                  {supportUnread > 9 ? "9+" : supportUnread}
                </span>
              ) : (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </span>
            Support
          </Button>

          {/* Bell with unseen announcement count */}
          <Popover open={open} onOpenChange={handleBellOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {unseenCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white font-mono leading-none"
                    style={{
                      minWidth: 15,
                      height: 15,
                      padding: "0 3px",
                      background: "#ef4444",
                      boxShadow: "0 0 6px rgba(239,68,68,0.7)",
                    }}
                  >
                    {unseenCount > 9 ? "9+" : unseenCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 overflow-hidden" align="end">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
                <Megaphone className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold font-mono leading-none">Announcements</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {activeAnnouncements.length === 0
                      ? "No new announcements"
                      : `${activeAnnouncements.length} active`}
                  </p>
                </div>
                {unseenCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="shrink-0 text-[10px] font-mono font-semibold px-2 py-1 rounded transition-colors"
                    style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)" }}
                  >
                    Read All
                  </button>
                )}
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
                {activeAnnouncements.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <Bell className="w-7 h-7 opacity-30" />
                    <span className="text-xs font-mono">Nothing new right now</span>
                  </div>
                ) : (
                  activeAnnouncements.map((a) => {
                    const isExpanded = expandedId === a.id;
                    const isUnseen = !seenIds.has(a.id);
                    return (
                      <div key={a.id} className="bg-background hover:bg-card/60 transition-colors">
                        <button
                          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                          onClick={() => handleAnnouncementClick(a.id, isExpanded)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="shrink-0 w-1.5 h-1.5 rounded-full mt-px"
                              style={{ background: isUnseen ? "#ef4444" : "rgba(255,255,255,0.2)" }}
                            />
                            <span className={`text-sm font-mono truncate leading-snug ${isUnseen ? "font-bold text-foreground" : "font-semibold text-muted-foreground"}`}>{a.title}</span>
                          </div>
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          }
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 space-y-2">
                            {a.imageUrl && (
                              <div className="rounded-lg overflow-hidden border border-border">
                                <img
                                  src={a.imageUrl}
                                  alt={a.title}
                                  className="w-full object-cover"
                                  style={{ maxHeight: 140 }}
                                  onError={(e) => (e.currentTarget.style.display = "none")}
                                />
                              </div>
                            )}
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
      <ReferralDashboardModal open={referralOpen} onClose={() => setReferralOpen(false)} />
    </nav>
  );
}
