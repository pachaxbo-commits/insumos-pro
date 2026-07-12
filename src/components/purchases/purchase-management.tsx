"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, Ban, CheckCircle2, Eye, PackagePlus, Save, ShoppingCart } from "lucide-react";

import {
  cancelConfirmedPurchaseAction,
  cancelPurchaseAction,
  confirmPurchaseAction,
  createPurchaseAction,
} from "@/lib/purchases/actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type { ProductWithRelations } from "@/types/products";
import type {
  PurchaseFilters,
  PurchaseStatus,
  PurchasesSummary,
  PurchaseWithRelations,
  Supplier,
} from "@/types/purchases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type PurchaseManagementProps = {
  purchases: PurchaseWithRelations[];
  suppliers: Supplier[];
  products: ProductWithRelations[];
  summary: PurchasesSummary;
  filters: PurchaseFilters;
  canManage: boolean;
  canCancelConfirmed: boolean;
};

const initialState: ActionState = { success: false };

const statusStyles: Record<PurchaseStatus, string> = {
  borrador: "border-amber-200 bg-amber-50 text-amber-700",
  confirmada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelada: "border-slate-200 bg-slate-100 text-slate-600",
};

function NativeSelect({
  name,
  defaultValue,
  children,
  required,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required={required}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function StatusBadge({ status }: { status: PurchaseStatus }) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function PurchaseForm({
  suppliers,
  products,
}: {
  suppliers: Supplier[];
  products: ProductWithRelations[];
}) {
  const [state, formAction, pending] = useActionState(createPurchaseAction, initialState);
  const today = new Date().toISOString().slice(0, 10);
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active);

  useActionToast(state);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      {!activeSuppliers.length || !products.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {!activeSuppliers.length
            ? "No hay proveedores activos. Crea o activa un proveedor antes de registrar compras."
            : "No hay productos activos. Crea o activa productos antes de registrar compras."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Proveedor</Label>
          <NativeSelect name="supplier_id" required>
            <option value="">Seleccionar proveedor</option>
            {activeSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input name="purchase_date" type="date" defaultValue={today} required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Estado de pago</Label>
          <NativeSelect name="payment_status" defaultValue="pendiente">
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagada">Pagada</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Metodo de pago</Label>
          <NativeSelect name="payment_method" defaultValue="transferencia">
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="qr">QR</option>
            <option value="credito">Credito</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea
            name="notes"
            placeholder="Detalle operativo de la compra"
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="font-medium">Items de compra</p>
          <p className="text-sm text-muted-foreground">
            Completa las filas necesarias. Las vacias se ignoran.
          </p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-border/70 bg-background/70 p-3 md:grid-cols-[1fr_130px_150px]">
              <NativeSelect name={`item_product_id_${index}`}>
                <option value="">Producto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </NativeSelect>
              <Input
                name={`item_quantity_${index}`}
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Cantidad"
                className="rounded-xl"
              />
              <Input
                name={`item_unit_cost_${index}`}
                type="number"
                min="0"
                step="0.01"
                placeholder="Costo unit."
                className="rounded-xl"
              />
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending || !activeSuppliers.length || !products.length} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar borrador"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PurchaseRowActionForm({
  purchaseId,
  action,
  label,
  icon,
}: {
  purchaseId: string;
  action: typeof confirmPurchaseAction | typeof cancelPurchaseAction;
  label: string;
  icon: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={purchaseId} />
      <Button variant="outline" size="icon-sm" type="submit" disabled={pending}>
        {icon}
        <span className="sr-only">{label}</span>
      </Button>
    </form>
  );
}

function ConfirmedPurchaseCancellationForm({ purchase }: { purchase: PurchaseWithRelations }) {
  const [state, formAction, pending] = useActionState(cancelConfirmedPurchaseAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={purchase.id} />
      <FormMessage state={state} />
      <Alert variant="destructive" className="rounded-2xl">
        <AlertTriangle className="size-4" />
        <AlertTitle>Anulacion conservadora</AlertTitle>
        <AlertDescription>
          Se mantendra la compra original y solo se revertira si no hay pagos ni movimientos
          posteriores sobre sus productos. Si el stock ya fue usado, debera hacerse una
          devolucion o ajuste controlado.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 text-sm md:grid-cols-3">
        <span>Proveedor: <strong>{purchase.supplier?.name ?? "Sin proveedor"}</strong></span>
        <span>Total: <strong>{formatCurrency(Number(purchase.total))}</strong></span>
        <span>Pago: <strong>{purchase.payment_status}</strong></span>
      </div>
      <div className="space-y-2">
        <Label>Motivo obligatorio</Label>
        <Textarea
          name="reason"
          required
          minLength={10}
          placeholder="Explica por que se anula esta compra confirmada"
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Confirmacion fuerte</Label>
        <Input name="confirmation" required placeholder="Escribe ANULAR" className="rounded-xl" />
      </div>
      <DialogFooter>
        <Button type="submit" variant="destructive" disabled={pending} className="rounded-xl">
          <Ban className="size-4" />
          {pending ? "Anulando..." : "Anular compra confirmada"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PurchaseDetail({ purchase }: { purchase: PurchaseWithRelations }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Proveedor</p>
          <p className="mt-1 font-medium">{purchase.supplier?.name ?? "Sin proveedor"}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Fecha</p>
          <p className="mt-1 font-medium">{formatDate(purchase.purchase_date)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="mt-1 font-medium">{formatCurrency(Number(purchase.total))}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo unit.</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.product?.name ?? "Producto no disponible"}</TableCell>
                <TableCell className="text-right">{formatNumber(Number(item.quantity))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(item.unit_cost))}</TableCell>
                <TableCell className="text-right">{formatCurrency(Number(item.subtotal))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {purchase.notes ? (
        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">{purchase.notes}</p>
      ) : null}
      {purchase.reversal_status === "reversed" ? (
        <Alert className="rounded-2xl border-slate-200 bg-slate-50">
          <AlertTitle>Compra anulada con reversión aplicada</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>Fecha: {purchase.canceled_at ? formatDateTime(purchase.canceled_at) : "N/D"}</p>
            <p>Motivo: {purchase.canceled_reason ?? "Sin motivo registrado"}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function PurchaseManagement({
  purchases,
  suppliers,
  products,
  summary,
  filters,
  canManage,
  canCancelConfirmed,
}: PurchaseManagementProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Compras</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.totalPurchases}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Borradores</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.draftPurchases}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Confirmadas</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.confirmedPurchases}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Pagos pendientes</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.pendingPayments}</p>
        </div>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">Compras</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Las compras confirmadas generan entradas automaticas de inventario.
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/compras/multiple">
                    <PackagePlus className="size-4" />
                    Compra multiple
                  </Link>
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl">
                      <PackagePlus className="size-4" />
                      Nueva compra
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Nueva compra</DialogTitle>
                      <DialogDescription>
                        Guarda la compra como borrador. La reposicion se aplica al confirmarla.
                      </DialogDescription>
                    </DialogHeader>
                    <PurchaseForm suppliers={suppliers} products={products} />
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                Solo lectura
              </Badge>
            )}
          </div>
          <form className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]" action="/compras">
            <NativeSelect name="supplier" defaultValue={filters.supplier ?? "all"}>
              <option value="all">Todos los proveedores</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={filters.status ?? "all"}>
              <option value="all">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="confirmada">Confirmada</option>
              <option value="cancelada">Cancelada</option>
            </NativeSelect>
            <Input name="date" type="date" defaultValue={filters.date ?? ""} className="h-10 rounded-xl" />
            <Button type="submit" variant="outline" className="rounded-xl">
              Filtrar
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Compra</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{formatDate(purchase.purchase_date)}</p>
                        <p className="text-xs text-muted-foreground">{purchase.id.slice(0, 8)}</p>
                      </div>
                    </TableCell>
                    <TableCell>{purchase.supplier?.name ?? "Sin proveedor"}</TableCell>
                    <TableCell>
                      <StatusBadge status={purchase.status} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline" className="rounded-full">
                          {purchase.payment_status}
                        </Badge>
                        <p className="text-xs text-muted-foreground">{purchase.payment_method}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{purchase.items.length}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(purchase.total))}</TableCell>
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
                              <DialogTitle>Detalle de compra</DialogTitle>
                              <DialogDescription>
                                Items, proveedor y estado operativo.
                              </DialogDescription>
                            </DialogHeader>
                            <PurchaseDetail purchase={purchase} />
                          </DialogContent>
                        </Dialog>
                        {canManage && purchase.status === "borrador" ? (
                          <>
                            <PurchaseRowActionForm
                              purchaseId={purchase.id}
                              action={confirmPurchaseAction}
                              label="Confirmar compra"
                              icon={<CheckCircle2 className="size-4" />}
                            />
                            <PurchaseRowActionForm
                              purchaseId={purchase.id}
                              action={cancelPurchaseAction}
                              label="Cancelar compra"
                              icon={<Ban className="size-4" />}
                            />
                          </>
                        ) : null}
                        {canCancelConfirmed && purchase.status === "confirmada" ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon-sm"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                              >
                                <Ban className="size-4" />
                                <span className="sr-only">Anular compra confirmada</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Anular compra confirmada</DialogTitle>
                                <DialogDescription>
                                  Esta accion genera reversas auditadas y no elimina el documento original.
                                </DialogDescription>
                              </DialogHeader>
                              <ConfirmedPurchaseCancellationForm purchase={purchase} />
                            </DialogContent>
                          </Dialog>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!purchases.length ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <ShoppingCart className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">No hay compras para estos filtros</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea un borrador o ajusta los filtros.
                </p>
              </div>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/compras">Limpiar filtros</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
