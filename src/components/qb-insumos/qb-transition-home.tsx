import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { QbInsumosBrand } from "@/components/branding/qb-insumos-brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { TransitionModule } from "@/lib/qb-insumos/transition-policy";
import type { QbReportsData } from "@/types/reports";

type QbTransitionHomeProps = {
  activeModules: TransitionModule[];
  reportsData?: QbReportsData;
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function SummaryTile({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof ClipboardList;
}) {
  return (
    <Card className="border-white/60 bg-white/82 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <CardTitle className="mt-1 text-2xl">{value}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}

export function QbTransitionHome({ activeModules, reportsData }: QbTransitionHomeProps) {
  const summary = reportsData?.summary;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-white/60 bg-white/82 p-6 shadow-sm md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <QbInsumosBrand showSubtitle variant="hero" />
            <div className="space-y-3">
              <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-800">
                Inicio operativo QB
              </Badge>
              <h1 className="max-w-2xl font-heading text-4xl font-semibold tracking-tight">
                Gestion de pedidos, inventario y recibos acumulativos
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                Resumen de operacion QB Insumos sin ventas legacy, caja, pagos, CxC ni CxP.
                Los modulos incompatibles siguen suspendidos por ruta.
              </p>
            </div>
          </div>

          <Card className="border-emerald-100 bg-emerald-50/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-950">
                <ShieldCheck className="size-5" />
                Estado de transicion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-emerald-950/75">
              <p>Sin metricas financieras.</p>
              <p>Sin datos de ventas, caja, pagos, CxC ni CxP.</p>
              <p>Reportes e inicio usan solo tablas operativas QB.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {summary ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile
            title="Pendientes de preparacion"
            value={formatNumber(summary.pendingPreparation)}
            detail={`${formatNumber(summary.inPreparation)} en preparacion`}
            icon={ClipboardList}
          />
          <SummaryTile
            title="Preparados"
            value={formatNumber(summary.prepared)}
            detail={`${formatNumber(summary.deliveredPendingReceipt)} entregados pendientes de recibo`}
            icon={PackageCheck}
          />
          <SummaryTile
            title="Recibos en borrador"
            value={formatNumber(summary.draftReceipts)}
            detail={`Total en recibos emitidos: ${formatCurrency(summary.issuedReceiptTotalInPeriod)}`}
            icon={ReceiptText}
          />
          <SummaryTile
            title="Productos con alerta"
            value={formatNumber(summary.lowStockProducts + summary.outOfStockProducts)}
            detail={`${formatNumber(summary.outOfStockProducts)} sin stock o por regularizar`}
            icon={PackageSearch}
          />
        </section>
      ) : null}

      {reportsData ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="border-white/60 bg-white/82 shadow-sm">
            <CardHeader>
              <CardTitle>Ultimos pedidos recibidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportsData.orders.slice(0, 5).map((order) => (
                <div key={order.id} className="rounded-lg border bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{order.customer}</p>
                      <p className="text-xs text-muted-foreground">{order.reference} - {formatDate(order.date)}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {order.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{order.requestedProducts}</p>
                </div>
              ))}
              {!reportsData.orders.length ? (
                <p className="rounded-lg border border-dashed bg-muted/35 p-4 text-sm text-muted-foreground">
                  Todavia no hay pedidos QB para mostrar.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-white/82 shadow-sm">
            <CardHeader>
              <CardTitle>Ingresos recientes de mercaderia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportsData.merchandiseReceipts.slice(0, 5).map((receipt) => (
                <div key={receipt.id} className="rounded-lg border bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{receipt.product}</p>
                      <p className="text-xs text-muted-foreground">{receipt.supplierOrOrigin} - {formatDate(receipt.date)}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {receipt.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatNumber(receipt.baseQuantity)} {receipt.baseUnit}
                  </p>
                </div>
              ))}
              {!reportsData.merchandiseReceipts.length ? (
                <p className="rounded-lg border border-dashed bg-muted/35 p-4 text-sm text-muted-foreground">
                  Todavia no hay ingresos QB para mostrar.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-white/60 bg-white/80 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-800" />
              Visible ahora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeModules.map((module) => (
              <Button
                key={module.id}
                asChild
                variant="outline"
                className="h-auto w-full justify-between rounded-xl py-3"
              >
                <Link href={module.href ?? "/"}>
                  <span>{module.title}</span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-white/80 shadow-sm md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Alcance QB-1
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm leading-6 text-muted-foreground md:grid-cols-2">
            <p>Rebranding visual a QB Insumos.</p>
            <p>Congelamiento visual y por ruta de modulos legado.</p>
            <p>Navegacion temporal simplificada.</p>
            <p>Documentacion de roles y estados objetivo sin activar nuevos flujos.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
