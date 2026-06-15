"use client";

import type { ReactNode } from "react";
import { Download, Filter, RotateCcw } from "lucide-react";

import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CsvRecord, RankingRow, ReportExportKey, ReportFilters, ReportsData, ReportTab } from "@/types/reports";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReportsManagementProps = ReportsData & {
  filters: ReportFilters;
};

const tabLabels: Record<ReportTab, string> = {
  ventas: "Ventas",
  inventario: "Inventario",
  clientes: "Clientes",
  compras: "Compras",
  finanzas: "Finanzas",
  exportaciones: "Exportaciones",
};

const exportLabels: Record<ReportExportKey, string> = {
  ventas: "Ventas",
  productos: "Productos",
  inventario: "Inventario",
  clientes: "Clientes",
  compras: "Compras",
  cuentas_por_cobrar: "Cuentas por cobrar",
  cuentas_por_pagar: "Cuentas por pagar",
  caja: "Movimientos de caja",
};

const statusStyles: Record<string, string> = {
  confirmada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  borrador: "border-slate-200 bg-slate-50 text-slate-700",
  anulada: "border-rose-200 bg-rose-50 text-rose-700",
  cancelada: "border-rose-200 bg-rose-50 text-rose-700",
  pagada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  parcial: "border-sky-200 bg-sky-50 text-sky-700",
  vencida: "border-rose-200 bg-rose-50 text-rose-700",
  entrada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  devolucion: "border-cyan-200 bg-cyan-50 text-cyan-700",
  salida: "border-orange-200 bg-orange-50 text-orange-700",
  merma: "border-rose-200 bg-rose-50 text-rose-700",
  ajuste: "border-violet-200 bg-violet-50 text-violet-700",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  stock_bajo: "border-amber-200 bg-amber-50 text-amber-700",
  sin_stock: "border-rose-200 bg-rose-50 text-rose-700",
  activo: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inactivo: "border-slate-200 bg-slate-50 text-slate-700",
};

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? "all"}
      className="flex h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function KpiTile({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="border-white/70 bg-white/80 shadow-sm">
      <CardHeader className="pb-1">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {detail ? <CardContent className="text-xs text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusStyles[value] ?? "border-slate-200 bg-slate-50")}>
      {value.replaceAll("_", " ")}
    </Badge>
  );
}

function EmptyTableRow({ colSpan, label = "Sin datos para los filtros seleccionados." }: { colSpan: number; label?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(date);
}

function csvEscape(value: CsvRecord[string]) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: CsvRecord[]) {
  const headers = Array.from(rows.reduce((keys, row) => {
    Object.keys(row).forEach((key) => keys.add(key));
    return keys;
  }, new Set<string>()));

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function RankingList({ rows, amountLabel = "Monto" }: { rows: RankingRow[]; amountLabel?: string }) {
  if (!rows.length) {
    return <p className="rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">Sin datos suficientes.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border bg-white/70 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {index + 1}. {row.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.quantity ? `${formatNumber(row.quantity)} uds - ` : ""}
              {row.extra ?? amountLabel}
            </p>
          </div>
          <p className="shrink-0 font-semibold">{amountLabel === "Cantidad" ? formatNumber(row.amount) : formatCurrency(row.amount)}</p>
        </div>
      ))}
    </div>
  );
}

function Filters({ data, filters }: { data: ReportsData; filters: ReportFilters }) {
  return (
    <Card className="border-white/70 bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4" />
          Filtros ejecutivos
        </CardTitle>
        <CardDescription>Los filtros aplican a las consultas principales y a las exportaciones disponibles.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input name="startDate" type="date" defaultValue={filters.startDate} className="rounded-xl bg-white/75" />
          </div>
          <div className="space-y-2">
            <Label>Fecha fin</Label>
            <Input name="endDate" type="date" defaultValue={filters.endDate} className="rounded-xl bg-white/75" />
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <NativeSelect name="customer" defaultValue={filters.customer}>
              <option value="all">Todos</option>
              {data.lookups.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Producto</Label>
            <NativeSelect name="product" defaultValue={filters.product}>
              <option value="all">Todos</option>
              {data.lookups.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <NativeSelect name="category" defaultValue={filters.category}>
              <option value="all">Todas</option>
              {data.lookups.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Proveedor</Label>
            <NativeSelect name="supplier" defaultValue={filters.supplier}>
              <option value="all">Todos</option>
              {data.lookups.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Estado venta</Label>
            <NativeSelect name="saleStatus" defaultValue={filters.saleStatus}>
              <option value="all">Todos</option>
              <option value="confirmada">Confirmada</option>
              <option value="borrador">Borrador</option>
              <option value="anulada">Anulada</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Metodo pago</Label>
            <NativeSelect name="salePaymentMethod" defaultValue={filters.salePaymentMethod}>
              <option value="all">Todos</option>
              <option value="contado">Contado</option>
              <option value="transferencia">Transferencia</option>
              <option value="qr">QR</option>
              <option value="credito">Credito</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Movimiento</Label>
            <NativeSelect name="movementType" defaultValue={filters.movementType}>
              <option value="all">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
              <option value="merma">Merma</option>
              <option value="devolucion">Devolucion</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Estado compra</Label>
            <NativeSelect name="purchaseStatus" defaultValue={filters.purchaseStatus}>
              <option value="all">Todos</option>
              <option value="confirmada">Confirmada</option>
              <option value="borrador">Borrador</option>
              <option value="cancelada">Cancelada</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Tipo cliente</Label>
            <NativeSelect name="customerType" defaultValue={filters.customerType}>
              <option value="all">Todos</option>
              <option value="contado">Contado</option>
              <option value="credito">Credito</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Saldo cliente</Label>
            <NativeSelect name="debtStatus" defaultValue={filters.debtStatus}>
              <option value="all">Todos</option>
              <option value="with_debt">Con deuda</option>
              <option value="without_debt">Sin deuda</option>
            </NativeSelect>
          </div>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
            <Button type="submit" className="rounded-xl">
              Aplicar filtros
            </Button>
            <Button variant="outline" className="rounded-xl" asChild>
              <a href="/reportes">
                <RotateCcw className="size-4" />
                Limpiar
              </a>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SalesTab({ data }: { data: ReportsData["sales"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiTile title="Total vendido" value={formatCurrency(data.summary.totalSold)} detail="Ventas confirmadas en el rango" />
        <KpiTile title="Cantidad de ventas" value={formatNumber(data.summary.salesCount)} detail={`${data.summary.confirmedCount} confirmadas`} />
        <KpiTile title="Ticket promedio" value={formatCurrency(data.summary.averageTicket)} detail="Solo ventas confirmadas" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Productos mas vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <RankingList rows={data.topProducts} />
          </CardContent>
        </Card>
        <Card className="bg-white/80">
          <CardHeader>
            <CardTitle>Clientes que mas compran</CardTitle>
          </CardHeader>
          <CardContent>
            <RankingList rows={data.topCustomers} />
          </CardContent>
        </Card>
      </div>
      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Historial de ventas</CardTitle>
          <CardDescription>Fecha, cliente, total, estado y metodo de pago.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length ? data.rows.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>{formatDate(sale.date)}</TableCell>
                  <TableCell className="font-medium">{sale.customer}</TableCell>
                  <TableCell className="capitalize">{sale.paymentType}</TableCell>
                  <TableCell><StatusBadge value={sale.status} /></TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(sale.total)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={5} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryTab({ data }: { data: ReportsData["inventory"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiTile title="Productos" value={formatNumber(data.summary.totalProducts)} detail="Catalogo filtrado" />
        <KpiTile title="Stock bajo" value={formatNumber(data.summary.lowStockProducts)} detail="Requieren reposicion" />
        <KpiTile title="Sin stock" value={formatNumber(data.summary.outOfStockProducts)} detail="Stock actual cero" />
        <KpiTile title="Valorizacion compra" value={formatCurrency(data.summary.purchaseValue)} detail={`Venta estimada ${formatCurrency(data.summary.saleValue)}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-5">
        <KpiTile title="Entradas" value={formatNumber(data.summary.entries)} />
        <KpiTile title="Salidas" value={formatNumber(data.summary.outputs)} />
        <KpiTile title="Mermas" value={formatNumber(data.summary.shrinkage)} />
        <KpiTile title="Devoluciones" value={formatNumber(data.summary.returns)} />
        <KpiTile title="Ajustes" value={formatNumber(data.summary.adjustments)} />
      </div>
      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Inventario actual</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Valor compra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.length ? data.products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="font-medium">{product.name}</div>
                    <div className="text-xs text-muted-foreground">{product.sku}</div>
                  </TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell>{formatNumber(product.stockCurrent)} {product.unit}</TableCell>
                  <TableCell><StatusBadge value={product.status} /></TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(product.purchaseValue)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={5} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="bg-white/80">
        <CardHeader>
          <CardTitle>Movimientos de inventario</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.movements.length ? data.movements.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell>{formatDate(movement.date)}</TableCell>
                  <TableCell className="font-medium">{movement.product}</TableCell>
                  <TableCell><StatusBadge value={movement.type} /></TableCell>
                  <TableCell>{formatNumber(movement.quantity)}</TableCell>
                  <TableCell>{formatNumber(movement.stockBefore)} a {formatNumber(movement.stockAfter)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={5} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersTab({ data }: { data: ReportsData["customers"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiTile title="Clientes activos" value={formatNumber(data.summary.activeCustomers)} />
        <KpiTile title="Clientes con deuda" value={formatNumber(data.summary.customersWithDebt)} />
        <KpiTile title="Saldo pendiente" value={formatCurrency(data.summary.totalDebt)} />
        <KpiTile title="Credito disponible" value={formatCurrency(data.summary.availableCredit)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-white/80">
          <CardHeader><CardTitle>Ranking por compras</CardTitle></CardHeader>
          <CardContent><RankingList rows={data.topBuyers} /></CardContent>
        </Card>
        <Card className="bg-white/80">
          <CardHeader><CardTitle>Ranking por saldo pendiente</CardTitle></CardHeader>
          <CardContent><RankingList rows={data.topDebtors} /></CardContent>
        </Card>
      </div>
      <Card className="bg-white/80">
        <CardHeader><CardTitle>Cartera de clientes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Comprado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length ? data.rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="capitalize">{customer.type}</TableCell>
                  <TableCell><StatusBadge value={customer.status} /></TableCell>
                  <TableCell className="text-right">{formatCurrency(customer.purchasedAmount)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(customer.currentBalance)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(customer.availableCredit)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={6} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PurchasesTab({ data }: { data: ReportsData["purchases"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiTile title="Total comprado" value={formatCurrency(data.summary.totalPurchased)} />
        <KpiTile title="Compras" value={formatNumber(data.summary.purchasesCount)} />
        <KpiTile title="Confirmadas" value={formatNumber(data.summary.confirmedCount)} />
        <KpiTile title="Pendientes pago" value={formatNumber(data.summary.pendingCount)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-white/80">
          <CardHeader><CardTitle>Compras por proveedor</CardTitle></CardHeader>
          <CardContent><RankingList rows={data.bySupplier} /></CardContent>
        </Card>
        <Card className="bg-white/80">
          <CardHeader><CardTitle>Productos mas comprados</CardTitle></CardHeader>
          <CardContent><RankingList rows={data.topProducts} /></CardContent>
        </Card>
      </div>
      <Card className="bg-white/80">
        <CardHeader><CardTitle>Historial de compras</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length ? data.rows.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell>{formatDate(purchase.date)}</TableCell>
                  <TableCell className="font-medium">{purchase.supplier}</TableCell>
                  <TableCell><StatusBadge value={purchase.status} /></TableCell>
                  <TableCell><StatusBadge value={purchase.paymentStatus} /></TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(purchase.total)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={5} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FinanceTab({ data }: { data: ReportsData["finance"] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile title="Ingresos ventas" value={formatCurrency(data.summary.salesIncome)} />
        <KpiTile title="Cobros recibidos" value={formatCurrency(data.summary.customerPayments)} />
        <KpiTile title="Pagos realizados" value={formatCurrency(data.summary.supplierPayments)} />
        <KpiTile title="Caja neta" value={formatCurrency(data.summary.netCash)} />
        <KpiTile title="Utilidad estimada" value={formatCurrency(data.summary.estimatedProfit)} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <KpiTile title="CxC pendientes" value={formatCurrency(data.summary.pendingReceivable)} />
        <KpiTile title="CxP pendientes" value={formatCurrency(data.summary.pendingPayable)} />
        <KpiTile title="CxC vencidas" value={formatNumber(data.summary.overdueReceivable)} />
        <KpiTile title="CxP vencidas" value={formatNumber(data.summary.overduePayable)} />
      </div>
      <Card className="bg-white/80">
        <CardHeader><CardTitle>Movimientos de caja</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cashRows.length ? data.cashRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell className="capitalize">{row.type}</TableCell>
                  <TableCell className="capitalize">{row.source.replaceAll("_", " ")}</TableCell>
                  <TableCell className="capitalize">{row.method}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                </TableRow>
              )) : <EmptyTableRow colSpan={5} />}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ExportsTab({ data }: { data: ReportsData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {data.permissions.exports.map((key) => {
        const rows = data.exports[key];
        return (
          <Card key={key} className="bg-white/80">
            <CardHeader>
              <CardTitle>{exportLabels[key]}</CardTitle>
              <CardDescription>{formatNumber(rows.length)} filas disponibles segun filtros y permisos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                disabled={!rows.length}
                onClick={() => downloadCsv(`insumos-pro-${key}`, rows)}
              >
                <Download className="size-4" />
                Exportar CSV
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function ReportsManagement({ filters, ...data }: ReportsManagementProps) {
  const defaultTab = data.permissions.tabs[0] ?? "ventas";

  return (
    <div className="space-y-6">
      <Filters data={data} filters={filters} />

      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-2xl bg-white/70 p-1">
          {data.permissions.tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="min-h-9 flex-none rounded-xl px-3">
              {tabLabels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {data.permissions.tabs.includes("ventas") ? (
          <TabsContent value="ventas"><SalesTab data={data.sales} /></TabsContent>
        ) : null}
        {data.permissions.tabs.includes("inventario") ? (
          <TabsContent value="inventario"><InventoryTab data={data.inventory} /></TabsContent>
        ) : null}
        {data.permissions.tabs.includes("clientes") ? (
          <TabsContent value="clientes"><CustomersTab data={data.customers} /></TabsContent>
        ) : null}
        {data.permissions.tabs.includes("compras") ? (
          <TabsContent value="compras"><PurchasesTab data={data.purchases} /></TabsContent>
        ) : null}
        {data.permissions.tabs.includes("finanzas") ? (
          <TabsContent value="finanzas"><FinanceTab data={data.finance} /></TabsContent>
        ) : null}
        {data.permissions.tabs.includes("exportaciones") ? (
          <TabsContent value="exportaciones"><ExportsTab data={data} /></TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
