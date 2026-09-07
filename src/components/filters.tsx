"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import {
  CustomRangePopover,
  formatRangeLabel,
} from "@/components/ui/date-picker";
import { useRouteSync } from "@/components/layout/route-sync";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { RawSpendModelOption } from "@/lib/raw-spend-models";
import type { RawSpendProjectOption } from "@/lib/raw-spend-projects";
import {
  defaultCustomDateRange,
  type TimeframePreset,
} from "@/lib/timeframe";
import { cn } from "@/lib/utils";

const PRESETS: { value: TimeframePreset; label: string }[] = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

const ALL_PROJECTS: RawSpendProjectOption = {
  value: "",
  label: "All projects",
  detail: null,
};

const ALL_MODELS: RawSpendModelOption = {
  value: "",
  label: "All models",
};

function selectedLabel(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function resolveCurrentPreset(params: URLSearchParams): TimeframePreset {
  const preset = params.get("timeframe");
  if (preset === "custom" || params.get("from") || params.get("to")) {
    return "custom";
  }
  if (preset === "7d" || preset === "30d" || preset === "all") {
    return preset;
  }
  return "30d";
}

export function hasActiveSpendFilters(params: URLSearchParams): boolean {
  if (params.get("project")) return true;
  if (params.get("model")) return true;
  const preset = params.get("timeframe");
  if (preset === "7d" || preset === "all" || preset === "custom") return true;
  if (params.get("from") || params.get("to")) return true;
  return false;
}

function replaceSearchParams(
  router: ReturnType<typeof useRouter>,
  params: URLSearchParams,
  next: URLSearchParams,
) {
  next.delete("page");
  router.replace(`?${next.toString()}`);
}

export function TimeframeFilter() {
  const router = useRouter();
  const params = useSearchParams();
  const triggerRef = useRef<HTMLDivElement>(null);
  const current = resolveCurrentPreset(params);
  const isCustom = current === "custom";
  const defaults = defaultCustomDateRange();
  const from = params.get("from") ?? (isCustom ? defaults.from : "");
  const to = params.get("to") ?? (isCustom ? defaults.to : "");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeDraft, setRangeDraft] = useState(defaults);

  useEffect(() => {
    if (!isCustom || (params.get("from") && params.get("to"))) return;

    const range = defaultCustomDateRange();
    const next = new URLSearchParams(params.toString());
    next.set("timeframe", "custom");
    if (!next.get("from")) next.set("from", range.from);
    if (!next.get("to")) next.set("to", range.to);
    replaceSearchParams(router, params, next);
  }, [isCustom, params, router]);

  function openRangePicker() {
    const range = defaultCustomDateRange();
    setRangeDraft({
      from: isCustom && from ? from : range.from,
      to: isCustom && to ? to : range.to,
    });
    setRangeOpen(true);
  }

  function setPreset(preset: string | null) {
    if (!preset) return;

    if (preset === "custom") {
      openRangePicker();
      return;
    }

    const next = new URLSearchParams(params.toString());
    next.set("timeframe", preset as TimeframePreset);
    next.delete("from");
    next.delete("to");
    replaceSearchParams(router, params, next);
  }

  function applyCustomRange(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString());
    next.set("timeframe", "custom");
    next.set("from", nextFrom);
    next.set("to", nextTo);
    replaceSearchParams(router, params, next);
    setRangeOpen(false);
  }

  return (
    <>
      <div ref={triggerRef} className="w-fit">
        <Select value={current} onValueChange={setPreset}>
          <SelectTrigger
            className={cn(
              "rounded-xl border-border/60 bg-card/80",
              isCustom ? "min-w-[10.5rem] max-w-[20rem]" : "w-[10.5rem]",
            )}
          >
            {isCustom
              ? formatRangeLabel(from, to)
              : selectedLabel(PRESETS, current)}
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((preset) => (
              <SelectItem
                key={preset.value}
                value={preset.value}
                onClick={
                  preset.value === "custom" && isCustom
                    ? () => openRangePicker()
                    : undefined
                }
              >
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CustomRangePopover
        open={rangeOpen}
        onOpenChange={setRangeOpen}
        anchor={triggerRef}
        initialFrom={rangeDraft.from}
        initialTo={rangeDraft.to}
        onApply={applyCustomRange}
      />
    </>
  );
}

export function ProjectLabelFilter({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const { syncVersion, activeHarness } = useRouteSync();
  const current = params.get("project") ?? "";
  const [projects, setProjects] = useState<RawSpendProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/raw-spend/projects");
        if (!res.ok) throw new Error("Failed to load projects");
        const json = (await res.json()) as { projects: RawSpendProjectOption[] };
        if (!cancelled) setProjects(json.projects);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeHarness, refreshKey, syncVersion]);

  const items = useMemo(() => [ALL_PROJECTS, ...projects], [projects]);

  const selected = useMemo(
    () => items.find((project) => project.value === current) ?? ALL_PROJECTS,
    [current, items],
  );

  const setProject = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("project", value);
      else next.delete("project");
      replaceSearchParams(router, params, next);
    },
    [params, router],
  );

  return (
    <Combobox
      items={items}
      value={selected}
      disabled={loading}
      itemToStringValue={(project) =>
        `${project.label} ${project.detail ?? ""}`.trim()
      }
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(project) => {
        if (!project) return;
        setProject(project.value || null);
      }}
    >
      <ComboboxTrigger
        aria-label="Filter by project"
        render={
          <Button
            variant="outline"
            className="h-8 min-w-[10.5rem] justify-between gap-2 rounded-xl border-border/60 bg-card/80 px-2.5 font-normal"
          />
        }
      >
        <ComboboxValue />
      </ComboboxTrigger>
      <ComboboxContent align="start" className="min-w-[18rem]">
        <ComboboxInput
          showTrigger={false}
          placeholder="Search projects…"
          autoComplete="off"
        />
        <ComboboxEmpty>
          {loading ? "Loading projects…" : "No projects found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(project) => {
            const showDetail =
              project.detail &&
              project.detail !== "—" &&
              project.detail !== project.label;

            return (
              <ComboboxItem
                key={project.value || "__all__"}
                value={project}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{project.label}</span>
                  {showDetail ? (
                    <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                      {project.detail}
                    </span>
                  ) : null}
                </span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function ModelFilter({ refreshKey = 0 }: { refreshKey?: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const { syncVersion, activeHarness } = useRouteSync();
  const current = params.get("model") ?? "";
  const [models, setModels] = useState<RawSpendModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/raw-spend/models");
        if (!res.ok) throw new Error("Failed to load models");
        const json = (await res.json()) as { models: RawSpendModelOption[] };
        if (!cancelled) setModels(json.models);
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [activeHarness, refreshKey, syncVersion]);

  const items = useMemo(() => [ALL_MODELS, ...models], [models]);

  const selected = useMemo(
    () => items.find((model) => model.value === current) ?? ALL_MODELS,
    [current, items],
  );

  const setModel = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set("model", value);
      else next.delete("model");
      replaceSearchParams(router, params, next);
    },
    [params, router],
  );

  return (
    <Combobox
      items={items}
      value={selected}
      disabled={loading}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(model) => {
        if (!model) return;
        setModel(model.value || null);
      }}
    >
      <ComboboxTrigger
        aria-label="Filter by model"
        render={
          <Button
            variant="outline"
            className="h-8 w-[10.5rem] max-w-[10.5rem] justify-between gap-2 overflow-hidden rounded-xl border-border/60 bg-card/80 px-2.5 font-normal"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">
          <ComboboxValue />
        </span>
      </ComboboxTrigger>
      <ComboboxContent align="start" className="min-w-[16rem]">
        <ComboboxInput
          showTrigger={false}
          placeholder="Search models…"
          autoComplete="off"
        />
        <ComboboxEmpty>
          {loading ? "Loading models…" : "No models found."}
        </ComboboxEmpty>
        <ComboboxList>
          {(model) => (
            <ComboboxItem key={model.value || "__all__"} value={model}>
              <span className="truncate font-medium">{model.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function SortFilter({
  options,
  param = "sort",
  triggerClassName,
}: {
  options: { value: string; label: string }[];
  param?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get(param) ?? options[0]?.value ?? "";

  function setSort(value: string | null) {
    if (!value) return;
    const next = new URLSearchParams(params.toString());
    next.set(param, value);
    replaceSearchParams(router, params, next);
  }

  return (
    <Select value={current} onValueChange={setSort}>
      <SelectTrigger
        className={cn(
          "w-[10.5rem] rounded-xl border-border/60 bg-card/80",
          triggerClassName,
        )}
      >
        {selectedLabel(options, current)}
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
