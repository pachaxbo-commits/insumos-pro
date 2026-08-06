"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  Filter,
  PackageCheck,
  Pencil,
  TableProperties,
  Truck,
  X,
} from "lucide-react";

import { LazyInternalOrderCreator } from "@/components/qb-orders/lazy-internal-order-creator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

function deliveryDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeZone: "America/La_Paz",
  }).format(new Date(`${value}T12:00:00-04:00`));
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
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const editingOrder =
    orders.find((order) => order.id === editingOrderId) ?? null;
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const visibleOrders = useMemo(() => {
    const filtered = orders.filter(
      (order) =>
        (!dateFrom || order.operationalDate >= dateFrom) &&
        (!dateTo || order.operationalDate <= dateTo),
    );
    return hasDateFilter ? filtered : filtered.slice(0, 12);
  }, [dateFrom, dateTo, hasDateFilter, orders]);

  function startEditing(orderId: string) {
    setEditingOrderId(orderId);
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

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
                Paso 2 · Inventario o Administrador
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
                Paso 3 · Entregador o Administrador
              </p>
              <p className="mt-1 font-semibold">Confirmar cantidades</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card ref={editorRef} className="border-white/70 bg-white/85">
        <CardHeader>
          <CardTitle>{editingOrder ? "Editar pedido" : "Nuevo pedido"}</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Selecciona el cliente, su ubicación y los productos solicitados.
            También elige la fecha de entrega; el pedido aparecerá
            automáticamente en la planilla de ese día.
          </p>
        </CardHeader>
        <CardContent>
          <LazyInternalOrderCreator
            initialData={creation}
            editingOrder={editingOrder}
            onCancelEdit={() => setEditingOrderId(null)}
          />
          {error ? (
            <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/70 bg-white/75">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Pedidos recientes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Revisa la fecha de entrega o continúa con preparación y entrega.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{orders.length} pedidos</Badge>
            <Button
              type="button"
              size="sm"
              variant={hasDateFilter ? "secondary" : "outline"}
              onClick={() => setFiltersOpen((current) => !current)}
            >
              <Filter className="size-4" />
              Filtrar por fecha
            </Button>
            <Button asChild size="sm">
              <Link href="/matriz-operativa?mode=preparacion">
                <TableProperties className="size-4" />
                Abrir preparación y entregas
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filtersOpen ? (
            <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-slate-50 p-3">
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Entrega desde</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-9 rounded-md border bg-white px-3"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block font-medium">Entrega hasta</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-9 rounded-md border bg-white px-3"
                />
              </label>
              {hasDateFilter ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                  }}
                >
                  <X className="size-4" />
                  Limpiar filtro
                </Button>
              ) : null}
            </div>
          ) : null}
          {!orders.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay pedidos. Crea el primero para iniciar el flujo.
            </div>
          ) : !visibleOrders.length ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No hay pedidos con esas fechas de entrega.
            </div>
          ) : (
            <div className="divide-y rounded-xl border bg-white/70">
              {visibleOrders.map((order) => {
                const canEdit =
                  order.status === "pendiente_preparacion" &&
                  !order.preparation &&
                  !order.deliveredAt;
                return (
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
                    {order.customerNotes ? (
                      <p className="mt-1 text-sm font-medium text-amber-800">
                        Nota: {order.customerNotes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <span className="flex items-center gap-1 text-sm font-semibold text-emerald-800">
                      <CalendarDays className="size-4" />
                      Entrega: {deliveryDate(order.operationalDate)}
                    </span>
                    <span
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                      title="Fecha de creación"
                    >
                      <Clock3 className="size-3.5" />
                      Creado: {shortDate(order.submittedAt)}
                    </span>
                    <Badge variant="outline">
                      {statusLabels[order.status]}
                    </Badge>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => startEditing(order.id)}
                      >
                        <Pencil className="size-4" />
                        Editar pedido
                      </Button>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
