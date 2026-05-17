import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, getGetMeQueryOptions } from "@workspace/api-client-react";

export function useAuth() {
  const [location, setLocation] = useLocation();
  const token = localStorage.getItem("nexus_token");
  
  const { data: user, isLoading, error } = useGetMe({
    query: {
      ...getGetMeQueryOptions(),
      enabled: !!token,
      retry: false,
    },
  });

  useEffect(() => {
    if (!token && location !== "/login") {
      setLocation("/login");
    } else if (error && location !== "/login") {
      localStorage.removeItem("nexus_token");
      setLocation("/login");
    }
  }, [token, error, location, setLocation]);

  return { user, isLoading: isLoading || (!!token && !user && !error), isAuthenticated: !!user };
}
