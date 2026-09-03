import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { extractFingerprintFn } from "@/lib/copy-os.functions";
import { ImagePlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { mockClientDNA, mockVoiceFingerprint, withMockDelay } from "@/lib/dev-mock-data";
import { GaugeChart } from "@/components/gauge-chart";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from "recharts";

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
        subtitle="C4's client voice, positioning and persuasion profile — used across the org."
      />
      <div className="p-4 md:p-6">
        <ClientsTab />
      </div>
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
  const fpFn = useServerFn(extractFingerprintFn);
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
            {e.voice_fingerprint ? (
              <span className="badge-glass normal-case tracking-normal text-[color:var(--color-success)]">
                <span className="status-dot" />
                Voice fingerprint
              </span>
            ) : null}
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

      {/* Persuasion DNA */}
      <Card className="p-5 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Persuasion DNA
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Offer details (promise, mechanism, price, objections)
          </label>
          <Textarea
            rows={3}
            value={e._offer_text ?? JSON.stringify(e.offer_details ?? {}, null, 2)}
            onChange={(ev) => {
              try {
                setForm({
                  ...e,
                  offer_details: JSON.parse(ev.target.value),
                  _offer_text: ev.target.value,
                });
              } catch {
                setForm({ ...e, _offer_text: ev.target.value });
              }
            }}
            placeholder='{"promise":"...","mechanism":"...","price":"...","objections":["..."]}'
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Avatar — dreams, fears, suspicions, past failures, enemies
          </label>
          <Textarea
            rows={3}
            value={e._avatar_text ?? JSON.stringify(e.avatar_research ?? {}, null, 2)}
            onChange={(ev) => {
              try {
                setForm({
                  ...e,
                  avatar_research: JSON.parse(ev.target.value),
                  _avatar_text: ev.target.value,
                });
              } catch {
                setForm({ ...e, _avatar_text: ev.target.value });
              }
            }}
            placeholder='{"dreams":"...","fears":"...","suspicions":"...","past_failures":"...","enemies":"..."}'
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Sacred cows he kills</label>
            <Textarea
              rows={2}
              value={(e.sacred_cows as string) ?? ""}
              onChange={(ev) => set("sacred_cows", ev.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Competitors / enemies</label>
            <Textarea
              rows={2}
              value={(e.competitors as string) ?? ""}
              onChange={(ev) => set("competitors", ev.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">
            Voice transcripts (paste his existing video transcripts)
          </label>
          <Textarea
            rows={6}
            value={(e.voice_transcripts as string) ?? ""}
            onChange={(ev) => set("voice_transcripts", ev.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Notes</label>
          <Textarea
            rows={2}
            value={(e.notes as string) ?? ""}
            onChange={(ev) => set("notes", ev.target.value)}
          />
        </div>
        {e.voice_fingerprint ? (
          <div className="text-xs">
            <Badge variant="outline">Voice fingerprint extracted</Badge>
            <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/30 p-2 text-3xs text-muted-foreground">
              {JSON.stringify(e.voice_fingerprint, null, 2)}
            </pre>
          </div>
        ) : null}
      </Card>

      <div className="sticky bottom-4 flex flex-wrap gap-2 rounded-lg border border-border bg-card/95 p-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save client DNA"}
        </Button>
        {e.id && e.voice_transcripts ? (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const fp = devBypass
                  ? await withMockDelay(mockVoiceFingerprint())
                  : await fpFn({ data: { client_id: e.id as string } });
                setForm({ ...e, voice_fingerprint: fp });
                toast.success("Voice fingerprint extracted");
                if (!devBypass) qc.invalidateQueries({ queryKey: ["copy_clients"] });
              } catch (err: unknown) {
                toast.error((err as Error)?.message ?? "Failed");
              }
            }}
          >
            Extract voice fingerprint
          </Button>
        ) : null}
      </div>
    </div>
  );
}
