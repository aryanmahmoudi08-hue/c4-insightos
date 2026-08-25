/**
 * Confirmed real gap (Sales Tracking Part 2 research): objections are typed
 * freehand by reps, split on `/[,;\n|]+/`, and bucketed by exact lowercased
 * string — "price," "too expensive," and "can't afford it" are 3 separate
 * rows today with zero token overlap, unfixable by better string matching
 * alone. This is a real LLM clustering pass, same Lovable AI Gateway pattern
 * every other AI call in this app uses — graceful "AI not configured"
 * fallback (returns null, caller keeps today's exact-string bucketing,
 * never blocks the page).
 */

export type ObjectionCluster = { canonical: string; members: string[]; count: number };

async function gateway(system: string, user: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.6-sol",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json: { choices?: { message?: { content?: string } }[] } = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? null;
}

const SYSTEM_PROMPT = `You cluster raw sales-call objections into canonical buckets. Reps type these freehand, so the same real objection is worded differently call to call (e.g. "price," "too expensive," and "can't afford it" are the same underlying objection).

Respond with ONLY a JSON array, no prose, no markdown fences:
[{"canonical": "Price too high", "members": ["price", "too expensive", "can't afford it"]}, ...]

Rules:
- Every input string must appear in exactly one cluster's "members" array — never drop one.
- Only merge genuinely the same underlying objection. "price" and "timing" are both common but are NOT the same objection — don't over-merge distinct objections just because they're both frequent.
- "canonical" should be a short, clear label a sales manager would recognize at a glance (Title Case, 2-5 words).`;

/** `rawCounts` is every distinct raw objection string logged in the range,
 * with its own exact-match count (today's bucketing) — the clustering only
 * reassigns which bucket each string belongs to, it never invents a count
 * that didn't come from a real logged row. Returns `null` (not an empty
 * array) when AI isn't configured or the response is unusable, so callers
 * can tell "no clusters" apart from "clustering unavailable, fall back." */
export async function clusterObjections(
  rawCounts: { text: string; count: number }[],
): Promise<ObjectionCluster[] | null> {
  if (rawCounts.length === 0) return [];
  const user = rawCounts.map((r) => `"${r.text}" (${r.count}x)`).join("\n");
  const raw = await gateway(SYSTEM_PROMPT, user);
  if (!raw) return null;

  let parsed: { canonical: string; members: string[] }[];
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("not an array");
  } catch {
    return null;
  }

  const countByText = new Map(rawCounts.map((r) => [r.text, r.count]));
  const clusters: ObjectionCluster[] = parsed
    .filter((c) => c && typeof c.canonical === "string" && Array.isArray(c.members))
    .map((c) => ({
      canonical: c.canonical,
      members: c.members.filter((m) => countByText.has(m)),
      count: c.members.reduce((s, m) => s + (countByText.get(m) ?? 0), 0),
    }))
    .filter((c) => c.members.length > 0);

  // Safety net: any raw text the model dropped or mis-typed gets its own
  // singleton cluster — never silently lose a logged objection.
  const covered = new Set(clusters.flatMap((c) => c.members));
  for (const r of rawCounts) {
    if (!covered.has(r.text))
      clusters.push({ canonical: r.text, members: [r.text], count: r.count });
  }
  return clusters;
}
