import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { useAuth } from "@/hooks/use-auth";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingFragmentation } from "@/components/landing/landing-fragmentation";
import { LandingCapabilities } from "@/components/landing/landing-capabilities";
import { LandingLifecycle } from "@/components/landing/landing-lifecycle";
import { LandingDecisionIntelligence } from "@/components/landing/landing-decision-intelligence";
import { LandingRevenue } from "@/components/landing/landing-revenue";
import { LandingSalesTeam } from "@/components/landing/landing-sales-team";
import { LandingAttribution } from "@/components/landing/landing-attribution";
import { LandingMenteeJourney } from "@/components/landing/landing-mentee-journey";
import { LandingProductPreview } from "@/components/landing/landing-product-preview";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingSecurity } from "@/components/landing/landing-security";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";
import { LandingFooter } from "@/components/landing/landing-footer";

export const Route = createFileRoute("/welcome")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "C4 OS — Run the business from one operating system" },
      {
        name: "description",
        content:
          "C4 OS connects marketing, leads, sales, revenue, team performance, client payments, retention, attribution, and video intelligence into one operating system.",
      },
      { property: "og:title", content: "C4 OS" },
      { name: "twitter:title", content: "C4 OS" },
      {
        property: "og:description",
        content:
          "Run the entire business from one operating system — marketing, sales, revenue, retention, and video intelligence, connected.",
      },
      {
        name: "twitter:description",
        content:
          "Run the entire business from one operating system — marketing, sales, revenue, retention, and video intelligence, connected.",
      },
    ],
  }),
});

function LandingPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  // Authenticated visitors are routed straight into the app; the landing
  // page itself never blocks on this so anonymous visitors — the common
  // case for a public marketing page — never see a loading flash.
  useEffect(() => {
    if (!loading && user) nav({ to: "/dashboard" });
  }, [loading, user, nav]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <main>
          <LandingHero />
          <LandingFragmentation />
          <LandingCapabilities />
          <LandingLifecycle />
          <LandingDecisionIntelligence />
          <LandingRevenue />
          <LandingSalesTeam />
          <LandingAttribution />
          <LandingMenteeJourney />
          <LandingProductPreview />
          <LandingHowItWorks />
          <LandingSecurity />
          <LandingFaq />
          <LandingCta />
        </main>
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
