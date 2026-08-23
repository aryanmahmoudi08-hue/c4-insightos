import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  Building2,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  Columns3,
  ContactRound,
  ListTodo,
  Plus,
  Search,
  UsersRound,
  Workflow,
} from "lucide-react";
import { TopBar } from "@/components/app-sidebar";
import { PageHero } from "@/components/page-hero";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/use-role";
import {
  bulkUpdateCrmContacts,
  createCrmCompany,
  createCrmContact,
  createCrmOpportunity,
  createCrmPipeline,
  createCrmTask,
  getCrmFoundationOverview,
} from "@/lib/crm-foundation.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sales")({ component: SalesCrm });

type Overview = Awaited<ReturnType<typeof getCrmFoundationOverview>>;
type Contact = Overview["contacts"][number];
type Pipeline = Overview["pipelines"][number];
type Opportunity = Overview["opportunities"][number];
type Task = Overview["tasks"][number];
type ActivityRow = Overview["activities"][number];

const INITIAL_STAGES = [
  { name: "New", probability: 10 },
  { name: "Qualified", probability: 35 },
  { name: "Proposal", probability: 65 },
  { name: "Closed Won", probability: 100, is_closed_won: true },
  { name: "Closed Lost", probability: 0, is_closed_lost: true },
];

function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format((cents ?? 0) / 100);
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function SalesCrm() {
  const queryClient = useQueryClient();
  const { canManage } = useRole();
  const [query, setQuery] = useState("");
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const overviewFn = useServerFn(getCrmFoundationOverview);
  const createContactFn = useServerFn(createCrmContact);
  const createCompanyFn = useServerFn(createCrmCompany);
  const createPipelineFn = useServerFn(createCrmPipeline);
  const createOpportunityFn = useServerFn(createCrmOpportunity);
  const createTaskFn = useServerFn(createCrmTask);
  const bulkUpdateContactsFn = useServerFn(bulkUpdateCrmContacts);

  const overviewQuery = useQuery({
    queryKey: ["sales-crm-foundation"],
    queryFn: () => overviewFn(),
  });
  const overview = overviewQuery.data;
  const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["sales-crm-foundation"] });

  const createContactMutation = useMutation({
    mutationFn: (data: Parameters<typeof createContactFn>[0]) => createContactFn(data),
    onSuccess: async () => { toast.success("CRM contact created"); setContactDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createCompanyMutation = useMutation({
    mutationFn: (data: Parameters<typeof createCompanyFn>[0]) => createCompanyFn(data),
    onSuccess: async () => { toast.success("Company created"); setCompanyDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createPipelineMutation = useMutation({
    mutationFn: (data: Parameters<typeof createPipelineFn>[0]) => createPipelineFn(data),
    onSuccess: async () => { toast.success("Pipeline created"); setPipelineDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createOpportunityMutation = useMutation({
    mutationFn: (data: Parameters<typeof createOpportunityFn>[0]) => createOpportunityFn(data),
    onSuccess: async () => { toast.success("Opportunity created"); setOpportunityDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createTaskMutation = useMutation({
    mutationFn: (data: Parameters<typeof createTaskFn>[0]) => createTaskFn(data),
    onSuccess: async () => { toast.success("Task created"); setTaskDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const bulkUpdateMutation = useMutation({
    mutationFn: (data: Parameters<typeof bulkUpdateContactsFn>[0]) => bulkUpdateContactsFn(data),
    onSuccess: async (result) => { toast.success(`${result.updated} CRM contact${result.updated === 1 ? "" : "s"} updated`); setSelectedContactIds([]); setBulkDialogOpen(false); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return overview?.contacts ?? [];
    return (overview?.contacts ?? []).filter((contact) =>
      [contact.display_name, contact.primary_email, contact.primary_phone, contact.social_handle, contact.lifecycle_status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [overview?.contacts, query]);

  const pipelineStages = useMemo(() => {
    return (overview?.pipelines ?? []).flatMap((pipeline) =>
      ((pipeline.crm_pipeline_stages ?? []) as Array<{ id: string; name: string; position: number; probability: number; is_closed_won: boolean; is_closed_lost: boolean }>)
        .sort((a, b) => a.position - b.position)
        .map((stage) => ({ ...stage, pipeline_id: pipeline.id, pipeline_name: pipeline.name })),
    );
  }, [overview?.pipelines]);

  if (overviewQuery.isLoading) {
    return <SalesCrmLoading />;
  }
  if (overviewQuery.isError || !overview) {
    return (
      <>
        <TopBar title="Sales CRM" subtitle="Connected sales operations" />
        <div className="p-6"><div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm">The Sales CRM foundation is not available yet. Apply the additive CRM migration before opening this workspace.</div></div>
      </>
    );
  }

  const managedActions = canManage ? (
    <div className="flex flex-wrap gap-2">
      <ContactDialog open={contactDialogOpen} onOpenChange={setContactDialogOpen} pending={createContactMutation.isPending} onSubmit={(data) => createContactMutation.mutate({ data })} />
      <CompanyDialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen} pending={createCompanyMutation.isPending} onSubmit={(data) => createCompanyMutation.mutate({ data })} />
      <PipelineDialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen} pending={createPipelineMutation.isPending} onSubmit={(data) => createPipelineMutation.mutate({ data })} />
      <OpportunityDialog open={opportunityDialogOpen} onOpenChange={setOpportunityDialogOpen} pending={createOpportunityMutation.isPending} contacts={overview.contacts as Contact[]} stages={pipelineStages} onSubmit={(data) => createOpportunityMutation.mutate({ data })} />
      <TaskDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} pending={createTaskMutation.isPending} contacts={overview.contacts as Contact[]} opportunities={overview.opportunities as Opportunity[]} onSubmit={(data) => createTaskMutation.mutate({ data })} />
      <BulkLifecycleDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen} count={selectedContactIds.length} pending={bulkUpdateMutation.isPending} onSubmit={(lifecycle_status) => bulkUpdateMutation.mutate({ data: { contact_ids: selectedContactIds, lifecycle_status } })} />
    </div>
  ) : null;

  return (
    <>
      <TopBar title="Sales CRM" subtitle="Contacts, opportunities, work queues, and the connected sales history." />
      <main className="mx-auto max-w-[1760px] space-y-5 p-4 sm:p-6">
        <PageHero
          icon={<Workflow className="h-5 w-5" />}
          eyebrow="Sales operating system"
          title="Sales CRM"
          subtitle="A connected workspace that keeps legacy lead history visible while new CRM records, deals, and tasks become the operating layer."
          status={[
            { label: `${overview.counts.legacy_leads} legacy leads preserved`, tone: "default" },
            { label: `${overview.counts.open_tasks} open tasks`, tone: overview.counts.open_tasks ? "warning" : "default" },
          ]}
          actions={<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><Link to="/sales/inbox">Inbox</Link></Button>{managedActions}</div>}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Contacts" value={overview.counts.contacts} icon={<ContactRound className="h-3.5 w-3.5" />} spectrum="cold" />
          <MetricCard label="Companies" value={overview.counts.companies} icon={<Building2 className="h-3.5 w-3.5" />} spectrum="mid" />
          <MetricCard label="Open deals" value={overview.counts.opportunities} icon={<CircleDollarSign className="h-3.5 w-3.5" />} spectrum="hot" />
          <MetricCard label="Open tasks" value={overview.counts.open_tasks} icon={<ListTodo className="h-3.5 w-3.5" />} spectrum="mid" />
          <MetricCard label="Pipelines" value={overview.pipelines.length} icon={<Columns3 className="h-3.5 w-3.5" />} spectrum="cold" />
        </section>

        <Tabs defaultValue="contacts" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card/70 p-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-transparent p-0 lg:w-auto">
              <TabsTrigger value="contacts" className="gap-1.5"><UsersRound className="h-3.5 w-3.5" />Contacts</TabsTrigger>
              <TabsTrigger value="pipeline" className="gap-1.5"><Columns3 className="h-3.5 w-3.5" />Pipeline</TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5"><CheckSquare className="h-3.5 w-3.5" />Tasks</TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" />Activity</TabsTrigger>
            </TabsList>
            <label className="relative block w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts or legacy leads…" className="pl-9" />
            </label>
          </div>

          <TabsContent value="contacts" className="mt-0">
            <ContactTable contacts={filteredContacts as Contact[]} canManage={canManage} selectedIds={selectedContactIds} onSelectedIdsChange={setSelectedContactIds} onBulkUpdate={() => setBulkDialogOpen(true)} />
          </TabsContent>
          <TabsContent value="pipeline" className="mt-0">
            <PipelineBoard pipelines={overview.pipelines as Pipeline[]} opportunities={overview.opportunities as Opportunity[]} />
          </TabsContent>
          <TabsContent value="tasks" className="mt-0">
            <TaskQueue tasks={overview.tasks as Task[]} />
          </TabsContent>
          <TabsContent value="activity" className="mt-0">
            <ActivityTimeline activities={overview.activities as ActivityRow[]} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function ContactTable({ contacts, canManage, selectedIds, onSelectedIdsChange, onBulkUpdate }: { contacts: Contact[]; canManage: boolean; selectedIds: string[]; onSelectedIdsChange: (ids: string[]) => void; onBulkUpdate: () => void }) {
  const nativeContacts = contacts.filter((contact) => contact.record_source === "crm_contact");
  const selectedSet = new Set(selectedIds);
  const toggleAll = () => onSelectedIdsChange(nativeContacts.length > 0 && nativeContacts.every((contact) => selectedSet.has(contact.id)) ? [] : nativeContacts.map((contact) => contact.id));
  const toggleOne = (id: string) => onSelectedIdsChange(selectedSet.has(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div><h2 className="text-sm font-semibold">People</h2><p className="text-xs text-muted-foreground">Native contacts and preserved legacy leads appear together without duplicating source records.</p></div>
        <div className="flex items-center gap-3"><span className="text-xs tabular-nums text-muted-foreground">{contacts.length} shown</span>{canManage && selectedIds.length > 0 && <Button size="sm" onClick={onBulkUpdate}>Update {selectedIds.length} selected</Button>}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-muted/35 text-left text-2xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {canManage && <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all native CRM contacts" checked={nativeContacts.length > 0 && nativeContacts.every((contact) => selectedSet.has(contact.id))} onChange={toggleAll} /></th>}
              <th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Lifecycle</th><th className="px-4 py-3 font-medium">Email / phone</th><th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={`${contact.record_source}-${contact.id}`} className="border-t border-border/60 transition-colors hover:bg-muted/20">
                {canManage && <td className="px-4 py-3">{contact.record_source === "crm_contact" ? <input type="checkbox" aria-label={`Select ${contact.display_name}`} checked={selectedSet.has(contact.id)} onChange={() => toggleOne(contact.id)} /> : <span className="block h-4 w-4" />}</td>}
                <td className="px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-muted text-3xs font-semibold text-muted-foreground">{initials(contact.display_name)}</span><div><Link to="/sales/contacts/$id" params={{ id: contact.id }} className="font-medium hover:text-accent hover:underline">{contact.display_name}</Link><div className="mt-0.5 text-2xs text-muted-foreground">{contact.social_handle ? `@${contact.social_handle.replace(/^@/, "")}` : "No social handle"}</div></div></div></td>
                <td className="px-4 py-3"><span className="rounded-full border border-border bg-muted/50 px-2 py-1 text-3xs font-medium uppercase tracking-wide">{contact.lifecycle_status.replaceAll("_", " ")}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground"><div>{contact.primary_email ?? "—"}</div><div className="mt-0.5">{contact.primary_phone ?? "—"}</div></td>
                <td className="px-4 py-3"><span className={cn("rounded px-1.5 py-1 text-3xs font-semibold", contact.record_source === "legacy_lead" ? "bg-muted text-muted-foreground" : "bg-accent/15 text-accent")}>{contact.record_source === "legacy_lead" ? "Legacy lead" : "CRM contact"}</span></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(contact.created_at)}</td>
              </tr>
            ))}
            {!contacts.length && <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-12 text-center text-sm text-muted-foreground">No contacts match this view. Add a new CRM contact or open Legacy Leads to continue working in the existing system.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PipelineBoard({ pipelines, opportunities }: { pipelines: Pipeline[]; opportunities: Opportunity[] }) {
  const stages = pipelines.flatMap((pipeline) => ((pipeline.crm_pipeline_stages ?? []) as Array<{ id: string; name: string; position: number; probability: number; is_closed_won: boolean; is_closed_lost: boolean }>).sort((a, b) => a.position - b.position).map((stage) => ({ ...stage, pipeline_id: pipeline.id, pipeline_name: pipeline.name })));
  if (!pipelines.length) return <EmptyBoard icon={<Columns3 className="h-5 w-5" />} title="Create your first pipeline" description="Pipelines and stages are data, not a hard-coded enum. Create one from the quick actions above, then add opportunities into its stages." />;
  return (
    <section className="space-y-4">
      {pipelines.map((pipeline) => {
        const pipelineStages = stages.filter((stage) => stage.pipeline_id === pipeline.id);
        return <div key={pipeline.id} className="overflow-hidden rounded-xl border border-border/80 bg-card"><div className="flex items-center justify-between border-b border-border/70 px-4 py-3"><div><h2 className="font-semibold">{pipeline.name}</h2><p className="text-2xs text-muted-foreground">{pipeline.description ?? "Configurable sales pipeline"}</p></div>{pipeline.is_default && <span className="rounded bg-accent/15 px-2 py-1 text-3xs font-semibold uppercase tracking-wide text-accent">Default</span>}</div><div className="grid min-w-max grid-flow-col auto-cols-[minmax(230px,1fr)] gap-px overflow-x-auto bg-border/70 p-px">{pipelineStages.map((stage) => <PipelineColumn key={stage.id} stage={stage} opportunities={opportunities.filter((opportunity) => opportunity.pipeline_stage_id === stage.id)} />)}</div></div>;
      })}
    </section>
  );
}

function PipelineColumn({ stage, opportunities }: { stage: { id: string; name: string; probability: number; is_closed_won: boolean; is_closed_lost: boolean }; opportunities: Opportunity[] }) {
  const total = opportunities.reduce((sum, opportunity) => sum + (opportunity.amount_cents ?? 0), 0);
  return <div className="min-h-[300px] bg-card p-3"><div className="mb-3 flex items-start justify-between gap-3"><div><div className="text-xs font-semibold">{stage.name}</div><div className="mt-0.5 text-2xs text-muted-foreground">{stage.probability}% probability · {opportunities.length} deals</div></div><div className="text-xs font-semibold tabular-nums">{formatMoney(total)}</div></div><div className="space-y-2">{opportunities.map((opportunity) => <div key={opportunity.id} className="rounded-lg border border-border/80 bg-muted/20 p-3 shadow-sm"><div className="text-sm font-medium">{opportunity.name}</div><div className="mt-1 text-xs tabular-nums text-muted-foreground">{formatMoney(opportunity.amount_cents, opportunity.currency)}</div><div className="mt-3 flex items-center justify-between text-2xs text-muted-foreground"><span>{opportunity.expected_close_date ? `Close ${formatDate(opportunity.expected_close_date)}` : "No close date"}</span><span className="rounded bg-background px-1.5 py-0.5 uppercase">{opportunity.status}</span></div></div>)}{!opportunities.length && <div className="rounded-lg border border-dashed border-border p-4 text-center text-2xs text-muted-foreground">No opportunities in this stage.</div>}</div></div>;
}

function TaskQueue({ tasks }: { tasks: Task[] }) {
  return <section className="overflow-hidden rounded-xl border border-border/80 bg-card"><div className="border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">Work queue</h2><p className="text-xs text-muted-foreground">Open CRM tasks are concrete next steps linked to sales records where applicable.</p></div><div className="divide-y divide-border/60">{tasks.map((task) => <div key={task.id} className="flex items-center gap-3 px-4 py-3"><span className={cn("h-2 w-2 rounded-full", task.priority === "urgent" ? "bg-destructive" : task.priority === "high" ? "bg-[color:var(--color-warning)]" : "bg-accent")} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{task.title}</div><div className="mt-0.5 text-2xs text-muted-foreground">{task.contact_id ? "Linked contact" : task.opportunity_id ? "Linked opportunity" : "General CRM task"}</div></div><div className="text-right text-2xs text-muted-foreground"><div className="flex items-center justify-end gap-1"><Clock3 className="h-3 w-3" />{formatDate(task.due_at)}</div><div className="mt-1 uppercase tracking-wide">{task.priority}</div></div></div>)}{!tasks.length && <div className="p-10 text-center text-sm text-muted-foreground">No open tasks. Create the next follow-up from the quick actions above.</div>}</div></section>;
}

function ActivityTimeline({ activities }: { activities: ActivityRow[] }) {
  return <section className="rounded-xl border border-border/80 bg-card"><div className="border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">Unified CRM activity</h2><p className="text-xs text-muted-foreground">New CRM actions are written once as normalized activities. Legacy events stay preserved and will be projected into this feed during compatibility rollout.</p></div><div className="divide-y divide-border/60">{activities.map((activity) => <div key={activity.id} className="flex gap-3 px-4 py-3"><span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/10 text-accent"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="text-sm font-medium">{activity.title}</div>{activity.body && <p className="mt-1 text-xs text-muted-foreground">{activity.body}</p>}<div className="mt-1.5 text-2xs text-muted-foreground">{formatDate(activity.occurred_at)} · {activity.activity_type.replaceAll("_", " ")}</div></div></div>)}{!activities.length && <div className="p-10 text-center text-sm text-muted-foreground">The activity timeline will populate as CRM contacts, pipelines, opportunities, and tasks are created.</div>}</div></section>;
}

function EmptyBoard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <section className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card p-8 text-center"><div className="max-w-md"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">{icon}</div><h2 className="mt-4 text-base font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div></section>;
}

function SalesCrmLoading() {
  return <><TopBar title="Sales CRM" subtitle="Connected sales operations" /><div className="space-y-5 p-6"><div className="h-32 animate-pulse rounded-xl bg-muted/50" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-muted/40" />)}</div><div className="h-[420px] animate-pulse rounded-xl bg-muted/30" /></div></>;
}

function ContactDialog({ open, onOpenChange, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onSubmit: (data: { display_name: string; primary_email?: string; primary_phone?: string; social_handle?: string; lifecycle_status?: string; source?: string }) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5" />Contact</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add CRM contact</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ display_name: String(form.get("display_name") ?? ""), primary_email: String(form.get("primary_email") ?? "") || undefined, primary_phone: String(form.get("primary_phone") ?? "") || undefined, social_handle: String(form.get("social_handle") ?? "") || undefined, lifecycle_status: String(form.get("lifecycle_status") ?? "new"), source: String(form.get("source") ?? "") || undefined }); }}><FormField label="Full name"><Input name="display_name" required autoFocus placeholder="Alex Morgan" /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Email"><Input name="primary_email" type="email" placeholder="alex@company.com" /></FormField><FormField label="Phone"><Input name="primary_phone" placeholder="+1 555 010 1010" /></FormField></div><div className="grid grid-cols-2 gap-3"><FormField label="Lifecycle"><Input name="lifecycle_status" defaultValue="new" /></FormField><FormField label="Source"><Input name="source" placeholder="Referral" /></FormField></div><FormField label="Social handle"><Input name="social_handle" placeholder="@alex" /></FormField><Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create contact"}</Button></form></DialogContent></Dialog>;
}

function CompanyDialog({ open, onOpenChange, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onSubmit: (data: { name: string; domain?: string; website?: string; industry?: string; description?: string }) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Company</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Add company</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ name: String(form.get("name") ?? ""), domain: String(form.get("domain") ?? "") || undefined, website: String(form.get("website") ?? "") || undefined, industry: String(form.get("industry") ?? "") || undefined, description: String(form.get("description") ?? "") || undefined }); }}><FormField label="Company name"><Input name="name" required autoFocus placeholder="Acme Coaching" /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Domain"><Input name="domain" placeholder="acme.com" /></FormField><FormField label="Industry"><Input name="industry" placeholder="Education" /></FormField></div><FormField label="Website"><Input name="website" type="url" placeholder="https://acme.com" /></FormField><FormField label="Description"><Textarea name="description" rows={3} placeholder="Optional account context" /></FormField><Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create company"}</Button></form></DialogContent></Dialog>;
}

function PipelineDialog({ open, onOpenChange, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onSubmit: (data: { name: string; description?: string; is_default: boolean; stages: typeof INITIAL_STAGES }) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Pipeline</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Create pipeline</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") || undefined, is_default: form.get("is_default") === "on", stages: INITIAL_STAGES }); }}><FormField label="Pipeline name"><Input name="name" required autoFocus placeholder="Core sales pipeline" /></FormField><FormField label="Description"><Textarea name="description" rows={2} placeholder="Optional operating context" /></FormField><label className="flex items-center gap-2 text-sm"><input name="is_default" type="checkbox" className="accent-primary" /> Make this the default pipeline</label><div className="rounded-lg border border-border bg-muted/20 p-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Initial configurable stages</div><div className="mt-2 flex flex-wrap gap-1.5">{INITIAL_STAGES.map((stage) => <span key={stage.name} className="rounded bg-background px-2 py-1 text-2xs">{stage.name} · {stage.probability}%</span>)}</div></div><Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create pipeline and stages"}</Button></form></DialogContent></Dialog>;
}

function OpportunityDialog({ open, onOpenChange, pending, contacts, stages, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; contacts: Contact[]; stages: Array<{ id: string; pipeline_id: string; pipeline_name: string; name: string }>; onSubmit: (data: { name: string; pipeline_id: string; pipeline_stage_id: string; contact_id?: string; amount_cents: number; expected_close_date?: string }) => void }) {
  const [selectedStageId, setSelectedStageId] = useState("");
  const stage = stages.find((item) => item.id === selectedStageId);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm" variant="outline" disabled={!stages.length}><Plus className="h-3.5 w-3.5" />Opportunity</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create opportunity</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!stage) return; const form = new FormData(event.currentTarget); const value = Number(form.get("amount") || 0); onSubmit({ name: String(form.get("name") ?? ""), pipeline_id: stage.pipeline_id, pipeline_stage_id: stage.id, contact_id: String(form.get("contact_id") ?? "") || undefined, amount_cents: Math.round(value * 100), expected_close_date: String(form.get("expected_close_date") ?? "") || undefined }); }}><FormField label="Opportunity name"><Input name="name" required autoFocus placeholder="Coaching enrollment" /></FormField><FormField label="Pipeline stage"><Select value={selectedStageId} onValueChange={setSelectedStageId}><SelectTrigger><SelectValue placeholder="Select a stage" /></SelectTrigger><SelectContent>{stages.map((item) => <SelectItem key={item.id} value={item.id}>{item.pipeline_name} · {item.name}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Related contact"><Select name="contact_id"><SelectTrigger><SelectValue placeholder="Optional contact" /></SelectTrigger><SelectContent>{contacts.filter((contact) => contact.record_source === "crm_contact").map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.display_name}</SelectItem>)}</SelectContent></Select></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Value (USD)"><Input name="amount" type="number" min="0" step="0.01" defaultValue="0" /></FormField><FormField label="Expected close"><Input name="expected_close_date" type="date" /></FormField></div><Button type="submit" className="w-full" disabled={pending || !stage}>{pending ? "Creating…" : "Create opportunity"}</Button></form></DialogContent></Dialog>;
}

function TaskDialog({ open, onOpenChange, pending, contacts, opportunities, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; contacts: Contact[]; opportunities: Opportunity[]; onSubmit: (data: { title: string; description?: string; contact_id?: string; opportunity_id?: string; due_at?: string; priority: "low" | "normal" | "high" | "urgent" }) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5" />Task</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Create follow-up task</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const dueAt = String(form.get("due_at") ?? ""); onSubmit({ title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "") || undefined, contact_id: String(form.get("contact_id") ?? "") || undefined, opportunity_id: String(form.get("opportunity_id") ?? "") || undefined, due_at: dueAt ? new Date(dueAt).toISOString() : undefined, priority: String(form.get("priority") ?? "normal") as "low" | "normal" | "high" | "urgent" }); }}><FormField label="Task"><Input name="title" required autoFocus placeholder="Follow up after proposal" /></FormField><FormField label="Related contact"><Select name="contact_id"><SelectTrigger><SelectValue placeholder="Optional contact" /></SelectTrigger><SelectContent>{contacts.filter((contact) => contact.record_source === "crm_contact").map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.display_name}</SelectItem>)}</SelectContent></Select></FormField><FormField label="Related opportunity"><Select name="opportunity_id"><SelectTrigger><SelectValue placeholder="Optional opportunity" /></SelectTrigger><SelectContent>{opportunities.map((opportunity) => <SelectItem key={opportunity.id} value={opportunity.id}>{opportunity.name}</SelectItem>)}</SelectContent></Select></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Due"><Input name="due_at" type="datetime-local" /></FormField><FormField label="Priority"><Select name="priority" defaultValue="normal"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></FormField></div><FormField label="Context"><Textarea name="description" rows={3} placeholder="What needs to happen next?" /></FormField><Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create task"}</Button></form></DialogContent></Dialog>;
}

function FormField({ label, children }: { label: string; children: ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }

function BulkLifecycleDialog({ open, onOpenChange, count, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; count: number; pending: boolean; onSubmit: (lifecycleStatus: string) => void }) {
  const [status, setStatus] = useState("qualified");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Update {count} CRM contact{count === 1 ? "" : "s"}</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm leading-6 text-muted-foreground">This updates only native CRM contacts. Preserved legacy lead rows are excluded and remain unchanged. The operation and selection snapshot are recorded in the CRM audit log.</p><FormField label="New lifecycle status"><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="qualified">Qualified</SelectItem><SelectItem value="nurture">Nurture</SelectItem><SelectItem value="customer">Customer</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select></FormField><Button className="w-full" disabled={pending || count === 0} onClick={() => onSubmit(status)}>{pending ? "Updating…" : `Update ${count} contact${count === 1 ? "" : "s"}`}</Button></div></DialogContent></Dialog>;
}
