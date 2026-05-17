import { Link, useLocation } from "wouter";
import { MessageSquare, Hash, Star, Bell, Shield, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChatWebSocket } from "@/contexts/chat-websocket";
import { NavBadge } from "./NavBadge";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { unreadNotificationCount } = useChatWebSocket();

  const items = [
    { icon: MessageSquare, label: "Chat", path: "/" },
    { icon: Hash, label: "Channels", path: "/channels" },
    { icon: Star, label: "Starred", path: "/starred" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    ...(user?.role === "admin" ? [{ icon: Shield, label: "Admin", path: "/admin" }] : []),
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  // Limit to 5 items on mobile for clean display
  const displayItems = items.slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 backdrop-blur-sm border-t border-border flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {displayItems.map(item => {
        const isActive = location === item.path;
        return (
          <Link key={item.path} href={item.path} className="flex-1">
            <div
              className={`relative flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors min-h-[52px] ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-2"}`} />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
              {item.path === "/notifications" && (
                <NavBadge count={unreadNotificationCount} className="top-0.5 right-[calc(50%-20px)]" />
              )}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
