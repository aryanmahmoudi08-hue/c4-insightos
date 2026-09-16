import { ChevronDown, Video } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  webinarFilterLabel,
  type WebinarFilterValue,
  type WebinarRecord,
} from "@/lib/webinar-filter";

/**
 * The hierarchy's actual menu items — everything below the top-level "All
 * Webinars" entry:
 *
 * ├── Paid Webinars >
 * │   ├── All Paid Webinars
 * │   └── [real paid webinars]
 * └── Organic Webinars >
 *     ├── All Organic Webinars
 *     └── [real organic webinars]
 *
 * An "Unclassified Webinars" branch only appears when at least one real
 * webinar genuinely has no classification yet — never fabricated, never
 * shown when everything is already classified. Built on Radix's
 * DropdownMenuSub (via shadcn's dropdown-menu primitives), which already
 * handles the parent→submenu hover bridge without flicker — the same
 * primitive already available in this codebase but never used until now.
 *
 * Exported separately (not just used inside `WebinarFilter` below) so a
 * page that must merge Webinar into an *existing* dropdown — e.g. Team
 * Calendar's "Acquisition Source" menu, which lists Instagram/TikTok/etc.
 * as flat top-level items alongside a new "Webinar" branch — can splice
 * these same branches into its own `DropdownMenuContent` instead of
 * duplicating this markup.
 */
export function WebinarFilterBranches({
  onChange,
  paidWebinars,
  organicWebinars,
  unclassifiedWebinars,
}: {
  onChange: (value: WebinarFilterValue) => void;
  paidWebinars: WebinarRecord[];
  organicWebinars: WebinarRecord[];
  unclassifiedWebinars: WebinarRecord[];
}) {
  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Paid Webinars</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[320px] w-[260px] overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange({ kind: "all-paid" })}>
            All Paid Webinars
          </DropdownMenuItem>
          {paidWebinars.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No paid webinars yet</div>
          ) : (
            paidWebinars.map((webinar) => (
              <DropdownMenuItem
                key={webinar.id}
                onClick={() => onChange({ kind: "webinar", webinarId: webinar.id })}
              >
                <span className="truncate">{webinar.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Organic Webinars</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[320px] w-[260px] overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange({ kind: "all-organic" })}>
            All Organic Webinars
          </DropdownMenuItem>
          {organicWebinars.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No organic webinars yet</div>
          ) : (
            organicWebinars.map((webinar) => (
              <DropdownMenuItem
                key={webinar.id}
                onClick={() => onChange({ kind: "webinar", webinarId: webinar.id })}
              >
                <span className="truncate">{webinar.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {unclassifiedWebinars.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Unclassified Webinars</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[320px] w-[260px] overflow-y-auto">
            <DropdownMenuItem onClick={() => onChange({ kind: "all-unclassified" })}>
              All Unclassified Webinars
            </DropdownMenuItem>
            {unclassifiedWebinars.map((webinar) => (
              <DropdownMenuItem
                key={webinar.id}
                onClick={() => onChange({ kind: "webinar", webinarId: webinar.id })}
              >
                <span className="truncate">{webinar.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );
}

/**
 * Standalone reusable hierarchical Webinar filter (its own trigger +
 * dropdown): All Webinars / Paid Webinars > … / Organic Webinars > … . Use
 * this wherever Webinar should be its own adjacent control (Legacy Lead
 * CRM, DM Setter, Inbound Dialer, Closer, Webinar Analytics, VSL Analytics).
 * For merging into an existing dropdown instead, use `WebinarFilterBranches`.
 */
export function WebinarFilter({
  value,
  onChange,
  webinars,
  paidWebinars,
  organicWebinars,
  unclassifiedWebinars,
  webinarsById,
  triggerClassName,
  label = "Webinar",
}: {
  value: WebinarFilterValue;
  onChange: (value: WebinarFilterValue) => void;
  webinars: WebinarRecord[];
  paidWebinars: WebinarRecord[];
  organicWebinars: WebinarRecord[];
  unclassifiedWebinars: WebinarRecord[];
  webinarsById: Map<string, WebinarRecord>;
  triggerClassName?: string;
  label?: string;
}) {
  const selectedLabel = webinarFilterLabel(value, webinarsById);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs",
            triggerClassName,
          )}
        >
          <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {label}: {selectedLabel}
          </span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <DropdownMenuItem onClick={() => onChange({ kind: "all" })}>All Webinars</DropdownMenuItem>
        <WebinarFilterBranches
          onChange={onChange}
          paidWebinars={paidWebinars}
          organicWebinars={organicWebinars}
          unclassifiedWebinars={unclassifiedWebinars}
        />
        {webinars.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No webinars yet</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
