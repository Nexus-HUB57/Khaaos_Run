import React from "react";
import { Clock } from "lucide-react";
import { format } from "date-fns";
import type { Transaction } from "../../../shared/routes";

type RecentTransactionsProps = {
  transactions?: Transaction[];
  isLoading: boolean;
};

export function RecentTransactions({ transactions, isLoading }: RecentTransactionsProps) {
  return (
    <div className="space-y-0 divide-y divide-border/30">
      {isLoading ? (
        <p className="py-4 text-xs font-mono text-muted-foreground tracking-widest" role="status">
          CARREGANDO HISTÓRICO...
        </p>
      ) : transactions && transactions.length > 0 ? (
        transactions.slice(0, 4).map((transaction) => {
          const timestamp = transaction.timestamp ? new Date(transaction.timestamp) : null;
          const hasValidTimestamp = timestamp && !Number.isNaN(timestamp.getTime());

          return (
            <div key={transaction.id} className="py-3 flex items-start gap-3">
              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shadow-[0_0_4px_hsla(25,95%,55%,0.6)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-foreground truncate">
                  {transaction.description || transaction.type}
                </p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono mt-0.5 tracking-widest">
                  {hasValidTimestamp && <>
                    <Clock className="w-3 h-3" />
                    {format(timestamp, "dd/MM/yyyy HH:mm")} —
                  </>}
                  {transaction.type}
                  <span className="ml-auto shrink-0 text-accent">{transaction.amountKrc} KRC</span>
                </p>
              </div>
            </div>
          );
        })
      ) : (
        <p className="py-4 text-xs font-mono text-muted-foreground tracking-widest">
          NENHUMA TRANSAÇÃO REGISTRADA
        </p>
      )}
    </div>
  );
}
