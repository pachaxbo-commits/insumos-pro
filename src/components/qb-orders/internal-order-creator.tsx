"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  Plus,
  Search,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createQbInternalOrderAction,
  updateQbInternalOrderAction,
} from "@/lib/qb-orders/actions";
import { getAverageRepeatableOrderAction } from "@/lib/qb-orders/creation-actions";
import { serializeOrderItems } from "@/lib/qb-orders/draft-payload";
import type {
  QbInternalOrder,
  QbInternalOrderCreationData,
  QbOrderActionState,
  QbRepeatableOrder,
} from "@/types/qb-orders";

const initialState: QbOrderActionState = { success: false };
const PRODUCT_BATCH_SIZE = 40;
const MAX_ORDER_PRODUCTS = 100;

type DraftLine = {
  key: number;
  productId: string;
  allowedUnitId: string;
  quantity: string;
  notes: string;
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function boliviaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function boliviaTomorrow() {
  const date = new Date(`${boliviaToday()}T12:00:00-04:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function initialDraftLines(order?: QbInternalOrder): DraftLine[] {
  return (order?.items ?? []).map((item, index) => ({
    key: index + 1,
    productId: item.productId,
    allowedUnitId: item.allowedUnitId,
    quantity: String(item.requestedQuantity),
    notes: item.notes ?? "",
  }));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

export function InternalOrderCreator({
  customers,
  products,
  initiallyOpen = false,
  editingOrder,
  onCancelEdit,
}: QbInternalOrderCreationData & {
  initiallyOpen?: boolean;
  editingOrder?: QbInternalOrder | null;
  onCancelEdit?: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(editingOrder);
  const maxSelectedProducts = editing ? 30 : MAX_ORDER_PRODUCTS;
  const startingLines = initialDraftLines(editingOrder ?? undefined);
  const [open, setOpen] = useState(initiallyOpen || editing);
  const [step, setStep] = useState<1 | 2>(1);
  const [customerId, setCustomerId] = useState(
    editingOrder?.customerAccountId ?? "",
  );
  const [locationId, setLocationId] = useState(
    editingOrder?.customerLocationId ?? "",
  );
  const [operationalDate, setOperationalDate] = useState(
    editingOrder?.operationalDate ?? boliviaTomorrow,
  );
  const [customerNotes, setCustomerNotes] = useState(
    editingOrder?.customerNotes ?? "",
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    initiallyOpen || editing ? crypto.randomUUID() : "",
  );
  const [nextLineKey, setNextLineKey] = useState(startingLines.length + 1);
  const [lines, setLines] = useState<DraftLine[]>(startingLines);
  const [productSearch, setProductSearch] = useState("");
  const [catalogLimit, setCatalogLimit] = useState(PRODUCT_BATCH_SIZE);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [stepMessage, setStepMessage] = useState("");
  const [state, setState] = useState<QbOrderActionState>(initialState);
  const [pending, startTransition] = useTransition();
  const [historyPending, startHistoryTransition] = useTransition();
  const [history, setHistory] = useState<QbRepeatableOrder | null>(null);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submissionInFlightRef = useRef(false);
  const historyRequestRef = useRef(0);
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );
  const linesByProductId = useMemo(
    () => new Map(lines.map((line) => [line.productId, line])),
    [lines],
  );
  const productIndex = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const catalogGroups = useMemo(() => {
    const query = normalizeSearch(productSearch);
    const matchesSearch = (productId: string) => {
      const product = productIndex.get(productId);
      if (!product) return false;
      if (!query) return true;
      return normalizeSearch(
        `${product.name} ${product.categoryName ?? ""}`,
      ).includes(query);
    };
    const lastOrderIds = [
      ...new Set(history?.lines.map((line) => line.productId) ?? []),
    ].filter((productId) => productIndex.has(productId));
    const lastOrderSet = new Set(lastOrderIds);
    const latest = lastOrderIds
      .filter(matchesSearch)
      .map((productId) => productIndex.get(productId)!);
    const alphabetical = products
      .filter(
        (product) => !lastOrderSet.has(product.id) && matchesSearch(product.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name, "es"));

    return {
      latest,
      alphabetical,
      visibleAlphabetical: alphabetical.slice(0, catalogLimit),
    };
  }, [catalogLimit, history, productIndex, productSearch, products]);

  useEffect(() => {
    const request = ++historyRequestRef.current;
    if (!customerId || !locationId) return;

    startHistoryTransition(async () => {
      setHistoryError("");
      const result = await getAverageRepeatableOrderAction(
        customerId,
        locationId,
      );
      if (request !== historyRequestRef.current) return;
      if (result.success) {
        setHistory(result.order);
        setHistoryChecked(true);
      } else {
        setHistoryError(result.message);
        setHistoryChecked(true);
      }
    });
  }, [customerId, locationId]);

  const itemsPayload = useMemo(
    () => serializeOrderItems(lines),
    [lines],
  );

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function toggleProduct(productId: string) {
    const selectedLine = linesByProductId.get(productId);
    if (selectedLine) {
      setLines((current) =>
        current.filter((line) => line.productId !== productId),
      );
      setSelectionMessage("");
      return;
    }
    if (lines.length >= maxSelectedProducts) {
      setSelectionMessage(
        `Puedes incluir hasta ${maxSelectedProducts} productos por pedido.`,
      );
      return;
    }
    const product = products.find((item) => item.id === productId);
    const suggestion = history?.lines.find(
      (item) => item.productId === productId,
    );
    const defaultUnit =
      product?.allowedUnits.find(
        (unit) => unit.id === suggestion?.allowedUnitId,
      ) ??
      product?.allowedUnits.find((unit) => unit.isDefault) ??
      product?.allowedUnits[0];
    if (!product || !defaultUnit) return;
    setLines((current) => [
      ...current,
      {
        key: nextLineKey,
        productId,
        allowedUnitId: defaultUnit.id,
        quantity: String(
          suggestion?.inputMode === "quantity"
            ? suggestion.quantity
            : Math.max(defaultUnit.minQuantity, 0.5),
        ),
        notes: "",
      },
    ]);
    setNextLineKey((current) => current + 1);
    setSelectionMessage("");
  }

  function resetProductSelection() {
    setLines([]);
    setProductSearch("");
    setCatalogLimit(PRODUCT_BATCH_SIZE);
    setSelectionMessage("");
  }

  function productRow(productId: string) {
    const product = productIndex.get(productId);
    if (!product) return null;
    const line = linesByProductId.get(productId);
    const selected = Boolean(line);
    const allowedUnit = line
      ? product.allowedUnits.find((unit) => unit.id === line.allowedUnitId)
      : undefined;
    const suggestedUnitId = history?.lines.find(
      (item) => item.productId === productId,
    )?.allowedUnitId;
    const visibleUnit =
      product.allowedUnits.find((unit) => unit.id === suggestedUnitId) ??
      product.allowedUnits.find((unit) => unit.isDefault) ??
      product.allowedUnits[0];

    return (
      <div
        key={product.id}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`${selected ? "Quitar" : "Seleccionar"} ${product.name}`}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("label, input, select, textarea, button")) {
            toggleProduct(product.id);
          }
        }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            toggleProduct(product.id);
          }
        }}
        className={selected ? "cursor-pointer rounded-lg border border-emerald-400 bg-emerald-50 p-3" : "cursor-pointer rounded-lg border bg-white p-3"}
      >
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            aria-label={`Seleccionar ${product.name}`}
            checked={selected}
            onChange={() => toggleProduct(product.id)}
            className="size-5 rounded border-input accent-emerald-700"
          />
          {product.name}
          {!line ? <span className="ml-auto text-xs text-muted-foreground">{visibleUnit?.label ?? "Sin unidad"}</span> : null}
        </label>
        {line ? <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(110px,1fr)_minmax(100px,1fr)]">
          <label className="space-y-1 text-xs">Unidad <span className="text-blue-700">*</span>
            <select
              aria-label={`Unidad de ${product.name}`}
              value={line.allowedUnitId}
              onChange={(event) =>
                updateLine(line.key, { allowedUnitId: event.target.value })
              }
              required
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {product.allowedUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">Cantidad <span className="text-blue-700">*</span>
            <Input
              aria-label={`Cantidad de ${product.name}`}
              type="number"
              min={Math.max(allowedUnit?.minQuantity ?? 0.5, 0.5)}
              step="0.5"
              value={line.quantity}
              onChange={(event) =>
                updateLine(line.key, { quantity: event.target.value })
              }
              required
              className="h-9"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">Observación
            <Textarea
              aria-label={`Nota de ${product.name}`}
              value={line.notes}
              onChange={(event) =>
                updateLine(line.key, { notes: event.target.value })
              }
              placeholder="Nota opcional"
              maxLength={500}
              rows={1}
              className="min-h-9 resize-y whitespace-pre-wrap"
              onKeyDown={(event) => event.stopPropagation()}
            />
          </label>
        </div> : null}
      </div>
    );
  }

  function selectCustomer(value: string) {
    setStepMessage("");
    resetHistorySelection();
    const customer = customers.find((item) => item.id === value);
    setCustomerId(value);
    setLocationId(
      customer?.locations.find((location) => location.isPrimary)?.id ??
        customer?.locations[0]?.id ??
        "",
    );
  }

  function resetHistorySelection() {
    historyRequestRef.current += 1;
    setHistory(null);
    setHistoryChecked(false);
    setHistoryError("");
  }

  function openForm() {
    setIdempotencyKey((current) => current || crypto.randomUUID());
    setOpen(true);
  }

  function resetAfterConfirmedCreation() {
    setStep(1);
    setStepMessage("");
    setCustomerId("");
    setLocationId("");
    setOperationalDate(boliviaTomorrow());
    setCustomerNotes("");
    setHistory(null);
    setHistoryChecked(false);
    resetProductSelection();
    setNextLineKey(1);
    setIdempotencyKey(crypto.randomUUID());
    formRef.current?.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 2) return;
    if (submissionInFlightRef.current || (!editing && !idempotencyKey)) return;

    const formData = new FormData(event.currentTarget);
    submissionInFlightRef.current = true;
    startTransition(async () => {
      try {
        const result = editing
          ? await updateQbInternalOrderAction(state, formData)
          : await createQbInternalOrderAction(state, formData);
        setState(result);
        if (!editing && result.success && result.orderId && result.reference) {
          resetAfterConfirmedCreation();
        }
        if (editing && result.success) {
          router.refresh();
          onCancelEdit?.();
        }
      } catch {
        setState({
          success: false,
          message:
            "No pudimos confirmar el envío. Conservamos tus datos para que puedas intentarlo nuevamente.",
        });
      } finally {
        submissionInFlightRef.current = false;
      }
    });
  }

  if (!customers.length || !products.length) {
    return (
      <Card className="border-amber-200 bg-amber-50/70">
        <CardHeader>
          <CardTitle>Falta una configuración para crear pedidos</CardTitle>
          <p className="text-sm text-amber-900/80">
            El pedido necesita al menos un cliente con ubicación y un producto con unidad habilitada.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!customers.length ? (
            <Button asChild variant="outline">
              <Link href="/clientes">Crear o revisar clientes</Link>
            </Button>
          ) : null}
          {!products.length ? (
            <Button asChild variant="outline">
              <Link href="/productos">Configurar productos y unidades</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={openForm}>
        <Plus className="size-4" />
        Nuevo pedido
      </Button>
    );
  }

  return (
    <Card className="gap-0 border-emerald-200">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-8 gap-y-3 pb-3">
        <div className="min-w-0 flex-1">
          <CardTitle>{editing ? "Editar pedido" : "Nuevo pedido"}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing
              ? `Actualiza ${editingOrder?.reference}. La edición se bloqueará al iniciar preparación.`
              : "Registra el pedido y envíalo al checklist de preparación."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 border-2 border-blue-600 bg-white px-5 font-semibold text-blue-800 shadow-sm hover:bg-blue-50"
          onClick={() => {
            if (editing) onCancelEdit?.();
            else setOpen(false);
          }}
          disabled={pending}
        >
          Cerrar
        </Button>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="order_mode" value="registered" />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <input type="hidden" name="items" value={itemsPayload} />
          {editingOrder ? (
            <>
              <input type="hidden" name="order_id" value={editingOrder.id} />
              <input
                type="hidden"
                name="expected_updated_at"
                value={editingOrder.updatedAt}
              />
              <input
                type="hidden"
                name="customer_account_id"
                value={customerId}
              />
              <input
                type="hidden"
                name="customer_location_id"
                value={locationId}
              />
            </>
          ) : null}

          <div className="border-b pb-2 text-sm font-semibold text-emerald-900" aria-live="polite">
            {step === 1 ? "Datos del pedido" : "Productos del pedido"}
          </div>

          <div className={step === 1 ? "space-y-3" : "hidden"}>
            <p className="text-sm text-muted-foreground"><span className="font-semibold text-blue-700">*</span> Campos obligatorios</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="internal-customer" className="text-sm font-semibold">Cliente <span className="text-blue-700">*</span></Label>
                <select
                  id="internal-customer"
                  name={editing ? undefined : "customer_account_id"}
                  value={customerId}
                  onChange={(event) => selectCustomer(event.target.value)}
                  required
                  disabled={editing}
                  className="h-12 w-full rounded-md border bg-background px-3 text-base"
                >
                  <option value="">Seleccionar cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.label} — {customer.responsibleName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-location" className="text-sm font-semibold">Ubicación <span className="text-blue-700">*</span></Label>
                <select
                  id="internal-location"
                  name={editing ? undefined : "customer_location_id"}
                  value={locationId}
                  onChange={(event) => {
                    setStepMessage("");
                    resetHistorySelection();
                    setLocationId(event.target.value);
                  }}
                  required
                  disabled={editing}
                  className="h-12 w-full rounded-md border bg-background px-3 text-base"
                >
                  <option value="">Seleccionar ubicación</option>
                  {(selectedCustomer?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label} — {location.address}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="internal-operational-date"
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <CalendarDays className="size-4 text-emerald-700" />
                  Fecha de entrega <span className="text-blue-700">*</span>
                </Label>
                <Input
                  id="internal-operational-date"
                  name="operational_date"
                  type="date"
                  min={boliviaToday()}
                  value={operationalDate}
                  onChange={(event) => {
                    setStepMessage("");
                    setOperationalDate(event.target.value);
                  }}
                  required
                  className="h-12 text-base"
                />
                <p className="text-xs text-muted-foreground">
                  El pedido aparecerá en la planilla de esta fecha.
                </p>
              </div>
            </div>

            {customerId && selectedCustomer && selectedCustomer.locations.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Este cliente no tiene una ubicación de entrega. <Link href="/clientes" className="font-semibold underline">Agrégala en Clientes</Link> para continuar.
              </div>
            ) : null}

            {customerId && locationId ? (
              <section
                className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                aria-labelledby="order-average-title"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      id="order-average-title"
                      className="flex items-center gap-2 font-semibold"
                    >
                      <Clock3 className="size-4 text-emerald-700" />
                      Promedio de los últimos 8 pedidos
                    </h3>
                    {historyPending ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Calculando el promedio del historial…
                      </p>
                    ) : history ? (
                      <div className="mt-2 space-y-1 text-sm">
                        <p>
                          {history.sampleSize} pedido
                          {history.sampleSize === 1 ? "" : "s"} disponible
                          {history.sampleSize === 1 ? "" : "s"} ·{" "}
                          {history.lines.length} productos
                        </p>
                        <p className="text-muted-foreground">
                          Período: {shortDate(history.oldestSubmittedAt)} al{" "}
                          {shortDate(history.submittedAt)}. Las cantidades
                          consideran como cero los productos que no aparecieron
                          en alguno de esos pedidos.
                        </p>
                        <p className="font-medium text-emerald-800">
                          Historial cargado automáticamente. Marca únicamente
                          los productos que necesites; la cantidad sugerida
                          seguirá siendo editable.
                        </p>
                        {!history.sameLocation ? (
                          <p className="font-medium text-amber-800">
                            El promedio incluye pedidos de otras ubicaciones. La
                            ubicación seleccionada no cambiará.
                          </p>
                        ) : null}
                      </div>
                    ) : historyChecked && !historyError ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Este cliente todavía no tiene pedidos anteriores para
                        calcular un promedio.
                      </p>
                    ) : null}
                    {historyError ? (
                      <p className="mt-1 text-sm text-destructive">
                        {historyError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="internal-customer-notes">Notas generales</Label>
              <Textarea id="internal-customer-notes" name="customer_notes" value={customerNotes}
                onChange={(event) => setCustomerNotes(event.target.value)} maxLength={1000} rows={2} />
            </div>
            {stepMessage ? <p role="alert" className="text-sm font-medium text-destructive">{stepMessage}</p> : null}
            <div className="flex justify-end border-t pt-4">
              <Button
                type="button"
                className="min-h-12 w-full border-2 border-blue-800 bg-blue-700 px-6 text-base font-semibold text-white shadow-sm hover:bg-blue-800 sm:w-auto"
                onClick={() => {
                  if (!customerId) setStepMessage("Selecciona un cliente");
                  else if (!locationId) {
                    setStepMessage("Selecciona una ubicación");
                  } else if (!operationalDate) setStepMessage("Selecciona una fecha de entrega");
                  else {
                    setStepMessage("");
                    setStep(2);
                  }
                }}
              >
                Continuar a productos →
              </Button>
            </div>
          </div>

          <section
            className={step === 2 ? "space-y-3" : "hidden"}
            aria-labelledby="order-products-title"
            data-product-order-table
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="order-products-title" className="font-medium">
                  Productos
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Marca el producto y escribe su cantidad en la misma fila. Los
                  sugeridos por el promedio aparecen primero.
                </p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-semibold text-emerald-800" aria-live="polite">
                {lines.length} {lines.length === 1 ? "producto seleccionado" : "productos seleccionados"}
              </div>
            </div>

            <div className="relative max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={productSearch}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setCatalogLimit(PRODUCT_BATCH_SIZE);
                }}
                placeholder="Buscar por producto o categoría"
                aria-label="Buscar en todos los productos"
                className="h-11 border-2 border-slate-300 bg-white pl-9 text-base focus-visible:border-blue-600"
              />
            </div>

            {selectionMessage ? (
              <p className="text-sm font-medium text-amber-800" role="status">
                {selectionMessage}
              </p>
            ) : null}

            <div className="max-h-[36rem] space-y-2 overflow-y-auto rounded-xl border p-2 overscroll-contain">
              {catalogGroups.latest.length ? <h4 className="px-1 text-xs font-bold uppercase text-emerald-900">Sugeridos por pedidos anteriores</h4> : null}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {catalogGroups.latest.map((product) => productRow(product.id))}
              </div>
              {catalogGroups.visibleAlphabetical.length ? <h4 className="px-1 text-xs font-bold uppercase text-slate-700">Otros productos</h4> : null}
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {catalogGroups.visibleAlphabetical.map((product) => productRow(product.id))}
              </div>
              {!catalogGroups.latest.length && !catalogGroups.visibleAlphabetical.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No encontramos productos con esa búsqueda.</p>
              ) : null}
            </div>

            {catalogGroups.visibleAlphabetical.length <
            catalogGroups.alphabetical.length ? (
              <Button
                type="button"
                variant="outline"
                className="border-blue-300 font-semibold text-blue-800 hover:bg-blue-50"
                onClick={() =>
                  setCatalogLimit((current) => current + PRODUCT_BATCH_SIZE)
                }
              >
                <Plus className="size-4" />
                Mostrar{" "}
                {Math.min(
                  PRODUCT_BATCH_SIZE,
                  catalogGroups.alphabetical.length -
                    catalogGroups.visibleAlphabetical.length,
                )}{" "}
                productos más
              </Button>
            ) : null}
          </section>

          {state.message ? (
            <div
              role={state.success ? "status" : "alert"}
              className={state.success && !editing
                ? "rounded-lg border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900 shadow-sm"
                : `rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}
            >
              {state.success && !editing ? (
                <p className="text-base font-bold">✓ Pedido creado correctamente</p>
              ) : null}
              <p className={state.success && !editing ? "mt-1 text-sm" : undefined}>
                {state.message}
                {state.reference ? ` Referencia: ${state.reference}` : ""}
              </p>
            </div>
          ) : null}

          {step === 2 ? <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span>{selectedCustomer?.label} · {operationalDate} · {lines.length} productos seleccionados</span>
            <Button type="button" variant="outline" className="border-2 border-blue-600 px-5 font-semibold text-blue-800 hover:bg-blue-50" onClick={() => setStep(1)}>Volver</Button>
          </div> : null}
          {step === 2 ? <Button
            type="submit"
            className="min-h-11 border-2 border-blue-800 bg-blue-700 px-5 font-semibold text-white hover:bg-blue-800"
            disabled={
              pending ||
              (!editing && !idempotencyKey) ||
              !customerId ||
              !locationId ||
              !operationalDate ||
              lines.length === 0
            }
          >
            <Send className="size-4" />
            {pending
              ? editing
                ? "Guardando..."
                : "Creando..."
              : editing
                ? "Guardar cambios"
                : `Continuar con ${lines.length} productos →`}
          </Button> : null}
        </form>
      </CardContent>
    </Card>
  );
}
