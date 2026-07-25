import { ArrowRight, Check, Clock3, PackageCheck, Truck } from "lucide-react";

import { LazyInternalOrderCreator } from "@/components/qb-orders/lazy-internal-order-creator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  QbInternalOrder,
  QbInternalOrderCreationData,
} from "@/types/qb-orders";

const statusLabels: Record<QbInternalOrder["status"], string> = {
  pendiente_preparacion: "Esperando inventario",
  en_preparacion: "En preparación",
  preparado: "Listo para entregar",
  entregado_pendiente_recibo: "Entregado",
  incluido_en_recibo_borrador: "Entregado",
  recibo_emitido: "Entregado",
  cancelado: "Cancelado",
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

export function OrderCreationWorkspace({
  orders,
  creation,
  error,
}: {
  orders: QbInternalOrder[];
  creation?: QbInternalOrderCreationData;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
        <Card className="border-emerald-200 bg-emerald-50/80 shadow-none">
          <CardContent className="flex gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white">
              <Check className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Paso 1 · Administrador
              </p>
              <p className="mt-1 font-semibold">Crear pedido</p>
            </div>
          </CardContent>
        </Card>
        <ArrowRight className="mx-auto hidden size-5 text-muted-foreground lg:block" />
        <Card className="border-dashed bg-white/55 shadow-none">
          <CardContent className="flex gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <PackageCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paso 2 · Inventario
              </p>
              <p className="mt-1 font-semibold">Preparar pedido</p>
            </div>
          </CardContent>
        </Card>
        <ArrowRight className="mx-auto hidden size-5 text-muted-foreground lg:block" />
        <Card className="border-dashed bg-white/55 shadow-none">
          <CardContent className="flex gap-3 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Truck className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paso 3 · Entregador
              </p>
              <p className="mt-1 font-semibold">Confirmar cantidades</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/70 bg-white/85">
        <CardHeader>
          <CardTitle>Nuevo pedido</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Selecciona el cliente, su ubicación y los productos solicitados.
            Inventario recibirá el pedido automáticamente.
          </p>
        </CardHeader>
        <CardContent>
          <LazyInternalOrderCreator initialData={creation} />
          {error ? (
            <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/70 bg-white/75">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Pedidos recientes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Seguimiento de solo lectura. La operación continúa con los otros
              perfiles.
            </p>
          </div>
          <Badge variant="outline">{orders.length} pedidos</Badge>
        </CardHeader>
        <CardContent>
          {!orders.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay pedidos. Crea el primero para iniciar el flujo.
            </div>
          ) : (
            <div className="divide-y rounded-xl border bg-white/70">
              {orders.slice(0, 12).map((order) => (
                <div
                  key={order.id}
                  className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {order.customerName} · {order.reference}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {order.items
                        .map(
                          (item) =>
                            `${item.productName} (${item.requestedQuantity} ${item.sourceLabel})`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {shortDate(order.submittedAt)}
                    </span>
                    <Badge variant="outline">
                      {statusLabels[order.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
