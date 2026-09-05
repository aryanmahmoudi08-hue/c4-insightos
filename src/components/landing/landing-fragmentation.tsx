import {
  Calendar,
  MessageSquare,
  Phone,
  Video,
  CreditCard,
  FileSpreadsheet,
  Users,
  ArrowRight,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { StaggerGroup, StaggerItem } from "@/components/landing/reveal";

const FRAGMENTS = [
  { icon: MessageSquare, label: "DMs & outreach" },
  { icon: Phone, label: "Calling systems" },
  { icon: Calendar, label: "Calendars & bookings" },
  { icon: Video, label: "Content & video platforms" },
  { icon: CreditCard, label: "Payment systems" },
  { icon: FileSpreadsheet, label: "Spreadsheets & reports" },
];

export function LandingFragmentation() {
  return (
    <section className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="The problem"
          title="Everything important. Scattered across a dozen tools."
          description="Content lives in one place. Leads in another. Calls in a dialer. Payments in a processor. Team performance in a spreadsheet someone updates on Fridays. No single view of what's actually happening in the business."
        />
        <StaggerGroup className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3">
          {FRAGMENTS.map(({ icon: Icon, label }) => (
            <StaggerItem key={label}>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3.5">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm text-foreground/90">{label}</span>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
        <div className="mt-10 flex items-center justify-center gap-3 text-center">
          <div className="hidden h-px w-16 bg-border sm:block" />
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Users className="h-4 w-4 text-accent" />
            One operating system connects the picture
            <ArrowRight className="h-4 w-4 text-accent" />
          </div>
          <div className="hidden h-px w-16 bg-border sm:block" />
        </div>
      </div>
    </section>
  );
}
