"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Eye,
  ReceiptText,
  Save,
  Search,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";

import { cancelSaleAction, confirmSaleAction, createSaleAction } from "@/lib/sales/actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductWithRelations } from "@/types/products";
import type {
  Customer,
  SaleFilters,
  SalesSummary,
  SaleStatus,
  SaleWithRelations,
  TopSoldProduct,
} from "@/types/sales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";

type ActionState = {
  success: boolean;
  message?: string;
};

type SalesManagementProps = {
  sales: SaleWithRelations[];
  customers: Customer[];
  products: ProductWithRelations[];
  summary: SalesSummary;
  topProducts: TopSoldProduct[];
  filters: SaleFilters;
  canManage: boolean;
};

type SaleLine = {
  productId: string;
  quantity: string;
  unitPrice: string;
};

const initialState: ActionState = { success: false };

const statusStyles: Record<SaleStatus, string> = {
  borrador: "border-amber-200 bg-amber-50 text-amber-700",
  confirmada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  anulada: "border-slate-200 bg-slate-100 text-slate-600",
};

function NativeSelect({
  name,
  defaultValue,
  children,
  required,
  value,
  onChange,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  required?: boolean;
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required={required}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function StatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full", statusStyles[status])}>
      {status}
    </Badge>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        state.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {state.message}
    </p>
  );
}

function useActionToast(state: ActionState) {
  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
      return;
    }

    toast.error(state.message);
  }, [state]);
}

function ActionFeedback({ state }: { state: ActionState }) {
  if (!state.message || state.success) return null;

  return (
    <p role="alert" className="max-w-72 rounded-xl bg-rose-50 px-3 py-2 text-left text-xs text-rose-700">
      {state.message}
    </p>
  );
}

function SaleRowActionForm({
  saleId,
  action,
  label,
  icon,
}: {
  saleId: string;
  action: typeof confirmSaleAction | typeof cancelSaleAction;
  label: string;
  icon: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useActionToast(state);

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="id" value={saleId} />
        <Button variant="outline" size="icon-sm" type="submit" disabled={pending}>
          {icon}
          <span className="sr-only">{label}</span>
        </Button>
      </form>
      <ActionFeedback state={state} />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function SaleForm({
  customers,
  products,
}: {
  customers: Customer[];
  products: ProductWithRelations[];
}) {
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const [lines, setLines] = useState<SaleLine[]>(
    Array.from({ length: 10 }, () => ({ productId: "", quantity: "", unitPrice: "" })),
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentType, setPaymentType] = useState("contado");
  const [discount, setDiscount] = useState("0");
  const today = new Date().toISOString().slice(0, 10);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const creditAvailable = selectedCustomer
    ? Math.max(Number(selectedCustomer.credit_limit) - Number(selectedCustomer.current_balance), 0)
    : 0;

  const updateLine = (index: number, nextLine: Partial<SaleLine>) => {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...nextLine } : line,
      ),
    );
  };

  const subtotal = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity);
    const price = Number(line.unitPrice);
    return sum + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
  }, 0);
  const parsedDiscount = Math.max(Number(discount) || 0, 0);
  const total = Math.max(subtotal - parsedDiscount, 0);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Cliente</Label>
          <NativeSelect
            name="customer_id"
            required
            value={selectedCustomerId}
            onChange={(event) => {
              const nextCustomer = customers.find((customer) => customer.id === event.target.value);
              setSelectedCustomerId(event.target.value);

              if (!nextCustomer || nextCustomer.customer_type === "contado") {
                setPaymentType("contado");
              }
            }}
          >
            <option value="">Seleccionar cliente</option>
            {customers
              .filter((customer) => customer.is_active)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} - {customer.customer_type}
                </option>
              ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input name="sale_date" type="date" defaultValue={today} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Metodo de pago</Label>
          <NativeSelect
            name="payment_type"
            value={paymentType}
            onChange={(event) => setPaymentType(event.target.value)}
          >
            <option value="contado">Contado</option>
            <option value="transferencia">Transferencia</option>
            <option value="qr">QR</option>
            {selectedCustomer?.customer_type === "credito" ? (
              <option value="credito">Credito</option>
            ) : null}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Descuento</Label>
          <Input
            name="discount"
            type="number"
            min="0"
            step="0.01"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea name="notes" placeholder="Observaciones de despacho, entrega o cobranza" className="rounded-xl" />
        </div>
      </div>

      {selectedCustomer ? (
        <Alert
          className={cn(
            "rounded-2xl border px-4 py-3",
            selectedCustomer.customer_type === "credito"
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          <AlertDescription className="space-y-1 text-sm">
            <p>
              <strong>Cliente:</strong> {selectedCustomer.name} · Tipo{" "}
              {selectedCustomer.customer_type === "credito" ? "credito" : "contado"}
            </p>
            {selectedCustomer.customer_type === "credito" ? (
              <>
                <p>
                  Saldo actual: <strong>{formatCurrency(Number(selectedCustomer.current_balance))}</strong> · Limite:{" "}
                  <strong>{formatCurrency(Number(selectedCustomer.credit_limit))}</strong>
                </p>
                <p>
                  Crédito disponible: <strong>{formatCurrency(creditAvailable)}</strong>
                </p>
              </>
            ) : (
              <p>Cliente de contado: solo puede pagar con efectivo, QR o transferencia.</p>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-medium">Productos</p>
            <p className="text-sm text-muted-foreground">
              Busca en la lista, ajusta cantidad y precio. Las filas vacias se ignoran.
            </p>
          </div>
          <div className="grid gap-1 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm sm:grid-cols-3 sm:gap-4">
            <span>Subtotal: <strong>{formatCurrency(subtotal)}</strong></span>
            <span>Descuento: <strong>{formatCurrency(parsedDiscount)}</strong></span>
            <span>Total: <strong>{formatCurrency(total)}</strong></span>
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line, index) => {
            const selectedProduct = products.find((product) => product.id === line.productId);
            const lineSubtotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);

            return (
              <div
                key={index}
                className="grid gap-2 rounded-xl border border-border/70 bg-background/70 p-3 lg:grid-cols-[1fr_120px_140px_140px]"
              >
                <div className="space-y-1">
                  <NativeSelect
                    name={`item_product_id_${index}`}
                    value={line.productId}
                    onChange={(event) => {
                      const product = products.find((item) => item.id === event.target.value);
                      updateLine(index, {
                        productId: event.target.value,
                        unitPrice: product ? String(product.sale_price) : "",
                      });
                    }}
                  >
                    <option value="">Buscar producto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - Stock {formatNumber(product.stock_current)}
                      </option>
                    ))}
                  </NativeSelect>
                  {selectedProduct ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      Disponible: {formatNumber(selectedProduct.stock_current)} {selectedProduct.unit?.abbreviation ?? ""}
                    </p>
                  ) : null}
                </div>
                <Input
                  name={`item_quantity_${index}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Cantidad"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  className="rounded-xl"
                />
                <Input
                  name={`item_unit_price_${index}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Precio unit."
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  className="rounded-xl"
                />
                <div className="flex h-10 items-center justify-end rounded-xl border border-border/70 bg-muted/35 px-3 text-sm font-medium">
                  {formatCurrency(lineSubtotal)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar borrador"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SaleDetail({ sale }: { sale: SaleWithRelations }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p className="mt-1 font-medium">{sale.customer?.name ?? "Sin cliente"}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Fecha</p>
          <p className="mt-1 font-medium">{formatDate(sale.sale_date)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="mt-1 font-medium">{sale.payment_type}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 font-medium">{formatCurrency(Number(sale.total))}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio unit.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sale.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.product?.name ?? "Producto no disponible"}</TableCell>
                <TableCell className="text-right">{formatNumber(Number(item.quantity))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(item.unit_price))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(item.subtotal))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <p className="rounded-xl bg-muted/40 p-3 text-sm">Subtotal: <strong>{formatCurrency(Number(sale.subtotal))}</strong></p>
        <p className="rounded-xl bg-muted/40 p-3 text-sm">Descuento: <strong>{formatCurrency(Number(sale.discount))}</strong></p>
        <p className="rounded-xl bg-muted/40 p-3 text-sm">Total final: <strong>{formatCurrency(Number(sale.total))}</strong></p>
      </div>
      {sale.notes ? (
        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{sale.notes}</p>
      ) : null}
    </div>
  );
}

export function SalesManagement({
  sales,
  customers,
  products,
  summary,
  topProducts,
  filters,
  canManage,
}: SalesManagementProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Ventas hoy</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{formatCurrency(summary.salesToday)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Ventas mes</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{formatCurrency(summary.salesMonth)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Clientes activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.activeCustomers}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Deuda pendiente</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{formatCurrency(summary.pendingDebt)}</p>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="font-heading text-xl">Historial de ventas</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ventas en borrador, confirmadas o anuladas con salida automatica de inventario.
                </p>
              </div>
              {canManage ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl">
                      <ShoppingBag className="size-4" />
                      Nueva venta
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                      <DialogTitle>Nueva venta</DialogTitle>
                      <DialogDescription>
                        Guarda un borrador. El stock y la deuda se actualizan al confirmar.
                      </DialogDescription>
                    </DialogHeader>
                    <SaleForm customers={customers} products={products} />
                  </DialogContent>
                </Dialog>
              ) : (
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                  Solo lectura
                </Badge>
              )}
            </div>

            <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]" action="/ventas">
              <NativeSelect name="customer" defaultValue={filters.customer ?? "all"}>
                <option value="all">Todos los clientes</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="status" defaultValue={filters.status ?? "all"}>
                <option value="all">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="confirmada">Confirmada</option>
                <option value="anulada">Anulada</option>
              </NativeSelect>
              <Input name="date" type="date" defaultValue={filters.date ?? ""} className="h-10 rounded-xl" />
              <Button type="submit" variant="outline" className="rounded-xl">
                <Search className="size-4" />
                Filtrar
              </Button>
            </form>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Metodo pago</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{formatDate(sale.sale_date)}</p>
                          <p className="text-xs text-muted-foreground">{sale.id.slice(0, 8)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{sale.customer?.name ?? "Sin cliente"}</TableCell>
                      <TableCell>
                        <StatusBadge status={sale.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full">
                          {sale.payment_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(sale.total))}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="icon-sm">
                                <Eye className="size-4" />
                                <span className="sr-only">Ver detalle</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Detalle de venta</DialogTitle>
                                <DialogDescription>Cliente, productos, pago y totales.</DialogDescription>
                              </DialogHeader>
                              <SaleDetail sale={sale} />
                            </DialogContent>
                          </Dialog>
                          {canManage && sale.status === "borrador" ? (
                            <>
                              <SaleRowActionForm
                                saleId={sale.id}
                                action={confirmSaleAction}
                                label="Confirmar venta"
                                icon={<CheckCircle2 className="size-4" />}
                              />
                              <SaleRowActionForm
                                saleId={sale.id}
                                action={cancelSaleAction}
                                label="Anular borrador"
                                icon={<Ban className="size-4" />}
                              />
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!sales.length ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <ReceiptText className="size-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">No hay ventas para estos filtros</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Crea un borrador o ajusta los filtros.
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/ventas">Limpiar filtros</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <TrendingUp className="size-5" />
              Productos mas vendidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProducts.map((product, index) => (
              <div key={product.product_id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">#{index + 1}</p>
                    <p className="mt-1 font-medium">{product.name}</p>
                  </div>
                  <p className="font-heading font-semibold">{formatCurrency(product.revenue)}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatNumber(product.quantity)} unidades vendidas
                </p>
              </div>
            ))}
            {!topProducts.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-4 text-sm text-muted-foreground">
                Confirma ventas para alimentar este ranking.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
