import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { classifyTranscript } from "./analyze-content.server";

const Input = z.object({
  transcript: z.string().min(1).max(20000),
  hook: z.string().max(2000).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
});

export const analyzeContent = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const r = await classifyTranscript({
      transcript: data.transcript,
      hook: data.hook ?? null,
      title: data.title ?? null,
    });
    if (!r) throw new Error("AI analysis unavailable. Check credits or try again.");
    return r;
  });
