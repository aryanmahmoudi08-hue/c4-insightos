import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp, StaggerGroup, StaggerItem } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const CHAIN = [
  "Platform",
  "Placement / Format",
  "Campaign / Content",
  "Capture Mechanism",
  "Setter / Dialer",
  "Booked Call",
  "Closer",
  "Offer",
  "Payment Plan",
  "Cash",
  "Retention / Refund",
];

const MODELS = ["First touch", "Lead source", "Booking source", "Last touch", "Assisted touch"];

const CONFIDENCE = [
  { label: "Direct", className: "border-spectrum-hot/40 bg-spectrum-hot/10 text-spectrum-hot" },
  { label: "Partial", className: "border-spectrum-mid/40 bg-spectrum-mid/10 text-spectrum-mid" },
  { label: "Inferred", className: "border-dashed border-border text-muted-foreground" },
  { label: "Unavailable", className: "border-border bg-muted/20 text-muted-foreground/60" },
];

export function LandingAttribution() {
  return (
    <section className="border-t border-border bg-muted/20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="Attribution"
          title="Where did the money actually come from?"
          description="C4 OS traces cash back through the full chain it came from — never a single guessed touchpoint."
        />

        <FadeUp amount={0.2} className="mt-12">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-y-3 gap-x-1.5 sm:gap-x-2">
            {CHAIN.map((step, i) => (
              <div key={step} className="flex items-center gap-1.5 sm:gap-2">
                {i > 0 && <span className="text-muted-foreground/40">→</span>}
                <div className="whitespace-nowrap rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium sm:text-sm">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </FadeUp>

        <div className="mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-2">
          <FadeUp delay={0.05} amount={0.3}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Attribution perspectives
            </div>
            <StaggerGroup className="mt-3 flex flex-wrap gap-2">
              {MODELS.map((model) => (
                <StaggerItem key={model}>
                  <span className="rounded-full border border-border bg-card px-3 py-1.5 text-sm">
                    {model}
                  </span>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </FadeUp>
          <FadeUp delay={0.1} amount={0.3}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Confidence, shown honestly
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {CONFIDENCE.map(({ label, className }) => (
                <span
                  key={label}
                  className={cn("rounded-full border px-3 py-1.5 text-sm", className)}
                >
                  {label}
                </span>
              ))}
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
