import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Flag, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { createDmClaimFn } from "@/lib/dm-claims.functions";

type Member = { id: string; name: string; role: string | null; user_id: string | null };
type Claim = {
  id: string;
  setter_name: string | null;
  lead_name: string | null;
  platform: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  matched_lead_id: string | null;
  created_at: string;
};

/**
 * Claim a DM lead: when a setter sends their link, they log who it went to.
 * If that person applies from another phone or browser (so the link's tag is
 * lost), the application still matches the claim and is theirs: labelled
 * "DM LEAD" in Discord and kept off the dialers' list.
 */
export function DmClaimsPanel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { user, devBypass } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createDmClaimFn);

  const [setterId, setSetterId] = useState<string>("");
  const [platform, setPlatform] = useState<string>("instagram");
  const [leadName, setLeadName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["dm-claim-setters", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as never)
        .select("id, name, role, user_id")
        .eq("org_id", orgId!)
        .eq("active", true);
      if (error) throw error;
      return ((data ?? []) as Member[]).filter((m) => (m.role ?? "").includes("setter"));
    },
  });
  // Default to the signed-in rep's own roster entry.
  const mine = useMemo(
    () => members.find((m) => m.user_id === user?.id)?.id ?? "",
    [members, user],
  );
  const chosenSetter = setterId || mine;

  const { data: claims = [] } = useQuery({
    queryKey: ["dm-claims", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dm_claims" as never)
        .select(
          "id, setter_name, lead_name, platform, handle, email, phone, matched_lead_id, created_at",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Claim[];
    },
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          org_id: orgId!,
          setter_member_id: chosenSetter || null,
          lead_name: leadName || null,
          platform: (platform as "instagram" | "tiktok" | "linkedin" | "other") || null,
          handle: handle || null,
          email: email || null,
          phone: phone || null,
          notes: null,
        },
      }),
    onSuccess: (r) => {
      setLeadName("");
      setHandle("");
      setEmail("");
      setPhone("");
      toast.success(
        r.matchedLeadName
          ? `Claimed. ${r.matchedLeadName} already applied, and they're now yours.`
          : "Claimed. When they apply, they're yours.",
      );
      qc.invalidateQueries({ queryKey: ["dm-claims", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the claim"),
  });

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center gap-2 border-b border-border/70 pb-3">
        <Flag className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
            Claim a DM lead
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">
            Log who you sent your link to. If they apply from another phone or browser, they're
            still yours, and dialers won't call them.
          </div>
        </div>
      </div>

      <form
        className="mt-3 grid gap-2 md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!orgId) return;
          create.mutate();
        }}
      >
        <Select value={chosenSetter} onValueChange={setSetterId}>
          <SelectTrigger className="h-9 md:col-span-1" aria-label="Setter">
            <SelectValue placeholder="Setter" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="h-9 md:col-span-1" aria-label="Platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-9 md:col-span-1"
          placeholder="Full name"
          value={leadName}
          onChange={(e) => setLeadName(e.target.value)}
        />
        <Input
          className="h-9 md:col-span-1"
          placeholder="@handle or profile link"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <Input
          className="h-9 md:col-span-1"
          placeholder="Email (if you have it)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex gap-2 md:col-span-1">
          <Input
            className="h-9"
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" size="sm" className="h-9" disabled={create.isPending || !orgId}>
            {create.isPending ? "…" : "Claim"}
          </Button>
        </div>
      </form>

      {claims.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent claims
          </div>
          {claims.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
            >
              <span className="font-medium text-foreground">
                {c.lead_name || c.handle || c.email || c.phone}
                {c.lead_name && c.handle ? (
                  <span className="ml-1.5 text-muted-foreground">{c.handle}</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {c.setter_name ?? "Unassigned"} · {c.platform ?? "—"} ·{" "}
                {new Date(c.created_at).toLocaleDateString()}
              </span>
              {c.matched_lead_id ? (
                <span className="inline-flex items-center gap-1 text-[color:var(--color-success)]">
                  <Check className="h-3.5 w-3.5" /> Applied, yours
                </span>
              ) : (
                <span className="text-muted-foreground">Waiting for application</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
