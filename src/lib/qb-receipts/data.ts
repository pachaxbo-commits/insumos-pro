import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbReceipt,
  QbReceiptComparisonUnit,
  QbReceiptCustomerGroup,
  QbReceiptDetailData,
  QbReceiptLine,
  QbReceiptOrder,
  QbReceiptPendingOrder,
  QbReceiptsData,
} from "@/types/qb-receipts";
import type { UserRole } from "@/types/auth";
import { resolveWeightUnitFactor } from "@/lib/qb-receipts/unit-cost-normalization";

type ReceiptRow = {
  id: string;
  receipt_number: string;
  status: "borrador" | "emitido" | "anulado";
  pricing_mode?: "legacy" | "line_cost_markup";
  cost_total_precise?: number | string | null;
  sale_total_precise?: number | string | null;
  profit_total_precise?: number | string | null;
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
  receipt_sent_at: string | null;
  receipt_sent_by: string | null;
  payment_status: "pendiente" | "pagado" | "cobrado";
  paid_at: string | null;
  paid_by: string | null;
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
  order?:
    | { id: string; public_reference: string }
    | { id: string; public_reference: string }[]
    | null;
};

type ReceiptLineRow = {
  id: string;
  receipt_id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  product_code_snapshot?: string | null;
  category_name_snapshot?: string | null;
  delivered_base_quantity: number | string;
  actual_weight_value?: number | string | null;
  actual_weight_unit_id?: string | null;
  actual_weight_unit_symbol?: string | null;
  actual_weight_kg?: number | string | null;
  base_unit_id?: string | null;
  base_unit_symbol: string;
  visible_unit_label: string;
  order_input_mode: "quantity" | "amount_bs";
  requested_amount_bs: number | string | null;
  currency_snapshot: string | null;
  pricing_unit_id: string | null;
  estimated_base_quantity: number | string | null;
  fixed_line_amount: number | string | null;
  original_base_price: number | string | null;
  base_price_used: number | string | null;
  base_price_edited: boolean;
  save_as_new_base_price: boolean;
  final_unit_price: number | string | null;
  line_total: number | string | null;
  purchase_cost_total: number | string | null;
  cost_base_unit_snapshot?: number | string | null;
  cost_total_precise?: number | string | null;
  sale_total_precise?: number | string | null;
  profit_unit_precise?: number | string | null;
  profit_total_precise?: number | string | null;
  cost_source?: "manual" | "purchase_snapshot" | "fifo" | null;
  distance_factor_percent?: number | string;
  exigency_factor_percent?: number | string;
  weather_factor_percent?: number | string;
  extraordinary_factor_percent?: number | string;
  purchase_cost_reference_unit_id: string | null;
  purchase_cost_reference_value: number | string | null;
  notes: string | null;
  order?:
    | { id: string; public_reference: string }
    | { id: string; public_reference: string }[]
    | null;
};

type ReceiptEventRow = {
  id: string;
  receipt_id: string;
  event_type: string;
  created_at: string;
};

type ProductPriceRow = {
  product_id: string;
  base_sale_price: number | string | null;
  base_price_unit_id: string | null;
};

type ProductMetaRow = { id: string; sku: string | null; category?:
  { name: string } | { name: string }[] | null };

type UnitSymbolRow = {
  id: string;
  name: string;
  symbol: string;
  code: string;
  dimension_id: string;
  conversion_factor_to_base: number | string;
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
  delivered_base_quantity: number | string;
};

type SupervisorReceiptRow = {
  id: string; receipt_number: string; status: QbReceipt["status"];
  pricing_mode: QbReceipt["pricingMode"]; customer_account_id: string;
  customer_name: string; customer_email: string; customer_phone: string | null;
  period_start: string | null; period_end: string | null;
  subtotal_amount: number | string; total_amount: number | string;
  visible_note: string | null; issued_at: string | null;
  receipt_sent_at: string | null; receipt_sent_by: string | null;
  payment_status: QbReceipt["paymentStatus"]; paid_at: string | null;
  paid_by: string | null; voided_at: string | null; void_reason: string | null;
  created_at: string;
};

type SupervisorReceiptLineRow = {
  id: string; receipt_id: string; order_id: string; order_reference: string;
  product_id: string; product_name_snapshot: string; product_code_snapshot: string | null;
  category_name_snapshot: string | null; delivered_base_quantity: number | string;
  base_unit_symbol: string; visible_unit_label: string;
  order_input_mode: QbReceiptLine["inputMode"];
  requested_amount_bs: number | string | null; currency_snapshot: string | null;
  pricing_unit_symbol: string | null; estimated_base_quantity: number | string | null;
  fixed_line_amount: number | string | null; base_price_used: number | string | null;
  final_unit_price: number | string | null; line_total: number | string | null;
  cost_base_unit_snapshot: number | string | null; notes: string | null;
  actual_weight_value?: number | string | null; actual_weight_unit_id?: string | null;
  actual_weight_factor_to_kg?: number | string | null; actual_weight_kg?: number | string | null;
  actual_weight_unit_symbol?: string | null;
};

type SupervisorReceiptOrderRow = {
  id: string; receipt_id: string; order_id: string;
  inclusion_status: QbReceiptOrder["status"]; order_reference: string;
};

type SupervisorReceiptEventRow = {
  id: string; receipt_id: string; event_type: string; created_at: string;
};

function single<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableDecimalText(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? String(value) : null;
}

function snapshotText(snapshot: Record<string, unknown> | null, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function customerName(customer: CustomerRow | null) {
  return customer?.full_name?.trim() || customer?.email || "Cliente";
}

function resolveWeightFactor(
  unit: UnitSymbolRow | undefined,
  weightDimensionId: string | undefined,
): number | null {
  if (!unit) return null;
  return resolveWeightUnitFactor({
    dimensionId: unit.dimension_id,
    conversionFactorToBase: numberValue(unit.conversion_factor_to_base),
  }, weightDimensionId);
}

function calculatePricePerArroba(
  price: number | null,
  unit: UnitSymbolRow | undefined,
  arrobaUnit: UnitSymbolRow | undefined,
  weightDimensionId: string | undefined,
): number | null {
  if (price === null || price <= 0 || !unit || !arrobaUnit) {
    return null;
  }
  const arrobaFactor = numberValue(arrobaUnit.conversion_factor_to_base);
  if (arrobaFactor <= 0) return null;

  const unitWeightFactor = resolveWeightFactor(unit, weightDimensionId);
  if (unitWeightFactor === null || unitWeightFactor <= 0) return null;

  return Number(((price / unitWeightFactor) * arrobaFactor).toFixed(4));
}

function calculateArrobaFactor(
  unit: UnitSymbolRow | undefined,
  arrobaUnit: UnitSymbolRow | undefined,
  weightDimensionId: string | undefined,
): number | null {
  if (!unit || !arrobaUnit) return null;
  const arrobaFactor = numberValue(arrobaUnit.conversion_factor_to_base);
  if (arrobaFactor <= 0) return null;

  const unitWeightFactor = resolveWeightFactor(unit, weightDimensionId);
  if (unitWeightFactor === null || unitWeightFactor <= 0) return null;

  return Number((arrobaFactor / unitWeightFactor).toFixed(6));
}

function attachPreviousPrices(receipts: QbReceipt[]) {
  const previousByCustomerProduct = new Map<
    string,
    { basePrice: number; perArroba: number | null; salePrice: number }
  >();
  const previousPurchaseCostByProduct = new Map<
    string,
    { value: number; unitSymbol: string | null }
  >();
  const sorted = [...receipts].sort((left, right) =>
    (left.issuedAt ?? left.createdAt).localeCompare(
      right.issuedAt ?? right.createdAt,
    ),
  );

  for (const receipt of sorted) {
    for (const line of receipt.lines) {
      const previous = previousByCustomerProduct.get(
        `${receipt.customerId}:${line.productId}`,
      );
      line.previousBasePrice = previous?.basePrice ?? null;
      line.previousBasePricePerArroba = previous?.perArroba ?? null;
      line.previousSalePrice = previous?.salePrice ?? null;
      const previousPurchaseCost = previousPurchaseCostByProduct.get(
        line.productId,
      );
      line.previousPurchaseCostReferenceValue =
        previousPurchaseCost?.value ?? null;
      line.previousPurchaseCostReferenceUnitSymbol =
        previousPurchaseCost?.unitSymbol ?? null;
    }
    if (receipt.status !== "emitido") continue;
    for (const line of receipt.lines) {
      const salePrice =
        line.finalUnitPrice !== null && line.finalUnitPrice > 0
          ? line.finalUnitPrice
          : null;
      if (
        (line.basePriceUsed !== null && line.basePriceUsed > 0) ||
        salePrice !== null
      ) {
        const prev = previousByCustomerProduct.get(
          `${receipt.customerId}:${line.productId}`,
        );
        previousByCustomerProduct.set(
          `${receipt.customerId}:${line.productId}`,
          {
            basePrice: line.basePriceUsed ?? prev?.basePrice ?? 0,
            perArroba: line.basePricePerArroba ?? prev?.perArroba ?? null,
            salePrice:
              salePrice ?? prev?.salePrice ?? (line.basePriceUsed ?? 0),
          },
        );
      }
      if (
        line.purchaseCostReferenceValue !== null &&
        line.purchaseCostReferenceUnitSymbol
      ) {
        previousPurchaseCostByProduct.set(line.productId, {
          value: line.purchaseCostReferenceValue,
          unitSymbol: line.purchaseCostReferenceUnitSymbol,
        });
      }
    }
  }
  return receipts;
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
    pricingMode: row.pricing_mode ?? "legacy",
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
    costTotalPrecise: nullableDecimalText(row.cost_total_precise),
    saleTotalPrecise: nullableDecimalText(row.sale_total_precise),
    profitTotalPrecise: nullableDecimalText(row.profit_total_precise),
    hasPendingPrices: lines.some(
      (line) =>
        (row.pricing_mode === "line_cost_markup" && line.costBaseUnitSnapshot === null) ||
        line.deliveredBaseQuantity <= 0 ||
        (line.inputMode === "quantity" &&
          (line.basePriceUsed === null ||
            line.basePriceUsed <= 0 ||
            line.finalUnitPrice === null ||
            line.finalUnitPrice <= 0)) ||
        (line.inputMode === "amount_bs" &&
          (line.requestedAmountBs === null ||
            line.fixedLineAmount !== line.requestedAmountBs)) ||
        line.lineTotal === null ||
        line.lineTotal <= 0,
    ),
    visibleNote: row.visible_note,
    internalNotes: row.internal_notes,
    issuedAt: row.issued_at,
    receiptSentAt: row.receipt_sent_at,
    receiptSentBy: row.receipt_sent_by,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
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
      .select(
        "id, receipt_id, order_id, inclusion_status, order:qb_orders(id, public_reference)",
      )
      .in("receipt_id", receiptIds),
    supabase
      .from("qb_receipt_lines")
      .select(
        "*, order:qb_orders(id, public_reference)",
      )
      .in("receipt_id", receiptIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("qb_receipt_events")
      .select("id, receipt_id, event_type, created_at")
      .in("receipt_id", receiptIds)
      .order("created_at", { ascending: false }),
  ]);

  const lineRows = (linesResult.data ?? []) as ReceiptLineRow[];
  const productIds = [...new Set(lineRows.map((line) => line.product_id))];
  const priceByProduct = new Map<string, ProductPriceRow>();
  const metaByProduct = new Map<string, ProductMetaRow>();
  const unitById = new Map<string, UnitSymbolRow>();
  let arrobaUnit: UnitSymbolRow | undefined;
  let weightDimensionId: string | undefined;
  let weightUnits: UnitSymbolRow[] = [];

  if (productIds.length) {
    const { data: priceData } = await supabase
      .from("qb_product_unit_settings")
      .select("product_id, base_sale_price, base_price_unit_id")
      .in("product_id", productIds);

    for (const price of (priceData ?? []) as ProductPriceRow[]) {
      priceByProduct.set(price.product_id, price);
    }

    const { data: metaData } = await supabase.from("products")
      .select("id, sku, category:product_categories(name)")
      .in("id", productIds);
    for (const item of (metaData ?? []) as ProductMetaRow[]) metaByProduct.set(item.id, item);

    const unitIds = [
      ...new Set([
        ...[...priceByProduct.values()]
          .map((price) => price.base_price_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
        ...lineRows
          .map((line) => line.pricing_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
        ...lineRows
          .map((line) => line.base_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
        ...lineRows
          .map((line) => line.purchase_cost_reference_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
        ...lineRows
          .map((line) => line.actual_weight_unit_id)
          .filter((unitId): unitId is string => Boolean(unitId)),
      ]),
    ];

    const [{ data: unitData }, { data: weightDimensionData }, { data: canonicalArrobaData }] = await Promise.all([
      unitIds.length
        ? supabase
            .from("qb_units")
            .select("id, name, symbol, code, dimension_id, conversion_factor_to_base")
            .in("id", unitIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("qb_unit_dimensions")
        .select("id")
        .eq("code", "peso")
        .eq("is_active", true)
        .limit(1),
      supabase
        .from("qb_units")
        .select("id, name, symbol, code, dimension_id, conversion_factor_to_base")
        .eq("code", "arroba")
        .eq("is_active", true)
        .limit(1),
    ]);

    for (const unit of (unitData ?? []) as UnitSymbolRow[]) {
      unitById.set(unit.id, unit);
    }

    weightDimensionId = weightDimensionData?.[0]?.id as string | undefined;

    if (weightDimensionId) {
      const { data: weightUnitsData } = await supabase
        .from("qb_units")
        .select("id, name, symbol, code, dimension_id, conversion_factor_to_base")
        .eq("dimension_id", weightDimensionId)
        .eq("is_active", true);
      weightUnits = (weightUnitsData ?? []) as UnitSymbolRow[];
    }

    arrobaUnit =
      ((canonicalArrobaData ?? []) as UnitSymbolRow[]).find(
        (unit) => Boolean(weightDimensionId) && unit.dimension_id === weightDimensionId,
      ) ??
      weightUnits.find(
        (u) =>
          u.code === "arroba" ||
          u.symbol === "@" ||
          u.name.toLowerCase().includes("arroba"),
      );
  }

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
    for (const row of lineRows) {
      const order = single(row.order);
      const currentPrice = priceByProduct.get(row.product_id);
      const items = linesByReceipt.get(row.receipt_id) ?? [];
      const lineUnit =
        (row.pricing_unit_id ? unitById.get(row.pricing_unit_id) : undefined) ??
        (row.base_unit_id ? unitById.get(row.base_unit_id) : undefined);
      items.push({
        id: row.id,
        orderId: row.order_id,
        orderReference: order?.public_reference ?? "Pedido",
        productId: row.product_id,
        productName: row.product_name_snapshot,
        productCode: row.product_code_snapshot ?? metaByProduct.get(row.product_id)?.sku ?? null,
        categoryName: row.category_name_snapshot ?? single(metaByProduct.get(row.product_id)?.category)?.name ?? null,
        deliveredBaseQuantity: numberValue(row.delivered_base_quantity),
        actualWeightValue: nullableNumberValue(row.actual_weight_value),
        actualWeightUnitSymbol: row.actual_weight_unit_id
          ? (unitById.get(row.actual_weight_unit_id)?.symbol ?? null)
          : null,
        actualWeightKilograms: nullableNumberValue(row.actual_weight_kg),
        baseUnitSymbol: row.base_unit_symbol,
        visibleUnitLabel: row.visible_unit_label,
        inputMode: row.order_input_mode,
        requestedAmountBs: nullableNumberValue(row.requested_amount_bs),
        currencySnapshot: row.currency_snapshot,
        pricingUnitSymbol: row.pricing_unit_id
          ? (unitById.get(row.pricing_unit_id)?.symbol ?? null)
          : null,
        estimatedBaseQuantity: nullableNumberValue(row.estimated_base_quantity),
        fixedLineAmount: nullableNumberValue(row.fixed_line_amount),
        originalBasePrice: nullableNumberValue(row.original_base_price),
        currentBasePrice: nullableNumberValue(currentPrice?.base_sale_price),
        currentBasePriceUnitSymbol: currentPrice?.base_price_unit_id
          ? (unitById.get(currentPrice.base_price_unit_id)?.symbol ?? null)
          : null,
        basePriceUsed: nullableNumberValue(row.base_price_used),
        basePriceEdited: row.base_price_edited,
        saveAsNewBasePrice: row.save_as_new_base_price,
        finalUnitPrice: nullableNumberValue(row.final_unit_price),
        lineTotal: nullableNumberValue(row.line_total),
        basePricePerArroba: calculatePricePerArroba(
          nullableNumberValue(row.base_price_used),
          lineUnit,
          arrobaUnit,
          weightDimensionId,
        ),
        previousBasePrice: null,
        previousBasePricePerArroba: null,
        previousSalePrice: null,
        salePricePerArroba: calculatePricePerArroba(
          nullableNumberValue(row.final_unit_price),
          lineUnit,
          arrobaUnit,
          weightDimensionId,
        ),
        arrobaFactor: calculateArrobaFactor(
          lineUnit,
          arrobaUnit,
          weightDimensionId,
        ),
        purchaseCostTotal: nullableNumberValue(row.purchase_cost_total),
        costBaseUnitSnapshot: nullableDecimalText(row.cost_base_unit_snapshot),
        costTotalPrecise: nullableDecimalText(row.cost_total_precise),
        saleTotalPrecise: nullableDecimalText(row.sale_total_precise),
        profitUnitPrecise: nullableDecimalText(row.profit_unit_precise),
        profitTotalPrecise: nullableDecimalText(row.profit_total_precise),
        costSource: row.cost_source ?? null,
        distanceFactorPercent: numberValue(row.distance_factor_percent),
        exigencyFactorPercent: numberValue(row.exigency_factor_percent),
        weatherFactorPercent: numberValue(row.weather_factor_percent),
        extraordinaryFactorPercent: numberValue(row.extraordinary_factor_percent),
        purchaseCostReferenceUnitId:
          row.purchase_cost_reference_unit_id,
        purchaseCostReferenceUnitSymbol: row.purchase_cost_reference_unit_id
          ? (unitById.get(row.purchase_cost_reference_unit_id)?.symbol ?? null)
          : null,
        purchaseCostReferenceValue: nullableNumberValue(
          row.purchase_cost_reference_value,
        ),
        previousPurchaseCostReferenceUnitSymbol: null,
        previousPurchaseCostReferenceValue: null,
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
    .select(
      "id, public_reference, customer_account_id, delivered_at, location_snapshot, customer:customer_accounts(id, email, full_name, phone)",
    )
    .eq("status", "entregado_pendiente_recibo")
    .order("delivered_at", { ascending: false });

  if (error) return [];

  const rows = (data ?? []) as PendingOrderRow[];
  const orderIds = rows.map((order) => order.id);
  const movementCounts = new Map<string, number>();

  if (orderIds.length) {
    const { data: movementsData } = await supabase
      .from("qb_order_delivery_movements")
      .select("order_id, delivered_base_quantity")
      .in("order_id", orderIds);

    for (const movement of (movementsData ?? []) as DeliveredMovementRow[]) {
      if (numberValue(movement.delivered_base_quantity) <= 0) continue;
      movementCounts.set(
        movement.order_id,
        (movementCounts.get(movement.order_id) ?? 0) + 1,
      );
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

function mapSupervisorReceipt(
  row: SupervisorReceiptRow,
  orders: QbReceiptOrder[],
  lines: QbReceiptLine[],
  events: ReceiptEventRow[],
): QbReceipt {
  return {
    id: row.id,
    number: row.receipt_number,
    status: row.status,
    pricingMode: row.pricing_mode,
    customerId: row.customer_account_id,
    customerName: row.customer_name?.trim() || "Cliente",
    customerEmail: row.customer_email ?? "Sin correo",
    customerPhone: row.customer_phone,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    // These fields are deliberately omitted from the supervisor projection.
    distanceFactorPercent: 0,
    exigencyFactorPercent: 0,
    weatherFactorPercent: 0,
    extraordinaryFactorPercent: 0,
    subtotalAmount: numberValue(row.subtotal_amount),
    totalAmount: numberValue(row.total_amount),
    costTotalPrecise: null,
    saleTotalPrecise: nullableDecimalText(row.total_amount),
    profitTotalPrecise: null,
    hasPendingPrices: lines.some((line) =>
      line.deliveredBaseQuantity <= 0 || line.lineTotal === null || line.lineTotal <= 0 ||
      (row.pricing_mode === "line_cost_markup" && line.costBaseUnitSnapshot === null) ||
      (line.inputMode === "quantity" && (line.finalUnitPrice === null || line.finalUnitPrice <= 0)) ||
      (line.inputMode === "amount_bs" && line.fixedLineAmount !== line.requestedAmountBs)),
    visibleNote: row.visible_note,
    internalNotes: null,
    issuedAt: row.issued_at,
    receiptSentAt: row.receipt_sent_at,
    receiptSentBy: row.receipt_sent_by,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    paidBy: row.paid_by,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    orders,
    lines,
    events: events.map((event) => ({ id: event.id, eventType: event.event_type, createdAt: event.created_at })),
  };
}

function mapSupervisorReceiptLine(row: SupervisorReceiptLineRow): QbReceiptLine {
  return {
    id: row.id,
    orderId: row.order_id,
    orderReference: row.order_reference,
    productId: row.product_id,
    productName: row.product_name_snapshot,
    productCode: row.product_code_snapshot,
    categoryName: row.category_name_snapshot,
    deliveredBaseQuantity: numberValue(row.delivered_base_quantity),
    actualWeightValue: nullableNumberValue(row.actual_weight_value),
    actualWeightUnitSymbol: row.actual_weight_unit_symbol ?? null,
    actualWeightKilograms: nullableNumberValue(row.actual_weight_kg),
    baseUnitSymbol: row.base_unit_symbol,
    visibleUnitLabel: row.visible_unit_label,
    inputMode: row.order_input_mode,
    requestedAmountBs: nullableNumberValue(row.requested_amount_bs),
    currencySnapshot: row.currency_snapshot,
    pricingUnitSymbol: row.pricing_unit_symbol,
    estimatedBaseQuantity: nullableNumberValue(row.estimated_base_quantity),
    fixedLineAmount: nullableNumberValue(row.fixed_line_amount),
    originalBasePrice: null,
    currentBasePrice: null,
    currentBasePriceUnitSymbol: null,
    basePriceUsed: nullableNumberValue(row.base_price_used),
    basePriceEdited: false,
    saveAsNewBasePrice: false,
    finalUnitPrice: nullableNumberValue(row.final_unit_price),
    lineTotal: nullableNumberValue(row.line_total),
    basePricePerArroba: null,
    previousBasePrice: null,
    previousBasePricePerArroba: null,
    previousSalePrice: null,
    salePricePerArroba: null,
    arrobaFactor: null,
    purchaseCostTotal: null,
    costBaseUnitSnapshot: nullableDecimalText(row.cost_base_unit_snapshot),
    costTotalPrecise: null,
    saleTotalPrecise: null,
    profitUnitPrecise: null,
    profitTotalPrecise: null,
    costSource: null,
    distanceFactorPercent: 0,
    exigencyFactorPercent: 0,
    weatherFactorPercent: 0,
    extraordinaryFactorPercent: 0,
    purchaseCostReferenceUnitId: null,
    purchaseCostReferenceUnitSymbol: null,
    purchaseCostReferenceValue: null,
    previousPurchaseCostReferenceUnitSymbol: null,
    previousPurchaseCostReferenceValue: null,
    notes: row.notes,
  };
}

async function getSupervisorQbReceiptsData(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
): Promise<QbReceiptsData> {
  const { data: receiptData, error } = await supabase.from("qb_supervisor_receipts")
    .select("id,receipt_number,status,pricing_mode,customer_account_id,customer_name,customer_email,customer_phone,period_start,period_end,subtotal_amount,total_amount,visible_note,issued_at,receipt_sent_at,receipt_sent_by,payment_status,paid_at,paid_by,voided_at,void_reason,created_at")
    .order("created_at", { ascending: false });
  if (error) return { receipts: [], pendingGroups: [], comparisonUnits: [], error: "No pudimos cargar la vista operativa de recibos." };

  const headers = (receiptData ?? []) as SupervisorReceiptRow[];
  const ids = headers.map((row) => row.id);
  const [lineResult, orderResult, eventResult, pendingGroups] = await Promise.all([
    ids.length ? supabase.from("qb_supervisor_receipt_lines")
      .select("id,receipt_id,order_id,order_reference,product_id,product_name_snapshot,product_code_snapshot,category_name_snapshot,delivered_base_quantity,base_unit_symbol,visible_unit_label,order_input_mode,requested_amount_bs,currency_snapshot,pricing_unit_symbol,estimated_base_quantity,fixed_line_amount,base_price_used,final_unit_price,line_total,cost_base_unit_snapshot,notes,actual_weight_value,actual_weight_unit_id,actual_weight_kg,actual_weight_unit_symbol")
      .in("receipt_id", ids).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("qb_supervisor_receipt_orders")
      .select("id,receipt_id,order_id,inclusion_status,order_reference")
      .in("receipt_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("qb_supervisor_receipt_events")
      .select("id,receipt_id,event_type,created_at")
      .in("receipt_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    getPendingReceiptGroups(supabase),
  ]);
  const partError = lineResult.error ?? orderResult.error ?? eventResult.error;
  if (partError) return { receipts: [], pendingGroups: [], comparisonUnits: [], error: "No pudimos cargar los detalles operativos de recibos." };

  const lines = new Map<string, QbReceiptLine[]>();
  for (const raw of (lineResult.data ?? []) as SupervisorReceiptLineRow[]) {
    const entries = lines.get(raw.receipt_id) ?? [];
    entries.push(mapSupervisorReceiptLine(raw));
    lines.set(raw.receipt_id, entries);
  }
  const orders = new Map<string, QbReceiptOrder[]>();
  for (const raw of (orderResult.data ?? []) as SupervisorReceiptOrderRow[]) {
    const entries = orders.get(raw.receipt_id) ?? [];
    entries.push({ id: raw.id, orderId: raw.order_id, orderReference: raw.order_reference, status: raw.inclusion_status });
    orders.set(raw.receipt_id, entries);
  }
  const events = new Map<string, ReceiptEventRow[]>();
  for (const raw of (eventResult.data ?? []) as SupervisorReceiptEventRow[]) {
    const entries = events.get(raw.receipt_id) ?? [];
    entries.push({ id: raw.id, receipt_id: raw.receipt_id, event_type: raw.event_type, created_at: raw.created_at });
    events.set(raw.receipt_id, entries);
  }

  return {
    receipts: headers.map((row) => mapSupervisorReceipt(row, orders.get(row.id) ?? [], lines.get(row.id) ?? [], events.get(row.id) ?? [])),
    pendingGroups,
    comparisonUnits: [],
  };
}

export async function getQbReceiptsData(role: UserRole): Promise<QbReceiptsData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return {
      receipts: [],
      pendingGroups: [],
      comparisonUnits: [],
      error:
        "No pudimos cargar los recibos en este momento. Comunícate con el administrador de QB Insumos.",
    };

  if (role === "supervisor") return getSupervisorQbReceiptsData(supabase);

  const { data, error } = await supabase
    .from("qb_receipts")
    .select(
      "*, customer:customer_accounts(id, email, full_name, phone)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return {
      receipts: [],
      pendingGroups: [],
      comparisonUnits: [],
      error:
        "No pudimos cargar los recibos en este momento. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.",
    };
  }

  const rows = (data ?? []) as ReceiptRow[];
  const receiptIds = rows.map((receipt) => receipt.id);
  const { data: weightDimensionData } = await supabase
    .from("qb_unit_dimensions")
    .select("id")
    .eq("code", "peso")
    .eq("is_active", true)
    .limit(1);
  const weightDimensionId = weightDimensionData?.[0]?.id as string | undefined;
  let comparisonUnits: QbReceiptComparisonUnit[] = [];
  if (weightDimensionId) {
    const { data: comparisonUnitData } = await supabase
      .from("qb_units")
      .select("id, name, symbol")
      .eq("dimension_id", weightDimensionId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    comparisonUnits = (comparisonUnitData ?? []) as QbReceiptComparisonUnit[];
  }

  const [{ ordersByReceipt, linesByReceipt, eventsByReceipt }, pendingGroups] =
    await Promise.all([
      getReceiptParts(supabase, receiptIds),
      getPendingReceiptGroups(supabase),
    ]);

  return {
    receipts: attachPreviousPrices(rows.map((row) =>
      mapReceipt(
        row,
        ordersByReceipt.get(row.id) ?? [],
        linesByReceipt.get(row.id) ?? [],
        eventsByReceipt.get(row.id) ?? [],
      ),
    )),
    pendingGroups,
    comparisonUnits,
  };
}

export async function getQbReceiptDetailData(
  receiptId: string,
  role: UserRole,
): Promise<QbReceiptDetailData> {
  noStore();

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return {
      receipt: null,
      error:
        "No pudimos cargar el recibo en este momento. Comunícate con el administrador de QB Insumos.",
    };

  if (role === "supervisor") {
    const { receipts, error } = await getSupervisorQbReceiptsData(supabase);
    return {
      receipt: receipts.find((item) => item.id === receiptId) ?? null,
      error: receipts.some((item) => item.id === receiptId) ? undefined : error ?? "No se encontró el recibo solicitado.",
    };
  }

  const { data, error } = await supabase
    .from("qb_receipts")
    .select(
      "*, customer:customer_accounts(id, email, full_name, phone)",
    )
    .eq("id", receiptId)
    .maybeSingle<ReceiptRow>();

  if (error || !data) {
    return { receipt: null, error: "No se encontró el recibo solicitado." };
  }

  const { ordersByReceipt, linesByReceipt, eventsByReceipt } =
    await getReceiptParts(supabase, [data.id]);

  const mapped = mapReceipt(
    data,
    ordersByReceipt.get(data.id) ?? [],
    linesByReceipt.get(data.id) ?? [],
    eventsByReceipt.get(data.id) ?? [],
  );

  if (data.customer_account_id) {
    const { data: previousReceiptsData } = await supabase
      .from("qb_receipts")
      .select("*, customer:customer_accounts(id, email, full_name, phone)")
      .eq("customer_account_id", data.customer_account_id)
      .eq("status", "emitido")
      .neq("id", data.id)
      .order("issued_at", { ascending: true });

    if (previousReceiptsData && previousReceiptsData.length > 0) {
      const prevIds = previousReceiptsData.map((r) => r.id);
      const { linesByReceipt: prevLines } = await getReceiptParts(
        supabase,
        prevIds,
      );
      const prevMapped = previousReceiptsData.map((r) =>
        mapReceipt(r, [], prevLines.get(r.id) ?? [], []),
      );
      attachPreviousPrices([...prevMapped, mapped]);
    }
  }

  return {
    receipt: mapped,
  };
}
