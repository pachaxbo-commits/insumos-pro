"use client";

import type { ReactNode } from "react";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LockKeyhole,
  Plus,
  Save,
  Scale,
  Trash2,
} from "lucide-react";

import {
  addPurchaseBatchLineAction,
  confirmPurchaseBatchAction,
  createPurchaseBatchAction,
  deletePurchaseBatchLineAction,
  savePurchaseBatchLineClassificationAction,
  updatePurchaseBatchAction,
  updatePurchaseBatchLineAction,
} from "@/lib/purchase-batches/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  PurchaseBatchLineWithRelations,
  PurchaseBatchPaymentMethod,
  PurchaseBatchTotals,
  PurchaseBatchWithRelations,
} from "@/types/purchase-batches";
import type { ProductWithRelations } from "@/types/products";
import type { Supplier } from "@/types/purchases";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ActionState = {
  success: boolean;
  message?: string;
};

type PurchaseBatchManagementProps = {
  batches: PurchaseBatchWithRelations[];
  activeBatch: PurchaseBatchWithRelations | null;
  suppliers: Supplier[];
  products: ProductWithRelations[];
  totals: PurchaseBatchTotals;
  canManage: boolean;
  error?: string;
};

type ClassificationLine = {
  productId: string;
  quantity: string;
  assignedCost: string;
};

const initialState: ActionState = { success: false };

const paymentLabels: Record<PurchaseBatchPaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  qr: "QR",
  credito: "Credito",
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
      className="flex h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </select>
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

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    maximumFractionDigits: 3,
  }).format(value);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function CreateBatchForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(createPurchaseBatchAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-3xl border bg-white/80 p-4 md:flex-row md:items-end">
      <div className="space-y-2">
        <Label>Fecha</Label>
        <Input name="batch_date" type="date" defaultValue={today()} className="rounded-xl" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <Label>Notas</Label>
        <Input
          name="notes"
          placeholder="Ej. Compra de mercado de la mañana"
          className="rounded-xl"
        />
      </div>
      <Button type="submit" disabled={pending || disabled} className="rounded-xl">
        <Plus className="size-4" />
        Crear borrador
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function BatchMetaForm({ batch, disabled }: { batch: PurchaseBatchWithRelations; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(updatePurchaseBatchAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction} className="grid gap-3 rounded-3xl border bg-white/80 p-4 md:grid-cols-[180px_1fr_auto] md:items-end">
      <input type="hidden" name="id" value={batch.id} />
      <div className="space-y-2">
        <Label>Fecha</Label>
        <Input
          name="batch_date"
          type="date"
          defaultValue={batch.batch_date}
          disabled={disabled}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Notas del borrador</Label>
        <Input
          name="notes"
          defaultValue={batch.notes ?? ""}
          placeholder="Notas internas de la compra multiple"
          disabled={disabled}
          className="rounded-xl"
        />
      </div>
      <Button type="submit" disabled={pending || disabled} variant="outline" className="rounded-xl">
        <Save className="size-4" />
        Guardar
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function TotalsPanel({ totals }: { totals: PurchaseBatchTotals }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="rounded-3xl border-white/70 bg-white/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total</p>
            <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(totals.total)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-white/70 bg-white/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Efectivo</p>
            <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(totals.cash)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-white/70 bg-white/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">QR/Transf.</p>
            <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(totals.qrTransfer)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border-white/70 bg-white/85">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Credito</p>
            <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(totals.credit)}</p>
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-3xl border-white/70 bg-white/85">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Totales por proveedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {totals.bySupplier.length ? (
            totals.bySupplier.map((row) => (
              <div key={row.supplier_id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate">{row.supplier_name}</span>
                <strong>{formatCurrency(row.total)}</strong>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Agrega lineas para ver agrupaciones.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getInternalPurchasesCount(batch: PurchaseBatchWithRelations | null) {
  if (!batch) return 0;

  return new Set(batch.lines.map((line) => `${line.supplier_id}:${line.payment_method}`)).size;
}

function LineFields({
  products,
  suppliers,
  productId,
  supplierId,
  quantity,
  unitCost,
  paymentMethod,
  notes,
  disabled,
  onProductChange,
  onSupplierChange,
  onQuantityChange,
  onUnitCostChange,
  onPaymentChange,
}: {
  products: ProductWithRelations[];
  suppliers: Supplier[];
  productId: string;
  supplierId: string;
  quantity: string;
  unitCost: string;
  paymentMethod: PurchaseBatchPaymentMethod;
  notes?: string | null;
  disabled?: boolean;
  onProductChange: (value: string) => void;
  onSupplierChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
  onPaymentChange: (value: PurchaseBatchPaymentMethod) => void;
}) {
  const product = products.find((item) => item.id === productId) ?? null;
  const subtotal = Number(quantity || 0) * Number(unitCost || 0);

  return (
    <>
      <div className="space-y-2">
        <Label className="lg:sr-only">Producto</Label>
        <NativeSelect
          name="product_id"
          required
          value={productId}
          onChange={(event) => onProductChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Producto</option>
          {products.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </NativeSelect>
        {product?.requires_classification ? (
          <p className="rounded-xl bg-amber-50 px-2 py-1 text-xs text-amber-800">
            Requiere clasificacion de ingreso antes de confirmar.
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Proveedor</Label>
        <NativeSelect
          name="supplier_id"
          required
          value={supplierId}
          onChange={(event) => onSupplierChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Proveedor</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Cantidad</Label>
        <Input
          name="quantity"
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
          inputMode="decimal"
          step="0.001"
          min="0.001"
          disabled={disabled}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Unidad</Label>
        <div className="flex h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm text-muted-foreground">
          {product?.unit?.abbreviation ?? "s/u"}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Costo unitario</Label>
        <Input
          name="unit_cost"
          value={unitCost}
          onChange={(event) => onUnitCostChange(event.target.value)}
          inputMode="decimal"
          step="0.01"
          min="0"
          disabled={disabled}
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Subtotal</Label>
        <div className="flex h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold">
          {formatCurrency(subtotal)}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="lg:sr-only">Metodo</Label>
        <NativeSelect
          name="payment_method"
          value={paymentMethod}
          onChange={(event) => onPaymentChange(event.target.value as PurchaseBatchPaymentMethod)}
          disabled={disabled}
        >
          <option value="efectivo">Efectivo</option>
          <option value="qr">QR</option>
          <option value="transferencia">Transferencia</option>
          <option value="credito">Credito</option>
        </NativeSelect>
      </div>
      <input type="hidden" name="notes" value={notes ?? ""} />
    </>
  );
}

function AddLineForm({
  batchId,
  products,
  suppliers,
  disabled,
}: {
  batchId: string;
  products: ProductWithRelations[];
  suppliers: Supplier[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(addPurchaseBatchLineAction, initialState);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState(String(products[0]?.purchase_price ?? 0));
  const [paymentMethod, setPaymentMethod] = useState<PurchaseBatchPaymentMethod>("efectivo");
  useActionToast(state);

  function selectProduct(value: string) {
    const product = products.find((item) => item.id === value);
    setProductId(value);
    setUnitCost(String(product?.purchase_price ?? 0));
  }

  return (
    <form action={formAction} className="space-y-3 rounded-3xl border border-emerald-100 bg-emerald-50/50 p-4">
      <input type="hidden" name="batch_id" value={batchId} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Agregar producto</p>
          <p className="text-sm text-muted-foreground">La linea queda en borrador y no afecta inventario.</p>
        </div>
        <Button type="submit" disabled={pending || disabled || !productId || !supplierId} className="rounded-xl">
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1.2fr_0.7fr_0.45fr_0.75fr_0.75fr_0.8fr]">
        <LineFields
          products={products}
          suppliers={suppliers}
          productId={productId}
          supplierId={supplierId}
          quantity={quantity}
          unitCost={unitCost}
          paymentMethod={paymentMethod}
          disabled={disabled}
          onProductChange={selectProduct}
          onSupplierChange={setSupplierId}
          onQuantityChange={setQuantity}
          onUnitCostChange={setUnitCost}
          onPaymentChange={setPaymentMethod}
        />
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function EditableLineForm({
  batchId,
  line,
  products,
  suppliers,
  disabled,
  layout,
}: {
  batchId: string;
  line: PurchaseBatchLineWithRelations;
  products: ProductWithRelations[];
  suppliers: Supplier[];
  disabled: boolean;
  layout: "table" | "card";
}) {
  const [state, formAction, pending] = useActionState(updatePurchaseBatchLineAction, initialState);
  const [productId, setProductId] = useState(line.product_id);
  const [supplierId, setSupplierId] = useState(line.supplier_id);
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [unitCost, setUnitCost] = useState(String(line.unit_cost));
  const [paymentMethod, setPaymentMethod] = useState<PurchaseBatchPaymentMethod>(line.payment_method);
  useActionToast(state);

  const product = products.find((item) => item.id === productId) ?? line.product;

  function selectProduct(value: string) {
    const nextProduct = products.find((item) => item.id === value);
    setProductId(value);
    setUnitCost(String(nextProduct?.purchase_price ?? unitCost));
  }

  if (layout === "table") {
    return (
      <TableRow>
        <TableCell colSpan={8} className="p-2">
          <div className="grid gap-2 lg:grid-cols-[1.4fr_1.2fr_0.7fr_0.45fr_0.75fr_0.75fr_0.8fr_auto_auto_auto]">
            <form action={formAction} className="contents">
              <input type="hidden" name="id" value={line.id} />
              <input type="hidden" name="batch_id" value={batchId} />
              <LineFields
                products={products}
                suppliers={suppliers}
                productId={productId}
                supplierId={supplierId}
                quantity={quantity}
                unitCost={unitCost}
                paymentMethod={paymentMethod}
                notes={line.notes}
                disabled={disabled}
                onProductChange={selectProduct}
                onSupplierChange={setSupplierId}
                onQuantityChange={setQuantity}
                onUnitCostChange={setUnitCost}
                onPaymentChange={setPaymentMethod}
              />
              <Button type="submit" disabled={pending || disabled} size="icon-sm" variant="outline">
                <Save className="size-4" />
                <span className="sr-only">Guardar linea</span>
              </Button>
            </form>
            {line.requires_classification ? (
              <ClassificationDialog line={line} products={products} disabled={disabled} />
            ) : null}
            <DeleteLineForm lineId={line.id} disabled={disabled} />
          </div>
          {line.requires_classification ? (
            <p
              className={cn(
                "mt-2 rounded-xl px-3 py-2 text-xs",
                line.classification?.status === "lista"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-800",
              )}
            >
              {line.classification?.status === "lista"
                ? "Clasificacion lista: el producto base no ingresara a stock."
                : "Pendiente de clasificar: este batch no se puede confirmar todavia."}
            </p>
          ) : null}
          <FormMessage state={state} />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border bg-white/85 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{line.product_name ?? product?.name ?? "Producto"}</p>
          <p className="text-xs text-muted-foreground">
            {formatQuantity(Number(line.quantity))} {line.unit_abbreviation ?? product?.unit?.abbreviation ?? "u"} x{" "}
            {formatCurrency(Number(line.unit_cost))}
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          {line.requires_classification && line.classification?.status !== "lista"
            ? "Pendiente clasificar"
            : paymentLabels[line.payment_method]}
        </Badge>
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="batch_id" value={batchId} />
        <div className="grid gap-3">
          <LineFields
            products={products}
            suppliers={suppliers}
            productId={productId}
            supplierId={supplierId}
            quantity={quantity}
            unitCost={unitCost}
            paymentMethod={paymentMethod}
            notes={line.notes}
            disabled={disabled}
            onProductChange={selectProduct}
            onSupplierChange={setSupplierId}
            onQuantityChange={setQuantity}
            onUnitCostChange={setUnitCost}
            onPaymentChange={setPaymentMethod}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={pending || disabled} className="rounded-xl">
            <Save className="size-4" />
            Guardar
          </Button>
        </div>
      </form>
      {line.requires_classification ? (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-xs",
            line.classification?.status === "lista"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-800",
          )}
        >
          {line.classification?.status === "lista"
            ? "Clasificacion lista: ingresaran solo productos resultantes."
            : "Clasificacion pendiente: el producto base no ingresara a stock."}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {line.requires_classification ? (
          <ClassificationDialog line={line} products={products} disabled={disabled} />
        ) : null}
        <DeleteLineForm lineId={line.id} disabled={disabled} />
      </div>
      <FormMessage state={state} />
    </div>
  );
}

function DeleteLineForm({ lineId, disabled }: { lineId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(deletePurchaseBatchLineAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={lineId} />
      <Button
        type="submit"
        variant="outline"
        size="icon-sm"
        disabled={pending || disabled}
        className="border-rose-200 text-rose-700 hover:bg-rose-50"
      >
        <Trash2 className="size-4" />
        <span className="sr-only">Eliminar linea</span>
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

function BatchSelector({ batches, activeBatch }: { batches: PurchaseBatchWithRelations[]; activeBatch: PurchaseBatchWithRelations | null }) {
  if (!batches.length) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {batches.map((batch) => (
        <Button
          key={batch.id}
          asChild
          variant={activeBatch?.id === batch.id ? "default" : "outline"}
          size="sm"
          className="shrink-0 rounded-full"
        >
          <Link href={`/compras/multiple?batch=${batch.id}`}>
            {batch.batch_date} | {batch.status} | {batch.lines.length} lineas
          </Link>
        </Button>
      ))}
    </div>
  );
}

function ClassificationDialog({
  line,
  products,
  disabled,
}: {
  line: PurchaseBatchLineWithRelations;
  products: ProductWithRelations[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    savePurchaseBatchLineClassificationAction,
    initialState,
  );
  const [wasteQuantity, setWasteQuantity] = useState(
    String(line.classification?.waste_quantity ?? 0),
  );
  const [resultLines, setResultLines] = useState<ClassificationLine[]>(
    line.classification?.results.length
      ? line.classification.results.map((result) => ({
          productId: result.product_id,
          quantity: String(result.quantity),
          assignedCost: String(result.assigned_cost),
        }))
      : [
          { productId: "", quantity: "", assignedCost: "" },
        ],
  );
  useActionToast(state);

  const resultProducts = products.filter((product) => product.id !== line.product_id);
  const assignedTotal = resultLines.reduce(
    (sum, item) => sum + Number(item.assignedCost || 0),
    0,
  );
  const originalSubtotal = Number(line.subtotal);
  const assignedDifference = originalSubtotal - assignedTotal;
  const assignedDifferenceInCents = Math.round(assignedDifference * 100);
  const classifiedQuantity = resultLines.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const resultUnit =
    resultProducts.find((product) => product.id === resultLines[0]?.productId)?.unit?.abbreviation ??
    line.unit_abbreviation ??
    "u";

  function updateResult(index: number, patch: Partial<ClassificationLine>) {
    setResultLines((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={line.classification ? "outline" : "secondary"}
          size="sm"
          disabled={disabled}
          className="rounded-xl"
        >
          <Scale className="size-4" />
          {line.classification ? "Editar clasificacion" : "Clasificar ingreso"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Clasificar ingreso</DialogTitle>
          <DialogDescription>
            El producto base no ingresara a inventario. Solo ingresaran los productos resultantes vendibles.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="line_id" value={line.id} />
          <input type="hidden" name="result_count" value={resultLines.length} />
          <FormMessage state={state} />

          <div className="grid gap-3 rounded-2xl border bg-muted/35 p-4 text-sm md:grid-cols-4">
            <span>Base<br /><strong>{line.product_name ?? line.product?.name}</strong></span>
            <span>Cantidad compra<br /><strong>{formatQuantity(Number(line.quantity))} {line.unit_abbreviation ?? "u"}</strong></span>
            <span>Subtotal original<br /><strong>{formatCurrency(originalSubtotal)}</strong></span>
            <span>Total clasificado<br /><strong>{formatQuantity(classifiedQuantity + Number(wasteQuantity || 0))} {resultUnit}</strong></span>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Si la unidad de compra es carga y la salida es kg, registra el peso real en kg. El sistema no inventa conversiones.
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Productos resultantes vendibles</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() =>
                  setResultLines((current) => [
                    ...current,
                    { productId: "", quantity: "", assignedCost: "" },
                  ])
                }
              >
                <Plus className="size-4" />
                Resultado
              </Button>
            </div>
            {resultLines.map((item, index) => {
              const product = resultProducts.find((entry) => entry.id === item.productId) ?? null;
              const saleValue = Number(item.quantity || 0) * Number(product?.sale_price ?? 0);

              return (
                <div key={index} className="grid gap-3 rounded-2xl border bg-white/80 p-3 md:grid-cols-[1.4fr_0.7fr_0.55fr_0.75fr_0.75fr_auto]">
                  <div className="space-y-2">
                    <Label>Producto resultante</Label>
                    <NativeSelect
                      name={`result_product_id_${index}`}
                      value={item.productId}
                      onChange={(event) => updateResult(index, { productId: event.target.value })}
                    >
                      <option value="">Seleccionar</option>
                      {resultProducts.map((productOption) => (
                        <option key={productOption.id} value={productOption.id}>
                          {productOption.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label>Cantidad real</Label>
                    <Input
                      name={`result_quantity_${index}`}
                      value={item.quantity}
                      onChange={(event) => updateResult(index, { quantity: event.target.value })}
                      inputMode="decimal"
                      step="0.001"
                      min="0.001"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidad</Label>
                    <div className="flex h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm">
                      {product?.unit?.abbreviation ?? "u"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Precio venta ref.</Label>
                    <div className="flex h-10 items-center rounded-xl border bg-muted/40 px-3 text-sm">
                      {formatCurrency(Number(product?.sale_price ?? 0))}
                    </div>
                    <p className="text-xs text-muted-foreground">Valor ref. {formatCurrency(saleValue)}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Costo asignado</Label>
                    <Input
                      name={`result_assigned_cost_${index}`}
                      value={item.assignedCost}
                      onChange={(event) => updateResult(index, { assignedCost: event.target.value })}
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="Auto"
                      className="rounded-xl"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-xl text-rose-700"
                      disabled={resultLines.length <= 1}
                      onClick={() =>
                        setResultLines((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Quitar resultado</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
            <div className="space-y-2">
              <Label>Merma / descarte ({resultUnit})</Label>
              <Input
                name="waste_quantity"
                value={wasteQuantity}
                onChange={(event) => setWasteQuantity(event.target.value)}
                inputMode="decimal"
                step="0.001"
                min="0"
                className="rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                La merma no recibe stock vendible; su costo se distribuye entre productos vendibles.
              </p>
            </div>
            <div className="rounded-2xl border bg-white/80 p-3 text-sm">
              <p className="text-muted-foreground">Costo asignado manual</p>
              <p className="mt-1 font-semibold">{formatCurrency(assignedTotal)}</p>
              <p className={cn("mt-1 text-xs", assignedDifferenceInCents === 0 ? "text-emerald-700" : "text-amber-700")}>
                Diferencia: {formatCurrency(assignedDifference)}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                name="notes"
                defaultValue={line.classification?.notes ?? ""}
                placeholder="Ej. Clasificacion manual por peso real"
                className="rounded-xl"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending} className="rounded-xl">
              <Save className="size-4" />
              Guardar clasificacion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBatchForm({
  batch,
  totals,
  disabled,
}: {
  batch: PurchaseBatchWithRelations;
  totals: PurchaseBatchTotals;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(confirmPurchaseBatchAction, initialState);
  useActionToast(state);

  const hasPendingClassification = batch.lines.some(
    (line) => line.requires_classification && line.classification?.status !== "lista",
  );
  const internalPurchasesCount = getInternalPurchasesCount(batch);
  const canConfirm = !disabled && batch.status === "borrador" && batch.lines.length > 0 && !hasPendingClassification;

  return (
    <Card className="rounded-3xl border-emerald-100 bg-emerald-50/70">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 size-5 text-emerald-700" />
          <div>
            <p className="font-semibold text-emerald-950">Confirmar compra multiple</p>
            <p className="text-sm text-emerald-900/75">
              Se crearan compras hijas agrupadas por proveedor y metodo de pago. Cada compra hija
              usara la confirmacion segura actual.
            </p>
          </div>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-5">
          <span className="rounded-2xl bg-white/80 p-3">Total<br /><strong>{formatCurrency(totals.total)}</strong></span>
          <span className="rounded-2xl bg-white/80 p-3">Efectivo<br /><strong>{formatCurrency(totals.cash)}</strong></span>
          <span className="rounded-2xl bg-white/80 p-3">QR/Transf.<br /><strong>{formatCurrency(totals.qrTransfer)}</strong></span>
          <span className="rounded-2xl bg-white/80 p-3">Credito<br /><strong>{formatCurrency(totals.credit)}</strong></span>
          <span className="rounded-2xl bg-white/80 p-3">Compras internas<br /><strong>{internalPurchasesCount}</strong></span>
        </div>

        {hasPendingClassification ? (
          <p className="rounded-2xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Este producto requiere clasificacion de ingreso antes de confirmar.
          </p>
        ) : null}

        <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input type="hidden" name="id" value={batch.id} />
          <Input
            name="confirmation"
            placeholder="Escribe CONFIRMAR"
            disabled={!canConfirm}
            className="rounded-xl bg-white"
          />
          <Button type="submit" disabled={pending || !canConfirm} className="rounded-xl">
            <CheckCircle2 className="size-4" />
            Confirmar compra multiple
          </Button>
        </form>
        <FormMessage state={state} />
      </CardContent>
    </Card>
  );
}

function ConfirmedBatchSummary({ batch }: { batch: PurchaseBatchWithRelations }) {
  return (
    <Card className="rounded-3xl border-teal-100 bg-teal-50/75">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-1 size-5 text-teal-700" />
          <div>
            <p className="font-semibold text-teal-950">Compra multiple confirmada</p>
            <p className="text-sm text-teal-900/75">
              El borrador quedo bloqueado. Las compras hijas aparecen en el modulo de compras,
              inventario, finanzas, reportes y auditoria como compras normales.
            </p>
          </div>
        </div>
        {batch.child_purchases.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {batch.child_purchases.map((purchase) => (
              <Button key={purchase.id} asChild variant="outline" className="justify-between rounded-xl bg-white">
                <Link href={`/compras?status=confirmada`}>
                  <span>Compra {purchase.id.slice(0, 8)}</span>
                  <strong>{formatCurrency(Number(purchase.total))}</strong>
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <Button asChild variant="outline" className="rounded-xl bg-white">
            <Link href="/compras?status=confirmada">Ver compras confirmadas</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PurchaseBatchManagement({
  batches,
  activeBatch,
  suppliers,
  products,
  totals,
  canManage,
  error,
}: PurchaseBatchManagementProps) {
  const hasSetupData = suppliers.length > 0 && products.length > 0;
  const hasClassificationWarnings = useMemo(
    () => Boolean(activeBatch?.lines.some((line) => line.requires_classification)),
    [activeBatch],
  );
  const canEditActiveBatch = Boolean(canManage && activeBatch?.status === "borrador");

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4 text-rose-800">
          <p className="font-medium">No se pudo cargar la compra multiple.</p>
          <p className="text-sm">{error}</p>
        </div>
      ) : null}

      <CreateBatchForm disabled={!canManage} />

      <BatchSelector batches={batches} activeBatch={activeBatch} />

      {!hasSetupData ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          Necesitas al menos un proveedor activo y un producto activo para usar la compra multiple.
          Para compras informales, crea un proveedor tipo Compra ocasional / Mercado.
        </div>
      ) : null}

      {!activeBatch ? (
        <div className="rounded-[1.7rem] border border-dashed bg-white/80 p-10 text-center">
          <FileSpreadsheet className="mx-auto size-10 text-muted-foreground" />
          <h3 className="mt-3 font-heading text-xl font-semibold">No hay borrador abierto</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea un borrador para cargar productos de distintos proveedores en una sola planilla.
          </p>
        </div>
      ) : (
        <>
          <BatchMetaForm batch={activeBatch} disabled={!canEditActiveBatch} />

          {hasClassificationWarnings ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5" />
                <div>
                  <p className="font-medium">Hay productos que requieren clasificacion de ingreso.</p>
                  <p className="text-sm">
                    Clasifica cada linea antes de confirmar. El producto base no ingresara a inventario.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <TotalsPanel totals={totals} />

          {activeBatch.status === "confirmada" ? (
            <ConfirmedBatchSummary batch={activeBatch} />
          ) : (
            <ConfirmBatchForm batch={activeBatch} totals={totals} disabled={!canManage} />
          )}

          <AddLineForm
            batchId={activeBatch.id}
            products={products}
            suppliers={suppliers}
            disabled={!canEditActiveBatch || !hasSetupData}
          />

          <Card className="rounded-3xl border-white/70 bg-white/90 shadow-sm">
            <CardHeader>
            <CardTitle className="font-heading text-xl">Planilla de compra multiple</CardTitle>
            <p className="text-sm text-muted-foreground">
                {activeBatch.status === "borrador"
                  ? "Esta planilla esta en borrador: aun no crea compras hijas ni mueve inventario."
                  : "Esta planilla fue confirmada y quedo bloqueada para edicion."}
            </p>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-hidden rounded-2xl border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Producto</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Costo unit.</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeBatch.lines.map((line) => (
                      <EditableLineForm
                        key={line.id}
                        batchId={activeBatch.id}
                        line={line}
                        products={products}
                        suppliers={suppliers}
                        disabled={!canEditActiveBatch}
                        layout="table"
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 lg:hidden">
                {activeBatch.lines.map((line) => (
                  <EditableLineForm
                    key={line.id}
                    batchId={activeBatch.id}
                    line={line}
                    products={products}
                    suppliers={suppliers}
                    disabled={!canEditActiveBatch}
                    layout="card"
                  />
                ))}
              </div>
              {!activeBatch.lines.length ? (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Aun no hay lineas. Usa Agregar producto para iniciar la planilla.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="sticky bottom-3 z-10 rounded-3xl border bg-white/95 p-3 shadow-xl shadow-slate-950/10 backdrop-blur lg:hidden">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <span>Total<br /><strong>{formatCurrency(totals.total)}</strong></span>
              <span>Efectivo<br /><strong>{formatCurrency(totals.cash)}</strong></span>
              <span>QR/Transf.<br /><strong>{formatCurrency(totals.qrTransfer)}</strong></span>
              <span>Credito<br /><strong>{formatCurrency(totals.credit)}</strong></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
