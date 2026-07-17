"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { Minus, Plus, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createQbInternalOrderAction } from "@/lib/qb-orders/actions";
import type {
  QbInternalOrderCreationData,
  QbOrderActionState,
} from "@/types/qb-orders";

const initialState: QbOrderActionState = { success: false };
let currentInternalOrderKey = "";

function subscribeToInternalOrderKey() {
  return () => undefined;
}

function getInternalOrderKey() {
  if (!currentInternalOrderKey) currentInternalOrderKey = crypto.randomUUID();
  return currentInternalOrderKey;
}

type DraftLine = {
  key: number;
  productId: string;
  allowedUnitId: string;
  quantity: string;
  notes: string;
};

function blankLine(key: number): DraftLine {
  return { key, productId: "", allowedUnitId: "", quantity: "", notes: "" };
}

export function InternalOrderCreator({
  customers,
  products,
}: QbInternalOrderCreationData) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"registered" | "guest">("registered");
  const [customerId, setCustomerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const idempotencyKey = useSyncExternalStore(
    subscribeToInternalOrderKey,
    getInternalOrderKey,
    () => "",
  );
  const [nextLineKey, setNextLineKey] = useState(2);
  const [lines, setLines] = useState<DraftLine[]>([blankLine(1)]);
  const [state, action, pending] = useActionState(createQbInternalOrderAction, initialState);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);

  const itemsPayload = useMemo(
    () =>
      JSON.stringify(
        lines.map((line) => ({
          productId: line.productId,
          allowedUnitId: line.allowedUnitId,
          quantity: Number(line.quantity),
          notes: line.notes,
        })),
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
    const defaultUnit = product?.allowedUnits.find((unit) => unit.isDefault) ?? product?.allowedUnits[0];
    updateLine(key, {
      productId,
      allowedUnitId: defaultUnit?.id ?? "",
      quantity: defaultUnit ? String(defaultUnit.minQuantity) : "",
    });
  }

  function selectCustomer(value: string) {
    const customer = customers.find((item) => item.id === value);
    setCustomerId(value);
    setLocationId(
      customer?.locations.find((location) => location.isPrimary)?.id ??
        customer?.locations[0]?.id ??
        "",
    );
  }

  function addLine() {
    setLines((current) => [...current, blankLine(nextLineKey)]);
    setNextLineKey((current) => current + 1);
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
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
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cerrar
        </Button>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-5">
          <input type="hidden" name="order_mode" value={mode} />
          <input type="hidden" name="idempotency_key" value={idempotencyKey} />
          <input type="hidden" name="items" value={itemsPayload} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="internal-order-mode">Tipo de cliente</Label>
              <select
                id="internal-order-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value as "registered" | "guest")}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="registered">Cliente registrado</option>
                <option value="guest">Cliente sin cuenta</option>
              </select>
            </div>
          </div>

          {mode === "registered" ? (
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
                  onChange={(event) => setLocationId(event.target.value)}
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
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="guest-business">Negocio</Label>
                <Input id="guest-business" name="business_name" required minLength={2} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-responsible">Responsable</Label>
                <Input id="guest-responsible" name="responsible_name" required minLength={2} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-phone">Teléfono</Label>
                <Input id="guest-phone" name="phone" required maxLength={25} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-email">Correo opcional</Label>
                <Input id="guest-email" name="email" type="email" maxLength={254} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="guest-address">Dirección</Label>
                <Input id="guest-address" name="address" required minLength={5} maxLength={300} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-location-label">Nombre de la ubicación</Label>
                <Input id="guest-location-label" name="location_label" maxLength={80} placeholder="Principal" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-reference">Referencia</Label>
                <Input id="guest-reference" name="location_reference" maxLength={300} />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Productos</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={lines.length >= 30}>
                <Plus className="size-4" />
                Agregar producto
              </Button>
            </div>

            {lines.map((line, index) => {
              const product = products.find((item) => item.id === line.productId);
              const allowedUnit = product?.allowedUnits.find((unit) => unit.id === line.allowedUnitId);
              return (
                <div key={line.key} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_180px_130px_1fr_auto]">
                  <select
                    aria-label={`Producto ${index + 1}`}
                    value={line.productId}
                    onChange={(event) => selectProduct(line.key, event.target.value)}
                    required
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Seleccionar producto</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`Unidad ${index + 1}`}
                    value={line.allowedUnitId}
                    onChange={(event) => updateLine(line.key, { allowedUnitId: event.target.value })}
                    required
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Unidad</option>
                    {(product?.allowedUnits ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>{unit.label}</option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Cantidad ${index + 1}`}
                    type="number"
                    min={allowedUnit?.minQuantity ?? 0.001}
                    step={allowedUnit?.quantityStep ?? 0.001}
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    required
                  />
                  <Input
                    aria-label={`Nota ${index + 1}`}
                    value={line.notes}
                    onChange={(event) => updateLine(line.key, { notes: event.target.value })}
                    placeholder="Nota opcional"
                    maxLength={500}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
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
            <Textarea id="internal-customer-notes" name="customer_notes" maxLength={1000} rows={2} />
          </div>

          {state.message ? (
            <p className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-destructive/5 text-destructive"}`}>
              {state.message}{state.reference ? ` Referencia: ${state.reference}` : ""}
            </p>
          ) : null}

          <Button type="submit" disabled={pending || !idempotencyKey || state.success}>
            <Send className="size-4" />
            {pending ? "Creando..." : "Crear pedido"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
