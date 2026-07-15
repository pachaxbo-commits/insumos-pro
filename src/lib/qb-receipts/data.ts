import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbReceipt,
  QbReceiptCustomerGroup,
  QbReceiptDetailData,
  QbReceiptLine,
  QbReceiptOrder,
  QbReceiptPendingOrder,
  QbReceiptsData,
} from "@/types/qb-receipts";

type ReceiptRow = {
  id: string;
  receipt_number: string;
  status: "borrador" | "emitido" | "anulado";
  customer_account_id: string;
  period_start: string | null;
  period_end: string | null;
  distance_factor_percent: number | string;
  exigency_factor_percent: number | string;
  weather_factor_percent: number | string;
  extraordinary_factor_percent: number | string;
  subtotal_amount: number | string;
  total_amount: number | string;
  visible_note: string | null;
  internal_notes: string | null;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  customer?: CustomerRow | CustomerRow[] | null;
};

type CustomerRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
};

type ReceiptOrderRow = {
  id: string;
  receipt_id: string;
  order_id: string;
  inclusion_status: "borrador" | "emitido" | "anulado";
  order?: { id: string; public_reference: string } | { id: string; public_reference: string }[] | null;
};

type ReceiptLineRow = {
  id: string;
  receipt_id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  delivered_base_quantity: number | string;
  base_unit_symbol: string;
  visible_unit_label: string;
  original_base_price: number | string;
  base_price_used: number | string;
  base_price_edited: boolean;
  save_as_new_base_price: boolean;
  final_unit_price: number | string;
  line_total: number | string;
  notes: string | null;
  order?: { id: string; public_reference: string } | { id: string; public_reference: string }[] | null;
};

type ReceiptEventRow = {
  id: string;
  receipt_id: string;
  event_type: string;
  created_at: string;
};

type PendingOrderRow = {
  id: string;
  public_reference: string;
  customer_account_id: string;
  delivered_at: string | null;
  location_snapshot: Record<string, unknown> | null;
  customer?: CustomerRow | CustomerRow[] | null;
};

type DeliveredMovementRow = {
  order_id: string;
};

function single<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotText(snapshot: Record<string, unknown> | null, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function customerName(customer: CustomerRow | null) {
  return customer?.full_name?.trim() || customer?.email || "Cliente";
}

function mapReceipt(
  row: ReceiptRow,
  orders: QbReceiptOrder[],
  lines: QbReceiptLine[],
  events: ReceiptEventRow[],
): QbReceipt {
  const customer = single(row.customer);

  return {
    id: row.id,
    number: row.receipt_number,
    status: row.status,
    customerId: row.customer_account_id,
    customerName: customerName(customer),
    customerEmail: customer?.email ?? "Sin correo",
    customerPhone: customer?.phone ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    distanceFactorPercent: numberValue(row.distance_factor_percent),
    exigencyFactorPercent: numberValue(row.exigency_factor_percent),
    weatherFactorPercent: numberValue(row.weather_factor_percent),
    extraordinaryFactorPercent: numberValue(row.extraordinary_factor_percent),
    subtotalAmount: numberValue(row.subtotal_amount),
    totalAmount: numberValue(row.total_amount),
    visibleNote: row.visible_note,
    internalNotes: row.internal_notes,
    issuedAt: row.issued_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    orders,
    lines,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      createdAt: event.created_at,
    })),
  };
}

async function getReceiptParts(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  receiptIds: string[],
) {
  if (!receiptIds.length) {
    return {
      ordersByReceipt: new Map<string, QbReceiptOrder[]>(),
      linesByReceipt: new Map<string, QbReceiptLine[]>(),
      eventsByReceipt: new Map<string, ReceiptEventRow[]>(),
    };
  }

  const [ordersResult, linesResult, eventsResult] = await Promise.all([
    supabase
      .from("qb_receipt_orders")
      .select("id, receipt_id, order_id, inclusion_status, order:qb_orders(id, public_reference)")
      .in("receipt_id", receiptIds),
    supabase
      .from("qb_receipt_lines")
      .select("id, receipt_id, order_id, product_id, product_name_snapshot, delivered_base_quantity, base_unit_symbol, visible_unit_label, original_base_price, base_price_used, base_price_edited, save_as_new_base_price, final_unit_price, line_total, notes, order:qb_orders(id, public_reference)")
      .in("receipt_id", receiptIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("qb_receipt_events")
      .select("id, receipt_id, event_type, created_at")
      .in("receipt_id", receiptIds)
      .order("created_at", { ascending: false }),
  ]);

  const ordersByReceipt = new Map<string, QbReceiptOrder[]>();
  if (!ordersResult.error) {
    for (const row of (ordersResult.data ?? []) as ReceiptOrderRow[]) {
      const order = single(row.order);
      const items = ordersByReceipt.get(row.receipt_id) ?? [];
      items.push({
        id: row.id,
        orderId: row.order_id,
        orderReference: order?.public_reference ?? "Pedido",
        status: row.inclusion_status,
      });
      ordersByReceipt.set(row.receipt_id, items);
    }
  }

  const linesByReceipt = new Map<string, QbReceiptLine[]>();
  if (!linesResult.error) {
    for (const row of (linesResult.data ?? []) as ReceiptLineRow[]) {
      const order = single(row.order);
      const items = linesByReceipt.get(row.receipt_id) ?? [];
      items.push({
        id: row.id,
        orderId: row.order_id,
        orderReference: order?.public_reference ?? "Pedido",
        productId: row.product_id,
        productName: row.product_name_snapshot,
        deliveredBaseQuantity: numberValue(row.delivered_base_quantity),
        baseUnitSymbol: row.base_unit_symbol,
        visibleUnitLabel: row.visible_unit_label,
        originalBasePrice: numberValue(row.original_base_price),
        basePriceUsed: numberValue(row.base_price_used),
        basePriceEdited: row.base_price_edited,
        saveAsNewBasePrice: row.save_as_new_base_price,
        finalUnitPrice: numberValue(row.final_unit_price),
        lineTotal: numberValue(row.line_total),
        notes: row.notes,
      });
      linesByReceipt.set(row.receipt_id, items);
    }
  }

  const eventsByReceipt = new Map<string, ReceiptEventRow[]>();
  if (!eventsResult.error) {
    for (const event of (eventsResult.data ?? []) as ReceiptEventRow[]) {
      const items = eventsByReceipt.get(event.receipt_id) ?? [];
      items.push(event);
      eventsByReceipt.set(event.receipt_id, items);
    }
  }

  return { ordersByReceipt, linesByReceipt, eventsByReceipt };
}

async function getPendingReceiptGroups(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
): Promise<QbReceiptCustomerGroup[]> {
  const { data, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_account_id, delivered_at, location_snapshot, customer:customer_accounts(id, email, full_name, phone)")
    .eq("status", "entregado_pendiente_recibo")
    .order("delivered_at", { ascending: false })
    .limit(100);

  if (error) return [];

  const rows = (data ?? []) as PendingOrderRow[];
  const orderIds = rows.map((order) => order.id);
  const movementCounts = new Map<string, number>();

  if (orderIds.length) {
    const { data: movementsData } = await supabase
      .from("qb_order_delivery_movements")
      .select("order_id")
      .in("order_id", orderIds);

    for (const movement of (movementsData ?? []) as DeliveredMovementRow[]) {
      movementCounts.set(movement.order_id, (movementCounts.get(movement.order_id) ?? 0) + 1);
    }
  }

  const groups = new Map<string, QbReceiptCustomerGroup>();

  for (const row of rows) {
    const customer = single(row.customer);
    if (!customer) continue;

    const order: QbReceiptPendingOrder = {
      id: row.id,
      reference: row.public_reference,
      customerId: row.customer_account_id,
      customerName: customerName(customer),
      customerEmail: customer.email,
      customerPhone: customer.phone,
      deliveredAt: row.delivered_at,
      locationLabel: snapshotText(row.location_snapshot, "label"),
      locationAddress: snapshotText(row.location_snapshot, "address"),
      deliveredLineCount: movementCounts.get(row.id) ?? 0,
    };

    const group = groups.get(row.customer_account_id) ?? {
      customerId: row.customer_account_id,
      customerName: customerName(customer),
      customerEmail: customer.email,
      customerPhone: customer.phone,
      orders: [],
    };

    group.orders.push(order);
    groups.set(row.customer_account_id, group);
  }

  return [...groups.values()].sort((left, right) =>
    left.customerName.localeCompare(right.customerName, "es"),
  );
}

export async function getQbReceiptsData(): Promise<QbReceiptsData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { receipts: [], pendingGroups: [], error: "No pudimos cargar los recibos en este momento. Comunícate con el administrador de QB Insumos." };

  const { data, error } = await supabase
    .from("qb_receipts")
    .select("id, receipt_number, status, customer_account_id, period_start, period_end, distance_factor_percent, exigency_factor_percent, weather_factor_percent, extraordinary_factor_percent, subtotal_amount, total_amount, visible_note, internal_notes, issued_at, voided_at, void_reason, created_at, customer:customer_accounts(id, email, full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    return {
      receipts: [],
      pendingGroups: [],
      error: "No pudimos cargar los recibos en este momento. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.",
    };
  }

  const rows = (data ?? []) as ReceiptRow[];
  const receiptIds = rows.map((receipt) => receipt.id);
  const [{ ordersByReceipt, linesByReceipt, eventsByReceipt }, pendingGroups] = await Promise.all([
    getReceiptParts(supabase, receiptIds),
    getPendingReceiptGroups(supabase),
  ]);

  return {
    receipts: rows.map((row) =>
      mapReceipt(
        row,
        ordersByReceipt.get(row.id) ?? [],
        linesByReceipt.get(row.id) ?? [],
        eventsByReceipt.get(row.id) ?? [],
      ),
    ),
    pendingGroups,
  };
}

export async function getQbReceiptDetailData(receiptId: string): Promise<QbReceiptDetailData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { receipt: null, error: "No pudimos cargar el recibo en este momento. Comunícate con el administrador de QB Insumos." };

  const { data, error } = await supabase
    .from("qb_receipts")
    .select("id, receipt_number, status, customer_account_id, period_start, period_end, distance_factor_percent, exigency_factor_percent, weather_factor_percent, extraordinary_factor_percent, subtotal_amount, total_amount, visible_note, internal_notes, issued_at, voided_at, void_reason, created_at, customer:customer_accounts(id, email, full_name, phone)")
    .eq("id", receiptId)
    .maybeSingle<ReceiptRow>();

  if (error || !data) {
    return { receipt: null, error: "No se encontró el recibo solicitado." };
  }

  const { ordersByReceipt, linesByReceipt, eventsByReceipt } = await getReceiptParts(supabase, [data.id]);

  return {
    receipt: mapReceipt(
      data,
      ordersByReceipt.get(data.id) ?? [],
      linesByReceipt.get(data.id) ?? [],
      eventsByReceipt.get(data.id) ?? [],
    ),
  };
}
