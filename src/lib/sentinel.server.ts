import { fetchCoreWindow, buildWeeklyReport } from "@/lib/weekly-report.server";
import { computeDemand } from "@/lib/content-signals.server";
import { clientAtRiskReason } from "@/lib/client-risk";
import { DEFAULT_WORKSPACE_SETTINGS, type WorkspaceSettings } from "@/lib/workspace-settings.functions";

type Sb = { from: (t: string) => any };

/**
 * C4 Sentinel — curated tool-calling, not open text-to-SQL. Every tool below
 * wraps a function this app already computes real numbers with elsewhere
 * (buildWeeklyReport/fetchCoreWindow from weekly-report.server.ts,
 * computeDemand from content-signals.server.ts, clientAtRiskReason from
 * client-risk.ts) — the model picks which tool(s) to call, gets back a real
 * query result, and narrates it. It never has raw SQL access and can't
 * invent a number that didn't come from a real result — same discipline as
 * this app's minSample/insufficientData gating elsewhere, applied here as
 * "the tool returned thin/empty data → say so," never a confident guess.
 */

export type SentinelMessage = { role: "user" | "assistant"; content: string };

type ToolDef = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (sb: Sb, orgId: string, settings: WorkspaceSettings, args: Record<string, unknown>) => Promise<unknown>;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgoIso = (n: number) => isoDate(new Date(Date.now() - n * 86400e3));

const TOOLS: ToolDef[] = [
  {
    name: "get_weekly_snapshot",
    description: "The full rolling-last-7-days business snapshot: cash collected + WoW delta, calls booked/showed/closed + rates, new leads, closer/setter leaderboards, funnel health (what's capping growth, what's working), content mix, client renewal/at-risk breakdown, hiring pipeline. This is the SAME data the Weekly Report page shows. Use this first for any general 'how's business doing' / 'how was this week' question before reaching for a narrower tool.",
    parameters: { type: "object", properties: {} },
    run: async (sb, orgId, settings) => buildWeeklyReport(sb, orgId, settings),
  },
  {
    name: "get_cash_and_calls_for_range",
    description: "Cash collected, calls booked/showed/closed, new leads, and closer/setter cash+close breakdowns for an ARBITRARY date range (not just the last 7 days). Use when the user asks about a specific period, a longer window, or wants to compare two custom ranges (call it twice).",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD (inclusive)." },
        to: { type: "string", description: "End date, YYYY-MM-DD (inclusive)." },
      },
      required: ["from", "to"],
    },
    run: async (sb, orgId, _settings, args) => fetchCoreWindow(sb, orgId, String(args.from), String(args.to)),
  },
  {
    name: "get_content_mix",
    description: "The recommended content-mechanism mix (educational/credibility/authoritative/relatability) computed from real FAQ clicks, setter-call signals, onboarding intakes, and posted reels — same computation /content-signals shows. Explicitly flags insufficientData when total signal weight is too thin to be confident. Defaults to the last 30 days if no range given.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date, YYYY-MM-DD. Optional — defaults to 30 days ago." },
        to: { type: "string", description: "End date, YYYY-MM-DD. Optional — defaults to today." },
      },
    },
    run: async (sb, orgId, settings, args) => computeDemand(
      sb, orgId,
      { from: String(args.from ?? daysAgoIso(29)), to: String(args.to ?? isoDate(new Date())) },
      settings.content_engine,
    ),
  },
  {
    name: "list_at_risk_clients",
    description: "Every active client currently flagged at-risk (renewal within the workspace's configured at-risk window with no renewal conversation started, or an overdue renewal), with the specific reason per client — not just a count. Same clientAtRiskReason logic the Clients page and Weekly Report use.",
    parameters: { type: "object", properties: {} },
    run: async (sb, orgId, settings) => {
      const { data, error } = await sb.from("clients")
        .select("id, full_name, renewal_date, renewal_conv_started, status")
        .eq("org_id", orgId).eq("status", "active");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; full_name: string | null; renewal_date: string | null; renewal_conv_started: boolean | null }[];
      const atRisk = rows
        .map((c) => ({ name: c.full_name ?? "(unnamed)", reason: clientAtRiskReason(c, settings.clients.renewalAtRiskDays) }))
        .filter((c): c is { name: string; reason: string } => c.reason !== null);
      return { atRiskCount: atRisk.length, totalActiveClients: rows.length, atRisk };
    },
  },
  {
    name: "get_open_alerts",
    description: "Every currently unacknowledged alert (real threshold breaches logged to the alerts table — the same 'Open Alerts' card shown on the Main Hub), most recent first.",
    parameters: { type: "object", properties: {} },
    run: async (sb, orgId) => {
      const { data, error } = await sb.from("alerts")
        .select("id, severity, title, created_at")
        .eq("org_id", orgId).eq("acknowledged", false)
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw new Error(error.message);
      return { openAlertCount: (data ?? []).length, alerts: data ?? [] };
    },
  },
];

/** Built fresh per call (not a module-level constant) — the model has no
 * other way to know "today," and without it every relative-time question
 * ("past 24 hours," "this month," "yesterday") is unanswerable even though
 * get_cash_and_calls_for_range genuinely accepts arbitrary dates. This was
 * the real root cause behind identical answers to different timeframe
 * questions: not a missing tool, a missing anchor date to compute against. */
function buildSystemPrompt(): string {
  const now = new Date();
  const today = isoDate(now);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const yesterday = daysAgoIso(1);
  const last24h = daysAgoIso(1);

  return `You are C4 Sentinel, the operating assistant inside C4 InsightOS — a business-ops platform for a high-ticket coaching/info-product company.

Today's date is ${today} (${weekday}). Use this to resolve every relative time expression into concrete YYYY-MM-DD bounds before calling a tool — never guess or leave a range vague:
- "today" / "past 24 hours" / "last 24 hours" → from=${last24h} to=${today}
- "yesterday" → from=${yesterday} to=${yesterday}
- "this month" → from=${monthStart} to=${today}
- "this week" / no timeframe stated / a general "how's business doing" → use get_weekly_snapshot (its own fixed rolling-7-day window), not get_cash_and_calls_for_range
- any OTHER explicit or implied period (a specific week, "last 30 days," a date range, a named month) → compute the exact from/to yourself relative to today's date above and call get_cash_and_calls_for_range

Rules, non-negotiable:
1. You may ONLY state numbers that came back from a tool call. Never estimate, round confidently past what a tool returned, or fill a gap with a plausible-sounding guess.
2. If a tool returns insufficientData, a zero, an empty list, or a query error, say so plainly ("I don't have enough data to answer that yet — X" / "That tool failed: Y") rather than smoothing over it with a confident-sounding answer.
3. If NO tool in your toolset can answer the question (it asks for data this app doesn't track — e.g. CAC, ROAS, ad spend, churn — none of which exist yet), say exactly that: name what's missing, don't substitute a nearby number and imply it answers the question.
4. Call a tool before answering any question that depends on real numbers — cash, calls, leads, content, clients, alerts. Only skip tool calls for pure clarification questions back to the user.
5. When the user corrects or narrows a prior question (e.g. "no, I meant literally the last 24 hours"), treat it as a NEW question with the corrected timeframe/scope — call the tool again with the corrected bounds, never repeat your previous answer verbatim.
6. Cite the concrete numbers you're grounding on in your answer (e.g. "$42,500 collected this week, up 16% WoW" not "cash is trending well").
7. You are read-only. You never suggest you can change data, send messages, or take actions — only answer questions.
8. Keep answers tight and specific — this is a working dashboard assistant, not a report generator. A few sentences, not an essay, unless the user asks for detail.`;
}

type OpenAiMessage = { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };

async function callGateway(apiKey: string, messages: OpenAiMessage[]) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      messages,
      tools: TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "auto",
    }),
  });
}

const MAX_TOOL_TURNS = 4;

export async function askSentinel(
  sb: Sb, orgId: string, settings: WorkspaceSettings, conversation: SentinelMessage[],
): Promise<{ reply: string; toolsUsed: string[] }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { reply: "AI is not configured.", toolsUsed: [] };

  const messages: OpenAiMessage[] = [{ role: "system", content: buildSystemPrompt() }, ...conversation];
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let res: Response;
    try {
      res = await callGateway(apiKey, messages);
    } catch (e) {
      return { reply: `AI request failed: ${e instanceof Error ? e.message : "network error"}`, toolsUsed };
    }
    if (res.status === 429) return { reply: "AI rate limit hit — try again in a minute.", toolsUsed };
    if (res.status === 402) return { reply: "AI credits exhausted — add credits to keep using C4 Sentinel.", toolsUsed };
    if (!res.ok) return { reply: `AI error (${res.status}): ${(await res.text()).slice(0, 400)}`, toolsUsed };

    const json: { choices?: { message?: OpenAiMessage }[] } = await res.json();
    const msg = json.choices?.[0]?.message;
    if (!msg) return { reply: "No response from AI.", toolsUsed };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);
      for (const call of msg.tool_calls) {
        const tool = TOOLS.find((t) => t.name === call.function.name);
        let resultPayload: unknown;
        if (!tool) {
          resultPayload = { error: `Unknown tool: ${call.function.name}` };
        } else {
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            resultPayload = await tool.run(sb, orgId, settings, args);
            toolsUsed.push(tool.name);
          } catch (e) {
            resultPayload = { error: e instanceof Error ? e.message : "Tool call failed." };
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(resultPayload) });
      }
      continue;
    }

    return { reply: msg.content?.trim() || "No insight returned.", toolsUsed };
  }

  return { reply: "That question needed more tool calls than I allow in one turn — try breaking it into smaller questions.", toolsUsed };
}

export { DEFAULT_WORKSPACE_SETTINGS };
