import { cn } from "@/lib/utils";

interface AdSlotProps {
  id: string;
  className?: string;
  label?: boolean;
}

/**
 * Placeholder for Google Ads / 3rd party ads.
 *
 * HOW TO ACTIVATE LATER:
 * 1. Add your ad script tag in index.html (Google AdSense / other provider)
 * 2. Replace the inner content of this component with the ad unit code
 * 3. Remove the placeholder styling
 *
 * Ad slot IDs used across the app:
 * - "home-top"       → Above the chain cards on home page
 * - "home-bottom"    → Below the recent feed on home page
 * - "page-top"       → Top of About/Contact/Privacy/Terms/FAQ pages
 */
export function AdSlot({ id, className, label = false }: AdSlotProps) {
  // Return null in production until ads are configured
  // TODO: Replace with actual ad unit when ready
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      id={`ad-slot-${id}`}
      className={cn(
        "w-full flex items-center justify-center rounded-lg border border-dashed border-border/40 bg-card/30 text-muted-foreground/30 text-xs font-mono select-none",
        "min-h-[60px]",
        className
      )}
      aria-hidden="true"
    >
      {label && `[ Ad Slot: ${id} ]`}
    </div>
  );
}
