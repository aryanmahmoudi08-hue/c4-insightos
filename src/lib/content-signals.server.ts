import {
  MECHANISM_KEYS, addWeights, emptyWeights, scoreText, toMix,
  type MechanismKey, type MechanismWeights,
} from "./content-mechanisms";

type Sb = {
  from: (t: string) => any;
};

export type Driver = { source: string; detail: string; mechanism: MechanismKey; weight: number };

export type DemandResult = {
  mix: Record<MechanismKey, number>;
  weights: MechanismWeights;
  drivers: Driver[];
  counts: { faq: number; setter_calls: number; intakes: number; reels: number };
};

/** FAQ question / onboarding answer / objection text → mechanism, with the raw drivers kept for the UI. */
export async function computeDemand(sb: Sb, orgId: string, days = 30): Promise<DemandResult> {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  const [faq, setters, intakes, reels] = await Promise.all([
    sb.from("faq_videos").select("title, question, mechanism, clicks, plays").eq("org_id", orgId).eq("active", true),
    sb.from("setter_call_signals").select("setter_name, call_date, limiting_beliefs, objections, mechanism, ai_summary, notes").eq("org_id", orgId).gte("call_date", sinceDate).limit(300),
    sb.from("onboarding_responses").select("responses, mechanism_signals, submitted_at, created_at").eq("org_id", orgId).gte("created_at", sinceIso).limit(200),
    sb.from("content_pieces").select("id, mechanism, variation, posted_at, pipeline_status, content_metrics(leads_generated, cash_collected_cents, hook_retention_pct, engagement_rate_pct, drop_off_rate_pct)").eq("org_id", orgId).gte("created_at", sinceIso).limit(400),
  ]);

  let weights = emptyWeights();
  const drivers: Driver[] = [];

  // 1) FAQ video clicks — the strongest subconscious-objection signal.
  for (const f of (faq.data ?? []) as any[]) {
    const clicks = Number(f.clicks ?? 0) + Number(f.plays ?? 0);
    if (!clicks) continue;
    const mech: MechanismKey = (f.mechanism as MechanismKey) || pickTop(scoreText(`${f.title} ${f.question ?? ""}`)) || "credibility";
    const w = clicks * 2; // clicks are weighted heaviest
    weights[mech] += w;
    drivers.push({ source: "FAQ clicks", detail: `${f.title} · ${clicks} clicks`, mechanism: mech, weight: w });
  }

  // 2) Setter-call limiting beliefs + objections.
  for (const s of (setters.data ?? []) as any[]) {
    const text = [...(s.limiting_beliefs ?? []), ...(s.objections ?? []), s.ai_summary, s.notes].filter(Boolean).join(" · ");
    if (s.mechanism) {
      weights[s.mechanism as MechanismKey] += 3;
      drivers.push({ source: "Setting call", detail: `${s.setter_name} · ${s.call_date}`, mechanism: s.mechanism as MechanismKey, weight: 3 });
    } else {
      const sc = scoreText(text, 1.5);
      weights = addWeights(weights, sc);
      const top = pickTop(sc);
      if (top) drivers.push({ source: "Setting call", detail: truncate(text, 90), mechanism: top, weight: sc[top] });
    }
  }

  // 3) Onboarding: first touchpoint / decision moment / join-earlier answers.
  // Prefers the mechanism_signals tagged at submit time (Onboarding page); falls
  // back to live keyword scoring only for legacy rows submitted before that existed.
  for (const i of (intakes.data ?? []) as any[]) {
    const r = (i.responses ?? {}) as Record<string, string>;
    const text = [
      r.first_touch, r.first_touchpoint, r.discovery_touchpoint,
      r.decision_moment, r.pivotal_moment, r.beliefs_shifted, r.content_type_helped,
      r.join_earlier, r.join_sooner, r.hesitations, r.fear,
    ].filter(Boolean).join(" · ");
    const stored = (i.mechanism_signals ?? {}) as Partial<MechanismWeights>;
    const hasStored = MECHANISM_KEYS.some((k) => Number(stored[k] ?? 0) > 0);
    const sc = hasStored ? addWeights(emptyWeights(), stored as MechanismWeights) : scoreText(text, 2);
    weights = addWeights(weights, sc);
    const top = pickTop(sc);
    if (top) drivers.push({ source: "Client intake", detail: truncate(text, 90), mechanism: top, weight: sc[top] });
  }

  // 4) Strong-performing reels — "double down on this format" as a real signal, not
  // just a display. A reel counts as strong if it converted (leads/cash) or held
  // attention well (retention/engagement) with low drop-off.
  for (const p of (reels.data ?? []) as any[]) {
    if (!p.mechanism) continue;
    const metrics = Array.isArray(p.content_metrics) ? p.content_metrics : (p.content_metrics ? [p.content_metrics] : []);
    const m = metrics[0];
    if (!m) continue;
    const converted = Number(m.leads_generated ?? 0) > 0 || Number(m.cash_collected_cents ?? 0) > 0;
    const heldAttention = Number(m.hook_retention_pct ?? 0) >= 45 || Number(m.engagement_rate_pct ?? 0) >= 6;
    const lowDropOff = m.drop_off_rate_pct == null || Number(m.drop_off_rate_pct) < 40;
    if (!converted && !(heldAttention && lowDropOff)) continue;
    const w = (converted ? 3 : 0) + (heldAttention ? 2 : 0);
    weights[p.mechanism as MechanismKey] += w;
    drivers.push({
      source: "Reel performance",
      detail: `${p.mechanism}${p.variation ? "/" + p.variation : ""} · ${converted ? `${m.leads_generated ?? 0} leads` : `${m.hook_retention_pct ?? m.engagement_rate_pct ?? 0}% retention`}`,
      mechanism: p.mechanism as MechanismKey,
      weight: w,
    });
  }

  drivers.sort((a, b) => b.weight - a.weight);

  return {
    mix: toMix(weights),
    weights,
    drivers: drivers.slice(0, 24),
    counts: {
      faq: (faq.data ?? []).length,
      setter_calls: (setters.data ?? []).length,
      intakes: (intakes.data ?? []).length,
      reels: (reels.data ?? []).length,
    },
  };
}

function pickTop(w: MechanismWeights): MechanismKey | null {
  let best: MechanismKey | null = null;
  for (const k of MECHANISM_KEYS) if (w[k] > 0 && (!best || w[k] > w[best])) best = k;
  return best;
}
function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n)}…` : s; }

/* ---------------------------- AI layers ---------------------------- */

async function gateway(system: string, user: string) {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) return "AI is not configured.";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (res.status === 429) return "AI rate limit hit — try again in a minute.";
  if (res.status === 402) return "AI credits exhausted — add credits to keep using AI insights.";
  if (!res.ok) return `AI error (${res.status}): ${(await res.text()).slice(0, 400)}`;
  const json: any = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "No insight returned.";
}

/** The business bottleneck read: VSL + FAQ + setting calls + intakes + reel performance in one. */
export async function analyzeContentSystem(sb: Sb, orgId: string, days: number) {
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const demand = await computeDemand(sb, orgId, days);

  const [pieces, metrics, vslSnaps, faq, setters, calls, payments, intakes] = await Promise.all([
    sb.from("content_pieces").select("id, title, mechanism, variation, platform, posted_at, pipeline_status").eq("org_id", orgId).gte("created_at", sinceIso).limit(300),
    sb.from("content_metrics").select("content_id, views, reach, shares, saves, likes, comments, dms_generated, calls_booked, closes, cash_collected_cents, avg_watch_pct, hook_retention_pct, three_sec_hold_pct, drop_off_rate_pct, engagement_rate_pct, follower_views, non_follower_views, followers_gained").eq("org_id", orgId).gte("captured_at", sinceIso).limit(600),
    sb.from("vsl_metric_snapshots").select("video_name, total_plays, unique_viewers, play_rate, avg_percent_watched, page_loads, captured_at").eq("org_id", orgId).gte("captured_at", sinceIso).limit(60),
    sb.from("faq_videos").select("title, question, mechanism, clicks, plays, avg_watch_pct").eq("org_id", orgId).limit(60),
    sb.from("setter_call_signals").select("setter_name, call_date, source, limiting_beliefs, objections, ai_summary").eq("org_id", orgId).gte("call_date", sinceDate).limit(120),
    sb.from("calls").select("status, showed, closed, cash_collected_cents, scheduled_for").eq("org_id", orgId).gte("created_at", sinceIso).limit(500),
    sb.from("payments").select("amount_cents, collected_at").eq("org_id", orgId).gte("collected_at", sinceIso).limit(500),
    sb.from("onboarding_responses").select("mechanism_signals").eq("org_id", orgId).gte("created_at", sinceIso).limit(200),
  ]);

  const byId = new Map<string, any>();
  for (const m of (metrics.data ?? []) as any[]) byId.set(m.content_id, m);
  const perMech: Record<string, { pieces: number; views: number; dms: number; calls: number; cash: number; eng: number; retention: number; dropOff: number; followerViews: number; nonFollowerViews: number; withMetrics: number }> = {};
  for (const p of (pieces.data ?? []) as any[]) {
    const k = p.mechanism ?? "untagged";
    perMech[k] ??= { pieces: 0, views: 0, dms: 0, calls: 0, cash: 0, eng: 0, retention: 0, dropOff: 0, followerViews: 0, nonFollowerViews: 0, withMetrics: 0 };
    perMech[k].pieces += 1;
    const m = byId.get(p.id);
    if (m) {
      perMech[k].views += Number(m.views ?? 0);
      perMech[k].dms += Number(m.dms_generated ?? 0);
      perMech[k].calls += Number(m.calls_booked ?? 0);
      perMech[k].cash += Number(m.cash_collected_cents ?? 0);
      perMech[k].eng += Number(m.engagement_rate_pct ?? 0);
      perMech[k].retention += Number(m.hook_retention_pct ?? 0);
      perMech[k].dropOff += Number(m.drop_off_rate_pct ?? 0);
      perMech[k].followerViews += Number(m.follower_views ?? 0);
      perMech[k].nonFollowerViews += Number(m.non_follower_views ?? 0);
      perMech[k].withMetrics += 1;
    }
  }

  // Onboarding mechanism tags (2.9) — per-mechanism tag counts from the Onboarding page's scoring.
  const onboardingTags: Record<MechanismKey, number> = { educational: 0, credibility: 0, authoritative: 0, relatability: 0 };
  let onboardingUntagged = 0;
  for (const i of (intakes.data ?? []) as any[]) {
    const w = (i.mechanism_signals ?? {}) as Partial<MechanismWeights>;
    let top: MechanismKey | null = null, topVal = 0;
    for (const k of MECHANISM_KEYS) { const v = Number(w[k] ?? 0); if (v > topVal) { topVal = v; top = k; } }
    if (top) onboardingTags[top] += 1; else onboardingUntagged += 1;
  }

  const cash = ((payments.data ?? []) as any[]).reduce((s, p) => s + Number(p.amount_cents ?? 0), 0) / 100;
  const booked = (calls.data ?? []).length;
  const showed = ((calls.data ?? []) as any[]).filter(c => c.showed).length;
  const closed = ((calls.data ?? []) as any[]).filter(c => c.closed).length;

  const payload = `WINDOW: last ${days} days

RECOMMENDED MIX (from demand signals): ${MECHANISM_KEYS.map(k => `${k} ${demand.mix[k]}%`).join(" · ")}
TOP DEMAND DRIVERS:
${demand.drivers.slice(0, 12).map(d => `- [${d.mechanism}] ${d.source}: ${d.detail} (weight ${d.weight})`).join("\n") || "- none"}

CONTENT PERFORMANCE BY MECHANISM (reel-level detail, not aggregate):
${Object.entries(perMech).map(([k, v]) => {
    const n = Math.max(1, v.withMetrics);
    return `- ${k}: ${v.pieces} pieces (${v.withMetrics} with metrics logged) · ${v.views} views · ${v.dms} DMs · ${v.calls} calls booked · $${Math.round(v.cash / 100)} cash · avg retention ${Math.round(v.retention / n)}% · avg drop-off ${Math.round(v.dropOff / n)}% · ${v.followerViews} follower / ${v.nonFollowerViews} non-follower views`;
  }).join("\n") || "- no content logged"}

FAQ VIDEO CLICKS (subconscious objections — the real data source, not mocked):
${((faq.data ?? []) as any[]).map(f => `- ${f.title} (${f.mechanism ?? "unmapped"}): ${f.clicks} clicks, ${f.plays} plays, ${f.avg_watch_pct}% watched`).join("\n") || "- none"}

VSL SNAPSHOTS:
${((vslSnaps.data ?? []) as any[]).slice(0, 12).map(v => `- ${v.video_name ?? "VSL"}: play rate ${v.play_rate}%, avg watched ${v.avg_percent_watched}%, plays ${v.total_plays}, page loads ${v.page_loads}`).join("\n") || "- none"}

SETTING CALL SIGNALS (includes auto-ingested from closed calls, not just manual paste):
${((setters.data ?? []) as any[]).slice(0, 30).map(s => `- ${s.call_date} ${s.setter_name} [${s.source ?? "manual"}]: beliefs[${(s.limiting_beliefs ?? []).join("; ")}] objections[${(s.objections ?? []).join("; ")}]`).join("\n") || "- none"}

ONBOARDING MECHANISM TAGS (from client intake first-touchpoint/decision/join-sooner answers):
${MECHANISM_KEYS.map(k => `- ${k}: ${onboardingTags[k]} intakes tagged`).join("\n")}${onboardingUntagged ? `\n- untagged: ${onboardingUntagged} intakes with no keyword match` : ""}

SALES: ${booked} calls booked · ${showed} showed · ${closed} closed · $${Math.round(cash)} collected`;

  const system = `You are the growth strategist for a high-ticket coaching business that runs a 4-Conversion-Mechanism content system (Educational, Credibility, Authoritative, Relatability).

The operating belief: inconsistent cash is ALWAYS downstream of unknown posting, which is downstream of untracked performance. Cash > Unknown posting > Not tracking. Fix tracking = fix everything. Layer the root cause that way.

Return markdown with these EXACT sections:

## Root cause chain
Walk cash → posting → tracking for THIS data. Say plainly where the chain breaks and what's actually unknown.

## Recommended mix this week
A table: Mechanism | % of posts | Reels (out of 5-7) | Why (cite the signal: FAQ clicks, intake answer, setter objection, VSL drop-off, reel performance, or onboarding mechanism tag).

## Double down (green)
3-5 bullets. Formats/variations that produced DMs, calls, or cash. Name the piece and the number.

## Bottlenecks (red)
3-5 bullets. Which mechanism underperformed, WHY it underperformed (hook, format, wrong mechanism for current demand), and the exact fix.

## Missing tracking
What data is absent that makes this read weaker. Be specific about the field or module.

## This week's 5-7 reels
A numbered list. For each: mechanism, variation, hook direction, and the objection it kills.

Be blunt, use the numbers given, never invent data. If a section has no data, say what to start logging.`;

  return { insight: await gateway(system, payload), demand };
}

/** AI screen of a setting-call transcript / setter notes → beliefs, objections, mechanism. */
export async function extractSetterSignals(transcript: string) {
  const system = `You screen sales setting-call transcripts for a high-ticket coaching business.
Extract the prospect's LIMITING BELIEFS and OBJECTIONS, then decide which of 4 content mechanisms should be posted more to pre-handle them:
- educational (they don't understand the how / no clarity)
- credibility (they don't believe it's real / trust + proof gap)
- authoritative (price / worth-it / why-you positioning gap)
- relatability (they don't think it applies to someone like them)

Return STRICT JSON only, no prose, no code fences:
{"limiting_beliefs":["..."],"objections":["..."],"mechanism":"educational|credibility|authoritative|relatability","summary":"2-3 sentences on what content would kill these objections"}`;

  const raw = await gateway(system, transcript.slice(0, 24000));
  try {
    const json = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim());
    return {
      limiting_beliefs: Array.isArray(json.limiting_beliefs) ? json.limiting_beliefs.slice(0, 12).map(String) : [],
      objections: Array.isArray(json.objections) ? json.objections.slice(0, 12).map(String) : [],
      mechanism: MECHANISM_KEYS.includes(json.mechanism) ? json.mechanism as MechanismKey : null,
      summary: String(json.summary ?? "").slice(0, 1200),
    };
  } catch {
    return { limiting_beliefs: [], objections: [], mechanism: null, summary: raw.slice(0, 1200) };
  }
}
