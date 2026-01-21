import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlayerStats } from "@shared/routes";

export function usePlayer() {
  return useQuery({
    queryKey: [api.player.me.path],
    queryFn: async () => {
      const res = await fetch(api.player.me.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null; // Handle not found gracefully (e.g., new user)
        throw new Error("Failed to fetch player stats");
      }
      return api.player.me.responses[200].parse(await res.json());
    },
    retry: false, // Don't retry on 401/404
  });
}

export function useClaimDailySalary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.player.daily.path, { 
        method: "POST",
        credentials: "include" 
      });
      if (!res.ok) {
        if (res.status === 400) throw new Error("Salary already claimed today");
        throw new Error("Failed to claim salary");
      }
      return api.player.daily.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.player.me.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}
