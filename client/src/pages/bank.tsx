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
import { ArrowRightLeft, Download, Upload, DollarSign, Wallet, History, AlertTriangle } from "lucide-react";
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
           <h1 className="text-3xl font-display font-bold text-white">BANKING TERMINAL</h1>
           <p className="text-muted-foreground font-mono text-sm">SECURE FINANCIAL OPERATIONS // ID: {bank?.userId}</p>
         </div>
         <DepositDialog />
      </div>

      {/* Account Balances Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <BalanceCard 
           title="WEAPONS" 
           balance={bank?.weaponsBalance} 
           icon={Wallet} 
           color="text-blue-400" 
           subtext="Main transactional account"
         />
         <BalanceCard 
           title="BONUS" 
           balance={bank?.bonusBalance} 
           icon={Download} 
           color="text-yellow-400"
           subtext="Rewards & Salaries"
         />
         <BalanceCard 
           title="FBM (PREMIUM)" 
           balance={bank?.fbmBalance} 
           icon={DollarSign} 
           color="text-purple-400"
           subtext="Premium currency"
         />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Operations Panel */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="transfer" className="w-full">
            <TabsList className="w-full grid grid-cols-2 bg-black/40 border border-white/5 p-1 h-auto">
              <TabsTrigger value="transfer" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-display tracking-widest py-2">TRANSFER</TabsTrigger>
              <TabsTrigger value="loans" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-display tracking-widest py-2">LOANS</TabsTrigger>
            </TabsList>
            
            <TabsContent value="transfer" className="mt-4">
              <TransferPanel />
            </TabsContent>
            
            <TabsContent value="loans" className="mt-4">
              <LoansPanel loans={loans || []} />
            </TabsContent>
          </Tabs>
          
          <CyberCard title="TRANSACTION HISTORY" subtitle="LAST 50 ENTRIES">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-white/5 font-mono">
                  <tr>
                    <th className="px-4 py-3">TYPE</th>
                    <th className="px-4 py-3">AMOUNT</th>
                    <th className="px-4 py-3">DATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {transactions?.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground font-mono">NO RECORDS FOUND</td>
                    </tr>
                  ) : (
                    transactions?.map((tx) => (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono text-primary">{tx.type}</td>
                        <td className="px-4 py-3 font-bold">{tx.amountKrc} KRC</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
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
        <div className="lg:col-span-1 space-y-6">
           <CyberCard title="EXCHANGE RATES" subtitle="MARKET LIVE">
             <div className="space-y-4">
               <div className="flex justify-between items-center p-3 border border-white/5 bg-black/20 rounded">
                 <span className="text-sm font-mono text-muted-foreground">1 USD</span>
                 <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                 <span className="text-lg font-bold font-display text-primary">{KRC_TO_USD} KRC</span>
               </div>
               <div className="text-xs text-muted-foreground p-3 border border-dashed border-white/10 rounded">
                 <p className="mb-2 font-bold text-white">NOTICE:</p>
                 <p>Transfer fees apply to inter-account movements. External deposits are processed instantly.</p>
               </div>
             </div>
           </CyberCard>
        </div>
      </div>
    </div>
  );
}

function BalanceCard({ title, balance, icon: Icon, color, subtext }: any) {
  return (
    <CyberCard className="relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Icon className="w-24 h-24" />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn("w-5 h-5", color)} />
          <h3 className="font-display font-bold tracking-widest text-lg text-white">{title}</h3>
        </div>
        <div className="text-3xl font-display font-bold text-white mb-1">
          {balance || "0"} <span className="text-sm text-muted-foreground font-sans font-normal">KRC</span>
        </div>
        <p className="text-xs font-mono text-muted-foreground uppercase">{subtext}</p>
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
        toast({ title: "DEPOSIT SUCCESSFUL", description: "Funds added to your account.", className: "border-primary text-primary" });
        setOpen(false);
        setAmount("");
      },
      onError: (err) => toast({ title: "ERROR", description: err.message, variant: "destructive" })
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary hover:bg-primary/90 text-black font-bold font-display tracking-wider">
          <Upload className="w-4 h-4 mr-2" />
          DEPOSIT USD
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-primary/20 text-white">
        <DialogHeader>
          <DialogTitle className="font-display tracking-widest text-primary">DEPOSIT FUNDS</DialogTitle>
          <DialogDescription>Convert USD to KRC at the current exchange rate.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Amount (USD)</Label>
            <Input 
              type="number" 
              placeholder="0.00" 
              className="bg-black/50 border-white/10 font-mono text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="p-3 bg-primary/10 border border-primary/20 rounded text-center">
            <p className="text-xs text-muted-foreground mb-1">ESTIMATED RECEIPT</p>
            <p className="text-2xl font-display font-bold text-primary">
              {(parseFloat(amount || "0") * KRC_TO_USD).toFixed(2)} KRC
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>CANCEL</Button>
          <Button onClick={handleDeposit} disabled={isPending || !amount} className="bg-primary text-black font-bold">
            {isPending ? "PROCESSING..." : "CONFIRM DEPOSIT"}
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
        toast({ title: "TRANSFER COMPLETE", description: "Funds moved successfully.", className: "border-primary text-primary" });
        setAmount("");
      },
      onError: (err) => toast({ title: "TRANSFER FAILED", description: err.message, variant: "destructive" })
    });
  };

  return (
    <CyberCard>
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Amount (KRC)</Label>
            <Input 
              type="number" 
              placeholder="0" 
              className="bg-black/50 border-white/10 font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Destination</Label>
            <Select value={destination} onValueChange={(v: any) => setDestination(v)}>
              <SelectTrigger className="bg-black/50 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="weapons">WEAPONS ACC</SelectItem>
                <SelectItem value="fbm">FBM ACC</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleTransfer} disabled={isPending || !amount} className="w-full bg-primary hover:bg-primary/90 text-black font-bold font-display tracking-widest">
          {isPending ? "EXECUTING..." : "EXECUTE TRANSFER"}
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
        toast({ title: "LOAN APPROVED", description: "Funds disbursed.", className: "border-primary text-primary" });
        setAmount("");
      },
      onError: (err) => toast({ title: "REQUEST DENIED", description: err.message, variant: "destructive" })
    });
  };

  const handlePay = (id: number) => {
    payLoan(id, {
      onSuccess: () => toast({ title: "PAYMENT SUCCESSFUL", description: "Loan settled.", className: "border-primary text-primary" }),
      onError: (err) => toast({ title: "PAYMENT FAILED", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6">
      <CyberCard title="REQUEST CAPITAL" subtitle="INSTANT APPROVAL">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label>Principal (KRC)</Label>
            <Input 
              type="number" 
              placeholder="Min 100" 
              className="bg-black/50 border-white/10 font-mono"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Duration (Days)</Label>
            <Input 
              type="number" 
              value={days}
              min={1} max={30}
              className="bg-black/50 border-white/10 font-mono"
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <Button onClick={handleRequest} disabled={isRequesting || !amount} className="bg-primary hover:bg-primary/90 text-black font-bold font-display tracking-widest">
            {isRequesting ? "CALCULATING..." : "APPLY"}
          </Button>
        </div>
      </CyberCard>

      <div className="space-y-4">
        <h3 className="font-display font-bold text-primary tracking-widest text-lg">ACTIVE LOANS</h3>
        {loans.length === 0 ? (
          <div className="p-8 border border-dashed border-white/10 rounded text-center text-muted-foreground font-mono">
            NO ACTIVE LOANS
          </div>
        ) : (
          <div className="grid gap-4">
             {loans.map(loan => (
               <div key={loan.id} className="p-4 bg-black/40 border border-white/5 rounded flex justify-between items-center">
                 <div>
                   <p className="font-bold text-white font-display">{loan.totalDue} KRC DUE</p>
                   <p className="text-xs text-muted-foreground font-mono">Expires in {loan.daysRemaining} days</p>
                 </div>
                 {loan.isPaid ? (
                   <span className="text-green-500 text-xs font-bold border border-green-500/20 px-2 py-1 rounded">PAID</span>
                 ) : (
                   <Button size="sm" variant="outline" onClick={() => handlePay(loan.id)} disabled={isPaying}>
                     PAY NOW
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
