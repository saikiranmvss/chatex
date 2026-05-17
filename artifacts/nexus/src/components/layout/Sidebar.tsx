import { Link, useLocation } from "wouter";
import { MessageSquare, Hash, Star, Bell, Shield, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLogout } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useChatWebSocket } from "@/contexts/chat-websocket";
import { NavBadge } from "./NavBadge";

export function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { unreadNotificationCount } = useChatWebSocket();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("nexus_token");
        setLocation("/login");
      }
    });
  };

  const navItems = [
    { icon: MessageSquare, label: "Chat", path: "/" },
    { icon: Hash, label: "Channels", path: "/channels" },
    { icon: Star, label: "Starred", path: "/starred" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
  ];

  if (user?.role === "admin") {
    navItems.push({ icon: Shield, label: "Admin", path: "/admin" });
  }

  return (
    <div className="w-16 lg:w-64 h-full bg-sidebar border-r border-sidebar-border flex flex-col items-center lg:items-stretch py-4">
      <div className="flex items-center justify-center lg:justify-start lg:px-6 mb-8">
        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold shrink-0">NX</div>
        <span className="hidden lg:block ml-3 font-semibold text-lg tracking-tight">Nexus</span>
      </div>

      <nav className="flex-1 w-full space-y-2 px-2 lg:px-4">
        {navItems.map((item) => {
          const isActive = location === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <div className={`flex items-center w-full px-2 lg:px-3 py-2 rounded-md cursor-pointer transition-colors ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"}`}>
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:block ml-3 text-sm font-medium">{item.label}</span>
                {item.path === "/notifications" && unreadNotificationCount > 0 && (
                  <span className="hidden lg:flex ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold items-center justify-center">
                    {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="w-full px-2 lg:px-4 space-y-2">
        <Link href="/settings">
          <div className="flex items-center w-full px-2 lg:px-3 py-2 rounded-md cursor-pointer text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
            <Settings className="w-5 h-5 shrink-0" />
            <span className="hidden lg:block ml-3 text-sm font-medium">Settings</span>
          </div>
        </Link>
        <button onClick={handleLogout} className="flex items-center w-full px-2 lg:px-3 py-2 rounded-md cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
          <LogOut className="w-5 h-5 shrink-0" />
          <span className="hidden lg:block ml-3 text-sm font-medium">Logout</span>
        </button>
      </div>

      {user && (
        <div className="mt-4 pt-4 border-t border-sidebar-border w-full flex items-center justify-center lg:justify-start px-2 lg:px-6">
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback>{user.displayName?.charAt(0) || user.username.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="hidden lg:block ml-3 overflow-hidden">
            <p className="text-sm font-medium truncate">{user.displayName || user.username}</p>
            <p className="text-xs text-muted-foreground truncate">{user.presence}</p>
          </div>
        </div>
      )}
    </div>
  );
}
