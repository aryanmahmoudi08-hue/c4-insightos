import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Provider = "wistia" | "youtube" | "loom" | "file" | "unknown";
type ParsedSource = { provider: Provider; id: string; originalUrl?: string };

function parseSource(wistiaId?: string | null, url?: string | null): ParsedSource | null {
  const wid = wistiaId?.trim();
  if (wid) return { provider: "wistia", id: wid };

  const raw = url?.trim();
  if (!raw) return null;

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "fast.wistia.net" || host === "wistia.com" || host.endsWith(".wistia.com")) {
      const m = u.pathname.match(/([a-z0-9]{6,})(?:[/?]|$)/i);
      if (m) return { provider: "wistia", id: m[1] };
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
      let id = "";
      if (host === "youtu.be") id = u.pathname.slice(1);
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/embed/")[1] ?? "";
      else id = u.searchParams.get("v") ?? "";
      id = id.split(/[?&/]/)[0];
      if (id) return { provider: "youtube", id, originalUrl: raw };
    }
    if (host === "loom.com") {
      const m = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/);
      if (m) return { provider: "loom", id: m[1], originalUrl: raw };
    }
    if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) {
      return { provider: "file", id: raw, originalUrl: raw };
    }
  } catch {
    // not a valid absolute URL — fall through to "unknown"
  }

  return { provider: "unknown", id: raw, originalUrl: raw };
}

/** Wistia's own metadata endpoint always returns HTTP 200, even for a bad ID —
 * `{error:true}` is the only signal a video doesn't exist or isn't public.
 * CORS-open (access-control-allow-origin: *), so this is safe to call client-side. */
function useWistiaValidity(id: string | undefined) {
  return useQuery({
    queryKey: ["wistia-meta", id],
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`https://fast.wistia.com/embed/medias/${id}.json`);
      if (!res.ok) return { valid: false };
      const json: { error?: boolean } = await res.json().catch(() => ({ error: true }));
      return { valid: !json?.error };
    },
  });
}

type VideoEmbedProps = {
  wistiaId?: string | null;
  url?: string | null;
  title?: string;
  aspect?: "video" | "portrait";
  className?: string;
};

/** Reusable video player — Wistia primary (pre-validated so a bad ID never
 * renders Wistia's own bare "Media not found." page), with graceful
 * YouTube/Loom/direct-file handling and a designed placeholder everywhere
 * else. Never renders a broken or foreign iframe. */
export function VideoEmbed({ wistiaId, url, title, aspect = "video", className }: VideoEmbedProps) {
  const source = useMemo(() => parseSource(wistiaId, url), [wistiaId, url]);
  const isWistia = source?.provider === "wistia";
  const validity = useWistiaValidity(isWistia ? source!.id : undefined);

  const frameClass = cn(
    "relative w-full overflow-hidden rounded-2xl border border-border bg-black",
    aspect === "portrait" ? "aspect-[9/16]" : "aspect-video",
    className,
  );

  if (!source) return <EmbedPlaceholder frameClass={frameClass} variant="empty" title={title} />;

  if (source.provider === "wistia") {
    if (validity.isLoading) return <EmbedPlaceholder frameClass={frameClass} variant="loading" title={title} />;
    if (!validity.data?.valid) return <EmbedPlaceholder frameClass={frameClass} variant="unavailable" title={title} detail={source.id} />;
    return (
      <div className={frameClass}>
        <iframe
          src={`https://fast.wistia.net/embed/iframe/${source.id}?videoFoam=true`}
          title={title || "Video"}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  if (source.provider === "youtube") {
    return (
      <div className={frameClass}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${source.id}`}
          title={title || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  if (source.provider === "loom") {
    return (
      <div className={frameClass}>
        <iframe
          src={`https://www.loom.com/embed/${source.id}`}
          title={title || "Video"}
          allow="autoplay; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    );
  }

  if (source.provider === "file") {
    return (
      <div className={frameClass}>
        <video src={source.id} controls className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  return <EmbedPlaceholder frameClass={frameClass} variant="external" title={title} detail={source.originalUrl} />;
}

function EmbedPlaceholder({
  frameClass, variant, title, detail,
}: {
  frameClass: string;
  variant: "empty" | "loading" | "unavailable" | "external";
  title?: string;
  detail?: string;
}) {
  if (variant === "loading") {
    return (
      <div className={cn(frameClass, "grid place-items-center bg-muted/30")}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const copy = {
    empty: {
      icon: VideoOff,
      heading: "No video connected",
      body: title ? `${title} doesn't have a video source yet.` : "Add a Wistia ID or video URL to play it here.",
    },
    unavailable: {
      icon: VideoOff,
      heading: "Video unavailable",
      body: detail ? `Wistia ID "${detail}" didn't resolve — check it's correct and set to public.` : "This video couldn't be loaded.",
    },
    external: {
      icon: ExternalLink,
      heading: "Can't preview this link",
      body: "This source isn't from a supported video provider yet.",
    },
  }[variant];
  const Icon = copy.icon;

  return (
    <div className={cn(frameClass, "flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/40 to-muted/10 p-6 text-center")}>
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative grid h-11 w-11 place-items-center rounded-full bg-muted/60 ring-1 ring-inset ring-white/10">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="relative text-sm font-semibold">{copy.heading}</div>
      <div className="relative max-w-xs text-2xs text-muted-foreground">{copy.body}</div>
      {variant === "external" && detail && (
        <a href={detail} target="_blank" rel="noreferrer" className="relative mt-1 inline-flex items-center gap-1 text-2xs text-accent hover:underline">
          Open original <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
