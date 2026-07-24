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
import { Clock3, Minus, Plus, RotateCcw, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProductCombobox } from "@/components/products/product-combobox";
import { createQbInternalOrderAction } from "@/lib/qb-orders/actions";
import { getLastRepeatableOrderAction } from "@/lib/qb-orders/creation-actions";
import type {
  QbInternalOrderCreationData,
  QbOrderActionState,
  QbRepeatableOrder,
} from "@/types/qb-orders";

const initialState: QbOrderActionState = { success: false };

type DraftLine = {
  key: number;
  productId: string;
  allowedUnitId: string;
  quantity: string;
  inputMode: "quantity" | "amount_bs";
  requestedAmountBs: string;
  notes: string;
};

function blankLine(key: number): DraftLine {
  return {
    key,
    productId: "",
    allowedUnitId: "",
    quantity: "",
    inputMode: "quantity",
    requestedAmountBs: "",
    notes: "",
  };
}

type GuestDraft = {
  businessName: string;
  responsibleName: string;
  phone: string;
  email: string;
  address: string;
  locationLabel: string;
  locationReference: string;
};

const blankGuestDraft: GuestDraft = {
  businessName: "",
  responsibleName: "",
  phone: "",
  email: "",
  address: "",
  locationLabel: "",
  locationReference: "",
};

function numberOrNull(value: string) {
  return value.trim() ? Number(value) : null;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function InternalOrderCreator({
  customers,
  products,
  initiallyOpen = false,
}: QbInternalOrderCreationData & { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<"registered" | "guest">("registered");
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [guest, setGuest] = useState<GuestDraft>(blankGuestDraft);
  const [customerNotes, setCustomerNotes] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    initiallyOpen ? crypto.randomUUID() : "",
  );
  const [nextLineKey, setNextLineKey] = useState(2);
  const [lines, setLines] = useState<DraftLine[]>([blankLine(1)]);
  const [state, setState] = useState<QbOrderActionState>(initialState);
  const [pending, startTransition] = useTransition();
  const [historyPending, startHistoryTransition] = useTransition();
  const [history, setHistory] = useState<QbRepeatableOrder | null>(null);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [repeatMessage, setRepeatMessage] = useState("");
  const [repeatedOrderId, setRepeatedOrderId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const submissionInFlightRef = useRef(false);
  const historyRequestRef = useRef(0);
  const repeatLoadingRef = useRef(false);
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId,
  );

  useEffect(() => {
    const request = ++historyRequestRef.current;
    if (mode !== "registered" || !customerId || !locationId) return;

    startHistoryTransition(async () => {
      const result = await getLastRepeatableOrderAction(customerId, locationId);
      if (request !== historyRequestRef.current) return;
      if (result.success) {
        setHistory(result.order);
        setHistoryChecked(true);
      } else {
        setHistoryError(result.message);
        setHistoryChecked(true);
      }
    });
  }, [customerId, locationId, mode]);

  const itemsPayload = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) =>
          line.inputMode === "amount_bs"
            ? {
                productId: line.productId,
                inputMode: line.inputMode,
                requestedAmountBs: numberOrNull(line.requestedAmountBs),
                notes: line.notes,
              }
            : {
                productId: line.productId,
                inputMode: line.inputMode,
                allowedUnitId: line.allowedUnitId || null,
                quantity: numberOrNull(line.quantity),
                notes: line.notes,
              },
        ),
      ),
    [lines],
  );

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function selectProduct(key: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    const defaultUnit =
      product?.allowedUnits.find((unit) => unit.isDefault) ??
      product?.allowedUnits[0];
    updateLine(key, {
      productId,
      allowedUnitId: defaultUnit?.id ?? "",
      quantity: defaultUnit ? String(defaultUnit.minQuantity) : "",
      inputMode: "quantity",
      requestedAmountBs: "",
    });
  }

  function selectCustomer(value: string) {
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
    setRepeatMessage("");
    setRepeatedOrderId("");
  }

  function addLine() {
    setLines((current) => [...current, blankLine(nextLineKey)]);
    setNextLineKey((current) => current + 1);
  }

  function repeatLastOrder() {
    if (!history || repeatLoadingRef.current || repeatedOrderId === history.id)
      return;
    repeatLoadingRef.current = true;
    const repeatedLines = history.lines
      .map((item, index) => {
        const product = products.find(
          (candidate) => candidate.id === item.productId,
        );
        if (!product) return null;
        const allowedUnit =
          product.allowedUnits.find((unit) => unit.id === item.allowedUnitId) ??
          product.allowedUnits.find((unit) => unit.isDefault) ??
          product.allowedUnits[0];
        if (!allowedUnit) return null;
        return {
          key: nextLineKey + index,
          productId: item.productId,
          allowedUnitId: allowedUnit.id,
          inputMode:
            item.inputMode === "amount_bs" && product.amountBsAvailable
              ? "amount_bs"
              : "quantity",
          quantity: String(item.quantity),
          requestedAmountBs:
            item.requestedAmountBs === null
              ? ""
              : String(item.requestedAmountBs),
          notes: item.notes,
        } satisfies DraftLine;
      })
      .filter((line): line is DraftLine => line !== null);

    if (!repeatedLines.length) {
      setRepeatMessage(
        "Los productos de ese pedido ya no están disponibles para repetir.",
      );
      repeatLoadingRef.current = false;
      return;
    }
    setLines(repeatedLines);
    setNextLineKey(nextLineKey + repeatedLines.length);
    setRepeatedOrderId(history.id);
    setRepeatMessage(
      `Se cargaron ${repeatedLines.length} productos del pedido del ${shortDate(history.submittedAt)}. Puedes editarlos antes de crear el nuevo pedido.`,
    );
    repeatLoadingRef.current = false;
  }

  function cancelRepeat() {
    setLines([blankLine(nextLineKey)]);
    setNextLineKey((current) => current + 1);
    setRepeatedOrderId("");
    setRepeatMessage("");
  }

  function updateGuest(patch: Partial<GuestDraft>) {
    setGuest((current) => ({ ...current, ...patch }));
  }

  function openForm() {
    setIdempotencyKey((current) => current || crypto.randomUUID());
    setOpen(true);
  }

  function resetAfterConfirmedCreation() {
    setMode("registered");
    setCustomerId("");
    setLocationId("");
    setGuest(blankGuestDraft);
    setCustomerNotes("");
    setHistory(null);
    setHistoryChecked(false);
    setRepeatMessage("");
    setRepeatedOrderId("");
    setLines([blankLine(1)]);
    setNextLineKey(2);
    setIdempotencyKey(crypto.randomUUID());
    formRef.current?.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlightRef.current || !idempotencyKey) return;

    const formData = new FormData(event.currentTarget);
    submissionInFlightRef.current = true;
    startTransition(async () => {
      try {
        const result = await createQbInternalOrderAction(state, formData);
        setState(result);
        if (result.success && result.orderId && result.reference) {
          resetAfterConfirmedCreation();
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

  if (!open) {
    return (
      <Button type="button" onClick={openForm}>
        <Plus className="size-4" />
        Nuevo pedido
      </Button>
    );
  }

  return (
    <Card className="border-emerald-200">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Nuevo pedido</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra el pedido y envíalo al checklist de preparación.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cerrar
        </Button>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          <input type="hidden" name="order_mode" value={mode} />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <input type="hidden" name="items" value={itemsPayload} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="internal-order-mode">Tipo de cliente</Label>
              <select
                id="internal-order-mode"
                value={mode}
                onChange={(event) => {
                  resetHistorySelection();
                  setMode(event.target.value as "registered" | "guest");
                }}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="registered">Cliente registrado</option>
                <option value="guest">Cliente sin cuenta</option>
              </select>
            </div>
          </div>

          {mode === "registered" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="internal-customer">Cliente</Label>
                <select
                  id="internal-customer"
                  name="customer_account_id"
                  value={customerId}
                  onChange={(event) => selectCustomer(event.target.value)}
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
                <Label htmlFor="internal-location">Ubicación</Label>
                <select
                  id="internal-location"
                  name="customer_location_id"
                  value={locationId}
                  onChange={(event) => {
                    resetHistorySelection();
                    setLocationId(event.target.value);
                  }}
                  required
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Seleccionar ubicación</option>
                  {(selectedCustomer?.locations ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label} — {location.address}
                    </option>
                  ))}
                </select>
              </div>
              </div>

              {customerId && locationId ? (
                <section
                  className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
                  aria-labelledby="last-order-title"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3
                        id="last-order-title"
                        className="flex items-center gap-2 font-semibold"
                      >
                        <Clock3 className="size-4 text-emerald-700" />
                        Último pedido
                      </h3>
                      {historyPending ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Consultando el pedido más reciente…
                        </p>
                      ) : history ? (
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            {shortDate(history.submittedAt)} ·{" "}
                            {history.lines.length} productos
                          </p>
                          <p className="text-muted-foreground">
                            Origen: {history.locationLabel}
                          </p>
                          {!history.sameLocation ? (
                            <p className="font-medium text-amber-800">
                              Este pedido proviene de otra ubicación. La
                              ubicación seleccionada no cambiará.
                            </p>
                          ) : null}
                        </div>
                      ) : historyChecked && !historyError ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Este cliente todavía no tiene pedidos anteriores para
                          repetir.
                        </p>
                      ) : null}
                      {historyError ? (
                        <p className="mt-1 text-sm text-destructive">
                          {historyError}
                        </p>
                      ) : null}
                    </div>
                    {history ? (
                      <Button
                        type="button"
                        onClick={repeatLastOrder}
                        disabled={
                          historyPending || repeatedOrderId === history.id
                        }
                      >
                        <RotateCcw className="size-4" />
                        {repeatedOrderId === history.id
                          ? "Pedido cargado"
                          : "Repetir último pedido"}
                      </Button>
                    ) : null}
                  </div>
                  {repeatMessage ? (
                    <div
                      className="mt-3 flex items-start justify-between gap-3 rounded-lg bg-white p-3 text-sm text-emerald-900"
                      role="status"
                    >
                      <span>{repeatMessage}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={cancelRepeat}
                      >
                        <X className="size-4" />
                        Cancelar repetición
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="guest-business">Negocio</Label>
                <Input
                  id="guest-business"
                  name="business_name"
                  value={guest.businessName}
                  onChange={(event) =>
                    updateGuest({ businessName: event.target.value })
                  }
                  required
                  minLength={2}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-responsible">Responsable</Label>
                <Input
                  id="guest-responsible"
                  name="responsible_name"
                  value={guest.responsibleName}
                  onChange={(event) =>
                    updateGuest({ responsibleName: event.target.value })
                  }
                  required
                  minLength={2}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-phone">Teléfono</Label>
                <Input
                  id="guest-phone"
                  name="phone"
                  value={guest.phone}
                  onChange={(event) =>
                    updateGuest({ phone: event.target.value })
                  }
                  required
                  maxLength={25}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-email">Correo opcional</Label>
                <Input
                  id="guest-email"
                  name="email"
                  value={guest.email}
                  onChange={(event) =>
                    updateGuest({ email: event.target.value })
                  }
                  type="email"
                  maxLength={254}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="guest-address">Dirección</Label>
                <Input
                  id="guest-address"
                  name="address"
                  value={guest.address}
                  onChange={(event) =>
                    updateGuest({ address: event.target.value })
                  }
                  required
                  minLength={5}
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-location-label">
                  Nombre de la ubicación
                </Label>
                <Input
                  id="guest-location-label"
                  name="location_label"
                  value={guest.locationLabel}
                  onChange={(event) =>
                    updateGuest({ locationLabel: event.target.value })
                  }
                  maxLength={80}
                  placeholder="Principal"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-reference">Referencia</Label>
                <Input
                  id="guest-reference"
                  name="location_reference"
                  value={guest.locationReference}
                  onChange={(event) =>
                    updateGuest({ locationReference: event.target.value })
                  }
                  maxLength={300}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Productos</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                disabled={lines.length >= 30}
              >
                <Plus className="size-4" />
                Agregar producto
              </Button>
            </div>

            {lines.map((line, index) => {
              const product = products.find(
                (item) => item.id === line.productId,
              );
              const allowedUnit = product?.allowedUnits.find(
                (unit) => unit.id === line.allowedUnitId,
              );
              return (
                <div
                  key={line.key}
                  className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_150px_180px_130px_1fr_auto]"
                >
                  <ProductCombobox
                    ariaLabel={`Producto ${index + 1}`}
                    value={line.productId}
                    onValueChange={(productId) =>
                      selectProduct(line.key, productId)
                    }
                    options={products.map((item) => ({
                      id: item.id,
                      name: item.name,
                      category: item.categoryName,
                      unit: item.allowedUnits[0]?.label,
                    }))}
                    placeholder="Buscar producto"
                  />
                  <select
                    aria-label={`Forma de pedido ${index + 1}`}
                    value={line.inputMode}
                    onChange={(event) =>
                      updateLine(line.key, {
                        inputMode: event.target.value as
                          "quantity" | "amount_bs",
                      })
                    }
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="quantity">Por cantidad</option>
                    {product?.amountBsAvailable ? (
                      <option value="amount_bs">Por importe en Bs</option>
                    ) : null}
                  </select>
                  {line.inputMode === "quantity" ? (
                    <select
                      aria-label={`Unidad ${index + 1}`}
                      value={line.allowedUnitId}
                      onChange={(event) =>
                        updateLine(line.key, {
                          allowedUnitId: event.target.value,
                        })
                      }
                      required
                      className="h-10 rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="">Unidad</option>
                      {(product?.allowedUnits ?? []).map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
                      Unidad física calculada por el servidor
                    </div>
                  )}
                  {line.inputMode === "quantity" ? (
                    <Input
                      aria-label={`Cantidad ${index + 1}`}
                      type="number"
                      min={allowedUnit?.minQuantity ?? 0.001}
                      step={allowedUnit?.quantityStep ?? 0.001}
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.key, { quantity: event.target.value })
                      }
                      required
                    />
                  ) : (
                    <Input
                      aria-label={`Importe en Bs ${index + 1}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.requestedAmountBs}
                      onChange={(event) =>
                        updateLine(line.key, {
                          requestedAmountBs: event.target.value,
                        })
                      }
                      placeholder="Bs"
                      required
                    />
                  )}
                  <Input
                    aria-label={`Nota ${index + 1}`}
                    value={line.notes}
                    onChange={(event) =>
                      updateLine(line.key, { notes: event.target.value })
                    }
                    placeholder="Nota opcional"
                    maxLength={500}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                  >
                    <Minus className="size-4" />
                    <span className="sr-only">Quitar producto</span>
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="internal-customer-notes">Notas generales</Label>
            <Textarea
              id="internal-customer-notes"
              name="customer_notes"
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
              maxLength={1000}
              rows={2}
            />
          </div>

          {state.message ? (
            <div
              className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}
            >
              {state.message}
              {state.reference ? ` Referencia: ${state.reference}` : ""}
              {state.success && state.orderId ? (
                <Button asChild className="mt-3 flex w-fit">
                  <Link
                    href={`/matriz-operativa?date=${new Intl.DateTimeFormat("en-CA", {
                      timeZone: "America/La_Paz",
                    }).format(new Date())}&mode=preparacion&order=${state.orderId}`}
                  >
                    Abrir en Matriz operativa
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" disabled={pending || !idempotencyKey}>
            <Send className="size-4" />
            {pending ? "Creando..." : "Crear pedido"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
