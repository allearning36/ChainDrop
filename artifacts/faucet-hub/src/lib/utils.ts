import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a cooldown in seconds to a human-readable string like "1h 30m" or "45s" */
export function formatCooldown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(" ");
}

/** Convert H/M/S values to total seconds */
export function hmsToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

/** Convert total seconds to H/M/S parts */
export function secondsToHms(total: number): { h: number; m: number; s: number } {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h, m, s };
}
