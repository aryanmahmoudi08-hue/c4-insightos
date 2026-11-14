import { describe, expect, it } from "vitest";
import { calendlyBookingToCallRow, calendlyInviteeToLeadRow } from "./calendly";
import { resolveBookingLead } from "./calendly-leads.server";
import { escapeLike } from "./sql-like";
import { tableColumnsFromMigrations } from "./__test-support__/migration-columns";

/* A tiny in-memory stand-in for the Supabase client, just enough of the
 * query builder for resolveBookingLead: eq / ilike filters, order by
 * created_at desc, maybeSingle, and insert().select().single(). */
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const inserted: Array<{ table: string; row: Row }> = [];
  const likeToRegex = (p: string) =>
    new RegExp(
      "^" +
        p.replace(/\\([\\%_])|([.*+?^${}()|[\]])|%|_/g, (m, esc, special) =>
          esc ? `\\${esc}` : special ? `\\${special}` : m === "%" ? ".*" : ".",
        ) +
        "$",
      "i",
    );
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let desc = false;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      ilike: (c: string, p: string) => (
        filters.push((r) => likeToRegex(p).test(String(r[c] ?? ""))),
        q
      ),
      order: (_c: string, o?: { ascending?: boolean }) => ((desc = o?.ascending === false), q),
      limit: () => q,
      maybeSingle: async () => {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (desc)
          rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return { data: rows[0] ?? null, error: null };
      },
      insert: (row: Row) => {
        const withId = { id: `new-${inserted.length + 1}`, ...row };
        inserted.push({ table, row: withId });
        (tables[table] ??= []).push(withId);
        return { select: () => ({ single: async () => ({ data: withId, error: null }) }) };
      },
    };
    return q;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { from } as any, inserted };
}

const invitee = {
  uri: "https://api.calendly.com/scheduled_events/E/invitees/NEW",
  email: "Test.Booking5@Example.com",
  name: "Test Booking 5",
  text_reminder_number: "+12015550205",
  tracking: { utm_source: "instagram", utm_campaign: "tier_verify" },
};

describe("resolveBookingLead", () => {
  it("links to the lead that already applied, matching email case-insensitively", async () => {
    const { db, inserted } = fakeDb({
      leads: [
        {
          id: "lead-typeform",
          org_id: "org",
          email: "test.booking5@example.com",
          created_at: "2026-11-12",
        },
      ],
    });
    expect(await resolveBookingLead(db, "org", invitee, null)).toBe("lead-typeform");
    expect(inserted).toEqual([]);
  });

  it("picks the newest lead when the email appears more than once", async () => {
    const { db } = fakeDb({
      leads: [
        { id: "old", org_id: "org", email: "test.booking5@example.com", created_at: "2026-01-01" },
        { id: "new", org_id: "org", email: "test.booking5@example.com", created_at: "2026-11-01" },
      ],
    });
    expect(await resolveBookingLead(db, "org", invitee, null)).toBe("new");
  });

  it("never matches a lead in another workspace", async () => {
    const { db, inserted } = fakeDb({
      leads: [{ id: "elsewhere", org_id: "other", email: "test.booking5@example.com" }],
    });
    expect(await resolveBookingLead(db, "org", invitee, null)).toBe("new-1");
    expect(inserted).toHaveLength(1);
  });

  it("does not let an underscore in the email match a different person", async () => {
    // Unescaped, `a_b@x.com` as an ILIKE pattern also matches `aXb@x.com`.
    const { db } = fakeDb({ leads: [{ id: "wrong", org_id: "org", email: "aXb@x.com" }] });
    const id = await resolveBookingLead(
      db,
      "org",
      { ...invitee, uri: "u", email: "a_b@x.com" },
      null,
    );
    expect(id).not.toBe("wrong");
  });

  it("creates a lead from the invitee when nobody has one", async () => {
    const { db, inserted } = fakeDb({ leads: [] });
    expect(await resolveBookingLead(db, "org", invitee, null)).toBe("new-1");
    expect(inserted[0].row).toMatchObject({
      org_id: "org",
      full_name: "Test Booking 5",
      email: "Test.Booking5@Example.com",
      phone: "+12015550205",
      source_connector: "calendly",
      status: "call_booked",
      source_platform: "instagram",
      source_campaign: "tier_verify",
    });
  });

  it("reuses the link on a Calendly retry instead of creating a second lead", async () => {
    const { db, inserted } = fakeDb({
      calls: [
        {
          org_id: "org",
          source_connector: "calendly",
          external_id: invitee.uri,
          lead_id: "linked",
        },
      ],
      leads: [],
    });
    expect(await resolveBookingLead(db, "org", invitee, null)).toBe("linked");
    expect(inserted).toEqual([]);
  });

  it("carries the lead across a reschedule", async () => {
    const { db, inserted } = fakeDb({
      calls: [{ org_id: "org", source_connector: "calendly", external_id: "OLD", lead_id: "orig" }],
      leads: [],
    });
    expect(await resolveBookingLead(db, "org", invitee, "OLD")).toBe("orig");
    expect(inserted).toEqual([]);
  });

  it("returns null rather than inventing a lead when there is no email", async () => {
    const { db, inserted } = fakeDb({ leads: [] });
    expect(await resolveBookingLead(db, "org", { uri: "u" }, null)).toBeNull();
    expect(inserted).toEqual([]);
  });
});

describe("booking rows", () => {
  it("a new lead only writes columns public.leads has", () => {
    const cols = tableColumnsFromMigrations("leads");
    const row = calendlyInviteeToLeadRow("org", invitee);
    expect(Object.keys(row).filter((k) => !cols.has(k))).toEqual([]);
  });

  it("sets lead_id on the call only when it is known", () => {
    const base = { orgId: "org", invitee, scheduledEvent: null };
    expect(calendlyBookingToCallRow({ ...base, leadId: "L" }).lead_id).toBe("L");
    // A failed lookup must not unlink a booking an earlier delivery linked.
    expect("lead_id" in calendlyBookingToCallRow({ ...base, leadId: null })).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLike("first_last%x\\y@a.com")).toBe("first\\_last\\%x\\\\y@a.com");
    expect(escapeLike("plain@example.com")).toBe("plain@example.com");
  });
});
