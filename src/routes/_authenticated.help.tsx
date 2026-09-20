import { createFileRoute } from "@tanstack/react-router";
import { HelpCircle, ShieldAlert } from "lucide-react";
import { TopBar } from "@/components/app-sidebar";
import { SopViewer } from "@/components/sop-viewer";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDevPreviewRole, DEV_PREVIEW_ROLES } from "@/hooks/use-dev-preview-role";
import { SOP_DOCS, SOP_ORDER, sopKeyForRealRole } from "@/lib/sop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/help")({
  component: HelpPage,
  head: () => ({
    meta: [
      { title: "Help | AscendOS" },
      {
        name: "description",
        content: "Your role's SOP — exactly how to navigate and use AscendOS, step by step.",
      },
    ],
  }),
});

function HelpPage() {
  const { devBypass } = useAuth();
  const { role } = useRole();
  // Dev Bypass reuses the SAME preview-role picker Home already has (one
  // choice drives both) — every other signed-in user only ever gets their
  // own real role's document; there is no way to pick someone else's here.
  const { previewKey, setPreviewKey, active: devPreviewActive } = useDevPreviewRole();

  const activeKey = devPreviewActive ? (previewKey ?? "admin") : sopKeyForRealRole(role);
  const doc = activeKey ? SOP_DOCS[activeKey] : null;

  return (
    <>
      <TopBar
        title="Help"
        subtitle="Your role's SOP — how to navigate and use every part of AscendOS."
      />
      <div className="p-6 space-y-5 max-w-[1400px]">
        {devPreviewActive && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-3">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
              Dev bypass — viewing as
            </span>
            {DEV_PREVIEW_ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setPreviewKey(r.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  (previewKey ?? "admin") === r.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
            <span className="ml-auto text-3xs text-muted-foreground">
              Every other user only ever sees their own role's SOP.
            </span>
          </div>
        )}

        {doc ? (
          <>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <HelpCircle className="h-5 w-5" />
              </span>
              <div>
                <div className="text-lg font-semibold text-foreground">{doc.roleTitle} SOP</div>
                <div className="text-xs text-muted-foreground">{doc.tagline}</div>
              </div>
            </div>
            <SopViewer doc={doc} />
          </>
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">No SOP written for your role yet.</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ask an admin — the six written SOPs are Admin, Growth Operator, Sales Manager, DM
              Setter, Inbound Dialer and Closer.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
