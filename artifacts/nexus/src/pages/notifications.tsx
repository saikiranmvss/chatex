import { useListNotifications, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, MessageSquare, Hash, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useListNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      }
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "message": return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case "mention": return <UserPlus className="w-5 h-5 text-purple-500" />;
      case "channel_broadcast": return <Hash className="w-5 h-5 text-orange-500" />;
      default: return <Bell className="w-5 h-5 text-primary" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
      <div className="px-8 py-6 border-b border-border flex items-center justify-between shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground text-sm">Stay updated with your activity</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending || !notifications?.some(n => !n.isRead)}
        >
          <CheckCheck className="w-4 h-4 mr-2" />
          Mark all as read
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="w-full h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : notifications?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Bell className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm">You have no new notifications.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications?.map(notification => (
              <div 
                key={notification.id} 
                className={`p-4 rounded-xl border transition-colors flex gap-4 ${
                  notification.isRead 
                    ? "bg-card border-border/50 text-muted-foreground" 
                    : "bg-primary/5 border-primary/20 text-foreground"
                }`}
              >
                <div className="mt-1 shrink-0 p-2 bg-background rounded-full border shadow-sm">
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className={`font-medium ${!notification.isRead ? "text-foreground" : "text-muted-foreground"}`}>
                      {notification.title}
                    </h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2">{notification.body}</p>
                </div>
                {!notification.isRead && (
                  <div className="shrink-0 flex items-center justify-center px-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
