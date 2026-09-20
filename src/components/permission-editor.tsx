import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Lock, Search, Undo2, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RESOURCES, RESOURCE_GROUPS, PRESETS } from "@/lib/permissions";

export type PermValue = { can_view: boolean; can_edit: boolean };

interface Props {
  /** Resolved permission for a resource key — reads from the caller's DRAFT
   * state, not directly from the server, so toggling here never round-trips
   * to the network and can never visually "snap back" mid-edit. */
  getPerm: (resource: string) => PermValue;
  onChange: (resource: string, next: PermValue) => void;
  onBulk?: (next: PermValue) => void;
  /** Optional note rendered under the toolbar. */
  note?: string;
  disabled?: boolean;
  /** Save/Revert footer — omit entirely for a caller that doesn't stage
   * edits (none currently do, but keeps this component usable standalone). */
  dirty?: boolean;
  saving?: boolean;
  onSave?: () => void;
  onRevert?: () => void;
}

/**
 * In-depth access editor: every surface, what View shows, what Edit allows.
 * Edits are staged locally (via the caller's draft state) until "Save
 * changes" is clicked — nothing here writes to the network per-toggle, so a
 * slow/failed save can never make an in-progress edit appear to revert.
 */
export function PermissionEditor({
  getPerm,
  onChange,
  onBulk,
  note,
  disabled,
  dirty,
  saving,
  onSave,
  onRevert,
}: Props) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();

  const granted = RESOURCES.filter((r) => getPerm(r.key).can_view).length;
  const editable = RESOURCES.filter((r) => getPerm(r.key).can_edit).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter sections…"
            className="h-8 w-full rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {onBulk &&
          PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={disabled || saving}
              onClick={() => onBulk(p.apply())}
            >
              {p.label}
            </Button>
          ))}
      </div>

      <div className="flex items-center gap-4 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" /> {granted} of {RESOURCES.length} sections visible
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> {editable} editable
        </span>
      </div>
      {note && <div className="text-2xs text-muted-foreground">{note}</div>}

      {(onSave || onRevert) && (
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors",
            dirty
              ? "border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10"
              : "border-border bg-muted/20",
          )}
        >
          <span className="text-2xs text-muted-foreground">
            {saving ? "Saving…" : dirty ? "You have unsaved changes." : "No unsaved changes."}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              disabled={!dirty || saving}
              onClick={onRevert}
            >
              <Undo2 className="h-3.5 w-3.5" /> Revert to original
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!dirty || saving}
              onClick={onSave}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save changes
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {RESOURCE_GROUPS.map((group) => {
          const items = RESOURCES.filter(
            (r) =>
              r.group === group &&
              (!term ||
                r.label.toLowerCase().includes(term) ||
                r.view.toLowerCase().includes(term) ||
                r.edit.toLowerCase().includes(term)),
          );
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="mb-1.5 px-1 text-3xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group}
              </div>
              <div className="divide-y divide-border rounded-md border border-border bg-card">
                {items.map((r) => {
                  const p = getPerm(r.key);
                  return (
                    <div
                      key={r.key}
                      className={cn(
                        "flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between",
                        !p.can_view && "opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{r.label}</span>
                          {r.sensitive && (
                            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-4xs uppercase tracking-wider text-muted-foreground">
                              <Lock className="h-2.5 w-2.5" /> Sensitive
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/80">View:</span> {r.view}
                        </p>
                        <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/80">Edit:</span> {r.edit}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-5 sm:pt-0.5">
                        <label className="flex items-center gap-2 text-2xs text-muted-foreground">
                          <Switch
                            checked={p.can_view}
                            disabled={disabled || saving}
                            onCheckedChange={(c) =>
                              onChange(r.key, { can_view: c, can_edit: c ? p.can_edit : false })
                            }
                          />
                          View
                        </label>
                        <label className="flex items-center gap-2 text-2xs text-muted-foreground">
                          <Switch
                            checked={p.can_edit}
                            disabled={disabled || saving || !p.can_view}
                            onCheckedChange={(c) =>
                              onChange(r.key, { can_view: true, can_edit: c })
                            }
                          />
                          Edit
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
