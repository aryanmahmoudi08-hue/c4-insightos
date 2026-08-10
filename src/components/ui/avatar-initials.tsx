import { cn } from "@/lib/utils";

const PALETTE = [
  "oklch(0.72 0.14 152)", "oklch(0.7 0.16 258)", "oklch(0.75 0.15 78)",
  "oklch(0.72 0.16 25)", "oklch(0.72 0.13 300)", "oklch(0.72 0.14 200)",
];

function hashHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic initials avatar — no photo storage in this app, so every "avatar" is derived from the name. */
export function AvatarInitials({ name, size = "md", className }: { name: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const dims = { xs: "h-5 w-5 text-[9px]", sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  const color = hashHue(name || "?");
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-inset ring-white/10", dims, className)}
      style={{ background: `color-mix(in oklch, ${color} 22%, var(--muted))`, color }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
