import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Shield,
  Wallet,
  Crosshair,
  User,
  LogOut,
  Menu,
  Activity,
  Zap,
  LayoutDashboard,
  Flame,
  Globe,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/hooks/use-player";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: playerData } = usePlayer();

  if (!user) return <>{children}</>;

  const navItems = [
    { href: "/", label: "QG-WAR'I", icon: LayoutDashboard },
    { href: "/mundos", label: "MUNDOS", icon: Globe },
    { href: "/zona", label: "ZONA SEGURA", icon: Radio },
    { href: "/bank", label: "BANKHAAOS", icon: Wallet },
    { href: "/inventory", label: "WAR'I", icon: Shield },
    { href: "/market", label: "FORJA DO ARMEIRO", icon: Crosshair },
    { href: "/profile", label: "OPERATIVO", icon: User },
  ];

  const StatBadge = ({ icon: Icon, value, label, color = "text-primary" }: any) => (
    <div className="flex items-center gap-2 px-3 py-1 bg-black/50 border border-white/5 rounded-sm">
      <Icon className={cn("w-4 h-4", color)} />
      <div className="flex flex-col leading-none">
        <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-widest">{label}</span>
        <span className="text-sm font-bold font-mono tracking-wider">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-body text-foreground bg-background selection:bg-primary selection:text-black">
      {/* Mobile Header */}
      <div className="md:hidden h-16 border-b border-border bg-card/60 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-primary animate-ember" />
          <div className="text-xl font-display font-bold text-primary tracking-tight">
            KHAAOS<span className="text-accent">_RUN</span>
          </div>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/10 hover:text-primary">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-card border-r border-border text-foreground w-[80%]">
            <div className="flex flex-col gap-2 mt-10">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-4 text-sm font-display tracking-widest p-3 cursor-pointer transition-colors rounded",
                    location === item.href
                      ? "text-primary bg-primary/10 border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}>
                    <item.icon className="w-5 h-5 shrink-0" />
                    {item.label}
                  </div>
                </Link>
              ))}
              <div
                onClick={() => logout()}
                className="flex items-center gap-4 text-sm font-display tracking-widest p-3 text-destructive hover:bg-destructive/10 cursor-pointer mt-4 rounded"
              >
                <LogOut className="w-5 h-5" />
                DESERTAR
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/40 backdrop-blur-sm sticky top-0 h-screen"
        style={{ background: "linear-gradient(180deg, hsl(260 25% 6%) 0%, hsl(260 20% 5%) 100%)" }}
      >
        {/* Logo */}
        <div className="h-20 flex items-center px-6 border-b border-border/50 gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <Flame className="w-6 h-6 text-primary animate-ember" />
          </div>
          <div>
            <div className="text-lg font-display font-bold text-primary tracking-tight leading-none">
              KHAAOS<span className="text-accent">_RUN</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-widest mt-0.5">BATTLE MILLION</div>
          </div>
        </div>

        <nav className="flex-1 flex flex-col py-4 gap-1 px-3">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "group flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all duration-200 border border-transparent rounded-sm",
                location === item.href
                  ? "bg-primary/15 text-primary border-primary/30 shadow-[0_0_12px_rgba(220,100,20,0.12)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5 hover:border-white/10"
              )}>
                <item.icon className={cn(
                  "w-4 h-4 shrink-0 transition-transform group-hover:scale-110",
                  location === item.href && "text-primary"
                )} />
                <span className="font-display tracking-widest text-xs">{item.label}</span>
                {location === item.href && (
                  <div className="ml-auto w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_6px_hsla(25,95%,55%,0.8)]" />
                )}
              </div>
            </Link>
          ))}
        </nav>

        {/* User Mini Profile */}
        <div className="p-4 border-t border-border/50 bg-black/30">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded border-2 border-accent/50 bg-accent/10 flex items-center justify-center text-accent font-display font-bold text-sm shadow-[0_0_8px_hsla(45,90%,55%,0.2)]">
              {playerData?.stats?.rank?.substring(0, 2) || "ZH"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold truncate text-foreground">{user.firstName || 'RECRUTA'}</span>
              <span className="text-[10px] text-muted-foreground font-mono truncate tracking-widest uppercase">
                {playerData?.stats?.rank || 'ZHEERS'}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive font-display tracking-wider h-8 text-xs"
            onClick={() => logout()}
          >
            <LogOut className="w-3 h-3 mr-2" />
            DESERTAR
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Top HUD Bar */}
        <header className="h-14 border-b border-border bg-card/30 backdrop-blur-sm flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_hsla(25,95%,55%,0.8)]" />
            <span className="hidden md:inline text-xs font-mono text-muted-foreground tracking-widest">SISTEMA: ONLINE</span>
          </div>

          {playerData && (
            <div className="flex items-center gap-3">
              <StatBadge icon={Activity} value={`${playerData.stats.health}/${playerData.stats.maxHealth}`} label="VIT" color="text-red-400" />
              <StatBadge icon={Zap} value={`${playerData.stats.energy}/${playerData.stats.maxEnergy}`} label="NRG" color="text-accent" />
              <StatBadge icon={Shield} value={playerData.stats.xp} label="XP (Accur)" color="text-purple-400" />
            </div>
          )}
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.025] animate-rune"
            style={{
              backgroundImage: `linear-gradient(hsl(25 95% 55%) 1px, transparent 1px), linear-gradient(90deg, hsl(25 95% 55%) 1px, transparent 1px)`,
              backgroundSize: '48px 48px',
            }}
          />
          <div className="relative z-10 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
