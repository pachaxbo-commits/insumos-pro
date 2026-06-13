import { FileWarning, PackageSearch, ShoppingBasket } from "lucide-react";

import { AlertList } from "@/components/dashboard/alert-list";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  alerts,
  dashboardKpis,
  financeHighlights,
  inventoryMovements,
  operationalSummary,
  quickActions,
  recentSales,
  stockAlerts,
  topProducts,
} from "@/data/demo";
import { formatCurrency, formatNumber } from "@/lib/format";

export function DashboardOverview() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fase 1"
        title="Control diario para distribucion mayorista"
        description="Vista premium con datos demo para ventas, inventario, cuentas por cobrar y operacion comercial. Lista para evolucionar a logica real en Fase 2."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardKpis.map((item) => (
          <KpiCard key={item.title} item={item} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="overflow-hidden border-white/60 bg-[linear-gradient(135deg,rgba(19,41,75,0.96),rgba(30,80,86,0.92))] text-white shadow-lg shadow-slate-950/10">
          <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Resumen operativo</p>
                <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
                  Una base lista para convertir actividad diaria en decisiones.
                </h2>
                <p className="max-w-xl text-sm leading-6 text-white/72">
                  Esta primera fase prioriza velocidad de lectura, orden visual y una navegacion preparada para ventas, compras e inventario real.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <p className="text-sm text-white/70">Productos con stock bajo</p>
                  <p className="mt-2 font-heading text-3xl font-semibold">{operationalSummary.lowStockProducts}</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <p className="text-sm text-white/70">Pedidos pendientes</p>
                  <p className="mt-2 font-heading text-3xl font-semibold">{operationalSummary.pendingOrders}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {financeHighlights.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <p className="text-sm text-white/70">{item.label}</p>
                  <p className="mt-2 font-heading text-2xl font-semibold">{item.value}</p>
                  <p className="mt-1 text-sm text-white/65">{item.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {quickActions.map((action) => (
            <QuickActionCard key={action.title} action={action} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-heading text-xl font-semibold">Ultimas ventas</h2>
                <p className="text-sm text-muted-foreground">Actividad comercial reciente con estados demo de cobro.</p>
              </div>
            </div>
            <DataTable
              data={recentSales}
              columns={[
                {
                  key: "invoice",
                  header: "Venta",
                  render: (item) => (
                    <div>
                      <p className="font-medium">{item.id}</p>
                      <p className="text-sm text-muted-foreground">{item.customer}</p>
                    </div>
                  ),
                },
                {
                  key: "date",
                  header: "Fecha",
                  render: (item) => <span className="text-sm text-muted-foreground">{item.date}</span>,
                },
                {
                  key: "channel",
                  header: "Canal",
                  render: (item) => <span className="text-sm">{item.channel}</span>,
                },
                {
                  key: "amount",
                  header: "Monto",
                  className: "text-right",
                  render: (item) => <span className="font-medium">{formatCurrency(item.amount)}</span>,
                },
                {
                  key: "status",
                  header: "Estado",
                  render: (item) => <StatusBadge status={item.status} />,
                },
              ]}
            />
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="font-heading text-xl font-semibold">Ultimos movimientos de inventario</h2>
              <p className="text-sm text-muted-foreground">Entradas, salidas y ajustes recientes con datos demo.</p>
            </div>
            <DataTable
              data={inventoryMovements}
              columns={[
                {
                  key: "product",
                  header: "Producto",
                  render: (item) => (
                    <div>
                      <p className="font-medium">{item.product}</p>
                      <p className="text-sm text-muted-foreground">{item.warehouse}</p>
                    </div>
                  ),
                },
                {
                  key: "type",
                  header: "Tipo",
                  render: (item) => <StatusBadge status={item.type} />,
                },
                {
                  key: "quantity",
                  header: "Cantidad",
                  render: (item) => (
                    <span className="font-medium">
                      {formatNumber(item.quantity)} {item.unit}
                    </span>
                  ),
                },
                {
                  key: "date",
                  header: "Fecha",
                  render: (item) => <span className="text-sm text-muted-foreground">{item.date}</span>,
                },
              ]}
            />
          </div>
        </div>

        <div className="space-y-6">
          <AlertList items={alerts} />

          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Productos mas vendidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">#{index + 1} · {product.category}</p>
                      <h3 className="mt-1 font-medium">{product.name}</h3>
                    </div>
                    <p className="font-heading text-lg font-semibold">{formatCurrency(product.revenue)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{formatNumber(product.units)} unidades</span>
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-slate-900"
                        style={{ width: `${Math.min(product.units / 0.9, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Monitoreo critico</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {stockAlerts.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
                    <PackageSearch className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.product}</p>
                      <span className="text-sm font-semibold text-amber-700">
                        {item.stock}/{item.minimum}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.supplier}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/35 p-4">
                <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
                  <ShoppingBasket className="size-4" />
                </div>
                <div>
                  <p className="font-medium">Pedidos pendientes</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {operationalSummary.pendingOrders} solicitudes demo esperan confirmacion o despacho.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/35 p-4">
                <div className="rounded-xl bg-rose-50 p-2 text-rose-700">
                  <FileWarning className="size-4" />
                </div>
                <div>
                  <p className="font-medium">Cartera a revisar</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    2 clientes concentran la mayor parte de cobranza pendiente demo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
