import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Item, buildUrl, errorSchemas } from "@shared/routes";
import { idempotentFetch } from "@/lib/queryClient";
import { z } from "zod";

async function apiErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: unknown } | null;
  return typeof body?.message === "string" && body.message.trim() ? body.message : fallback;
}

export function useItems() {
  return useQuery({
    queryKey: [api.items.list.path],
    queryFn: async () => {
      const res = await fetch(api.items.list.path, { credentials: "include" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Não foi possível carregar o War’I."));
      return api.items.list.responses[200].parse(await res.json());
    },
  });
}

export function usePurchaseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { type: string, name: string }) => {
      const validated = api.items.purchase.input.parse(data);
      const res = await idempotentFetch(api.items.purchase.path, {
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
        throw new Error(await apiErrorMessage(res, "Não foi possível concluir a compra."));
      }
      return api.items.purchase.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}

export function useSetItemEquipped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isEquipped }: { id: number; isEquipped: boolean }) => {
      const validated = api.items.equip.input.parse({ isEquipped });
      const res = await fetch(buildUrl(api.items.equip.path, { id }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error("Item não encontrado no seu War’I");
        throw new Error(await apiErrorMessage(res, "Não foi possível atualizar a PackBack."));
      }
      return api.items.equip.responses[200].parse(await res.json());
    },
    onSuccess: (updatedItem) => {
      queryClient.setQueryData<Item[]>([api.items.list.path], (current) =>
        current?.map((item) => item.id === updatedItem.id ? updatedItem : item),
      );
    },
  });
}

export function useUseItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.items.use.path, { id });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Não foi possível usar este item."));
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
      const res = await idempotentFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKrc }),
        credentials: "include"
      });
      if (!res.ok) {
        if (res.status === 402) throw new Error(await apiErrorMessage(res, "Saldo insuficiente para o reparo."));
        throw new Error(await apiErrorMessage(res, "Não foi possível reparar o item."));
      }
      return api.items.repair.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.items.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}
