import { useState } from "react";
import { Type, Image, Megaphone } from "lucide-react";
import { HeadlineManagement } from "./HeadlineManagement";
import { BannerManagement } from "./BannerManagement";
import { AnnouncementManagement } from "./AnnouncementManagement";

type Tab = "headline" | "banners" | "alerts";
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "headline", label: "Headline", icon: Type },
  { id: "banners", label: "Banners", icon: Image },
  { id: "alerts", label: "Alerts", icon: Megaphone },
];

export function PostManagement() {
  const [tab, setTab] = useState<Tab>("headline");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold font-mono">Post Management</h2>
        <p className="text-sm text-muted-foreground mt-1">Manage headlines, banners, and alert announcements.</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-border pb-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-mono border transition-colors ${tab === id ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>
      {tab === "headline" && <HeadlineManagement />}
      {tab === "banners" && <BannerManagement />}
      {tab === "alerts" && <AnnouncementManagement />}
    </div>
  );
}
