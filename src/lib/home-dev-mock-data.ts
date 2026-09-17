/**
 * Dev Bypass-only fixtures for the Home page. Same shape contract as every
 * other `if (devBypass) return mock...` branch already in this app (see
 * calls-on-calendar.tsx, closer.tsx, activity-module.tsx) — these feed the
 * exact same Home components real data does, they just skip the network
 * call. Deterministic relative to "now" (not frozen to one hardcoded
 * timestamp, so "upcoming" items stay upcoming whenever you open the page —
 * same pattern webinar-mock-data.ts already uses), never random, and never
 * written anywhere — this module only ever returns plain objects for the UI
 * to render, it has no side effects and touches no database.
 */

const isoAt = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3600e3).toISOString();
const isoDaysAgo = (days: number, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateDaysAgo = (days: number) => isoDaysAgo(days).slice(0, 10);
const dateDaysFromNow = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// DM Setter
// ---------------------------------------------------------------------------

export function mockSetterActivityRows(flavor: "dm_setter" | "inbound_dialer", rangeFrom: string) {
  const days = rangeFrom === dateDaysAgo(0) ? 1 : 7;
  const rows =
    flavor === "dm_setter"
      ? [
          {
            inbound_dms_sent: 22,
            outbound_dms_sent: 48,
            replies: 19,
            qualified_convos: 7,
            sets: 3,
            calls_on_calendar: 3,
            leads_contacted: 34,
            followups_sent: 11,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 18,
            outbound_dms_sent: 41,
            replies: 16,
            qualified_convos: 5,
            sets: 2,
            calls_on_calendar: 2,
            leads_contacted: 29,
            followups_sent: 9,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 25,
            outbound_dms_sent: 52,
            replies: 21,
            qualified_convos: 8,
            sets: 4,
            calls_on_calendar: 4,
            leads_contacted: 38,
            followups_sent: 13,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 15,
            outbound_dms_sent: 36,
            replies: 13,
            qualified_convos: 4,
            sets: 2,
            calls_on_calendar: 2,
            leads_contacted: 25,
            followups_sent: 8,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 20,
            outbound_dms_sent: 44,
            replies: 17,
            qualified_convos: 6,
            sets: 3,
            calls_on_calendar: 3,
            leads_contacted: 31,
            followups_sent: 10,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 12,
            outbound_dms_sent: 28,
            replies: 10,
            qualified_convos: 3,
            sets: 1,
            calls_on_calendar: 1,
            leads_contacted: 19,
            followups_sent: 6,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            inbound_dms_sent: 9,
            outbound_dms_sent: 21,
            replies: 8,
            qualified_convos: 2,
            sets: 1,
            calls_on_calendar: 1,
            leads_contacted: 15,
            followups_sent: 4,
            dials: 0,
            connections: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
        ]
      : [
          {
            dials: 64,
            connections: 21,
            qualified_convos: 9,
            calls_on_calendar: 4,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 58,
            connections: 18,
            qualified_convos: 7,
            calls_on_calendar: 3,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 71,
            connections: 26,
            qualified_convos: 11,
            calls_on_calendar: 5,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 49,
            connections: 15,
            qualified_convos: 6,
            calls_on_calendar: 2,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 62,
            connections: 20,
            qualified_convos: 8,
            calls_on_calendar: 3,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 40,
            connections: 12,
            qualified_convos: 5,
            calls_on_calendar: 2,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
          {
            dials: 35,
            connections: 10,
            qualified_convos: 4,
            calls_on_calendar: 1,
            sets: 0,
            leads_contacted: 0,
            followups_sent: 0,
            inbound_dms_sent: 0,
            outbound_dms_sent: 0,
            replies: 0,
            cash_collected_cents: 0,
            total_revenue_cents: 0,
          },
        ];
  return rows.slice(0, days);
}

export const MOCK_SETTER_LEAD_IDS = {
  followUp1: "mock-lead-fu-1",
  followUp2: "mock-lead-fu-2",
  qualified1: "mock-lead-q-1",
  upcoming1: "mock-lead-up-1",
  upcoming2: "mock-lead-up-2",
};

export function mockMySetterLeads() {
  return [
    {
      id: MOCK_SETTER_LEAD_IDS.followUp1,
      full_name: "Priya Anand",
      status: "follow_up",
      created_at: isoDaysAgo(2),
      first_touch_at: isoDaysAgo(2),
    },
    {
      id: MOCK_SETTER_LEAD_IDS.followUp2,
      full_name: "Marcus Webb",
      status: "follow_up",
      created_at: isoDaysAgo(1),
      first_touch_at: isoDaysAgo(1),
    },
    {
      id: "mock-lead-fu-3",
      full_name: "Elena Cho",
      status: "follow_up",
      created_at: isoDaysAgo(4),
      first_touch_at: isoDaysAgo(4),
    },
    {
      id: MOCK_SETTER_LEAD_IDS.qualified1,
      full_name: "Dominic Reyes",
      status: "qualified",
      created_at: isoDaysAgo(1),
      first_touch_at: isoDaysAgo(1),
    },
    {
      id: "mock-lead-q-2",
      full_name: "Sasha Kim",
      status: "qualified",
      created_at: isoDaysAgo(3),
      first_touch_at: isoDaysAgo(3),
    },
    {
      id: "mock-lead-dr-1",
      full_name: "Owen Fitzgerald",
      status: "dm_received",
      created_at: isoDaysAgo(5),
      first_touch_at: isoDaysAgo(5),
    },
    {
      id: "mock-lead-dr-2",
      full_name: "Nadia Ibrahim",
      status: "dm_received",
      created_at: isoDaysAgo(6),
      first_touch_at: isoDaysAgo(6),
    },
    {
      id: MOCK_SETTER_LEAD_IDS.upcoming1,
      full_name: "Grace Lin",
      status: "call_booked",
      created_at: isoDaysAgo(2),
      first_touch_at: isoDaysAgo(2),
    },
    {
      id: MOCK_SETTER_LEAD_IDS.upcoming2,
      full_name: "Theo Baptiste",
      status: "call_booked",
      created_at: isoDaysAgo(1),
      first_touch_at: isoDaysAgo(1),
    },
  ];
}

export function mockUpcomingCallsForLeads() {
  return [
    {
      id: "mock-call-up-1",
      scheduled_for: isoAt(3),
      lead_email: "grace.lin@example.com",
      closer_name: "Jordan Blake",
      status: "confirmed",
    },
    {
      id: "mock-call-up-2",
      scheduled_for: isoAt(27),
      lead_email: "theo.baptiste@example.com",
      closer_name: "Sam Rivera",
      status: "awaiting_confirmation",
    },
  ];
}

// ---------------------------------------------------------------------------
// Inbound Dialer — attention row (SLA breaches + callback queue)
// ---------------------------------------------------------------------------

export const MOCK_DIALER_ATTENTION = { slaBreaches: 3, callbacksDueToday: 5, callbacksOverdue: 2 };

// ---------------------------------------------------------------------------
// Closer
// ---------------------------------------------------------------------------

export function mockCloserCalls(rangeFrom: string) {
  const week = [
    // Today — 6 booked, 4 showed, 3 offers, 1 closed ($5,000 cash), 1 no-show unrecovered, 1 payment-plan-no-deposit
    {
      id: "mc-1",
      scheduled_for: isoAt(-6),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 500000,
      contract_value_cents: 500000,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "amelia.stone@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-2",
      scheduled_for: isoAt(-4),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "raj.patel@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-3",
      scheduled_for: isoAt(-2),
      status: "no_show",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "julia.ferreira@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-4",
      scheduled_for: isoAt(-1),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 800000,
      deposit_cents: 0,
      payment_plan: true,
      lead_email: "kenji.watanabe@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-5",
      scheduled_for: isoAt(2),
      status: "confirmed",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "hannah.osei@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-6",
      scheduled_for: isoAt(6),
      status: "confirmed",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "victor.aguilar@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    // Rest of the week
    {
      id: "mc-7",
      scheduled_for: isoDaysAgo(1),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 450000,
      contract_value_cents: 450000,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "lena.brandt@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-8",
      scheduled_for: isoDaysAgo(1),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "arjun.mehta@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-9",
      scheduled_for: isoDaysAgo(2),
      status: "no_show",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "chloe.dubois@example.com",
      no_show_recovered: true,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-10",
      scheduled_for: isoDaysAgo(2),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 600000,
      contract_value_cents: 600000,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "sofia.marino@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-11",
      scheduled_for: isoDaysAgo(3),
      status: "showed",
      showed: true,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "peter.novak@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-12",
      scheduled_for: isoDaysAgo(3),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "isla.macdonald@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-13",
      scheduled_for: isoDaysAgo(4),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 350000,
      contract_value_cents: 700000,
      deposit_cents: 350000,
      payment_plan: true,
      lead_email: "daniel.okafor@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-14",
      scheduled_for: isoDaysAgo(4),
      status: "cancelled",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "mia.jansen@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: true,
    },
    {
      id: "mc-15",
      scheduled_for: isoDaysAgo(5),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "felix.hartmann@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-16",
      scheduled_for: isoDaysAgo(5),
      status: "no_show",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "aisha.bello@example.com",
      no_show_recovered: true,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-17",
      scheduled_for: isoDaysAgo(6),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 500000,
      contract_value_cents: 500000,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "noah.eriksson@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mc-18",
      scheduled_for: isoDaysAgo(6),
      status: "showed",
      showed: true,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      deposit_cents: 0,
      payment_plan: false,
      lead_email: "camille.rousseau@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
  ];
  if (rangeFrom === dateDaysAgo(0)) {
    return week.filter((c) => c.scheduled_for.slice(0, 10) === dateDaysAgo(0));
  }
  return week;
}

export function mockCoachingReviews() {
  return [
    {
      id: "cr-1",
      reviewer_name: "Sales Manager",
      what_learned: "Slow down the pitch after price objection — let silence work.",
      gap_category: "Pacing",
      created_at: isoDaysAgo(1),
      rep_name: "Jordan Blake",
    },
    {
      id: "cr-2",
      reviewer_name: "Sales Manager",
      what_learned: "Anchor value before revealing payment plan options.",
      gap_category: "Value Stacking",
      created_at: isoDaysAgo(4),
      rep_name: "Jordan Blake",
    },
    {
      id: "cr-3",
      reviewer_name: "Sales Manager",
      what_learned: "Ask for the close directly instead of trailing off.",
      gap_category: "Closing",
      created_at: isoDaysAgo(6),
      rep_name: "Jordan Blake",
    },
  ];
}

// ---------------------------------------------------------------------------
// Sales Manager
// ---------------------------------------------------------------------------

export function mockManagerCallsToday() {
  return [
    {
      id: "mgr-1",
      scheduled_for: isoAt(-5),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 500000,
      contract_value_cents: 500000,
      closer_name: "Jordan Blake",
      lead_email: "amelia.stone@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-2",
      scheduled_for: isoAt(-3),
      status: "showed",
      showed: true,
      offer_made: true,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      closer_name: "Sam Rivera",
      lead_email: "raj.patel@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-3",
      scheduled_for: isoAt(-2),
      status: "no_show",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      closer_name: "Casey Nguyen",
      lead_email: "julia.ferreira@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-4",
      scheduled_for: isoAt(-1),
      status: "closed",
      showed: true,
      offer_made: true,
      closed: true,
      cash_collected_cents: 350000,
      contract_value_cents: 700000,
      closer_name: "Sam Rivera",
      lead_email: "kenji.watanabe@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-5",
      scheduled_for: isoAt(2),
      status: "confirmed",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      closer_name: "Jordan Blake",
      lead_email: "hannah.osei@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-6",
      scheduled_for: isoAt(4),
      status: "confirmed",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      closer_name: "Casey Nguyen",
      lead_email: "victor.aguilar@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
    {
      id: "mgr-7",
      scheduled_for: isoAt(6),
      status: "confirmed",
      showed: false,
      offer_made: false,
      closed: false,
      cash_collected_cents: 0,
      contract_value_cents: 0,
      closer_name: "Sam Rivera",
      lead_email: "lena.brandt@example.com",
      no_show_recovered: false,
      recovered_from_call_id: null,
      cancelled: false,
    },
  ];
}

export function mockManagerWeekCalls() {
  const byCloser: Array<[string, number, number, number, number]> = [
    // name, booked, showed, closes, cashDollars
    ["Jordan Blake", 18, 13, 5, 19500],
    ["Sam Rivera", 15, 10, 4, 15800],
    ["Casey Nguyen", 12, 7, 2, 8200],
  ];
  const rows: Array<{
    closer_name: string;
    showed: boolean;
    offer_made: boolean;
    closed: boolean;
    status: string;
    cash_collected_cents: number;
  }> = [];
  for (const [name, booked, showed, closes, cashDollars] of byCloser) {
    for (let i = 0; i < booked; i++) {
      const isShowed = i < showed;
      const isClosed = i < closes;
      rows.push({
        closer_name: name,
        showed: isShowed,
        offer_made: isShowed,
        closed: isClosed,
        status: isClosed ? "closed" : isShowed ? "showed" : "no_show",
        cash_collected_cents: isClosed ? Math.round((cashDollars * 100) / closes) : 0,
      });
    }
  }
  return rows;
}

export const MOCK_MANAGER_SLA_BREACHES = 4;

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function mockAdminPaymentsToday() {
  return [
    { amount_cents: 500000, status: "paid", collected_at: isoAt(-5) },
    { amount_cents: 350000, status: "paid", collected_at: isoAt(-3) },
    { amount_cents: 1000000, status: "paid", collected_at: isoAt(-1) },
  ];
}

export function mockAdminCallsToday() {
  return mockManagerCallsToday().map((c) => ({
    id: c.id,
    status: c.status,
    closed: c.closed,
    contract_value_cents: c.contract_value_cents,
    scheduled_for: c.scheduled_for,
  }));
}

export function mockAdminClients() {
  return [
    {
      id: "cl-1",
      full_name: "Riverside Coaching LLC",
      offer_name: "High Ticket Mastery",
      status: "active",
      renewal_date: dateDaysAgo(4),
      renewal_conv_started: false,
      expected_next_payment_date: dateDaysAgo(9),
      expected_next_payment_cents: 150000,
      contract_value_cents: 1800000,
      invested_to_date_cents: 1650000,
    },
    {
      id: "cl-2",
      full_name: "Bright Path Consulting",
      offer_name: "Founder Accelerator",
      status: "active",
      renewal_date: dateDaysFromNow(6),
      renewal_conv_started: false,
      expected_next_payment_date: dateDaysAgo(2),
      expected_next_payment_cents: 200000,
      contract_value_cents: 2400000,
      invested_to_date_cents: 2200000,
    },
    {
      id: "cl-3",
      full_name: "Summit Growth Partners",
      offer_name: "High Ticket Mastery",
      status: "active",
      renewal_date: dateDaysFromNow(45),
      renewal_conv_started: true,
      expected_next_payment_date: dateDaysFromNow(12),
      expected_next_payment_cents: 150000,
      contract_value_cents: 1800000,
      invested_to_date_cents: 900000,
    },
    {
      id: "cl-4",
      full_name: "Nova Client Systems",
      offer_name: "Founder Accelerator",
      status: "active",
      renewal_date: dateDaysFromNow(90),
      renewal_conv_started: false,
      expected_next_payment_date: dateDaysFromNow(20),
      expected_next_payment_cents: 200000,
      contract_value_cents: 2400000,
      invested_to_date_cents: 800000,
    },
    {
      id: "cl-5",
      full_name: "Clearline Advisory",
      offer_name: "High Ticket Mastery",
      status: "active",
      renewal_date: dateDaysAgo(20),
      renewal_conv_started: false,
      expected_next_payment_date: dateDaysAgo(35),
      expected_next_payment_cents: 150000,
      contract_value_cents: 1800000,
      invested_to_date_cents: 1350000,
    },
    {
      id: "cl-6",
      full_name: "Horizon Mentee Group",
      offer_name: "Founder Accelerator",
      status: "active",
      renewal_date: dateDaysFromNow(120),
      renewal_conv_started: false,
      expected_next_payment_date: dateDaysFromNow(5),
      expected_next_payment_cents: 200000,
      contract_value_cents: 2400000,
      invested_to_date_cents: 400000,
    },
  ];
}

export function mockAdminClientPayments() {
  return [
    { client_id: "cl-1", status: "failed", collected_at: dateDaysAgo(9) },
    { client_id: "cl-2", status: "failed", collected_at: dateDaysAgo(2) },
    { client_id: "cl-3", status: "paid", collected_at: dateDaysAgo(18) },
    { client_id: "cl-4", status: "paid", collected_at: dateDaysAgo(10) },
    { client_id: "cl-5", status: "failed", collected_at: dateDaysAgo(35) },
    { client_id: "cl-6", status: "paid", collected_at: dateDaysAgo(25) },
  ];
}

export const MOCK_ADMIN_HIRING_COUNTS = { needsGrading: 4, interviewWorthy: 2, trialCall: 1 };

// ---------------------------------------------------------------------------
// Growth Operator
// ---------------------------------------------------------------------------

export function mockGrowthLeadsToday() {
  const paidPlatforms = [
    "Meta Ads",
    "TikTok",
    "Meta Ads",
    "Google",
    "TikTok",
    "Meta Ads",
    "Google",
    "Meta Ads",
    "TikTok",
  ];
  // "organic" (the raw signal `normalizeAcquisitionSource` actually matches
  // via strict equality, not the display label "Direct / Organic" itself —
  // passing the formatted label here would silently fail to normalize back
  // to organic and get miscounted as paid).
  const organic = ["organic", "organic", "organic", "organic", "organic", "organic"];
  return [...paidPlatforms, ...organic].map((source_platform, i) => ({
    id: `mock-growth-lead-${i}`,
    source_platform,
    created_at: isoAt(-i),
  }));
}

export function mockGrowthContentToday() {
  return [
    { id: "cm-1", views: 42000, leads_generated: 0, captured_at: isoAt(-6) },
    { id: "cm-2", views: 18500, leads_generated: 12, captured_at: isoAt(-5) },
    { id: "cm-3", views: 6400, leads_generated: 4, captured_at: isoAt(-3) },
    { id: "cm-4", views: 1200, leads_generated: 1, captured_at: isoAt(-2) },
  ];
}
