"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ClipboardList,
  Download,
  Filter,
  PackageSearch,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

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
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CsvRecord,
  QbRankingRow,
  QbReportExportKey,
  QbReportFilters,
  QbReportsData,
} from "@/types/reports";

type ReportsManagementProps = QbReportsData & {
  filters: QbReportFilters;
};

const tabLabels = {
  resumen: "Resumen",
  inventario: "Inventario",
  ingresos: "Ingresos",
  pedidos: "Pedidos y preparacion",
  pendientes_recibo: "Pendientes de recibo",
  recibos: "Recibos",
  frecuentes: "Frecuentes",
  auditoria: "Auditoria",
  exportaciones: "CSV",
} as const;

const exportLabels: Record<QbReportExportKey, string> = {
  inventario: "Inventario",
  pedidos: "Pedidos",
  pendientes_recibo: "Pendientes de recibo",
  recibos: "Recibos",
};

const statusStyles: Record<string, string> = {
  activo: "border-emerald-200 bg-emerald-50 text-emerald-700",
  emitido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  confirmado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  borrador: "border-slate-200 bg-slate-50 text-slate-700",
  sin_configuracion: "border-slate-200 bg-slate-50 text-slate-700",
  pendiente_preparacion: "border-amber-200 bg-amber-50 text-amber-700",
  en_preparacion: "border-sky-200 bg-sky-50 text-sky-700",
  preparado: "border-indigo-200 bg-indigo-50 text-indigo-700",
  entregado_pendiente_recibo: "border-cyan-200 bg-cyan-50 text-cyan-700",
  incluido_en_recibo_borrador: "border-violet-200 bg-violet-50 text-violet-700",
  recibo_emitido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  anulado: "border-rose-200 bg-rose-50 text-rose-700",
  cancelado: "border-rose-200 bg-rose-50 text-rose-700",
  inactivo: "border-slate-200 bg-slate-50 text-slate-700",
  stock_bajo: "border-amber-200 bg-amber-50 text-amber-700",
  sin_stock: "border-rose-200 bg-rose-50 text-rose-700",
  pendiente_regularizacion: "border-violet-200 bg-violet-50 text-violet-700",
  completo: "border-emerald-200 bg-emerald-50 text-emerald-700",
  parcial: "border-amber-200 bg-amber-50 text-amber-700",
  no_disponible: "border-rose-200 bg-rose-50 text-rose-700",
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
      className="flex h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function KpiTile({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <Card className="border-white/70 bg-white/85 shadow-sm">
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
      {value === "pendiente_regularizacion"
        ? "Pendiente de regularización"
        : value.replaceAll("_", " ")}
    </Badge>
  );
}

function EmptyRow({ colSpan, label = "Sin datos para los filtros seleccionados." }: { colSpan: number; label?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function csvEscape(value: CsvRecord[string]) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: CsvRecord[]) {
  if (!rows.length) {
    toast.error("No hay datos para exportar con los filtros actuales.");
    return;
  }

  const headers = Array.from(
    rows.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  );

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
  toast.success("CSV generado correctamente.");
}

function RankingList({ rows, unit = "registros" }: { rows: QbRankingRow[]; unit?: string }) {
  if (!rows.length) {
    return <p className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">Sin datos suficientes.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white/75 p-3">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {index + 1}. {row.name}
            </p>
            <p className="text-xs text-muted-foreground">{row.detail ?? unit}</p>
          </div>
          <p className="shrink-0 font-semibold">{formatQuantity(row.quantity)}</p>
        </div>
      ))}
    </div>
  );
}

function Filters({ data, filters }: { data: QbReportsData; filters: QbReportFilters }) {
  return (
    <Card className="border-white/70 bg-white/85 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="size-4" />
          Filtros de reportes
        </CardTitle>
        <CardDescription>
          Filtra la información de inventario, ingresos, pedidos, entregas y recibos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input name="startDate" type="date" defaultValue={filters.startDate} className="rounded-lg bg-white" />
          </div>
          <div className="space-y-2">
            <Label>Fecha fin</Label>
            <Input name="endDate" type="date" defaultValue={filters.endDate} className="rounded-lg bg-white" />
          </div>
          <div className="space-y-2">
            <Label>Busqueda</Label>
            <Input name="q" defaultValue={filters.q} placeholder="Producto, cliente, referencia" className="rounded-lg bg-white" />
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <NativeSelect name="customer" defaultValue={filters.customer}>
              <option value="all">Todos</option>
              {data.lookups.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Producto</Label>
            <NativeSelect name="product" defaultValue={filters.product}>
              <option value="all">Todos</option>
              {data.lookups.products.map((product) => (
                <option key={product.id} value={product.id}>{product.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <NativeSelect name="category" defaultValue={filters.category}>
              <option value="all">Todas</option>
              {data.lookups.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Estado pedido</Label>
            <NativeSelect name="orderStatus" defaultValue={filters.orderStatus}>
              <option value="all">Todos</option>
              <option value="pendiente_preparacion">Pendiente preparacion</option>
              <option value="en_preparacion">En preparacion</option>
              <option value="preparado">Preparado</option>
              <option value="entregado_pendiente_recibo">Pendiente recibo</option>
              <option value="incluido_en_recibo_borrador">En recibo borrador</option>
              <option value="recibo_emitido">Recibo emitido</option>
              <option value="cancelado">Cancelado</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Estado recibo</Label>
            <NativeSelect name="receiptStatus" defaultValue={filters.receiptStatus}>
              <option value="all">Todos</option>
              <option value="borrador">Borrador</option>
              <option value="emitido">Emitido</option>
              <option value="anulado">Anulado</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Stock</Label>
            <NativeSelect name="inventoryStatus" defaultValue={filters.inventoryStatus}>
              <option value="all">Todos</option>
              <option value="low">Stock bajo</option>
              <option value="out">Sin stock o por regularizar</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Catálogo</Label>
            <NativeSelect name="qbCatalog" defaultValue={filters.qbCatalog}>
              <option value="all">Todos</option>
              <option value="visible">Visible</option>
              <option value="hidden">Oculto</option>
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Estado</Label>
            <NativeSelect name="qbActive" defaultValue={filters.qbActive}>
              <option value="all">Todos</option>
              <option value="active">Activo</option>
              <option value="inactive">Inactivo o sin configurar</option>
            </NativeSelect>
          </div>
          <div className="flex items-end gap-2 md:col-span-2 xl:col-span-2">
            <Button type="submit" className="rounded-lg">Aplicar</Button>
            <Button variant="outline" className="rounded-lg" asChild>
              <Link href="/reportes">
                <RotateCcw className="size-4" />
                Limpiar
              </Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SummaryTab({ data }: { data: QbReportsData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile title="Pendientes de preparacion" value={formatNumber(data.summary.pendingPreparation)} />
        <KpiTile title="En preparacion" value={formatNumber(data.summary.inPreparation)} />
        <KpiTile title="Preparados" value={formatNumber(data.summary.prepared)} />
        <KpiTile title="Pendientes de recibo" value={formatNumber(data.summary.deliveredPendingReceipt)} />
        <KpiTile title="Recibos en borrador" value={formatNumber(data.summary.draftReceipts)} />
        <KpiTile
          title="Recibos emitidos del periodo"
          value={formatNumber(data.summary.issuedReceiptsInPeriod)}
          detail={`Total en recibos emitidos: ${formatCurrency(data.summary.issuedReceiptTotalInPeriod)}`}
        />
        <KpiTile title="Stock bajo" value={formatNumber(data.summary.lowStockProducts)} />
        <KpiTile title="Sin stock o por regularizar" value={formatNumber(data.summary.outOfStockProducts)} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-white/85">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-5" />
              Ultimos pedidos recibidos
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Productos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.slice(0, 6).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{formatDate(order.date)}</TableCell>
                    <TableCell className="font-medium">{order.customer}</TableCell>
                    <TableCell><StatusBadge value={order.status} /></TableCell>
                    <TableCell className="max-w-[320px] truncate">{order.requestedProducts}</TableCell>
                  </TableRow>
                ))}
                {!data.orders.length ? <EmptyRow colSpan={4} /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="bg-white/85">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="size-5" />
              Ingresos recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.merchandiseReceipts.slice(0, 6).map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell>{formatDate(receipt.date)}</TableCell>
                    <TableCell>{receipt.supplierOrOrigin}</TableCell>
                    <TableCell className="font-medium">{receipt.product}</TableCell>
                    <TableCell><StatusBadge value={receipt.status} /></TableCell>
                  </TableRow>
                ))}
                {!data.merchandiseReceipts.length ? <EmptyRow colSpan={4} /> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InventoryTab({ data }: { data: QbReportsData }) {
  return (
    <Card className="bg-white/85">
      <CardHeader>
        <CardTitle>Inventario actual</CardTitle>
        <CardDescription>Consulta las existencias físicas y el estado de configuración de cada producto.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Catálogo</TableHead>
              <TableHead>Clasificación</TableHead>
              <TableHead>Último movimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.inventory.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="font-medium">{row.product}</div>
                  <div className="text-xs text-muted-foreground">{row.sku}</div>
                </TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell>
                  <div>{formatQuantity(row.stockCurrent)} {row.baseUnit}</div>
                  <StatusBadge value={row.stockStatus} />
                </TableCell>
                <TableCell><StatusBadge value={row.qbStatus} /></TableCell>
                <TableCell>{row.catalogVisible ? "Visible" : "Oculto"}</TableCell>
                <TableCell>
                  {row.isLossProduct ? "Merma" : row.isClassificationResult ? "Resultado" : row.isClassifiable ? "Clasificable" : "N/A"}
                </TableCell>
                <TableCell>{formatDate(row.lastMovementAt)}</TableCell>
              </TableRow>
            ))}
            {!data.inventory.length ? <EmptyRow colSpan={7} /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MerchandiseTab({ data }: { data: QbReportsData }) {
  return (
    <Card className="bg-white/85">
      <CardHeader>
        <CardTitle>Ingresos de mercadería</CardTitle>
        <CardDescription>Consulta las recepciones registradas, sus cantidades y su clasificación.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Producto recibido</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Clasificación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Costo informativo de ingreso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.merchandiseReceipts.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.supplierOrOrigin}</div>
                  <div className="text-xs text-muted-foreground">{row.reference}</div>
                </TableCell>
                <TableCell>{row.product}</TableCell>
                <TableCell>{formatQuantity(row.sourceQuantity)} {row.sourceLabel}</TableCell>
                <TableCell>{formatQuantity(row.baseQuantity)} {row.baseUnit}</TableCell>
                <TableCell className="max-w-[280px]">
                  {row.isClassified ? row.resultProducts : "No clasificado"}
                  {row.lossQuantity > 0 ? <div className="text-xs text-muted-foreground">Merma: {formatQuantity(row.lossQuantity)}</div> : null}
                </TableCell>
                <TableCell><StatusBadge value={row.status} /></TableCell>
                <TableCell>{formatCurrency(row.informativeCost)}</TableCell>
              </TableRow>
            ))}
            {!data.merchandiseReceipts.length ? <EmptyRow colSpan={8} /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OrdersTab({ data }: { data: QbReportsData }) {
  return (
    <Card className="bg-white/85">
      <CardHeader>
        <CardTitle>Pedidos y preparación</CardTitle>
        <CardDescription>Consulta las cantidades solicitadas, preparadas y entregadas de cada pedido.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Solicitado</TableHead>
              <TableHead>Preparado</TableHead>
              <TableHead>Entrega</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>
                  <div className="font-medium">{row.customer}</div>
                  <div className="text-xs text-muted-foreground">{row.phone}</div>
                </TableCell>
                <TableCell>{row.location}</TableCell>
                <TableCell><StatusBadge value={row.status} /></TableCell>
                <TableCell className="max-w-[260px]">{row.requestedProducts}</TableCell>
                <TableCell className="max-w-[260px]">{row.preparedProducts}</TableCell>
                <TableCell>{formatDate(row.deliveredAt)}</TableCell>
              </TableRow>
            ))}
            {!data.orders.length ? <EmptyRow colSpan={7} /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PendingReceiptsTab({ data }: { data: QbReportsData }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button asChild className="rounded-lg">
          <Link href="/recibos">
            <ReceiptText className="size-4" />
            Ir a recibos
          </Link>
        </Button>
      </div>
      <Card className="bg-white/85">
        <CardHeader>
          <CardTitle>Entregas pendientes de recibo</CardTitle>
          <CardDescription>Pedidos entregados que aún no fueron incluidos en un recibo acumulativo.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedidos pendientes</TableHead>
              <TableHead>Última entrega</TableHead>
                <TableHead>Productos entregados</TableHead>
              <TableHead>Ubicación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.pendingReceipts.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell>
                    <div className="font-medium">{row.customer}</div>
                    <div className="text-xs text-muted-foreground">{row.phone}</div>
                  </TableCell>
                  <TableCell>{formatNumber(row.pendingOrders)}</TableCell>
                  <TableCell>{formatDate(row.lastDeliveredAt)}</TableCell>
                  <TableCell className="max-w-[360px]">{row.deliveredProducts}</TableCell>
                  <TableCell>{row.location}</TableCell>
                </TableRow>
              ))}
              {!data.pendingReceipts.length ? <EmptyRow colSpan={5} /> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptsTab({ data }: { data: QbReportsData }) {
  return (
    <Card className="bg-white/85">
      <CardHeader>
        <CardTitle>Recibos acumulativos</CardTitle>
        <CardDescription>Consulta los importes consolidados de pedidos entregados; estos recibos no son facturas fiscales.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Factores</TableHead>
              <TableHead>Pedidos</TableHead>
              <TableHead className="text-right">Total de recibo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.receipts.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Button variant="link" asChild className="h-auto p-0">
                    <Link href={`/recibos/${row.id}`}>{row.number}</Link>
                  </Button>
                  {row.status === "anulado" ? <div className="text-xs text-muted-foreground">{row.voidReason}</div> : null}
                </TableCell>
                <TableCell>{row.customer}</TableCell>
                <TableCell><StatusBadge value={row.status} /></TableCell>
                <TableCell>
                  <div>{formatDate(row.issuedAt)}</div>
                  <div className="text-xs text-muted-foreground">{row.issuedBy}</div>
                </TableCell>
                <TableCell className="max-w-[280px]">{row.factors}</TableCell>
                <TableCell>{formatNumber(row.includedOrders)}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(row.totalAmount)}</TableCell>
              </TableRow>
            ))}
            {!data.receipts.length ? <EmptyRow colSpan={7} /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FrequentTab({ data }: { data: QbReportsData }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="bg-white/85"><CardHeader><CardTitle>Clientes con mas pedidos</CardTitle></CardHeader><CardContent><RankingList rows={data.frequentCustomers} unit="pedidos" /></CardContent></Card>
      <Card className="bg-white/85"><CardHeader><CardTitle>Clientes pendientes de recibo</CardTitle></CardHeader><CardContent><RankingList rows={data.customersPendingReceipt} unit="pedidos" /></CardContent></Card>
      <Card className="bg-white/85"><CardHeader><CardTitle>Productos mas solicitados</CardTitle></CardHeader><CardContent><RankingList rows={data.mostRequestedProducts} unit="cantidad solicitada" /></CardContent></Card>
      <Card className="bg-white/85"><CardHeader><CardTitle>Productos mas entregados</CardTitle></CardHeader><CardContent><RankingList rows={data.mostDeliveredProducts} unit="cantidad entregada" /></CardContent></Card>
      <Card className="bg-white/85"><CardHeader><CardTitle>Productos con mas faltantes</CardTitle></CardHeader><CardContent><RankingList rows={data.mostMissingProducts} unit="lineas no disponibles" /></CardContent></Card>
      <Card className="bg-white/85"><CardHeader><CardTitle>Unidades mas usadas</CardTitle></CardHeader><CardContent><RankingList rows={data.mostUsedUnits} unit="solicitudes" /></CardContent></Card>
    </div>
  );
}

function AuditTab({ data }: { data: QbReportsData }) {
  return (
    <Card className="bg-white/85">
      <CardHeader>
        <CardTitle>Auditoría operativa</CardTitle>
        <CardDescription>Consulta la actividad registrada durante ingresos, entregas y gestión de recibos.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Usuario</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.auditEvents.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell><StatusBadge value={row.event} /></TableCell>
                <TableCell>{row.entity}</TableCell>
                <TableCell>{row.detail}</TableCell>
                <TableCell>{row.actor}</TableCell>
              </TableRow>
            ))}
            {!data.auditEvents.length ? <EmptyRow colSpan={5} /> : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ExportsTab({ data }: { data: QbReportsData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {data.permissions.exports.map((key) => {
        const rows = data.exports[key];
        return (
          <Card key={key} className="bg-white/85">
            <CardHeader>
              <CardTitle>{exportLabels[key]}</CardTitle>
              <CardDescription>{formatNumber(rows.length)} filas disponibles segun filtros y permisos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-lg"
                disabled={!rows.length}
                onClick={() => downloadCsv(`qb-insumos-${key}`, rows)}
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
  const defaultTab = data.permissions.tabs[0] ?? "resumen";

  return (
    <div className="space-y-6">
      <Filters data={data} filters={filters} />

      <Tabs defaultValue={defaultTab} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-lg bg-white/70 p-1">
          {data.permissions.tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="min-h-9 flex-none rounded-md px-3">
              {tabLabels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {data.permissions.tabs.includes("resumen") ? <TabsContent value="resumen"><SummaryTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("inventario") ? <TabsContent value="inventario"><InventoryTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("ingresos") ? <TabsContent value="ingresos"><MerchandiseTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("pedidos") ? <TabsContent value="pedidos"><OrdersTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("pendientes_recibo") ? <TabsContent value="pendientes_recibo"><PendingReceiptsTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("recibos") ? <TabsContent value="recibos"><ReceiptsTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("frecuentes") ? <TabsContent value="frecuentes"><FrequentTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("auditoria") ? <TabsContent value="auditoria"><AuditTab data={data} /></TabsContent> : null}
        {data.permissions.tabs.includes("exportaciones") ? <TabsContent value="exportaciones"><ExportsTab data={data} /></TabsContent> : null}
      </Tabs>
    </div>
  );
}
