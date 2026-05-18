import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/" }); });
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
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally { setLoading(false); }
  };

  const google = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.66_0.18_258/.18),transparent_60%),radial-gradient(circle_at_80%_80%,oklch(0.62_0.22_295/.15),transparent_55%)]" />
        <div className="relative flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-primary to-accent font-mono text-sm font-bold text-primary-foreground">C4</div>
          <div className="font-semibold">InsightOS</div>
        </div>
        <div className="relative space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">If cash moves, content performs, or a lead breathes —<br/><span className="text-primary">it gets tracked.</span></h2>
          <p className="text-sm text-muted-foreground max-w-md">Your complete business intelligence ecosystem. Content → leads → calls → cash, with full attribution.</p>
          <div className="grid grid-cols-3 gap-3 max-w-md pt-4">
            {[["Cash/1k", "$284"], ["Show", "78%"], ["Close", "31%"]].map(([k,v]) => (
              <div key={k} className="rounded-md border border-border bg-card/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                <div className="font-mono text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">{mode === "signup" ? "Create workspace" : "Welcome back"}</h1>
            <p className="text-sm text-muted-foreground">{mode === "signup" ? "Spin up your command center." : "Sign in to your command center."}</p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1H12v2.93h5.35c-.23 1.26-1.62 3.7-5.35 3.7-3.22 0-5.84-2.67-5.84-5.96 0-3.29 2.62-5.96 5.84-5.96 1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.71 3.27 14.6 2.5 12 2.5 6.76 2.5 2.5 6.76 2.5 12s4.26 9.5 9.5 9.5c5.49 0 9.13-3.86 9.13-9.29 0-.62-.07-1.1-.18-1.61z"/></svg>
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted-foreground">
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
        </form>
      </div>
    </div>
  );
}
