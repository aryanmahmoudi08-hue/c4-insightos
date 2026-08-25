import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Loader2, Video } from "lucide-react";
import { VideoEmbed } from "@/components/video-embed";
import { resolvePreCallVideoLinkFn } from "@/lib/pre-call-video.functions";

export const Route = createFileRoute("/pcv/$token")({
  component: PreCallVideoPage,
  head: () => ({
    meta: [
      { title: "Your pre-call video" },
      { name: "description", content: "Watch this before your call." },
    ],
  }),
});

/**
 * Public, no login — mirrors daily-win.tsx's chrome for the one other
 * lead/client-facing public surface in this app. Resolving the token is
 * what actually marks leads.precall_video_watched + logs a real
 * lead_events row (see pre-call-video.server.ts) — this page's only job
 * beyond that is showing the video.
 */
function PreCallVideoPage() {
  const { token } = Route.useParams();
  const resolve = useServerFn(resolvePreCallVideoLinkFn);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pcv-resolve", token],
    queryFn: () => resolve({ data: { token } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (isError || !data?.found) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <CircleAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="display-serif text-2xl">This link isn't valid</h1>
          <p className="text-sm text-muted-foreground">Ask your setter or closer to send you a fresh link.</p>
        </div>
      </main>
    );
  }

  if (!data.vsl) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <Video className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="display-serif text-2xl">Nothing to watch yet</h1>
          <p className="text-sm text-muted-foreground">Your team hasn't uploaded a pre-call video for this yet — go ahead and get to your call.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="display-serif text-2xl">{data.vsl.name}</h1>
          <p className="text-sm text-muted-foreground">Watch this before your call — it'll only take a few minutes.</p>
        </header>
        <VideoEmbed wistiaId={data.vsl.wistia_video_id} title={data.vsl.name} className="mx-auto" />
      </div>
    </main>
  );
}
