import { ShieldCheck, Users, KeyRound, Database } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const POINTS = [
  {
    icon: KeyRound,
    title: "Authenticated access",
    detail: "Every workspace requires a real sign-in — no public data access.",
  },
  {
    icon: Users,
    title: "Role-based permissions",
    detail:
      "Admin, sales manager, growth/ops, setter, closer, and viewer roles each see what their role is meant to see.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled team access",
    detail:
      "Per-person overrides sit on top of role defaults, so access can be adjusted person by person.",
  },
  {
    icon: Database,
    title: "Organization-level isolation",
    detail:
      "Every record is scoped to its workspace, with row-level security enforced at the database.",
  },
];

export function LandingSecurity() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="Access & security"
          title="Controlled access, by design."
        />
        <StaggerGroup className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {POINTS.map(({ icon: Icon, title, detail }) => (
            <StaggerItem key={title}>
              <div className="h-full rounded-2xl border border-border bg-card p-6">
                <Icon className="h-5 w-5 text-accent" />
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
