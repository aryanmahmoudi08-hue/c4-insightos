import { describe, expect, it } from "vitest";
import { formatDiscordMessage, unframe } from "./discord-format";
import { discordIdentityFor } from "./event-catalog";
import { attachPrevious, buildSalesReport, previousWindow } from "./sales-report";
import { buildSourceBoard, type SourceCall, type SourceLead } from "./source-leaderboard";

/** formatDiscordMessage, with the top/bottom frame removed so tests check the body. */
const fmtBody = (...a: Parameters<typeof formatDiscordMessage>) => {
  const m = formatDiscordMessage(...a);
  return { ...m, content: unframe(m.content) };
};

const eod = [
  {
    user_id: "u1",
    team_member_name: "Jordan",
    role: "dm_setter",
    sets: 3,
    qualified_convos: 9,
    replies: 22,
  },
  {
    user_id: "u3",
    team_member_name: "Chris",
    role: "inbound_dialer",
    dials: 120,
    connections: 30,
    sets: 4,
  },
];
const call = (o: Record<string, unknown>) => ({
  closer_name: "Sam",
  setter_id: null,
  showed: true,
  closed: false,
  status: "completed",
  eod_lead_status: null,
  cash_collected_cents: 0,
  contract_value_cents: 0,
  original_currency: "USD",
  ...o,
});
const roster = [
  { name: "Jordan", role: "dm_setter", active: true },
  { name: "Chris", role: "inbound_dialer", active: true },
  { name: "Taylor", role: "inbound_dialer", active: true },
  { name: "Sam", role: "closer", active: true },
];

describe("buildSalesReport", () => {
  const report = buildSalesReport({
    kind: "Daily",
    eodRows: eod,
    closerCalls: [
      call({
        setter_id: "u1",
        closed: true,
        cash_collected_cents: 250000,
        contract_value_cents: 500000,
      }),
      call({ closed: true, cash_collected_cents: 150000, contract_value_cents: 150000 }),
    ],
    roster,
    booked: 6,
    onCalendar: 4,
  });

  it("splits setters by role and ranks by sets", () => {
    expect(report.dm_setters.map((r) => r.name)).toEqual(["Jordan"]);
    expect(report.dialers.map((r) => r.name)).toEqual(["Chris"]);
  });

  it("credits a setter with the cash and revenue on calls they set", () => {
    expect(report.dm_setters[0]).toMatchObject({
      closed: 1,
      cashCents: 250000,
      revenueCents: 500000,
    });
  });

  it("counts closes with no setter instead of dropping them", () => {
    expect(report.unassigned_closes).toBe(1);
  });

  it("team revenue is the deal value of closes", () => {
    expect(report.team).toMatchObject({ cashCents: 400000, revenueCents: 650000, closes: 2 });
  });

  it("lists roster setters who filed no EOD, daily only", () => {
    expect(report.missing_eods).toEqual(["Taylor"]);
  });
});

describe("previousWindow", () => {
  it("steps back a day, a week, or a calendar month", () => {
    expect(previousWindow("Daily", "2026-11-14")).toEqual({ from: "2026-11-13", to: "2026-11-13" });
    expect(previousWindow("Weekly", "2026-11-08")).toEqual({
      from: "2026-11-01",
      to: "2026-11-07",
    });
    expect(previousWindow("Monthly", "2026-11-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
});

describe("sales report message", () => {
  const opts = { appUrl: "https://app", username: "X" };
  const cur = buildSalesReport({
    kind: "Weekly",
    eodRows: eod,
    closerCalls: [],
    roster,
    booked: 22,
    onCalendar: 18,
  });
  const prev = buildSalesReport({
    kind: "Weekly",
    eodRows: [{ team_member_name: "Jordan", role: "dm_setter", sets: 1 }],
    closerCalls: [],
    roster,
    booked: 26,
    onCalendar: 20,
  });

  it("has a board per role with medals and ▲▼ vs last period", () => {
    const msg = fmtBody(
      "report.weekly_sales",
      { period_label: "Nov 8 – Nov 14", ...attachPrevious(cur, prev) },
      opts,
    ).content;
    expect(msg.startsWith("**Week:** Nov 8 – Nov 14\n\n")).toBe(true);
    expect(msg).toContain("**Calls booked:** 22 (▼ 4)");
    expect(msg).toContain("**💬 DM SETTERS** · ranked by sets\n🥇 **Jordan:** 3 sets");
    expect(msg).toContain("(▲ 2)");
    expect(msg).toContain("**📞 DIALERS**");
    expect(msg).toContain("**Most improved:** Chris (▲ 4 sets)");
  });

  it("monthly shows cash against the target", () => {
    const msg = fmtBody(
      "report.monthly_sales",
      {
        month_label: "November 2026",
        ...cur,
        kind: "Monthly",
        cash_target_cents: 5000000,
        team: { ...cur.team, cashCents: 3800000 },
      },
      opts,
    ).content;
    expect(msg).toContain("**Month:** November 2026");
    expect(msg).toContain("$38,000 of $50,000 target (76%)");
  });

  it("hides a rate until there is enough behind it", () => {
    const msg = fmtBody(
      "report.daily_sales",
      {
        ...buildSalesReport({
          kind: "Daily",
          eodRows: [{ team_member_name: "Alex", role: "dm_setter", sets: 1, qualified_convos: 2 }],
          closerCalls: [],
          booked: 1,
          onCalendar: 1,
        }),
      },
      opts,
    ).content;
    expect(msg).toContain("🥇 **Alex:** 1 set · 2 qualified");
    expect(msg).not.toContain("set rate");
  });
});

describe("top sources", () => {
  const L = (id: string, p: string | null, m: string | null, tag: string | null): SourceLead => ({
    id,
    email: `${id}@x.com`,
    source_platform: p,
    source_medium: m,
    source_content_tag: tag,
    source_content_id: null,
    first_touch_content_id: null,
    application_data: {},
    created_at: "2026-11-14T15:00:00Z",
  });
  const leads = [
    L("a", "instagram", "reel", "reel-1114-layoff"),
    L("b", "instagram", "reel", "reel-1114-layoff"),
    L("c", "tiktok", "bio", null),
    L("d", null, null, null),
  ];
  const calls: SourceCall[] = [
    {
      lead_id: "a",
      lead_email: null,
      created_at: "2026-11-14T18:00:00Z",
      source_connector: null,
      cancelled: false,
      closed: true,
      cash_collected_cents: 250000,
      contract_value_cents: 500000,
      original_currency: "USD",
    },
  ];
  const board = buildSourceBoard(leads, calls, leads, new Map());

  it("adds placements, tagged posts, closes and revenue", () => {
    expect(board.placements[0]).toMatchObject({
      name: "Instagram · reel",
      leads: 2,
      closed: 1,
      revenueCents: 500000,
    });
    expect(board.content[0].name).toBe("reel-1114-layoff (Instagram reel)");
    expect(board.totals).toMatchObject({ leads: 4, closed: 1, revenueCents: 500000 });
  });

  it("formats with its own bot, boards and the untagged line", () => {
    expect(discordIdentityFor("report.top_sources_weekly")?.username).toBe("WEEKLY TOP SOURCES");
    const msg = fmtBody(
      "report.top_sources_daily",
      { period_label: "Sat, Nov 14", ...board },
      { appUrl: "https://app", username: "X" },
    ).content;
    expect(msg).toContain(
      "**📍 BY PLACEMENT**\n🥇 **Instagram · reel:** 2 leads · 1 closed · $5,000",
    );
    expect(msg).toContain("**🎬 TOP POSTS**");
    expect(msg).toContain("Untagged: 1 of 4 leads (25%) had no source.");
  });

  it("an empty day is one line", () => {
    const msg = fmtBody(
      "report.top_sources_daily",
      { period_label: "Sun, Nov 15", ...buildSourceBoard([], [], [], new Map()) },
      { appUrl: "https://app", username: "X" },
    ).content;
    expect(msg).toContain("No new leads today.");
    expect(msg).not.toContain("BY PLATFORM");
  });
});
