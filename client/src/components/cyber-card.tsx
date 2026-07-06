import { cn } from "@/lib/utils";

interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  variant?: "default" | "alert" | "gold";
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
  const accentColor =
    variant === "alert"
      ? "border-destructive/40 bg-destructive/5"
      : variant === "gold"
      ? "border-accent/40 bg-accent/5"
      : "border-border bg-card/60";

  const titleColor =
    variant === "alert"
      ? "text-destructive"
      : variant === "gold"
      ? "text-accent"
      : "text-primary";

  const cornerColor =
    variant === "alert"
      ? "border-destructive/50"
      : variant === "gold"
      ? "border-accent/60"
      : "border-primary/40";

  const hoverGlow =
    variant === "alert"
      ? "hover:border-destructive/70 hover:shadow-[0_0_20px_-5px_hsla(0,80%,55%,0.25)]"
      : variant === "gold"
      ? "hover:border-accent/70 hover:shadow-[0_0_20px_-5px_hsla(45,90%,55%,0.25)]"
      : "hover:border-primary/60 hover:shadow-[0_0_20px_-5px_hsla(25,95%,55%,0.2)]";

  return (
    <div
      className={cn(
        "relative backdrop-blur-md border group overflow-hidden transition-all duration-300",
        accentColor,
        hoverGlow,
        className
      )}
      {...props}
    >
      {/* Corner Accents */}
      <div className={cn("absolute top-0 left-0 w-3 h-3 border-l-2 border-t-2", cornerColor)} />
      <div className={cn("absolute top-0 right-0 w-3 h-3 border-r-2 border-t-2", cornerColor)} />
      <div className={cn("absolute bottom-0 left-0 w-3 h-3 border-l-2 border-b-2", cornerColor)} />
      <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2", cornerColor)} />

      {/* Header */}
      {(title || subtitle) && (
        <div className="px-6 py-4 border-b border-border/40 bg-black/25 flex justify-between items-start">
          <div>
            {title && (
              <h3 className={cn("font-display text-base font-bold tracking-widest uppercase", titleColor)}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5 tracking-widest uppercase">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex gap-1 mt-1">
            <div className={cn("w-1.5 h-1.5 rounded-full opacity-60", variant === "gold" ? "bg-accent" : "bg-primary")} />
            <div className={cn("w-1.5 h-1.5 rounded-full opacity-30", variant === "gold" ? "bg-accent" : "bg-primary")} />
            <div className={cn("w-1.5 h-1.5 rounded-full opacity-10", variant === "gold" ? "bg-accent" : "bg-primary")} />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6">{children}</div>

      {/* Footer */}
      {footer && (
        <div className="px-6 py-3 border-t border-border/40 bg-black/20 text-xs font-mono text-muted-foreground flex justify-between items-center">
          {footer}
        </div>
      )}

      {/* Ember Scanline on Hover */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-[linear-gradient(transparent_0%,rgba(200,80,10,0.04)_50%,transparent_100%)] bg-[length:100%_6px]" />
    </div>
  );
}
