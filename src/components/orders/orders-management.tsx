"use client";

import type { ReactNode } from "react";
import { useActionState, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  DollarSign,
  CreditCard,
  Link2,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
  UserRoundCheck,
} from "lucide-react";

import {
  adjustPublicOrderItemPriceAction,
  cancelOrderAction,
  confirmPublicOrderManuallyAction,
  confirmPreparedOrderAction,
  createOrderAction,
  fulfillConfirmedOrderAction,
  issuePublicOrderQuoteAction,
  linkPublicOrderCustomerAction,
  prepareOrderItemAction,
  releasePublicOrderAction,
  revokePublicOrderQuoteAction,
  updatePublicOrderReviewAction,
} from "@/lib/orders/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type { OrderFilters, OrderItemStatus, OrdersSummary, OrderStatus, OrderWithRelations } from "@/types/orders";
import type { ProductWithRelations } from "@/types/products";
import type { Customer, SalePaymentType } from "@/types/sales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ActionState = {
  success: boolean;
  message?: string;
  secureLink?: string;
  expiresAt?: string;
};

type OrdersManagementProps = {
  orders: OrderWithRelations[];
  customers: Customer[];
  products: ProductWithRelations[];
  summary: OrdersSummary;
  filters: OrderFilters;
  canManage: boolean;
  isAdmin: boolean;
  today: string;
  error?: string;
};

type OrderLine = {
  productId: string;
  requestedQuantity: string;
  unitPrice: string;
};

type InitialPaymentLine = {
  key: string;
  paymentMethod: "efectivo" | "qr" | "transferencia";
  amount: string;
  externalReference: string;
};

const initialState: ActionState = { success: false };

const statusStyles: Record<OrderStatus, string> = {
  borrador: "border-slate-200 bg-slate-50 text-slate-600",
  pendiente_revision: "border-violet-200 bg-violet-50 text-violet-700",
  recibido: "border-sky-200 bg-sky-50 text-sky-700",
  en_preparacion: "border-amber-200 bg-amber-50 text-amber-700",
  listo_para_confirmar: "border-emerald-200 bg-emerald-50 text-emerald-700",
  confirmado_cliente: "border-cyan-200 bg-cyan-50 text-cyan-700",
  preparado_completo: "border-emerald-200 bg-emerald-50 text-emerald-700",
  preparado_incompleto: "border-orange-200 bg-orange-50 text-orange-700",
  confirmado: "border-teal-200 bg-teal-50 text-teal-700",
  despachado: "border-blue-200 bg-blue-50 text-blue-700",
  entregado: "border-slate-200 bg-slate-100 text-slate-700",
  cancelado: "border-rose-200 bg-rose-50 text-rose-700",
};

const itemStatusStyles: Record<OrderItemStatus, string> = {
  pendiente: "border-slate-200 bg-slate-50 text-slate-600",
  preparado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  parcial: "border-amber-200 bg-amber-50 text-amber-700",
  sin_stock: "border-rose-200 bg-rose-50 text-rose-700",
  cancelado: "border-slate-200 bg-slate-100 text-slate-600",
};

const paymentLabels: Record<SalePaymentType, string> = {
  contado: "Contado",
  transferencia: "Transferencia",
  qr: "QR",
  credito: "Credito",
};

const expectedPaymentLabels = {
  efectivo: "Efectivo",
  qr: "QR",
  mixto: "Mixto",
} as const;

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
      className="flex h-11 w-full rounded-xl border border-input bg-white/80 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";

  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full capitalize", statusStyles[status])}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: OrderItemStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full capitalize", itemStatusStyles[status])}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p
      role={state.success ? "status" : "alert"}
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        state.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {state.message}
    </p>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card className="rounded-3xl border-white/70 bg-white/85 shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="font-heading text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateOrderDialog({
  customers,
  products,
  disabled,
}: {
  customers: Customer[];
  products: ProductWithRelations[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? "");
  const [paymentType, setPaymentType] = useState<SalePaymentType>("contado");
  const [lines, setLines] = useState<OrderLine[]>([
    { productId: products[0]?.id ?? "", requestedQuantity: "1", unitPrice: String(products[0]?.sale_price ?? 0) },
  ]);
  useActionToast(state);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const canUseCredit = selectedCustomer?.customer_type === "credito";
  const paymentOptions: SalePaymentType[] = canUseCredit
    ? ["contado", "transferencia", "qr", "credito"]
    : ["contado", "transferencia", "qr"];

  function updateLine(index: number, patch: Partial<OrderLine>) {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, {
      productId,
      unitPrice: String(product?.sale_price ?? 0),
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled} className="h-11 rounded-2xl">
          <Plus className="size-4" />
          Nuevo pedido
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear pedido</DialogTitle>
          <DialogDescription>
            Registra lo que el cliente pidio. Las cantidades reales se completan al preparar.
          </DialogDescription>
        </DialogHeader>
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
                  setSelectedCustomerId(event.target.value);
                  const customer = customers.find((item) => item.id === event.target.value);
                  if (customer?.customer_type === "contado" && paymentType === "credito") {
                    setPaymentType("contado");
                  }
                }}
              >
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </NativeSelect>
              {selectedCustomer ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                  Tipo: <strong>{selectedCustomer.customer_type}</strong>
                  {canUseCredit
                    ? ` | Credito disponible: ${formatCurrency(
                        Number(selectedCustomer.credit_limit) - Number(selectedCustomer.current_balance),
                      )}`
                    : " | Cliente de contado: sin ventas a credito."}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                name="order_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Forma estimada de pago</Label>
              <NativeSelect
                name="payment_type"
                required
                value={paymentType}
                onChange={(event) => setPaymentType(event.target.value as SalePaymentType)}
              >
                {paymentOptions.map((option) => (
                  <option key={option} value={option}>
                    {paymentLabels[option]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notas</Label>
              <Textarea
                name="notes"
                placeholder="Ej. Cliente pide entrega por la tarde, confirmar peso final por WhatsApp."
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Productos solicitados</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      productId: products[0]?.id ?? "",
                      requestedQuantity: "1",
                      unitPrice: String(products[0]?.sale_price ?? 0),
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                Item
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => {
                const product = products.find((item) => item.id === line.productId);

                return (
                  <div key={`${index}-${line.productId}`} className="rounded-2xl border bg-white/70 p-3">
                    <div className="grid gap-3 md:grid-cols-[1.6fr_0.7fr_0.7fr]">
                      <div className="space-y-2">
                        <Label>Producto</Label>
                        <NativeSelect
                          name={`item_product_id_${index}`}
                          required
                          value={line.productId}
                          onChange={(event) => selectProduct(index, event.target.value)}
                        >
                          {products.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} | stock {formatQuantity(Number(item.stock_current))}
                            </option>
                          ))}
                        </NativeSelect>
                        <p className="text-xs text-muted-foreground">
                          Unidad: {product?.unit?.abbreviation ?? "s/u"} | Precio actual:{" "}
                          {formatCurrency(Number(product?.sale_price ?? 0))}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Cantidad pedida</Label>
                        <Input
                          name={`item_requested_quantity_${index}`}
                          inputMode="decimal"
                          step="0.001"
                          min="0.001"
                          value={line.requestedQuantity}
                          onChange={(event) =>
                            updateLine(index, { requestedQuantity: event.target.value })
                          }
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Precio unitario</Label>
                        <Input
                          name={`item_unit_price_${index}`}
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={line.unitPrice}
                          onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !products.length || !customers.length} className="rounded-2xl">
              <Save className="size-4" />
              Crear pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PrepareItemForm({ item, disabled }: { item: OrderWithRelations["items"][number]; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(prepareOrderItemAction, initialState);
  const [status, setStatus] = useState<OrderItemStatus>(item.status);
  useActionToast(state);

  const requiresQuantity = status === "preparado" || status === "parcial";
  const unit = item.unit_abbreviation ?? item.product?.unit?.abbreviation ?? "u";
  const quantityDifference = Number(item.actual_quantity) - Number(item.requested_quantity);
  const hasSavedQuantity = Number(item.actual_quantity) > 0;
  const differenceLabel =
    quantityDifference > 0
      ? `+${formatQuantity(quantityDifference)} ${unit} sobre lo pedido`
      : `${formatQuantity(quantityDifference)} ${unit} vs pedido`;
  const noteRequired = status === "parcial" || status === "sin_stock";

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border bg-white/75 p-3">
      <input type="hidden" name="id" value={item.id} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.product_name ?? item.product?.name ?? "Producto no disponible"}</p>
          <p className="text-xs text-muted-foreground">
            Pedido: {formatQuantity(Number(item.requested_quantity))} {unit} | Stock:{" "}
            {formatQuantity(Number(item.product?.stock_current ?? 0))} {unit}
          </p>
        </div>
        <ItemStatusBadge status={item.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_0.9fr]">
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderItemStatus)}
            disabled={disabled}
          >
            <option value="pendiente">Pendiente</option>
            <option value="preparado">Preparado completo</option>
            <option value="parcial">Preparado parcial</option>
            <option value="sin_stock">Sin stock</option>
            <option value="cancelado">Cancelado</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Cantidad real ({unit})</Label>
          <Input
            name="actual_quantity"
            inputMode="decimal"
            step="0.001"
            min="0"
            defaultValue={String(item.actual_quantity || (requiresQuantity ? item.requested_quantity : 0))}
            disabled={disabled || !requiresQuantity}
            className="h-11 rounded-xl text-base"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Nota del preparador</Label>
        <Input
          name="notes"
          defaultValue={item.notes ?? ""}
          placeholder={
            noteRequired
              ? "Obligatorio: explica por que queda parcial o sin stock."
              : "Ej. Se completo con peso aproximado."
          }
          required={noteRequired}
          disabled={disabled}
          className="rounded-xl"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          <p>Final: {formatCurrency(Number(item.final_subtotal))}</p>
          {hasSavedQuantity ? (
            <p className={cn(quantityDifference < 0 ? "text-amber-700" : "text-emerald-700")}>
              Diferencia: {differenceLabel}
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending || disabled} size="sm" className="rounded-xl">
          <PackageCheck className="size-4" />
          Guardar item
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function ConfirmOrderForm({ order, disabled }: { order: OrderWithRelations; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(confirmPreparedOrderAction, initialState);
  const [paymentType, setPaymentType] = useState<SalePaymentType>(order.payment_type);
  useActionToast(state);

  const customerAllowsCredit = order.customer?.customer_type === "credito";
  const paymentOptions: SalePaymentType[] = customerAllowsCredit
    ? ["contado", "transferencia", "qr", "credito"]
    : ["contado", "transferencia", "qr"];

  const hasPendingItems = order.items.some((item) => item.status === "pendiente");
  const hasPreparedItems = order.items.some(
    (item) => Number(item.actual_quantity) > 0 && (item.status === "preparado" || item.status === "parcial"),
  );
  const canConfirm =
    !disabled &&
    !hasPendingItems &&
    hasPreparedItems &&
    (order.status === "preparado_completo" || order.status === "preparado_incompleto");
  const isPartialDelivery = order.status === "preparado_incompleto";

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/55 p-4">
      <input type="hidden" name="id" value={order.id} />
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-1 size-5 text-emerald-700" />
        <div>
          <p className="font-medium text-emerald-950">Confirmar como venta real</p>
          <p className="text-sm text-emerald-800/75">
            Al confirmar se descuenta inventario, se crea venta, finanzas, reportes y deuda si es credito.
          </p>
        </div>
      </div>
      {isPartialDelivery ? (
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
          Pedido incompleto: al confirmar se registrara una entrega parcial y la venta incluira solo los
          items preparados con cantidad real. Los faltantes conservaran su estado en el pedido.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <NativeSelect
          name="payment_type"
          value={paymentType}
          onChange={(event) => setPaymentType(event.target.value as SalePaymentType)}
          disabled={!canConfirm}
        >
          {paymentOptions.map((option) => (
            <option key={option} value={option}>
              {paymentLabels[option]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" disabled={pending || !canConfirm} className="rounded-xl">
          <ShoppingBag className="size-4" />
          {isPartialDelivery ? "Confirmar entrega parcial" : "Confirmar venta"}
        </Button>
      </div>
      {hasPendingItems ? (
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-800">
          Aun hay items pendientes. Marca cada item antes de confirmar.
        </p>
      ) : null}
      <FormMessage state={state} />
    </form>
  );
}

function CancelOrderForm({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(cancelOrderAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="id" value={orderId} />
      <Input
        name="reason"
        placeholder="Motivo para cancelar"
        disabled={disabled}
        className="h-10 rounded-xl"
      />
      <Button type="submit" variant="outline" disabled={pending || disabled} className="rounded-xl">
        <Ban className="size-4" />
        Cancelar
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function ReviewPublicOrderForm({
  order,
  disabled,
}: {
  order: OrderWithRelations;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updatePublicOrderReviewAction,
    initialState,
  );
  const [deliveryType, setDeliveryType] = useState(order.delivery_type ?? "delivery");
  useActionToast(state);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/65 p-4"
    >
      <input type="hidden" name="id" value={order.id} />
      <div>
        <p className="font-medium text-sky-950">Datos revisados por ventas</p>
        <p className="text-xs leading-5 text-sky-800/75">
          Estos datos se usaran para preparar y emitir el resumen final.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Nombre o negocio</Label>
          <Input
            name="contact_name"
            defaultValue={order.contact_snapshot?.name ?? ""}
            required
            maxLength={120}
            disabled={disabled}
            className="rounded-xl bg-white"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Celular / WhatsApp</Label>
          <Input
            name="phone"
            defaultValue={order.contact_snapshot?.phone ?? ""}
            required
            maxLength={25}
            disabled={disabled}
            className="rounded-xl bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label>Entrega</Label>
          <NativeSelect
            name="delivery_type"
            value={deliveryType}
            onChange={(event) => setDeliveryType(event.target.value as "delivery" | "recojo")}
            disabled={disabled}
          >
            <option value="delivery">Delivery</option>
            <option value="recojo">Recojo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Pago esperado</Label>
          <NativeSelect
            name="expected_payment_method"
            defaultValue={order.expected_payment_method ?? "efectivo"}
            disabled={disabled}
          >
            <option value="efectivo">Efectivo</option>
            <option value="qr">QR</option>
            <option value="mixto">Mixto</option>
          </NativeSelect>
        </div>
        {deliveryType === "delivery" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label>Direccion</Label>
            <Textarea
              name="delivery_address"
              defaultValue={order.delivery_address ?? ""}
              required
              maxLength={300}
              disabled={disabled}
              className="rounded-xl bg-white"
            />
          </div>
        ) : (
          <input type="hidden" name="delivery_address" value="" />
        )}
        <div className="space-y-2 sm:col-span-2">
          <Label>Horario aproximado</Label>
          <Input
            name="delivery_time_window"
            defaultValue={order.delivery_time_window ?? ""}
            required
            maxLength={100}
            disabled={disabled}
            className="rounded-xl bg-white"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Observaciones visibles en el resumen</Label>
          <Textarea
            name="notes"
            defaultValue={order.notes ?? ""}
            maxLength={1000}
            disabled={disabled}
            className="rounded-xl bg-white"
          />
        </div>
      </div>
      <Button type="submit" disabled={disabled || pending} size="sm" className="rounded-xl">
        <Save className="size-4" />
        {pending ? "Guardando..." : "Guardar revision"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function ReleasePublicOrderForm({
  orderId,
  disabled,
}: {
  orderId: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(releasePublicOrderAction, initialState);
  useActionToast(state);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/65 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <input type="hidden" name="id" value={orderId} />
      <div>
        <p className="font-medium text-emerald-950">Liberar a preparacion</p>
        <p className="text-xs text-emerald-800/75">
          Confirma que contacto, entrega y cliente vinculado son correctos.
        </p>
      </div>
      <Button
        type="submit"
        disabled={disabled || pending}
        className="h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800"
      >
        <Send className="size-4" />
        {pending ? "Enviando..." : "Enviar a preparacion"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function AdjustPublicItemPriceForm({
  item,
  disabled,
}: {
  item: OrderWithRelations["items"][number];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    adjustPublicOrderItemPriceAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form
      action={formAction}
      className="mt-2 space-y-2 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-3"
    >
      <input type="hidden" name="id" value={item.id} />
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
        Ajuste comercial auditado
      </p>
      <div className="grid gap-2 sm:grid-cols-[0.7fr_1.3fr_auto]">
        <Input
          name="final_unit_price"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={Number(item.final_unit_price ?? item.unit_price)}
          disabled={disabled}
          aria-label="Precio final unitario"
          className="rounded-xl bg-white"
        />
        <Input
          name="reason"
          minLength={10}
          maxLength={500}
          placeholder="Motivo obligatorio del cambio"
          disabled={disabled}
          className="rounded-xl bg-white"
        />
        <Button type="submit" size="sm" disabled={disabled || pending} className="rounded-xl">
          <DollarSign className="size-4" />
          Ajustar
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function addDaysToDate(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function FulfillmentDialog({
  order,
  disabled,
  isAdmin,
  today,
}: {
  order: OrderWithRelations;
  disabled: boolean;
  isAdmin: boolean;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    fulfillConfirmedOrderAction,
    initialState,
  );
  const [payments, setPayments] = useState<InitialPaymentLine[]>([]);
  const [authorized, setAuthorized] = useState(false);
  useActionToast(state);

  const fulfillmentType = order.delivery_type === "recojo" ? "recojo" : "delivery";
  const operationLabel = fulfillmentType === "delivery" ? "Despachar pedido" : "Entregar pedido";
  const confirmationWord = fulfillmentType === "delivery" ? "DESPACHAR" : "ENTREGAR";
  const total = Number(order.final_total);
  const paid = payments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const balance = Math.max(total - paid, 0);
  const exceedsTotal = paid > total + 0.001;
  const hasOutstanding = balance > 0.001;
  const isCashCustomer = order.customer?.customer_type === "contado";
  const countedOutstandingBlocked = hasOutstanding && isCashCustomer && !isAdmin;
  const countedAuthorizationMissing =
    hasOutstanding && isCashCustomer && isAdmin && !authorized;
  const defaultDueDate = addDaysToDate(`${today}T00:00:00.000Z`, 15);

  function addPayment() {
    setPayments((current) => [
      ...current,
      {
        key: `payment-${Date.now()}-${current.length}`,
        paymentMethod: "efectivo",
        amount: "",
        externalReference: "",
      },
    ]);
  }

  function updatePayment(index: number, patch: Partial<InitialPaymentLine>) {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...patch } : payment,
      ),
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          className="h-14 w-full rounded-2xl bg-[#244d3c] text-base text-white hover:bg-[#193f2f]"
        >
          {fulfillmentType === "delivery" ? (
            <Truck className="size-5" />
          ) : (
            <PackageCheck className="size-5" />
          )}
          {operationLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-[1.75rem] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b bg-[#f4f1e8] px-5 py-5 text-left sm:px-6">
          <DialogTitle className="font-heading text-2xl">{operationLabel}</DialogTitle>
          <DialogDescription className="leading-6">
            Se creara la venta definitiva y se descontara stock con las cantidades reales.
            {fulfillmentType === "delivery"
              ? " El delivery quedara despachado, no entregado."
              : " El recojo quedara entregado al cliente."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-5 px-5 pb-6 sm:px-6">
          <input type="hidden" name="id" value={order.id} />
          <input type="hidden" name="fulfillment_type" value={fulfillmentType} />
          <input
            type="hidden"
            name="payments"
            value={JSON.stringify(
              payments.map((payment) => ({
                paymentMethod: payment.paymentMethod,
                amount: Number(payment.amount),
                externalReference:
                  payment.paymentMethod === "efectivo"
                    ? null
                    : payment.externalReference,
              })),
            )}
          />

          <FormMessage state={state} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Pagos iniciales
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agrega una fila por cada metodo. Puedes cerrar sin pagos si el saldo esta autorizado.
                </p>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={addPayment}>
                <Plus className="size-4" />
                Agregar pago
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {payments.length ? (
                payments.map((payment, index) => (
                  <div
                    key={payment.key}
                    className="grid gap-3 rounded-2xl border bg-slate-50/70 p-3 sm:grid-cols-[0.8fr_0.8fr_1fr_auto]"
                  >
                    <div className="space-y-1.5">
                      <Label>Metodo</Label>
                      <NativeSelect
                        name={`payment_method_${index}`}
                        value={payment.paymentMethod}
                        onChange={(event) =>
                          updatePayment(index, {
                            paymentMethod: event.target.value as InitialPaymentLine["paymentMethod"],
                            externalReference:
                              event.target.value === "efectivo"
                                ? ""
                                : payment.externalReference,
                          })
                        }
                      >
                        <option value="efectivo">Efectivo</option>
                        <option value="qr">QR</option>
                        <option value="transferencia">Transferencia</option>
                      </NativeSelect>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Monto</Label>
                      <Input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={payment.amount}
                        onChange={(event) =>
                          updatePayment(index, { amount: event.target.value })
                        }
                        className="h-11 rounded-xl bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Referencia
                        {payment.paymentMethod === "efectivo" ? " (no requerida)" : ""}
                      </Label>
                      <Input
                        value={payment.externalReference}
                        required={payment.paymentMethod !== "efectivo"}
                        minLength={payment.paymentMethod === "efectivo" ? undefined : 3}
                        maxLength={120}
                        disabled={payment.paymentMethod === "efectivo"}
                        onChange={(event) =>
                          updatePayment(index, {
                            externalReference: event.target.value,
                          })
                        }
                        placeholder={
                          payment.paymentMethod === "efectivo"
                            ? "Efectivo"
                            : "Nro. operacion"
                        }
                        className="h-11 rounded-xl bg-white"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="self-end rounded-xl text-rose-700"
                      onClick={() =>
                        setPayments((current) =>
                          current.filter((_, paymentIndex) => paymentIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Eliminar pago</span>
                    </Button>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Sin pagos iniciales. El total quedara pendiente si las reglas de credito lo permiten.
                </p>
              )}
            </div>
          </section>

          <section className="sticky top-0 z-10 grid grid-cols-3 gap-2 rounded-2xl bg-[#244d3c] p-4 text-white shadow-lg">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/60">Total</p>
              <p className="font-heading text-lg font-bold">{formatCurrency(total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/60">Pagado</p>
              <p className="font-heading text-lg font-bold">{formatCurrency(paid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/60">Saldo</p>
              <p className="font-heading text-lg font-bold">{formatCurrency(balance)}</p>
            </div>
          </section>

          {exceedsTotal ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Los pagos superan el total del pedido.
            </p>
          ) : null}

          {hasOutstanding ? (
            <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <CreditCard className="mt-0.5 size-5 shrink-0 text-amber-800" />
                <div>
                  <p className="font-semibold text-amber-950">
                    Quedara un saldo de {formatCurrency(balance)}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-amber-900/75">
                    {isCashCustomer
                      ? "Este cliente es de contado. Solo un administrador puede autorizar el saldo."
                      : "Se validara el limite de credito. El vencimiento predeterminado es de 15 dias."}
                  </p>
                </div>
              </div>

              {isCashCustomer && isAdmin ? (
                <>
                  <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
                    <input
                      type="checkbox"
                      name="authorize_outstanding"
                      value="true"
                      checked={authorized}
                      onChange={(event) => setAuthorized(event.target.checked)}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      Autorizo expresamente entregar con saldo pendiente.
                    </span>
                  </label>
                  <div className="space-y-2">
                    <Label>Motivo de autorizacion</Label>
                    <Textarea
                      name="outstanding_authorization_reason"
                      required
                      minLength={10}
                      maxLength={500}
                      placeholder="Explica por que se autoriza el saldo..."
                      className="rounded-xl bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha de vencimiento</Label>
                    <Input
                      name="outstanding_due_date"
                      type="date"
                      required
                      min={today}
                      defaultValue={defaultDueDate}
                      className="h-11 rounded-xl bg-white"
                    />
                  </div>
                </>
              ) : (
                <input type="hidden" name="outstanding_due_date" value="" />
              )}
            </section>
          ) : (
            <>
              <input type="hidden" name="authorize_outstanding" value="false" />
              <input type="hidden" name="outstanding_due_date" value="" />
            </>
          )}

          {countedOutstandingBlocked ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Solicita a un administrador completar este cierre o registra el pago total.
            </p>
          ) : null}

          <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
            <Label htmlFor={`confirmation-${order.id}`}>
              Escribe <strong>{confirmationWord}</strong> para confirmar
            </Label>
            <Input
              id={`confirmation-${order.id}`}
              name="confirmation"
              required
              autoComplete="off"
              className="h-12 rounded-xl bg-white font-mono uppercase"
            />
            <p className="text-xs leading-5 text-rose-800">
              Esta operacion crea la venta, mueve inventario y registra caja/CxC. No se puede editar como borrador.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={
                pending ||
                exceedsTotal ||
                countedOutstandingBlocked ||
                countedAuthorizationMissing
              }
              className="h-14 w-full rounded-2xl bg-[#244d3c] text-base text-white hover:bg-[#193f2f]"
            >
              {pending ? "Procesando cierre..." : operationLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FulfillmentSummary({ order }: { order: OrderWithRelations }) {
  const fulfillment = order.fulfillment;
  const sale = fulfillment?.sale;

  if (!fulfillment || !sale) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/65 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
            Cierre comercial
          </p>
          <p className="mt-1 font-heading text-lg font-semibold text-blue-950">
            {fulfillment.status === "despachado"
              ? "Delivery despachado"
              : "Pedido entregado"}
          </p>
        </div>
        <Badge className="rounded-full bg-white text-blue-800">
          {sale.payment_status}
        </Badge>
      </div>

      {fulfillment.status === "despachado" ? (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-blue-900">
          La mercaderia salio del almacen. La entrega final del delivery se registrara en una fase posterior.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white p-2">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="font-semibold">{formatCurrency(Number(sale.total))}</p>
        </div>
        <div className="rounded-xl bg-white p-2">
          <p className="text-xs text-muted-foreground">Pagado</p>
          <p className="font-semibold">{formatCurrency(Number(sale.paid_amount))}</p>
        </div>
        <div className="rounded-xl bg-white p-2">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className="font-semibold">{formatCurrency(Number(sale.balance_due))}</p>
        </div>
      </div>

      {sale.payments.length ? (
        <div className="space-y-2">
          {sale.payments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
            >
              <span className="capitalize">
                {payment.payment_method}
                {payment.external_reference
                  ? ` | ${payment.external_reference}`
                  : ""}
              </span>
              <strong>{formatCurrency(Number(payment.amount))}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-white px-3 py-2 text-sm text-muted-foreground">
          Sin pagos iniciales registrados.
        </p>
      )}
    </section>
  );
}

function PublicQuoteControls({
  order,
  disabled,
}: {
  order: OrderWithRelations;
  disabled: boolean;
}) {
  const [issueState, issueAction, issuing] = useActionState(
    issuePublicOrderQuoteAction,
    initialState,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokePublicOrderQuoteAction,
    initialState,
  );
  const [manualState, manualAction, confirmingManually] = useActionState(
    confirmPublicOrderManuallyAction,
    initialState,
  );
  useActionToast(issueState);
  useActionToast(revokeState);
  useActionToast(manualState);

  const contactRequested = order.public_events.some(
    (event) =>
      event.event_type === "contact_requested" &&
      Number(event.quote_version) === Number(order.quote_version),
  );

  if (order.status === "confirmado_cliente") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="size-5" />
          Cliente confirmado
        </div>
        <p className="mt-1 text-sm">
          El resumen final esta congelado. Ya puedes despachar o entregar el pedido desde el cierre comercial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-teal-950">Resumen final seguro</p>
          <p className="text-xs leading-5 text-teal-800/75">
            Version {order.quote_version}. Emitir otro enlace revoca el anterior.
          </p>
        </div>
        {contactRequested ? (
          <Badge className="rounded-full bg-sky-100 text-sky-800">
            Cliente solicita contacto
          </Badge>
        ) : null}
      </div>

      <form action={issueAction}>
        <input type="hidden" name="id" value={order.id} />
        <Button
          type="submit"
          disabled={disabled || issuing}
          className="h-10 rounded-xl bg-teal-700 hover:bg-teal-800"
        >
          <Link2 className="size-4" />
          {issuing
            ? "Generando..."
            : order.quote_issued_at
              ? "Generar enlace nuevo"
              : "Generar enlace seguro"}
        </Button>
      </form>

      {issueState.secureLink ? (
        <div className="rounded-xl border border-teal-200 bg-white p-3">
          <p className="text-xs font-semibold text-teal-800">
            Copia ahora. El token plano no se guarda.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              readOnly
              value={issueState.secureLink}
              aria-label="Enlace seguro de confirmacion"
              className="rounded-xl font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={async () => {
                await navigator.clipboard.writeText(issueState.secureLink ?? "");
                toast.success("Enlace copiado.");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Vence:{" "}
            {issueState.expiresAt
              ? new Date(issueState.expiresAt).toLocaleString("es-BO")
              : "72 horas"}
          </p>
        </div>
      ) : null}
      <FormMessage state={issueState} />

      <div className="grid gap-3 lg:grid-cols-2">
        <form action={revokeAction} className="space-y-2 rounded-xl bg-white/75 p-3">
          <input type="hidden" name="id" value={order.id} />
          <Input
            name="reason"
            minLength={5}
            maxLength={500}
            placeholder="Motivo para revocar"
            disabled={disabled || revoking}
            className="rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={disabled || revoking || !order.quote_issued_at}
            className="rounded-xl"
          >
            <Ban className="size-4" />
            Revocar enlace
          </Button>
          <FormMessage state={revokeState} />
        </form>

        <form action={manualAction} className="space-y-2 rounded-xl bg-white/75 p-3">
          <input type="hidden" name="id" value={order.id} />
          <Input
            name="reason"
            minLength={10}
            maxLength={500}
            placeholder="Ej. Confirmado por llamada..."
            disabled={disabled || confirmingManually}
            className="rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={disabled || confirmingManually}
            className="rounded-xl"
          >
            <CheckCircle2 className="size-4" />
            Confirmacion manual
          </Button>
          <FormMessage state={manualState} />
        </form>
      </div>
    </div>
  );
}

function LinkPublicOrderCustomerForm({
  order,
  customers,
  disabled,
}: {
  order: OrderWithRelations;
  customers: Customer[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    linkPublicOrderCustomerAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4"
    >
      <input type="hidden" name="id" value={order.id} />
      <div className="flex items-start gap-3">
        <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-violet-700" />
        <div>
          <p className="font-medium text-violet-950">Revisar y vincular cliente</p>
          <p className="text-sm leading-5 text-violet-800/75">
            El pedido publico no puede prepararse hasta asociarlo con un cliente interno activo.
          </p>
        </div>
      </div>
      {customers.length ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <NativeSelect name="customer_id" required disabled={disabled || pending}>
            <option value="">Seleccionar cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` | ${customer.phone}` : ""}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="submit"
            disabled={disabled || pending}
            className="h-11 rounded-xl bg-violet-700 hover:bg-violet-800"
          >
            <UserRoundCheck className="size-4" />
            {pending ? "Vinculando..." : "Vincular"}
          </Button>
        </div>
      ) : (
        <p className="rounded-xl bg-white/80 px-3 py-2 text-sm text-violet-900">
          Primero crea un cliente desde{" "}
          <Link href="/clientes" className="font-semibold underline">
            Clientes
          </Link>
          .
        </p>
      )}
      <FormMessage state={state} />
    </form>
  );
}

function OrderCard({
  order,
  customers,
  canManage,
  isAdmin,
  today,
}: {
  order: OrderWithRelations;
  customers: Customer[];
  canManage: boolean;
  isAdmin: boolean;
  today: string;
}) {
  const isPublicOrder = order.origin === "catalogo_invitado";
  const isClosed =
    order.status === "confirmado_cliente" ||
    order.status === "confirmado" ||
    order.status === "despachado" ||
    order.status === "entregado" ||
    order.status === "cancelado";
  const requiresCustomerReview =
    isPublicOrder && order.customer_id === null;
  const isPendingReview = isPublicOrder && order.status === "pendiente_revision";
  const canPreparePublicOrder =
    !isPublicOrder ||
    order.status === "en_preparacion" ||
    order.status === "listo_para_confirmar";
  const preparedCount = order.items.filter((item) => item.status === "preparado").length;
  const partialCount = order.items.filter((item) => item.status === "parcial").length;
  const missingCount = order.items.filter((item) => item.status === "sin_stock" || item.status === "cancelado").length;

  return (
    <Card className="overflow-hidden rounded-[1.7rem] border-white/70 bg-white/90 shadow-sm">
      <CardHeader className="space-y-4 border-b bg-gradient-to-br from-white to-emerald-50/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Pedido {order.public_reference ?? order.id.slice(0, 8)} |{" "}
              {formatDate(order.order_date)}
            </p>
            <CardTitle className="mt-1 text-xl">
              {order.customer?.name ??
                order.contact_snapshot?.name ??
                "Cliente pendiente de vincular"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {order.items.length} items | Solicitado {formatCurrency(Number(order.estimated_total))} | Real{" "}
              {formatCurrency(Number(order.final_total))}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.origin === "catalogo_invitado" ? (
              <Badge
                variant="outline"
                className="rounded-full border-violet-200 bg-violet-50 text-violet-700"
              >
                Catalogo invitado
              </Badge>
            ) : null}
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-white/80 p-2">
            <p className="font-semibold">{preparedCount}</p>
            <p className="text-muted-foreground">Completos</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-2">
            <p className="font-semibold">{partialCount}</p>
            <p className="text-muted-foreground">Parciales</p>
          </div>
          <div className="rounded-2xl bg-white/80 p-2">
            <p className="font-semibold">{missingCount}</p>
            <p className="text-muted-foreground">Faltantes</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {order.origin === "catalogo_invitado" ? (
          <div className="grid gap-3 rounded-2xl border border-violet-100 bg-violet-50/45 p-4 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <Phone className="mt-0.5 size-4 shrink-0 text-violet-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Contacto
                </p>
                <p className="font-medium text-violet-950">
                  {order.contact_snapshot?.phone ?? "Sin telefono"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Truck className="mt-0.5 size-4 shrink-0 text-violet-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Entrega y pago esperado
                </p>
                <p className="font-medium text-violet-950">
                  {order.delivery_type === "delivery" ? "Delivery" : "Recojo"}
                  {order.delivery_time_window ? ` | ${order.delivery_time_window}` : ""}
                  {order.expected_payment_method
                    ? ` | ${expectedPaymentLabels[order.expected_payment_method]}`
                    : ""}
                </p>
              </div>
            </div>
            {order.delivery_address ? (
              <p className="rounded-xl bg-white/70 px-3 py-2 text-violet-950 sm:col-span-2">
                <strong>Direccion:</strong> {order.delivery_address}
              </p>
            ) : null}
          </div>
        ) : null}
        {order.notes ? (
          <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-muted-foreground">{order.notes}</p>
        ) : null}
        {isPublicOrder && !isClosed ? (
          <ReviewPublicOrderForm order={order} disabled={!canManage || isClosed} />
        ) : null}
        {isPendingReview && requiresCustomerReview ? (
          <LinkPublicOrderCustomerForm
            order={order}
            customers={customers}
            disabled={!canManage || isClosed}
          />
        ) : null}
        {isPendingReview && !requiresCustomerReview ? (
          <ReleasePublicOrderForm
            orderId={order.id}
            disabled={!canManage || isClosed}
          />
        ) : null}
        {isPublicOrder && order.quote_issued_at && order.status === "listo_para_confirmar" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Hay un resumen emitido. Cambiar peso, estado, motivo o precio revocara el enlace
            automaticamente.
          </p>
        ) : null}
        <div className="space-y-3">
          {order.items.map((item) => {
            const canAdjustPrice =
              isPublicOrder &&
              (item.status === "preparado" || item.status === "parcial") &&
              Number(item.actual_quantity) > 0 &&
              (order.status === "en_preparacion" ||
                order.status === "listo_para_confirmar");

            return (
              <div key={item.id}>
                <PrepareItemForm
                  item={item}
                  disabled={
                    !canManage ||
                    isClosed ||
                    requiresCustomerReview ||
                    !canPreparePublicOrder
                  }
                />
                {canAdjustPrice ? (
                  <AdjustPublicItemPriceForm
                    item={item}
                    disabled={!canManage || isClosed}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {isPublicOrder ? (
          order.status === "listo_para_confirmar" ||
          order.status === "confirmado_cliente" ? (
            <PublicQuoteControls order={order} disabled={!canManage || isClosed} />
          ) : null
        ) : (
          <ConfirmOrderForm
            order={order}
            disabled={!canManage || isClosed || requiresCustomerReview}
          />
        )}
        {isPublicOrder && order.status === "confirmado_cliente" ? (
          <FulfillmentDialog
            order={order}
            disabled={!canManage}
            isAdmin={isAdmin}
            today={today}
          />
        ) : null}
        <FulfillmentSummary order={order} />
        {!isClosed ? <CancelOrderForm orderId={order.id} disabled={!canManage} /> : null}
        {order.sale_id ? (
          <Button asChild variant="outline" className="w-full rounded-xl">
            <Link href="/ventas">Ver venta generada</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OrdersManagement({
  orders,
  customers,
  products,
  summary,
  filters,
  canManage,
  isAdmin,
  today,
  error,
}: OrdersManagementProps) {
  const hasSetupData = customers.length > 0 && products.length > 0;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-rose-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5" />
            <div>
              <p className="font-medium">No se pudieron cargar los pedidos.</p>
              <p className="text-sm">{error}</p>
              <Button asChild variant="outline" size="sm" className="mt-3 rounded-xl bg-white">
                <Link href="/pedidos">
                  <RefreshCw className="size-4" />
                  Reintentar
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          label="Por revisar"
          value={summary.pendingReviewOrders}
          icon={<UserRoundCheck className="size-5" />}
        />
        <SummaryCard label="Recibidos" value={summary.receivedOrders} icon={<ClipboardCheck className="size-5" />} />
        <SummaryCard label="Preparando" value={summary.inPreparationOrders} icon={<Scale className="size-5" />} />
        <SummaryCard label="Listos" value={summary.readyOrders} icon={<CheckCircle2 className="size-5" />} />
        <SummaryCard label="Incompletos" value={summary.incompleteOrders} icon={<AlertTriangle className="size-5" />} />
        <SummaryCard label="Confirmados" value={summary.confirmedOrders} icon={<ShoppingBag className="size-5" />} />
      </div>

      <Card className="rounded-3xl border-white/70 bg-white/85 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <form className="grid flex-1 gap-3 md:grid-cols-[1fr_1fr_0.8fr_auto]" action="/pedidos">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <NativeSelect name="customer" defaultValue={filters.customer ?? "all"}>
                  <option value="all">Todos</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <NativeSelect name="status" defaultValue={filters.status ?? "all"}>
                  <option value="all">Todos</option>
                  <option value="pendiente_revision">Pendiente revision</option>
                  <option value="recibido">Recibido</option>
                  <option value="en_preparacion">En preparacion</option>
                  <option value="listo_para_confirmar">Listo para confirmar</option>
                  <option value="confirmado_cliente">Confirmado por cliente</option>
                  <option value="preparado_completo">Listo completo</option>
                  <option value="preparado_incompleto">Listo incompleto</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="despachado">Despachado</option>
                  <option value="entregado">Entregado</option>
                  <option value="cancelado">Cancelado</option>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input name="date" type="date" defaultValue={filters.date ?? ""} className="rounded-xl" />
              </div>
              <Button type="submit" variant="outline" className="h-11 rounded-xl md:self-end">
                <Search className="size-4" />
                Filtrar
              </Button>
            </form>
            <CreateOrderDialog customers={customers} products={products} disabled={!canManage || !hasSetupData} />
          </div>
          {!hasSetupData ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Para crear pedidos necesitas al menos un cliente activo y un producto activo.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {orders.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              customers={customers}
              canManage={canManage}
              isAdmin={isAdmin}
              today={today}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.7rem] border border-dashed bg-white/80 p-8 text-center">
          <ClipboardCheck className="mx-auto size-10 text-muted-foreground" />
          <h3 className="mt-3 font-heading text-xl font-semibold">No hay pedidos con estos filtros</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea un pedido para que ventas lo prepare desde el celular con cantidades reales.
          </p>
        </div>
      )}
    </div>
  );
}
