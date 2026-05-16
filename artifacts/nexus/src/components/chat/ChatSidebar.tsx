import { useState } from "react";
import { useListConversations, useGetDashboardSummary, Conversation } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export function ChatSidebar({ onSelectConversation, selectedId }: { onSelectConversation: (id: number) => void, selectedId: number | null }) {
  const { data: conversations, isLoading } = useListConversations();
  const [search, setSearch] = useState("");

  const filtered = conversations?.filter(c => 
    (c.name?.toLowerCase() || c.otherUser?.displayName?.toLowerCase() || c.otherUser?.username?.toLowerCase() || "")
    .includes(search.toLowerCase())
  ) || [];

  return (
    <div className="w-80 border-r border-border bg-sidebar flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search conversations..." 
            className="pl-9 bg-background/50 border-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">No conversations found</div>
        ) : (
          filtered.map(conv => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-lg transition-colors ${
                selectedId === conv.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
              }`}
            >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={conv.avatarUrl || conv.otherUser?.avatarUrl || undefined} />
                  <AvatarFallback>{conv.name?.charAt(0) || conv.otherUser?.displayName?.charAt(0) || "C"}</AvatarFallback>
                </Avatar>
                {conv.otherUser?.presence === "online" && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-sidebar rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <p className="text-sm font-semibold truncate pr-2">
                    {conv.name || conv.otherUser?.displayName || conv.otherUser?.username}
                  </p>
                  {conv.lastMessage && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(conv.updatedAt || conv.createdAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-muted-foreground truncate pr-2">
                    {conv.lastMessage?.content || "No messages yet"}
                  </p>
                  {conv.unreadCount ? (
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4 text-center">
                      {conv.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
