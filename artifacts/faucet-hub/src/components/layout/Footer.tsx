import { useEffect, useState } from "react";
import { Link } from "wouter";

interface SocialLinks { twitter: string; telegram: string; discord: string; github: string; }
interface SiteConfig { socialLinks: SocialLinks; maintenanceEnabled: boolean; maintenanceMessage: string; }

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.031.053a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function Footer() {
  const [social, setSocial] = useState<SocialLinks>({ twitter: "", telegram: "", discord: "", github: "" });
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");

  useEffect(() => {
    fetch("/api/site-config/public")
      .then(r => r.json())
      .then((d: SiteConfig) => {
        setSocial(d.socialLinks);
        setMaintenance(d.maintenanceEnabled);
        setMaintenanceMsg(d.maintenanceMessage);
      })
      .catch(() => {});
  }, []);

  const socialIcons = [
    { href: social.telegram, icon: <TelegramIcon />, label: "Telegram", color: "#2CA5E0" },
    { href: social.twitter,  icon: <XIcon />,        label: "X (Twitter)", color: "#ffffff" },
    { href: social.discord,  icon: <DiscordIcon />,  label: "Discord", color: "#5865F2" },
    { href: social.github,   icon: <GithubIcon />,   label: "GitHub", color: "#ffffff" },
  ].filter(s => s.href);

  return (
    <footer className="border-t border-border mt-auto">
      {/* Maintenance banner */}
      {maintenance && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-center text-xs text-destructive font-mono">
          ⚠ {maintenanceMsg}
        </div>
      )}

      <div className="container mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Top row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="ChainDrop" className="w-7 h-7 object-contain" />
            <span className="font-bold text-sm tracking-tight">ChainDrop</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            {[
              { href: "/about",   label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/faq",     label: "FAQ" },
              { href: "/status",  label: "Status" },
              { href: "/lookup",  label: "Lookup" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms",   label: "Terms" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Social section */}
        {socialIcons.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-4 border-t border-border/40">
            <span
              className="text-[10px] font-mono uppercase tracking-[0.25em]"
              style={{ color: "rgba(255,255,255,0.25)" }}
            >
              Social
            </span>
            <div className="flex items-center gap-3">
              {socialIcons.map(({ href, icon, label, color }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  className="group flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.45)",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.color = color;
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                    (e.currentTarget as HTMLElement).style.borderColor = color + "44";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  {icon}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Bottom row */}
        <div className="border-t border-border/50 pt-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ChainDrop. All rights reserved.</p>
          <div className="flex items-center gap-4 font-mono">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <span className="opacity-30">|</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
