import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Zap, Flame, Skull, Swords, Trophy, CheckCircle2, Loader2, BadgeCheck } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground font-body overflow-hidden relative selection:bg-primary selection:text-black">
      {/* Background layers */}
      <div className="absolute inset-0 z-0"
        style={{
          background: "radial-gradient(ellipse at 20% 40%, rgba(100, 20, 160, 0.2) 0%, transparent 55%), radial-gradient(ellipse at 80% 60%, rgba(180, 60, 5, 0.15) 0%, transparent 50%), radial-gradient(circle at 50% 100%, rgba(60, 10, 100, 0.35) 0%, rgba(8, 5, 15, 1) 70%)"
        }}
      />
      {/* Rune grid */}
      <div className="absolute inset-0 z-0 animate-rune"
        style={{
          backgroundImage: `linear-gradient(rgba(200,80,20,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(200,80,20,0.04) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10 container mx-auto px-4 min-h-screen flex flex-col justify-center items-center text-center">
        {/* Status Bar */}
        <div className="mb-10 animate-in fade-in duration-700">
          <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/5 px-4 py-1.5 mb-8 font-mono text-primary text-xs tracking-widest uppercase backdrop-blur">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_6px_hsla(25,95%,55%,0.9)]" />
            SISTEMA: ONLINE // CICLO 01 ATIVO
          </div>

          {/* Main Title */}
          <div className="mb-4">
            <h1 className="text-6xl md:text-9xl font-display font-black tracking-tight mb-2 text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(180deg, hsl(40 90% 80%) 0%, hsl(25 95% 55%) 50%, hsl(10 80% 35%) 100%)",
                textShadow: "none",
                filter: "drop-shadow(0 0 30px hsla(25, 95%, 55%, 0.5))"
              }}
            >
              KHAAOS
            </h1>
            <h2 className="text-5xl md:text-7xl font-display font-bold tracking-widest text-transparent bg-clip-text"
              style={{
                backgroundImage: "linear-gradient(180deg, hsl(45 90% 75%) 0%, hsl(45 85% 50%) 60%, hsl(35 70% 35%) 100%)",
                filter: "drop-shadow(0 0 20px hsla(45, 90%, 55%, 0.4))"
              }}
            >
              RUN
            </h2>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-accent/50" />
            <span className="font-mono text-accent text-sm tracking-[0.4em] uppercase">Battle Million</span>
            <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-accent/50" />
          </div>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-body font-light tracking-wide">
            Um Jogo … uma Chance … e um Legado.<br />
            <span className="text-accent/80 font-semibold">U$1.000.000</span> — Um Milhão de Dólares.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          <Feature icon={Swords} title="WAR'I" desc="Armazém Bélico com seu Arsenal completo. Armas, equipamentos e recursos de batalha." color="text-primary" />
          <Feature icon={Trophy} title="FORJA DO ARMEIRO" desc="Loja oficial do KR. Adquira equipamentos e acessórios exclusivos." color="text-accent" />
          <Feature icon={Skull} title="BANKHAAOS" desc="Gestão financeira com Wallet KRC, Account KR e Fundo de Investimentos FBM." color="text-purple-400" />
        </div>

        {/* ALISTAMENTO (Sprint 1.1/T1.1 — contrato README 2026-11-02) */}
        <EnrollmentFlow />

        {/* CTA */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300 flex flex-col items-center gap-4">
          <Button
            size="lg"
            className="h-14 px-12 text-base font-display tracking-[0.2em] font-bold transition-all hover:scale-105 active:scale-95 border-0"
            style={{
              background: "linear-gradient(135deg, hsl(25 95% 55%) 0%, hsl(15 90% 48%) 100%)",
              color: "hsl(260 25% 5%)",
              boxShadow: "0 0 30px -5px hsla(25, 95%, 55%, 0.7), 0 4px 20px -5px hsla(0,0%,0%,0.5)"
            }}
            onClick={() => window.location.href = "/api/login"}
          >
            <Flame className="w-5 h-5 mr-2" />
            INICIAR SESSÃO
          </Button>
          <p className="text-xs font-mono text-muted-foreground tracking-widest">
            VOCÊ É UM(A) <span className="text-primary">ZHEERS</span> — SEU POSTO AGUARDA
          </p>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
    </div>
  );
}

function Feature({ icon: Icon, title, desc, color }: any) {
  return (
    <div className="bg-black/30 backdrop-blur-sm border border-white/8 p-6 rounded-sm hover:border-primary/40 transition-all group relative overflow-hidden">
      <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-primary/30" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-primary/30" />
      <Icon className={`w-8 h-8 mb-4 mx-auto ${color} group-hover:scale-110 transition-transform`} />
      <h3 className="font-display font-bold text-sm mb-2 text-foreground tracking-widest">{title}</h3>
      <p className="text-xs text-muted-foreground font-body leading-relaxed">{desc}</p>
    </div>
  );
}

/**
 * Alistamento end to end (3 etapas) — server-authoritative.
 *   ETAPA 1/3 inscrição → POST /api/enrollment gera protocolo KR-REG-<base36>
 *   ETAPA 2/3 taxa U$1  → 100 KRC liquidadas no ledger (sandbox auto-liquidada)
 *   ETAPA 3/3 alistado  → WELCOME_BONUS 500 KRC creditado após a taxa
 * Idempotente: retomada via GET /api/enrollment?username= (não repete
 * inscrição; 2ª chamada → alreadyPaid:true sem dupla cobrança).
 */
type EnrollmentResponse = {
  username: string;
  protocol: string;
  enrollmentPaid: boolean;
  alreadyPaid: boolean;
  fee: { usd: string; krc: string };
  welcomeBonusKrc: string;
  wallet: { bonus: string };
  enlistedAt: string;
};

function EnrollmentFlow() {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<EnrollmentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);

  // Retomada de sessão: ao digitar 3+ chars, consulta o alistamento existente.
  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3 || result) return;
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      fetch(`/api/enrollment?username=${encodeURIComponent(trimmed)}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: EnrollmentResponse | null) => {
          if (!cancelled && data?.enrollmentPaid) {
            setResult({ ...data, alreadyPaid: true });
          }
        })
        .catch(() => undefined)
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); setChecking(false); };
  }, [username, result]);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/enrollment", { username: username.trim() });
      const data = (await res.json()) as EnrollmentResponse;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "falha no alistamento";
      setError(message.includes("invalid_username") ? "Username inválido: 3–24 caracteres (letras, números, hífen, underline)" : message);
    } finally {
      setSubmitting(false);
    }
  };

  const step = result ? 3 : username.trim().length >= 3 ? 2 : 1;

  return (
    <div className="w-full max-w-xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
      <div className="border border-primary/25 bg-black/40 backdrop-blur-sm p-6 text-left">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-black tracking-[0.25em] text-foreground text-sm">ALISTAMENTO</h3>
          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">ETAPA {step}/3</span>
        </div>

        {/* Progressão das 3 etapas */}
        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 h-1" style={{ background: step >= s ? "hsl(25 95% 55%)" : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>

        {!result ? (
          <>
            <p className="text-xs text-muted-foreground font-body leading-relaxed mb-4">
              Inscrição na campanha. Taxa <span className="text-accent font-semibold">U$1,00</span> (= 100 KRC)
              liquidação server-authoritative · bônus de boas-vindas <span className="text-accent font-semibold">500 KRC</span> creditado após a taxa.
              {checking && <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] text-primary"><Loader2 className="w-3 h-3 animate-spin" /> verificando alistamento…</span>}
            </p>
            <div className="flex gap-2">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nome de operador (3–24)"
                maxLength={24}
                className="font-mono"
                aria-label="Nome de operador"
                onKeyDown={(e) => { if (e.key === "Enter" && username.trim().length >= 3 && !submitting) submit(); }}
              />
              <Button
                onClick={submit}
                disabled={submitting || username.trim().length < 3}
                className="font-display tracking-widest whitespace-nowrap"
                style={{ background: "linear-gradient(135deg, hsl(25 95% 55%) 0%, hsl(15 90% 48%) 100%)", color: "hsl(260 25% 5%)" }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4 mr-1" />}
                ALISTAR
              </Button>
            </div>
            {error && <p className="mt-3 text-xs text-red-400 font-mono" role="alert">{error}</p>}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-display font-bold tracking-widest text-sm">
                {result.alreadyPaid ? "ALISTAMENTO RETOMADO" : "ALISTAMENTO CONFIRMADO"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="border border-border/40 bg-black/30 p-3">
                <p className="text-[9px] tracking-[0.25em] text-muted-foreground">PROTOCOLO</p>
                <p className="mt-1 text-accent font-bold" data-testid="enrollment-protocol">{result.protocol}</p>
              </div>
              <div className="border border-border/40 bg-black/30 p-3">
                <p className="text-[9px] tracking-[0.25em] text-muted-foreground">CARTEIRA BÔNUS</p>
                <p className="mt-1 text-accent font-bold">{result.wallet.bonus} KRC</p>
              </div>
              <div className="border border-border/40 bg-black/30 p-3">
                <p className="text-[9px] tracking-[0.25em] text-muted-foreground">TAXA</p>
                <p className="mt-1 flex items-center gap-1 text-foreground"><BadgeCheck className="w-3 h-3 text-green-400" /> U${result.fee.usd} = {result.fee.krc} KRC</p>
              </div>
              <div className="border border-border/40 bg-black/30 p-3">
                <p className="text-[9px] tracking-[0.25em] text-muted-foreground">BÔNUS</p>
                <p className="mt-1 text-foreground">+{result.welcomeBonusKrc} KRC</p>
              </div>
            </div>
            {result.alreadyPaid && (
              <p className="font-mono text-[10px] text-muted-foreground">idempotente — nenhuma cobrança duplicada</p>
            )}
            <Button
              onClick={() => window.location.href = "/mundos"}
              variant="outline"
              className="w-full font-display tracking-widest"
            >
              CONHECER OS MUNDOS
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
