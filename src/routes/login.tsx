import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { enableDevBypass } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import c4Logo from "@/assets/c4-logo.png";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/dashboard" }); });
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { org_name: orgName || "My Workspace" } },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to C4.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      nav({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally { setLoading(false); }
  };

  const google = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Link to="/welcome" className="mb-8 flex items-center gap-2">
        <img src={c4Logo} alt="" className="theme-logo h-7 w-7 shrink-0 object-contain" />
        <span className="display-serif text-lg">C4 OS</span>
      </Link>
      <div className="flex w-full items-center justify-center">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create workspace" : "Welcome back"}</h1>
            <p className="text-sm text-muted-foreground">{mode === "signup" ? "Spin up your command center." : "Sign in to your command center."}</p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1H12v2.93h5.35c-.23 1.26-1.62 3.7-5.35 3.7-3.22 0-5.84-2.67-5.84-5.96 0-3.29 2.62-5.96 5.84-5.96 1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.71 3.27 14.6 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12s4.26 9.5 9.5 9.5c5.49 0 9.13-3.86 9.13-9.29 0-.62-.07-1.1-.18-1.61z"/></svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-2xs uppercase tracking-widest text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="org">Workspace name</Label>
              <Input id="org" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Coaching" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "…" : mode === "signup" ? "Create workspace" : "Sign in"}
          </Button>
          <button type="button" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
            {mode === "signup" ? "Have an account? Sign in" : "New to C4? Create a workspace"}
          </button>
          {import.meta.env.DEV && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-dashed border-amber-500/50 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
              onClick={() => { enableDevBypass(); window.location.href = "/dashboard"; }}
            >
              Dev Bypass (skip login)
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
