import { useState } from "react";
import { useBank, useTransactions, useDeposit, useTransfer } from "@/hooks/use-bank";
import { useLoans, useRequestLoan, usePayLoan } from "@/hooks/use-loans";
import { CyberCard } from "@/components/cyber-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowRightLeft, Upload, Wallet, Award, Coins, AlertTriangle, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { KRC_TO_USD } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function Bank() {
  const { data: bank } = useBank();
  const { data: transactions } = useTransactions();
  const { data: loans } = useLoans();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">BANKHAAOS</h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest mt-1">
            GESTÃO FINANCEIRA // ID: {bank?.userId}
          </p>
        </div>
        <DepositDialog />
      </div>

      {/* Account Balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BalanceCard
          title="WEAPONS ACCOUNT"
          subtitle="Depósitos diretos do player"
          balance={bank?.weaponsBalance}
          icon={Wallet}
          iconColor="text-primary"
          glowColor="hsla(25,95%,55%,0.15)"
        />
        <BalanceCard
          title="BÔNUS ACCOUNT"
          subtitle="CashBack 100% sobre depósitos"
          balance={bank?.bonusBalance}
          icon={Award}
          iconColor="text-accent"
          glowColor="hsla(45,90%,55%,0.15)"
          variant="gold"
        />
        <BalanceCard
          title="FBM — FUNDO BÉLICO"
          subtitle="Fundo de Investimento KR"
          balance={bank?.fbmBalance}
          icon={Coins}
          iconColor="text-purple-400"
          glowColor="hsla(270,60%,55%,0.12)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Panel */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="transfer" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-black/40 border border-border/40 p-1 h-auto rounded-none">
              <TabsTrigger value="transfer" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-display tracking-widest py-2 text-xs rounded-none">TRANSFERIR</TabsTrigger>
              <TabsTrigger value="loans" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-display tracking-widest py-2 text-xs rounded-none">EMPRÉSTIMOS</TabsTrigger>
            </TabsList>

            <TabsContent value="transfer" className="mt-4">
              <TransferPanel />
            </TabsContent>

            <TabsContent value="loans" className="mt-4">
              <LoansPanel loans={loans || []} />
            </TabsContent>
          </Tabs>

          <CyberCard title="HISTÓRICO DE TRANSAÇÕES" subtitle="ÚLTIMAS 50 OPERAÇÕES">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] text-muted-foreground uppercase bg-black/30 font-mono tracking-widest">
                  <tr>
                    <th className="px-4 py-3">TIPO</th>
                    <th className="px-4 py-3">VALOR</th>
                    <th className="px-4 py-3">DATA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {transactions?.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground font-mono text-xs tracking-widest">NENHUMA OPERAÇÃO REGISTRADA</td>
                    </tr>
                  ) : (
                    transactions?.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-primary tracking-widest">{tx.type}</td>
                        <td className="px-4 py-3 font-display font-bold text-foreground">{tx.amountKrc} <span className="text-xs text-muted-foreground font-mono">KRC</span></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono tracking-widest">
                          {tx.timestamp && format(new Date(tx.timestamp), 'dd/MM/yyyy HH:mm')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CyberCard>
        </div>

        {/* Info Panel */}
        <div className="lg:col-span-1 space-y-5">
          <CyberCard title="PARIDADE KRC" subtitle="WALLET KRC — MERCADO LIVE" variant="gold">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 border border-accent/20 bg-black/20">
                <span className="text-sm font-mono text-muted-foreground tracking-widest">1 USD</span>
                <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                <span className="text-2xl font-display font-bold text-accent text-glow-gold">{KRC_TO_USD} KRC</span>
              </div>
              <div className="text-[11px] text-muted-foreground p-3 border border-dashed border-border/30 font-mono leading-relaxed tracking-wide space-y-2">
                <p className="font-bold text-foreground">AVISO OPERACIONAL:</p>
                <p>Depósitos na Weapons Account geram Bônus Account em CashBack de 100%.</p>
                <p>Saldos do FBM são protegidos das pilhagens em batalha.</p>
              </div>
            </div>
          </CyberCard>

          <CyberCard title="RESUMO CONTA KR" subtitle="ACCOUNT KR STATUS">
            <div className="space-y-3">
              {[
                { label: "Weapons", sublabel: "Depósitos diretos", icon: Wallet, color: "text-primary" },
                { label: "Bônus", sublabel: "CashBack automático", icon: Award, color: "text-accent" },
                { label: "FBM", sublabel: "Fundo Bélico", icon: TrendingUp, color: "text-purple-400" },
              ].map(a => (
                <div key={a.label} className="flex items-center gap-3 p-2.5 border border-border/30 bg-black/20">
                  <a.icon className={cn("w-4 h-4 shrink-0", a.color)} />
                  <div>
                    <p className="text-xs font-display font-bold text-foreground tracking-widest">{a.label}</p>
                    <p className="text-[10px] font-mono text-muted-foreground tracking-widest">{a.sublabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </CyberCard>
        </div>
      </div>
    </div>
  );
}

function BalanceCard({ title, subtitle, balance, icon: Icon, iconColor, glowColor, variant = "default" }: any) {
  return (
    <CyberCard variant={variant} className="relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-5 -translate-y-4 translate-x-4">
        <Icon className="w-full h-full" />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={cn("w-5 h-5", iconColor)} />
          <h3 className="font-display font-bold tracking-widest text-sm text-foreground">{title}</h3>
        </div>
        <div className="text-3xl font-display font-bold text-foreground mb-1"
          style={{ textShadow: `0 0 15px ${glowColor}` }}
        >
          {balance || "0"} <span className="text-sm text-muted-foreground font-mono font-normal">KRC</span>
        </div>
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{subtitle}</p>
      </div>
    </CyberCard>
  );
}

function DepositDialog() {
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useDeposit();
  const { toast } = useToast();

  const handleDeposit = () => {
    mutate({ amountUsd: parseFloat(amount) }, {
      onSuccess: () => {
        toast({ title: "DEPÓSITO CONFIRMADO", description: "Fundos adicionados à sua conta.", className: "border-primary text-primary" });
        setOpen(false);
        setAmount("");
      },
      onError: (err) => toast({ title: "ERRO", description: err.message, variant: "destructive" })
    });
  };

  const krcAmount = (parseFloat(amount || "0") * KRC_TO_USD).toFixed(2);
  const bonusAmount = parseFloat(krcAmount).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="font-display tracking-widest font-bold transition-all border-0 hover:scale-105"
          style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
          data-testid="button-open-deposit"
        >
          <Upload className="w-4 h-4 mr-2" />
          DEPOSITAR USD
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-primary/20 text-foreground max-w-sm">
        <div className="absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2 border-primary/40" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-primary/40" />
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest text-primary">DEPOSITAR FUNDOS</DialogTitle>
          <DialogDescription className="font-mono text-xs tracking-widest">Converta USD em KRC à paridade atual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs tracking-widest text-muted-foreground">VALOR (USD)</Label>
            <Input
              type="number"
              placeholder="0.00"
              className="bg-black/50 border-border/40 font-mono text-lg rounded-none"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-deposit-amount"
            />
          </div>
          <div className="p-4 border border-primary/20 bg-primary/5 space-y-2">
            <div className="flex justify-between text-xs font-mono text-muted-foreground tracking-widest">
              <span>WEAPONS ACCOUNT</span>
              <span className="text-primary font-bold">{krcAmount} KRC</span>
            </div>
            <div className="flex justify-between text-xs font-mono text-muted-foreground tracking-widest">
              <span>BÔNUS ACCOUNT (100%)</span>
              <span className="text-accent font-bold">+{bonusAmount} KRC</span>
            </div>
            <div className="h-px bg-border/40 my-1" />
            <div className="flex justify-between text-sm font-mono tracking-widest">
              <span className="text-muted-foreground">TOTAL CREDITADO</span>
              <span className="text-foreground font-bold font-display">{(parseFloat(krcAmount) * 2).toFixed(2)} KRC</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="font-display tracking-widest text-xs">CANCELAR</Button>
          <Button
            onClick={handleDeposit}
            disabled={isPending || !amount}
            className="font-display tracking-widest text-xs font-bold border-0"
            style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
            data-testid="button-confirm-deposit"
          >
            {isPending ? "PROCESSANDO..." : "CONFIRMAR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferPanel() {
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState<"fbm" | "weapons">("weapons");
  const { mutate, isPending } = useTransfer();
  const { toast } = useToast();

  const handleTransfer = () => {
    mutate({ amountKrc: parseFloat(amount), destination }, {
      onSuccess: () => {
        toast({ title: "TRANSFERÊNCIA EXECUTADA", description: "Fundos movidos com sucesso.", className: "border-primary text-primary" });
        setAmount("");
      },
      onError: (err) => toast({ title: "TRANSFERÊNCIA NEGADA", description: err.message, variant: "destructive" })
    });
  };

  return (
    <CyberCard>
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs tracking-widest text-muted-foreground">VALOR (KRC)</Label>
            <Input
              type="number"
              placeholder="0"
              className="bg-black/50 border-border/40 font-mono rounded-none"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-transfer-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs tracking-widest text-muted-foreground">DESTINO</Label>
            <Select value={destination} onValueChange={(v: any) => setDestination(v)}>
              <SelectTrigger className="bg-black/50 border-border/40 rounded-none" data-testid="select-transfer-destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border rounded-none">
                <SelectItem value="weapons">WEAPONS ACC</SelectItem>
                <SelectItem value="fbm">FBM — FUNDO BÉLICO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleTransfer}
          disabled={isPending || !amount}
          className="w-full font-display tracking-widest font-bold text-xs border-0"
          style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
          data-testid="button-execute-transfer"
        >
          {isPending ? "EXECUTANDO..." : "EXECUTAR TRANSFERÊNCIA"}
        </Button>
      </div>
    </CyberCard>
  );
}

function LoansPanel({ loans }: { loans: any[] }) {
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const { mutate: requestLoan, isPending: isRequesting } = useRequestLoan();
  const { mutate: payLoan, isPending: isPaying } = usePayLoan();
  const { toast } = useToast();

  const handleRequest = () => {
    requestLoan({ amountKrc: parseFloat(amount), days: parseInt(days) }, {
      onSuccess: () => {
        toast({ title: "EMPRÉSTIMO APROVADO", description: "Fundos liberados na sua conta.", className: "border-primary text-primary" });
        setAmount("");
      },
      onError: (err) => toast({ title: "SOLICITAÇÃO NEGADA", description: err.message, variant: "destructive" })
    });
  };

  const handlePay = (id: number) => {
    payLoan(id, {
      onSuccess: () => toast({ title: "PAGAMENTO EFETUADO", description: "Empréstimo quitado.", className: "border-primary text-primary" }),
      onError: (err) => toast({ title: "PAGAMENTO NEGADO", description: err.message, variant: "destructive" })
    });
  };

  const interest = amount ? (parseFloat(amount) * 0.05 * parseInt(days)).toFixed(2) : "0.00";

  return (
    <div className="space-y-5">
      <CyberCard title="SOLICITAR CAPITAL" subtitle="APROVAÇÃO INSTANTÂNEA // JUROS 5% A.D.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs tracking-widest text-muted-foreground">PRINCIPAL (KRC)</Label>
            <Input
              type="number"
              placeholder="Mín. 100"
              className="bg-black/50 border-border/40 font-mono rounded-none"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="input-loan-amount"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs tracking-widest text-muted-foreground">PRAZO (DIAS)</Label>
            <Input
              type="number"
              value={days}
              min={1} max={30}
              className="bg-black/50 border-border/40 font-mono rounded-none"
              onChange={(e) => setDays(e.target.value)}
              data-testid="input-loan-days"
            />
          </div>
          <Button
            onClick={handleRequest}
            disabled={isRequesting || !amount}
            className="font-display tracking-widest font-bold text-xs border-0"
            style={{ background: "linear-gradient(135deg, hsl(25 95% 55%), hsl(15 90% 45%))", color: "hsl(260 25% 5%)" }}
            data-testid="button-request-loan"
          >
            {isRequesting ? "CALCULANDO..." : "SOLICITAR"}
          </Button>
        </div>
        {amount && (
          <div className="mt-4 p-3 border border-amber-500/20 bg-amber-500/5 text-xs font-mono tracking-widest text-muted-foreground">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline mr-2" />
            JUROS ESTIMADOS: <span className="text-amber-400 font-bold">{interest} KRC</span> para {days} dia(s)
          </div>
        )}
      </CyberCard>

      <div className="space-y-3">
        <h3 className="font-display font-bold text-primary tracking-widest text-sm text-glow-primary">EMPRÉSTIMOS ATIVOS</h3>
        {loans.length === 0 ? (
          <div className="p-10 border border-dashed border-border/40 text-center text-muted-foreground font-mono text-xs tracking-widest">
            NENHUM EMPRÉSTIMO ATIVO
          </div>
        ) : (
          <div className="grid gap-3">
            {loans.map(loan => (
              <div key={loan.id} className="p-4 bg-black/40 border border-border/40 flex justify-between items-center">
                <div>
                  <p className="font-bold text-foreground font-display text-sm tracking-wider">{loan.totalDue} KRC DEVIDO</p>
                  <p className="text-[11px] text-muted-foreground font-mono tracking-widest mt-0.5">Vence em {loan.daysRemaining} dia(s)</p>
                </div>
                {loan.isPaid ? (
                  <span className="text-green-400 text-xs font-bold border border-green-500/20 px-2 py-1 font-mono tracking-widest">QUITADO</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-primary/40 text-primary hover:bg-primary/10 font-display tracking-widest text-xs"
                    onClick={() => handlePay(loan.id)}
                    disabled={isPaying}
                    data-testid={`button-pay-loan-${loan.id}`}
                  >
                    PAGAR
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
