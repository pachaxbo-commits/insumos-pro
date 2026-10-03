"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperationalDateFilter({
  currentDate,
  mode,
  basePath = "/matriz-operativa",
  label = "Fecha operativa (Bolivia)",
}: {
  currentDate: string;
  mode?: string;
  basePath?: string;
  label?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleDateChange = (newDate: string) => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", newDate);
      params.delete("fecha");
      params.delete("allPending");
      if (mode) {
        params.set("mode", mode);
      }
      router.push(`${basePath}?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label
          htmlFor="operational-date-filter-input"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Calendar className="size-3.5 text-primary" />
          {label}
        </Label>
        <div className="relative">
          <Input
            id="operational-date-filter-input"
            name="date"
            type="date"
            defaultValue={currentDate}
            key={currentDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-10 w-44 rounded-md border bg-background px-3 text-sm font-medium shadow-xs focus-visible:ring-1"
          />
          {isPending ? (
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
