import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/app-sidebar";

function comingSoon(title: string, blurb: string) {
  return function Page() {
    return (
      <>
        <TopBar title={title} />
        <div className="p-6">
          <div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center">
            <div className="mx-auto mb-3 inline-flex rounded-md bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">Schema ready · UI shipping next</div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground">{blurb}</p>
          </div>
        </div>
      </>
    );
  };
}

export const Route = createFileRoute("/_authenticated/closer")({ component: comingSoon("Closer Dashboard", "Live call queue, objection heat-map, close rate by segment, and offer-test attribution.") });
