"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function dateParamToDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function dateToParam(date: Date | undefined): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  "aria-label": string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = dateParamToDate(value);
  const minDate = dateParamToDate(min);
  const maxDate = dateParamToDate(max);
  const disabledMatchers = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        render={
          <Button
            variant="outline"
            data-empty={!selected}
            className={cn(
              "w-[9.5rem] justify-start gap-2 rounded-xl border-border/60 bg-card/80 px-2.5 text-left font-normal tabular-nums data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon size={16} aria-hidden="true" />
        {selected ? format(selected, "MMM d, yyyy") : <span>{placeholder}</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(dateToParam(date));
            setOpen(false);
          }}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

export type DateRangePickerProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
  "aria-label": string;
};

export function formatRangeLabel(from: string, to: string): string {
  const fromDate = dateParamToDate(from);
  const toDate = dateParamToDate(to);
  if (fromDate && toDate) {
    return `${format(fromDate, "MMM d, yyyy")} → ${format(toDate, "MMM d, yyyy")}`;
  }
  if (fromDate) {
    return `${format(fromDate, "MMM d, yyyy")} → …`;
  }
  return "Pick dates";
}

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  "aria-label": ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const fromDate = dateParamToDate(from);
  const toDate = dateParamToDate(to);
  const selected: DateRange | undefined =
    fromDate || toDate
      ? { from: fromDate, to: toDate }
      : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        render={
          <Button
            variant="outline"
            data-empty={!fromDate && !toDate}
            className={cn(
              "min-w-[15rem] justify-start gap-2 rounded-xl border-border/60 bg-card/80 px-2.5 text-left font-normal tabular-nums data-[empty=true]:text-muted-foreground",
              className,
            )}
          />
        }
      >
        <CalendarIcon size={16} aria-hidden="true" />
        <span>{formatRangeLabel(from, to)}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={selected}
          defaultMonth={fromDate ?? toDate}
          onSelect={(range) => {
            if (!range?.from) return;
            const nextFrom = dateToParam(range.from);
            const nextTo = dateToParam(range.to ?? range.from);
            onChange(nextFrom, nextTo);
            if (range.to) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export type CustomRangePopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor?: React.RefObject<Element | null>;
  initialFrom: string;
  initialTo: string;
  onApply: (from: string, to: string) => void;
};

export function CustomRangePopover({
  open,
  onOpenChange,
  anchor,
  initialFrom,
  initialTo,
  onApply,
}: CustomRangePopoverProps) {
  const [draftFrom, setDraftFrom] = React.useState(initialFrom);
  const [draftTo, setDraftTo] = React.useState(initialTo);

  React.useEffect(() => {
    if (!open) return;
    setDraftFrom(initialFrom);
    setDraftTo(initialTo);
  }, [initialFrom, initialTo, open]);

  const draftFromDate = dateParamToDate(draftFrom);
  const draftToDate = dateParamToDate(draftTo);
  const draftRange: DateRange | undefined =
    draftFromDate || draftToDate
      ? { from: draftFromDate, to: draftToDate }
      : undefined;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent anchor={anchor} align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={draftRange}
          defaultMonth={draftFromDate ?? draftToDate}
          onSelect={(range) => {
            if (!range?.from) return;
            setDraftFrom(dateToParam(range.from));
            setDraftTo(dateToParam(range.to ?? range.from));
          }}
        />
        <div className="flex justify-end gap-2 border-t border-border/60 p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!draftFrom || !draftTo}
            onClick={() => {
              onApply(draftFrom, draftTo);
              onOpenChange(false);
            }}
          >
            Select
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
