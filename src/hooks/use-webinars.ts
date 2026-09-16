import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createMockWebinarFixture } from "@/lib/webinar-mock-data";
import type { WebinarRecord } from "@/lib/webinar-filter";

// Webinar tables are from the additive analytics migration and are not yet
// present in the generated client type snapshot — same cast this table
// already required in webinar-analytics.tsx before this hook existed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * The org's real webinars, with their `webinar_type` classification — the
 * single data source behind every "Webinar" filter dropdown in the app.
 * Real records only: dev-bypass sessions (no live Supabase session) get the
 * same documented mock fixture used elsewhere, never a fabricated org query.
 */
export function useWebinars() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;

  const query = useQuery({
    queryKey: ["webinars-filter", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async (): Promise<WebinarRecord[]> => {
      if (devBypass) {
        const fixture = createMockWebinarFixture();
        return fixture.webinars.map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status,
          starts_at: w.starts_at,
          webinar_type: w.webinar_type ?? "unclassified",
        }));
      }
      const { data, error } = await db
        .from("webinars")
        .select("id,name,status,starts_at,webinar_type")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        status: (row.status as string | null) ?? null,
        starts_at: (row.starts_at as string | null) ?? null,
        webinar_type: (row.webinar_type as WebinarRecord["webinar_type"]) ?? "unclassified",
      }));
    },
    retry: false,
  });

  const webinars = useMemo(() => query.data ?? [], [query.data]);
  const webinarsById = useMemo(() => new Map(webinars.map((w) => [w.id, w])), [webinars]);
  const paidWebinars = useMemo(() => webinars.filter((w) => w.webinar_type === "paid"), [webinars]);
  const organicWebinars = useMemo(
    () => webinars.filter((w) => w.webinar_type === "organic"),
    [webinars],
  );
  const unclassifiedWebinars = useMemo(
    () => webinars.filter((w) => w.webinar_type === "unclassified"),
    [webinars],
  );

  return {
    ...query,
    webinars,
    webinarsById,
    paidWebinars,
    organicWebinars,
    unclassifiedWebinars,
  };
}
