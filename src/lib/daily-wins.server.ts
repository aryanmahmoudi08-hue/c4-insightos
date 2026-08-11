import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DailyWinInput = {
  org_id: string;
  student_name: string;
  win_date?: string | null;
  yesterday_commitment?: string | null;
  yesterday_status: string;
  work_done?: string | null;
  win_types: string[];
  win_description: string;
  financial_amount_cents?: number | null;
  financial_source?: string | null;
  proof_url?: string | null;
  energy_score?: number | null;
  blocker?: string | null;
  tomorrow_needle_mover?: string | null;
  source?: "manual" | "typeform";
};

export async function insertDailyWin(input: DailyWinInput) {
  const financial = input.win_types.includes("financial");

  // Match the student to an existing client record by name (best effort).
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, full_name")
    .eq("org_id", input.org_id)
    .ilike("full_name", input.student_name.trim())
    .limit(1)
    .maybeSingle();

  const row = {
    org_id: input.org_id,
    client_id: client?.id ?? null,
    student_name: input.student_name.trim(),
    win_date: input.win_date || new Date().toISOString().slice(0, 10),
    yesterday_commitment: input.yesterday_commitment ?? null,
    yesterday_status: input.yesterday_status,
    work_done: input.work_done ?? null,
    win_types: input.win_types,
    win_description: input.win_description,
    financial_amount_cents: financial ? (input.financial_amount_cents ?? null) : null,
    financial_source: financial ? (input.financial_source ?? null) : null,
    proof_url: input.proof_url ?? null,
    energy_score: input.energy_score ?? null,
    blocker: input.blocker ?? null,
    tomorrow_needle_mover: input.tomorrow_needle_mover ?? null,
    priority: financial ? "high" : "normal",
    source: input.source ?? "manual",
  };

  const { data, error } = await supabaseAdmin.from("daily_wins").insert(row).select("id").single();
  if (error) throw new Error(error.message);

  // Financial wins are automatically mirrored into the client wins wall as major.
  if (financial) {
    await supabaseAdmin.from("client_wins").insert({
      org_id: input.org_id,
      client_id: client?.id ?? null,
      title: `${input.student_name.trim()} — ${input.financial_source || "financial win"}`,
      body: input.win_description,
      magnitude: "major",
      screenshot_url: input.proof_url ?? null,
    });
  }

  return { id: data.id, matched_client: client?.full_name ?? null, priority: row.priority };
}

/** Yesterday's stated needle-mover for a student, so tomorrow's form closes the loop. */
export async function lastNeedleMover(orgId: string, studentName: string) {
  const { data } = await supabaseAdmin
    .from("daily_wins")
    .select("tomorrow_needle_mover, win_date")
    .eq("org_id", orgId)
    .ilike("student_name", studentName.trim())
    .order("win_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.tomorrow_needle_mover ?? null;
}

export type WinRow = {
  student_name: string;
  win_date: string;
  yesterday_status: string;
  win_types: string[] | null;
  win_description: string;
  financial_amount_cents: number | null;
  financial_source: string | null;
  energy_score: number | null;
  blocker: string | null;
  tomorrow_needle_mover: string | null;
};

export async function analyzeWins(rows: WinRow[], days: number) {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return { insight: "AI is not configured." };
  if (!rows.length) return { insight: "No daily wins logged in this window yet." };

  const log = rows
    .map(
      (r) =>
        `${r.win_date} · ${r.student_name} · [${(r.win_types ?? []).join("/") || "none"}] energy ${r.energy_score ?? "?"}/10 · commitment ${r.yesterday_status}` +
        `\n  WIN: ${r.win_description}` +
        (r.financial_amount_cents ? `\n  CASH: $${Math.round(r.financial_amount_cents / 100)} — ${r.financial_source ?? ""}` : "") +
        (r.blocker ? `\n  BLOCKER: ${r.blocker}` : "") +
        (r.tomorrow_needle_mover ? `\n  NEXT: ${r.tomorrow_needle_mover}` : ""),
    )
    .join("\n")
    .slice(0, 18000);

  const sys = `You are the head coach of a high-ticket coaching program reviewing student daily accountability logs.
Return markdown with these exact sections:

## Momentum snapshot
2-3 sentences: overall energy trend, consistency, and whether wins are compounding or stalling.

## Double down (green)
3-5 bullets. Patterns producing financial wins or breakthroughs. Each bullet: the pattern, the evidence (name/date), and the exact action to systemize it.

## Bottlenecks (red)
3-5 bullets. Recurring blockers, dropped commitments, low-energy streaks. Each bullet: the blocker, who/how often, the likely root cause, and the specific fix.

## Save-call radar
Name every student whose blocker repeats 3+ days or whose energy trends under 5, and the one question to open the call with.

Be blunt and specific. Use names and numbers. No filler.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Window: last ${days} days. ${rows.length} logs.\n\n${log}` },
        ],
      }),
    });
    if (!res.ok) return { insight: `AI error (${res.status}): ${await res.text()}` };
    const json = await res.json();
    return { insight: json.choices?.[0]?.message?.content?.trim() ?? "No insight returned." };
  } catch (e) {
    return { insight: `AI error: ${(e as Error).message}` };
  }
}
