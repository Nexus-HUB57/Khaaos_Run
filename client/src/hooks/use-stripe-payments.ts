import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { idempotentFetch } from "@/lib/queryClient";

const catalogPath = api.payments.stripeCatalog.path;

export type PaymentOrder = {
  id: string;
  productId: string;
  productName: string;
  priceBrlMinor: string;
  krcMinorUnits: string;
  currency: "BRL";
  status: "created" | "pending" | "fulfilled" | "failed" | "expired" | "rejected";
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { message?: unknown };
    return new Error(typeof body.message === "string" ? body.message : "Não foi possível concluir a operação.");
  } catch {
    return new Error("Não foi possível concluir a operação.");
  }
}

export function useStripeKrcCatalog() {
  return useQuery({
    queryKey: [catalogPath],
    queryFn: async () => {
      const response = await fetch(catalogPath, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw await responseError(response);
      return api.payments.stripeCatalog.responses[200].parse(await response.json());
    },
    staleTime: 30_000,
  });
}

export function useCreateStripeCheckout() {
  return useMutation({
    mutationFn: async (productId: string) => {
      const input = api.payments.stripeCheckout.input.parse({ productId });
      const response = await idempotentFetch(api.payments.stripeCheckout.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!response.ok) throw await responseError(response);
      return api.payments.stripeCheckout.responses[200].parse(await response.json());
    },
  });
}

export function useStripePaymentOrder(orderId: string | null, enabled = true) {
  const queryClient = useQueryClient();
  const path = orderId ? api.payments.stripeOrder.path.replace(":id", encodeURIComponent(orderId)) : "";
  const query = useQuery({
    queryKey: [api.payments.stripeOrder.path, orderId],
    enabled: enabled && Boolean(orderId),
    queryFn: async () => {
      const response = await fetch(path, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw await responseError(response);
      return api.payments.stripeOrder.responses[200].parse(await response.json()) as PaymentOrder;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const order = query.state.data as PaymentOrder | undefined;
      const pollingWindowOpen = order ? Date.now() - Date.parse(order.createdAt) < 120_000 : false;
      return order?.status === "pending" && pollingWindowOpen ? 4_000 : false;
    },
    refetchIntervalInBackground: false,
    retry: false,
  });
  useEffect(() => {
    if (query.data?.status !== "fulfilled") return;
    void queryClient.invalidateQueries({ queryKey: ["/api/bank"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/bank/transactions"] });
  }, [query.data?.status, queryClient]);
  return query;
}
