import { useState } from "react";
import {
  useCreateConversation,
  useSearchUsers,
  getListConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Search, Users, User, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewConversationDialogProps {
  onConversationCreated: (id: number) => void;
}

type Mode = "direct" | "group";

export function NewConversationDialog({ onConversationCreated }: NewConversationDialogProps) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const createConversation = useCreateConversation();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("direct");
  const [userSearch, setUserSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: searchResults } = useSearchUsers(
    { q: userSearch, limit: 12 },
    { query: { enabled: userSearch.length > 1 } },
  );

  const reset = () => {
    setUserSearch("");
    setGroupName("");
    setSelectedIds([]);
    setMode("direct");
  };

  const toggleMember = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleDirect = (userId: number) => {
    createConversation.mutate(
      { data: { type: "direct", targetUserId: userId } },
      {
        onSuccess: (conv) => {
          setOpen(false);
          reset();
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          onConversationCreated(conv.id);
        },
      },
    );
  };

  const handleCreateGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    if (selectedIds.length < 1) return;

    createConversation.mutate(
      {
        data: {
          type: "group",
          name,
          memberIds: selectedIds,
        },
      },
      {
        onSuccess: (conv) => {
          setOpen(false);
          reset();
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          onConversationCreated(conv.id);
        },
      },
    );
  };

  const canCreateGroup = groupName.trim().length > 0 && selectedIds.length >= 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer hover:bg-sidebar-accent"
          data-testid="button-new-chat"
          title="New conversation"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>

        <div className="flex border-b border-border mx-5 rounded-lg bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setMode("direct")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
              mode === "direct"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <User className="w-4 h-4" />
            Direct
          </button>
          <button
            type="button"
            onClick={() => setMode("group")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer",
              mode === "group"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="w-4 h-4" />
            Group
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {mode === "group" && (
            <Input
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="cursor-text"
              autoFocus
            />
          )}

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={mode === "group" ? "Search people to add…" : "Search people…"}
              className="pl-9 cursor-text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              data-testid="input-user-search"
            />
          </div>

          {mode === "group" && selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map((id) => {
                const u = searchResults?.find((r) => r.id === id);
                const label = u?.displayName || u?.username || `User ${id}`;
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-full"
                  >
                    {label}
                    <button
                      type="button"
                      className="cursor-pointer hover:opacity-70"
                      onClick={() => toggleMember(id)}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="max-h-56 overflow-y-auto space-y-0.5 -mx-1">
            {userSearch.length < 2 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                {mode === "group"
                  ? "Add at least one person and name your group"
                  : "Type a name to find someone"}
              </p>
            ) : searchResults?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
            ) : (
              searchResults
                ?.filter((u) => u.id !== me?.id)
                .map((u) => {
                  const selected = selectedIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={createConversation.isPending}
                      onClick={() => {
                        if (mode === "direct") {
                          handleDirect(u.id);
                        } else {
                          toggleMember(u.id);
                        }
                      }}
                      className={cn(
                        "w-full text-left flex items-center gap-3 p-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50",
                        selected ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-accent",
                      )}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={u.avatarUrl || undefined} />
                        <AvatarFallback>
                          {u.displayName?.charAt(0) || u.username.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.displayName || u.username}
                        </p>
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      </div>
                      {mode === "group" && selected && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
            )}
          </div>

          {mode === "group" && (
            <Button
              className="w-full cursor-pointer"
              disabled={!canCreateGroup || createConversation.isPending}
              onClick={handleCreateGroup}
            >
              <Users className="w-4 h-4 mr-2" />
              Create group ({selectedIds.length + 1} members)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
