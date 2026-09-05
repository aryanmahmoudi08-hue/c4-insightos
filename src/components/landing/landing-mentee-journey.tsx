import { ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp, StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const JOURNEY = [
  "Mentee",
  "Payment Plan",
  "Scheduled Payments",
  "Cash Collected",
  "Client Health",
  "Renewal",
];

const LTV = [
  { label: "Contracted LTV", detail: "Total value under contract" },
  { label: "Collected LTV", detail: "What has actually been paid" },
  { label: "Forecasted LTV", detail: "What's scheduled to land next" },
];

export function LandingMenteeJourney() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Mentees & renewals"
          title="The client journey doesn't end at the close."
          description="C4 OS follows the mentee relationship all the way through payment plans, health, and renewal — with contracted, collected, and forecasted value always kept distinct."
        />

        <FadeUp amount={0.2} className="mt-12">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2">
            {JOURNEY.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                {i > 0 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
                <div className="whitespace-nowrap rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </FadeUp>

        <StaggerGroup className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
          {LTV.map(({ label, detail }) => (
            <StaggerItem key={label}>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </div>
                <div className="mt-2 font-mono text-2xl">—</div>
                <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
