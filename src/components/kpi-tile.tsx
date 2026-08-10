import { cn } from "@/lib/utils";

type Tone = "default" | "header" | "money" | "rate";

export function KpiTile({ label, value, tone = "default", hint }: { label: string; value: string | number; tone?: Tone; hint?: string }) {
  return (
    <div className="hover-lift rounded-md border border-border bg-card overflow-hidden flex flex-col">
      <div className={cn(
        "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-center border-b border-border",
        tone === "money" && "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
        tone === "rate" && "bg-accent/10 text-accent",
        tone === "header" && "bg-primary/15 text-primary",
        tone === "default" && "bg-muted/40 text-muted-foreground",
      )}>{label}</div>
      <div className="flex-1 grid place-items-center px-3 py-3 min-h-[60px]">
        <div className="font-mono text-xl font-bold tabular-nums">{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

export function DashboardBar({ title, accent = "primary" }: { title: string; accent?: "primary" | "accent" | "destructive" }) {
  const map = { primary: "from-primary to-primary/70", accent: "from-accent to-accent/70", destructive: "from-destructive to-destructive/70" };
  return (
    <div className={cn("rounded-md bg-gradient-to-r px-4 py-2.5 text-center", map[accent])}>
      <h2 className="text-base font-bold tracking-wide text-primary-foreground">{title}</h2>
    </div>
  );
}
