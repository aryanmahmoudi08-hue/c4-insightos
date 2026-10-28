import { Input } from "@/components/ui/input";
import {
  CUSTOM_LABEL,
  presetRange,
  rangeKeyForLabel,
  type DateRange,
  type RangeKey,
} from "@/lib/date-range";

export type { DateRange } from "@/lib/date-range";

/**
 * Preset builders, kept on this module because several call sites already
 * import them from here. The dates themselves are computed in `lib/
 * date-range.ts` — a pure, tested module — because every one of these is a
 * claim about the *viewer's* calendar ("today", "this month") and the old
 * implementation built them with `toISOString()`, which is UTC. West of UTC
 * that made "Today" mean tomorrow for the whole evening, so clicking it
 * returned an empty page.
 */
export const RANGES = {
  today: (): DateRange => presetRange("today"),
  yesterday: (): DateRange => presetRange("yesterday"),
  last7: (): DateRange => presetRange("last7"),
  last30: (): DateRange => presetRange("last30"),
  mtd: (): DateRange => presetRange("mtd"),
  all: (): DateRange => presetRange("all"),
};

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7d" },
  { key: "last30", label: "30d" },
  { key: "mtd", label: "MTD" },
  { key: "all", label: "All" },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
}) {
  // Derived from the range itself rather than held in local state. As local
  // state it desynced constantly: it reset to false on every remount, so a
  // custom range came back with no chip lit and its two date inputs gone,
  // while the range driving the page was still custom.
  const activeKey = rangeKeyForLabel(value.label);
  const custom = value.label === CUSTOM_LABEL;

  const chip = (selected: boolean) =>
    `cursor-pointer rounded-full px-2.5 py-1 text-2xs font-medium transition-all ${
      selected
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/30 p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activeKey === p.key}
            onClick={() => onChange(presetRange(p.key))}
            className={chip(activeKey === p.key)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          // Switching to Custom commits a real range immediately, seeded with
          // the dates already on screen. Previously it only flipped a local
          // flag, so the page kept querying the old preset's dates while the
          // control claimed to be custom.
          onClick={() => onChange({ from: value.from, to: value.to, label: CUSTOM_LABEL })}
          className={chip(custom)}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">From</span>
          <Input
            type="date"
            // Controlled, not defaultValue: an uncontrolled input kept
            // whatever was first rendered into it and silently ignored the
            // range changing underneath it.
            value={value.from}
            max={value.to}
            className="h-7 w-36 text-xs"
            onChange={(e) =>
              e.target.value && onChange({ ...value, from: e.target.value, label: CUSTOM_LABEL })
            }
          />
          <span className="text-muted-foreground">To</span>
          <Input
            type="date"
            value={value.to}
            min={value.from}
            className="h-7 w-36 text-xs"
            onChange={(e) =>
              e.target.value && onChange({ ...value, to: e.target.value, label: CUSTOM_LABEL })
            }
          />
        </div>
      )}
      <span className="font-sans text-2xs tabular-nums text-muted-foreground">
        {value.from} → {value.to}
      </span>
    </div>
  );
}
