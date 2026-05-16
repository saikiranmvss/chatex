import { useState } from "react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatPane } from "@/components/chat/ChatPane";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ChatSidebar 
        selectedId={selectedConversationId} 
        onSelectConversation={setSelectedConversationId} 
      />
      <ChatPane conversationId={selectedConversationId!} />
    </div>
  );
}
