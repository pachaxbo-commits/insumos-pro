"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Layers } from "lucide-react";

import { formatChipDate } from "@/lib/date-time";
import type { PendingStageSummary } from "@/lib/operational-matrix/pending-work";
import { cn } from "@/lib/utils";

type PendingWorkBarProps = {
  summary: PendingStageSummary;
  currentDate: string;
  isAllPending: boolean;
  basePath?: string;
  mode?: string;
};

export function PendingWorkBar({
  summary,
  currentDate,
  isAllPending,
  basePath = "/matriz-operativa",
  mode,
}: PendingWorkBarProps) {
  const { stage, totalOrders, dates } = summary;

  // Build headline text
  let headline = "";
  if (stage === "preparacion") {
    headline =
      totalOrders === 0
        ? "Sin pedidos pendientes de preparación"
        : `${totalOrders} ${totalOrders === 1 ? "pedido pendiente" : "pedidos pendientes"} de preparación`;
  } else if (stage === "entrega") {
    headline =
      totalOrders === 0
        ? "Sin pedidos pendientes de entrega"
        : `${totalOrders} ${totalOrders === 1 ? "pedido listo" : "pedidos listos"} para entrega`;
  } else if (stage === "mercado") {
    headline =
      dates.length === 0
        ? "Sin provisiones pendientes"
        : `Provisiones pendientes · ${dates.length} ${dates.length === 1 ? "fecha" : "fechas"}`;
  }

  const buildUrl = (date?: string, allPending?: boolean) => {
    const params = new URLSearchParams();
    if (allPending) {
      params.set("allPending", "1");
    } else if (date) {
      params.set("date", date);
    }
    if (mode) {
      params.set("mode", mode);
    }
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  if (dates.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40">
        <CheckCircle2 className="size-4 text-emerald-600" />
        <span>{headline}</span>
      </div>
    );
  }

  const allPendingLabel =
    stage === "mercado"
      ? "VER TODOS LOS PENDIENTES"
      : `TODOS LOS PENDIENTES · ${totalOrders}`;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-amber-600 dark:text-amber-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">
            {headline}
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pulsa una fecha para abrir su jornada
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
        {dates.map((d) => {
          const isSelected = !isAllPending && currentDate === d.date;
          const countLabel =
            stage === "mercado" && d.productCount !== undefined
              ? `${d.productCount} ${d.productCount === 1 ? "producto" : "productos"}`
              : `${d.orderCount} ${d.orderCount === 1 ? "pedido" : "pedidos"}`;

          return (
            <Link
              key={d.date}
              href={buildUrl(d.date)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                isSelected
                  ? "border-emerald-700 bg-emerald-700 text-white shadow-xs dark:border-emerald-600 dark:bg-emerald-600"
                  : d.isOverdue
                    ? "border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-slate-200 bg-slate-50/60 text-slate-800 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200",
              )}
            >
              <span>{formatChipDate(d.date)}</span>
              <span className="opacity-60">·</span>
              <span>{countLabel}</span>
              {d.isOverdue ? (
                <>
                  <span className="opacity-60">·</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      isSelected
                        ? "bg-emerald-900/60 text-emerald-100"
                        : "bg-amber-200/90 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200",
                    )}
                  >
                    Atrasado
                  </span>
                </>
              ) : null}
            </Link>
          );
        })}

        <Link
          href={buildUrl(undefined, true)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
            isAllPending
              ? "border-emerald-700 bg-emerald-700 text-white shadow-xs dark:border-emerald-600 dark:bg-emerald-600"
              : "border-dashed border-slate-300 bg-slate-50/60 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
          )}
        >
          <Layers className="size-3.5" />
          <span>{allPendingLabel}</span>
        </Link>
      </div>
    </div>
  );
}
