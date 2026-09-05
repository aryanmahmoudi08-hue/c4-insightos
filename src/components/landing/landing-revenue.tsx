import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp } from "@/components/landing/reveal";
import { MetricCard } from "@/components/metric-card";

const ROWS = [
  { label: "Contracted", value: "—" },
  { label: "Collected", value: "—" },
  { label: "Forecasted", value: "—" },
  { label: "At Risk", value: "—" },
];

export function LandingRevenue() {
  return (
    <section className="border-t border-border bg-muted/20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <SectionHeading
            eyebrow="Revenue & cash"
            title="Revenue and cash are not the same number."
            description="C4 OS keeps contracted value, collected cash, forecasted pace, and at-risk balance visibly separate — so a strong revenue month never quietly hides a collections problem."
          />
          <FadeUp delay={0.1} amount={0.3}>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="eyebrow">Cash health</div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MetricCard label="Cash Collected" value="—" spectrum="hot" />
                <MetricCard label="Revenue Generated" value="—" spectrum="hot" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-border/70 bg-background/40 p-2.5"
                  >
                    <div className="text-3xs uppercase tracking-[0.12em] text-muted-foreground">
                      {row.label}
                    </div>
                    <div className="mt-1 font-mono text-sm">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
