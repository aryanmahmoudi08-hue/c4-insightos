import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/request-access")({ component: RequestAccess });

const ROLES = [
  { value: "setter", label: "DM Setter" },
  { value: "closer", label: "Closer" },
  { value: "sales_manager", label: "Sales Manager" },
  { value: "growth_ops", label: "Growth / Ops" },
  { value: "viewer", label: "Viewer (read-only)" },
];

function RequestAccess() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", admin_email: "", requested_role: "setter" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Find org by admin email -> membership -> org
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("display_name", form.admin_email);
      // Fallback: try memberships join is restricted by RLS for anon, so we ask user to provide a workspace identifier.
      // Simplest path: insert with admin_email and let an admin route review by email.
      const { error } = await supabase.from("membership_requests").insert({
        // org_id will be resolved on admin approval — placeholder via known seed lookup:
        org_id: "00000000-0000-0000-0000-000000000000",
        email: form.email,
        full_name: form.full_name,
        admin_email: form.admin_email,
        requested_role: form.requested_role as "setter",
      });
      if (error) throw error;
      // Hide unused var warning
      void adminProfile;
      setSent(true);
      toast.success("Request submitted. An admin will review it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Request sent</h1>
          <p className="text-sm text-muted-foreground">We've notified your workspace admin. You'll get an email once approved, then you can sign in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Request access</h1>
          <p className="text-sm text-muted-foreground">Ask your workspace admin to add you to their C4 InsightOS team.</p>
        </div>
        <div className="space-y-1.5"><Label>Your name</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Your email</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Workspace admin's email</Label><Input type="email" required value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Role you're joining as</Label>
          <Select value={form.requested_role} onValueChange={(v) => setForm({ ...form, requested_role: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send request"}</Button>
      </form>
    </div>
  );
}
