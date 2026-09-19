import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Shared shadcn Select treatment for a labeled "All {label}" filter —
 * consistent sizing/spacing/hover/focus everywhere a taxonomy filter (platform,
 * format, funnel stage, acquisition source, setter/dialer, closer, ...) shows
 * up, instead of three near-identical local copies (this used to be
 * duplicated verbatim as `TrafficSelect` in traffic.tsx and
 * `TaxonomyFilterSelect` in content-command-center.tsx).
 */
export function TaxonomySelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-8 w-auto min-w-[9rem] gap-1.5 rounded-md border-border bg-background px-2 text-xs capitalize text-foreground"
      >
        <SelectValue placeholder={`All ${label}`} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="capitalize">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
