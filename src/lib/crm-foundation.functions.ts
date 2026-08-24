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

const contactUpdateInput = contactInput.omit({ legacy_lead_id: true }).extend({ id: z.string().uuid() });
const crmNoteInput = z.object({
  contact_id: z.string().uuid().optional().nullable(),
  legacy_lead_id: z.string().uuid().optional().nullable(),
  body: z.string().trim().min(1).max(10_000),
}).refine((data) => Boolean(data.contact_id || data.legacy_lead_id), { message: "A CRM or preserved legacy record is required" });
const companyContactInput = z.object({
  contact_id: z.string().uuid(),
  company_id: z.string().uuid(),
  title: z.string().trim().max(160).optional().nullable(),
  is_primary: z.boolean().optional(),
});

/** Updates a native CRM contact. Preserved legacy lead rows are never updated through this endpoint. */
export const updateCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => contactUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { updateCrmContactForUser } = await import("./crm-foundation.server");
    return updateCrmContactForUser((context as { userId: string }).userId, data);
  });

/** Adds a native CRM note to a contact or preserved legacy-lead context without modifying historical notes. */
export const createCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => crmNoteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmNoteForUser } = await import("./crm-foundation.server");
    return createCrmNoteForUser((context as { userId: string }).userId, data);
  });

/** Associates an existing native CRM contact with an existing native CRM company. */
export const linkCrmContactToCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => companyContactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { linkCrmContactToCompanyForUser } = await import("./crm-foundation.server");
    return linkCrmContactToCompanyForUser((context as { userId: string }).userId, data);
  });

const taskStatusInput = z.object({ id: z.string().uuid(), status: z.enum(["open", "in_progress", "completed", "cancelled"]) });
const opportunityStageInput = z.object({ id: z.string().uuid(), pipeline_stage_id: z.string().uuid(), lost_reason: z.string().trim().max(500).optional().nullable() });

/** Changes a CRM task state and records a task activity. */
export const updateCrmTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => taskStatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { updateCrmTaskStatusForUser } = await import("./crm-foundation.server");
    return updateCrmTaskStatusForUser((context as { userId: string }).userId, data);
  });

/** Moves an opportunity through a configured stage and derives its open/won/lost state from that stage. */
export const moveCrmOpportunityStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => opportunityStageInput.parse(d))
  .handler(async ({ data, context }) => {
    const { moveCrmOpportunityStageForUser } = await import("./crm-foundation.server");
    return moveCrmOpportunityStageForUser((context as { userId: string }).userId, data);
  });

const crmSearchInput = z.object({ query: z.string().trim().min(1).max(120) });
const automationRuleInput = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  entity_type: z.enum(["contact", "company", "opportunity", "task", "thread", "call"]),
  trigger_type: z.enum(["record_created", "record_updated", "stage_changed", "task_due", "message_received", "call_completed", "time_elapsed"]),
  conditions: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
});

/** Returns data-derived CRM performance totals and pipeline-stage rollups for the reporting workspace. */
export const getCrmReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCrmReportForUser } = await import("./crm-foundation.server");
    return getCrmReportForUser((context as { userId: string }).userId);
  });

/** Returns private views owned by the user together with shared CRM views for the active organization. */
export const getCrmSavedViews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ entity_type: z.enum(["contact", "company", "opportunity", "task", "thread", "call"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getCrmSavedViewsForUser } = await import("./crm-foundation.server");
    return getCrmSavedViewsForUser((context as { userId: string }).userId, data.entity_type);
  });

/** Searches native and preserved CRM records within the resolved workspace. */
export const searchCrmRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => crmSearchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { searchCrmRecordsForUser } = await import("./crm-foundation.server");
    return searchCrmRecordsForUser((context as { userId: string }).userId, data.query);
  });

/** Stores an inactive, manager-governed automation rule; execution remains separately gated. */
export const createCrmAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => automationRuleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { createCrmAutomationRuleForUser } = await import("./crm-foundation.server");
    return createCrmAutomationRuleForUser((context as { userId: string }).userId, data);
  });

/** Reads organization-scoped automation definitions and recent run outcomes for safe operations review. */
export const getCrmAutomationRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCrmAutomationRulesForUser } = await import("./crm-foundation.server");
    return getCrmAutomationRulesForUser((context as { userId: string }).userId);
  });


const recordIdInput = z.object({ id: z.string().uuid() });
const pipelineStageUpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  probability: z.number().min(0).max(100),
  color: z.string().trim().max(32).optional().nullable(),
  is_closed_won: z.boolean(),
  is_closed_lost: z.boolean(),
}).refine((data) => !(data.is_closed_won && data.is_closed_lost), { message: "A stage cannot be both won and lost" });

/** Reads a native opportunity with its related contact, company, tasks, stage context, and normalized activity. */
export const getCrmOpportunityRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getCrmOpportunityRecordForUser } = await import("./crm-foundation.server");
    return getCrmOpportunityRecordForUser((context as { userId: string }).userId, data.id);
  });

/** Reads a native company with linked contacts, opportunities, tasks, and normalized activity. */
export const getCrmCompanyRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => recordIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { getCrmCompanyRecordForUser } = await import("./crm-foundation.server");
    return getCrmCompanyRecordForUser((context as { userId: string }).userId, data.id);
  });

/** Updates configured stage presentation and terminal semantics without deleting referenced pipeline data. */
export const updateCrmPipelineStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pipelineStageUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { updateCrmPipelineStageForUser } = await import("./crm-foundation.server");
    return updateCrmPipelineStageForUser((context as { userId: string }).userId, data);
  });
