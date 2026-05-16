import { useState } from "react";
import { useListChannels, useSubscribeChannel, useUnsubscribeChannel, getListChannelsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ChannelsPage() {
  const [search, setSearch] = useState("");
  const { data: channels, isLoading } = useListChannels({ q: search });
  const subscribe = useSubscribeChannel();
  const unsubscribe = useUnsubscribeChannel();
  const queryClient = useQueryClient();

  const handleSubscribeToggle = (channelId: number, isSubscribed: boolean) => {
    const mutation = isSubscribed ? unsubscribe : subscribe;
    mutation.mutate({ channelId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
      }
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto w-full h-full overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channels</h1>
          <p className="text-muted-foreground mt-1">Discover and join public broadcast channels.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search channels..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/50 rounded-t-lg border-b border-border" />
              <CardContent className="pt-6 h-20" />
            </Card>
          ))}
        </div>
      ) : channels?.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No channels found matching your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {channels?.map((channel) => (
            <Card key={channel.id} className="flex flex-col overflow-hidden transition-all hover:shadow-md hover:border-primary/50">
              <div className="h-24 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border relative">
                <Avatar className="h-16 w-16 absolute -bottom-8 left-6 border-4 border-card bg-card shadow-sm">
                  <AvatarImage src={channel.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">{channel.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <CardHeader className="pt-10 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="text-xl line-clamp-1">{channel.name}</CardTitle>
                    <div className="flex items-center text-xs text-muted-foreground mt-1">
                      <Users className="w-3 h-3 mr-1" />
                      {channel.subscriberCount} subscribers
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="line-clamp-3 text-sm">
                  {channel.description || "No description provided."}
                </CardDescription>
              </CardContent>
              <CardFooter className="pt-4 pb-6 bg-muted/20 border-t border-border mt-auto">
                <Button 
                  variant={channel.isSubscribed ? "outline" : "default"} 
                  className="w-full"
                  onClick={() => handleSubscribeToggle(channel.id, !!channel.isSubscribed)}
                  disabled={subscribe.isPending || unsubscribe.isPending}
                >
                  {channel.isSubscribed ? "Unsubscribe" : "Subscribe"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
