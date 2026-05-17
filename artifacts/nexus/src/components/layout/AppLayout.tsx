import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { AuthGuard } from "../auth/AuthGuard";
import { ChatWebSocketProvider } from "@/contexts/chat-websocket";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ChatWebSocketProvider>
      <div className="flex h-[100dvh] w-full bg-background overflow-hidden selection:bg-primary/30">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden pb-14 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav />
      </div>
      </ChatWebSocketProvider>
    </AuthGuard>
  );
}
