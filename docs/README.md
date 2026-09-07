# Documentation

| Doc | Description |
|-----|-------------|
| [architecture.md](./architecture.md) | System design and dual-harness data flow |
| [claude-log-parsing.md](./claude-log-parsing.md) | How Claude Code JSONL is parsed |
| [cursor-provider-usage-csv.md](./cursor-provider-usage-csv.md) | Billing CSV import, spend, leverage, export links |
| [plan-pricing.md](./plan-pricing.md) | Subscription plan mapping and overrides |

## Key source files

| Area | Path |
|------|------|
| Harness settings | `src/lib/profile/settings.ts`, `src/lib/profile/plan-tiers.ts` |
| Claude JSONL sync | `src/lib/db/usage-db.ts` |
| Billing CSV | `src/lib/cursor/provider-usage-db.ts` |
| CSV coverage / export URLs | `src/lib/cursor/billing-coverage.ts` |
| Cursor subscription profile | `src/lib/cursor/cursor-profile.ts` |
| Usage extraction (Claude) | `src/lib/claude/usage-from-record.ts` |
| Cost calculation | `src/lib/pricing/usage-cost.ts`, `src/lib/pricing/cursor-usage-cost.ts` |
| Spend Logs UI | `src/components/raw-spend/` |
| Projects breakdown UI | `src/components/projects-breakdown/`, `src/lib/projects-breakdown-shared.ts`, `src/lib/projects-breakdown-spend.ts`, `GET /api/projects-breakdown` |
| App shell / harness switch | `src/components/app-shell.tsx`, `src/components/layout/harness-select.tsx`, `src/components/layout/harness-logo.tsx`, `public/logos/` |
| Page loading skeletons | `src/components/layout/page-loading-skeletons.tsx` |
| Merged spend (all harnesses) | `src/lib/raw-spend-all.ts` |
| Spend Logs filters | `src/components/filters.tsx`, `GET /api/raw-spend/projects`, `GET /api/raw-spend/models` |
| Plan Leverage UI | `src/components/plan-leverage/` (table, sparkline, summary share/export) |
| Billing upload UI | `src/components/cursor/` |
