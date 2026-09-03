# Desktop Compact-Density Rollback Report

## Restored checkpoint

The project was restored to the working-tree state immediately before the most recent prompt requesting a global desktop UI scale equivalent to 75% browser zoom. Because the repository contains multiple earlier uncommitted InsightOS implementation passes, the rollback was intentionally limited to the exact compact-density changes introduced by that prompt rather than resetting the entire working tree.

## Reverted visual-only changes

| File | Restored state |
|---|---|
| `src/styles.css` | Removed the appended desktop compact-density media-query block, including reduced desktop spacing/type tokens, compact shell overrides, compact control sizing, section rhythm overrides, and reduced chart-height hooks. |
| `src/routes/_authenticated.tsx` | Removed the compact-mode `app-shell` class and `data-sidebar-collapsed` attribute; restored the previous authenticated shell markup. |
| `src/components/app-sidebar.tsx` | Removed the compact-mode `data-collapsed` attribute; restored the previous sidebar markup and normal sizing behavior. |
| `desktop-compact-density-report.md` | Removed the report artifact created by the compact-density pass. |

No route, dashboard, data, integration, permission, navigation, business logic, or production configuration changes were reverted as part of this operation. The pre-existing `package-lock.json` modification and all earlier feature work were left untouched.

## Validation

| Check | Result |
|---|---:|
| Prettier | Passed |
| Focused ESLint | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Development build | Passed |
| Full test suite | 16 files, 91 tests passed |
| `git diff --check` | Passed |
| Compact hooks remaining in restored files | None |

## Browser verification

The Main Hub route at `/dashboard` remained reachable at normal browser zoom on the isolated preview after the rollback. The browser artifact collector did not provide a screenshot, so visual confirmation is based on the exact source-level removal of the compact token block and shell hooks plus successful route response. The restored implementation is the pre-compact visual state, including its original type scale, spacing scale, sidebar width, header sizing, card dimensions, and responsive rules.
