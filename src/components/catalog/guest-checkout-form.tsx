"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LocateFixed,
  LogIn,
  Send,
  Trash2,
} from "lucide-react";

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

type Coordinates = {
  latitude: number;
  longitude: number;
};

const GUEST_ATTEMPT_STORAGE_KEY = "qb-insumos:guest-checkout:attempt:v1";
const ADDRESS_CHANGED_MESSAGE = "La dirección cambió. Vuelve a confirmar tu ubicación.";

type GuestAttemptRef = {
  current: StoredGuestAttempt | null;
};

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

function normalizeAddress(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-BO");
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

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Necesitamos tu permiso de ubicación para enviar el pedido.";
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return "No pudimos obtener tu ubicación. Revisa la señal del dispositivo e intenta nuevamente.";
  }
  return "La ubicación tardó demasiado. Intenta nuevamente desde un lugar con mejor señal.";
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
  const [address, setAddress] = useState("");
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "confirmed" | "error">(
    "idle",
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [result, setResult] = useState<QbGuestOrderActionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const addressRef = useRef("");
  const inMemoryAttemptRef = useRef<StoredGuestAttempt | null>(null);
  const cartSignature = useMemo(
    () =>
      JSON.stringify(
        lines.map(({ productId, allowedUnitId, quantity: lineQuantity, notes }) => ({
          productId,
          allowedUnitId,
          quantity: lineQuantity,
          notes: notes ?? "",
        })),
      ),
    [lines],
  );

  function changeAddress(nextAddress: string) {
    addressRef.current = nextAddress;
    setAddress(nextAddress);

    if (coordinates && confirmedAddress && normalizeAddress(nextAddress) !== confirmedAddress) {
      setCoordinates(null);
      setLocationStatus("error");
      setLocationMessage(ADDRESS_CHANGED_MESSAGE);
    }
  }

  function requestLocation() {
    const addressAtRequest = normalizeAddress(addressRef.current);

    if (addressAtRequest.length < 5) {
      setCoordinates(null);
      setConfirmedAddress(null);
      setLocationStatus("error");
      setLocationMessage("Escribe una dirección válida antes de confirmar tu ubicación.");
      return;
    }

    setCoordinates(null);
    setConfirmedAddress(null);
    setLocationMessage("");

    if (!("geolocation" in navigator)) {
      setLocationStatus("error");
      setLocationMessage("Este dispositivo no permite obtener la ubicación actual.");
      return;
    }

    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (normalizeAddress(addressRef.current) !== addressAtRequest) {
          setCoordinates(null);
          setLocationStatus("error");
          setLocationMessage(ADDRESS_CHANGED_MESSAGE);
          return;
        }

        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setConfirmedAddress(addressAtRequest);
        setLocationStatus("confirmed");
        setLocationMessage("Ubicación confirmada");
      },
      (error) => {
        setLocationStatus("error");
        setLocationMessage(locationErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

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

    const normalizedAddress = normalizeAddress(address);
    if (!coordinates || !confirmedAddress || normalizedAddress !== confirmedAddress) {
      setLocationStatus("error");
      setLocationMessage(
        confirmedAddress && normalizedAddress !== confirmedAddress
          ? ADDRESS_CHANGED_MESSAGE
          : "Confirma tu ubicación actual antes de enviar el pedido.",
      );
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
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      label: "Ubicación actual",
      reference: reference || null,
      googlePlaceId: null,
      customerNotes: customerNotes || null,
      idempotencyKey,
      items: lines.map((line) => ({
        productId: line.productId,
        allowedUnitId: line.allowedUnitId,
        quantity: line.quantity,
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
      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" className="h-11" onClick={() => setShowForm(true)}>
          Continuar sin cuenta
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link href="/login?returnTo=%2Fcatalogo%2Fcheckout">
            <LogIn className="size-4" />
            Ingresar a mi cuenta
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

          <div className="space-y-2">
            <Label htmlFor="guest-address">Dirección</Label>
            <Input
              id="guest-address"
              name="address"
              autoComplete="street-address"
              maxLength={300}
              value={address}
              onChange={(event) => changeAddress(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="guest-reference">Referencia opcional</Label>
            <Input id="guest-reference" name="reference" maxLength={300} />
          </div>

          <div className="rounded-lg border bg-muted/30 p-4">
            <Button
              type="button"
              variant="outline"
              disabled={locationStatus === "loading" || submitting}
              onClick={requestLocation}
            >
              {locationStatus === "loading" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <LocateFixed className="size-4" />
              )}
              {locationStatus === "loading" ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
            </Button>
            {locationMessage ? (
              <p
                role={locationStatus === "error" ? "alert" : "status"}
                className={`mt-3 text-sm ${
                  locationStatus === "confirmed" ? "font-medium text-emerald-700" : "text-destructive"
                }`}
              >
                {locationMessage}
              </p>
            ) : null}
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
                      {quantity(line.quantity)} {line.unitLabel}
                    </p>
                    {line.notes ? (
                      <p className="mt-1 text-xs text-muted-foreground">{line.notes}</p>
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
              submitting ||
              locationStatus === "loading" ||
              result?.code === "idempotency_conflict"
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
