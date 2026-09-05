import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

function FlowNode({
  label,
  spectrum = "mid",
  emphasis = false,
}: {
  label: string;
  spectrum?: "cold" | "mid" | "hot";
  emphasis?: boolean;
}) {
  const dot =
    spectrum === "cold"
      ? "bg-spectrum-cold"
      : spectrum === "hot"
        ? "bg-spectrum-hot"
        : "bg-spectrum-mid";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium",
        emphasis && "border-ring/40 shadow-sm",
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      {label}
    </div>
  );
}

function Connector() {
  return <ChevronDown className="my-1 h-4 w-4 text-muted-foreground/50" />;
}

function Row({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <FadeUp delay={delay} className="flex flex-col items-center" amount={0.3}>
      {children}
    </FadeUp>
  );
}

export function LandingLifecycle() {
  return (
    <section className="border-t border-border bg-muted/20 py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <SectionHeading
          align="center"
          eyebrow="One connected system"
          title="See the business as one system, not a funnel."
          description="Real businesses branch and merge — several sources feed the same lead, two teams share the same booked call, one outcome splits into retention or refund. C4 OS models the actual relationships, not a forced straight line."
        />

        <div className="mt-14 flex flex-col items-center">
          <Row>
            <FlowNode label="Content" spectrum="cold" />
          </Row>
          <Connector />
          <Row delay={0.05}>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <FlowNode label="Platform" spectrum="cold" />
              <span className="text-muted-foreground/50">→</span>
              <FlowNode label="Campaign" spectrum="cold" />
              <span className="text-muted-foreground/50">→</span>
              <FlowNode label="Lead" spectrum="cold" />
            </div>
          </Row>
          <Connector />
          <Row delay={0.1}>
            <FlowNode label="DM / Application" spectrum="mid" />
          </Row>
          <Connector />
          <Row delay={0.15}>
            <div className="flex items-center justify-center gap-8 sm:gap-16">
              <FlowNode label="Setter" spectrum="mid" />
              <FlowNode label="Dialer" spectrum="mid" />
            </div>
          </Row>
          <Connector />
          <Row delay={0.2}>
            <FlowNode label="Booked Call" spectrum="mid" emphasis />
          </Row>
          <Connector />
          <Row delay={0.25}>
            <FlowNode label="Closer" spectrum="mid" />
          </Row>
          <Connector />
          <Row delay={0.3}>
            <FlowNode label="Offer / Product" spectrum="hot" />
          </Row>
          <Connector />
          <Row delay={0.35}>
            <FlowNode label="Payment Plan" spectrum="hot" />
          </Row>
          <Connector />
          <Row delay={0.4}>
            <FlowNode label="Cash Collected" spectrum="hot" emphasis />
          </Row>
          <Connector />
          <Row delay={0.45}>
            <div className="flex items-center justify-center gap-8 sm:gap-16">
              <FlowNode label="Retention" spectrum="hot" />
              <FlowNode label="Refund" spectrum="hot" />
            </div>
          </Row>
          <Connector />
          <Row delay={0.5}>
            <FlowNode label="Renewal" spectrum="hot" emphasis />
          </Row>
        </div>
      </div>
    </section>
  );
}
