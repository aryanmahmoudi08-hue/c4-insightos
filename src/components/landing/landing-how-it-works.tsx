import { SectionHeading } from "@/components/landing/section-heading";
import { StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const STEPS = [
  {
    n: "01",
    title: "Connect your operating data",
    detail:
      "Bring in leads, calls, content, payments, and team activity as they already flow through the business.",
  },
  {
    n: "02",
    title: "See the business in one place",
    detail:
      "Marketing, sales, revenue, and retention sit on one operating picture instead of a dozen disconnected tools.",
  },
  {
    n: "03",
    title: "Identify what needs attention",
    detail:
      "Operating intelligence surfaces what's off-pace, what's at risk, and why — before it becomes a bigger problem.",
  },
  {
    n: "04",
    title: "Take action and track the result",
    detail:
      "Every drilldown opens the real underlying records, so the next move is grounded in the actual data.",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border bg-muted/20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="How it works"
          title="Built to operate, not just to report."
        />
        <StaggerGroup className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <StaggerItem key={step.n}>
              <div className="h-full rounded-2xl border border-border bg-card p-6">
                <div className="display-serif text-3xl text-muted-foreground/40">{step.n}</div>
                <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
