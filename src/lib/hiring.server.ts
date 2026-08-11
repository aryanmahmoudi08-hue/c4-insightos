import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAGES = ["applied", "needs_grading", "interview_worthy", "trial_call", "offer_sent", "hired", "rejected"] as const;

/** Best-effort transcript pull from a public Loom share page (Loom embeds captions in page JSON). */
export async function fetchLoomTranscript(loomUrl: string): Promise<string | null> {
  try {
    const res = await fetch(loomUrl, { headers: { "user-agent": "Mozilla/5.0 InsightOS" } });
    if (!res.ok) return null;
    const html = await res.text();
    // Loom ships a JSON blob with caption cues; pull any readable text cues out of it.
    const cues = [...html.matchAll(/"text":"([^"]{4,300})"/g)].map((m) => m[1]);
    const text = cues.join(" ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    return text.length > 200 ? text.slice(0, 20000) : null;
  } catch {
    return null;
  }
}

export async function gradeApplicantFromTranscript(args: {
  orgId: string;
  applicantId: string;
  loomUrl?: string | null;
  transcript?: string | null;
}) {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error("AI is not configured.");

  const { data: applicant } = await supabaseAdmin
    .from("hiring_applicants")
    .select("id, full_name, role_applied, years_experience, niche, notes, stage, loom_url, loom_transcript")
    .eq("id", args.applicantId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!applicant) throw new Error("Applicant not found");

  const loomUrl = args.loomUrl || applicant.loom_url;
  let transcript = (args.transcript || applicant.loom_transcript || "").trim();
  if (!transcript && loomUrl) transcript = (await fetchLoomTranscript(loomUrl)) ?? "";
  if (!transcript) throw new Error("No transcript available — paste the Loom transcript to grade this applicant.");

  const sys = `You grade sales-rep video applications for a high-ticket coaching company by reading the Loom transcript.
Pipeline stages, in order: applied, needs_grading, interview_worthy, trial_call, offer_sent, hired, rejected.

Score TRANSCRIPT QUALITY (0-10): clarity of speech, energy and tonality, sales instinct, specificity of past results, coachability, and red flags (rambling, blaming, no numbers, low energy). This is a proxy for "strong" vs "weak" application, not a hiring decision.

Also extract, best-effort from what's stated on camera (null if not mentioned):
- stated_role: which of "closer" / "setter" / "dialer" they say they're applying for or have experience in
- historical_cash_collected: total lifetime cash they claim to have collected, in whole dollars
- recent_monthly_cash_collected: their most recent typical MONTHLY cash collected, in whole dollars

Return ONLY minified JSON:
{"score": <0-10 one decimal>, "recommended_stage": "<one stage key>", "summary": "<4-6 sentence read on the video>", "reasoning": "<one line, pipe-separated quality signals>", "stated_role": "<closer|setter|dialer|null>", "historical_cash_collected": <number|null>, "recent_monthly_cash_collected": <number|null>}

Stage rules (by transcript quality): 8.5+ → trial_call. 7-8.4 → interview_worthy. 5-6.9 → needs_grading. under 5 → rejected.`;

  const user = `Applicant: ${applicant.full_name} — applied as ${applicant.role_applied}
Experience: ${applicant.years_experience ?? "?"} years · Niche: ${applicant.niche ?? "—"}
Recruiter notes: ${applicant.notes ?? "—"}

VIDEO TRANSCRIPT:
${transcript.slice(0, 16000)}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI error [${res.status}]: ${await res.text()}`);
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI returned an unreadable grade.");
  const parsed = JSON.parse(match[0]) as {
    score: number; recommended_stage: string; summary: string; reasoning: string;
    stated_role?: string | null; historical_cash_collected?: number | null; recent_monthly_cash_collected?: number | null;
  };
  const stage = (STAGES as readonly string[]).includes(parsed.recommended_stage) ? parsed.recommended_stage : "needs_grading";
  const statedRole = ["closer", "setter", "dialer"].includes(parsed.stated_role ?? "") ? parsed.stated_role : null;

  const { error } = await supabaseAdmin
    .from("hiring_applicants")
    .update({
      loom_url: loomUrl ?? null,
      loom_transcript: transcript.slice(0, 40000),
      ai_score: Math.max(0, Math.min(10, Number(parsed.score) || 0)),
      ai_reasoning: parsed.reasoning ?? null,
      ai_recommended_stage: stage,
      ai_transcript_summary: parsed.summary ?? null,
      ai_stated_role: statedRole,
      historical_cash_collected_cents: parsed.historical_cash_collected != null ? Math.round(Number(parsed.historical_cash_collected) * 100) : null,
      recent_monthly_cash_collected_cents: parsed.recent_monthly_cash_collected != null ? Math.round(Number(parsed.recent_monthly_cash_collected) * 100) : null,
      stage,
      last_shown_at: new Date().toISOString(),
    })
    .eq("id", args.applicantId)
    .eq("org_id", args.orgId);
  if (error) throw new Error(error.message);

  return { score: Number(parsed.score), stage, summary: parsed.summary, reasoning: parsed.reasoning, stated_role: statedRole };
}
