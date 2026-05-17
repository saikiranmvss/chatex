import type { Message } from "@workspace/api-client-react";
import { FileText, Download, Play } from "lucide-react";
import { formatFileSize } from "@/lib/upload-file";

interface MessageContentProps {
  msg: Message;
  isMe: boolean;
}

export function MessageContent({ msg, isMe }: MessageContentProps) {
  if (msg.isDeleted) {
    return <p className="text-sm italic opacity-70">This message was deleted</p>;
  }

  const mediaUrl = msg.mediaUrl ?? undefined;
  const caption =
    msg.content && msg.content !== msg.mediaName && msg.type !== "text"
      ? msg.content
      : null;

  if (msg.type === "image" && mediaUrl) {
    return (
      <div className="space-y-2">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer block rounded-lg overflow-hidden"
        >
          <img
            src={mediaUrl}
            alt={caption ?? msg.mediaName ?? "Image"}
            className="max-w-[min(280px,100%)] max-h-80 w-auto rounded-xl object-cover"
            loading="lazy"
          />
        </a>
        {caption && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{caption}</p>
        )}
      </div>
    );
  }

  if (msg.type === "video" && mediaUrl) {
    return (
      <div className="space-y-2 max-w-full">
        <video
          src={mediaUrl}
          controls
          className="max-w-full max-h-72 rounded-lg cursor-pointer"
          preload="metadata"
        />
        {caption && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{caption}</p>
        )}
      </div>
    );
  }

  if (msg.type === "audio" && mediaUrl) {
    return (
      <div className="space-y-2 min-w-[200px]">
        <audio src={mediaUrl} controls className="w-full max-w-xs cursor-pointer" preload="metadata" />
        {caption && <p className="text-sm">{caption}</p>}
      </div>
    );
  }

  if ((msg.type === "file" || msg.type === "gif") && mediaUrl) {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={msg.mediaName ?? undefined}
        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-opacity hover:opacity-90 ${
          isMe ? "border-primary-foreground/20 bg-primary-foreground/10" : "border-border bg-background/50"
        }`}
      >
        <div
          className={`p-2 rounded-lg shrink-0 ${isMe ? "bg-primary-foreground/15" : "bg-muted"}`}
        >
          {msg.type === "gif" ? (
            <Play className="w-5 h-5" />
          ) : (
            <FileText className="w-5 h-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{msg.mediaName ?? "Download file"}</p>
          {msg.mediaSize != null && (
            <p className={`text-xs mt-0.5 ${isMe ? "opacity-80" : "text-muted-foreground"}`}>
              {formatFileSize(msg.mediaSize)}
            </p>
          )}
        </div>
        <Download className="w-4 h-4 shrink-0 opacity-70" />
      </a>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
  );
}
