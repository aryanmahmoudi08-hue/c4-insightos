import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";
import { MECHANISMS, type MechanismKey } from "@/lib/content-mechanisms";
import { pctDelta } from "@/lib/trend";

export interface ObjectionEntry {
  key: string;
  label: string;
  count: number;
  /** Omit when there's no prior-period count for this exact objection text — no trend to show, not a flat one. */
  prevCount?: number;
  /** Omit entirely (not 0) when resolved-on-call isn't tracked on this page. */
  resolvedPct?: number;
  /** Keyword-inferred, not stored ground truth — always rendered with an "(inferred)" label. */
  mechanism: MechanismKey | null;
}

export interface FaqVideoLite {
  id: string;
  title: string;
  mechanism: MechanismKey | null;
}

/** Rising objections read hot (leading indicator, worth acting on), falling read cold, everything else (including no prior baseline) reads mid. */
function trendSpectrum(deltaPct: number | undefined): SpectrumPosition {
  if (deltaPct === undefined) return "mid";
  if (deltaPct > 10) return "hot";
  if (deltaPct < -10) return "cold";
  return "mid";
}

/**
 * The shared objection-frequency instrument for DM Setter, Inbound Dialer, and
 * Closer — one component, capability-gated per page (resolved-rate only where
 * it's actually tracked) rather than three divergent implementations or a
 * faked parity. Bars are colored by period-over-period trend (a rising
 * objection is a leading indicator), click a bar to see its inferred
 * mechanism and any FAQ content that addresses it.
 */
export function ObjectionInstrument({
  title, entries, totalLogged, resolvedTracked, resolvedGapNote, faqVideos, emptyLabel,
}: {
  title: string;
  entries: ObjectionEntry[];
  totalLogged: number;
  resolvedTracked: boolean;
  resolvedGapNote?: string;
  faqVideos: FaqVideoLite[];
  emptyLabel: string;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const data = entries.map((e) => {
    const deltaPct = e.prevCount !== undefined ? pctDelta(e.count, e.prevCount) : undefined;
    return { ...e, deltaPct, spectrum: trendSpectrum(deltaPct) };
  });
  const selected = data.find((d) => d.key === selectedKey) ?? null;
  const matchingFaqs = selected?.mechanism ? faqVideos.filter((f) => f.mechanism === selected.mechanism) : [];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">
          n={totalLogged} objections logged in range{!resolvedTracked ? " · resolved-rate not tracked here" : ""}
        </div>
      </div>
      {data.length === 0 ? (
        <>
          <div className="p-10 text-center text-sm text-muted-foreground">{emptyLabel}</div>
          {!resolvedTracked && resolvedGapNote && (
            <div className="text-2xs italic text-muted-foreground">{resolvedGapNote}</div>
          )}
        </>
      ) : (
        <>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="label" stroke="var(--muted-foreground)" fontSize={11} width={140} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-md)" }}
                  formatter={(_v: number, _n: string, p: { payload?: (typeof data)[number] }) => {
                    const d = p.payload;
                    if (!d) return ["", "Objection"];
                    const parts = [`${d.count} logged`];
                    if (d.resolvedPct !== undefined) parts.push(`${d.resolvedPct}% resolved`);
                    if (d.deltaPct !== undefined) parts.push(`${d.deltaPct > 0 ? "+" : ""}${d.deltaPct.toFixed(0)}% vs prior period`);
                    if (d.mechanism) parts.push(`${MECHANISMS[d.mechanism].label} (inferred)`);
                    return [parts.join(" · "), "Objection"];
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(d: { key: string }) => setSelectedKey((cur) => (cur === d.key ? null : d.key))}
                  isAnimationActive={false}
                >
                  {data.map((d, i) => <Cell key={i} fill={SPECTRUM_VAR[d.spectrum]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {!resolvedTracked && resolvedGapNote && (
            <div className="mt-2 text-2xs italic text-muted-foreground">{resolvedGapNote}</div>
          )}
          {selected && (
            <div className="mt-3 space-y-1.5 rounded-md border border-border/60 bg-muted/10 p-3 text-xs">
              <div className="font-medium">{selected.label}</div>
              {selected.mechanism ? (
                <div className="text-muted-foreground">
                  Mechanism: <span className="text-foreground">{MECHANISMS[selected.mechanism].label}</span>
                  <span className="italic"> (inferred)</span>
                  {" · "}
                  <a href={`/content-signals?mechanism=${selected.mechanism}`} className="text-primary hover:underline">View in Content Signals</a>
                </div>
              ) : (
                <div className="text-muted-foreground">No mechanism signal detected in this objection's text yet.</div>
              )}
              {selected.mechanism && (
                matchingFaqs.length > 0 ? (
                  <div className="text-muted-foreground">
                    Content that addresses this mechanism:{" "}
                    {matchingFaqs.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && ", "}
                        <a href={`/vsl?faq=${f.id}`} className="text-primary hover:underline">{f.title}</a>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No FAQ video tagged with this mechanism yet.</div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
