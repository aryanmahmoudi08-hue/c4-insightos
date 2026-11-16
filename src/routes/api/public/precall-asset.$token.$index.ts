import { createFileRoute } from "@tanstack/react-router";
import { precallAssetsFor, supabaseAdmin } from "@/lib/pre-call-video.server";

/**
 * A lead opening one of their pre-call assets: record the first open (it
 * ticks off in #pre-call-assets on the scheduler's next minute) and send
 * them on to the asset. Public by design, like the pre-call page itself; the
 * token is the lead's unguessable pre-call link.
 */
export const Route = createFileRoute("/api/public/precall-asset/$token/$index")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const index = Number(params.index);
        const { data: link } = await supabaseAdmin
          .from("lead_video_links")
          .select("org_id, lead_id")
          .eq("token", params.token)
          .maybeSingle();
        if (!link || !Number.isInteger(index) || index < 0 || index > 4) {
          return new Response("This link isn't valid.", { status: 404 });
        }
        const assets = await precallAssetsFor(supabaseAdmin, link.org_id);
        const asset = assets.find((a) => a.index === index);
        if (!asset) return new Response("This link isn't valid.", { status: 404 });
        // First open wins; a repeat is a no-op on the unique key.
        await supabaseAdmin
          .from("precall_asset_clicks")
          .upsert(
            { org_id: link.org_id, lead_id: link.lead_id, asset_index: index },
            { onConflict: "org_id,lead_id,asset_index", ignoreDuplicates: true },
          );
        return Response.redirect(asset.url, 302);
      },
    },
  },
});
