import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_LABELS,
  isRepRole,
  toggleRole,
  type AppRole,
  type ManagedRole,
} from "@/lib/permissions";

/**
 * Pick one or more roles. DM setter, dialer and closer combine freely (a
 * closer who also dials); the other roles are one at a time. Used on the
 * public request-access form and on Team, for approving a request and for
 * changing a member's roles later.
 */
export function RolePicker({
  value,
  onChange,
  options,
  disabled,
  size = "md",
}: {
  value: readonly AppRole[];
  onChange: (next: AppRole[]) => void;
  options: readonly AppRole[];
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const reps = options.filter(isRepRole);
  const others = options.filter((r) => !isRepRole(r));
  const chip = (r: AppRole) => {
    const on = value.includes(r);
    return (
      <button
        key={r}
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(toggleRole(value, r))}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-7 px-2.5 text-2xs" : "h-8 px-3 text-xs",
          on
            ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/15 text-foreground"
            : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        {on && <Check className="h-3 w-3" />}
        {ROLE_LABELS[r as ManagedRole] ?? r}
      </button>
    );
  };
  return (
    <div className="space-y-2">
      {reps.length > 0 && (
        <div className="space-y-1">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Sales roles — pick any
          </div>
          <div className="flex flex-wrap gap-1.5">{reps.map(chip)}</div>
        </div>
      )}
      {others.length > 0 && (
        <div className="space-y-1">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            {reps.length ? "Or one of" : "Role"}
          </div>
          <div className="flex flex-wrap gap-1.5">{others.map(chip)}</div>
        </div>
      )}
    </div>
  );
}
