import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { useCurrentOrg } from "@/hooks/use-auth";
import { createTrackedLinkFn, listTrackedLinksFn } from "@/lib/tracked-links.functions";

/**
 * Trackable links: paste a destination, get a short link, see real clicks.
 *
 * Sits beside the EOD's self-reported `links_sent` deliberately — that number
 * is what a rep says they sent, this one is what recipients actually opened.
 * Keeping both visible is the point; replacing one with the other would hide
 * the gap that makes the pair useful.
 */
export function TrackedLinksPanel({ orgId }: { orgId?: string }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createTrackedLinkFn);
  const listFn = useServerFn(listTrackedLinksFn);
  const [destination, setDestination] = useState("");
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data: links, isPending } = useQuery({
    queryKey: ["tracked-links", orgId],
    enabled: !!orgId,
    queryFn: () => listFn({ data: { orgId: orgId! } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({ data: { orgId: orgId!, destinationUrl: destination, label: label || null } }),
    onSuccess: () => {
      setDestination("");
      setLabel("");
      toast.success("Link created");
      qc.invalidateQueries({ queryKey: ["tracked-links", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/l/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex items-center gap-2 border-b border-border/70 pb-3">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
            Trackable links
          </div>
          <div className="mt-0.5 text-2xs text-muted-foreground">
            Real clicks — separate from the links-sent count on the EOD
          </div>
        </div>
      </div>

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!orgId || !destination.trim()) return;
          create.mutate();
        }}
      >
        <Input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="https://your-vsl-or-booking-page.com"
          className="h-9 min-w-0 flex-1"
          aria-label="Destination URL"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="h-9 w-40"
          aria-label="Label"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!orgId || !destination.trim() || create.isPending}
        >
          {create.isPending ? "Creating…" : "Create link"}
        </Button>
      </form>

      <div className="mt-3 space-y-1.5">
        {isPending && <div className="text-2xs text-muted-foreground">Loading…</div>}
        {!isPending && !links?.length && (
          <EmptyState
            icon={<Link2 className="h-4 w-4" />}
            title="No trackable links yet"
            description="Create one above, send it instead of the raw URL, and clicks show up here."
          />
        )}
        {links?.map((l) => (
          <div
            key={l.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2"
          >
            <button
              type="button"
              onClick={() => copy(l.token)}
              className="flex items-center gap-1 font-sans text-xs text-foreground hover:underline"
              title="Copy link"
            >
              {copied === l.token ? (
                <Check className="h-3 w-3 text-[color:var(--color-success)]" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              /l/{l.token}
            </button>
            <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
              {l.label ? `${l.label} — ` : ""}
              {l.destinationUrl}
            </span>
            <span className="shrink-0 font-sans text-sm font-bold tabular-nums text-foreground">
              {l.clicks}
            </span>
            <span className="shrink-0 text-3xs uppercase tracking-wide text-muted-foreground">
              {l.clicks === 1 ? "click" : "clicks"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convenience wrapper for routes that don't already hold the org. */
export function TrackedLinksPanelForCurrentOrg() {
  const { data: org } = useCurrentOrg();
  return <TrackedLinksPanel orgId={org?.org_id} />;
}
