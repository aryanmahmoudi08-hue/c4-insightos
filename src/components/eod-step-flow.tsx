import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { isAnswered, type EodQuestion, type EodValues } from "@/lib/eod-reports";

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

const fmtValue = (
  q: EodQuestion,
  v: string | number | boolean | undefined,
  leadOptions?: EodLeadOption[],
): string => {
  if (v === undefined || v === "") return "—";
  if (q.type === "checkbox") return v ? "Yes" : "No";
  if (q.type === "select" || q.type === "team-member") return String(v);
  if (q.type === "lead-picker") return leadOptions?.find((l) => l.id === v)?.label ?? "None picked";
  if (q.money)
    return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const total = schema.length;
  const isReview = step === total;
  const current = !isReview ? schema[step] : null;
  const currentValid = current ? isAnswered(current, values[current.key]) : true;
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
              {schema.map((q, i) => (
                <div key={q.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
                      {q.label}
                    </div>
                    <div className="mt-0.5 text-sm font-medium">
                      {fmtValue(q, values[q.key], leadOptions)}
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
}: {
  question: EodQuestion;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean | undefined) => void;
  leadOptions?: EodLeadOption[];
  onAdvance: () => void;
}) {
  const enterAdvances = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onAdvance();
    }
  };

  switch (question.type) {
    case "number":
      return (
        <div className="relative">
          {question.money && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-mono text-muted-foreground">
              $
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
              "h-20 text-center font-mono text-4xl tabular-nums",
              question.money && "pl-10",
            )}
          />
        </div>
      );
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
              className="h-12 font-mono text-base"
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
