import { useState } from "react";
import { CyberCard } from "@/components/cyber-card";
import { cn } from "@/lib/utils";
import {
  Sword, Shield, TreePine, Target, Truck, Zap, Clock, Users, Map,
  ChevronDown, ChevronUp, AlertTriangle, Star, Trophy, Radio,
  Flame, Skull, Wind, CloudLightning, Droplets, Package
} from "lucide-react";

/* ─── DATA ──────────────────────────────────────────────────────── */

const ENVIRONMENTS = [
  {
    id: "armory",
    name: "Pátio de Armamento",
    subtitle: "The Armory Hub",
    fraction: "1/8",
    pct: 12.5,
    icon: Sword,
    color: "text-primary",
    borderColor: "border-primary/40",
    bgGlow: "hsla(25,95%,55%,0.08)",
    desc: "Zona neutra circular onde os jogadores iniciam ao desembarcarem. Todos os níveis de equipamentos estão desbloqueados. Paredes holográficas exibem estatísticas de cada arma — monte seu loadout ideal sem restrições.",
    tags: ["Zona Neutra", "Arsenal Livre", "Holográfico"],
  },
  {
    id: "proving",
    name: "Setor de Testes",
    subtitle: "The Proving Grounds",
    fraction: "3/8",
    pct: 37.5,
    icon: Target,
    color: "text-destructive",
    borderColor: "border-destructive/40",
    bgGlow: "hsla(0,80%,55%,0.08)",
    desc: "Área urbana densa com prédios destrutíveis, túneis subterrâneos e passarelas elevadas. Cenário dinâmico: pontes podem ser implodidas, coberturas pulverizadas. Prepare emboscadas e crie zonas seguras de ataque.",
    tags: ["Destrutível", "Urbano", "Táticas Avançadas"],
  },
  {
    id: "park",
    name: "Parque Abandonado",
    subtitle: "The Abandoned Park",
    fraction: "4/8",
    pct: 50,
    icon: TreePine,
    color: "text-green-400",
    borderColor: "border-green-500/40",
    bgGlow: "hsla(140,60%,45%,0.08)",
    desc: "Vastas áreas verdes com vegetação rasteira e árvores antigas de copas altas. Riachos e rochas servem de abrigo. O ambiente natural favorece emboscadas e ataques surpresa.",
    tags: ["Cobertura Natural", "Emboscadas", "Furtividade"],
  },
  {
    id: "zex",
    name: "Zonas de Extração de XP",
    subtitle: "ZEX — 15 Terminais",
    fraction: "∞",
    pct: 100,
    icon: Radio,
    color: "text-accent",
    borderColor: "border-accent/40",
    bgGlow: "hsla(45,90%,55%,0.08)",
    desc: "15 terminais ZEX espalhados pelo perímetro. Salve parte das conquistas obtidas no Beta para transferência à conta oficial após o lançamento — desde que sobreviva aos confrontos e não abandone a frente de batalha.",
    tags: ["15 Terminais", "Salvar Progresso", "Recompensas"],
  },
];

const ZU_MODES = [
  {
    id: 1,
    title: "Zu 1 — Colisão com a Manada",
    question: "Risco de Colisão — Apertar os Cintos? S/N",
    desc: "O caminhão perde o controle ao atropelar uma manada de bois. Quem está com o cinto apertado não sofre danos. Os demais sofrem dano conforme o impacto.",
    loot: ["20× Facas", "10× Pistola 9MM", "20× Munições 9MM", "20× Kits de Primeiros Socorros", "5× Fuzil Barrett MRAD (MK22)", "20× Munições Barrett"],
    choice: { safe: "Apertar o Cinto", risk: "Ficar Solto", safePenalty: "5–7s para se soltar após colisão", riskPenalty: "Até -30% Vitalidade" },
    icon: Truck,
    color: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
  },
  {
    id: 2,
    title: "Zu 2 — Desmoronamento",
    question: "Alto Risco de Desmoronamento — Saltar do Caminhão? S/N",
    desc: "Uma rocha gigante atinge o caminhão fazendo-o capotar diversas vezes. Quem salta não sofre danos. Os demais sofrem dano conforme o impacto.",
    loot: ["15× Granadas", "10× SMG", "30× Munições SMG", "10× Kits Médicos", "3× Sniper L115A3", "15× Munições Sniper"],
    choice: { safe: "Saltar do Caminhão", risk: "Permanecer Dentro", safePenalty: "Queda livre — risco de posição", riskPenalty: "Dano por capotagem" },
    icon: AlertTriangle,
    color: "text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/5",
  },
  {
    id: 3,
    title: "Zu 3 — Queda na Ponte",
    question: "Ponte com Trilho Quebrado — Usar Máscara de Oxigênio? S/N",
    desc: "O caminhão cai da ponte devido ao trilho quebrado e submerge na água. Quem usa máscara de oxigênio não sofre danos. Os demais sofrem dano conforme o tempo submersos.",
    loot: ["10× Facas de Combate", "8× Pistola .44 Magnum", "25× Munições .44", "15× Antídotos", "2× Rifle Anti-Material", "10× Munições Anti-Material"],
    choice: { safe: "Usar Máscara O₂", risk: "Sem Máscara", safePenalty: "Nenhum dano inicial", riskPenalty: "Dano por tempo submerso" },
    icon: Droplets,
    color: "text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
  },
];

const CHALLENGES = [
  {
    icon: Clock,
    color: "text-primary",
    title: "Desafio do Relógio",
    desc: "Sobreviventes de longa duração (3h completas) recebem multiplicadores massivos de XP e dicas estratégicas exclusivas sobre a dinâmica da Khaaos Ville.",
    reward: "Multiplicador XP + Manual Estratégico",
  },
  {
    icon: Radio,
    color: "text-accent",
    title: "Captura de Inteligência",
    desc: "Colete 'Data Cores' espalhados pela Vila. Cada core contribui para a barra global de 1.000.000 de inscritos, acelerando o Start da Campanha.",
    reward: "Acelera Lançamento Global",
  },
  {
    icon: Sword,
    color: "text-destructive",
    title: "Duelos de Patente",
    desc: "Áreas específicas no centro do Ring para combate 1x1 e 2x2. Testam mecânicas de combate corpo a corpo e precisão de tiro.",
    reward: "Insígnia de Duelo + XP Bônus",
  },
  {
    icon: Users,
    color: "text-purple-400",
    title: "Convites × Recompensas",
    desc: "Cada player recebe um link de convite pessoal. Quanto mais inscrições geradas, maiores as recompensas. Um rank de entusiastas é atualizado em tempo real.",
    reward: "KRC + Itens Exclusivos",
  },
];

const PULSO_EVENTS = [
  { icon: Wind, label: "Nevoeiro", desc: "Visibilidade reduzida drásticamente. Furtividade aumentada." },
  { icon: CloudLightning, label: "Tempestade Elétrica", desc: "Relâmpagos aleatórios causam dano em área aberta." },
  { icon: Droplets, label: "Chuva Ácida", desc: "Dano contínuo fora de cobertura. Force entradas nos prédios." },
  { icon: Star, label: "Suprimentos Lendários", desc: "Drop em ponto aleatório. Confrontos diretos garantidos." },
  { icon: Flame, label: "Zona de Fogo", desc: "Setores do mapa pegam fogo, reduzindo o perímetro seguro." },
  { icon: Skull, label: "Evento Surpresa", desc: "Evento desconhecido. O Caos define as regras.", mystery: true },
];

/* ─── COMPONENT ─────────────────────────────────────────────────── */

export default function Mundos() {
  const [expandedZu, setExpandedZu] = useState<number | null>(null);

  return (
    <div className="space-y-10 pb-8">

      {/* ── HERO ── */}
      <div className="relative border-b border-border pb-8 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 60% 50%, hsl(25 95% 55%) 0%, transparent 60%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-mono tracking-[0.3em] text-primary border border-primary/30 px-2 py-0.5 bg-primary/5">1º ESTÁGIO</span>
            <span className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground">CAMPO DE TREINAMENTO</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-black text-foreground mb-2 leading-tight">
            ARQUITETURA<br /><span className="text-primary">DOS MUNDOS</span>
          </h1>
          <p className="text-muted-foreground font-mono text-xs tracking-widest max-w-2xl leading-relaxed">
            PROTOCOLO CIGKV ATIVO — KHAAOS VILLE — CAMPO DE INSTRUÇÃO DE GUERRA
          </p>
          <div className="flex flex-wrap gap-4 mt-5 text-xs font-mono">
            <Stat icon={Users} label="Players / Ring" value="50" />
            <Stat icon={Clock} label="Duração do Ring" value="3h" />
            <Stat icon={Map} label="Zonas ZEX" value="15" />
            <Stat icon={Zap} label="Pulso Khaaos" value="10min" />
          </div>
        </div>
      </div>

      {/* ── LORE ── */}
      <CyberCard variant="gold" title="KHAAOS VILLE" subtitle="ENCLAVE CYBER-MILITAR — BRIEFING OPERACIONAL">
        <div className="grid md:grid-cols-2 gap-6 text-sm font-body leading-relaxed text-muted-foreground">
          <p>
            O <span className="text-accent font-semibold">CIGKV</span> é um enclave fortificado de estética Cyber-Militar,
            construído sobre as ruínas de uma antiga metrópole industrial. O ambiente é projetado para ser um{" "}
            <span className="text-foreground italic">"playground de destruição"</span>, onde a tecnologia de ponta
            se choca com o concreto bruto.
          </p>
          <p>
            Fase de <span className="text-primary font-semibold">Engajamento em Massa</span>. Este é o "Ponto de
            Inflexão" onde os jogadores deixam de ser espectadores para se tornarem combatentes do ecossistema
            Khaaos Run. Disponível durante o alistamento — até <span className="text-accent font-bold">1.000.000 inscrições</span>.
          </p>
        </div>
        <div className="mt-5 p-3 border border-accent/20 bg-black/30 text-xs font-mono tracking-widest text-muted-foreground">
          <span className="text-accent font-bold">EXCO</span> — Excesso e Contingente: quando 1.000.000 inscrições confirmadas forem alcançadas,
          a Khaaos Ville encerra e a <span className="text-primary font-bold">Guerra dos Filhos da Escuridão</span> é convocada.
        </div>
      </CyberCard>

      {/* ── MAP LAYOUT ── */}
      <div>
        <SectionHeader label="MAPA DO ANEL" sub="DISTRIBUIÇÃO DO PERÍMETRO DE BATALHA" />
        <div className="mt-4 space-y-3">
          {/* Visual perimeter bar */}
          <div className="h-8 flex rounded-none overflow-hidden border border-border/40 text-[10px] font-mono">
            {[
              { w: "12.5%", bg: "bg-primary/30", label: "ARMAMENTO 1/8" },
              { w: "37.5%", bg: "bg-destructive/25", label: "PROVING GROUNDS 3/8" },
              { w: "50%",   bg: "bg-green-700/25", label: "PARQUE ABANDONADO 4/8" },
            ].map(s => (
              <div key={s.label} className={cn("flex items-center justify-center border-r border-black/30 last:border-0 font-bold tracking-widest", s.bg)} style={{ width: s.w }}>
                <span className="hidden md:block truncate px-2 text-white/70">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {ENVIRONMENTS.map(env => (
              <EnvironmentCard key={env.id} env={env} />
            ))}
          </div>
        </div>
      </div>

      {/* ── PULSO KHAAOS ── */}
      <div>
        <SectionHeader label="PULSO KHAAOS" sub="EVENTOS A CADA 10 MINUTOS — VARREDURA DO MAPA" />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {PULSO_EVENTS.map(ev => (
            <div
              key={ev.label}
              className={cn(
                "p-4 border border-border/30 bg-black/30 group hover:border-primary/40 transition-all",
                ev.mystery && "border-dashed opacity-70"
              )}
            >
              <ev.icon className={cn("w-5 h-5 mb-2 text-primary group-hover:text-accent transition-colors", ev.mystery && "text-muted-foreground")} />
              <p className="text-xs font-display font-bold text-foreground tracking-widest mb-1">{ev.label}</p>
              <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{ev.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── ZU — ENTRY MODES ── */}
      <div>
        <SectionHeader label="ZU — ENTRADA PARA O RING" sub="3 FORMATOS DE INGRESSO AO CIGKV" />
        <div className="mt-4 space-y-4">
          {ZU_MODES.map(zu => (
            <ZuCard key={zu.id} zu={zu} expanded={expandedZu === zu.id} onToggle={() => setExpandedZu(expandedZu === zu.id ? null : zu.id)} />
          ))}
        </div>
      </div>

      {/* ── BATTLE DYNAMICS ── */}
      <div>
        <SectionHeader label="DINÂMICA DO RING" sub="SISTEMA DE BATALHA DE LONGA DURAÇÃO" />
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <CyberCard title="ENTRADA — FLUXO CONTÍNUO" subtitle="50 JOGADORES / RING">
            <ul className="space-y-3 text-sm font-body text-muted-foreground">
              <li className="flex gap-2"><span className="text-primary mt-0.5">▸</span>Ring inicia ao completar 50 jogadores.</li>
              <li className="flex gap-2"><span className="text-primary mt-0.5">▸</span>Eliminados abrem vagas instantâneas para a fila de espera.</li>
              <li className="flex gap-2"><span className="text-primary mt-0.5">▸</span>Caos constante e combate contínuo durante as 3 horas.</li>
              <li className="flex gap-2"><span className="text-destructive mt-0.5">▸</span><span>Novos acessos bloqueados quando restarem <span className="text-destructive font-bold">5 minutos</span> no cronômetro.</span></li>
            </ul>
          </CyberCard>
          <CyberCard title="ARSENAL SEM LIMITES" subtitle="PROTOCOLO EXPERIMENTAL — CIGKV">
            <ul className="space-y-3 text-sm font-body text-muted-foreground">
              <li className="flex gap-2"><span className="text-accent mt-0.5">▸</span>Sistema de patentes <span className="text-accent font-semibold ml-1">ignorado</span> nesta fase.</li>
              <li className="flex gap-2"><span className="text-accent mt-0.5">▸</span>Um Recruta pode testar um Rifle de Pulso de Nível General.</li>
              <li className="flex gap-2"><span className="text-accent mt-0.5">▸</span>Objetivo: coleta de dados de balanceamento e feedback real.</li>
              <li className="flex gap-2"><span className="text-green-400 mt-0.5">▸</span>Top 1000 pontuados recebem <span className="text-green-400 font-semibold ml-1">Token de Veterano</span>.</li>
            </ul>
          </CyberCard>
        </div>
      </div>

      {/* ── DESAFIO DOS GIGANTES ── */}
      <CyberCard title="DESAFIO DOS GIGANTES" subtitle="O ÚLTIMO CONFRONTO — GUERRA DOS FILHOS DA ESCURIDÃO" variant="gold">
        <div className="space-y-4">
          <p className="text-sm font-body text-muted-foreground leading-relaxed">
            Ao atingir <span className="text-accent font-bold">1.000.000 de inscrições (EXCO)</span>, os 50 jogadores mais destacados no CIGKV
            são convocados para o último confronto teste. Este ring será realizado no mapa completo, sem regras de entrada contínua.
          </p>
          <div className="grid md:grid-cols-3 gap-4 pt-2">
            <RewardBox icon={Trophy} color="text-accent" title="Insígnia Mérito KR" desc="Destaque permanente no perfil. Pode ser trocada por Pack Especial." />
            <RewardBox icon={Package} color="text-primary" title="Pack Exclusivo" desc="Kits médicos, colete, munições, armamentos e 1.000 KRC de recompensa." />
            <RewardBox icon={Star} color="text-purple-400" title="Código KR-N1" desc="Manual de instrução de guerra com dicas e estratégias de batalha." />
          </div>
        </div>
      </CyberCard>

      {/* ── CHALLENGES ── */}
      <div>
        <SectionHeader label="DESAFIOS DO CIGKV" sub="MISSÕES ESPECIAIS DURANTE O CAMPO DE TREINAMENTO" />
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {CHALLENGES.map(ch => (
            <div key={ch.title} className="p-5 border border-border/40 bg-card/40 group hover:border-primary/40 transition-all">
              <div className="flex items-start gap-3 mb-3">
                <ch.icon className={cn("w-5 h-5 shrink-0 mt-0.5", ch.color)} />
                <div>
                  <h4 className="font-display font-bold text-xs tracking-widest text-foreground">{ch.title}</h4>
                  <p className="text-[11px] font-mono text-muted-foreground mt-2 leading-relaxed">{ch.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                <Star className="w-3 h-3 text-accent shrink-0" />
                <span className="text-[10px] font-mono text-accent tracking-widest">{ch.reward}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── REGRA PRINCIPAL ── */}
      <div className="p-6 border-2 border-primary/40 bg-primary/5 text-center relative overflow-hidden"
        style={{ boxShadow: "0 0 30px -10px hsla(25,95%,55%,0.3)" }}
      >
        <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-primary" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-primary" />
        <Flame className="w-8 h-8 text-primary mx-auto mb-3 animate-ember" />
        <p className="font-display font-bold text-lg text-primary tracking-widest mb-2">A ÚNICA REGRA</p>
        <p className="text-foreground font-body text-base max-w-2xl mx-auto leading-relaxed">
          Sobreviver a todo custo, pilhar seus adversários e juntar o máximo de{" "}
          <span className="text-accent font-bold">KRC</span> que puder.
        </p>
        <p className="text-muted-foreground font-mono text-xs mt-3 tracking-widest">
          COM KRC VOCÊ ADQUIRE EQUIPAMENTOS NA FORJA DO ARMEIRO E EVOLUI SEU AVATAR
        </p>
      </div>
    </div>
  );
}

/* ─── SUB-COMPONENTS ─────────────────────────────────────────────── */

function SectionHeader({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center gap-4">
      <div>
        <h2 className="text-lg font-display font-bold text-primary tracking-widest">{label}</h2>
        <p className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">{sub}</p>
      </div>
      <div className="flex-1 h-px bg-gradient-to-r from-primary/40 to-transparent" />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-border/40 bg-black/30">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <div>
        <p className="text-[10px] text-muted-foreground tracking-widest">{label}</p>
        <p className="text-sm font-display font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function EnvironmentCard({ env }: { env: typeof ENVIRONMENTS[0] }) {
  return (
    <div className={cn("p-4 border-2 bg-black/30 hover:bg-black/50 transition-all group", env.borderColor)}
      style={{ boxShadow: `0 0 15px -5px ${env.bgGlow}` }}
    >
      <div className="flex items-start justify-between mb-3">
        <env.icon className={cn("w-6 h-6", env.color)} />
        <span className={cn("text-xl font-display font-black", env.color)}>{env.fraction}</span>
      </div>
      <h3 className="font-display font-bold text-xs text-foreground tracking-widest mb-1">{env.name}</h3>
      <p className={cn("text-[10px] font-mono mb-3 tracking-widest", env.color)}>{env.subtitle}</p>
      <p className="text-[11px] font-body text-muted-foreground leading-relaxed mb-3">{env.desc}</p>
      {/* Perimeter bar */}
      <div className="h-1 bg-black/60 overflow-hidden rounded-none">
        <div className="h-full transition-all" style={{ width: `${env.pct}%`, background: `currentColor`, opacity: 0.5 }} />
      </div>
      <div className="flex flex-wrap gap-1 mt-3">
        {env.tags.map(t => (
          <span key={t} className={cn("text-[9px] font-mono tracking-widest px-1.5 py-0.5 border", env.borderColor, `${env.color} bg-black/40`)}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function ZuCard({ zu, expanded, onToggle }: { zu: typeof ZU_MODES[0]; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={cn("border transition-all", zu.border, expanded ? zu.bg : "bg-black/30 hover:bg-black/40")}>
      <button
        className="w-full p-5 flex items-center justify-between gap-4 text-left"
        onClick={onToggle}
        data-testid={`button-zu-${zu.id}`}
      >
        <div className="flex items-center gap-4">
          <zu.icon className={cn("w-6 h-6 shrink-0", zu.color)} />
          <div>
            <p className="font-display font-bold text-sm text-foreground tracking-widest">{zu.title}</p>
            <p className="text-[11px] font-mono text-muted-foreground mt-0.5 tracking-widest">{zu.question}</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-border/30 pt-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-sm font-body text-muted-foreground leading-relaxed">{zu.desc}</p>

          {/* Choice Matrix */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 border border-green-500/30 bg-green-500/5">
              <p className="text-[10px] font-mono text-green-400 tracking-widest mb-1">ESCOLHA SEGURA</p>
              <p className="text-sm font-display font-bold text-foreground">{zu.choice.safe}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-2">{zu.choice.safePenalty}</p>
            </div>
            <div className="p-3 border border-red-500/30 bg-red-500/5">
              <p className="text-[10px] font-mono text-destructive tracking-widest mb-1">ESCOLHA ARRISCADA</p>
              <p className="text-sm font-display font-bold text-foreground">{zu.choice.risk}</p>
              <p className="text-[11px] font-mono text-muted-foreground mt-2">{zu.choice.riskPenalty}</p>
            </div>
          </div>

          {/* Loot */}
          <div>
            <p className="text-[10px] font-mono tracking-widest text-muted-foreground mb-2">LOOT INICIAL — 1 ITEM POR PLAYER</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {zu.loot.map(l => (
                <div key={l} className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground p-2 border border-border/30 bg-black/30">
                  <Package className="w-3 h-3 text-primary shrink-0" />
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RewardBox({ icon: Icon, color, title, desc }: { icon: any; color: string; title: string; desc: string }) {
  return (
    <div className="p-4 border border-border/30 bg-black/30 text-center">
      <Icon className={cn("w-6 h-6 mx-auto mb-2", color)} />
      <p className="font-display font-bold text-xs text-foreground tracking-widest mb-1">{title}</p>
      <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
