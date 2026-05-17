import { useLocation } from "wouter";
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, MessageSquare, Hash, UserPlus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { useChatWebSocket } from "@/contexts/chat-websocket";
import { markNotificationRead } from "@/lib/notifications-api";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const { data: notifications, isLoading } = useListNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();
  const { refreshUnreadCount } = useChatWebSocket();

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        refreshUnreadCount();
      },
    });
  };

  const handleOpen = async (n: Notification) => {
    if (!n.isRead) {
      try {
        await markNotificationRead(n.id);
        queryClient.setQueryData<Notification[]>(getListNotificationsQueryKey(), (old) =>
          old?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
        );
        refreshUnreadCount();
      } catch {
        // ignore
      }
    }
    if (n.referenceType === "conversation" && n.referenceId != null) {
      navigate(`/?conversation=${n.referenceId}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case "mention":
        return <UserPlus className="w-5 h-5 text-purple-500" />;
      case "channel_broadcast":
        return <Hash className="w-5 h-5 text-orange-500" />;
      default:
        return <Bell className="w-5 h-5 text-primary" />;
    }
  };

  const unread = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <div className="flex flex-col h-full w-full max-w-2xl mx-auto">
      <div className="px-4 md:px-6 py-4 md:py-5 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-background/95 backdrop-blur sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            {unread > 0 ? `${unread} unread` : "You're all caught up"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 cursor-pointer"
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending || unread === 0}
        >
          <CheckCheck className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Mark all read</span>
          <span className="sm:hidden">Read all</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : notifications?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-4 text-center">
            <Bell className="w-14 h-14 mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground">All caught up</p>
            <p className="text-sm mt-1">New messages and activity will show up here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications?.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleOpen(notification)}
                className={cn(
                  "w-full text-left p-4 rounded-2xl border transition-colors flex gap-3 cursor-pointer active:scale-[0.99]",
                  notification.isRead
                    ? "bg-card border-border/60"
                    : "bg-primary/5 border-primary/25 shadow-sm",
                )}
              >
                <div className="relative shrink-0">
                  {notification.actorUser ? (
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={notification.actorUser.avatarUrl || undefined} />
                      <AvatarFallback>
                        {notification.actorUser.displayName?.charAt(0) || "?"}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center border">
                      {getIcon(notification.type)}
                    </div>
                  )}
                  {!notification.isRead && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary rounded-full border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0 py-0.5">
                  <div className="flex justify-between items-start gap-2 mb-0.5">
                    <h3
                      className={cn(
                        "font-medium text-sm truncate",
                        !notification.isRead ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {notification.title}
                    </h3>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{notification.body}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 self-center opacity-50" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

