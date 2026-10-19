import { Button } from "@/components/ui/button";
import { Shield, Zap, Flame, Skull, Swords, Trophy } from "lucide-react";

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
