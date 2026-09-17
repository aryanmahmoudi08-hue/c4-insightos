import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { cn } from "@/lib/utils";
import {
  isAnswered,
  EOD_CURRENCY_OPTIONS,
  type EodQuestion,
  type EodValues,
} from "@/lib/eod-reports";
import { OBJECTION_CATEGORIES, OTHER_OBJECTION_VALUE } from "@/lib/objection-taxonomy";
import { Label } from "@/components/ui/label";

export interface EodLeadOption {
  id: string;
  label: string;
  email: string | null;
}

interface Props {
  title: string;
  subtitle: string;
  schema: EodQuestion[];
  leadOptions?: EodLeadOption[];
  onSubmit: (values: EodValues) => Promise<void>;
  onExit: () => void;
}

const currencySymbolFor = (code: string): string => {
  try {
    return (
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? "$"
    );
  } catch {
    return "$";
  }
};

const fmtValue = (
  q: EodQuestion,
  v: string | number | boolean | undefined,
  leadOptions?: EodLeadOption[],
  currencyCode = "USD",
  otherText?: string,
  allValues?: EodValues,
): string => {
  if (q.type === "followup-details") {
    if (!allValues) return "—";
    const parts: string[] = [];
    const requestedAt = allValues.followup_requested_at;
    if (requestedAt) {
      parts.push(
        `Requested for ${new Date(String(requestedAt)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`,
      );
    }
    const amount = allValues.followup_amount_pitched;
    if (amount !== undefined && amount !== "") {
      parts.push(
        `${currencySymbolFor(currencyCode)}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pitched`,
      );
    }
    const reason = String(allValues.followup_reason ?? "");
    if (reason) {
      const opt = OBJECTION_CATEGORIES.find((c) => c.value === reason);
      const reasonLabel = opt?.label ?? reason;
      const reasonOtherText = String(allValues.followup_reason_other ?? "");
      parts.push(
        reason === OTHER_OBJECTION_VALUE && reasonOtherText
          ? `${reasonLabel} (${reasonOtherText})`
          : reasonLabel,
      );
    }
    const notes = String(allValues.followup_notes ?? "");
    if (notes) parts.push(`Notes: ${notes}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  if (v === undefined || v === "") return "—";
  if (q.type === "checkbox") return v ? "Yes" : "No";
  if (q.type === "select" || q.type === "team-member") return String(v);
  if (q.type === "lead-picker") return leadOptions?.find((l) => l.id === v)?.label ?? "None picked";
  if (q.type === "objection-multiselect") {
    const labels = String(v)
      .split(",")
      .filter(Boolean)
      .map((value) => {
        const opt = OBJECTION_CATEGORIES.find((c) => c.value === value);
        if (value === OTHER_OBJECTION_VALUE && otherText) return `${opt?.label} (${otherText})`;
        return opt?.label ?? value;
      });
    return labels.length > 0 ? labels.join(", ") : "—";
  }
  if (q.money)
    return `${currencySymbolFor(currencyCode)}${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (q.type === "number") return String(v);
  return String(v);
};

/**
 * Schema-driven, one-question-at-a-time flow — the shared engine behind all
 * three EOD reports. Every visual/behavioral decision here (large question
 * typography, per-step required blocking, back preserving state, a real
 * review screen) mirrors what's in flickering-tinkering-barto.md's "EOD
 * Reports Rebuild" plan; nothing role-specific lives in this file, that's
 * entirely in the schema passed in.
 */
export function EodStepFlow({ title, subtitle, schema, leadOptions, onSubmit, onExit }: Props) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<EodValues>(() => {
    const initial: EodValues = {};
    for (const q of schema) if (q.defaultValue !== undefined) initial[q.key] = q.defaultValue;
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Conditional steps (e.g. Closer EOD's Follow-Up Details, shown only for
  // a follow-up Lead Status) are filtered out of the flow entirely rather
  // than just hidden — recomputed every render off the live `values`, so
  // answering an earlier question can make a later step appear/disappear
  // before the rep reaches it, without renumbering the fixed questions
  // around it.
  const effectiveSchema = schema.filter((q) => !q.showIf || q.showIf(values));
  const total = effectiveSchema.length;
  const isReview = step === total;
  const current = !isReview ? effectiveSchema[step] : null;
  const currentValid = current ? isAnswered(current, values) : true;
  const pct = isReview ? 100 : Math.round((step / total) * 100);

  const setVal = (key: string, v: string | number | boolean | undefined) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const handleFieldChange = (v: string | number | boolean | undefined) => {
    if (!current) return;
    setVal(current.key, v);
    // Picking a lead pre-fills the next screen's email, same convenience the
    // "Log call" dialog already gives — only if the rep hasn't typed one yet.
    if (current.type === "lead-picker" && typeof v === "string") {
      const lead = leadOptions?.find((l) => l.id === v);
      if (lead?.email)
        setValues((prev) =>
          prev.lead_email ? prev : { ...prev, lead_email: lead.email as string },
        );
    }
  };

  const goNext = () => {
    if (current && !currentValid) return;
    setStep((s) => Math.min(s + 1, total));
  };
  const goBack = () => {
    if (step === 0) {
      onExit();
      return;
    }
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(values);
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    const initial: EodValues = {};
    for (const q of schema) if (q.defaultValue !== undefined) initial[q.key] = q.defaultValue;
    setValues(initial);
    setStep(0);
    setDone(false);
  };

  if (done) {
    return (
      <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-10 text-center">
        <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="display-serif text-2xl">Logged.</h2>
          <p className="text-sm text-muted-foreground">{title} submitted successfully.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={onExit}>
              Back to EOD Reports
            </Button>
            <Button onClick={resetFlow}>Log another</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-6 md:p-10">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative mx-auto max-w-xl">
        <div className="mb-6">
          <div className="eyebrow">{subtitle}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Progress value={pct} className="h-1.5" />
            <span className="shrink-0 whitespace-nowrap text-3xs font-mono uppercase tracking-wider text-muted-foreground">
              {isReview ? "Review" : `Step ${step + 1} of ${total}`}
            </span>
          </div>
        </div>

        {!isReview && current && (
          <div
            className="animate-in fade-in-0 slide-in-from-right-2 duration-200"
            key={current.key}
          >
            <h2 className="display-serif text-2xl leading-snug md:text-3xl">{current.label}</h2>
            {current.helper && (
              <p className="mt-2 text-sm text-muted-foreground">{current.helper}</p>
            )}
            <div className="mt-6">
              <QuestionField
                question={current}
                value={values[current.key]}
                onChange={handleFieldChange}
                leadOptions={leadOptions}
                onAdvance={goNext}
                currencyCode={String(values.original_currency ?? "USD")}
                onCurrencyChange={(code) => setVal("original_currency", code)}
                objectionsOther={String(values.objections_other ?? "")}
                onObjectionsOtherChange={(v) => setVal("objections_other", v)}
                values={values}
                setVal={setVal}
              />
            </div>
          </div>
        )}

        {isReview && (
          <div className="animate-in fade-in-0 duration-200">
            <h2 className="display-serif text-2xl leading-snug md:text-3xl">
              Review before you submit
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Here's what's about to be logged. Edit anything that's off.
            </p>
            <div className="mt-6 divide-y divide-border rounded-lg border border-border/60">
              {effectiveSchema.map((q, i) => (
                <div key={q.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                      {q.label}
                    </div>
                    <div className="mt-0.5 text-sm font-medium">
                      {fmtValue(
                        q,
                        values[q.key],
                        leadOptions,
                        String(values.original_currency ?? "USD"),
                        String(values.objections_other ?? ""),
                        values,
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    aria-label={`Edit ${q.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {isReview ? (
            <Button type="button" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
              {submitting ? "Submitting…" : "Submit"} <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={!currentValid} className="gap-1.5">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
  leadOptions,
  onAdvance,
  currencyCode = "USD",
  onCurrencyChange,
  objectionsOther = "",
  onObjectionsOtherChange,
  values,
  setVal,
}: {
  question: EodQuestion;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
  leadOptions?: EodLeadOption[];
  onAdvance: () => void;
  /** The submission's one shared original_currency value, so this field's
   * money prefix/dropdown reflects what the rep actually chose rather than
   * a hardcoded $. */
  currencyCode?: string;
  /** Writes to the submission's shared original_currency — a separate
   * channel from `onChange` (which only ever writes this question's own
   * key), since the inline currency dropdown belongs to the whole
   * submission, not to this one field. */
  onCurrencyChange?: (code: string) => void;
  /** The submission's shared objections_other free-text value — same
   * paired-field pattern as currencyCode/onCurrencyChange above, since
   * "objection-multiselect"'s own `value`/`onChange` only ever carry the
   * selected category list, not the Other explanation. */
  objectionsOther?: string;
  onObjectionsOtherChange?: (v: string) => void;
  /** Full submission + generic setter — only "followup-details" uses these,
   * since that one step writes several distinct keys at once
   * (followup_requested_at/followup_amount_pitched/followup_reason/
   * followup_reason_other/followup_notes) rather than the single
   * value/onChange every other question type carries. */
  values: EodValues;
  setVal: (key: string, v: string | number | boolean | undefined) => void;
}) {
  const enterAdvances = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onAdvance();
    }
  };

  switch (question.type) {
    case "number": {
      const currencySymbol = question.money ? currencySymbolFor(currencyCode) : null;
      return (
        <div className="space-y-2">
          <div className="relative">
            {currencySymbol && (
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-sans tabular-nums text-muted-foreground">
                {currencySymbol}
              </span>
            )}
            <Input
              autoFocus
              type="number"
              min={question.min}
              max={question.max}
              step={question.step ?? 1}
              value={value === undefined ? "" : String(value)}
              onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
              onKeyDown={enterAdvances}
              placeholder={question.placeholder}
              className={cn(
                "h-20 text-center font-sans text-4xl tabular-nums",
                question.money && "pl-10",
                question.currency && "pr-28",
              )}
            />
            {/* Inline currency dropdown — part of this money question, not a
                separate question/step (item 6 correction). Bound to the
                submission's one shared original_currency value. */}
            {question.currency && onCurrencyChange && (
              <Select value={currencyCode} onValueChange={onCurrencyChange}>
                <SelectTrigger className="absolute right-2 top-1/2 h-10 w-24 -translate-y-1/2 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EOD_CURRENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      );
    }
    case "textarea":
      return (
        <Textarea
          autoFocus
          rows={4}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          className="text-base"
        />
      );
    case "select":
      return (
        <Select
          value={value === undefined ? undefined : String(value)}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-14 text-lg">
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={value === true ? "default" : "outline"}
            className="h-14 text-base"
            onClick={() => onChange(true)}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant={value === false ? "default" : "outline"}
            className="h-14 text-base"
            onClick={() => onChange(false)}
          >
            No
          </Button>
        </div>
      );
    case "objection-multiselect": {
      const selected = String(value ?? "")
        .split(",")
        .filter(Boolean);
      const toggle = (v: string) => {
        const wasSelected = selected.includes(v);
        const next = wasSelected ? selected.filter((s) => s !== v) : [...selected, v];
        onChange(next.length > 0 ? next.join(",") : undefined);
        // Turning Other off clears its paired text so a stale explanation
        // can't linger unselected and get submitted anyway.
        if (v === OTHER_OBJECTION_VALUE && wasSelected) onObjectionsOtherChange?.("");
      };
      const otherSelected = selected.includes(OTHER_OBJECTION_VALUE);
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OBJECTION_CATEGORIES.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  htmlFor={`objection_${opt.value}`}
                  className={cn(
                    "flex h-12 cursor-pointer items-center gap-3 rounded-md border px-4 text-base transition-colors",
                    isSelected ? "border-primary bg-primary/10" : "border-input hover:bg-muted/40",
                  )}
                >
                  <Checkbox
                    id={`objection_${opt.value}`}
                    checked={isSelected}
                    onCheckedChange={() => toggle(opt.value)}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          {otherSelected && (
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground" htmlFor="objections_other_input">
                Other objection:
              </label>
              <Input
                id="objections_other_input"
                autoFocus
                required
                value={objectionsOther}
                onChange={(e) => onObjectionsOtherChange?.(e.target.value)}
                onKeyDown={enterAdvances}
                placeholder="Describe the specific objection"
                className="h-12 text-base"
              />
            </div>
          )}
        </div>
      );
    }
    case "followup-details": {
      const requestedAt = String(values.followup_requested_at ?? "");
      const amountPitched = values.followup_amount_pitched;
      const reason = String(values.followup_reason ?? "");
      const reasonOther = String(values.followup_reason_other ?? "");
      const notes = String(values.followup_notes ?? "");
      const reasonIsOther = reason === OTHER_OBJECTION_VALUE;
      const currencySymbol = currencySymbolFor(currencyCode);
      return (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">
              When did the lead ask to be followed up with?
            </Label>
            <Input
              autoFocus
              type="datetime-local"
              value={requestedAt}
              onChange={(e) => setVal("followup_requested_at", e.target.value)}
              className="h-14 text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">How much was pitched?</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-sans tabular-nums text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={amountPitched === undefined ? "" : String(amountPitched)}
                onChange={(e) =>
                  setVal(
                    "followup_amount_pitched",
                    e.target.value === "" ? undefined : Number(e.target.value),
                  )
                }
                placeholder="0"
                className="h-14 pl-10 text-lg"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">
              Why is this lead being followed up with?
            </Label>
            <Select value={reason || undefined} onValueChange={(v) => setVal("followup_reason", v)}>
              <SelectTrigger className="h-14 text-lg">
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent>
                {OBJECTION_CATEGORIES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reasonIsOther && (
              <Input
                autoFocus
                required
                value={reasonOther}
                onChange={(e) => setVal("followup_reason_other", e.target.value)}
                placeholder="Describe the specific reason"
                className="mt-2 h-12 text-base"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">
              What specifically should be remembered for the follow-up? (optional)
            </Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setVal("followup_notes", e.target.value)}
              placeholder="What they need to decide, what they're waiting on, what you promised to send…"
              className="text-base"
            />
          </div>
        </div>
      );
    }
    case "scale": {
      const lo = question.min ?? 1;
      const hi = question.max ?? 10;
      const opts = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
      return (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {opts.map((n) => (
            <Button
              key={n}
              type="button"
              variant={value === n ? "default" : "outline"}
              className="h-12 font-sans tabular-nums text-base"
              onClick={() => onChange(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      );
    }
    case "team-member":
      return (
        <TeamMemberPicker
          role={question.teamRole!}
          value={value === undefined ? undefined : String(value)}
          onChange={(v) => onChange(v)}
          name={question.key}
        />
      );
    case "lead-picker":
      return (
        <Select
          value={value === undefined ? undefined : String(value)}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-14 text-lg">
            <SelectValue placeholder="Pick a lead (optional)" />
          </SelectTrigger>
          <SelectContent>
            {(leadOptions ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "date":
      return (
        <Input
          autoFocus
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterAdvances}
          className="h-14 text-lg"
        />
      );
    case "datetime":
      return (
        <Input
          autoFocus
          type="datetime-local"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterAdvances}
          className="h-14 text-lg"
        />
      );
    case "email":
      return (
        <Input
          autoFocus
          type="email"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterAdvances}
          placeholder={question.placeholder}
          className="h-14 text-lg"
        />
      );
    case "url":
      return (
        <Input
          autoFocus
          type="url"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterAdvances}
          placeholder={question.placeholder}
          className="h-14 text-lg"
        />
      );
    default:
      return (
        <Input
          autoFocus
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enterAdvances}
          placeholder={question.placeholder}
          className="h-14 text-lg"
        />
      );
  }
}
