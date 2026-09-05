import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SectionHeading } from "@/components/landing/section-heading";
import { FadeUp } from "@/components/landing/reveal";

const FAQS = [
  {
    q: "What is C4 OS?",
    a: "C4 OS is an operating system for the business itself — connecting marketing, sales, revenue, retention, and video/webinar intelligence into one operating picture, with role-based access for every team member.",
  },
  {
    q: "Who is C4 OS built for?",
    a: "High-ticket coaching and info-product businesses running a sales team (setters, dialers, closers), content/marketing, and a mentee or client base with ongoing payment plans.",
  },
  {
    q: "What does C4 OS track?",
    a: "Leads, calls, content performance, attribution, cash collection and revenue, payment plans and renewals, video/webinar engagement, and team KPI pacing.",
  },
  {
    q: "Does C4 OS replace my CRM?",
    a: "C4 OS is the operating layer on top of your existing data — it connects and interprets what's already being tracked rather than replacing every underlying tool.",
  },
  {
    q: "How does attribution work?",
    a: "C4 OS traces cash back through the full chain — platform, campaign, capture, setter/dialer, booked call, closer, offer, and payment — and supports several attribution perspectives (first touch, lead source, booking source, last touch, assisted touch). Confidence is always shown honestly: direct, partial, inferred, or unavailable.",
  },
  {
    q: "Can different team members have different access?",
    a: "Yes. Access is role-based (admin, sales manager, growth/ops, setter, closer, viewer), with per-person overrides available on top of role defaults.",
  },
  {
    q: "How does C4 OS handle payment plans?",
    a: "Payment plans, scheduled payments, and collections are tracked against contracted, collected, and forecasted value — kept visibly separate rather than blended into one revenue number.",
  },
  {
    q: "Does C4 OS track sales-team performance?",
    a: "Yes — DM setters, inbound dialers, and closers are each tracked on the metrics relevant to their role, including coaching reviews and no-show recovery.",
  },
  {
    q: "Does it connect marketing activity to revenue?",
    a: "Yes. Content performance, traffic, and campaign attribution connect through to the cash they produced, where a verified path exists.",
  },
  {
    q: "What happens if a data source is not connected?",
    a: 'C4 OS shows an honest "unavailable" or "not connected" state rather than estimating or fabricating a number — you always know what\'s real and what isn\'t yet wired in.',
  },
];

export function LandingFaq() {
  return (
    <section id="faq" className="border-t border-border py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <SectionHeading align="center" eyebrow="FAQ" title="Common questions" />
        <FadeUp delay={0.1} amount={0.1} className="mt-10">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map(({ q, a }, i) => (
              <AccordionItem key={q} value={`item-${i}`}>
                <AccordionTrigger className="text-base">{q}</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeUp>
      </div>
    </section>
  );
}
