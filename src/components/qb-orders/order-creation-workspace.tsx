"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Filter,
  Pencil,
  TableProperties,
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
      <section aria-label="Etapas del pedido" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-white/80 px-4 py-3 text-sm font-semibold sm:text-base">
        <span className="text-emerald-800">1. Crear pedido</span>
        <span aria-hidden="true" className="text-slate-400">→</span>
        <span className="text-slate-700">2. Preparar</span>
        <span aria-hidden="true" className="text-slate-400">→</span>
        <span className="text-slate-700">3. Entregar</span>
      </section>

      <section ref={editorRef} className="scroll-mt-6 space-y-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold">
            {editingOrder ? "Editar pedido" : "Crear un pedido"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Selecciona el cliente y la entrega; después elige los productos.
          </p>
        </div>
        <LazyInternalOrderCreator
          initialData={creation}
          editingOrder={editingOrder}
          onCancelEdit={() => setEditingOrderId(null)}
        />
        {error ? (
          <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
      </section>

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
            <Button asChild size="sm" className="min-h-11 bg-blue-700 px-5 text-base font-semibold text-white shadow-sm hover:bg-blue-800">
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
