import { MessageSquare, PhoneIncoming, PhoneCall, ArrowRight } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const ROLES = [
  {
    icon: MessageSquare,
    title: "DM Setter",
    steps: ["Outreach", "Qualified conversations", "Booked calls"],
  },
  {
    icon: PhoneIncoming,
    title: "Inbound Dialer",
    steps: ["Speed-to-lead", "Connections", "Booked calls"],
  },
  {
    icon: PhoneCall,
    title: "Closer",
    steps: ["Shows", "Offers", "Closes → Cash"],
  },
];

export function LandingSalesTeam() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Sales organization"
          title="Track the sales team the way it actually works."
          description="Every role tracked on its own real metrics — not one generic rep leaderboard. Coaching reviews and no-show recovery are part of the same system, not a separate spreadsheet."
        />
        <StaggerGroup className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {ROLES.map(({ icon: Icon, title, steps }) => (
            <StaggerItem key={title}>
              <div className="h-full rounded-2xl border border-border bg-card p-6">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-muted/40 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <div className="mt-4 space-y-2">
                  {steps.map((step, i) => (
                    <div
                      key={step}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      {i > 0 && (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground">
          <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
            Coaching reviews
          </span>
          <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
            No-show recovery
          </span>
          <span className="rounded-full border border-border bg-muted/30 px-3 py-1">
            Disposition tracking
          </span>
        </div>
      </div>
    </section>
  );
}
