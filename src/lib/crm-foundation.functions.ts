import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const contactInput = z.object({
  display_name: z.string().trim().min(1).max(180),
  first_name: z.string().trim().max(100).optional().nullable(),
  last_name: z.string().trim().max(100).optional().nullable(),
  primary_email: z.string().trim().email().max(254).optional().nullable(),
  primary_phone: z.string().trim().max(50).optional().nullable(),
  social_handle: z.string().trim().max(120).optional().nullable(),
  lifecycle_status: z.string().trim().min(1).max(80).optional(),
  source: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  legacy_lead_id: z.string().uuid().optional().nullable(),
});

const companyInput = z.object({
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().max(255).optional().nullable(),
  website: z.string().trim().url().max(1000).optional().nullable(),
  industry: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
});

const pipelineInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  is_default: z.boolean().optional(),
  stages: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    probability: z.number().min(0).max(100).optional(),
    color: z.string().trim().max(32).optional().nullable(),
    is_closed_won: z.boolean().optional(),
    is_closed_lost: z.boolean().optional(),
  })).min(1).max(30),
});

/** Read-only CRM landing data. Organization context is always resolved server-side. */
export const getCrmFoundationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCrmFoundationOverviewForUser } = await import("./crm-foundation.server");
    return getCrmFoundationOverviewForUser((context as { userId: string }).userId);
  });

/** Creates a native CRM contact, optionally linked to an existing lead. */
export const createCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmContactForUser } = await import("./crm-foundation.server");
    return createCrmContactForUser((context as { userId: string }).userId, data);
  });

/** Creates an independent CRM company/account. */
export const createCrmCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => companyInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmCompanyForUser } = await import("./crm-foundation.server");
    return createCrmCompanyForUser((context as { userId: string }).userId, data);
  });

/** Creates a configurable pipeline and its first set of stages. */
export const createCrmPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pipelineInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmPipelineForUser } = await import("./crm-foundation.server");
    return createCrmPipelineForUser((context as { userId: string }).userId, data);
  });

const opportunityInput = z.object({
  name: z.string().trim().min(1).max(220),
  pipeline_id: z.string().uuid(),
  pipeline_stage_id: z.string().uuid(),
  contact_id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
  amount_cents: z.number().int().min(0).max(1_000_000_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
  probability: z.number().min(0).max(100).optional().nullable(),
  expected_close_date: z.string().date().optional().nullable(),
  source: z.string().trim().max(160).optional().nullable(),
});

const taskInput = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(5000).optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
  opportunity_id: z.string().uuid().optional().nullable(),
  due_at: z.string().datetime().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

/** Creates a standalone opportunity in a configured pipeline stage. */
export const createCrmOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => opportunityInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmOpportunityForUser } = await import("./crm-foundation.server");
    return createCrmOpportunityForUser((context as { userId: string }).userId, data);
  });

/** Creates an assigned next-step task linked to the relevant CRM record. */
export const createCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => taskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmTaskForUser } = await import("./crm-foundation.server");
    return createCrmTaskForUser((context as { userId: string }).userId, data);
  });

/** Reads one CRM contact or preserved legacy lead with its connected sales context. */
export const getCrmContactRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { getCrmContactRecordForUser } = await import("./crm-foundation.server");
    return getCrmContactRecordForUser((context as { userId: string }).userId, data.id);
  });

/** Reads provider-neutral and preserved legacy communication threads for the Sales CRM inbox. */
export const getCrmInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCrmInboxForUser } = await import("./crm-foundation.server");
    return getCrmInboxForUser((context as { userId: string }).userId);
  });

const bulkContactUpdateInput = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
  lifecycle_status: z.string().trim().min(1).max(80),
});

const savedViewInput = z.object({
  entity_type: z.enum(["contact", "company", "opportunity", "task", "thread", "call"]),
  name: z.string().trim().min(1).max(160),
  visibility: z.enum(["private", "shared"]).default("private"),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string().max(80)).max(30).optional(),
  sort: z.array(z.object({ field: z.string().max(80), direction: z.enum(["asc", "desc"]) })).max(5).optional(),
});

/** Applies one lifecycle state to a manager-selected set of native CRM contacts and records the action in the audit log. */
export const bulkUpdateCrmContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => bulkContactUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { bulkUpdateCrmContactsForUser } = await import("./crm-foundation.server");
    return bulkUpdateCrmContactsForUser((context as { userId: string }).userId, data);
  });

/** Persists a CRM list configuration so personal and shared operating views are not browser-only state. */
export const createCrmSavedView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => savedViewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmSavedViewForUser } = await import("./crm-foundation.server");
    return createCrmSavedViewForUser((context as { userId: string }).userId, data);
  });
