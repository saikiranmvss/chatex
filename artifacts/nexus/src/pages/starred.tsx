import { useListStarredMessages, getListStarredMessagesQueryKey, useStarMessage } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Star, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export default function StarredPage() {
  const { data: messages, isLoading } = useListStarredMessages();
  const starMessage = useStarMessage();
  const queryClient = useQueryClient();

  const handleUnstar = (messageId: number) => {
    starMessage.mutate({ messageId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStarredMessagesQueryKey() });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto w-full h-full flex flex-col">
      <div className="px-8 py-6 border-b border-border flex items-center justify-between shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Starred Messages</h1>
          <p className="text-muted-foreground text-sm">Your saved and important messages</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="w-full h-24 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Star className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">No starred messages</p>
            <p className="text-sm">Star important messages to find them easily later.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {messages?.map(msg => (
              <div key={msg.id} className="p-4 rounded-xl border bg-card shadow-sm flex gap-4">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                  <AvatarFallback>{msg.sender?.displayName?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{msg.sender?.displayName || msg.sender?.username}</h3>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleUnstar(msg.id)} disabled={starMessage.isPending} className="text-yellow-500 hover:text-yellow-600 hover:bg-yellow-500/10 h-8 w-8">
                      <Star className="w-4 h-4 fill-current" />
                    </Button>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
