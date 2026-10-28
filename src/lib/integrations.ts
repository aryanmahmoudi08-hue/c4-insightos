/**
 * The integration catalogue — every outside system AscendOS talks to, what
 * it feeds, and how it is actually connected.
 *
 * `kind` is the honest part. Most of these are connectors in the real
 * sense: a webhook or an OAuth grant, configured on this page, that pushes
 * data in on its own. Two are not, and saying so matters more than a tidy
 * grid would:
 *
 *  - Wistia is read from the public player plus a CSV export. There is no
 *    API key to paste and no live sync, so listing it beside Stripe with a
 *    "Connect" button would promise something that does not exist.
 *  - Google Forms arrives through the generic ingest endpoint via an Apps
 *    Script, not through a Google integration.
 *
 * A reader needs to know which of these keeps itself current and which one
 * someone has to feed.
 */

export type IntegrationKind =
  /** Configured on this page; pushes data in by webhook once connected. */
  | "webhook"
  /** Configured on this page; authorised by OAuth, pulls on a schedule. */
  | "oauth"
  /** Real integration, but set up outside this page — see `setup`. */
  | "manual";

export type Integration = {
  /** The vendor's own brand colour, for the card's mark. Deliberately a
   *  colour and a glyph rather than the vendor's logo file: shipping a
   *  dozen third-party trademarks into the bundle is a licensing question
   *  nobody here has answered, and a wrong-era logo looks worse than none.
   *  Swap in real brand SVGs whenever they are approved. */
  brand: string;
  /** Matches the connector id in connections-panel.tsx where kind !== "manual". */
  id: string;
  name: string;
  kind: IntegrationKind;
  /** What it brings in, in the app's own vocabulary. */
  feeds: string;
  /** Which page the data lands on. */
  landsOn: string;
  /** One line on how it is connected — the honest mechanism, not a pitch. */
  setup: string;
};

export const INTEGRATION_GROUPS: { group: string; blurb: string; items: Integration[] }[] = [
  {
    group: "Leads & bookings",
    blurb: "Everything that creates a lead or puts a call on a calendar.",
    items: [
      {
        id: "typeform",
        brand: "#262627",
        name: "Typeform",
        kind: "webhook",
        feeds: "Applications — every answer, stored against the lead.",
        landsOn: "Legacy Leads",
        setup:
          "Paste the form URL and a secret you choose, then add the webhook URL this page gives you to Typeform.",
      },
      {
        id: "calendly",
        brand: "#006BFF",
        name: "Calendly",
        kind: "webhook",
        feeds: "Bookings, reschedules and cancellations.",
        landsOn: "Team Calendars · Closer",
        setup:
          "Create a webhook subscription in Calendly pointing at the URL on this page, then paste the signing key back.",
      },
      {
        id: "close",
        brand: "#1B7FFB",
        name: "Close CRM",
        kind: "webhook",
        feeds: "Lead and opportunity changes from Close.",
        landsOn: "Legacy Leads",
        setup: "Add a Close webhook to the URL on this page, then paste its signature key back.",
      },
      {
        id: "google_forms",
        brand: "#7248B9",
        name: "Google Forms",
        kind: "manual",
        feeds: "The Daily W check-in — wins, cash logged, energy, commitments.",
        landsOn: "Mentee Results",
        setup:
          "An Apps Script on the form posts each response to the public ingest endpoint. The script lives in scripts/daily-win-google-form.gs; it needs the form's ingest token pasted in once.",
      },
    ],
  },
  {
    group: "Money",
    blurb: "Anything that moves cash. All of these land in one ledger.",
    items: [
      {
        id: "stripe",
        brand: "#635BFF",
        name: "Stripe",
        kind: "webhook",
        feeds: "Charges, refunds and failed payments.",
        landsOn: "Payments",
        setup:
          "Create an endpoint in Stripe pointing at the URL on this page, then paste the signing secret back.",
      },
      {
        id: "whop",
        brand: "#FF6243",
        name: "Whop",
        kind: "webhook",
        feeds: "Payments and membership events.",
        landsOn: "Payments",
        setup: "Add the webhook URL on this page to Whop, then paste its secret back.",
      },
      {
        id: "fanbasis",
        brand: "#12B981",
        name: "Fanbasis (Commas)",
        kind: "webhook",
        feeds: "Payments and payment-plan installments.",
        landsOn: "Payments",
        setup: "Add the webhook URL on this page in Fanbasis, then paste its secret_key back.",
      },
      {
        id: "paypal",
        brand: "#009CDE",
        name: "PayPal",
        kind: "webhook",
        feeds: "Payments and refunds.",
        landsOn: "Payments",
        setup:
          "Create a REST app in PayPal, subscribe its webhook to the URL on this page, then paste the client ID, secret and webhook ID back.",
      },
      {
        id: "wise",
        brand: "#9FE870",
        name: "Wise",
        kind: "webhook",
        feeds: "Transfers received.",
        landsOn: "Payments",
        setup: "Add the webhook URL on this page in Wise, then paste the public key (PEM) back.",
      },
    ],
  },
  {
    group: "Content, video & ads",
    blurb: "What produced the attention, and what it cost.",
    items: [
      {
        id: "meta",
        brand: "#0866FF",
        name: "Meta Ads",
        kind: "oauth",
        feeds: "Ad spend per account, pulled on a schedule.",
        landsOn: "Main Hub · Content Command Center",
        setup:
          "Authorise with Facebook on this page, then pick the ad account. No keys to paste — the grant is held server-side.",
      },
      {
        id: "webinarjam",
        brand: "#2B6CB0",
        name: "WebinarJam",
        kind: "webhook",
        feeds: "Registrations, attendance and at-pitch timing.",
        landsOn: "Webinar Analytics",
        setup: "Connect here first, then add the webhook URL this page generates to WebinarJam.",
      },
      {
        id: "wistia",
        brand: "#4990E2",
        name: "Wistia",
        kind: "manual",
        feeds: "VSL plays, average percent watched and drop-off per milestone.",
        landsOn: "VSL Analytics",
        setup:
          "Paste the Wistia media ID on each VSL, and import the stats CSV from Wistia. There is no live sync — the numbers are as fresh as the last import, and the page says so.",
      },
    ],
  },
  {
    group: "Delivery & automation",
    blurb: "Where events go once something happens in here.",
    items: [
      {
        id: "twilio",
        brand: "#F22F46",
        name: "Twilio",
        kind: "webhook",
        feeds: "Inbound SMS and voice, call status and recordings.",
        landsOn: "Legacy Leads · Inbound Dialer",
        setup:
          "Point your Twilio number's SMS and Voice webhooks at the per-event URLs on this page. Requests are signature-verified.",
      },
      {
        id: "discord",
        brand: "#5865F2",
        name: "Discord",
        kind: "webhook",
        feeds: "Outbound only — new leads, booked calls, payments, failures.",
        landsOn: "Event Bus",
        setup: "Create a channel webhook in Discord and paste its URL here.",
      },
      {
        id: "zapier",
        brand: "#FF4F00",
        name: "Zapier",
        kind: "webhook",
        feeds: "Outbound only — anything the Event Bus emits, into any Zap.",
        landsOn: "Event Bus",
        setup: "Create a Catch Hook in Zapier and paste its URL here.",
      },
      {
        id: "custom_webhook",
        brand: "#8A8F98",
        name: "Slack · n8n · any webhook",
        kind: "manual",
        feeds: "Outbound only — the same events, as raw JSON to any URL you own.",
        landsOn: "Event Bus",
        setup:
          "Add the destination as a subscription on the Event Bus page. Discord gets a formatted message; everything else receives JSON.",
      },
    ],
  },
];

export const KIND_LABEL: Record<IntegrationKind, string> = {
  webhook: "Webhook",
  oauth: "OAuth",
  manual: "Manual setup",
};

/** Flat list, for counting and lookup. */
export const ALL_INTEGRATIONS: Integration[] = INTEGRATION_GROUPS.flatMap((g) => g.items);
