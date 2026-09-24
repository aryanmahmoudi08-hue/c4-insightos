import { describe, expect, it } from "vitest";
import { fetchMetaInsights, listMetaAdAccounts } from "./meta-ads.server";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("listMetaAdAccounts", () => {
  it("requests currency alongside identity, since currency comes from the account", async () => {
    let called = "";
    await listMetaAdAccounts("tok", async (input) => {
      called = String(input);
      return jsonResponse({ data: [{ id: "act_1", name: "Main", currency: "USD" }] });
    });
    const url = new URL(called);
    expect(url.pathname).toBe("/v25.0/me/adaccounts");
    expect(url.searchParams.get("fields")).toBe("id,name,currency");
    expect(url.searchParams.get("access_token")).toBe("tok");
  });

  it("surfaces Meta's error rather than returning an empty account list", async () => {
    await expect(
      listMetaAdAccounts("tok", async () =>
        jsonResponse({ error: { message: "Invalid OAuth access token." } }),
      ),
    ).rejects.toThrow(/Invalid OAuth access token/);
  });
});

describe("fetchMetaInsights", () => {
  const base = { accountId: "act_1", accessToken: "tok", since: "2026-09-01", until: "2026-09-07" };

  it("asks for daily campaign-level rows over the given range", async () => {
    let called = "";
    await fetchMetaInsights(base, async (input) => {
      called = String(input);
      return jsonResponse({ data: [] });
    });
    const url = new URL(called);
    expect(url.pathname).toBe("/v25.0/act_1/insights");
    expect(url.searchParams.get("level")).toBe("campaign");
    // without time_increment Meta collapses the range into one aggregate row
    expect(url.searchParams.get("time_increment")).toBe("1");
    expect(JSON.parse(url.searchParams.get("time_range")!)).toEqual({
      since: "2026-09-01",
      until: "2026-09-07",
    });
    expect(url.searchParams.get("fields")).toContain("campaign_id");
    expect(url.searchParams.get("fields")).toContain("date_start");
  });

  it("follows paging.next until exhausted and returns every row", async () => {
    let call = 0;
    const rows = await fetchMetaInsights(base, async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({
          data: [{ campaign_id: "c1", date_start: "2026-09-01", spend: "10" }],
          paging: { next: "https://graph.facebook.com/v25.0/act_1/insights?after=abc" },
        });
      }
      return jsonResponse({
        data: [{ campaign_id: "c1", date_start: "2026-09-02", spend: "12" }],
      });
    });
    expect(call).toBe(2);
    expect(rows.map((r) => r.date_start)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("stops rather than looping forever if paging never terminates", async () => {
    let call = 0;
    const rows = await fetchMetaInsights(base, async () => {
      call += 1;
      return jsonResponse({
        data: [{ campaign_id: "c1", date_start: "2026-09-01", spend: "1" }],
        paging: { next: "https://graph.facebook.com/v25.0/act_1/insights?after=same" },
      });
    });
    expect(call).toBe(200);
    expect(rows).toHaveLength(200);
  });

  it("fails loudly on a non-JSON body instead of reporting zero spend", async () => {
    await expect(
      fetchMetaInsights(base, async () => new Response("<html>502</html>", { status: 502 })),
    ).rejects.toThrow(/non-JSON/);
  });
});
