import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Item, buildUrl, errorSchemas } from "@shared/routes";
import { z } from "zod";

export function useItems() {
  return useQuery({
    queryKey: [api.items.list.path],
    queryFn: async () => {
      const res = await fetch(api.items.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return api.items.list.responses[200].parse(await res.json());
    },
  });
}

export function usePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: string, name: string }) => {
      const validated = api.items.purchase.input.parse(data);
      const res = await fetch(api.items.purchase.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 402) {
          const error = errorSchemas.insufficientFunds.parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Purchase failed");
      }
      return api.items.purchase.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}

export function useUseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.items.use.path, { id });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to use item");
      return api.items.use.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.player.me.path] }); // Stats might change
    },
  });
}

export function useRepairItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amountKrc }: { id: number, amountKrc: number }) => {
      const url = buildUrl(api.items.repair.path, { id });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKrc }),
        credentials: "include"
      });
      if (!res.ok) {
        if (res.status === 402) throw new Error("Insufficient funds for repair");
        throw new Error("Repair failed");
      }
      return api.items.repair.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}
