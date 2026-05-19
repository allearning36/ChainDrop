import { useState } from "react";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useGetAnnouncements, getGetAnnouncementsQueryKey } from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: announcements = [] } = useGetAnnouncements({
    query: {
      queryKey: getGetAnnouncementsQueryKey()
    }
  });
  const [open, setOpen] = useState(false);
  
  const activeAnnouncements = announcements.filter(a => a.isActive);
  const hasUnread = activeAnnouncements.length > 0;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono rounded">
            CD
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:inline-block">ChainDrop</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                {hasUnread && (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
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
          
          <Link href="/admin">
            <Button variant="outline" size="sm" className="hidden sm:flex">
              Admin
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
