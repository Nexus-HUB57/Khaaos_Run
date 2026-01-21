import { cn } from "@/lib/utils";

interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  variant?: "default" | "alert";
  glitch?: boolean;
}

export function CyberCard({ 
  children, 
  className, 
  title, 
  subtitle, 
  footer, 
  variant = "default",
  glitch = false,
  ...props 
}: CyberCardProps) {
  return (
    <div 
      className={cn(
        "relative bg-card/60 backdrop-blur-md border border-border group overflow-hidden transition-all duration-300",
        variant === "alert" && "border-destructive/50 bg-destructive/5",
        "hover:border-primary/50 hover:shadow-[0_0_15px_-5px_rgba(0,255,65,0.2)]",
        className
      )}
      {...props}
    >
      {/* Corner Accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-primary/50" />
      <div className="absolute top-0 right-0 w-2 h-2 border-r border-t border-primary/50" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-l border-b border-primary/50" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-primary/50" />

      {/* Header */}
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-border/50 bg-black/20 flex justify-between items-start">
          <div>
            {title && (
              <h3 className={cn(
                "font-display text-lg font-bold tracking-widest uppercase",
                variant === "alert" ? "text-destructive" : "text-primary"
              )}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {subtitle}
              </p>
            )}
          </div>
          {/* Decorative bits */}
          <div className="flex gap-1">
             <div className="w-1 h-1 bg-current opacity-50 rounded-full" />
             <div className="w-1 h-1 bg-current opacity-30 rounded-full" />
             <div className="w-1 h-1 bg-current opacity-10 rounded-full" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-3 border-t border-border/50 bg-black/20 text-xs font-mono text-muted-foreground flex justify-between items-center">
          {footer}
        </div>
      )}
      
      {/* Scanline Effect on Hover */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[linear-gradient(transparent_0%,rgba(0,255,65,0.05)_50%,transparent_100%)] bg-[length:100%_4px]" />
    </div>
  );
}
