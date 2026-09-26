/**
 * Google Apps Script — Daily Win form -> AscendOS
 *
 * Setup:
 *   1. Open your Google Form -> three dots -> Script editor
 *   2. Paste this file, replacing the two constants below
 *   3. Run `setup()` once and approve the permission prompt
 *   4. Submit a test response; check Ops -> Event Bus in AscendOS
 *
 * The ingest token is a write credential for your workspace. Apps Script
 * projects attached to a Form are visible to anyone who can edit that Form,
 * so do not give Form edit access to people who should not have it. Rotate
 * the token in Settings -> Connections if it leaks.
 */

const ASCENDOS_URL = "https://ascendos.aryanmahmoudi.workers.dev";
const INGEST_TOKEN = "PASTE_YOUR_INGEST_TOKEN_HERE";

/**
 * Maps your Form's question titles to AscendOS fields.
 *
 * The KEY is the question title in your Form, exactly as written, including
 * capitalisation and punctuation. The VALUE is the AscendOS field.
 * Edit the keys to match your Form; leave the values alone.
 */
const FIELD_MAP = {
  "Your name": "student_name",
  "What did you get done today?": "win_description",
  "What kind of win was this?": "win_types",
  "How much cash did you collect?": "financial_amount",
  "Where did that money come from?": "financial_source",
  "Proof (link)": "proof_url",
  "Energy today (1-10)": "energy_score",
  "What's blocking you?": "blocker",
  "Tomorrow's needle mover": "tomorrow_needle_mover",
  "What did you commit to yesterday?": "yesterday_commitment",
  "Did you do it?": "yesterday_status",
  "What work did you do?": "work_done",
};

/**
 * The exact answer text that marks a financial win.
 *
 * This matters: AscendOS only counts `financial_amount_cents` toward Student
 * Cash Logged when win_types contains "financial". If this string does not
 * match your Form's option, cash will be submitted and silently ignored.
 */
const FINANCIAL_WIN_LABEL = "Financial win";

function setup() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onFormSubmit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onFormSubmit").forForm(form).onFormSubmit().create();
  Logger.log("Trigger installed. Submit a test response now.");
}

function onFormSubmit(e) {
  const answers = {};
  e.response.getItemResponses().forEach(function (item) {
    answers[item.getItem().getTitle()] = item.getResponse();
  });

  const out = { student_name: "", win_description: "", win_types: [] };

  Object.keys(FIELD_MAP).forEach(function (title) {
    const field = FIELD_MAP[title];
    let value = answers[title];
    if (value === undefined || value === null || value === "") return;

    if (field === "win_types") {
      // Checkbox questions return an array; multiple-choice returns a string.
      const picked = Array.isArray(value) ? value : [value];
      out.win_types = picked.map(function (v) {
        // "Financial win" -> "financial", which is the tag AscendOS keys on.
        return String(v) === FINANCIAL_WIN_LABEL ? "financial" : slug(String(v));
      });
    } else if (field === "financial_amount") {
      // Dollars in the form, cents in the API. Strips "$" and "," so "1,250"
      // and "$1250" both work — people type both.
      const cents = Math.round(parseFloat(String(value).replace(/[^0-9.]/g, "")) * 100);
      if (!isNaN(cents) && cents >= 0) out.financial_amount_cents = cents;
    } else if (field === "energy_score") {
      const n = parseInt(String(value), 10);
      if (!isNaN(n)) out.energy_score = Math.max(1, Math.min(10, n));
    } else {
      out[field] = String(value);
    }
  });

  if (!out.student_name || !out.win_description) {
    Logger.log("Skipped: missing student_name or win_description. Check FIELD_MAP keys.");
    return;
  }

  const res = UrlFetchApp.fetch(ASCENDOS_URL + "/api/public/ingest/" + INGEST_TOKEN, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ event_type: "daily_win", data: out }),
    muteHttpExceptions: true,
  });

  Logger.log("AscendOS " + res.getResponseCode() + ": " + res.getContentText());
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}
