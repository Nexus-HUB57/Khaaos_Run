import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Loan, type LoanRequest, buildUrl, errorSchemas } from "@shared/routes";

export function useLoans() {
  return useQuery({
    queryKey: [api.loans.list.path],
    queryFn: async () => {
      const res = await fetch(api.loans.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch loans");
      return api.loans.list.responses[200].parse(await res.json());
    },
  });
}

export function useRequestLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: LoanRequest) => {
      const validated = api.loans.request.input.parse(data);
      const res = await fetch(api.loans.request.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error("Loan limit reached");
        if (res.status === 400) throw new Error("Invalid loan request");
        throw new Error("Request failed");
      }
      return api.loans.request.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.loans.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] }); // Balance updates
    },
  });
}

export function usePayLoan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.loans.pay.path, { id });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) {
        if (res.status === 402) {
           const error = errorSchemas.insufficientFunds.parse(await res.json());
           throw new Error(error.message);
        }
        throw new Error("Payment failed");
      }
      return api.loans.pay.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.loans.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
    },
  });
}
