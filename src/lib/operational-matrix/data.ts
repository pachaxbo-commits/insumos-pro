import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  MatrixLine,
  MatrixOrder,
  MatrixWeightUnit,
  OperationalMatrixData,
} from "@/types/operational-matrix";
import type { UserRole } from "@/types/auth";

function numberOr(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotText(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizedUnitLabel(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();
}

function findWeightUnit(
  units: MatrixWeightUnit[],
  ...labels: unknown[]
) {
  for (const label of labels) {
    const candidate = normalizedUnitLabel(label);
    if (!candidate) continue;
    const unit = units.find((option) =>
      [option.code, option.name, option.symbol]
        .map(normalizedUnitLabel)
        .includes(candidate),
    );
    if (unit) return unit;
  }
  return undefined;
}

export async function getOperationalMatrixData(
  operationalDate: string,
  role: UserRole,
): Promise<OperationalMatrixData> {
  noStore();
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return { operationalDate, role, weightUnits: [], orders: [], lines: [] };

  const { data: orderData, error: orderError } = await supabase
    .from("qb_orders")
    .select(
      "id, customer_account_id, public_reference, status, updated_at, customer_notes, customer_snapshot, location_snapshot",
    )
    .eq("operational_date", operationalDate)
    .neq("status", "cancelado")
    .order("submitted_at", { ascending: true });
  if (orderError)
    throw new Error(`No se pudo cargar la matriz: ${orderError.message}`);

  const rawOrders = orderData ?? [];
  const orderIds = rawOrders.map((order) => String(order.id));
  if (!orderIds.length)
    return { operationalDate, role, weightUnits: [], orders: [], lines: [] };

  const [dayResult, itemsResult, preparationsResult, confirmationsResult] =
    await Promise.all([
      supabase
        .from("qb_operational_day_orders")
        .select("order_id, position, row_version")
        .in("order_id", orderIds),
      supabase
        .from("qb_order_items")
        .select(
          "id, order_id, product_id, source_label, base_unit_symbol, requested_quantity, base_quantity, customer_notes, row_version, product:products(name, matrix_color, controls_actual_weight, category:product_categories(name))",
        )
        .in("order_id", orderIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("qb_order_preparations")
        .select("id, order_id, status")
        .in("order_id", orderIds),
      supabase
        .from("qb_order_delivery_confirmations")
        .select("order_id, status")
        .in("order_id", orderIds),
    ]);
  for (const result of [
    dayResult,
    itemsResult,
    preparationsResult,
    confirmationsResult,
  ]) {
    if (result.error)
      throw new Error(`No se pudo cargar la matriz: ${result.error.message}`);
  }

  const itemRows = itemsResult.data ?? [];
  const itemIds = itemRows.map((item) => String(item.id));
  const preparationIds = (preparationsResult.data ?? []).map((item) =>
    String(item.id),
  );
  const productIds = [...new Set(itemRows.map((item) => String(item.product_id)))];
  const [
    preparationItemsResult,
    deliveryItemsResult,
    productSettingsResult,
    unitsResult,
    unitDimensionsResult,
  ] = await Promise.all([
    preparationIds.length
      ? supabase
          .from("qb_order_preparation_items")
          .select(
            "id, preparation_id, order_item_id, actual_quantity, actual_base_quantity, preparation_check, actual_weight_kg, notes, row_version, prepared_at_line, prepared_by:profiles!prepared_by_line(full_name)",
          )
          .in("preparation_id", preparationIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase
          .from("qb_order_delivery_items")
          .select(
            "order_item_id, externally_sourced_quantity, delivered_quantity, delivered_base_quantity, delivery_check, actual_weight_kg, delivery_note, row_version, delivered_at, delivered_by_profile:profiles!delivered_by(full_name)",
          )
          .in("order_item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("qb_product_unit_settings")
          .select("product_id, base_price_unit_id, base_sale_price")
          .in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("qb_units")
      .select(
        "id, dimension_id, code, name, symbol, conversion_factor_to_base, is_active, sort_order",
      ),
    supabase.from("qb_unit_dimensions").select("id, code, is_active"),
  ]);
  if (
    preparationItemsResult.error ||
    deliveryItemsResult.error ||
    productSettingsResult.error ||
    unitsResult.error ||
    unitDimensionsResult.error
  ) {
    throw new Error(
      `No se pudo cargar el detalle: ${
        preparationItemsResult.error?.message ??
        deliveryItemsResult.error?.message ??
        productSettingsResult.error?.message ??
        unitsResult.error?.message ??
        unitDimensionsResult.error?.message
      }`,
    );
  }

  const days = new Map(
    (dayResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const preparations = new Map(
    (preparationsResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const confirmations = new Map(
    (confirmationsResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const prepItems = new Map(
    (preparationItemsResult.data ?? []).map((row) => [
      String(row.order_item_id),
      row,
    ]),
  );
  const deliveryItems = new Map(
    (deliveryItemsResult.data ?? []).map((row) => [
      String(row.order_item_id),
      row,
    ]),
  );
  const productSettings = new Map(
    (productSettingsResult.data ?? []).map((row) => [
      String(row.product_id),
      row,
    ]),
  );
  const units = new Map(
    (unitsResult.data ?? []).map((row) => [String(row.id), row]),
  );
  const weightDimensionIds = new Set(
    (unitDimensionsResult.data ?? [])
      .filter((row) => row.code === "peso" && row.is_active)
      .map((row) => String(row.id)),
  );
  const weightUnits: MatrixWeightUnit[] = (unitsResult.data ?? [])
    .filter(
      (row) =>
        row.is_active && weightDimensionIds.has(String(row.dimension_id)),
    )
    .sort(
      (left, right) => numberOr(left.sort_order) - numberOr(right.sort_order),
    )
    .map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      symbol: String(row.symbol),
      kilograms: numberOr(row.conversion_factor_to_base),
    }))
    .filter((unit) => unit.kilograms > 0);

  const orders: MatrixOrder[] = rawOrders
    .map((order, index) => {
      const id = String(order.id);
      const day = days.get(id);
      const preparation = preparations.get(id);
      const customerName =
        snapshotText(order.customer_snapshot, "business_name") ??
        snapshotText(order.customer_snapshot, "responsible_name") ??
        "Cliente";
      const guestContact =
        snapshotText(order.customer_snapshot, "phone") ??
        snapshotText(order.customer_snapshot, "email") ??
        id;
      return {
        id,
        customerKey: order.customer_account_id
          ? `customer:${String(order.customer_account_id)}`
          : `guest:${customerName.toLocaleLowerCase("es")}:${guestContact.toLocaleLowerCase("es")}`,
        reference: String(order.public_reference),
        customerName,
        locationLabel:
          snapshotText(order.location_snapshot, "label") ??
          snapshotText(order.location_snapshot, "address"),
        customerNotes: String(order.customer_notes ?? ""),
        status: String(order.status),
        updatedAt: String(order.updated_at),
        position: numberOr(day?.position, index + 1),
        positionVersion: numberOr(day?.row_version),
        preparationStatus: preparation ? String(preparation.status) : null,
        deliveryStatus: confirmations.has(id)
          ? String(confirmations.get(id)?.status)
          : null,
      };
    })
    .sort((a, b) => a.position - b.position);

  const lines: MatrixLine[] = itemRows.map((item) => {
    const product = Array.isArray(item.product)
      ? item.product[0]
      : item.product;
    const categoryValue = (product as { category?: unknown } | null)?.category;
    const category = Array.isArray(categoryValue)
      ? categoryValue[0]
      : categoryValue;
    const prep = prepItems.get(String(item.id));
    const delivery = deliveryItems.get(String(item.id));
    const preparedByValue = (prep as { prepared_by?: unknown } | undefined)
      ?.prepared_by;
    const preparedBy = Array.isArray(preparedByValue)
      ? preparedByValue[0]
      : preparedByValue;
    const deliveredByValue = (
      delivery as { delivered_by_profile?: unknown } | undefined
    )?.delivered_by_profile;
    const deliveredBy = Array.isArray(deliveredByValue)
      ? deliveredByValue[0]
      : deliveredByValue;
    const controlsActualWeight = Boolean(
      (product as { controls_actual_weight?: unknown } | null)
        ?.controls_actual_weight,
    );
    const productSetting = productSettings.get(String(item.product_id));
    const priceUnit = productSetting?.base_price_unit_id
      ? units.get(String(productSetting.base_price_unit_id))
      : undefined;
    const weightPriceUnit = findWeightUnit(
      weightUnits,
      priceUnit?.code,
      priceUnit?.name,
      priceUnit?.symbol,
    );
    const priceUnitSymbol = priceUnit
      ? String(priceUnit.symbol ?? priceUnit.name ?? priceUnit.code ?? "") || null
      : null;
    const hasWeightBasedPrice = Boolean(
      priceUnitSymbol &&
        weightPriceUnit &&
        Number(productSetting?.base_sale_price) > 0,
    );
    const requestedQuantity = numberOr(item.requested_quantity);
    const requestedBaseQuantity = numberOr(item.base_quantity);
    const requestedWeightUnit = findWeightUnit(
      weightUnits,
      item.source_label,
      item.base_unit_symbol,
    );
    const preparationCheck = Boolean(prep?.preparation_check);
    const rawPreparedQuantity = numberOr(prep?.actual_quantity);
    const preparedQuantity =
      preparationCheck && rawPreparedQuantity <= 0.000001
        ? requestedQuantity
        : rawPreparedQuantity;
    const rawPreparationWeight =
      prep?.actual_weight_kg === null ||
      typeof prep?.actual_weight_kg === "undefined"
        ? null
        : numberOr(prep.actual_weight_kg);
    const preparationActualWeightKg =
      preparationCheck &&
      controlsActualWeight &&
      requestedWeightUnit &&
      (rawPreparationWeight === null || rawPreparationWeight <= 0.000001)
        ? Number(
            (requestedQuantity * requestedWeightUnit.kilograms).toFixed(6),
          )
        : rawPreparationWeight;
    const deliveryCheck = Boolean(delivery?.delivery_check);
    const rawDeliveredQuantity = numberOr(delivery?.delivered_quantity);
    const deliveredQuantity =
      deliveryCheck && rawDeliveredQuantity <= 0.000001
        ? requestedQuantity
        : rawDeliveredQuantity;
    const rawDeliveryWeight =
      delivery?.actual_weight_kg === null ||
      typeof delivery?.actual_weight_kg === "undefined"
        ? null
        : numberOr(delivery.actual_weight_kg);
    const deliveryActualWeightKg =
      controlsActualWeight &&
      (rawDeliveryWeight === null || rawDeliveryWeight <= 0.000001)
        ? preparationActualWeightKg && preparationActualWeightKg > 0.000001
          ? preparationActualWeightKg
          : deliveryCheck && requestedWeightUnit
            ? Number(
                (requestedQuantity * requestedWeightUnit.kilograms).toFixed(6),
              )
            : rawDeliveryWeight
        : rawDeliveryWeight;
    return {
      orderItemId: String(item.id),
      orderId: String(item.order_id),
      productId: String(item.product_id),
      productName: String(
        (product as { name?: unknown } | null)?.name ?? "Producto",
      ),
      productColor:
        String(
          (product as { matrix_color?: unknown } | null)?.matrix_color ?? "",
        ) || null,
      controlsActualWeight,
      categoryName: String(
        (category as { name?: unknown } | null)?.name ?? "Sin categoría",
      ),
      sourceLabel: String(item.source_label),
      baseUnitSymbol: String(item.base_unit_symbol),
      priceUnitSymbol,
      hasWeightBasedPrice,
      requestedQuantity,
      requestedBaseQuantity,
      requestedNote: String(item.customer_notes ?? ""),
      requestedVersion: numberOr(item.row_version),
      preparedQuantity,
      preparedBaseQuantity: numberOr(prep?.actual_base_quantity),
      preparationCheck,
      preparationActualWeightKg,
      preparationNote: String(prep?.notes ?? ""),
      preparationVersion: numberOr(prep?.row_version),
      preparedBy:
        String(
          (preparedBy as { full_name?: unknown } | null)?.full_name ?? "",
        ) || null,
      preparedAt: prep?.prepared_at_line ? String(prep.prepared_at_line) : null,
      externalQuantity: numberOr(delivery?.externally_sourced_quantity),
      deliveredQuantity,
      deliveredBaseQuantity: numberOr(delivery?.delivered_base_quantity),
      deliveryCheck,
      deliveryActualWeightKg,
      deliveryNote: String(delivery?.delivery_note ?? ""),
      deliveryVersion: numberOr(delivery?.row_version),
      deliveredBy:
        String(
          (deliveredBy as { full_name?: unknown } | null)?.full_name ?? "",
        ) || null,
      deliveredAt: delivery?.delivered_at
        ? String(delivery.delivered_at)
        : null,
    };
  });
  return { operationalDate, role, weightUnits, orders, lines };
}
