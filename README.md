# Plan Leverage

Local-only viewer for agent token spending and plan leverage. Supports **Claude Code** and **Cursor** harnesses.

## Quick start

```bash
git clone <repo-url>
cd plan-leverage
npm install
npm run dev
```

Open [http://localhost:3000/raw-spend](http://localhost:3000/raw-spend).

Or auto-open the browser:

```bash
npm run dev:open
```

**Requirements:** Node 20+, and at least one of:

- Claude Code (`~/.claude/`) for the Claude harness
- Cursor IDE with global `state.vscdb` for the Cursor harness

Switch harness in **Settings**. For Cursor costs, upload your account **usage-events** CSV from the billing dashboard.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAUDE_HOME` | `~/.claude` | Claude Code data directory |
| `VSCDB_PATH` | Cursor global `state.vscdb` | Override Cursor DB path |
| `PLAN_LEVERAGE_DATA_DIR` | `./.data` | SQLite index + settings |

## Pages

- **Spend Logs** — per-request spend (Claude from JSONL; Cursor from uploaded usage-events CSV)
- **Plan Leverage** — monthly spend ÷ plan price
- **Settings** — harness switch, plan override, CSV upload (Cursor), re-index (Claude)

## Docs

See [docs/README.md](./docs/README.md).

## License

MIT
