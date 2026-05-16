import { useState, useEffect, useRef } from "react";
import { 
  useListMessages, 
  useSendMessage, 
  useGetConversation,
  Message,
  getListMessagesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Image as ImageIcon, Paperclip, MoreVertical } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function ChatPane({ conversationId }: { conversationId: number }) {
  const { user } = useAuth();
  const { data: conversation } = useGetConversation(conversationId, {
    query: { enabled: !!conversationId }
  });
  const { data: messages, isLoading } = useListMessages(conversationId, {
    query: { 
      enabled: !!conversationId,
      refetchInterval: 3000 // Poll for new messages
    }
  });
  
  const sendMessage = useSendMessage();
  const [content, setContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !conversationId) return;

    sendMessage.mutate({
      data: { content, type: "text" },
      conversationId
    }, {
      onSuccess: () => {
        setContent("");
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
      }
    });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <MoreVertical className="w-8 h-8 opacity-50" />
        </div>
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-card shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={conversation?.avatarUrl || conversation?.otherUser?.avatarUrl || undefined} />
            <AvatarFallback>{conversation?.name?.charAt(0) || conversation?.otherUser?.displayName?.charAt(0) || "C"}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-foreground">
              {conversation?.name || conversation?.otherUser?.displayName || "Loading..."}
            </h2>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <p className="text-xs text-muted-foreground">Live</p>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-5 h-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm">Loading messages...</div>
        ) : messages?.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm mt-10">No messages yet. Say hello!</div>
        ) : (
          messages?.map((msg) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-3 max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  {!isMe && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                      <AvatarFallback>{msg.sender?.displayName?.charAt(0) || "U"}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2 rounded-2xl shadow-sm ${
                      isMe 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-muted text-foreground rounded-tl-none'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-4 bg-background border-t border-border shrink-0">
        <form onSubmit={handleSend} className="flex items-end gap-2 bg-muted/50 p-2 rounded-xl border border-border">
          <div className="flex gap-1 shrink-0 pb-1 pl-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
              <ImageIcon className="w-4 h-4" />
            </Button>
          </div>
          <Input 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-2 min-h-10"
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!content.trim() || sendMessage.isPending}
            className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
