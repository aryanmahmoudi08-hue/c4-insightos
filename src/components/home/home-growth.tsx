import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWebinars } from "@/hooks/use-webinars";
import { normalizeAcquisitionSource } from "@/lib/acquisition-source";
import { HomeSection, HomeStat, FocusRow, FocusEmpty } from "./home-shared";
import { Radar, Target, TrendingUp, Users, Video } from "lucide-react";
import { mockGrowthLeadsToday, mockGrowthContentToday } from "@/lib/home-dev-mock-data";

const TODAY = new Date().toISOString().slice(0, 10);

export function HomeGrowth({ orgId }: { orgId: string }) {
  const { devBypass } = useAuth();
  const { webinars, paidWebinars, organicWebinars } = useWebinars();

  const { data: leadsToday = [] } = useQuery({
    queryKey: ["home-growth-leads-today", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockGrowthLeadsToday();
      const { data, error } = await supabase
        .from("leads")
        .select("id, source_platform, created_at")
        .eq("org_id", orgId)
        .gte("created_at", `${TODAY}T00:00:00`)
        .lte("created_at", `${TODAY}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contentToday = [] } = useQuery({
    queryKey: ["home-growth-content-today", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockGrowthContentToday();
      const { data, error } = await supabase
        .from("content_metrics")
        .select("id, views, leads_generated, captured_at")
        .eq("org_id", orgId)
        .gte("captured_at", `${TODAY}T00:00:00`)
        .lte("captured_at", `${TODAY}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const organic = leadsToday.filter(
    (l) => normalizeAcquisitionSource(null, l.source_platform) === "Direct / Organic",
  ).length;
  const paid = leadsToday.length - organic;

  // High-reach content that hasn't produced a single attributed lead yet —
  // a real, computable attention signal (no fabricated "conversion score").
  const highReachNoLeads = contentToday.filter((c) => (c.views ?? 0) > 1000 && !c.leads_generated);

  return (
    <div className="space-y-4">
      <HomeSection title="Growth Today" icon={<TrendingUp className="h-4 w-4" />} tone="cold">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HomeStat
            label="Leads Generated"
            value={leadsToday.length}
            icon={<Users className="h-4 w-4" />}
            tone="cold"
          />
          <HomeStat
            label="Paid Leads"
            value={paid}
            icon={<Target className="h-4 w-4" />}
            tone="cold"
          />
          <HomeStat
            label="Organic Leads"
            value={organic}
            icon={<Radar className="h-4 w-4" />}
            tone="cold"
          />
        </div>
      </HomeSection>

      <HomeSection title="Content Attention" icon={<Radar className="h-4 w-4" />} tone="warning">
        {highReachNoLeads.length === 0 ? (
          <FocusEmpty label="No high-reach, zero-lead content flagged today." />
        ) : (
          <FocusRow
            tone="warning"
            label={`${highReachNoLeads.length} piece${highReachNoLeads.length === 1 ? "" : "s"} with 1,000+ views and no attributed leads today`}
            to="/content"
          />
        )}
      </HomeSection>

      <HomeSection title="Webinars" icon={<Video className="h-4 w-4" />} tone="mid">
        {webinars.length === 0 ? (
          <FocusEmpty label="No webinars tracked yet." />
        ) : (
          <>
            <FocusRow
              label={`${webinars.length} webinar${webinars.length === 1 ? "" : "s"} tracked — ${paidWebinars.length} paid, ${organicWebinars.length} organic`}
              to="/webinar-analytics"
            />
            {webinars.slice(0, 3).map((w) => (
              <FocusRow
                key={w.id}
                label={w.name}
                detail={w.status ?? undefined}
                to="/webinar-analytics"
              />
            ))}
          </>
        )}
      </HomeSection>
    </div>
  );
}
