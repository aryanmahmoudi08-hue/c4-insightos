import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureWorkspaceForUser } from "./workspace.server";

type ContactInput = {
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  social_handle?: string | null;
  lifecycle_status?: string;
  source?: string | null;
  description?: string | null;
  legacy_lead_id?: string | null;
};

type CompanyInput = {
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  description?: string | null;
};

type PipelineInput = {
  name: string;
  description?: string | null;
  is_default?: boolean;
  stages: Array<{
    name: string;
    probability?: number;
    color?: string | null;
    is_closed_won?: boolean;
    is_closed_lost?: boolean;
  }>;
};

type CrmWorkspace = { orgId: string; role: string; userId: string };
const MANAGER_ROLES = new Set(["owner", "admin", "sales_manager"]);

async function crmWorkspaceForUser(userId: string): Promise<CrmWorkspace> {
  const workspace = await ensureWorkspaceForUser(userId);
  return { orgId: workspace.org_id, role: workspace.role, userId };
}

function requireManager(workspace: CrmWorkspace) {
  if (!MANAGER_ROLES.has(workspace.role)) {
    throw new Error("Sales CRM management permission is required for this action");
  }
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function logCrmActivity(input: {
  orgId: string;
  actorUserId: string;
  type: string;
  title: string;
  sourceId: string;
  targets: Array<{ entity_type: "contact" | "company" | "opportunity" | "task"; entity_id: string }>;
  body?: string | null;
}) {
  const db = supabaseAdmin as any;
  const { data: activity, error } = await db
    .from("crm_activities")
    .insert({
      org_id: input.orgId,
      actor_user_id: input.actorUserId,
      activity_type: input.type,
      source_type: "crm",
      source_id: input.sourceId,
      title: input.title,
      body: input.body ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (!input.targets.length) return activity;

  const { error: targetError } = await db.from("crm_activity_targets").insert(
    input.targets.map((target) => ({
      org_id: input.orgId,
      activity_id: activity.id,
      entity_type: target.entity_type,
      entity_id: target.entity_id,
    })),
  );
  if (targetError) throw new Error(targetError.message);
  return activity;
}

export async function getCrmFoundationOverviewForUser(userId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const [contacts, companies, opportunities, pipelines, tasks, activities, legacyLeadCount] = await Promise.all([
    db.from("crm_contact_legacy_adapter_v")
      .select("id, record_source, legacy_lead_id, display_name, primary_email, primary_phone, lifecycle_status, owner_user_id, created_at")
      .eq("org_id", workspace.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("crm_companies")
      .select("id, name, domain, owner_user_id, created_at")
      .eq("org_id", workspace.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("crm_opportunities")
      .select("id, name, amount_cents, currency, status, expected_close_date, owner_user_id, pipeline_id, pipeline_stage_id, created_at")
      .eq("org_id", workspace.orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("crm_pipelines")
      .select("id, name, description, is_default, is_archived, created_at, crm_pipeline_stages(id, name, position, probability, color, is_closed_won, is_closed_lost, is_archived)")
      .eq("org_id", workspace.orgId)
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    db.from("crm_tasks")
      .select("id, title, description, due_at, priority, status, completed_at, assignee_user_id, contact_id, company_id, opportunity_id, created_at")
      .eq("org_id", workspace.orgId)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200),
    db.from("crm_activities")
      .select("id, activity_type, source_type, source_id, title, body, occurred_at, actor_user_id, payload")
      .eq("org_id", workspace.orgId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    db.from("leads").select("id", { count: "exact", head: true }).eq("org_id", workspace.orgId),
  ]);

  for (const result of [contacts, companies, opportunities, pipelines, tasks, activities, legacyLeadCount]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    workspace: { org_id: workspace.orgId, role: workspace.role },
    contacts: contacts.data ?? [],
    companies: companies.data ?? [],
    opportunities: opportunities.data ?? [],
    pipelines: pipelines.data ?? [],
    tasks: tasks.data ?? [],
    activities: activities.data ?? [],
    counts: {
      contacts: contacts.data?.length ?? 0,
      companies: companies.data?.length ?? 0,
      opportunities: opportunities.data?.length ?? 0,
      open_tasks: (tasks.data ?? []).filter((task: { status: string }) => ["open", "in_progress"].includes(task.status)).length,
      legacy_leads: legacyLeadCount.count ?? 0,
    },
  };
}

export async function createCrmContactForUser(userId: string, input: ContactInput) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;

  if (input.legacy_lead_id) {
    const { data: legacyLead, error: leadError } = await db
      .from("leads")
      .select("id, org_id")
      .eq("id", input.legacy_lead_id)
      .eq("org_id", workspace.orgId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!legacyLead) throw new Error("The selected legacy lead is not available in this workspace");
  }

  const { data: contact, error } = await db
    .from("crm_contacts")
    .insert({
      org_id: workspace.orgId,
      legacy_lead_id: input.legacy_lead_id ?? null,
      owner_user_id: userId,
      display_name: input.display_name.trim(),
      first_name: cleanOptional(input.first_name),
      last_name: cleanOptional(input.last_name),
      primary_email: cleanOptional(input.primary_email)?.toLowerCase() ?? null,
      primary_phone: cleanOptional(input.primary_phone),
      social_handle: cleanOptional(input.social_handle),
      lifecycle_status: input.lifecycle_status?.trim() || "new",
      source: cleanOptional(input.source),
      description: cleanOptional(input.description),
    })
    .select("id, display_name, legacy_lead_id, created_at")
    .single();
  if (error) throw new Error(error.message);

  const targets: Array<{ entity_type: "contact"; entity_id: string }> = [{ entity_type: "contact", entity_id: contact.id }];
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "contact_created",
    title: `Contact created: ${contact.display_name}`,
    sourceId: contact.id,
    targets,
  });

  if (contact.legacy_lead_id) {
    const { error: linkError } = await db.from("crm_legacy_links").insert({
      org_id: workspace.orgId,
      crm_entity_type: "contact",
      crm_entity_id: contact.id,
      legacy_entity_type: "lead",
      legacy_entity_id: contact.legacy_lead_id,
      relationship_type: "source",
    });
    if (linkError) throw new Error(linkError.message);
  }

  return contact;
}

export async function createCrmCompanyForUser(userId: string, input: CompanyInput) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data: company, error } = await db
    .from("crm_companies")
    .insert({
      org_id: workspace.orgId,
      owner_user_id: userId,
      name: input.name.trim(),
      domain: cleanOptional(input.domain)?.toLowerCase() ?? null,
      website: cleanOptional(input.website),
      industry: cleanOptional(input.industry),
      description: cleanOptional(input.description),
    })
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);

  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "company_created",
    title: `Company created: ${company.name}`,
    sourceId: company.id,
    targets: [{ entity_type: "company", entity_id: company.id }],
  });
  return company;
}

export async function createCrmPipelineForUser(userId: string, input: PipelineInput) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;

  if (input.is_default) {
    const { error: resetError } = await db
      .from("crm_pipelines")
      .update({ is_default: false })
      .eq("org_id", workspace.orgId)
      .eq("is_default", true);
    if (resetError) throw new Error(resetError.message);
  }

  const { data: pipeline, error } = await db
    .from("crm_pipelines")
    .insert({
      org_id: workspace.orgId,
      name: input.name.trim(),
      description: cleanOptional(input.description),
      is_default: input.is_default ?? false,
      created_by: userId,
    })
    .select("id, name, created_at")
    .single();
  if (error) throw new Error(error.message);

  const stageRows = input.stages.map((stage, position) => ({
    org_id: workspace.orgId,
    pipeline_id: pipeline.id,
    name: stage.name.trim(),
    position,
    probability: stage.probability ?? 0,
    color: cleanOptional(stage.color),
    is_closed_won: stage.is_closed_won ?? false,
    is_closed_lost: stage.is_closed_lost ?? false,
  }));
  const { error: stageError } = await db.from("crm_pipeline_stages").insert(stageRows);
  if (stageError) throw new Error(stageError.message);

  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "pipeline_created",
    title: `Pipeline created: ${pipeline.name}`,
    sourceId: pipeline.id,
    targets: [],
  });
  return pipeline;
}

export async function createCrmOpportunityForUser(userId: string, input: {
  name: string;
  pipeline_id: string;
  pipeline_stage_id: string;
  contact_id?: string | null;
  company_id?: string | null;
  amount_cents?: number;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
}) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;

  const { data: stage, error: stageError } = await db
    .from("crm_pipeline_stages")
    .select("id, pipeline_id, probability, is_closed_won, is_closed_lost")
    .eq("id", input.pipeline_stage_id)
    .eq("pipeline_id", input.pipeline_id)
    .eq("org_id", workspace.orgId)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage) throw new Error("Choose a pipeline stage that belongs to this workspace and pipeline");

  for (const [table, id] of [["crm_contacts", input.contact_id], ["crm_companies", input.company_id]] as const) {
    if (!id) continue;
    const { data, error } = await db.from(table).select("id").eq("id", id).eq("org_id", workspace.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("A related CRM record is not available in this workspace");
  }

  const status = stage.is_closed_won ? "won" : stage.is_closed_lost ? "lost" : "open";
  const now = new Date().toISOString();
  const { data: opportunity, error } = await db
    .from("crm_opportunities")
    .insert({
      org_id: workspace.orgId,
      contact_id: input.contact_id ?? null,
      company_id: input.company_id ?? null,
      owner_user_id: userId,
      pipeline_id: input.pipeline_id,
      pipeline_stage_id: input.pipeline_stage_id,
      name: input.name.trim(),
      amount_cents: input.amount_cents ?? 0,
      currency: (input.currency ?? "USD").trim().toUpperCase(),
      probability: input.probability ?? stage.probability,
      expected_close_date: input.expected_close_date ?? null,
      source: cleanOptional(input.source),
      status,
      won_at: status === "won" ? now : null,
      lost_at: status === "lost" ? now : null,
    })
    .select("id, name, status, amount_cents, pipeline_id, pipeline_stage_id, contact_id, company_id, created_at")
    .single();
  if (error) throw new Error(error.message);

  const targets: Array<{ entity_type: "opportunity" | "contact" | "company"; entity_id: string }> = [
    { entity_type: "opportunity", entity_id: opportunity.id },
  ];
  if (opportunity.contact_id) targets.push({ entity_type: "contact", entity_id: opportunity.contact_id });
  if (opportunity.company_id) targets.push({ entity_type: "company", entity_id: opportunity.company_id });
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "opportunity_created",
    title: `Opportunity created: ${opportunity.name}`,
    sourceId: opportunity.id,
    targets,
  });
  return opportunity;
}

export async function createCrmTaskForUser(userId: string, input: {
  title: string;
  description?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  opportunity_id?: string | null;
  due_at?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
}) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;

  for (const [table, id] of [["crm_contacts", input.contact_id], ["crm_companies", input.company_id], ["crm_opportunities", input.opportunity_id]] as const) {
    if (!id) continue;
    const { data, error } = await db.from(table).select("id").eq("id", id).eq("org_id", workspace.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("A related CRM record is not available in this workspace");
  }

  const { data: task, error } = await db
    .from("crm_tasks")
    .insert({
      org_id: workspace.orgId,
      assignee_user_id: userId,
      created_by: userId,
      contact_id: input.contact_id ?? null,
      company_id: input.company_id ?? null,
      opportunity_id: input.opportunity_id ?? null,
      title: input.title.trim(),
      description: cleanOptional(input.description),
      due_at: input.due_at ?? null,
      priority: input.priority ?? "normal",
    })
    .select("id, title, due_at, priority, status, contact_id, company_id, opportunity_id, created_at")
    .single();
  if (error) throw new Error(error.message);

  const targets: Array<{ entity_type: "task" | "contact" | "company" | "opportunity"; entity_id: string }> = [{ entity_type: "task", entity_id: task.id }];
  if (task.contact_id) targets.push({ entity_type: "contact", entity_id: task.contact_id });
  if (task.company_id) targets.push({ entity_type: "company", entity_id: task.company_id });
  if (task.opportunity_id) targets.push({ entity_type: "opportunity", entity_id: task.opportunity_id });
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "task_created",
    title: `Task created: ${task.title}`,
    sourceId: task.id,
    targets,
  });
  return task;
}

export async function getCrmContactRecordForUser(userId: string, contactOrLegacyId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const { data: contact, error: contactError } = await db
    .from("crm_contact_legacy_adapter_v")
    .select("id, record_source, legacy_lead_id, display_name, first_name, last_name, primary_email, primary_phone, social_handle, owner_user_id, lifecycle_status, source, created_at, updated_at")
    .eq("org_id", workspace.orgId)
    .eq("id", contactOrLegacyId)
    .maybeSingle();
  if (contactError) throw new Error(contactError.message);
  if (!contact) throw new Error("Contact not found in this workspace");

  const legacyLeadId = contact.legacy_lead_id as string | null;
  const [nativeContact, opportunities, tasks, activities, legacyLead, legacyNotes, legacyEvents, legacyCalls, conversations, companies, nativeNotes, availableCompanies] = await Promise.all([
    contact.record_source === "crm_contact"
      ? db.from("crm_contacts").select("id, description, legacy_lead_id").eq("id", contact.id).eq("org_id", workspace.orgId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from("crm_opportunities")
      .select("id, name, amount_cents, currency, status, probability, expected_close_date, pipeline_id, pipeline_stage_id, created_at")
      .eq("org_id", workspace.orgId)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false }),
    db.from("crm_tasks")
      .select("id, title, description, due_at, priority, status, completed_at, created_at")
      .eq("org_id", workspace.orgId)
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false }),
    db.from("crm_activities")
      .select("id, activity_type, title, body, occurred_at, source_type, source_id, payload")
      .eq("org_id", workspace.orgId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    legacyLeadId
      ? db.from("leads").select("id, qualification_notes, application_data, notes, priority, pipeline_stage, precall_video_watched, intent_score, engagement_score, estimated_close_probability, beliefs, objections_raised").eq("id", legacyLeadId).eq("org_id", workspace.orgId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    legacyLeadId
      ? db.from("lead_notes").select("id, body, kind, created_at, author_id").eq("lead_id", legacyLeadId).eq("org_id", workspace.orgId).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    legacyLeadId
      ? db.from("lead_events").select("id, event_type, occurred_at, payload, created_at").eq("lead_id", legacyLeadId).eq("org_id", workspace.orgId).order("occurred_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    legacyLeadId
      ? db.from("calls").select("id, status, scheduled_for, showed, closed, cash_collected_cents, contract_value_cents, recording_url, call_summary, key_moment, created_at").eq("lead_id", legacyLeadId).eq("org_id", workspace.orgId).order("scheduled_for", { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    legacyLeadId
      ? db.from("conversations").select("id, channel, status, last_message_at, first_response_seconds, created_at, messages(id, direction, body, sent_at)").eq("lead_id", legacyLeadId).eq("org_id", workspace.orgId).order("last_message_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    contact.record_source === "crm_contact"
      ? db.from("crm_company_contacts").select("id, title, is_primary, crm_companies(id, name, domain, industry, website)").eq("org_id", workspace.orgId).eq("contact_id", contact.id).order("is_primary", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    db.from("crm_notes").select("id, body, created_at, author_user_id, contact_id, legacy_lead_id").eq("org_id", workspace.orgId).or(`contact_id.eq.${contact.record_source === "crm_contact" ? contact.id : "00000000-0000-0000-0000-000000000000"}${legacyLeadId ? `,legacy_lead_id.eq.${legacyLeadId}` : ""}`).order("created_at", { ascending: false }).limit(100),
    contact.record_source === "crm_contact"
      ? db.from("crm_companies").select("id, name, domain, industry").eq("org_id", workspace.orgId).order("name", { ascending: true }).limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [nativeContact, opportunities, tasks, activities, legacyLead, legacyNotes, legacyEvents, legacyCalls, conversations, companies, nativeNotes, availableCompanies]) {
    if (result.error) throw new Error(result.error.message);
  }

  const activityTargets = await db
    .from("crm_activity_targets")
    .select("activity_id, entity_type, entity_id")
    .eq("org_id", workspace.orgId)
    .or(`and(entity_type.eq.contact,entity_id.eq.${contact.id})${legacyLeadId ? `,and(entity_type.eq.legacy_lead,entity_id.eq.${legacyLeadId})` : ""}`);
  if (activityTargets.error) throw new Error(activityTargets.error.message);
  const activityIds = new Set((activityTargets.data ?? []).map((target: { activity_id: string }) => target.activity_id));

  return {
    contact,
    native_contact: nativeContact.data,
    opportunities: opportunities.data ?? [],
    tasks: tasks.data ?? [],
    companies: companies.data ?? [],
    available_companies: availableCompanies.data ?? [],
    native_notes: nativeNotes.data ?? [],
    crm_activities: (activities.data ?? []).filter((activity: { id: string }) => activityIds.has(activity.id)),
    legacy: legacyLeadId ? {
      lead: legacyLead.data,
      notes: legacyNotes.data ?? [],
      events: legacyEvents.data ?? [],
      calls: legacyCalls.data ?? [],
      conversations: conversations.data ?? [],
    } : null,
  };
}

export async function getCrmInboxForUser(userId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const { data: threads, error } = await db
    .from("crm_communication_legacy_adapter_v")
    .select("id, record_source, channel, contact_id, legacy_lead_id, subject, status, unread_count, last_message_at, created_at")
    .eq("org_id", workspace.orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const legacyIds = (threads ?? []).filter((thread: { record_source: string; legacy_lead_id: string | null }) => thread.record_source === "legacy_conversation" && thread.legacy_lead_id).map((thread: { legacy_lead_id: string }) => thread.legacy_lead_id);
  const threadIds = (threads ?? []).filter((thread: { record_source: string }) => thread.record_source === "crm_thread").map((thread: { id: string }) => thread.id);
  const [legacyLeads, legacyMessages, crmMessages] = await Promise.all([
    legacyIds.length ? db.from("leads").select("id, full_name, email, phone, handle").eq("org_id", workspace.orgId).in("id", legacyIds) : Promise.resolve({ data: [], error: null }),
    (threads ?? []).some((thread: { record_source: string }) => thread.record_source === "legacy_conversation")
      ? db.from("messages").select("id, conversation_id, direction, body, sent_at").eq("org_id", workspace.orgId).order("sent_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
    threadIds.length ? db.from("crm_communication_messages").select("id, thread_id, direction, body_text, subject, status, sent_at, received_at, created_at").eq("org_id", workspace.orgId).in("thread_id", threadIds).order("created_at", { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [legacyLeads, legacyMessages, crmMessages]) if (result.error) throw new Error(result.error.message);

  const leadById = new Map((legacyLeads.data ?? []).map((lead: { id: string }) => [lead.id, lead]));
  const latestLegacyMessage = new Map<string, { id: string; direction: string; body: string | null; sent_at: string }>();
  for (const message of legacyMessages.data ?? []) {
    if (!latestLegacyMessage.has(message.conversation_id)) latestLegacyMessage.set(message.conversation_id, message);
  }
  const latestCrmMessage = new Map<string, { id: string; direction: string; body_text: string | null; subject: string | null; status: string; sent_at: string | null; received_at: string | null; created_at: string }>();
  for (const message of crmMessages.data ?? []) {
    if (!latestCrmMessage.has(message.thread_id)) latestCrmMessage.set(message.thread_id, message);
  }

  return (threads ?? []).map((thread: any) => {
    const lead = thread.legacy_lead_id ? leadById.get(thread.legacy_lead_id) : null;
    const latest = thread.record_source === "legacy_conversation" ? latestLegacyMessage.get(thread.id) : latestCrmMessage.get(thread.id);
    return {
      ...thread,
      display_name: lead?.full_name ?? lead?.handle ?? lead?.email ?? "Unidentified contact",
      latest_message: latest
        ? { direction: latest.direction, body: "body" in latest ? latest.body : latest.body_text, timestamp: "sent_at" in latest ? latest.sent_at : latest.received_at ?? latest.sent_at ?? latest.created_at, status: "status" in latest ? latest.status : null }
        : null,
    };
  });
}

export async function bulkUpdateCrmContactsForUser(userId: string, input: { contact_ids: string[]; lifecycle_status: string }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const ids = [...new Set(input.contact_ids)];
  const { data: contacts, error: lookupError } = await db
    .from("crm_contacts")
    .select("id, display_name")
    .eq("org_id", workspace.orgId)
    .in("id", ids);
  if (lookupError) throw new Error(lookupError.message);
  if ((contacts ?? []).length !== ids.length) throw new Error("One or more selected contacts are not native CRM contacts in this workspace");

  const { data: operation, error: operationError } = await db
    .from("crm_bulk_operations")
    .insert({
      org_id: workspace.orgId,
      initiated_by: userId,
      entity_type: "contact",
      operation_type: "update",
      selection_count: ids.length,
      selection_snapshot: contacts.map((contact: { id: string; display_name: string }) => ({ id: contact.id, display_name: contact.display_name })),
      input: { lifecycle_status: input.lifecycle_status },
      status: "running",
    })
    .select("id")
    .single();
  if (operationError) throw new Error(operationError.message);

  const { error: updateError } = await db
    .from("crm_contacts")
    .update({ lifecycle_status: input.lifecycle_status })
    .eq("org_id", workspace.orgId)
    .in("id", ids);
  if (updateError) {
    await db.from("crm_bulk_operations").update({ status: "failed", error_message: updateError.message, completed_at: new Date().toISOString() }).eq("id", operation.id);
    throw new Error(updateError.message);
  }

  const activityRows = contacts.map((contact: { id: string; display_name: string }) => ({
    org_id: workspace.orgId,
    actor_user_id: userId,
    activity_type: "contact_lifecycle_updated",
    source_type: "crm_bulk_operation",
    source_id: operation.id,
    title: `Lifecycle updated to ${input.lifecycle_status}: ${contact.display_name}`,
  }));
  const { data: activities, error: activityError } = await db.from("crm_activities").insert(activityRows).select("id");
  if (activityError) throw new Error(activityError.message);
  const targetRows = (activities ?? []).flatMap((activity: { id: string }, index: number) => [{
    org_id: workspace.orgId,
    activity_id: activity.id,
    entity_type: "contact",
    entity_id: contacts[index].id,
  }]);
  if (targetRows.length) {
    const { error: targetError } = await db.from("crm_activity_targets").insert(targetRows);
    if (targetError) throw new Error(targetError.message);
  }
  const { error: finalizeError } = await db
    .from("crm_bulk_operations")
    .update({ status: "completed", result: { updated: ids.length, lifecycle_status: input.lifecycle_status }, completed_at: new Date().toISOString() })
    .eq("id", operation.id);
  if (finalizeError) throw new Error(finalizeError.message);

  return { operation_id: operation.id, updated: ids.length };
}

export async function createCrmSavedViewForUser(userId: string, input: {
  entity_type: "contact" | "company" | "opportunity" | "task" | "thread" | "call";
  name: string;
  visibility: "private" | "shared";
  filters?: Record<string, unknown>;
  columns?: string[];
  sort?: Array<{ field: string; direction: "asc" | "desc" }>;
}) {
  const workspace = await crmWorkspaceForUser(userId);
  if (input.visibility === "shared") requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("crm_saved_views")
    .insert({
      org_id: workspace.orgId,
      owner_user_id: userId,
      entity_type: input.entity_type,
      name: input.name.trim(),
      visibility: input.visibility,
      filters: input.filters ?? {},
      columns: input.columns ?? [],
      sort: input.sort ?? [],
    })
    .select("id, name, entity_type, visibility, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCrmContactForUser(userId: string, input: ContactInput & { id: string }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data: existing, error: existingError } = await db.from("crm_contacts").select("id, display_name").eq("id", input.id).eq("org_id", workspace.orgId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("This is not a native CRM contact in your workspace");

  const { data: contact, error } = await db
    .from("crm_contacts")
    .update({
      display_name: input.display_name.trim(),
      first_name: cleanOptional(input.first_name),
      last_name: cleanOptional(input.last_name),
      primary_email: cleanOptional(input.primary_email)?.toLowerCase() ?? null,
      primary_phone: cleanOptional(input.primary_phone),
      social_handle: cleanOptional(input.social_handle),
      lifecycle_status: input.lifecycle_status?.trim() || "new",
      source: cleanOptional(input.source),
      description: cleanOptional(input.description),
    })
    .eq("id", input.id)
    .eq("org_id", workspace.orgId)
    .select("id, display_name, lifecycle_status, updated_at")
    .single();
  if (error) throw new Error(error.message);

  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "contact_updated",
    title: `Contact updated: ${contact.display_name}`,
    sourceId: contact.id,
    targets: [{ entity_type: "contact", entity_id: contact.id }],
  });
  return contact;
}

export async function createCrmNoteForUser(userId: string, input: { contact_id?: string | null; legacy_lead_id?: string | null; body: string }) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  let targetType: "contact" | "legacy_lead";
  let targetId: string;
  if (input.contact_id) {
    const { data: contact, error } = await db.from("crm_contacts").select("id, display_name").eq("id", input.contact_id).eq("org_id", workspace.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!contact) throw new Error("The CRM contact is not available in this workspace");
    targetType = "contact";
    targetId = contact.id;
  } else {
    const { data: lead, error } = await db.from("leads").select("id, full_name").eq("id", input.legacy_lead_id).eq("org_id", workspace.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("The preserved legacy lead is not available in this workspace");
    targetType = "legacy_lead";
    targetId = lead.id;
  }

  const { data: note, error } = await db
    .from("crm_notes")
    .insert({
      org_id: workspace.orgId,
      author_user_id: userId,
      contact_id: targetType === "contact" ? targetId : null,
      legacy_lead_id: targetType === "legacy_lead" ? targetId : null,
      body: input.body.trim(),
    })
    .select("id, body, created_at")
    .single();
  if (error) throw new Error(error.message);
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "note_added",
    title: "CRM note added",
    body: note.body,
    sourceId: note.id,
    targets: [{ entity_type: targetType, entity_id: targetId }],
  });
  return note;
}

export async function linkCrmContactToCompanyForUser(userId: string, input: { contact_id: string; company_id: string; title?: string | null; is_primary?: boolean }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const [contact, company] = await Promise.all([
    db.from("crm_contacts").select("id, display_name").eq("id", input.contact_id).eq("org_id", workspace.orgId).maybeSingle(),
    db.from("crm_companies").select("id, name").eq("id", input.company_id).eq("org_id", workspace.orgId).maybeSingle(),
  ]);
  if (contact.error) throw new Error(contact.error.message);
  if (company.error) throw new Error(company.error.message);
  if (!contact.data || !company.data) throw new Error("The contact or company is not available in this workspace");
  if (input.is_primary) {
    const { error: resetError } = await db.from("crm_company_contacts").update({ is_primary: false }).eq("org_id", workspace.orgId).eq("contact_id", input.contact_id).eq("is_primary", true);
    if (resetError) throw new Error(resetError.message);
  }
  const { data: link, error } = await db
    .from("crm_company_contacts")
    .upsert({ org_id: workspace.orgId, contact_id: input.contact_id, company_id: input.company_id, title: cleanOptional(input.title), is_primary: input.is_primary ?? false }, { onConflict: "company_id,contact_id" })
    .select("id, company_id, contact_id, title, is_primary")
    .single();
  if (error) throw new Error(error.message);
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "contact_linked_to_company",
    title: `${contact.data.display_name} linked to ${company.data.name}`,
    sourceId: link.id,
    targets: [{ entity_type: "contact", entity_id: input.contact_id }, { entity_type: "company", entity_id: input.company_id }],
  });
  return link;
}

export async function updateCrmTaskStatusForUser(userId: string, input: { id: string; status: "open" | "in_progress" | "completed" | "cancelled" }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data: existing, error: existingError } = await db
    .from("crm_tasks")
    .select("id, title, contact_id, company_id, opportunity_id, status")
    .eq("id", input.id)
    .eq("org_id", workspace.orgId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("The task is not available in this workspace");
  if (existing.status === input.status) return existing;

  const { data: task, error } = await db
    .from("crm_tasks")
    .update({ status: input.status, completed_at: input.status === "completed" ? new Date().toISOString() : null })
    .eq("id", existing.id)
    .eq("org_id", workspace.orgId)
    .select("id, title, status, completed_at, contact_id, company_id, opportunity_id")
    .single();
  if (error) throw new Error(error.message);
  const targets: Array<{ entity_type: "task" | "contact" | "company" | "opportunity"; entity_id: string }> = [{ entity_type: "task", entity_id: task.id }];
  if (task.contact_id) targets.push({ entity_type: "contact", entity_id: task.contact_id });
  if (task.company_id) targets.push({ entity_type: "company", entity_id: task.company_id });
  if (task.opportunity_id) targets.push({ entity_type: "opportunity", entity_id: task.opportunity_id });
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: `task_${input.status}`,
    title: `Task ${input.status.replaceAll("_", " ")}: ${task.title}`,
    sourceId: task.id,
    targets,
  });
  return task;
}

export async function moveCrmOpportunityStageForUser(userId: string, input: { id: string; pipeline_stage_id: string; lost_reason?: string | null }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data: opportunity, error: opportunityError } = await db
    .from("crm_opportunities")
    .select("id, name, pipeline_id, pipeline_stage_id, contact_id, company_id, status")
    .eq("id", input.id)
    .eq("org_id", workspace.orgId)
    .maybeSingle();
  if (opportunityError) throw new Error(opportunityError.message);
  if (!opportunity) throw new Error("The opportunity is not available in this workspace");
  const { data: stage, error: stageError } = await db
    .from("crm_pipeline_stages")
    .select("id, name, probability, is_closed_won, is_closed_lost")
    .eq("id", input.pipeline_stage_id)
    .eq("pipeline_id", opportunity.pipeline_id)
    .eq("org_id", workspace.orgId)
    .eq("is_archived", false)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage) throw new Error("Choose an active stage in the opportunity's pipeline");
  const status = stage.is_closed_won ? "won" : stage.is_closed_lost ? "lost" : "open";
  const now = new Date().toISOString();
  const { data: updated, error } = await db
    .from("crm_opportunities")
    .update({
      pipeline_stage_id: stage.id,
      probability: stage.probability,
      status,
      won_at: status === "won" ? now : null,
      lost_at: status === "lost" ? now : null,
      lost_reason: status === "lost" ? cleanOptional(input.lost_reason) : null,
    })
    .eq("id", opportunity.id)
    .eq("org_id", workspace.orgId)
    .select("id, name, pipeline_stage_id, status, probability, contact_id, company_id")
    .single();
  if (error) throw new Error(error.message);
  const targets: Array<{ entity_type: "opportunity" | "contact" | "company"; entity_id: string }> = [{ entity_type: "opportunity", entity_id: updated.id }];
  if (updated.contact_id) targets.push({ entity_type: "contact", entity_id: updated.contact_id });
  if (updated.company_id) targets.push({ entity_type: "company", entity_id: updated.company_id });
  await logCrmActivity({
    orgId: workspace.orgId,
    actorUserId: userId,
    type: "opportunity_stage_moved",
    title: `Opportunity moved to ${stage.name}: ${updated.name}`,
    sourceId: updated.id,
    targets,
  });
  return { ...updated, stage_name: stage.name };
}

export async function getCrmOpportunityRecordForUser(userId: string, opportunityId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const { data: opportunity, error: opportunityError } = await db
    .from("crm_opportunities")
    .select("id, name, amount_cents, currency, probability, status, expected_close_date, source, lost_reason, won_at, lost_at, contact_id, company_id, owner_user_id, pipeline_id, pipeline_stage_id, created_at, updated_at")
    .eq("id", opportunityId)
    .eq("org_id", workspace.orgId)
    .maybeSingle();
  if (opportunityError) throw new Error(opportunityError.message);
  if (!opportunity) throw new Error("Opportunity not found in this workspace");

  const [contact, company, pipeline, tasks, activities] = await Promise.all([
    opportunity.contact_id ? db.from("crm_contacts").select("id, display_name, primary_email, primary_phone, lifecycle_status").eq("id", opportunity.contact_id).eq("org_id", workspace.orgId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    opportunity.company_id ? db.from("crm_companies").select("id, name, domain, industry, website").eq("id", opportunity.company_id).eq("org_id", workspace.orgId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("crm_pipelines").select("id, name, crm_pipeline_stages(id, name, position, probability, color, is_closed_won, is_closed_lost, is_archived)").eq("id", opportunity.pipeline_id).eq("org_id", workspace.orgId).maybeSingle(),
    db.from("crm_tasks").select("id, title, description, due_at, priority, status, completed_at, contact_id, company_id, opportunity_id, created_at").eq("org_id", workspace.orgId).eq("opportunity_id", opportunity.id).order("created_at", { ascending: false }).limit(100),
    db.from("crm_activities").select("id, activity_type, title, body, occurred_at, source_type, source_id, payload").eq("org_id", workspace.orgId).order("occurred_at", { ascending: false }).limit(200),
  ]);
  for (const result of [contact, company, pipeline, tasks, activities]) if (result.error) throw new Error(result.error.message);
  const { data: targets, error: targetError } = await db.from("crm_activity_targets").select("activity_id").eq("org_id", workspace.orgId).eq("entity_type", "opportunity").eq("entity_id", opportunity.id);
  if (targetError) throw new Error(targetError.message);
  const targetIds = new Set((targets ?? []).map((target: { activity_id: string }) => target.activity_id));
  return { opportunity, contact: contact.data, company: company.data, pipeline: pipeline.data, tasks: tasks.data ?? [], activities: (activities.data ?? []).filter((activity: { id: string }) => targetIds.has(activity.id)) };
}

export async function getCrmCompanyRecordForUser(userId: string, companyId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const { data: company, error: companyError } = await db
    .from("crm_companies")
    .select("id, name, domain, website, industry, description, owner_user_id, created_at, updated_at")
    .eq("id", companyId)
    .eq("org_id", workspace.orgId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("Company not found in this workspace");
  const [contacts, opportunities, tasks, activities] = await Promise.all([
    db.from("crm_company_contacts").select("id, title, is_primary, crm_contacts(id, display_name, primary_email, primary_phone, lifecycle_status)").eq("org_id", workspace.orgId).eq("company_id", company.id).order("is_primary", { ascending: false }),
    db.from("crm_opportunities").select("id, name, amount_cents, currency, status, probability, expected_close_date, pipeline_id, pipeline_stage_id, created_at").eq("org_id", workspace.orgId).eq("company_id", company.id).order("created_at", { ascending: false }),
    db.from("crm_tasks").select("id, title, description, due_at, priority, status, completed_at, contact_id, opportunity_id, created_at").eq("org_id", workspace.orgId).eq("company_id", company.id).order("created_at", { ascending: false }).limit(100),
    db.from("crm_activities").select("id, activity_type, title, body, occurred_at, source_type, source_id, payload").eq("org_id", workspace.orgId).order("occurred_at", { ascending: false }).limit(200),
  ]);
  for (const result of [contacts, opportunities, tasks, activities]) if (result.error) throw new Error(result.error.message);
  const { data: targets, error: targetError } = await db.from("crm_activity_targets").select("activity_id").eq("org_id", workspace.orgId).eq("entity_type", "company").eq("entity_id", company.id);
  if (targetError) throw new Error(targetError.message);
  const targetIds = new Set((targets ?? []).map((target: { activity_id: string }) => target.activity_id));
  return { company, contacts: contacts.data ?? [], opportunities: opportunities.data ?? [], tasks: tasks.data ?? [], activities: (activities.data ?? []).filter((activity: { id: string }) => targetIds.has(activity.id)) };
}

export async function updateCrmPipelineStageForUser(userId: string, input: { id: string; name: string; probability: number; color?: string | null; is_closed_won: boolean; is_closed_lost: boolean }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data: existing, error: existingError } = await db.from("crm_pipeline_stages").select("id, name, pipeline_id, probability, color, is_closed_won, is_closed_lost").eq("id", input.id).eq("org_id", workspace.orgId).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Pipeline stage not found in this workspace");
  if (input.is_closed_won && input.is_closed_lost) throw new Error("A stage cannot be both won and lost");
  const semanticChanged = existing.is_closed_won !== input.is_closed_won || existing.is_closed_lost !== input.is_closed_lost;
  if (semanticChanged) {
    const { count, error: usageError } = await db.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("org_id", workspace.orgId).eq("pipeline_stage_id", existing.id);
    if (usageError) throw new Error(usageError.message);
    if ((count ?? 0) > 0) throw new Error("This stage is already used by opportunities. Create a new terminal stage or archive the old stage instead of changing its terminal semantics.");
  }
  const { data: stage, error } = await db.from("crm_pipeline_stages").update({ name: input.name.trim(), probability: input.probability, color: cleanOptional(input.color), is_closed_won: input.is_closed_won, is_closed_lost: input.is_closed_lost }).eq("id", existing.id).eq("org_id", workspace.orgId).select("id, name, probability, color, is_closed_won, is_closed_lost, pipeline_id").single();
  if (error) throw new Error(error.message);
  await logCrmActivity({ orgId: workspace.orgId, actorUserId: userId, type: "pipeline_stage_updated", title: `Pipeline stage updated: ${stage.name}`, sourceId: stage.id, targets: [] });
  return stage;
}

export async function getCrmReportForUser(userId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const today = new Date().toISOString();
  const [opportunities, tasks, activities, pipelines] = await Promise.all([
    db.from("crm_opportunities").select("id, amount_cents, status, pipeline_id, pipeline_stage_id, created_at, won_at, lost_at").eq("org_id", workspace.orgId),
    db.from("crm_tasks").select("id, status, due_at, completed_at, priority, assignee_user_id").eq("org_id", workspace.orgId),
    db.from("crm_activities").select("id, activity_type, occurred_at, actor_user_id").eq("org_id", workspace.orgId).gte("occurred_at", monthStart.toISOString()),
    db.from("crm_pipelines").select("id, name, crm_pipeline_stages(id, name, position, probability, is_closed_won, is_closed_lost)").eq("org_id", workspace.orgId).eq("is_archived", false),
  ]);
  for (const result of [opportunities, tasks, activities, pipelines]) if (result.error) throw new Error(result.error.message);
  const open = (opportunities.data ?? []).filter((item: { status: string }) => item.status === "open");
  const wonThisMonth = (opportunities.data ?? []).filter((item: { status: string; won_at: string | null }) => item.status === "won" && item.won_at && new Date(item.won_at) >= monthStart);
  const lostThisMonth = (opportunities.data ?? []).filter((item: { status: string; lost_at: string | null }) => item.status === "lost" && item.lost_at && new Date(item.lost_at) >= monthStart);
  const overdue = (tasks.data ?? []).filter((task: { status: string; due_at: string | null }) => ["open", "in_progress"].includes(task.status) && task.due_at && task.due_at < today);
  const stageById = new Map<string, { name: string; probability: number; pipeline: string }>();
  for (const pipeline of pipelines.data ?? []) for (const stage of pipeline.crm_pipeline_stages ?? []) stageById.set(stage.id, { name: stage.name, probability: Number(stage.probability), pipeline: pipeline.name });
  const stageRollup = Array.from(stageById.entries()).map(([id, stage]) => {
    const stageOpportunities = open.filter((opportunity: { pipeline_stage_id: string }) => opportunity.pipeline_stage_id === id);
    const value = stageOpportunities.reduce((sum: number, opportunity: { amount_cents: number }) => sum + Number(opportunity.amount_cents ?? 0), 0);
    return { stage_id: id, stage_name: stage.name, pipeline_name: stage.pipeline, probability: stage.probability, count: stageOpportunities.length, value_cents: value, weighted_value_cents: Math.round(value * stage.probability / 100) };
  }).filter((item) => item.count > 0);
  const activityByType = new Map<string, number>();
  for (const activity of activities.data ?? []) activityByType.set(activity.activity_type, (activityByType.get(activity.activity_type) ?? 0) + 1);
  return {
    period_start: monthStart.toISOString(),
    metrics: {
      open_pipeline_value_cents: open.reduce((sum: number, item: { amount_cents: number }) => sum + Number(item.amount_cents ?? 0), 0),
      weighted_pipeline_value_cents: stageRollup.reduce((sum, item) => sum + item.weighted_value_cents, 0),
      won_value_cents: wonThisMonth.reduce((sum: number, item: { amount_cents: number }) => sum + Number(item.amount_cents ?? 0), 0),
      won_count: wonThisMonth.length,
      lost_count: lostThisMonth.length,
      open_tasks: (tasks.data ?? []).filter((task: { status: string }) => ["open", "in_progress"].includes(task.status)).length,
      overdue_tasks: overdue.length,
      monthly_activities: (activities.data ?? []).length,
    },
    stage_rollup: stageRollup,
    activity_breakdown: Array.from(activityByType.entries()).map(([activity_type, count]) => ({ activity_type, count })).sort((a, b) => b.count - a.count),
    tasks: { overdue: overdue.slice(0, 20), recent_completed: (tasks.data ?? []).filter((task: { status: string }) => task.status === "completed").slice(0, 20) },
  };
}

export async function getCrmSavedViewsForUser(userId: string, entityType: "contact" | "company" | "opportunity" | "task" | "thread" | "call") {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("crm_saved_views")
    .select("id, name, description, visibility, filters, columns, sort, is_default, owner_user_id, created_at, updated_at")
    .eq("org_id", workspace.orgId)
    .eq("entity_type", entityType)
    .or(`owner_user_id.eq.${userId},visibility.eq.shared`)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function searchCrmRecordsForUser(userId: string, query: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const escaped = query.replace(/[,%()]/g, " ").trim();
  if (!escaped) return [];
  const pattern = `%${escaped}%`;
  const [contacts, companies, opportunities, tasks] = await Promise.all([
    db.from("crm_contact_legacy_adapter_v").select("id, record_source, legacy_lead_id, display_name, primary_email, primary_phone, lifecycle_status").eq("org_id", workspace.orgId).or(`display_name.ilike.${pattern},primary_email.ilike.${pattern},primary_phone.ilike.${pattern}`).limit(15),
    db.from("crm_companies").select("id, name, domain, industry").eq("org_id", workspace.orgId).or(`name.ilike.${pattern},domain.ilike.${pattern}`).limit(15),
    db.from("crm_opportunities").select("id, name, amount_cents, status").eq("org_id", workspace.orgId).ilike("name", pattern).limit(15),
    db.from("crm_tasks").select("id, title, status, due_at").eq("org_id", workspace.orgId).ilike("title", pattern).limit(15),
  ]);
  for (const result of [contacts, companies, opportunities, tasks]) if (result.error) throw new Error(result.error.message);
  return [
    ...(contacts.data ?? []).map((item: any) => ({ kind: "contact", id: item.id, title: item.display_name, subtitle: item.primary_email ?? item.primary_phone ?? item.lifecycle_status, href: `/sales/contacts/${item.id}`, record_source: item.record_source })),
    ...(companies.data ?? []).map((item: any) => ({ kind: "company", id: item.id, title: item.name, subtitle: item.domain ?? item.industry ?? "CRM company", href: `/sales/companies/${item.id}` })),
    ...(opportunities.data ?? []).map((item: any) => ({ kind: "opportunity", id: item.id, title: item.name, subtitle: `${item.status} · ${(Number(item.amount_cents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`, href: `/sales/opportunities/${item.id}` })),
    ...(tasks.data ?? []).map((item: any) => ({ kind: "task", id: item.id, title: item.title, subtitle: item.status, href: "/sales" })),
  ];
}

export async function createCrmAutomationRuleForUser(userId: string, input: { name: string; description?: string | null; entity_type: "contact" | "company" | "opportunity" | "task" | "thread" | "call"; trigger_type: "record_created" | "record_updated" | "stage_changed" | "task_due" | "message_received" | "call_completed" | "time_elapsed"; conditions?: Array<Record<string, unknown>>; actions?: Array<Record<string, unknown>> }) {
  const workspace = await crmWorkspaceForUser(userId);
  requireManager(workspace);
  const db = supabaseAdmin as any;
  const { data, error } = await db.from("crm_automation_rules").insert({ org_id: workspace.orgId, name: input.name.trim(), description: cleanOptional(input.description), entity_type: input.entity_type, trigger_type: input.trigger_type, conditions: input.conditions ?? [], actions: input.actions ?? [], is_enabled: false, created_by: userId }).select("id, name, entity_type, trigger_type, is_enabled, created_at").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCrmAutomationRulesForUser(userId: string) {
  const workspace = await crmWorkspaceForUser(userId);
  const db = supabaseAdmin as any;
  const [rules, runs] = await Promise.all([
    db.from("crm_automation_rules").select("id, name, description, entity_type, trigger_type, conditions, actions, is_enabled, created_at, updated_at").eq("org_id", workspace.orgId).order("updated_at", { ascending: false }),
    db.from("crm_automation_runs").select("id, rule_id, trigger_entity_type, trigger_entity_id, status, error_message, created_at, completed_at").eq("org_id", workspace.orgId).order("created_at", { ascending: false }).limit(100),
  ]);
  if (rules.error) throw new Error(rules.error.message);
  if (runs.error) throw new Error(runs.error.message);
  return { rules: rules.data ?? [], runs: runs.data ?? [] };
}
