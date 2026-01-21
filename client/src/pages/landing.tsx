import { Button } from "@/components/ui/button";
import { Shield, Zap, Crosshair } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white font-body overflow-hidden relative selection:bg-primary selection:text-black">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-black to-black z-0" />
      <div className="absolute inset-0 z-0 opacity-20" 
           style={{ 
             backgroundImage: `linear-gradient(#00ff41 1px, transparent 1px), linear-gradient(90deg, #00ff41 1px, transparent 1px)`,
             backgroundSize: '50px 50px'
           }} 
      />

      <div className="relative z-10 container mx-auto px-4 h-screen flex flex-col justify-center items-center text-center">
        <div className="mb-8 animate-in fade-in zoom-in duration-1000">
          <div className="inline-block border border-primary/30 bg-primary/5 px-4 py-1 rounded mb-6 font-mono text-primary text-sm tracking-widest uppercase">
            System: Online // v2.0.4
          </div>
          <h1 className="text-6xl md:text-8xl font-display font-bold tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-[0_0_15px_rgba(0,255,65,0.5)]">
            KHAAOS<span className="text-primary">_OS</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto font-light">
            Advanced military economy interface. Manage assets. Execute trades. Dominate the market.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl w-full mb-12">
          <Feature icon={Shield} title="SECURE ASSETS" desc="Military-grade encryption for your digital wealth." />
          <Feature icon={Crosshair} title="LIVE MARKET" desc="Real-time trading and item acquisition." />
          <Feature icon={Zap} title="INSTANT OPS" desc="Rapid transaction processing and loan disbursement." />
        </div>

        <Button 
          size="lg" 
          className="h-14 px-10 text-lg bg-primary hover:bg-primary/90 text-black font-bold font-display tracking-widest shadow-[0_0_30px_-5px_rgba(0,255,65,0.6)] hover:shadow-[0_0_50px_-5px_rgba(0,255,65,0.8)] transition-all scale-100 hover:scale-105"
          onClick={() => window.location.href = "/api/login"}
        >
          INITIALIZE_SESSION
        </Button>
      </div>
      
      {/* Footer Decoration */}
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: any) {
  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded hover:border-primary/50 transition-colors group">
      <Icon className="w-10 h-10 text-primary mb-4 mx-auto group-hover:scale-110 transition-transform" />
      <h3 className="font-display font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground font-mono">{desc}</p>
    </div>
  );
}
