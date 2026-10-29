import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { enableDevBypass } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import ascendOsWhite from "@/assets/ascendos-stacked-white.png";
import ascendOsBlack from "@/assets/ascendos-stacked-black.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav({ to: "/home" });
    });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created. Request access to a workspace next.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Supabase's own Google OAuth, not Lovable's.
   *
   * `@lovable.dev/cloud-auth-js` opens a popup at `/~oauth/initiate` — a
   * relative path served by Lovable's hosting, not by this app. The moment the
   * app was deployed anywhere else that path 404s, so the popup loaded a 404
   * and the flow could never complete. Verified 404 on both the Vercel and the
   * Cloudflare deployments, so this has been broken since the app left Lovable
   * hosting rather than being a regression from any one move.
   *
   * Supabase is already the session owner here — Lovable's wrapper only existed
   * to hand its tokens to `supabase.auth.setSession`. Going direct removes the
   * broker instead of trying to reimplement it.
   */
  const google = async () => {
    // skipBrowserRedirect so we hold the URL instead of leaving immediately.
    // signInWithOAuth only builds that URL — it never calls it — so a provider
    // that is switched off produces no client-side error at all. Redirecting
    // blind lands the visitor on Supabase's raw JSON error page with no way
    // back, which is a worse failure than the one this replaced.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/home`, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      toast.error(error?.message ?? "Could not start Google sign-in.");
      return;
    }

    // One pre-flight request. A working provider answers 302 to Google, which
    // `redirect: "manual"` surfaces as an opaqueredirect we deliberately treat
    // as success; a disabled one answers 400 with a readable body (the endpoint
    // does send CORS headers, so we can read it).
    try {
      const res = await fetch(data.url, { redirect: "manual" });
      if (res.type !== "opaqueredirect" && res.status >= 400) {
        const body = await res.text().catch(() => "");
        const notEnabled = /provider is not enabled|unsupported provider/i.test(body);
        toast.error(
          notEnabled
            ? "Google sign-in isn't enabled for this project yet — enable the Google provider in Supabase."
            : "Google sign-in is misconfigured. Check the Supabase auth settings.",
        );
        return;
      }
    } catch {
      // Network or CORS trouble tells us nothing either way; let the real
      // redirect happen and report whatever it finds rather than blocking a
      // sign-in that might have worked.
    }

    window.location.assign(data.url);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      {/* Priority 9 — sized up to match the sidebar's own increased logo,
          so the brand mark reads at the same scale everywhere it appears. */}
      <Link to="/welcome" className="mb-8 flex items-center gap-2">
        <img
          src={ascendOsWhite}
          alt="AscendOS"
          className="theme-logo-dark h-20 w-auto shrink-0 object-contain"
        />
        <img
          src={ascendOsBlack}
          alt="AscendOS"
          className="theme-logo-light h-20 w-auto shrink-0 object-contain"
        />
      </Link>
      <div className="flex w-full items-center justify-center">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">
              {mode === "signup" ? "Create account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signup"
                ? "Create your account, then request access to a workspace."
                : "Sign in to your command center."}
            </p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#fff"
                d="M21.35 11.1H12v2.93h5.35c-.23 1.26-1.62 3.7-5.35 3.7-3.22 0-5.84-2.67-5.84-5.96 0-3.29 2.62-5.96 5.84-5.96 1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.71 3.27 14.6 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12s4.26 9.5 9.5 9.5c5.49 0 9.13-3.86 9.13-9.29 0-.62-.07-1.1-.18-1.61z"
              />
            </svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-2xs uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "signup" ? "Have an account? Sign in" : "New to AscendOS? Create an account"}
          </button>
          <Link
            to="/request-access"
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Already have an account but no workspace? Request access
          </Link>
          {import.meta.env.DEV && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
              onClick={() => {
                enableDevBypass();
                window.location.href = "/home";
              }}
            >
              Dev Bypass (skip login)
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
