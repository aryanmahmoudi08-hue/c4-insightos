import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDateRange } from "@/hooks/use-date-range";

// operational_work_items isn't in the generated client type snapshot — same
// documented gap the rest of the app already works around (home-rep-dashboard.tsx,
// activity-module.tsx) with this cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedDb = supabase as any;

export type CallbackRow = {
  id: string;
  entity_id: string | null;
  state: string;
  owner_id: string | null;
  due_at: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
  payload: { lead_name?: string } | null;
};

/**
 * Single source of truth for the dialer's logged callbacks — the
 * `operational_work_items` / entity_type "dialer_callback" rows shared by
 * the FAB's "Log a callback" form (src/components/dialer-callback-fab.tsx)
 * and the visible "Upcoming Follow-ups" list (src/components/dialer-followup-list.tsx),
 * so wherever both render on the same page (Home, /inbound-dialer) they
 * always agree, including under Dev Bypass. Dev Bypass has no real Supabase
 * session, so instead of a separate local-state mock store per component
 * instance (which would drift out of sync across the FAB and the list),
 * mutations write straight into this query's own React Query cache entry —
 * every `useDialerCallbacks(orgId, devBypass)` call on the page shares that
 * one cache entry and re-renders together.
 */
export function useDialerCallbacks(orgId: string, devBypass: boolean) {
  const qc = useQueryClient();
  const { range } = useDateRange();
  const queryKey = ["dialer-callbacks", orgId, range.from, range.to] as const;

  const { data: callbacks = [] } = useQuery({
    queryKey,
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await untypedDb
        .from("operational_work_items")
        .select(
          "id, entity_id, state, owner_id, due_at, next_action, created_at, updated_at, payload",
        )
        .eq("org_id", orgId)
        .eq("entity_type", "dialer_callback")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CallbackRow[];
    },
  });

  const logCallback = useMutation({
    mutationFn: async ({
      leadId,
      leadName,
      dueAt,
    }: {
      leadId: string;
      leadName: string;
      dueAt: string;
    }) => {
      const dueIso = dueAt ? new Date(dueAt).toISOString() : null;
      if (devBypass) {
        const now = new Date().toISOString();
        qc.setQueryData<CallbackRow[]>(queryKey, (prev = []) => {
          const existingIdx = prev.findIndex((c) => c.entity_id === leadId);
          const row: CallbackRow = {
            id: existingIdx >= 0 ? prev[existingIdx].id : `dev-callback-${leadId}-${Date.now()}`,
            entity_id: leadId,
            state: "requested",
            owner_id: null,
            due_at: dueIso,
            next_action: "Call back",
            created_at: existingIdx >= 0 ? prev[existingIdx].created_at : now,
            updated_at: now,
            payload: { lead_name: leadName },
          };
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await untypedDb.from("operational_work_items").upsert(
        {
          org_id: orgId,
          entity_type: "dialer_callback",
          entity_id: leadId,
          state: "requested",
          due_at: dueIso,
          next_action: "Call back",
          next_action_at: dueIso,
          payload: { lead_name: leadName },
        },
        { onConflict: "org_id,entity_type,entity_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Callback logged");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["dialer-callbacks", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeCallback = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        qc.setQueryData<CallbackRow[]>(queryKey, (prev = []) =>
          prev.map((c) =>
            c.id === id ? { ...c, state: "completed", updated_at: new Date().toISOString() } : c,
          ),
        );
        return;
      }
      const { error } = await untypedDb
        .from("operational_work_items")
        .update({ state: "completed", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!devBypass) qc.invalidateQueries({ queryKey: ["dialer-callbacks", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCallbacks = callbacks.filter((c) => c.state !== "completed");

  return { callbacks, openCallbacks, logCallback, completeCallback };
}
