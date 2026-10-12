import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type BankAccount, type Transaction, type DepositRequest, type TransferRequest, errorSchemas } from "@shared/routes";
import { z } from "zod";

export function useBank() {
  return useQuery({
    queryKey: [api.bank.get.path],
    queryFn: async () => {
      const res = await fetch(api.bank.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bank account");
      return api.bank.get.responses[200].parse(await res.json());
    },
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: [api.bank.transactions.path],
    queryFn: async () => {
      const res = await fetch(api.bank.transactions.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return api.bank.transactions.responses[200].parse(await res.json());
    },
  });
}

export function useDeposit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: DepositRequest) => {
      const validated = api.bank.deposit.input.parse(data);
      const res = await fetch(api.bank.deposit.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 400) {
          const error = errorSchemas.validation.parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Deposit failed");
      }
      return api.bank.deposit.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.transactions.path] });
    },
  });
}

export function useTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: TransferRequest) => {
      const validated = api.bank.transfer.input.parse(data);
      const res = await fetch(api.bank.transfer.path, {
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
        throw new Error("Transfer failed");
      }
      return api.bank.transfer.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.bank.get.path] });
      queryClient.invalidateQueries({ queryKey: [api.bank.transactions.path] });
    },
  });
}
