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
  LayoutDashboard
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
    { href: "/", label: "COMMAND", icon: LayoutDashboard },
    { href: "/bank", label: "FINANCE", icon: Wallet },
    { href: "/inventory", label: "ARMORY", icon: Shield },
    { href: "/market", label: "MARKET", icon: Crosshair },
    { href: "/profile", label: "PROFILE", icon: User },
  ];

  const StatBadge = ({ icon: Icon, value, label, color = "text-primary" }: any) => (
    <div className="flex items-center gap-2 px-3 py-1 bg-black/40 border border-white/5 rounded-sm">
      <Icon className={cn("w-4 h-4", color)} />
      <div className="flex flex-col leading-none">
        <span className="text-[10px] text-muted-foreground uppercase font-mono">{label}</span>
        <span className="text-sm font-bold font-display tracking-wider">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-body text-foreground bg-background selection:bg-primary selection:text-black">
      {/* Mobile Header */}
      <div className="md:hidden h-16 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="text-xl font-display font-bold text-primary tracking-tighter">
          KHAAOS<span className="text-white">_OS</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-primary hover:bg-primary/10 hover:text-primary">
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-card border-r border-border text-foreground w-[80%]">
            <div className="flex flex-col gap-8 mt-10">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    "flex items-center gap-4 text-lg font-display tracking-widest p-2 rounded hover:bg-white/5 cursor-pointer transition-colors",
                    location === item.href ? "text-primary bg-primary/10 border-r-2 border-primary" : "text-muted-foreground"
                  )}>
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </div>
                </Link>
              ))}
              <div 
                onClick={() => logout()}
                className="flex items-center gap-4 text-lg font-display tracking-widest p-2 text-destructive hover:bg-destructive/10 cursor-pointer mt-auto"
              >
                <LogOut className="w-5 h-5" />
                LOGOUT
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card/30 backdrop-blur-sm sticky top-0 h-screen">
        <div className="h-20 flex items-center px-6 border-b border-white/5">
          <div className="text-2xl font-display font-bold text-primary tracking-tighter animate-pulse">
            KHAAOS<span className="text-white">_OS</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col py-6 gap-2 px-3">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-sm cursor-pointer transition-all duration-200 border border-transparent",
                location === item.href 
                  ? "bg-primary/10 text-primary border-primary/30 shadow-[0_0_10px_rgba(0,255,65,0.1)]" 
                  : "text-muted-foreground hover:text-white hover:bg-white/5 hover:border-white/10"
              )}>
                <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", location === item.href && "text-primary animate-pulse")} />
                <span className="font-display tracking-widest text-sm">{item.label}</span>
                {location === item.href && <div className="ml-auto w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_5px_#00ff41]" />}
              </div>
            </Link>
          ))}
        </nav>

        {/* User Mini Profile */}
        <div className="p-4 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-primary/20 border border-primary/50 flex items-center justify-center text-primary font-display font-bold">
              {playerData?.stats?.rank?.substring(0, 2) || "UR"}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-bold truncate text-white">{user.firstName || 'OPERATIVE'}</span>
              <span className="text-xs text-muted-foreground font-mono truncate">{playerData?.stats?.rank || 'UNRANKED'}</span>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive font-display tracking-wider h-8 text-xs"
            onClick={() => logout()}
          >
            <LogOut className="w-3 h-3 mr-2" />
            DISCONNECT
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Top HUD Bar */}
        <header className="h-14 border-b border-border bg-card/20 backdrop-blur-sm flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              SYSTEM: ONLINE
            </div>
          </div>
          
          {playerData && (
            <div className="flex items-center gap-3">
              <StatBadge icon={Activity} value={`${playerData.stats.health}/${playerData.stats.maxHealth}`} label="HP" color="text-red-500" />
              <StatBadge icon={Zap} value={`${playerData.stats.energy}/${playerData.stats.maxEnergy}`} label="NRG" color="text-yellow-400" />
              <StatBadge icon={Shield} value={playerData.stats.xp} label="XP" color="text-blue-400" />
            </div>
          )}
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
           {/* Grid Background Effect */}
           <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                style={{ 
                  backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
                  backgroundSize: '40px 40px'
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
