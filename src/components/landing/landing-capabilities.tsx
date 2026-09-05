import { CircleDollarSign, PhoneCall, Radar, BadgeCheck, Video, Users } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const CAPABILITIES = [
  {
    icon: CircleDollarSign,
    title: "Revenue Command Center",
    items: ["Cash collected vs. revenue generated", "Month-end pace & forecasting", "Cash at risk"],
  },
  {
    icon: PhoneCall,
    title: "Sales Intelligence",
    items: [
      "DM setters & inbound dialers",
      "Closer pipeline & disposition mix",
      "Coaching & no-show recovery",
    ],
  },
  {
    icon: Radar,
    title: "Marketing & Attribution",
    items: ["Content performance & reach", "Traffic & source attribution", "Content-to-cash paths"],
  },
  {
    icon: BadgeCheck,
    title: "Mentees & Renewals",
    items: ["Payment plans & collections", "Renewal pipeline", "Mentee health & retention"],
  },
  {
    icon: Video,
    title: "Video & Webinar Intelligence",
    items: ["VSL & Wistia engagement", "Webinar acquisition & conversion", "Video-to-revenue"],
  },
  {
    icon: Users,
    title: "Team Operations",
    items: ["KPI targets & pacing", "EOD reporting", "Team calendars"],
  },
];

export function LandingCapabilities() {
  return (
    <section id="platform" className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Platform"
          title="Every part of the operation, in one system."
          description="C4 OS is built from the real modules operators use every day — not a generic CRM with a dashboard bolted on."
        />
        <StaggerGroup className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, items }) => (
            <StaggerItem key={title}>
              <div className="group h-full rounded-2xl border border-border bg-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-ring/40">
                <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-muted/40 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <ul className="mt-3 space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
