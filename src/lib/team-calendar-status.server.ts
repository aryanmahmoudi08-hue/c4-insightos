type StatusInput = { calendar_id?: string | null; ical_url?: string | null };
type StatusResult = { ok: boolean; error: string | null };

export async function checkCalendarStatus({ calendar_id, ical_url }: StatusInput): Promise<StatusResult> {
  const url = ical_url?.trim() || (calendar_id ? `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendar_id)}/public/basic.ics` : null);
  if (!url) return { ok: false, error: "No calendar ID or iCal URL saved." };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "C4InsightOS-CalendarCheck/1.0" } });
    clearTimeout(timeout);
    if (!res.ok) {
      return { ok: false, error: res.status === 404 ? "Calendar not found — check the calendar ID." : `Calendar feed returned HTTP ${res.status}.` };
    }
    const body = await res.text();
    if (!body.trim().startsWith("BEGIN:VCALENDAR")) {
      return { ok: false, error: "Calendar isn't publicly shared yet — set it to public or share the iCal URL." };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Timed out reaching the calendar." : "Couldn't reach the calendar feed." };
  }
}
