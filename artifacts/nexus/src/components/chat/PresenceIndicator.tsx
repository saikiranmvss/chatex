import { cn } from "@/lib/utils";
import type { UserPresence } from "@workspace/api-client-react";
import { isUserAway, isUserOnline } from "@/lib/presence-status";

interface PresenceIndicatorProps {
  presence?: UserPresence;
  className?: string;
  size?: "sm" | "md";
}

export function PresenceIndicator({ presence, className, size = "sm" }: PresenceIndicatorProps) {
  if (!isUserOnline(presence) && !isUserAway(presence)) return null;

  const sizeClass = size === "md" ? "w-3 h-3 border-2" : "w-2.5 h-2.5 border-2";

  return (
    <div
      className={cn(
        "absolute bottom-0 right-0 rounded-full border-sidebar",
        sizeClass,
        isUserOnline(presence) ? "bg-green-500" : "bg-amber-400",
        className,
      )}
      aria-hidden
    />
  );
}
