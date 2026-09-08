# First-run onboarding

Blocking setup wizard at `/setup` for new installs. Guides harness detection, data import, and subscription confirmation before Plan Leverage and other analytics pages unlock.

## Gate

| Condition | Behavior |
|-----------|----------|
| `onboardingCompletedAt` set in `.data/settings.json` | App unlocked |
| Legacy install with Claude events or Cursor CSV rows already in SQLite | Skips wizard (migration) |
| Otherwise | Redirect from `(app)/*` routes to `/setup` |

Completion requires **at least one harness ready**:

| Harness | Ready when |
|---------|------------|
| Claude | `claude_usage_events` count > 0 **and** `onboardingClaudeSubscriptionApproved` |
| Cursor | Billing CSV imported **and** project sync done **and** `onboardingCursorSubscriptionApproved` |

## Harness detection (no bubbles)

Fast local checks via `GET /api/onboarding/status`:

| Signal | Source |
|--------|--------|
| Claude installed | Claude config dir exists (default `~/.claude`; override via `claudeHomeOverride`, `CLAUDE_CONFIG_DIR`, or legacy `CLAUDE_HOME`) |
| Claude log files | Directory walk for `*.jsonl` under Claude home |
| Cursor installed | `state.vscdb` exists (or `vscdbPathOverride` / `VSCDB_PATH`) |
| Claude indexed | Row count in `agentic-usage.db` |
| Cursor CSV | Row count in `cursor-provider-usage.db` |

Suggested flow: `both` | `claude` | `cursor` | `none`.

## Setup routes

| Route | Purpose |
|-------|---------|
| `/setup` | Welcome + detected harness summary |
| `/setup/paths` | Manual Claude home / vscdb overrides when none detected |
| `/setup/claude/sync` | Auto full JSONL index |
| `/setup/claude/subscription` | Per-month plan review + approve |
| `/setup/cursor/offer` | Both-flow: set up Cursor or skip |
| `/setup/cursor/upload` | Billing CSV upload (**does not** start project sync) |
| `/setup/cursor/sync` | Project attach — **required** after upload; auto-starts background sync |
| `/setup/cursor/subscription` | Per-month plan review + approve |
| `/setup/complete` | Finalize settings → redirect `/leverage` |

## Branching flows

**Claude only:** sync → subscription → complete

**Cursor only:** upload → sync → subscription → complete

**Both:** Claude path → offer → (Cursor path or skip)

When Cursor is skipped in a both-flow, `activeHarness` is set to `all`, `onboardingDeferredCursor` is true, and Plan Leverage shows a banner linking to Settings → Billing CSV.

## Settings fields

Stored in `.data/settings.json`:

```typescript
onboardingCompletedAt: string | null;
onboardingClaudeSubscriptionApproved: boolean;
onboardingCursorSubscriptionApproved: boolean;
onboardingCursorProjectSyncDone: boolean;
onboardingDeferredCursor: boolean;
```

## Key source files

| Area | Path |
|------|------|
| Status / readiness | `src/lib/onboarding/status.ts` |
| Step routing | `src/lib/onboarding/navigation.ts` |
| Setup UI | `src/components/setup/`, `src/app/setup/` |
| Redirect guard | `src/app/(app)/layout.tsx`, `src/app/setup/layout.tsx` |
| Shared subscription step | `src/components/settings/subscription-plan-review.tsx` |
| Shared CSV upload | `src/components/cursor/cursor-csv-upload-panel.tsx` |
| Dynamic harness badge | `src/components/layout/harness-select.tsx` |
| Cursor setup banner (global) | `src/components/cursor/cursor-setup-banner-gate.tsx`, `src/components/cursor/cursor-deferred-banner.tsx` |

## Cursor project sync pitfalls

Onboarding **upload** and **sync** are separate steps. Until `/setup/cursor/sync` finishes, all billing rows are **pending** (not unmatched) — Settings may show thousands “need matching.” That is expected.

After `npm run reset:cursor`, **restart the dev server** before re-uploading; otherwise bubble prep can fail and mark every row `no_local_prompts`. Full playbook: [cursor-project-sync-troubleshooting.md](./cursor-project-sync-troubleshooting.md).
