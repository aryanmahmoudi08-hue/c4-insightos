import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Integration tests require ${name} in .env.test`);
  return v;
}

/** Service-role client — bypasses RLS. Only ever used for seeding/teardown,
 * never for the actual function calls under test (those must go through an
 * RLS-scoped client, same as production's context.supabase). */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv("TEST_SUPABASE_URL"), requireEnv("TEST_SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestWorkspace = {
  orgId: string;
  userId: string;
  email: string;
  /** RLS-scoped client — mirrors auth-middleware.ts's real construction: a
   * genuine per-user JWT (from a real sign-in, decoding to role="authenticated"
   * with a real auth.uid()) set as both the client key and the Authorization
   * header, so `is_org_member(auth.uid(), org_id)` policies evaluate exactly
   * as they do for a real authenticated request. */
  userClient: SupabaseClient;
};

export async function createTestWorkspace(admin: SupabaseClient, label: string): Promise<TestWorkspace> {
  const url = requireEnv("TEST_SUPABASE_URL");
  const slug = `it-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${slug}@example.test`;
  const password = `Test-${Math.random().toString(36).slice(2, 12)}!`;

  const { data: org, error: orgErr } = await admin.from("organizations").insert({ name: `Integration Test — ${label}`, slug }).select("id").single();
  if (orgErr || !org) throw new Error(`seed org failed: ${orgErr?.message}`);

  const { data: created, error: userErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userErr || !created?.user) throw new Error(`seed user failed: ${userErr?.message}`);
  const userId = created.user.id;

  const { error: memErr } = await admin.from("memberships").insert({ org_id: org.id, user_id: userId, role: "admin" });
  if (memErr) throw new Error(`seed membership failed: ${memErr.message}`);

  const publishableKey = requireEnv("TEST_SUPABASE_PUBLISHABLE_KEY");
  const signInClient = createClient(url, publishableKey, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await signInClient.auth.signInWithPassword({ email, password });
  if (signInErr || !session.session) throw new Error(`sign-in failed: ${signInErr?.message}`);
  const accessToken = session.session.access_token;

  // Byte-for-byte the same shape as auth-middleware.ts's real construction:
  // the project's own anon/publishable key as `apikey` (PostgREST rejects a
  // user session JWT there outright — "Invalid API key", confirmed the hard
  // way) plus the real per-user JWT as Authorization. Two different values,
  // not one — this is what actually makes RLS (auth.uid()-based) apply.
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { orgId: org.id, userId, email, userClient };
}

export async function teardownTestWorkspace(admin: SupabaseClient, ws: { orgId: string; userId: string }) {
  await admin.from("organizations").delete().eq("id", ws.orgId); // cascades: memberships, content_pieces, content_metrics, faq_videos, setter_call_signals, onboarding_responses
  await admin.auth.admin.deleteUser(ws.userId);
}

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400e3).toISOString();
}
