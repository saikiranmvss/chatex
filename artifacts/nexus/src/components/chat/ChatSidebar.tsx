import { useState } from "react";
import { useListConversations } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCreateConversation, useSearchUsers } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ChatSidebarProps {
  onSelectConversation: (id: number) => void;
  selectedId: number | null;
}

export function ChatSidebar({ onSelectConversation, selectedId }: ChatSidebarProps) {
  const { data: conversations, isLoading } = useListConversations();
  const [search, setSearch] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const queryClient = useQueryClient();
  const createConversation = useCreateConversation();

  const { data: searchResults } = useSearchUsers(
    { q: userSearch, limit: 10 },
    { query: { enabled: userSearch.length > 1 } }
  );

  const filtered = (conversations || []).filter(c => {
    const name = c.name || c.otherUser?.displayName || c.otherUser?.username || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleStartChat = (userId: number) => {
    createConversation.mutate(
      { data: { type: "direct", targetUserId: userId } },
      {
        onSuccess: (conv) => {
          setNewChatOpen(false);
          setUserSearch("");
          queryClient.invalidateQueries({ queryKey: ["listConversations"] });
          onSelectConversation(conv.id);
        }
      }
    );
  };

  return (
    <div className="flex flex-col h-full w-full md:w-80 bg-sidebar border-r border-border shrink-0">
      {/* Header */}
      <div className="p-3 md:p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground text-sm md:text-base">Messages</h2>
          <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-new-chat">
                <Plus className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Conversation</DialogTitle>
              </DialogHeader>
              <div className="mt-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search people..."
                    className="pl-9"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    data-testid="input-user-search"
                    autoFocus
                  />
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                  {userSearch.length < 2 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Type to search people</p>
                  ) : searchResults?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
                  ) : (
                    searchResults?.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleStartChat(u.id)}
                        className="w-full text-left flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent transition-colors"
                        data-testid={`button-start-chat-${u.id}`}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={u.avatarUrl || undefined} />
                          <AvatarFallback>{u.displayName?.charAt(0) || u.username.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{u.displayName || u.username}</p>
                          <p className="text-xs text-muted-foreground">@{u.username}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-9 h-9 bg-background/60 border-muted text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-conversations"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isLoading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map(i => (
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
            <p className="text-xs mt-1 opacity-60">Start a new one above</p>
          </div>
        ) : (
          filtered.map(conv => {
            const name = conv.name || conv.otherUser?.displayName || conv.otherUser?.username || "Unknown";
            const avatar = conv.avatarUrl || conv.otherUser?.avatarUrl;
            const initial = name.charAt(0).toUpperCase();
            const isOnline = conv.otherUser?.presence === "online";
            const isSelected = selectedId === conv.id;

            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                }`}
                data-testid={`button-conversation-${conv.id}`}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatar || undefined} />
                    <AvatarFallback className={`text-sm font-medium ${isSelected ? "bg-primary/20" : "bg-muted"}`}>
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-sidebar rounded-full" />
                  )}
                  {conv.isPinned && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary/80 rounded-full flex items-center justify-center">
                      <div className="w-1 h-1 bg-white rounded-full" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1 mb-0.5">
                    <p className={`text-sm truncate ${conv.unreadCount ? "font-semibold" : "font-medium"}`}>
                      {name}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(conv.updatedAt || conv.createdAt), { addSuffix: false })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.lastMessage?.content || "No messages yet"}
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
