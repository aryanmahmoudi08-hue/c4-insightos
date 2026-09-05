import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { FunnelInstrument } from "@/components/funnel-instrument";
import type { FunnelStage } from "@/lib/funnel-derivation";

const HERO_STAGES: FunnelStage[] = [
  { key: "booked", label: "Calls booked", value: 0, spectrum: "cold" },
  { key: "showed", label: "Showed", value: 0, spectrum: "mid" },
  { key: "closed", label: "Closed", value: 0, spectrum: "hot" },
];

export function LandingHero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,oklch(0.62_0.24_295/8%),transparent_55%),radial-gradient(circle_at_85%_10%,oklch(0.78_0.14_230/6%),transparent_50%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="eyebrow inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <Sparkles className="h-3 w-3 text-accent" />
            C4 OS · Operating System
          </div>
          <h1 className="display-serif mt-5 text-4xl leading-[1.05] sm:text-5xl md:text-6xl">
            Run the entire business
            <br />
            from one operating system.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            C4 OS connects marketing, leads, sales, revenue, team performance, client payments,
            retention, attribution, and video intelligence into a single operating picture — so you
            always know what happened, what needs attention, and what to do next.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">
                Access C4 OS
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-black/5 md:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="eyebrow">Main Hub</div>
                <div className="display-serif mt-0.5 text-lg">Executive Command Center</div>
              </div>
              <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Illustrative preview
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MetricCard label="Cash Collected" value="—" spectrum="hot" />
              <MetricCard label="Revenue Generated" value="—" spectrum="hot" />
              <MetricCard label="Show Rate" value="—" spectrum="mid" />
              <MetricCard label="Close Rate" value="—" spectrum="hot" />
            </div>
            <div className="mt-3">
              <FunnelInstrument title="Booked → Closed" stages={HERO_STAGES} />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
