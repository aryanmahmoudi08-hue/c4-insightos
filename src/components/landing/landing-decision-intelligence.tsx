import { AlertTriangle, HelpCircle, User, ArrowRight, Gauge } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp, StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const QUESTIONS = [
  "What needs attention?",
  "Why is it happening?",
  "Who owns the next move?",
  "What is financially at stake?",
];

const FEATURES = [
  "AI Insights",
  "KPI pacing",
  "Cash health",
  "Funnel diagnostics",
  "Payment recovery",
  "Coaching reviews",
  "Attribution",
];

const CARD_ROWS = [
  {
    icon: AlertTriangle,
    label: "Attention",
    value: "Cash collection below target",
    tone: "text-spectrum-hot",
  },
  {
    icon: HelpCircle,
    label: "Why",
    value: "Outstanding payment-plan balance increased",
    tone: "text-muted-foreground",
  },
  {
    icon: User,
    label: "Owner",
    value: "Collections / account owner",
    tone: "text-muted-foreground",
  },
  {
    icon: ArrowRight,
    label: "Action",
    value: "Review overdue accounts",
    tone: "text-spectrum-mid",
  },
  { icon: Gauge, label: "Impact", value: "—", tone: "text-muted-foreground" },
];

export function LandingDecisionIntelligence() {
  return (
    <section id="intelligence" className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <SectionHeading
              eyebrow="Decision intelligence"
              title="C4 OS doesn't just report what happened."
              description="Dashboards tell you where the number landed. C4 OS is built to answer the questions that come right after — so attention goes to what actually matters, not everything at once."
            />
            <StaggerGroup className="mt-6 space-y-2.5">
              {QUESTIONS.map((q) => (
                <StaggerItem key={q}>
                  <div className="flex items-center gap-2.5 text-sm font-medium text-foreground/90">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {q}
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
            <div className="mt-6 flex flex-wrap gap-2">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          <FadeUp delay={0.1} amount={0.3}>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="eyebrow">Executive briefing</div>
                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Interface example
                </span>
              </div>
              <dl className="mt-4 space-y-3.5">
                {CARD_ROWS.map(({ icon: Icon, label, value, tone }) => (
                  <div key={label} className="flex items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                    <div className="min-w-0">
                      <dt className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-sm text-foreground/90">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
