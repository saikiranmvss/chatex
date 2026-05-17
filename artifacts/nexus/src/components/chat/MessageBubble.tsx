import { useRef } from "react";
import type { Message } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Star,
  Reply,
  Copy,
  Pencil,
  Trash2,
  MoreHorizontal,
  Check,
  CheckCheck,
} from "lucide-react";
import { MessageContent } from "./MessageContent";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export interface MessageBubbleProps {
  msg: Message;
  prevMsg: Message | null;
  isMe: boolean;
  showSenderName?: boolean;
  onReact: (messageId: number, emoji: string) => void;
  onStar: (messageId: number) => void;
  onReply: (msg: Message) => void;
  onCopy: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (messageId: number) => void;
}

export function MessageBubble({
  msg,
  prevMsg,
  isMe,
  showSenderName = true,
  onReact,
  onStar,
  onReply,
  onCopy,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const lastTapRef = useRef(0);
  const showAvatar = !isMe && prevMsg?.senderId !== msg.senderId;
  const isGrouped = prevMsg?.senderId === msg.senderId;

  const handleBubbleClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      onReact(msg.id, "❤️");
    }
    lastTapRef.current = now;
  };

  return (
    <div
      className={cn(
        "flex",
        isMe ? "justify-end" : "justify-start",
        isGrouped ? "mt-0.5" : "mt-3",
      )}
    >
      <div
        className={cn(
          "flex gap-2 md:gap-3 max-w-[88%] md:max-w-[75%]",
          isMe ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div className="w-7 md:w-8 shrink-0">
          {!isMe && showAvatar && (
            <Avatar className="h-7 w-7 md:h-8 md:w-8">
              <AvatarImage src={msg.sender?.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">
                {msg.sender?.displayName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        <div
          className={cn(
            "group/message relative flex flex-col min-w-[4rem]",
            isMe ? "items-end" : "items-start",
          )}
        >
          {!isMe && showAvatar && showSenderName && (
            <span className="text-[11px] text-muted-foreground mb-1 mx-1 font-medium">
              {msg.sender?.displayName}
            </span>
          )}

          {!msg.isDeleted && (
            <div
              className={cn(
                "absolute left-0 right-0 -top-10 h-10 z-20",
                "flex items-end pb-0.5",
                "opacity-0 pointer-events-none",
                "group-hover/message:opacity-100 group-hover/message:pointer-events-auto",
                "transition-opacity duration-150",
                isMe ? "justify-end" : "justify-start",
              )}
            >
              <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur-sm border border-border rounded-full shadow-md px-1 py-0.5">
                {QUICK_EMOJIS.slice(0, 5).map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="text-base hover:scale-125 transition-transform cursor-pointer p-1 rounded-full hover:bg-muted"
                    onClick={() => onReact(msg.id, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  className="p-1.5 rounded-full hover:bg-muted cursor-pointer"
                  title="Reply"
                  onClick={() => onReply(msg)}
                >
                  <Reply className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-full hover:bg-muted cursor-pointer"
                  title={msg.isStarred ? "Unstar" : "Star"}
                  onClick={() => onStar(msg.id)}
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      msg.isStarred ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground",
                    )}
                  />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-full hover:bg-muted cursor-pointer"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isMe ? "end" : "start"} className="w-40">
                    <DropdownMenuItem className="cursor-pointer" onClick={() => onReply(msg)}>
                      <Reply className="w-4 h-4 mr-2" /> Reply
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => onCopy(msg)}>
                      <Copy className="w-4 h-4 mr-2" /> Copy
                    </DropdownMenuItem>
                    {isMe && msg.type === "text" && (
                      <DropdownMenuItem className="cursor-pointer" onClick={() => onEdit(msg)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                    )}
                    {isMe && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-destructive focus:text-destructive"
                          onClick={() => onDelete(msg.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          <button
            type="button"
            className={cn(
              "text-left rounded-2xl shadow-sm max-w-full select-text",
              "px-3 md:px-4 py-2 md:py-2.5",
              isMe
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted text-foreground rounded-tl-sm",
              isGrouped && (isMe ? "rounded-tr-2xl" : "rounded-tl-2xl"),
              !msg.isDeleted && "cursor-pointer",
            )}
            onClick={!msg.isDeleted ? handleBubbleClick : undefined}
            title={!msg.isDeleted ? "Double-click to ❤️" : undefined}
          >
            {msg.replyTo && (
              <div
                className={cn(
                  "mb-2 pl-2 border-l-2 text-xs rounded-sm py-1 pr-1",
                  isMe
                    ? "border-primary-foreground/40 bg-primary-foreground/10"
                    : "border-primary/50 bg-background/40",
                )}
              >
                <p className="font-semibold opacity-90">{msg.replyTo.senderName}</p>
                <p className="opacity-80 truncate max-w-[200px]">{msg.replyTo.content}</p>
              </div>
            )}
            <MessageContent msg={msg} isMe={isMe} />
          </button>

          {Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {(msg.reactions as { emoji: string; count: number }[]).map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className="text-xs bg-background/80 border border-border px-2 py-0.5 rounded-full cursor-pointer hover:bg-muted transition-colors shadow-sm"
                  onClick={() => onReact(msg.id, r.emoji)}
                >
                  {r.emoji} {r.count > 1 ? r.count : ""}
                </button>
              ))}
            </div>
          )}

          <div className={cn("flex items-center gap-1 mt-0.5 mx-1", isMe && "flex-row-reverse")}>
            <span className="text-[10px] text-muted-foreground">
              {new Date(msg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {msg.isEdited && <span className="text-[10px] text-muted-foreground">edited</span>}
            {isMe && !msg.isDeleted && (
              <span className="text-muted-foreground">
                {msg.status === "seen" ? (
                  <CheckCheck className="w-3 h-3 text-sky-500" />
                ) : msg.status === "delivered" ? (
                  <CheckCheck className="w-3 h-3" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




