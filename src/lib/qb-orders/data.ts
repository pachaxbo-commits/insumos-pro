import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbInternalOrder,
  QbInternalOrderItem,
  QbInternalOrdersData,
  QbPreparationAllowedUnit,
} from "@/types/qb-orders";
import type { QbOrderStatus } from "@/types/qb-catalog";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type OrderRow = {
  id: string;
  public_reference: string;
  status: QbOrderStatus;
  submitted_at: string;
  customer_notes: string | null;
  customer_snapshot: Record<string, unknown> | null;
  location_snapshot: Record<string, unknown> | null;
  delivered_at: string | null;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  source_label: string;
  requested_quantity: number | string;
  base_unit_symbol: string;
  base_quantity: number | string;
  customer_notes: string | null;
  product?:
    | { name: string; stock_current: number | string }
    | { name: string; stock_current: number | string }[]
    | null;
};

type PreparationRow = {
  id: string;
  order_id: string;
  status: "en_preparacion" | "preparado" | "cancelado";
  internal_notes: string | null;
  started_at: string;
  prepared_at: string | null;
};

type PreparationItemRow = {
  id: string;
  preparation_id: string;
  order_item_id: string;
  status: "completo" | "parcial" | "no_disponible";
  actual_allowed_unit_id: string | null;
  actual_source_label: string | null;
  actual_quantity: number | string;
  actual_base_quantity: number | string;
  notes: string | null;
};

type AllowedUnitRow = {
  id: string;
  product_id: string;
  usage_context: "pedido" | "inventario";
  unit_id: string | null;
  presentation_id: string | null;
  min_quantity: number | string | null;
  quantity_step: number | string | null;
  is_default: boolean | null;
  sort_order: number | string | null;
};

type UnitRow = {
  id: string;
  symbol: string;
  name: string;
};

type PresentationRow = {
  id: string;
  symbol: string;
  name: string;
};

function snapshotText(snapshot: Record<string, unknown> | null, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function productName(item: ItemRow) {
  const product = Array.isArray(item.product) ? item.product[0] : item.product;
  return product?.name ?? "Producto QB";
}

function productStock(item: ItemRow) {
  const product = Array.isArray(item.product) ? item.product[0] : item.product;
  return numberOr(product?.stock_current, 0);
}

function numberOr(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getAllowedUnitsByProduct(
  supabase: SupabaseServerClient,
  productIds: string[],
): Promise<Map<string, QbPreparationAllowedUnit[]>> {
  const empty = new Map<string, QbPreparationAllowedUnit[]>();
  if (!productIds.length) return empty;

  const { data: allowedData, error } = await supabase
    .from("qb_product_allowed_units")
    .select("id, product_id, usage_context, unit_id, presentation_id, min_quantity, quantity_step, is_default, sort_order")
    .in("product_id", productIds)
    .in("usage_context", ["pedido", "inventario"])
    .eq("is_active", true)
    .order("usage_context", { ascending: true })
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) return empty;

  const allowedRows = (allowedData ?? []) as AllowedUnitRow[];
  const unitIds = [...new Set(allowedRows.flatMap((row) => (row.unit_id ? [row.unit_id] : [])))];
  const presentationIds = [
    ...new Set(allowedRows.flatMap((row) => (row.presentation_id ? [row.presentation_id] : []))),
  ];

  const [unitsResult, presentationsResult] = await Promise.all([
    unitIds.length
      ? supabase.from("qb_units").select("id, symbol, name").in("id", unitIds)
      : Promise.resolve({ data: [] as UnitRow[], error: null }),
    presentationIds.length
      ? supabase.from("qb_product_presentations").select("id, symbol, name").in("id", presentationIds)
      : Promise.resolve({ data: [] as PresentationRow[], error: null }),
  ]);

  if (unitsResult.error || presentationsResult.error) return empty;

  const units = new Map(((unitsResult.data ?? []) as UnitRow[]).map((unit) => [unit.id, unit]));
  const presentations = new Map(
    ((presentationsResult.data ?? []) as PresentationRow[]).map((presentation) => [
      presentation.id,
      presentation,
    ]),
  );
  const byProduct = new Map<string, QbPreparationAllowedUnit[]>();

  for (const row of allowedRows) {
    const label = row.unit_id
      ? units.get(row.unit_id)?.symbol
      : row.presentation_id
        ? presentations.get(row.presentation_id)?.symbol
        : null;

    if (!label) continue;

    const items = byProduct.get(row.product_id) ?? [];
    items.push({
      id: row.id,
      label,
      usageContext: row.usage_context,
      minQuantity: numberOr(row.min_quantity, 1),
      quantityStep: numberOr(row.quantity_step, 1),
      isDefault: Boolean(row.is_default),
      sortOrder: Number(row.sort_order) || 0,
    });
    byProduct.set(row.product_id, items);
  }

  return byProduct;
}

export async function getQbInternalOrdersData(): Promise<QbInternalOrdersData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { orders: [], error: "Faltan variables publicas de Supabase." };

  const { data: ordersData, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, status, submitted_at, customer_notes, customer_snapshot, location_snapshot, delivered_at")
    .order("submitted_at", { ascending: false })
    .limit(80);

  if (error) {
    return {
      orders: [],
      error:
        "No pudimos cargar pedidos QB. Verifica que la migracion local QB-6 este aplicada.",
    };
  }

  const orders = (ordersData ?? []) as OrderRow[];
  const orderIds = orders.map((order) => order.id);

  if (!orderIds.length) return { orders: [] };

  const { data: itemsData, error: itemsError } = await supabase
    .from("qb_order_items")
    .select("id, order_id, product_id, source_label, requested_quantity, base_unit_symbol, base_quantity, customer_notes, product:products(name, stock_current)")
    .in("order_id", orderIds)
    .order("sort_order", { ascending: true });

  if (itemsError) {
    return {
      orders: [],
      error: "No pudimos cargar el detalle de pedidos QB.",
    };
  }

  const items = (itemsData ?? []) as ItemRow[];
  const preparationResult = await supabase
    .from("qb_order_preparations")
    .select("id, order_id, status, internal_notes, started_at, prepared_at")
    .in("order_id", orderIds);

  const preparations = preparationResult.error
    ? []
    : ((preparationResult.data ?? []) as PreparationRow[]);
  const preparationIds = preparations.map((preparation) => preparation.id);
  const preparationItemsResult = preparationIds.length
    ? await supabase
        .from("qb_order_preparation_items")
        .select("id, preparation_id, order_item_id, status, actual_allowed_unit_id, actual_source_label, actual_quantity, actual_base_quantity, notes")
        .in("preparation_id", preparationIds)
    : { data: [] as PreparationItemRow[], error: null };

  const preparationItems = preparationItemsResult.error
    ? []
    : ((preparationItemsResult.data ?? []) as PreparationItemRow[]);
  const allowedUnitsByProduct = await getAllowedUnitsByProduct(
    supabase,
    [...new Set(items.map((item) => item.product_id))],
  );

  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const item of items) {
    const rows = itemsByOrder.get(item.order_id) ?? [];
    rows.push(item);
    itemsByOrder.set(item.order_id, rows);
  }

  const preparationByOrder = new Map(preparations.map((preparation) => [preparation.order_id, preparation]));
  const preparationItemByOrderItem = new Map(
    preparationItems.map((item) => [item.order_item_id, item]),
  );

  const mappedOrders: QbInternalOrder[] = orders.map((order) => {
    const preparation = preparationByOrder.get(order.id) ?? null;
    const mappedItems: QbInternalOrderItem[] = (itemsByOrder.get(order.id) ?? []).map((item) => {
      const preparationItem = preparationItemByOrderItem.get(item.id) ?? null;

      return {
        id: item.id,
        productId: item.product_id,
        productName: productName(item),
        sourceLabel: item.source_label,
        requestedQuantity: Number(item.requested_quantity) || 0,
        requestedBaseQuantity: Number(item.base_quantity) || 0,
        baseUnitSymbol: item.base_unit_symbol,
        stockCurrent: productStock(item),
        notes: item.customer_notes,
        allowedUnits: allowedUnitsByProduct.get(item.product_id) ?? [],
        preparationItem: preparationItem
          ? {
              id: preparationItem.id,
              status: preparationItem.status,
              actualAllowedUnitId: preparationItem.actual_allowed_unit_id,
              actualSourceLabel: preparationItem.actual_source_label,
              actualQuantity: Number(preparationItem.actual_quantity) || 0,
              actualBaseQuantity: Number(preparationItem.actual_base_quantity) || 0,
              notes: preparationItem.notes,
            }
          : null,
      };
    });

    return {
      id: order.id,
      reference: order.public_reference,
      status: order.status,
      submittedAt: order.submitted_at,
      customerName: snapshotText(order.customer_snapshot, "full_name") ?? "Cliente QB",
      customerEmail: snapshotText(order.customer_snapshot, "email") ?? "Sin correo",
      customerPhone: snapshotText(order.customer_snapshot, "phone"),
      locationLabel: snapshotText(order.location_snapshot, "label"),
      locationAddress: snapshotText(order.location_snapshot, "address"),
      locationReference: snapshotText(order.location_snapshot, "reference"),
      customerNotes: order.customer_notes,
      deliveredAt: order.delivered_at,
      preparation: preparation
        ? {
            id: preparation.id,
            status: preparation.status,
            internalNotes: preparation.internal_notes,
            startedAt: preparation.started_at,
            preparedAt: preparation.prepared_at,
          }
        : null,
      items: mappedItems,
    };
  });

  return { orders: mappedOrders };
}
