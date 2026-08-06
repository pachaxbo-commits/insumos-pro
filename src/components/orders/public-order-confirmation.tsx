"use client";

import {
  useActionState,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import {
  confirmPublicOrderQuoteAction,
  loadPublicOrderQuoteAction,
  requestPublicOrderContactAction,
} from "@/lib/orders/public-actions";
import { cn } from "@/lib/utils";
import type {
  PublicOrderQuoteActionState,
  PublicOrderQuoteResult,
} from "@/types/orders";

const initialActionState: PublicOrderQuoteActionState = { success: false };
const SESSION_TOKEN_KEY = "insumos-pro:order-confirmation-token";

function subscribeToConfirmationToken(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getConfirmationTokenSnapshot() {
  const fragmentToken = window.location.hash.slice(1).trim();
  return fragmentToken || window.sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

export function PublicOrderConfirmation() {
  const token = useSyncExternalStore(
    subscribeToConfirmationToken,
    getConfirmationTokenSnapshot,
    () => "",
  );
  const [quote, setQuote] = useState<PublicOrderQuoteResult>({ status: "loading" });
  const [isLoading, startLoading] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmPublicOrderQuoteAction,
    initialActionState,
  );
  const [contactState, contactAction, requestingContact] = useActionState(
    requestPublicOrderContactAction,
    initialActionState,
  );

  const loadQuote = useEffectEvent((token: string) => {
    startLoading(async () => {
      const result = await loadPublicOrderQuoteAction(token);
      setQuote(result);
    });
  });

  useEffect(() => {
    if (!token) return;

    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);

    if (window.location.hash) {
      window.history.replaceState(null, "", "/pedido/confirmar");
    }

    loadQuote(token);
  }, [token]);

  const visibleQuote: PublicOrderQuoteResult = token
    ? quote
    : {
        status: "invalid",
        message: "Este enlace no contiene una confirmacion valida.",
      };
  const snapshot = visibleQuote.snapshot;
  const isConfirmed =
    visibleQuote.status === "confirmed" ||
    confirmState.status === "confirmed" ||
    confirmState.status === "already_confirmed";

  if (visibleQuote.status === "loading" || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f1e8] px-4">
        <div className="text-center text-[#385343]">
          <LoaderCircle className="mx-auto size-10 animate-spin" />
          <p className="mt-3 font-semibold">Cargando resumen seguro...</p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f1e8] px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-[#ddd8ca] bg-[#fffdf8] p-7 text-center shadow-xl">
          <TriangleAlert className="mx-auto size-11 text-amber-600" />
          <h1 className="mt-4 font-heading text-2xl font-bold">Resumen no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-[#69736b]">
            {visibleQuote.message ?? "Solicita un enlace actualizado al equipo de ventas."}
          </p>
        </section>
      </main>
    );
  }

  if (isConfirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f1e8] px-4">
        <section className="w-full max-w-xl rounded-[2rem] border border-[#d7dfd5] bg-[#fffdf8] p-7 text-center shadow-xl">
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-10" />
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold">Pedido confirmado</h1>
          <p className="mt-2 text-sm leading-6 text-[#69736b]">
            Referencia <strong>{snapshot.reference}</strong>. El equipo continuara con la entrega.
          </p>
          <p className="mt-5 rounded-2xl bg-[#fff8e5] px-4 py-3 text-sm text-[#6b5d36]">
            El pago y el recibo final se registraran al momento de la entrega.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-6 text-[#28372f] sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-[2rem] bg-[#244d3c] p-6 text-white shadow-xl sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#f0d78f]">
              <PackageCheck className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">
                Resumen final · Version {snapshot.quote_version}
              </p>
              <h1 className="mt-1 font-heading text-3xl font-bold">Confirma tu pedido</h1>
              <p className="mt-2 text-sm text-white/70">
                {snapshot.reference} · {snapshot.customer_name}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-5 rounded-[2rem] border border-[#ddd8ca] bg-[#fffdf8] p-5 shadow-sm sm:p-7">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex gap-2 rounded-2xl bg-[#f2efe6] p-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[#456b52]" />
              <div>
                <p className="font-semibold">
                  {snapshot.delivery_type === "delivery" ? "Delivery" : "Recojo"}
                </p>
                <p className="text-[#6c736d]">
                  {snapshot.delivery_address ?? "Direccion coordinada con ventas"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 rounded-2xl bg-[#f2efe6] p-3">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-[#456b52]" />
              <div>
                <p className="font-semibold">Horario aproximado</p>
                <p className="text-[#6c736d]">{snapshot.delivery_time_window}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {snapshot.items.map((item, index) => {
              const isUnavailable = item.status === "sin_stock" || item.status === "cancelado";
              const isPartial = item.status === "parcial";

              return (
                <article
                  key={`${item.product_name}-${index}`}
                  className={cn(
                    "rounded-2xl border p-4",
                    isUnavailable
                      ? "border-rose-150 bg-rose-50/60"
                      : isPartial
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-[#e2ded2] bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{item.product_name}</h2>
                      <p className="mt-1 text-xs text-[#70766f]">
                        Solicitado: {formatQuantity(item.requested_quantity)}{" "}
                        {item.unit_abbreviation ?? "u"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-semibold",
                        isUnavailable
                          ? "bg-rose-100 text-rose-700"
                          : isPartial
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-700",
                      )}
                    >
                      {isUnavailable
                        ? item.status === "sin_stock"
                          ? "Sin stock"
                          : "No incluido"
                        : isPartial
                          ? "Parcial"
                          : "Preparado"}
                    </span>
                  </div>

                  {!isUnavailable ? (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-[#747a73]">Cantidad real</p>
                        <p className="font-semibold">
                          {formatQuantity(item.actual_quantity)} {item.unit_abbreviation ?? "u"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#747a73]">
                          {formatCurrency(Number(item.final_unit_price))} /{" "}
                          {item.unit_abbreviation ?? "u"}
                        </p>
                        <p className="font-bold text-[#244d3c]">
                          {formatCurrency(Number(item.final_subtotal))}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {item.notes ? (
                    <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-white/70 px-3 py-2 text-xs text-[#676e68]">
                      {item.notes}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="mt-6 border-t border-[#ddd8ca] pt-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#747b72]">
                  Total final
                </p>
                <p className="mt-1 text-sm text-[#6c736d]">
                  Pago esperado: {snapshot.expected_payment_method}
                </p>
              </div>
              <p className="font-heading text-3xl font-bold text-[#244d3c]">
                {formatCurrency(Number(snapshot.final_total))}
              </p>
            </div>
            {snapshot.notes ? (
              <p className="mt-4 rounded-xl bg-[#f2efe6] px-3 py-2 text-sm text-[#666d67]">
                {snapshot.notes}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex gap-2 rounded-2xl border border-[#e4d7ad] bg-[#fff9e8] p-4 text-sm text-[#695b34]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <p>
              Al confirmar aceptas este resumen de cantidades y precios. El pago y recibo final
              se registraran al entregar.
            </p>
          </div>

          {confirmState.message ? (
            <p
              role="status"
              className={cn(
                "mt-4 rounded-xl px-3 py-2 text-sm",
                confirmState.success
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700",
              )}
            >
              {confirmState.message}
            </p>
          ) : null}

          {contactState.message ? (
            <p
              role="status"
              className={cn(
                "mt-4 rounded-xl px-3 py-2 text-sm",
                contactState.success
                  ? "bg-sky-50 text-sky-700"
                  : "bg-rose-50 text-rose-700",
              )}
            >
              {contactState.message}
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <form action={contactAction}>
              <input type="hidden" name="token" value={token} />
              <Button
                type="submit"
                variant="outline"
                disabled={requestingContact || confirming || contactState.success}
                className="h-12 w-full rounded-full bg-white"
              >
                <MessageCircle className="size-4" />
                {contactState.success ? "Contacto solicitado" : "Solicitar contacto"}
              </Button>
            </form>
            <form action={confirmAction}>
              <input type="hidden" name="token" value={token} />
              <Button
                type="submit"
                disabled={confirming || requestingContact}
                className="h-12 w-full rounded-full bg-[#244d3c] text-white hover:bg-[#193f2f]"
              >
                <CheckCircle2 className="size-4" />
                {confirming ? "Confirmando..." : "Confirmar pedido"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
