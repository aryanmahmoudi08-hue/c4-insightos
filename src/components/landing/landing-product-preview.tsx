import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp } from "@/components/landing/reveal";
import { MetricCard } from "@/components/metric-card";

type Preview = { value: string; label: string; spectrum: "cold" | "mid" | "hot" };

const PANELS: Record<string, { title: string; metrics: Preview[] }> = {
  hub: {
    title: "Main Hub",
    metrics: [
      { value: "Cash Collected", label: "cash", spectrum: "hot" },
      { value: "Total Views", label: "reach", spectrum: "cold" },
      { value: "Show Rate", label: "rate", spectrum: "mid" },
      { value: "Active Clients", label: "clients", spectrum: "hot" },
    ],
  },
  sales: {
    title: "Sales",
    metrics: [
      { value: "Calls Booked", label: "booked", spectrum: "cold" },
      { value: "Showed", label: "showed", spectrum: "mid" },
      { value: "Closes", label: "closed", spectrum: "hot" },
      { value: "Close Rate", label: "rate", spectrum: "hot" },
    ],
  },
  revenue: {
    title: "Revenue",
    metrics: [
      { value: "Contracted", label: "contract", spectrum: "hot" },
      { value: "Collected", label: "collected", spectrum: "hot" },
      { value: "Forecasted", label: "forecast", spectrum: "mid" },
      { value: "At Risk", label: "risk", spectrum: "cold" },
    ],
  },
  mentees: {
    title: "Mentees",
    metrics: [
      { value: "Active Mentees", label: "active", spectrum: "cold" },
      { value: "Renewals <30d", label: "renewals", spectrum: "mid" },
      { value: "At-Risk", label: "risk", spectrum: "hot" },
      { value: "Collected MTD", label: "collected", spectrum: "hot" },
    ],
  },
  content: {
    title: "Content",
    metrics: [
      { value: "Total Views", label: "views", spectrum: "cold" },
      { value: "Engagement Rate", label: "engagement", spectrum: "mid" },
      { value: "Cash Attributed", label: "cash", spectrum: "hot" },
      { value: "Leads", label: "leads", spectrum: "cold" },
    ],
  },
  vsl: {
    title: "VSL",
    metrics: [
      { value: "Total Plays", label: "plays", spectrum: "cold" },
      { value: "Avg % Watched", label: "watched", spectrum: "mid" },
      { value: "Play Rate", label: "rate", spectrum: "mid" },
      { value: "Unique Viewers", label: "viewers", spectrum: "cold" },
    ],
  },
  webinar: {
    title: "Webinar",
    metrics: [
      { value: "Registrants", label: "registered", spectrum: "cold" },
      { value: "Show-up Rate", label: "showup", spectrum: "mid" },
      { value: "Revenue", label: "revenue", spectrum: "hot" },
      { value: "ROAS", label: "roas", spectrum: "hot" },
    ],
  },
};

export function LandingProductPreview() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="Inside C4 OS"
          title="One system, every module."
          description="Representative previews of the real modules inside C4 OS."
        />

        <FadeUp amount={0.15} className="mt-10">
          <Tabs defaultValue="hub">
            <TabsList className="mx-auto flex h-auto flex-wrap justify-center gap-1.5 bg-transparent p-0">
              {Object.entries(PANELS).map(([key, panel]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="rounded-full border border-border bg-card px-4 py-1.5 text-sm data-[state=active]:border-ring/50 data-[state=active]:bg-accent/10 data-[state=active]:text-accent"
                >
                  {panel.title}
                </TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(PANELS).map(([key, panel]) => (
              <TabsContent key={key} value={key} className="mt-6">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="eyebrow">{panel.title}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {panel.metrics.map((metric) => (
                      <MetricCard
                        key={metric.value}
                        label={metric.value}
                        value="—"
                        spectrum={metric.spectrum}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </FadeUp>
      </div>
    </section>
  );
}
