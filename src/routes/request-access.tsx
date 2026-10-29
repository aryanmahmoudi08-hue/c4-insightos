import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAppRole, type AppRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ascendOsWhite from "@/assets/ascendos-stacked-white.png";
import ascendOsBlack from "@/assets/ascendos-stacked-black.png";

export const Route = createFileRoute("/request-access")({
  component: RequestAccess,
  head: () => ({
    meta: [
      { title: "Request access | AscendOS" },
      {
        name: "description",
        content: "Ask your workspace admin for access to their AscendOS team.",
      },
    ],
  }),
});

const ROLES: { value: AppRole; label: string }[] = [
  { value: "setter", label: "DM Setter" },
  { value: "inbound_dialer", label: "Inbound Dialer" },
  { value: "closer", label: "Closer" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "growth_ops", label: "Growth / Ops" },
  { value: "viewer", label: "Viewer (read-only)" },
];

/** Mirrors the applicant-photos bucket's own limits. Checking here too is not
 *  belt-and-braces — the bucket rejects an oversized file with a storage error
 *  nobody can act on, and this says what to do about it instead. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

function RequestAccess() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    admin_email: "",
    requested_role: "setter" as AppRole,
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const takePhoto = (file: File | null | undefined) => {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast.error("That file isn't a JPG, PNG or WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`);
      return;
    }
    // Revoke the previous object URL before replacing it; swapping photos a few
    // times otherwise leaks a blob per attempt for the life of the page.
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setPhoto(file);
  };

  const clearPhoto = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setPhoto(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let photo_path: string | null = null;
      if (photo) {
        const ext =
          photo.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
        // Keyed by the applicant's email rather than their name: it is the one
        // field that has to be unique anyway, and it keeps a re-application
        // from colliding with someone else's upload.
        const safeEmail = form.email
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_");
        photo_path = `${safeEmail}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from("applicant-photos")
          .upload(photo_path, photo, { contentType: photo.type });
        if (error) throw new Error(`Photo upload failed: ${error.message}`);
      }

      const { error } = await supabase.rpc("submit_membership_request", {
        _admin_email: form.admin_email.trim(),
        _email: form.email.trim(),
        _full_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
        _requested_role: form.requested_role,
        _phone: form.phone.trim() || null,
        _photo_path: photo_path,
      } as never);
      if (error) throw error;

      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // "admin not found" is the one failure an applicant can actually fix, so
      // it gets its own sentence rather than the raw Postgres exception.
      toast.error(
        /admin not found/i.test(msg)
          ? "No workspace found for that admin email. Check it with whoever invited you."
          : /no workspace for admin/i.test(msg)
            ? "That admin doesn't have a workspace yet. Ask them to set one up first."
            : msg || "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = ROLES.find((r) => r.value === form.requested_role)?.label ?? "";

  if (sent) {
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[color:var(--color-success)]/15">
            <Check className="h-6 w-6 text-[color:var(--color-success)]" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">Request sent</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            We've let your workspace admin know. Once they approve you, you'll get an email and can
            sign in as <span className="text-foreground">{roleLabel}</span>.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form
        onSubmit={submit}
        className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        {/* Role sits above the form as a settled decision rather than inside it
            as one more question — it changes what the rest of the form is for. */}
        <div className="flex items-center justify-between gap-3 rounded-full border border-border bg-muted/40 py-2 pl-4 pr-2">
          <span className="truncate text-sm">
            <span className="text-muted-foreground">Joining as: </span>
            <span className="font-medium">{roleLabel}</span>
          </span>
          <Select
            value={form.requested_role}
            onValueChange={(v) => {
              if (isAppRole(v)) set("requested_role", v);
            }}
          >
            <SelectTrigger
              aria-label="Role you're joining as"
              className="h-8 w-auto gap-1 rounded-full border-0 bg-transparent px-3 text-xs font-medium text-foreground shadow-none hover:bg-muted focus:ring-0"
            >
              <SelectValue asChild>
                <span>Change</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-muted-foreground">
          Tell us a bit about yourself. Everything except the photo is required.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input
              required
              autoComplete="given-name"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <Input
              required
              autoComplete="family-name"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              required
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Workspace admin's email">
          <Input
            type="email"
            required
            value={form.admin_email}
            onChange={(e) => set("admin_email", e.target.value)}
          />
          <p className="text-2xs leading-relaxed text-muted-foreground">
            This is how we find the right team. Use the email of whoever runs your AscendOS
            workspace — not your own.
          </p>
        </Field>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <Label className="text-xs font-medium text-foreground/80">Photo of yourself</Label>
            <span className="text-2xs text-muted-foreground">Optional</span>
          </div>
          <p className="text-2xs leading-relaxed text-muted-foreground">
            A clear, recent photo. It becomes your avatar on the leaderboard and across the app,
            instead of your initials.
          </p>

          <input
            ref={fileInput}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => takePhoto(e.target.files?.[0])}
          />

          {preview ? (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-3">
              <img
                src={preview}
                alt="Your selected photo"
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{photo?.name}</p>
                <p className="text-2xs text-muted-foreground">
                  {photo ? `${(photo.size / 1024 / 1024).toFixed(1)} MB` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={clearPhoto}
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                takePhoto(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 transition-colors",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20 hover:border-foreground/25",
              )}
            >
              <Camera className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Choose your photo</span>
              <span className="text-2xs text-muted-foreground">JPG, PNG or WebP · up to 10 MB</span>
            </button>
          )}
        </div>

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send request"
          )}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <img
          src={ascendOsWhite}
          alt="AscendOS"
          className="theme-logo-dark mx-auto h-14 w-auto object-contain"
        />
        <img
          src={ascendOsBlack}
          alt="AscendOS"
          className="theme-logo-light mx-auto h-14 w-auto object-contain"
        />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">Request access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Join your team's AscendOS workspace.</p>
      </div>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
