import { APPLICATION_FIELD_LABELS } from "@/lib/application-fields";

/**
 * Canonical application Q&A rendering — the same rows/labels Legacy Leads'
 * Application tab and Team Calendar's Lead Form Responses modal both show,
 * driven by the shared APPLICATION_FIELD_LABELS list (application-fields.ts)
 * so the two surfaces can never label the same data differently. When
 * Typeform is connected, responses flowing into `application_data` reach
 * both places automatically — no second component to keep in sync.
 */
export function ApplicationResponses({
  applicationData,
}: {
  applicationData: Record<string, unknown> | null | undefined;
}) {
  const app = applicationData ?? {};
  return (
    <div className="rounded border border-border divide-y divide-border text-xs">
      {APPLICATION_FIELD_LABELS.map((c) => (
        <div key={c.key} className="p-2.5 grid grid-cols-3 gap-2">
          <div className="text-muted-foreground uppercase text-3xs tracking-wider">{c.label}</div>
          <div className="col-span-2">
            {(app[c.key] as string) || <span className="text-muted-foreground/50">—</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
