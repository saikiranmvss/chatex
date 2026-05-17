import { useEffect, useState } from "react";
import { formatPresenceLabel, type PresenceUser } from "@/lib/presence-status";

/** Re-computes relative "last seen" text periodically. */
export function usePresenceLabel(user: PresenceUser): string {
  const [, tick] = useState(0);

  useEffect(() => {
    if (user?.presence === "online" || user?.presence === "away") return;
    if (!user?.lastSeenAt) return;

    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [user?.presence, user?.lastSeenAt]);

  return formatPresenceLabel(user);
}
