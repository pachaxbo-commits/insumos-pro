import {
  FileWarning,
  PackagePlus,
  PackageSearch,
  ShoppingBag,
  ShoppingBasket,
  Truck,
  Users,
} from "lucide-react";

import { AlertList } from "@/components/dashboard/alert-list";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickActionCard } from "@/components/dashboard/quick-action-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard/data";
import type { QuickAction } from "@/types/dashboard";

const quickActions: QuickAction[] = [
  {
    title: "Nueva venta",
    description: "Crea un borrador de venta y confirma para descontar inventario.",
    href: "/ventas",
    icon: ShoppingBag,
  },
  {
    title: "Nueva compra",
    description: "Registra reposicion de proveedores y genera entradas al confirmar.",
    href: "/compras",
    icon: Truck,
  },
  {
    title: "Nuevo producto",
    description: "Agrega productos, unidades y precios base al catalogo.",
    href: "/productos",
    icon: PackagePlus,
  },
  {
    title: "Nuevo cliente",
    description: "Gestiona clientes de contado o credito antes de vender.",
    href: "/clientes",
    icon: Users,
  },
];

export function DashboardOverview({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacion"
        title="Control diario para distribucion mayorista"
        description="Resumen real de ventas, inventario, cuentas y actividad reciente para preparar decisiones comerciales."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((item) => (
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
                  Ventas, stock y caja en una sola lectura.
                </h2>
                <p className="max-w-xl text-sm leading-6 text-white/72">
                  La demo muestra el circuito completo: catalogo, compras, inventario, ventas, finanzas y reportes.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <p className="text-sm text-white/70">Productos con stock bajo</p>
                  <p className="mt-2 font-heading text-3xl font-semibold">{data.lowStockProducts}</p>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                  <p className="text-sm text-white/70">Movimientos de hoy</p>
                  <p className="mt-2 font-heading text-3xl font-semibold">{data.movementsToday}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                <p className="text-sm text-white/70">Cuentas por cobrar</p>
                <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(data.receivableTotal)}</p>
                <p className="mt-1 text-sm text-white/65">Saldo pendiente de clientes</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                <p className="text-sm text-white/70">Cuentas por pagar</p>
                <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(data.payableTotal)}</p>
                <p className="mt-1 text-sm text-white/65">Saldo pendiente con proveedores</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/8 p-4">
                <p className="text-sm text-white/70">Caja neta del dia</p>
                <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(data.netCashToday)}</p>
                <p className="mt-1 text-sm text-white/65">Ingresos menos egresos registrados</p>
              </div>
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
            <div>
              <h2 className="font-heading text-xl font-semibold">Ultimas ventas</h2>
              <p className="text-sm text-muted-foreground">Actividad comercial reciente registrada en Supabase.</p>
            </div>
            <DataTable
              data={data.recentSales}
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
                  header: "Metodo",
                  render: (item) => <span className="text-sm capitalize">{item.channel}</span>,
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
            {!data.recentSales.length ? (
              <p className="rounded-2xl border border-dashed bg-muted/35 p-4 text-sm text-muted-foreground">
                Todavia no hay ventas registradas. Crea una venta en borrador y confirmala para alimentar este resumen.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="font-heading text-xl font-semibold">Ultimos movimientos de inventario</h2>
              <p className="text-sm text-muted-foreground">Entradas, salidas, ajustes, mermas y devoluciones recientes.</p>
            </div>
            <DataTable
              data={data.recentMovements}
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
            {!data.recentMovements.length ? (
              <p className="rounded-2xl border border-dashed bg-muted/35 p-4 text-sm text-muted-foreground">
                Todavia no hay movimientos. Registra una entrada, salida o compra confirmada para ver actividad.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <AlertList items={data.alerts} />

          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Productos mas vendidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.topProducts.map((product, index) => (
                <div key={product.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">#{index + 1} - {product.category}</p>
                      <h3 className="mt-1 font-medium">{product.name}</h3>
                    </div>
                    <p className="font-heading text-lg font-semibold">{formatCurrency(product.revenue)}</p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatNumber(product.units)} unidades vendidas
                  </p>
                </div>
              ))}
              {!data.topProducts.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
                  Confirma ventas para alimentar este ranking.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Monitoreo critico</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {data.stockAlerts.map((item) => (
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
              {!data.stockAlerts.length ? (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/35 p-4">
                  <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                    <ShoppingBasket className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium">Inventario sin alertas</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Todos los productos activos superan su minimo configurado.
                    </p>
                  </div>
                </div>
              ) : null}
              {data.receivableTotal > 0 ? (
                <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/35 p-4">
                  <div className="rounded-xl bg-rose-50 p-2 text-rose-700">
                    <FileWarning className="size-4" />
                  </div>
                  <div>
                    <p className="font-medium">Cartera a revisar</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Hay {formatCurrency(data.receivableTotal)} pendientes por cobrar.
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
