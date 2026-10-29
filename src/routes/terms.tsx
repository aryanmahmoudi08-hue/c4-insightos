import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: TermsOfService,
  head: () => ({
    meta: [
      { title: "Terms of Service | AscendOS" },
      {
        name: "description",
        content: "The terms you agree to when you use AscendOS.",
      },
    ],
  }),
});

/**
 * DRAFT — not reviewed by a lawyer.
 *
 * Deliberately short and plain. The clauses that actually need a commercial or
 * legal decision — entity, governing law, liability cap, what happens to data
 * on termination — are marked [TO CONFIRM] rather than filled with a number
 * someone would later discover nobody had agreed to.
 */
function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" updated="29 October 2026">
      <p>
        These terms cover your use of AscendOS, operated by <b>[TO CONFIRM: legal entity name]</b>{" "}
        {"("}&ldquo;we&rdquo;{")"}. Using the platform means you accept them. If you are agreeing on
        behalf of a company, you confirm you are allowed to bind it.
      </p>

      <LegalSection heading="Getting access">
        <p>
          AscendOS is not open to the public. You reach a workspace in one of two ways: an
          administrator adds you, or you request access and an administrator approves it. They
          decide your role, and your role decides what you can see and change. An administrator can
          revoke your access at any time, and we will act on their instruction without asking you
          first — the workspace, not the individual user, is our customer.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          Keep your credentials to yourself and do not share a login. You are responsible for what
          happens under your account. Tell us promptly if you think someone else has got into it.
        </p>
        <p>
          Give accurate details when you ask for access. The platform attributes performance,
          payouts and commission to named people, so a wrong or borrowed identity corrupts
          somebody&rsquo;s record.
        </p>
      </LegalSection>

      <LegalSection heading="Using it properly">
        <p>Do not:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>try to reach data belonging to a workspace you are not a member of;</li>
          <li>
            upload material you have no right to, or personal data you have no lawful basis to hold;
          </li>
          <li>
            use it to send unlawful messages, or to contact people who have asked you to stop;
          </li>
          <li>probe, scrape or overload the service, or work around its access controls;</li>
          <li>resell or white-label it without our written agreement.</li>
        </ul>
        <p>
          If you connect an outside system, you confirm you are entitled to connect it and to move
          that data into AscendOS.
        </p>
      </LegalSection>

      <LegalSection heading="Who owns what">
        <p>
          <b>Your data stays yours.</b> Leads, calls, payments, content and client records belong to
          the workspace that put them there. You grant us only the permission needed to host,
          process and display that data back to you, and to keep backups.
        </p>
        <p>
          <b>The platform stays ours.</b> The software, interface and underlying systems remain our
          property. Nothing here transfers ownership of them.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          Connecting Stripe, Calendly, Close, Twilio, Google or any other provider means also
          accepting their terms. We are not responsible for what those services do, for their
          availability, or for charges they bill you. If one of them changes or withdraws an API,
          the related feature may stop working.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          We aim to keep AscendOS running and will give notice of planned maintenance where we can,
          but the service is provided <b>as is</b>, without a guaranteed uptime commitment unless we
          have agreed one with you in writing. Features may change as the product develops.{" "}
          <b>[TO CONFIRM: whether any customer has a contractual SLA that overrides this]</b>
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          To the extent the law allows, we are not liable for lost profits, lost revenue, lost data
          or indirect losses.{" "}
          <b>
            [TO CONFIRM: liability cap — commonly the fees paid in the preceding 12 months. Needs a
            decision and legal review before publication.]
          </b>
        </p>
        <p>
          Nothing here limits liability that cannot lawfully be limited, including for fraud or for
          death or personal injury caused by negligence.
        </p>
      </LegalSection>

      <LegalSection heading="Ending it">
        <p>
          You can stop using AscendOS whenever you like, and a workspace administrator can close
          their workspace. We may suspend or end access if these terms are broken in a way that puts
          other users or the service at risk.
        </p>
        <p>
          <b>
            [TO CONFIRM: how long data remains exportable after termination, and the deletion
            timetable.]
          </b>{" "}
          This should match the retention wording in the Privacy Policy — if the two disagree, the
          stricter one applies.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          We may update these terms. If a change materially affects you we will say so in the
          application before it takes effect, and continuing to use AscendOS after that means you
          accept the new version.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          <b>[TO CONFIRM: governing law and the courts that have jurisdiction.]</b>
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms: <b>[TO CONFIRM: contact email]</b>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
