# Sales CRM Removal Report

## Scope

The standalone **Sales CRM** section was removed from the existing InsightOS application. The change was limited to the CRM route surfaces, their generated route metadata, the sidebar entry, and the canonical permission catalog. Existing DM Setter, Inbound Dialer, Closer, EOD Reports, Legacy Leads, Clients, and other dashboards were preserved.

## Removed surfaces

| Surface | Action |
|---|---|
| `/sales` | Deleted the standalone Sales CRM page route. |
| `/sales/inbox` | Deleted the Sales CRM inbox route. |
| `/sales/contacts/$id` | Deleted the Sales CRM contact-detail route. |
| Generated route tree | Regenerated through the existing build pipeline; the deleted Sales CRM paths no longer appear in `src/routeTree.gen.ts`. |
| Sidebar | Removed the Sales CRM item from the Sales & Clients accordion. The remaining Legacy Leads, EOD Reports, and rep workflows remain available. |
| Permission catalog | Removed the `sales_crm` resource and removed it from setter/closer default permission matrices. |

The internal CRM foundation server modules were not deleted because they are implementation-layer code and may be needed for future work or migration safety; they are no longer exposed as a Sales CRM route or navigation section. Existing Leads CRM references remain intentionally preserved because they are a separate legacy Leads surface, not the removed Sales CRM section.

## Validation

| Check | Result |
|---|---:|
| Prettier | Passed |
| Focused ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Development build | Passed |
| Full test suite | 16 files, 91 tests passed |
| `git diff --check` | Passed |
| User-facing route/reference scan | No `Sales CRM`, `sales_crm`, or `/sales` references remain in route, sidebar, or permission UI code |

The authenticated browser reached the dashboard route on the refreshed preview, but its screenshot/DOM capture did not load, so click-level visual confirmation of the sidebar could not be completed. No production data, production configuration, or `main` branch was touched.
