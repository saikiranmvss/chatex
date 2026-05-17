import { cn } from "@/lib/utils";

export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
