import { useQuery } from "@tanstack/react-query";
import { getHealth } from "./client";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["backend-health"],
    queryFn: getHealth,
    refetchInterval: 10_000,
    retry: 3,
    retryDelay: 250,
  });
}
