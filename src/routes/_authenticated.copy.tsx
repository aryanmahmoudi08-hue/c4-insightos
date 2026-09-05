import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockClientDNA } from "@/lib/dev-mock-data";
import { GaugeChart } from "@/components/gauge-chart";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";
import { parseCurrencyToCents } from "@/lib/lead-classification";

export const Route = createFileRoute("/_authenticated/copy")({
  component: CopyOSPage,
});

function useClients() {
  const { devBypass } = useAuth();
  return useQuery({
    queryKey: ["copy_clients", devBypass],
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      if (devBypass) return [mockClientDNA()];
      const { data, error } = await supabase
        .from("copy_clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function CopyOSPage() {
  return (
    <div className="flex-1 min-w-0">
      <TopBar
        title="Client DNA"
        subtitle="Client profile, positioning, and offer/ticket configuration — used across the org."
      />
      <div className="space-y-6 p-4 md:p-6">
        <ClientsTab />
        <OfferConfigSection />
      </div>
    </div>
  );
}

const CADENCE_LABEL: Record<string, string> = {
  single: "Single payment",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  mrr: "MRR",
  custom: "Custom",
};
const OPERATOR_LABEL: Record<string, string> = {
  lt: "is under",
  lte: "is at or under",
  gt: "is over",
  gte: "is at or over",
  eq: "equals",
};

type OfferTier = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};
type Offer = {
  id: string;
  name: string;
  tier_key: string;
  price_cents: number | null;
  pricing_type: "single" | "mrr";
  currency: string;
  is_active: boolean;
  description: string | null;
};
type PaymentPlan = {
  id: string;
  offer_id: string;
  label: string;
  cadence: string;
  installment_amount_cents: number | null;
  installment_count: number | null;
  total_contracted_value_cents: number | null;
  deposit_cents: number | null;
  is_active: boolean;
};
type ClassificationRule = {
  id: string;
  priority: number;
  typeform_field_key: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  threshold_cents: number;
  tier_key: string;
  is_active: boolean;
};

const DEV_TIERS: OfferTier[] = [
  { id: "dev-tier-low", key: "low", label: "Low Ticket", sort_order: 1, is_active: true },
  { id: "dev-tier-high", key: "high", label: "High Ticket", sort_order: 2, is_active: true },
];
const DEV_OFFERS: Offer[] = [
  {
    id: "dev-offer-low",
    name: "Starter Program",
    tier_key: "low",
    price_cents: 100_000,
    pricing_type: "single",
    currency: "USD",
    is_active: true,
    description: "Self-liquidating entry offer.",
  },
  {
    id: "dev-offer-high",
    name: "1:1 Coaching",
    tier_key: "high",
    price_cents: 500_000,
    pricing_type: "single",
    currency: "USD",
    is_active: true,
    description: "Flagship high-ticket offer.",
  },
];
const DEV_PLANS: PaymentPlan[] = [
  {
    id: "dev-plan-1",
    offer_id: "dev-offer-high",
    label: "4-pay plan",
    cadence: "monthly",
    installment_amount_cents: 100_000,
    installment_count: 4,
    total_contracted_value_cents: 500_000,
    deposit_cents: 100_000,
    is_active: true,
  },
];
const DEV_RULES: ClassificationRule[] = [
  {
    id: "dev-rule-low",
    priority: 1,
    typeform_field_key: "investment_budget",
    operator: "lt",
    threshold_cents: 300_000,
    tier_key: "low",
    is_active: true,
  },
  {
    id: "dev-rule-high",
    priority: 2,
    typeform_field_key: "investment_budget",
    operator: "gte",
    threshold_cents: 300_000,
    tier_key: "high",
    is_active: true,
  },
];

function dollars(cents: number | null): string {
  return cents == null ? "" : String(cents / 100);
}
function toCents(input: string): number | null {
  const n = parseCurrencyToCents(input);
  return n;
}

/**
 * Offer / Ticket / Payment configuration — the source of truth for how
 * leads/mentees are classified into ticket tiers and how their payment
 * journey is structured, read by the Dialer's Active Leads tiers and (via
 * lead_classification_rules) the Typeform ingest handler. Dev bypass has no
 * real Supabase session, so every list gets a real, editable local-state
 * fallback here rather than an empty/broken form — same convention as every
 * other interactive workflow in this app.
 */
function OfferConfigSection() {
  const { devBypass } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;
  const qc = useQueryClient();
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (
          k: string,
          v: string,
        ) => { order: (k: string, o?: unknown) => Promise<{ data: unknown; error: unknown }> };
      };
      upsert: (p: unknown) => Promise<{ error: unknown }>;
      delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
    };
  };

  const [devTiers, setDevTiers] = useState<OfferTier[]>(DEV_TIERS);
  const [devOffers, setDevOffers] = useState<Offer[]>(DEV_OFFERS);
  const [devPlans, setDevPlans] = useState<PaymentPlan[]>(DEV_PLANS);
  const [devRules, setDevRules] = useState<ClassificationRule[]>(DEV_RULES);

  const tiersQuery = useQuery({
    queryKey: ["offer-tiers", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await db
        .from("offer_tiers")
        .select("*")
        .eq("org_id", orgId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as OfferTier[];
    },
  });
  const offersQuery = useQuery({
    queryKey: ["offers", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await db
        .from("offers")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
  });
  const plansQuery = useQuery({
    queryKey: ["offer-payment-plans", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await db
        .from("offer_payment_plans")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as PaymentPlan[];
    },
  });
  const rulesQuery = useQuery({
    queryKey: ["lead-classification-rules", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await db
        .from("lead_classification_rules")
        .select("*")
        .eq("org_id", orgId!)
        .order("priority");
      if (error) throw error;
      return (data ?? []) as ClassificationRule[];
    },
  });

  const tiers = useMemo(
    () => (devBypass ? devTiers : (tiersQuery.data ?? [])),
    [devBypass, devTiers, tiersQuery.data],
  );
  const activeTiers = useMemo(() => tiers.filter((t) => t.is_active), [tiers]);
  const offers = devBypass ? devOffers : (offersQuery.data ?? []);
  const plans = devBypass ? devPlans : (plansQuery.data ?? []);
  const rules = devBypass ? devRules : (rulesQuery.data ?? []);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["offer-tiers", orgId] });
    qc.invalidateQueries({ queryKey: ["offers", orgId] });
    qc.invalidateQueries({ queryKey: ["offer-payment-plans", orgId] });
    qc.invalidateQueries({ queryKey: ["lead-classification-rules", orgId] });
  };

  const saveTier = useMutation({
    mutationFn: async (row: OfferTier) => {
      if (devBypass) {
        setDevTiers((prev) => {
          const idx = prev.findIndex((t) => t.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await db.from("offer_tiers").upsert({ ...row, org_id: orgId });
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Deleting a tier must never silently orphan historical records. If
  // anything still references the tier key (an offer, a classification
  // rule, or a lead's recorded ticket_tier), archive it (is_active=false —
  // hidden from new selections, existing records keep resolving to a real
  // configured label) instead of hard-deleting.
  const resolveTier = useMutation({
    mutationFn: async (tier: OfferTier) => {
      if (devBypass) {
        const referenced =
          devOffers.some((o) => o.tier_key === tier.key) ||
          devRules.some((r) => r.tier_key === tier.key);
        if (
          !window.confirm(
            referenced
              ? `"${tier.label}" is used by existing offers/rules. It will be archived (hidden from new selections) rather than deleted, so historical records keep resolving correctly. Continue?`
              : `Delete "${tier.label}"? This cannot be undone.`,
          )
        )
          return;
        if (referenced) {
          setDevTiers((prev) =>
            prev.map((t) => (t.id === tier.id ? { ...t, is_active: false } : t)),
          );
        } else {
          setDevTiers((prev) => prev.filter((t) => t.id !== tier.id));
        }
        return;
      }
      const countDb = supabase as any;
      const [{ count: offerCount }, { count: ruleCount }, { count: leadCount }] = await Promise.all(
        [
          countDb
            .from("offers")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .eq("tier_key", tier.key),
          countDb
            .from("lead_classification_rules")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .eq("tier_key", tier.key),
          countDb
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId!)
            .eq("ticket_tier", tier.key),
        ],
      );
      const referenced = (offerCount ?? 0) + (ruleCount ?? 0) + (leadCount ?? 0) > 0;
      if (
        !window.confirm(
          referenced
            ? `"${tier.label}" is used by ${offerCount ?? 0} offer(s), ${ruleCount ?? 0} rule(s), and ${leadCount ?? 0} lead(s). It will be archived (hidden from new selections) rather than deleted, so those historical records keep resolving correctly. Continue?`
            : `Delete "${tier.label}"? This cannot be undone.`,
        )
      )
        return;
      if (referenced) {
        const { error } = await db
          .from("offer_tiers")
          .upsert({ ...tier, org_id: orgId, is_active: false });
        if (error) throw error as Error;
      } else {
        const { error } = await db.from("offer_tiers").delete().eq("id", tier.id);
        if (error) throw error as Error;
      }
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveOffer = useMutation({
    mutationFn: async (row: Offer) => {
      if (devBypass) {
        setDevOffers((prev) => {
          const idx = prev.findIndex((o) => o.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await db.from("offers").upsert({ ...row, org_id: orgId });
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteOffer = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setDevOffers((prev) => prev.filter((o) => o.id !== id));
        setDevPlans((prev) => prev.filter((p) => p.offer_id !== id));
        return;
      }
      const { error } = await db.from("offers").delete().eq("id", id);
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const savePlan = useMutation({
    mutationFn: async (row: PaymentPlan) => {
      if (devBypass) {
        setDevPlans((prev) => {
          const idx = prev.findIndex((p) => p.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await db.from("offer_payment_plans").upsert({ ...row, org_id: orgId });
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setDevPlans((prev) => prev.filter((p) => p.id !== id));
        return;
      }
      const { error } = await db.from("offer_payment_plans").delete().eq("id", id);
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRule = useMutation({
    mutationFn: async (row: ClassificationRule) => {
      if (devBypass) {
        setDevRules((prev) => {
          const idx = prev.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await db
        .from("lead_classification_rules")
        .upsert({ ...row, org_id: orgId });
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setDevRules((prev) => prev.filter((r) => r.id !== id));
        return;
      }
      const { error } = await db.from("lead_classification_rules").delete().eq("id", id);
      if (error) throw error as Error;
    },
    onSuccess: () => !devBypass && invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-5 p-5">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Offer / Ticket / Payment Configuration
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The source of truth for ticket tiers, offers, payment plans, and how new leads get
          classified — used by Active Leads Available to Dial, Closer offer reporting, and the
          Typeform intake pipeline. Changing this does not alter historical lead/deal records.
        </p>
      </div>

      <TierEditor
        tiers={tiers}
        onSave={(t) => saveTier.mutate(t)}
        onResolve={(t) => resolveTier.mutate(t)}
      />
      <OfferEditor
        tiers={activeTiers}
        offers={offers}
        onSave={(o) => saveOffer.mutate(o)}
        onDelete={(id) => deleteOffer.mutate(id)}
      />
      <PaymentPlanEditor
        offers={offers}
        plans={plans}
        onSave={(p) => savePlan.mutate(p)}
        onDelete={(id) => deletePlan.mutate(id)}
      />
      <ClassificationRuleEditor
        tiers={activeTiers}
        rules={rules}
        onSave={(r) => saveRule.mutate(r)}
        onDelete={(id) => deleteRule.mutate(id)}
      />
    </Card>
  );
}

function TierEditor({
  tiers,
  onSave,
  onResolve,
}: {
  tiers: OfferTier[];
  onSave: (t: OfferTier) => void;
  onResolve: (t: OfferTier) => void;
}) {
  const [draft, setDraft] = useState<Record<string, OfferTier>>({});
  const [newLabel, setNewLabel] = useState("");
  const rowFor = (t: OfferTier) => draft[t.id] ?? t;
  const sorted = useMemo(() => [...tiers].sort((a, b) => a.sort_order - b.sort_order), [tiers]);

  return (
    <div className="space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Ticket tiers
      </div>
      <div className="space-y-1.5">
        {sorted.map((t) => {
          const row = rowFor(t);
          return (
            <div key={t.id} className="flex items-center gap-2">
              <Input
                value={row.label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [t.id]: { ...row, label: e.target.value } }))
                }
                onBlur={() => draft[t.id] && onSave(draft[t.id])}
                disabled={!t.is_active}
                className="h-8 w-56 text-xs"
              />
              <span className="font-mono text-3xs text-muted-foreground">key: {t.key}</span>
              {!t.is_active && (
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-3xs uppercase tracking-wider text-muted-foreground">
                  Archived
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-3xs text-muted-foreground hover:text-foreground"
                onClick={() => (t.is_active ? onResolve(t) : onSave({ ...t, is_active: true }))}
              >
                {t.is_active ? (
                  <>
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </>
                ) : (
                  "Reactivate"
                )}
              </Button>
            </div>
          );
        })}
        {tiers.length === 0 && (
          <p className="text-3xs text-muted-foreground">No tiers configured yet.</p>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New tier name (e.g. VIP)"
          className="h-8 w-56 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!newLabel.trim()}
          onClick={() => {
            const key = newLabel
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");
            if (!key) return;
            onSave({
              id: crypto.randomUUID(),
              key,
              label: newLabel.trim(),
              sort_order: tiers.length + 1,
              is_active: true,
            });
            setNewLabel("");
          }}
        >
          <Plus className="mr-1 h-3 w-3" /> Add tier
        </Button>
      </div>
    </div>
  );
}

function OfferEditor({
  tiers,
  offers,
  onSave,
  onDelete,
}: {
  tiers: OfferTier[];
  offers: Offer[];
  onSave: (o: Offer) => void;
  onDelete: (id: string) => void;
}) {
  const blank = (): Offer => ({
    id: crypto.randomUUID(),
    name: "",
    tier_key: tiers[0]?.key ?? "",
    price_cents: null,
    pricing_type: "single",
    currency: "USD",
    is_active: true,
    description: null,
  });
  const [adding, setAdding] = useState<Offer | null>(null);
  const [draft, setDraft] = useState<Record<string, Offer>>({});
  const rowFor = (o: Offer) => draft[o.id] ?? o;
  const update = (o: Offer, patch: Partial<Offer>) =>
    setDraft((d) => ({ ...d, [o.id]: { ...o, ...patch } }));

  const OfferRow = ({ o, isNew }: { o: Offer; isNew?: boolean }) => {
    const row = isNew ? o : rowFor(o);
    const commit = (patch: Partial<Offer>) => {
      const next = { ...row, ...patch };
      if (isNew) setAdding(next);
      else update(o, patch);
    };
    return (
      <div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-6">
        <Input
          value={row.name}
          onChange={(e) => commit({ name: e.target.value })}
          onBlur={() => !isNew && draft[o.id] && onSave(draft[o.id])}
          placeholder="Offer name"
          className="h-8 text-xs sm:col-span-2"
        />
        <Select value={row.tier_key} onValueChange={(v) => commit({ tier_key: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            {tiers.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={dollars(row.price_cents)}
          onChange={(e) => commit({ price_cents: toCents(e.target.value) })}
          onBlur={() => !isNew && draft[o.id] && onSave(draft[o.id])}
          placeholder="Price ($)"
          className="h-8 text-xs"
        />
        <Select
          value={row.pricing_type}
          onValueChange={(v) => commit({ pricing_type: v as Offer["pricing_type"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single payment</SelectItem>
            <SelectItem value="mrr">MRR / recurring</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            checked={row.is_active}
            onCheckedChange={(v) => {
              commit({ is_active: v });
              if (!isNew) onSave({ ...row, is_active: v });
            }}
          />
          <span className="text-3xs text-muted-foreground">
            {row.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        <Textarea
          value={row.description ?? ""}
          onChange={(e) => commit({ description: e.target.value || null })}
          onBlur={() => !isNew && draft[o.id] && onSave(draft[o.id])}
          placeholder="Description / notes"
          rows={1}
          className="text-xs sm:col-span-5"
        />
        {isNew ? (
          <Button
            type="button"
            size="sm"
            disabled={!row.name.trim() || !row.tier_key}
            onClick={() => {
              onSave(row);
              setAdding(null);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Add offer
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(o.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Offers
      </div>
      <div className="space-y-2">
        {offers.map((o) => (
          <OfferRow key={o.id} o={o} />
        ))}
        {offers.length === 0 && (
          <p className="text-3xs text-muted-foreground">No offers configured yet.</p>
        )}
      </div>
      {adding ? (
        <OfferRow o={adding} isNew />
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(blank())}>
          <Plus className="mr-1 h-3 w-3" /> New offer
        </Button>
      )}
    </div>
  );
}

function PaymentPlanEditor({
  offers,
  plans,
  onSave,
  onDelete,
}: {
  offers: Offer[];
  plans: PaymentPlan[];
  onSave: (p: PaymentPlan) => void;
  onDelete: (id: string) => void;
}) {
  const blank = (): PaymentPlan => ({
    id: crypto.randomUUID(),
    offer_id: offers[0]?.id ?? "",
    label: "",
    cadence: "single",
    installment_amount_cents: null,
    installment_count: null,
    total_contracted_value_cents: null,
    deposit_cents: null,
    is_active: true,
  });
  const [adding, setAdding] = useState<PaymentPlan | null>(null);
  const [draft, setDraft] = useState<Record<string, PaymentPlan>>({});
  const rowFor = (p: PaymentPlan) => draft[p.id] ?? p;
  const update = (p: PaymentPlan, patch: Partial<PaymentPlan>) =>
    setDraft((d) => ({ ...d, [p.id]: { ...p, ...patch } }));
  const offerName = (id: string) => offers.find((o) => o.id === id)?.name ?? "Unknown offer";

  const PlanRow = ({ p, isNew }: { p: PaymentPlan; isNew?: boolean }) => {
    const row = isNew ? p : rowFor(p);
    const commit = (patch: Partial<PaymentPlan>) => {
      const next = { ...row, ...patch };
      if (isNew) setAdding(next);
      else update(p, patch);
    };
    return (
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-7">
        <Select value={row.offer_id} onValueChange={(v) => commit({ offer_id: v })}>
          <SelectTrigger className="h-8 text-xs sm:col-span-2">
            <SelectValue placeholder="Offer" />
          </SelectTrigger>
          <SelectContent>
            {offers.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={row.label}
          onChange={(e) => commit({ label: e.target.value })}
          onBlur={() => !isNew && draft[p.id] && onSave(draft[p.id])}
          placeholder="Plan label"
          className="h-8 text-xs"
        />
        <Select value={row.cadence} onValueChange={(v) => commit({ cadence: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CADENCE_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={dollars(row.deposit_cents)}
          onChange={(e) => commit({ deposit_cents: toCents(e.target.value) })}
          onBlur={() => !isNew && draft[p.id] && onSave(draft[p.id])}
          placeholder="Deposit ($)"
          className="h-8 text-xs"
        />
        <Input
          value={dollars(row.installment_amount_cents)}
          onChange={(e) => commit({ installment_amount_cents: toCents(e.target.value) })}
          onBlur={() => !isNew && draft[p.id] && onSave(draft[p.id])}
          placeholder="Installment ($)"
          className="h-8 text-xs"
        />
        <Input
          value={row.installment_count == null ? "" : String(row.installment_count)}
          onChange={(e) =>
            commit({ installment_count: e.target.value ? Number(e.target.value) || null : null })
          }
          onBlur={() => !isNew && draft[p.id] && onSave(draft[p.id])}
          placeholder="# installments"
          className="h-8 text-xs"
        />
        <Input
          value={dollars(row.total_contracted_value_cents)}
          onChange={(e) => commit({ total_contracted_value_cents: toCents(e.target.value) })}
          onBlur={() => !isNew && draft[p.id] && onSave(draft[p.id])}
          placeholder="Total contracted value ($)"
          className="h-8 text-xs sm:col-span-2"
        />
        {isNew ? (
          <Button
            type="button"
            size="sm"
            disabled={!row.label.trim() || !row.offer_id}
            onClick={() => {
              onSave(row);
              setAdding(null);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> Add plan
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(p.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Payment plans
      </div>
      <p className="text-3xs text-muted-foreground">
        Each offer can support more than one plan — e.g. paid-in-full and a 4-pay plan on the same
        offer.
      </p>
      <div className="space-y-2">
        {plans.map((p) => (
          <div key={p.id}>
            <div className="mb-1 text-3xs text-muted-foreground">{offerName(p.offer_id)}</div>
            <PlanRow p={p} />
          </div>
        ))}
        {plans.length === 0 && (
          <p className="text-3xs text-muted-foreground">No payment plans configured yet.</p>
        )}
      </div>
      {adding ? (
        <PlanRow p={adding} isNew />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={offers.length === 0}
          onClick={() => setAdding(blank())}
        >
          <Plus className="mr-1 h-3 w-3" /> New payment plan
        </Button>
      )}
    </div>
  );
}

function ClassificationRuleEditor({
  tiers,
  rules,
  onSave,
  onDelete,
}: {
  tiers: OfferTier[];
  rules: ClassificationRule[];
  onSave: (r: ClassificationRule) => void;
  onDelete: (id: string) => void;
}) {
  const blank = (): ClassificationRule => ({
    id: crypto.randomUUID(),
    priority: (Math.max(0, ...rules.map((r) => r.priority)) || 0) + 1,
    typeform_field_key: "",
    operator: "lt",
    threshold_cents: 0,
    tier_key: tiers[0]?.key ?? "",
    is_active: true,
  });
  const [adding, setAdding] = useState<ClassificationRule | null>(null);
  const [draft, setDraft] = useState<Record<string, ClassificationRule>>({});
  const rowFor = (r: ClassificationRule) => draft[r.id] ?? r;
  const update = (r: ClassificationRule, patch: Partial<ClassificationRule>) =>
    setDraft((d) => ({ ...d, [r.id]: { ...r, ...patch } }));
  const sorted = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules]);

  const RuleRow = ({ r, isNew }: { r: ClassificationRule; isNew?: boolean }) => {
    const row = isNew ? r : rowFor(r);
    const commit = (patch: Partial<ClassificationRule>) => {
      const next = { ...row, ...patch };
      if (isNew) setAdding(next);
      else update(r, patch);
    };
    return (
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-6">
        <Input
          value={String(row.priority)}
          onChange={(e) => commit({ priority: Number(e.target.value) || 0 })}
          onBlur={() => !isNew && draft[r.id] && onSave(draft[r.id])}
          placeholder="Priority"
          className="h-8 text-xs"
        />
        <Input
          value={row.typeform_field_key}
          onChange={(e) => commit({ typeform_field_key: e.target.value })}
          onBlur={() => !isNew && draft[r.id] && onSave(draft[r.id])}
          placeholder="Typeform field key (e.g. investment_budget)"
          className="h-8 text-xs sm:col-span-2"
        />
        <Select
          value={row.operator}
          onValueChange={(v) => commit({ operator: v as ClassificationRule["operator"] })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(OPERATOR_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={dollars(row.threshold_cents)}
          onChange={(e) => commit({ threshold_cents: toCents(e.target.value) ?? 0 })}
          onBlur={() => !isNew && draft[r.id] && onSave(draft[r.id])}
          placeholder="Threshold ($)"
          className="h-8 text-xs"
        />
        <Select value={row.tier_key} onValueChange={(v) => commit({ tier_key: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="→ tier" />
          </SelectTrigger>
          <SelectContent>
            {tiers.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center justify-between gap-2 sm:col-span-6">
          <div className="flex items-center gap-2">
            <Switch
              checked={row.is_active}
              onCheckedChange={(v) => {
                commit({ is_active: v });
                if (!isNew) onSave({ ...row, is_active: v });
              }}
            />
            <span className="text-3xs text-muted-foreground">
              {row.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {isNew ? (
            <Button
              type="button"
              size="sm"
              disabled={!row.typeform_field_key.trim() || !row.tier_key}
              onClick={() => {
                onSave(row);
                setAdding(null);
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Add rule
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(r.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Low / High ticket classification rules
      </div>
      <p className="text-3xs text-muted-foreground">
        Evaluated in priority order (lowest first) against the raw Typeform response for the field
        key below. The first rule whose field is present and matches wins. If no rule matches — the
        field is missing, or its answer can't be read as a dollar amount — the lead is left Unknown
        / Unclassified rather than guessed. Example: priority 1 "investment_budget is under $3,000 →
        Low Ticket", priority 2 "investment_budget is at or over $3,000 → High Ticket".
      </p>
      <div className="space-y-2">
        {sorted.map((r) => (
          <RuleRow key={r.id} r={r} />
        ))}
        {rules.length === 0 && (
          <p className="text-3xs text-muted-foreground">No classification rules configured yet.</p>
        )}
      </div>
      {adding ? (
        <RuleRow r={adding} isNew />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={tiers.length === 0}
          onClick={() => setAdding(blank())}
        >
          <Plus className="mr-1 h-3 w-3" /> New rule
        </Button>
      )}
    </div>
  );
}

function ClientAvatar({ path, onPick }: { path: string | null; onPick: (f: File) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let live = true;
    supabase.storage
      .from("copy-swipes")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (live && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      live = false;
    };
  }, [path]);
  return (
    <label className="group relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-muted/40 grid place-items-center">
      {url ? (
        <img src={url} alt="Client photo" className="h-full w-full object-cover" />
      ) : (
        <div className="text-center text-3xs text-muted-foreground px-2">
          <ImagePlus className="h-5 w-5 mx-auto mb-1" />
          Add photo
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <span className="absolute inset-x-0 bottom-0 hidden bg-background/80 py-0.5 text-center text-4xs uppercase tracking-wider group-hover:block">
        Change
      </span>
    </label>
  );
}

/** Client DNA — one client, one always-open profile. No list, no edit click. */
function ClientsTab() {
  const qc = useQueryClient();
  const { devBypass } = useAuth();
  const { data: clients = [], isLoading } = useClients();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const client = clients[0] as Record<string, unknown> | undefined;

  useEffect(() => {
    if (isLoading) return;
    setForm(client ? { ...client } : { display_name: "", offer_details: {}, avatar_research: {} });
  }, [client?.id, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: unknown) => setForm((f) => ({ ...(f ?? {}), [k]: v }));

  const num = (v: unknown) => {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    const f = form;
    if (!f) return;
    if (!String(f.display_name ?? "").trim()) return toast.error("Client name is required.");
    setSaving(true);
    const payload = {
      display_name: String(f.display_name).trim(),
      niche: (f.niche as string) || null,
      bio: (f.bio as string) || null,
      location: (f.location as string) || null,
      age: num(f.age),
      avatar_url: (f.avatar_url as string) || null,
      instagram_handle: (f.instagram_handle as string) || null,
      instagram_followers: num(f.instagram_followers),
      tiktok_handle: (f.tiktok_handle as string) || null,
      tiktok_followers: num(f.tiktok_followers),
      youtube_handle: (f.youtube_handle as string) || null,
      youtube_subscribers: num(f.youtube_subscribers),
      business_stage: (f.business_stage as string) || null,
      monthly_revenue_cents:
        f.monthly_revenue_cents == null || f.monthly_revenue_cents === ""
          ? null
          : Math.round(Number(String(f.monthly_revenue_cents).replace(/[^\d.]/g, "")) * 100),
      offer_price_cents:
        f.offer_price_cents == null || f.offer_price_cents === ""
          ? null
          : Math.round(Number(String(f.offer_price_cents).replace(/[^\d.]/g, "")) * 100),
      content_pillars: (f.content_pillars as string) || null,
      goals: (f.goals as string) || null,
      dream_outcome: (f.dream_outcome as string) || null,
      proof_assets: (f.proof_assets as string) || null,
      sacred_cows: (f.sacred_cows as string) || null,
      competitors: (f.competitors as string) || null,
      voice_transcripts: (f.voice_transcripts as string) || null,
      notes: (f.notes as string) || null,
      offer_details: (f.offer_details ?? {}) as never,
      avatar_research: (f.avatar_research ?? {}) as never,
    };
    const table = supabase.from("copy_clients") as never as {
      update: (p: unknown) => {
        eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
      insert: (p: unknown) => Promise<{ error: { message: string } | null }>;
    };
    let error: { message: string } | null = null;
    if (f.id) {
      ({ error } = await table.update(payload).eq("id", f.id as string));
    } else {
      const { data: m } = await supabase
        .from("memberships")
        .select("org_id")
        .limit(1)
        .maybeSingle();
      if (!m?.org_id) {
        setSaving(false);
        return toast.error("No workspace");
      }
      ({ error } = await table.insert({ ...payload, org_id: m.org_id }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["copy_clients"] });
    toast.success("Client DNA saved.");
  };

  const pickAvatar = async (file: File) => {
    const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
    if (!m?.org_id) return toast.error("No workspace");
    const ext = file.name.split(".").pop() || "png";
    const path = `${m.org_id}/avatars/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("copy-swipes")
      .upload(path, file, { contentType: file.type });
    if (error) return toast.error(error.message);
    set("avatar_url", path);
    toast.success("Photo attached — hit save.");
  };

  if (!form) return <div className="text-sm text-muted-foreground">Loading client DNA…</div>;
  const e = form as Record<string, unknown> & { _offer_text?: string; _avatar_text?: string };
  const socials = [
    {
      key: "instagram_handle",
      count: "instagram_followers",
      label: "Instagram",
      unit: "followers",
    },
    { key: "tiktok_handle", count: "tiktok_followers", label: "TikTok", unit: "followers" },
    { key: "youtube_handle", count: "youtube_subscribers", label: "YouTube", unit: "subscribers" },
  ];

  // Positioning score — real completeness metric, not a fabricated "brand score".
  const SCORE_FIELDS = [
    "niche",
    "bio",
    "location",
    "instagram_handle",
    "business_stage",
    "monthly_revenue_cents",
    "offer_price_cents",
    "content_pillars",
    "goals",
    "dream_outcome",
    "proof_assets",
    "sacred_cows",
    "competitors",
    "voice_transcripts",
  ];
  const filledCount = SCORE_FIELDS.filter((k) => {
    const v = e[k];
    return v !== null && v !== undefined && String(v).trim() !== "";
  }).length;
  const positioningScore = Math.round((filledCount / SCORE_FIELDS.length) * 100);
  const totalReach =
    (Number(e.instagram_followers) || 0) +
    (Number(e.tiktok_followers) || 0) +
    (Number(e.youtube_subscribers) || 0);
  const reachMax = Math.max(
    1,
    Number(e.instagram_followers) || 0,
    Number(e.tiktok_followers) || 0,
    Number(e.youtube_subscribers) || 0,
  );
  const reachRadar = socials.map((s) => ({
    channel: s.label,
    pct: Math.round(((Number(e[s.count]) || 0) / reachMax) * 100),
  }));

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Positioning snapshot — gauge + reach radar + parameter cards + asset badges */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center justify-center">
          <GaugeChart value={positioningScore} label="Profile completeness" tone="var(--accent)" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2">
            Reach by channel (relative)
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <RadarChart data={reachRadar} outerRadius={55}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="channel" fontSize={10} stroke="var(--muted-foreground)" />
              <Radar dataKey="pct" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-3 content-start">
          <div className="hover-lift rounded-lg border border-border bg-card p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">
              Total reach
            </div>
            <div className="mt-1 font-mono text-lg font-semibold">
              {totalReach.toLocaleString()}
            </div>
          </div>
          <div className="hover-lift rounded-lg border border-border bg-card p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">
              Business stage
            </div>
            <div className="mt-1 text-xs font-medium truncate">
              {(e.business_stage as string) || "—"}
            </div>
          </div>
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {e.proof_assets ? (
              <span className="badge-glass normal-case tracking-normal">Proof assets logged</span>
            ) : null}
            {socials
              .filter((s) => e[s.key])
              .map((s) => (
                <span key={s.key} className="badge-glass normal-case tracking-normal text-accent">
                  {s.label}: {e[s.key] as string}
                </span>
              ))}
          </div>
        </div>
      </div>

      {/* Profile header — always open, no edit click */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          <ClientAvatar path={(e.avatar_url as string) ?? null} onPick={pickAvatar} />
          <div className="flex-1 space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Client name</label>
                <Input
                  value={(e.display_name as string) ?? ""}
                  onChange={(ev) => set("display_name", ev.target.value)}
                  placeholder="Who we write for"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Age</label>
                <Input
                  value={String(e.age ?? "")}
                  onChange={(ev) => set("age", ev.target.value)}
                  placeholder="27"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">Niche</label>
                <Input
                  value={(e.niche as string) ?? ""}
                  onChange={(ev) => set("niche", ev.target.value)}
                  placeholder="e.g. high-ticket coaching for gym owners"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Location</label>
                <Input
                  value={(e.location as string) ?? ""}
                  onChange={(ev) => set("location", ev.target.value)}
                  placeholder="Toronto, CA"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Short bio — who he is in one paragraph
              </label>
              <Textarea
                rows={2}
                value={(e.bio as string) ?? ""}
                onChange={(ev) => set("bio", ev.target.value)}
                placeholder="Background, credibility, what he's known for"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Reach + business */}
      <Card className="p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Reach & business
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {socials.map((s) => (
            <div key={s.key} className="rounded-md border border-border p-3 space-y-2">
              <div className="text-xs font-medium">{s.label}</div>
              <Input
                value={(e[s.key] as string) ?? ""}
                onChange={(ev) => set(s.key, ev.target.value)}
                placeholder="@handle"
              />
              <Input
                value={String(e[s.count] ?? "")}
                onChange={(ev) => set(s.count, ev.target.value)}
                placeholder={s.unit}
              />
            </div>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Business stage</label>
            <Input
              value={(e.business_stage as string) ?? ""}
              onChange={(ev) => set("business_stage", ev.target.value)}
              placeholder="Pre-offer / $10k mo / scaling"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Monthly revenue ($)</label>
            <Input
              value={
                e.monthly_revenue_cents != null && typeof e.monthly_revenue_cents === "number"
                  ? String((e.monthly_revenue_cents as number) / 100)
                  : String(e.monthly_revenue_cents ?? "")
              }
              onChange={(ev) => set("monthly_revenue_cents", ev.target.value)}
              placeholder="25000"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Offer price ($)</label>
            <Input
              value={
                e.offer_price_cents != null && typeof e.offer_price_cents === "number"
                  ? String((e.offer_price_cents as number) / 100)
                  : String(e.offer_price_cents ?? "")
              }
              onChange={(ev) => set("offer_price_cents", ev.target.value)}
              placeholder="5000"
            />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Content pillars</label>
            <Textarea
              rows={2}
              value={(e.content_pillars as string) ?? ""}
              onChange={(ev) => set("content_pillars", ev.target.value)}
              placeholder="The 3-5 themes he posts about"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Proof / receipts we can cite</label>
            <Textarea
              rows={2}
              value={(e.proof_assets as string) ?? ""}
              onChange={(ev) => set("proof_assets", ev.target.value)}
              placeholder="Student results, screenshots, numbers, credentials"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">His goals (next 90 days)</label>
            <Textarea
              rows={2}
              value={(e.goals as string) ?? ""}
              onChange={(ev) => set("goals", ev.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dream outcome (12 months)</label>
            <Textarea
              rows={2}
              value={(e.dream_outcome as string) ?? ""}
              onChange={(ev) => set("dream_outcome", ev.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex flex-wrap gap-2 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save client DNA"}
        </Button>
      </div>
    </div>
  );
}
