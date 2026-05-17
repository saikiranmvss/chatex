import { useState } from "react";
import { useListConversations } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Search, MessageSquare, ImageIcon, FileText, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatMessagePreview } from "./format-message-preview";
import { PresenceIndicator } from "./PresenceIndicator";
import { formatPresenceShort } from "@/lib/presence-status";
import { NewConversationDialog } from "./NewConversationDialog";
import { cn } from "@/lib/utils";
import { useChatWebSocket } from "@/contexts/chat-websocket";
import { TypingIndicator } from "./TypingIndicator";

interface ChatSidebarProps {
  onSelectConversation: (id: number) => void;
  selectedId: number | null;
}

function LastMessagePreview({
  type,
  content,
  mediaName,
}: {
  type?: string;
  content?: string;
  mediaName?: string | null;
}) {
  const text = formatMessagePreview({ type, content, mediaName });
  const isMedia = type && type !== "text";

  return (
    <span className="flex items-center gap-1 truncate">
      {type === "image" && <ImageIcon className="w-3 h-3 shrink-0 opacity-60" />}
      {type === "file" && <FileText className="w-3 h-3 shrink-0 opacity-60" />}
      <span className={isMedia ? "italic" : ""}>{text}</span>
    </span>
  );
}

export function ChatSidebar({ onSelectConversation, selectedId }: ChatSidebarProps) {
  const { data: conversations, isLoading } = useListConversations();
  const { getTypingUsers, typingVersion } = useChatWebSocket();
  const [search, setSearch] = useState("");
  void typingVersion;

  const filtered = (conversations || []).filter((c) => {
    const name = c.name || c.otherUser?.displayName || c.otherUser?.username || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full w-full md:w-80 bg-sidebar border-r border-border shrink-0">
      <div className="p-3 md:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground text-sm md:text-base">Messages</h2>
          <NewConversationDialog onConversationCreated={onSelectConversation} />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search conversations..."
            className="pl-9 h-9 bg-background/60 border-muted text-sm cursor-text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-conversations"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-2.5 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1 opacity-60">Start a new one with the + button</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const name =
              conv.name || conv.otherUser?.displayName || conv.otherUser?.username || "Unknown";
            const avatar = conv.avatarUrl || conv.otherUser?.avatarUrl;
            const initial = name.charAt(0).toUpperCase();
            const isSelected = selectedId === conv.id;
            const presenceHint =
              conv.type === "direct" ? formatPresenceShort(conv.otherUser) : null;
            const typing = getTypingUsers(conv.id);

            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                }`}
                data-testid={`button-conversation-${conv.id}`}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatar || undefined} />
                    <AvatarFallback
                      className={cn(
                        "text-sm font-medium",
                        isSelected ? "bg-primary/20" : "bg-muted",
                        conv.type === "group" && "bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20",
                      )}
                    >
                      {conv.type === "group" ? (
                        <Users className="w-4 h-4 text-violet-600" />
                      ) : (
                        initial
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {conv.type === "direct" && (
                    <PresenceIndicator presence={conv.otherUser?.presence} />
                  )}
                  {conv.isPinned && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                  )}
                  {conv.isMuted && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-muted border border-sidebar rounded-full flex items-center justify-center text-[8px]">
                      🔇
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1 mb-0.5">
                    <p className={`text-sm truncate ${conv.unreadCount ? "font-semibold" : "font-medium"}`}>
                      {name}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(conv.updatedAt || conv.createdAt), {
                        addSuffix: false,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={cn(
                        "text-xs truncate flex-1",
                        conv.unreadCount
                          ? "text-sidebar-foreground font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      {typing.length > 0 && !conv.unreadCount ? (
                        <TypingIndicator
                          users={typing}
                          variant="compact"
                          className="text-sidebar-foreground"
                        />
                      ) : (
                        <span className="flex items-center gap-1 truncate">
                          {!conv.unreadCount && presenceHint ? (
                            <span className="text-[10px] opacity-80 shrink-0">{presenceHint} · </span>
                          ) : null}
                          {conv.type === "group" &&
                          conv.lastMessage?.senderName &&
                          conv.unreadCount ? (
                            <span className="shrink-0">{conv.lastMessage.senderName}: </span>
                          ) : null}
                          <LastMessagePreview
                            type={conv.lastMessage?.type}
                            content={conv.lastMessage?.content}
                          />
                        </span>
                      )}
                    </p>
                    {!!conv.unreadCount && (
                      <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
