import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
  head: () => ({
    meta: [
      { title: "Privacy Policy | AscendOS" },
      {
        name: "description",
        content: "What AscendOS collects, why, who it is shared with, and how to get it removed.",
      },
    ],
  }),
});

/**
 * DRAFT — not reviewed by a lawyer.
 *
 * Every claim below describes something this codebase actually does; nothing is
 * aspirational. Where a fact depends on a business decision rather than the
 * code (legal entity, retention period, governing law), the text says so
 * instead of inventing an answer — see the [TO CONFIRM] markers, which must be
 * resolved before this is published or submitted to Google.
 */
function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="29 October 2026" draft>
      <p>
        AscendOS is a business-operations platform used by coaching and info-product businesses to
        run their sales, content, client delivery and payments in one place. This policy explains
        what the platform collects, why it holds it, and who else sees it.
      </p>
      <p>
        AscendOS is operated by <b>Ascend Capital</b> {"("}&ldquo;we&rdquo;{")"}. Questions about
        anything here go to <b>aryanmahmoudi08@gmail.com</b>.
      </p>

      <LegalSection heading="Two kinds of people, two different relationships">
        <p>
          <b>Workspace users</b> are the people who sign in: a business owner, their sales reps,
          their operations staff. We process their data to provide the platform to them.
        </p>
        <p>
          <b>Everyone else in the data</b> — leads, prospects, clients and mentees — never signs in.
          Their records are entered or imported by a workspace. For that data the workspace is
          responsible for what is collected and why; we process it on their behalf and under their
          instruction. If you are a lead or client asking about your record, contact the business
          you dealt with. We will help them answer you, but we cannot release or delete their data
          on our own initiative.
        </p>
      </LegalSection>

      <LegalSection heading="What we collect from people who sign in">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Account</b> — email address, and either a password (stored only as a hash, never in
            readable form) or a Google sign-in, below.
          </li>
          <li>
            <b>Profile</b> — display name, timezone, and a profile photo if one was supplied.
          </li>
          <li>
            <b>Access request</b> — when applying to join a workspace: first and last name, email,
            phone number, the role applied for, the workspace admin&rsquo;s email, and optionally a
            photo. The photo exists so colleagues see a face rather than initials.
          </li>
          <li>
            <b>Activity you log</b> — end-of-day reports, calls, outreach, content and the figures
            attached to them. This is the substance of the product.
          </li>
          <li>
            <b>Preferences</b> — things like theme and selected date range, kept in your
            browser&rsquo;s local storage rather than on our servers.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Signing in with Google">
        <p>
          Choosing &ldquo;Continue with Google&rdquo; asks Google for your{" "}
          <b>email address, basic profile information and name</b> — the standard <code>email</code>
          , <code>profile</code> and <code>openid</code> scopes. Nothing else is requested: not your
          Gmail, Drive, Calendar or Contacts.
        </p>
        <p>
          That information is used solely to create and identify your account and to show your name
          to colleagues in your workspace. It is not sold, not used for advertising, and not shared
          with anyone beyond the providers listed below. AscendOS&rsquo;s use of information
          received from Google APIs adheres to the{" "}
          <a
            className="underline hover:text-foreground"
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. You can disconnect AscendOS at any time from
          your Google account&rsquo;s third-party access settings.
        </p>
      </LegalSection>

      <LegalSection heading="Business data a workspace brings in">
        <p>
          A workspace can connect outside systems, and what they send arrives here: applications and
          form responses, booked calls, payments and refunds, webinar attendance, video engagement,
          advertising spend, and inbound calls and messages. Each connection is set up deliberately
          by a workspace administrator and can be disconnected by them at any time.
        </p>
        <p>
          Some of that is personal data about third parties — a lead&rsquo;s name, email, phone
          number and their answers to an application form. It is held because the workspace is
          running a sales process with that person.
        </p>
      </LegalSection>

      <LegalSection heading="Automated analysis">
        <p>
          Parts of the platform generate plain-language summaries of logged activity. To do that,{" "}
          <b>the relevant records are sent to a third-party AI provider</b> and a summary is
          returned. The provider processes the request and does not use it to train models. If a
          workspace would rather no data left the platform this way, the feature can be left
          unconfigured, and those panels simply report that AI is not configured.
        </p>
        <p>
          No automated process makes a decision that has a legal or similarly significant effect on
          anyone. The summaries are read by people, who decide what to do.
        </p>
      </LegalSection>

      <LegalSection heading="Who else processes it">
        <p>We rely on these providers, and no others, to run the platform:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Supabase</b> — database, authentication and file storage. Where your data lives.
          </li>
          <li>
            <b>Vercel</b> — application hosting and delivery.
          </li>
          <li>
            <b>Google</b> — only if you choose to sign in with Google, and for advertising figures
            if a workspace connects an ad account.
          </li>
          <li>
            <b>The integrations a workspace turns on</b> — payment processors, scheduling, CRM,
            webinar, telephony and automation tools. Data flows to and from these only because that
            workspace connected them.
          </li>
          <li>
            <b>An AI provider</b>, as described above, where those features are enabled.
          </li>
        </ul>
        <p>
          We do not sell personal data, and we do not share it for advertising or cross-context
          behavioural advertising.
        </p>
      </LegalSection>

      <LegalSection heading="How it is protected">
        <p>
          Access is enforced in the database itself, not only in the interface: every record is tied
          to a workspace, and policies on each table restrict reads and writes to members of that
          workspace with an appropriate role. Data is encrypted in transit and at rest by our
          hosting providers. Uploaded photos are kept in a private bucket that is not publicly
          readable and is reachable only through short-lived signed links.
        </p>
        <p>
          No system is immune to compromise. If a breach affects your data we will notify affected
          workspaces and, where required, the relevant regulator.
        </p>
      </LegalSection>

      <LegalSection heading="How long it is kept">
        <p>
          Workspace data is retained for as long as the workspace is active, because the product is
          a historical record of a business and loses its purpose without the history. After an
          account is closed we keep data only for as long as we need it to allow recovery of the
          account and to meet our legal obligations, and backups age out on their own schedule.
        </p>
        <p>
          Delete your account and we remove your profile and sign-in credentials. Activity you
          logged on behalf of a workspace generally remains with that workspace, since it is their
          business record rather than your personal one.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can ask us for a copy of your data, to correct it, to delete it, or to restrict or
          object to how it is used. Where we rely on consent, you can withdraw it at any time.
          Depending on where you live you may also have the right to complain to a data-protection
          authority.
        </p>
        <p>
          Write to <b>aryanmahmoudi08@gmail.com</b> and we will respond within one month. If your
          request concerns data a workspace holds about you as a lead or client, we will pass it to
          that workspace and support them in answering.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          Our providers operate data centres in several countries, so your data may be processed
          outside the country you live in. Where that happens we rely on the transfer safeguards our
          providers put in place for their own customers.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          AscendOS is a tool for businesses and is not directed at children. We do not knowingly
          collect data from anyone under 16. If you believe a child&rsquo;s data has reached us,
          contact us and we will remove it.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes in a way that materially affects you, we will say so in the
          application before the change takes effect. The date at the top always reflects the
          current version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
