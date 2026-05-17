import { formatDistanceToNow, isToday, isYesterday, format } from "date-fns";
import type { User, UserPresence } from "@workspace/api-client-react";

export type PresenceUser = Pick<User, "presence" | "lastSeenAt"> | undefined | null;

export function isUserOnline(presence?: UserPresence): boolean {
  return presence === "online";
}

export function isUserAway(presence?: UserPresence): boolean {
  return presence === "away";
}

/** Human-readable presence line for chat headers and list subtitles. */
export function formatPresenceLabel(user: PresenceUser): string {
  if (!user) return "Offline";

  if (user.presence === "online") return "Online";
  if (user.presence === "away") return "Away";

  if (user.lastSeenAt) {
    return `Last seen ${formatLastSeen(user.lastSeenAt)}`;
  }

  return "Offline";
}

/** Shorter label for sidebar rows. */
export function formatPresenceShort(user: PresenceUser): string | null {
  if (!user) return null;
  if (user.presence === "online") return null;
  if (user.presence === "away") return "Away";
  if (user.lastSeenAt) return formatLastSeen(user.lastSeenAt);
  return null;
}

export function formatLastSeen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "recently";

  const distance = formatDistanceToNow(date, { addSuffix: false });
  if (isToday(date)) return distance;
  if (isYesterday(date)) return "yesterday";
  if (Date.now() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
    return format(date, "EEEE");
  }
  return format(date, "MMM d");
}
