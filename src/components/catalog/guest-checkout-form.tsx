"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LogIn,
  Send,
  Trash2,
  UserPlus,
} from "lucide-react";

import {
  GoogleLocationPicker,
  type GoogleLocationSelection,
} from "@/components/locations/google-location-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveLocalCart } from "@/hooks/use-local-cart";
import { submitQbGuestCatalogOrderAction } from "@/lib/qb-catalog/guest-actions";
import type {
  QbGuestOrderActionResult,
  QbGuestOrderInput,
} from "@/types/qb-guest-order";

export type GuestCheckoutLine = {
  productId: string;
  allowedUnitId: string;
  productName: string;
  unitLabel: string;
  quantity: number;
  inputMode?: "quantity" | "amount_bs";
  requestedAmountBs?: number;
  notes?: string;
};

type GuestCheckoutFormProps = {
  lines: GuestCheckoutLine[];
  onRemove: (productId: string) => void;
};

type StoredGuestAttempt = {
  key: string;
  submittedCartSignature?: string;
};

const GUEST_ATTEMPT_STORAGE_KEY = "qb-insumos:guest-checkout:attempt:v1";

type GuestAttemptRef = {
  current: StoredGuestAttempt | null;
};

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function bolivianos(value: number) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function readStoredAttempt(attemptRef: GuestAttemptRef): StoredGuestAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(GUEST_ATTEMPT_STORAGE_KEY);
    if (!raw) return attemptRef.current;
    const parsed = JSON.parse(raw) as Partial<StoredGuestAttempt>;
    if (typeof parsed.key !== "string" || !parsed.key) return attemptRef.current;
    const storedAttempt = {
      key: parsed.key,
      submittedCartSignature:
        typeof parsed.submittedCartSignature === "string"
          ? parsed.submittedCartSignature
          : undefined,
    };
    attemptRef.current = storedAttempt;
    return storedAttempt;
  } catch {
    return attemptRef.current;
  }
}

function storeAttempt(attemptRef: GuestAttemptRef, attempt: StoredGuestAttempt) {
  attemptRef.current = attempt;
  try {
    window.sessionStorage.setItem(GUEST_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
  } catch {
    // El ref conserva el intento durante esta vista si sessionStorage no esta disponible.
  }
}

function getOrCreateGuestAttempt(attemptRef: GuestAttemptRef, cartSignature: string) {
  const stored = readStoredAttempt(attemptRef);
  const cartChangedAfterSubmit =
    stored?.submittedCartSignature && stored.submittedCartSignature !== cartSignature;
  const attempt = !stored || cartChangedAfterSubmit ? { key: crypto.randomUUID() } : stored;

  storeAttempt(attemptRef, attempt);
  return attempt.key;
}

function markGuestAttemptSubmitted(
  attemptRef: GuestAttemptRef,
  key: string,
  cartSignature: string,
) {
  storeAttempt(attemptRef, { key, submittedCartSignature: cartSignature });
}

function clearGuestAttempt(attemptRef: GuestAttemptRef) {
  attemptRef.current = null;
  try {
    window.sessionStorage.removeItem(GUEST_ATTEMPT_STORAGE_KEY);
  } catch {
    // No hay almacenamiento que limpiar.
  }
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function GuestSuccess({ reference }: { reference: string }) {
  return (
    <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
      <CheckCircle2 className="mx-auto size-12 text-emerald-700" />
      <h2 className="mt-3 text-xl font-semibold text-emerald-950">Pedido enviado a preparación</h2>
      <p className="mt-2 text-sm text-emerald-900">Guarda esta referencia para identificar tu pedido.</p>
      <p className="mt-4 rounded-md bg-background px-4 py-3 font-mono text-lg font-semibold">
        {reference}
      </p>
      <Button asChild className="mt-5 w-full sm:w-auto">
        <Link href="/catalogo">Volver al catálogo</Link>
      </Button>
    </div>
  );
}

export function GuestCheckoutForm({ lines, onRemove }: GuestCheckoutFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [locationSelection, setLocationSelection] = useState<GoogleLocationSelection>({
    address: "",
    latitude: null,
    longitude: null,
    googlePlaceId: null,
  });
  const [result, setResult] = useState<QbGuestOrderActionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inMemoryAttemptRef = useRef<StoredGuestAttempt | null>(null);
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        lines.map(({ productId, allowedUnitId, quantity: lineQuantity, inputMode, requestedAmountBs, notes }) => ({
          productId,
          allowedUnitId,
          quantity: lineQuantity,
          inputMode,
          requestedAmountBs,
          notes: notes ?? "",
        })),
      ),
    [lines],
  );

  async function submitGuestOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || result?.code === "idempotency_conflict") return;

    const formData = new FormData(event.currentTarget);
    const businessName = formText(formData, "business_name");
    const fullName = formText(formData, "full_name");
    const phone = formText(formData, "phone");
    const email = formText(formData, "email");
    const address = formText(formData, "address");
    const reference = formText(formData, "reference");
    const customerNotes = formText(formData, "customer_notes");
    const phoneDigits = phone.replace(/\D/g, "");

    if (businessName.length < 2 || fullName.length < 2 || phoneDigits.length < 7 || address.length < 5) {
      setResult({
        success: false,
        code: "validation_error",
        message: "Completa los datos obligatorios antes de confirmar el pedido.",
      });
      return;
    }

    if (!lines.length) {
      setResult({
        success: false,
        code: "validation_error",
        message: "Agrega al menos un producto al pedido.",
      });
      return;
    }

    const idempotencyKey = getOrCreateGuestAttempt(inMemoryAttemptRef, cartSignature);

    const payload: QbGuestOrderInput = {
      businessName,
      fullName,
      phone,
      email: email || null,
      address,
      latitude: locationSelection.latitude,
      longitude: locationSelection.longitude,
      label: "Ubicación actual",
      reference: reference || null,
      googlePlaceId: locationSelection.googlePlaceId,
      customerNotes: customerNotes || null,
      idempotencyKey,
      items: lines.map((line) => ({
        productId: line.productId,
        inputMode: line.inputMode,
        allowedUnitId: line.allowedUnitId,
        quantity: line.quantity,
        requestedAmountBs: line.requestedAmountBs,
        notes: line.notes ?? null,
      })),
    };

    submittingRef.current = true;
    setSubmitting(true);
    setResult(null);
    markGuestAttemptSubmitted(inMemoryAttemptRef, idempotencyKey, cartSignature);

    try {
      const actionResult = await submitQbGuestCatalogOrderAction(payload);
      setResult(actionResult);

      if (actionResult.success && actionResult.reference) {
        clearGuestAttempt(inMemoryAttemptRef);
        saveLocalCart([]);
      }
    } catch {
      setResult({
        success: false,
        code: "service_unavailable",
        message: "El servicio no está disponible temporalmente. Tu pedido se conserva para reintentar.",
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (result?.success && result.reference) {
    return <GuestSuccess reference={result.reference} />;
  }

  if (!lines.length) {
    return (
      <div className="mt-5 rounded-lg border bg-muted/40 p-5">
        <p className="font-medium">Tu pedido está vacío.</p>
        <Button asChild className="mt-4">
          <Link href="/catalogo">Volver al catálogo</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Button type="button" className="h-11" onClick={() => setShowForm(true)}>
          Continuar sin cuenta
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/login?returnTo=%2Fcatalogo%2Fcheckout">
            <LogIn className="size-4" />
            Ingresar a mi cuenta
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/registro?returnTo=%2Fcatalogo%2Fcheckout">
            <UserPlus className="size-4" />
            Crear una cuenta
          </Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        El carrito se conserva en este navegador si decides iniciar sesión.
      </p>

      {showForm ? (
        <form className="space-y-5 border-t pt-5" onSubmit={submitGuestOrder}>
          {result?.message ? (
            <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
              <AlertCircle className="size-4" />
              <AlertTitle>No pudimos confirmar el pedido</AlertTitle>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="guest-business-name">Nombre del negocio</Label>
              <Input id="guest-business-name" name="business_name" maxLength={120} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-full-name">Nombre del responsable</Label>
              <Input id="guest-full-name" name="full_name" maxLength={120} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-phone">Teléfono o WhatsApp</Label>
              <Input
                id="guest-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={25}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-email">Correo opcional</Label>
              <Input
                id="guest-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
              />
            </div>
          </div>

          <GoogleLocationPicker
            idPrefix="guest"
            mode="guest"
            onChange={setLocationSelection}
          />
          <p className="text-sm text-muted-foreground">
            Agregar el punto en el mapa ayuda a encontrar la dirección con mayor precisión.
          </p>

          <div className="space-y-2">
            <Label htmlFor="guest-reference">Referencia opcional</Label>
            <Input id="guest-reference" name="reference" maxLength={300} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-notes">Notas opcionales</Label>
            <Textarea id="guest-notes" name="customer_notes" rows={3} maxLength={1000} />
          </div>

          <div className="space-y-3">
            {lines.map((line) => (
              <article key={line.productId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{line.productName}</p>
                    <p className="text-sm text-muted-foreground">
                      {line.inputMode === "amount_bs"
                        ? `Solicitado por importe: Bs ${bolivianos(line.requestedAmountBs ?? 0)}`
                        : `Solicitado por cantidad: ${quantity(line.quantity)} ${line.unitLabel}`}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{line.notes}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={submitting}
                    onClick={() => onRemove(line.productId)}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Quitar {line.productName}</span>
                  </Button>
                </div>
              </article>
            ))}
          </div>

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={
              submitting || result?.code === "idempotency_conflict"
            }
          >
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {submitting ? "Procesando pedido..." : "Confirmar pedido"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
