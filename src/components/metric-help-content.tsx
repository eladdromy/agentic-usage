import { HarnessLogo } from "@/components/layout/harness-logo";
import type { ProjectSpendMonthLine } from "@/lib/projects-breakdown-shared";
import { formatProjectBreakdownUsd } from "@/lib/format";

function groupSpendLinesByMonth(
  lines: ProjectSpendMonthLine[],
): { month: string; monthLabel: string; lines: ProjectSpendMonthLine[] }[] {
  const order: string[] = [];
  const byMonth = new Map<string, ProjectSpendMonthLine[]>();

  for (const line of lines) {
    let bucket = byMonth.get(line.month);
    if (!bucket) {
      bucket = [];
      byMonth.set(line.month, bucket);
      order.push(line.month);
    }
    bucket.push(line);
  }

  return order.map((month) => {
    const monthLines = byMonth.get(month)!;
    return {
      month,
      monthLabel: monthLines[0]!.monthLabel,
      lines: monthLines,
    };
  });
}

function SpendCalcLine({ line }: { line: ProjectSpendMonthLine }) {
  return (
    <p className="flex items-center gap-1.5 font-mono text-xs leading-relaxed">
      <HarnessLogo harness={line.harness} className="size-3.5" />
      <span>
        ({line.projectApiEqLabel} ÷ {line.totalApiEqLabel}) × {line.planFeeLabel}{" "}
        = {line.spendLabel}
      </span>
    </p>
  );
}

const HELP = "space-y-2 text-left text-sm leading-relaxed text-neutral-900";

export function ProjectsSpendHelp() {
  return (
    <div className={HELP}>
      <p>Your share of the subscription fee, based on how much this project used each month.</p>
      <p className="font-medium">Per month, per harness:</p>
      <p className="font-mono text-xs leading-relaxed">
        month spend = (project API eq ÷ total API eq) × plan fee
      </p>
      <p className="font-medium">Example:</p>
      <p className="font-mono text-xs leading-relaxed">($10 ÷ $50) × $20 = $4</p>
      <p>
        Add up every month with activity. Projects in both Claude and Cursor sum each
        harness separately. Subscription tier only — not on-demand extras.
      </p>
      <p>Hover a spend value to see each month&apos;s calculation.</p>
    </div>
  );
}

export function ProjectSpendBreakdownTooltip({
  title,
  lines,
}: {
  title: string;
  lines: ProjectSpendMonthLine[];
}) {
  if (lines.length === 0) {
    return <p>No subscription allocation for this project.</p>;
  }

  const totalUsd = lines.reduce((sum, line) => sum + line.spendUsd, 0);
  const totalLabel = formatProjectBreakdownUsd(totalUsd);

  return (
    <div className="max-w-sm text-left">
      <p className="mb-2 font-semibold leading-snug">{title} Spend</p>
      <div className="max-h-48 space-y-2.5 overflow-y-auto pr-1">
        {groupSpendLinesByMonth(lines).map((group) => (
          <div key={group.month}>
            <p className="font-medium">{group.monthLabel}</p>
            <div className="mt-0.5 space-y-1">
              {group.lines.map((line) => (
                <SpendCalcLine key={line.harness} line={line} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-border/60 pt-2 font-medium">
        Total ={" "}
        <span className="font-mono text-xs">{totalLabel}</span>
      </p>
    </div>
  );
}

export function ProjectsApiEqHelp() {
  return (
    <div className={HELP}>
      <p>Total usage for this project at public API pay-as-you-go prices.</p>
      <p>Summed across all requests for this project.</p>
    </div>
  );
}

export function SpendLogsCostHelp() {
  return (
    <div className={HELP}>
      <p>What this single request actually cost you.</p>
      <p>
        <span className="font-medium">Included</span> — covered by your subscription.
      </p>
      <p>
        <span className="font-medium">$X</span> — on-demand charge from Claude logs or
        Cursor CSV.
      </p>
    </div>
  );
}

export function SpendLogsApiEqHelp() {
  return (
    <div className={HELP}>
      <p>What this request would cost at public API list prices.</p>
      <p>
        <span className="font-medium">~$X</span> — included usage; estimated from tokens.
      </p>
      <p>
        <span className="font-medium">$X</span> — on-demand row; exact billed amount.
      </p>
    </div>
  );
}
