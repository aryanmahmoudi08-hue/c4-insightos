import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** The real `public.webinars` shape this form writes — see
 * 20260827090000_analytics_expansion_foundation.sql (name/slug/status/
 * registration_url/starts_at/notes) plus 20260916090000's webinar_type. */
export type WebinarFormValues = {
  id?: string;
  name: string;
  webinar_type: "paid" | "organic" | "unclassified";
  status: "draft" | "active" | "archived";
  starts_at: string | null;
  registration_url: string | null;
  notes: string | null;
};

const EMPTY: WebinarFormValues = {
  name: "",
  webinar_type: "unclassified",
  status: "draft",
  starts_at: null,
  registration_url: null,
  notes: null,
};

/** `starts_at` is a timestamptz; <input type="datetime-local"> speaks local
 * wall-clock with no zone. Convert explicitly in both directions rather than
 * slicing the ISO string, which would silently shift the time by the
 * viewer's offset. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Create/edit a webinar. This is the only write path into `public.webinars`
 * anywhere in the app — without a row here, `record_webinar_event()` has
 * nothing to attach events to (p_webinar_id is a hard FK), so every webinar
 * integration depends on this existing.
 */
export function WebinarFormDialog({
  orgId,
  webinar,
  trigger,
}: {
  orgId?: string;
  /** Omit to create; pass a row to edit it. */
  webinar?: WebinarFormValues;
  trigger: ReactNode;
}) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WebinarFormValues>(webinar ?? EMPTY);
  const editing = !!webinar?.id;

  const set = <K extends keyof WebinarFormValues>(key: K, value: WebinarFormValues[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      if (!name) throw new Error("Give the webinar a name.");
      if (!orgId) throw new Error("No workspace resolved yet — reload and try again.");
      const payload = {
        name,
        webinar_type: draft.webinar_type,
        status: draft.status,
        starts_at: draft.starts_at,
        registration_url: draft.registration_url?.trim() || null,
        notes: draft.notes?.trim() || null,
      };
      // webinars isn't in the generated Supabase type snapshot yet — same
      // cast use-webinars.ts already needs to read the table.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error } = editing
        ? await db.from("webinars").update(payload).eq("id", webinar!.id).eq("org_id", orgId)
        : await db.from("webinars").insert({ ...payload, org_id: orgId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success(editing ? "Webinar updated" : "Webinar created");
      qc.invalidateQueries({ queryKey: ["webinars-filter"] });
      setOpen(false);
      if (!editing) setDraft(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(webinar ?? EMPTY);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit webinar" : "New webinar"}</DialogTitle>
          <DialogDescription>
            Registration, attendance and sales events attach to this record — it has to exist before
            any webinar integration can write to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-2xs">Name</Label>
            <Input
              value={draft.name}
              placeholder="e.g. The $10K/Month Growth System"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-2xs">Type</Label>
              <Select
                value={draft.webinar_type}
                onValueChange={(v) => set("webinar_type", v as WebinarFormValues["webinar_type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="organic">Organic</SelectItem>
                  <SelectItem value="unclassified">Unclassified</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-3xs text-muted-foreground">
                Drives the paid/organic split on Webinar Analytics.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-2xs">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => set("status", v as WebinarFormValues["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs">Starts at</Label>
            <Input
              type="datetime-local"
              value={toLocalInputValue(draft.starts_at)}
              onChange={(e) => set("starts_at", fromLocalInputValue(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs">Registration URL</Label>
            <Input
              value={draft.registration_url ?? ""}
              placeholder="https://…"
              onChange={(e) => set("registration_url", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs">Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              rows={3}
              placeholder="Anything worth remembering about this webinar."
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {devBypass && (
            <p className="text-2xs text-muted-foreground">
              Dev preview — webinars read from a fixture here, so saving needs a real signed-in
              session.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={save.isPending || devBypass || !draft.name.trim()}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? "Save changes" : "Create webinar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
