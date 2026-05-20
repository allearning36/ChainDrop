import { useEffect, useState } from "react";
import { Link } from "wouter";

interface SocialLinks { twitter: string; telegram: string; discord: string; github: string; }
interface SiteConfig { socialLinks: SocialLinks; maintenanceEnabled: boolean; maintenanceMessage: string; }

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

  const socialLinks = [
    { href: social.twitter, label: "[ Twitter ]" },
    { href: social.telegram, label: "[ Telegram ]" },
    { href: social.discord, label: "[ Discord ]" },
    { href: social.github, label: "[ GitHub ]" },
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
              { href: "/about", label: "About" },
              { href: "/contact", label: "Contact" },
              { href: "/faq", label: "FAQ" },
              { href: "/status", label: "Status" },
              { href: "/lookup", label: "Lookup" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map(({ href, label }) => (
              <Link key={href} href={href} className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs">
                {label}
              </Link>
            ))}
          </nav>

          {socialLinks.length > 0 && (
            <div className="flex items-center gap-3 text-sm flex-wrap justify-center">
              {socialLinks.map(({ href, label }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors font-mono text-xs">
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>

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
