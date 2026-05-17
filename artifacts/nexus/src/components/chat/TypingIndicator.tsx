import { cn } from "@/lib/utils";
import type { TypingUser } from "@/lib/typing";

interface TypingIndicatorProps {
  users: TypingUser[];
  variant?: "inline" | "bubble" | "compact";
  className?: string;
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:160ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-bounce [animation-delay:320ms]" />
    </span>
  );
}

export function TypingIndicator({ users, variant = "inline", className }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  if (variant === "bubble") {
    return (
      <div
        className={cn(
          "flex items-end pl-1 md:pl-10 animate-in fade-in slide-in-from-bottom-2 duration-200",
          className,
        )}
        role="status"
        aria-label="Typing"
        aria-live="polite"
      >
        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-border/50">
          <TypingDots className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center", className)}
      role="status"
      aria-label="Typing"
      aria-live="polite"
    >
      <TypingDots />
    </span>
  );
}
