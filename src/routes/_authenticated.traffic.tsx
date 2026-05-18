import { createFileRoute } from "@tanstack/react-router";
import { TopBar } from "@/components/app-sidebar";
export const Route = createFileRoute("/_authenticated/traffic")({ component: Page });
function Page() { return (<><TopBar title="Traffic Sources" /><div className="p-6"><div className="rounded-lg border border-dashed border-border bg-card/40 p-10 text-center"><div className="mx-auto mb-3 inline-flex rounded-md bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">Schema ready · UI shipping next</div><h2 className="text-lg font-semibold">Traffic</h2><p className="mt-1 max-w-md mx-auto text-sm text-muted-foreground">UTM rollups, paid vs organic, LTV by source, blended CAC.</p></div></div></>); }
