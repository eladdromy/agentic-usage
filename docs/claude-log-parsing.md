# Claude log parsing

## Source files

Claude Code writes JSONL under:

```
~/.claude/projects/<project-slug>/<session-id>.jsonl
~/.claude/projects/<project-slug>/<session-id>/subagents/<name>.jsonl
```

Override root with `CLAUDE_HOME`.

## Project slugs

Claude encodes absolute project paths into directory slugs by replacing `/`, spaces, and `_` in each segment with `-`, then joining segments with `-` and prefixing `-` (e.g. `/Users/eladd/General Code/Apt_Rental` → `-Users-eladd-General-Code-Apt-Rental`).

Naive hyphen-to-slash decoding is ambiguous (`Apt-Rental` vs `Apt` + `Rental`). - `src/lib/claude/project-slugs.ts` — resolve slug → path via `~/.claude.json`
- `src/lib/claude/path.ts` — encode path → slug

## Indexed rows

Only lines matching:

- `type === "assistant"`
- `message.usage` present
- `message.model` non-empty
- At least one non-zero token bucket among input, cache write, cache read, or output (all-zero usage lines are skipped)

## Token columns

| DB column | JSONL field |
|-----------|-------------|
| `input_without_cache_write` | `message.usage.input_tokens` |
| `input_with_cache_write` | `message.usage.cache_creation_input_tokens` |
| `cache_create_5m` | `message.usage.cache_creation.ephemeral_5m_input_tokens` |
| `cache_create_1h` | `message.usage.cache_creation.ephemeral_1h_input_tokens` |
| `cache_read` | `message.usage.cache_read_input_tokens` |
| `output_tokens` | `message.usage.output_tokens` |
| `cost_usd` | top-level `costUSD` when present |
| `calculated_cost_usd` | token pricing estimate at index time |

## Spend Logs columns

| Column | Included usage | On-demand (`costUSD` > 0) |
|--------|----------------|---------------------------|
| **Spend** | `Included` | `$X` from log |
| **API eq.** | `~$X` token estimate | `$X` (same as Spend) |

## Cost

When `costUSD` is absent, calculated cost uses token buckets × model rates in `src/lib/pricing/model-pricing.ts` (ccusage-aligned formula).

## Key modules

- `src/lib/claude/discovery.ts` — find JSONL files
- `src/lib/claude/usage-from-record.ts` — parse one line
- `src/lib/db/usage-db.ts` — index + query
