# Plan pricing

Agentic Usage divides monthly billed/API-equivalent spend by your subscription price. **Claude** and **Cursor** use different auto-detection sources.

## Claude (Claude Code harness)

Reads subscription hints from `~/.claude.json` → `oauthAccount`.

| Signal | Label | $/mo |
|--------|-------|------|
| `organizationType` contains `pro` (e.g. `claude_pro`) | Pro | $20 |
| `organizationType` / rate tier Max + `5x` | Max 5× | $100 |
| `organizationType` / rate tier Max + `20x` | Max 20× | $200 |
| `seatTier: pro` (fallback) | Pro | $20 |
| Team standard | Team Standard | $25 |
| Team premium | Team Premium | $125 |
| Free | Free | $0 |

Sources: [Anthropic plan pricing](https://support.claude.com/en/articles/11049762-choose-a-claude-plan)

Annual Pro ($17/mo effective) defaults to **$20/mo** unless overridden.

Implementation: `detectClaudePlanFromProfile()` in `src/lib/profile/settings.ts`

## Cursor (Cursor harness)

Reads subscription from Cursor IDE **`state.vscdb` → `ItemTable`** (same keys as Agentic_Usage profile):

| ItemTable key | Fields |
|---------------|--------|
| `cursorAuth/stripeMembershipType` | Primary tier id (e.g. `pro_plus`) |
| `cursorAuth/stripeSubscriptionStatus` | Stripe status |
| `applicationUser` (reactive storage) | `membershipType`, `subscriptionStatus`, `isEnterprise` |
| `workbench.experiments.statsigBootstrap` | Fallback Stripe tier fields |

| Detected tier | Label | $/mo |
|---------------|-------|------|
| `pro` | Pro | $20 |
| `pro_plus` / Pro+ | Pro+ | $60 |
| `ultra` | Ultra | $200 |
| Teams / business | Teams | $40 |
| Teams premium | Teams Premium | $120 |
| hobby / free | Hobby | $0 |
| enterprise | — | Manual override required |

Sources: [Cursor pricing](https://cursor.com/pricing)

Implementation: `src/lib/cursor/cursor-profile.ts` → `detectCursorPlanFromProfile()`

## Manual override

Settings stores **per-harness, per-month** overrides in `.data/settings.json`:

```json
{
  "planOverrides": {
    "claude": {
      "2025-01": { "tierId": "pro", "label": "Pro", "monthlyUsd": 20 },
      "2025-03": { "tierId": "max-5x", "label": "Max 5×", "monthlyUsd": 100 }
    },
    "cursor": {
      "2025-02": { "tierId": "pro-plus", "label": "Pro+", "monthlyUsd": 60 }
    }
  }
}
```

Configure in **Settings → Subscription**. For each month with usage data, pick a preset tier (Claude or Cursor list prices), **Auto-detected**, or **Custom** with your own label and base $/mo.

Legacy single-plan fields (`planMonthlyUsd`, `planLabel`, `planSource: "manual"`) still apply as a fallback when no monthly override exists for that month.

`resolvePlanConfig(harness, month?)` checks monthly override first, then auto-detection for that harness.

## Leverage formula

```
leverage = monthly_api_equivalent_usd / effective_monthly_cost
```

**Claude:** `effective_monthly_cost` = plan price + on-demand dollars from JSONL (`costUSD` on assistant messages) for that month.

**Cursor:** `effective_monthly_cost` = plan price + on-demand dollars from CSV (`Cost` column) for that month.

Displayed as a multiplier, e.g. `×3,936` or `×23.4` (up to one decimal place, with thousands separators).

If plan is $0 (Free/Hobby), leverage shows `—`.

## Display formatting (Leverage page)

| Column | Format |
|--------|--------|
| **Plan leverage** | Multiplier with thousands separators; up to one decimal (e.g. `×3,936`, `×12.4`) |
| **Spend**, **API eq.**, **Plan exposure** | Whole dollars, rounded up, with thousands separators (e.g. `$3,936`) |

Other pages (Spend Logs, Settings) keep the general `formatCostUsd` rules (variable decimals by magnitude).

## Plan exposure

```
plan_exposure = max(0, api_equivalent_usd − plan_spend_usd)
```

**Spend** is subscription fees plus on-demand charges for the period. **Plan exposure** is the positive gap between API list-price usage and what you actually paid — the upside you would lose if suppliers stopped subsidizing included usage or you switched to pay-as-you-go API billing. When spend exceeds API eq., exposure is **$0**.

Shown in the year summary card (with monthly trend sparklines) and harness breakdown table on the Leverage page.
