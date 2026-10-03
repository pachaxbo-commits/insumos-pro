"use client";

import Link from "next/link";
import { ArrowRight, Calendar, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatBoliviaDate } from "@/lib/date-time";
import type { PendingStageSummary } from "@/lib/operational-matrix/pending-work";
import { cn } from "@/lib/utils";

type AllPendingSummaryViewProps = {
  summary: PendingStageSummary;
  basePath?: string;
  mode?: string;
};

export function AllPendingSummaryView({
  summary,
  basePath = "/matriz-operativa",
  mode,
}: AllPendingSummaryViewProps) {
  const { stage, dates } = summary;

  let title = "";
  let description = "";
  let actionPrefix = "";

  if (stage === "preparacion") {
    title = "Resumen de todos los pedidos pendientes de preparación";
    description =
      "Para garantizar la integridad del inventario y las versiones de concurrencia, abre la jornada operativa de cada fecha para registrar la preparación.";
    actionPrefix = "Abrir preparación";
  } else if (stage === "entrega") {
    title = "Resumen de todos los pedidos listos para entrega";
    description =
      "Selecciona una fecha operativa para revisar pedidos preparados, registrar pesajes finales y confirmar las entregas de esa jornada.";
    actionPrefix = "Abrir entregas";
  } else {
    title = "Resumen de todas las fechas con provisión pendiente";
    description =
      "Para evitar cruzar costos de compra o pesajes reales entre compras de diferentes días, entra a la Hoja de Provisión de la fecha correspondiente.";
    actionPrefix = "Abrir Hoja de Provisión";
  }

  const buildDateUrl = (date: string) => {
    const params = new URLSearchParams();
    params.set("date", date);
    if (mode) params.set("mode", mode);
    return `${basePath}?${params.toString()}`;
  };

  if (!dates.length) {
    return (
      <Card className="rounded-xl border border-slate-200">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mb-2 size-8 text-emerald-600" />
          <p className="font-semibold text-foreground">
            No hay trabajo pendiente en esta etapa
          </p>
          <p className="mt-1 text-xs">
            Todas las órdenes registradas han completado esta etapa o han sido entregadas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4">
        {dates.map((group) => (
          <Card
            key={group.date}
            className={cn(
              "rounded-xl border shadow-2xs transition-shadow hover:shadow-xs",
              group.isOverdue
                ? "border-amber-300 bg-amber-50/30 dark:border-amber-900/60 dark:bg-amber-950/10"
                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950",
            )}
          >
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b p-3.5">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  {formatBoliviaDate(group.date)}
                </CardTitle>
                <Badge
                  variant={group.isOverdue ? "destructive" : "secondary"}
                  className="rounded-full text-[11px] font-medium"
                >
                  {group.orderCount} {group.orderCount === 1 ? "pedido" : "pedidos"}
                  {stage === "mercado" && group.productCount !== undefined
                    ? ` · ${group.productCount} productos`
                    : ""}
                </Badge>
                {group.isOverdue ? (
                  <Badge
                    variant="outline"
                    className="border-amber-400 bg-amber-100 text-amber-900 text-[10px] uppercase font-bold"
                  >
                    Atrasado
                  </Badge>
                ) : null}
              </div>

              <Button asChild size="sm" className="h-8 gap-1.5 text-xs font-medium">
                <Link href={buildDateUrl(group.date)}>
                  <span>
                    {actionPrefix} del {formatBoliviaDate(group.date, "short")}
                  </span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>

            <CardContent className="p-3">
              <div className="divide-y divide-slate-100 rounded-lg border bg-slate-50/50 text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/30">
                {group.orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 hover:bg-slate-100/60 dark:hover:bg-slate-800/40"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {order.customerName}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {order.publicReference}
                        </span>
                      </div>
                      {order.customerNotes ? (
                        <p className="text-[11px] text-muted-foreground italic">
                          &ldquo;{order.customerNotes}&rdquo;
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded bg-background px-2 py-0.5 text-[11px] font-medium border capitalize text-muted-foreground">
                        {order.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
