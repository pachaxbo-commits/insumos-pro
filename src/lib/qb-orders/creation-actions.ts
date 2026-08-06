"use server";

import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { getInternalOrderCreationData } from "@/lib/qb-orders/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbInternalOrderCreationData,
  QbRepeatableOrder,
  QbRepeatableOrderLine,
} from "@/types/qb-orders";

const ORDER_AVERAGE_SIZE = 8;

export async function getInternalOrderCreationDataAction(): Promise<
  | { success: true; data: QbInternalOrderCreationData }
  | { success: false; message: string }
> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede registrar pedidos.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos cargar las opciones del pedido.",
    };
  }

  const data = await getInternalOrderCreationData(supabase);
  return { success: true, data };
}

const repeatSelectionSchema = z.object({
  customerId: z.uuid(),
  locationId: z.uuid(),
});

type RepeatOrderResult =
  | { success: true; order: QbRepeatableOrder | null }
  | { success: false; message: string };

type CurrentOrderRow = {
  id: string;
  submitted_at: string;
  customer_location_id: string | null;
  location_snapshot: unknown;
};

type CurrentLineRow = {
  order_id: string;
  product_id: string;
  allowed_unit_id: string | null;
  requested_quantity: number | string;
  base_quantity: number | string;
  conversion_factor_to_base: number | string;
  customer_notes: string | null;
  sort_order: number;
};

type LegacyTemplateRow = {
  id: string;
  source_order_date: string;
};

type LegacyLineRow = {
  template_id: string;
  product_id: string;
  allowed_unit_id: string;
  quantity: number | string;
  notes: string | null;
  sort_order: number;
};

type AllowedUnitRow = {
  id: string;
  product_id: string;
  unit_id: string | null;
  presentation_id: string | null;
  min_quantity: number | string | null;
  quantity_step: number | string | null;
};

type Sample = {
  id: string;
  source: "current" | "legacy";
  submittedAt: string;
  locationId: string | null;
  locationLabel: string;
};

function positiveNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function snapshotLocationLabel(value: unknown) {
  const snapshot =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return [snapshot.label, snapshot.address]
    .filter(
      (item): item is string =>
        typeof item === "string" && Boolean(item.trim()),
    )
    .join(" — ");
}

function snapAverageToUnit(value: number, minimum: number, step: number) {
  const safeMinimum = minimum > 0 ? minimum : step > 0 ? step : 0.5;
  const safeStep = step > 0 ? step : 0.5;
  const snapped =
    value <= safeMinimum
      ? safeMinimum
      : safeMinimum + Math.round((value - safeMinimum) / safeStep) * safeStep;
  return Number(Math.max(safeMinimum, snapped).toFixed(6));
}

export async function getAverageRepeatableOrderAction(
  customerId: string,
  locationId: string,
): Promise<RepeatOrderResult> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede consultar pedidos anteriores.",
    };
  }

  const selection = repeatSelectionSchema.safeParse({ customerId, locationId });
  if (!selection.success) {
    return {
      success: false,
      message: "Selecciona un cliente y una ubicación.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos calcular el promedio de pedidos.",
    };
  }

  const selectOrder =
    "id, submitted_at, customer_location_id, location_snapshot";
  const sameLocationResult = await supabase
    .from("qb_orders")
    .select(selectOrder)
    .eq("customer_account_id", selection.data.customerId)
    .eq("customer_location_id", selection.data.locationId)
    .neq("status", "cancelado")
    .order("submitted_at", { ascending: false })
    .limit(ORDER_AVERAGE_SIZE);

  if (sameLocationResult.error) {
    return {
      success: false,
      message: "No pudimos consultar los pedidos anteriores.",
    };
  }

  const fallbackResult = sameLocationResult.data?.length
    ? null
    : await supabase
        .from("qb_orders")
        .select(selectOrder)
        .eq("customer_account_id", selection.data.customerId)
        .neq("status", "cancelado")
        .order("submitted_at", { ascending: false })
        .limit(ORDER_AVERAGE_SIZE);

  if (fallbackResult?.error) {
    return {
      success: false,
      message: "No pudimos consultar los pedidos anteriores.",
    };
  }

  const legacyResult = await supabase
    .from("qb_legacy_order_templates")
    .select("id, source_order_date")
    .eq("customer_account_id", selection.data.customerId)
    .order("source_order_date", { ascending: false })
    .limit(ORDER_AVERAGE_SIZE);

  if (legacyResult.error) {
    return {
      success: false,
      message: "No pudimos consultar el historial del sistema anterior.",
    };
  }

  const currentOrders = (
    sameLocationResult.data?.length
      ? sameLocationResult.data
      : (fallbackResult?.data ?? [])
  ) as CurrentOrderRow[];
  const legacyTemplates = (legacyResult.data ?? []) as LegacyTemplateRow[];
  const samples = [
    ...currentOrders.map(
      (order): Sample => ({
        id: order.id,
        source: "current",
        submittedAt: order.submitted_at,
        locationId: order.customer_location_id,
        locationLabel:
          snapshotLocationLabel(order.location_snapshot) ||
          "Ubicación no identificada",
      }),
    ),
    ...legacyTemplates.map(
      (template): Sample => ({
        id: template.id,
        source: "legacy",
        submittedAt: `${template.source_order_date}T12:00:00-04:00`,
        locationId: null,
        locationLabel: "Sistema anterior",
      }),
    ),
  ]
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .slice(0, ORDER_AVERAGE_SIZE);

  if (!samples.length) return { success: true, order: null };

  const selectedCurrentIds = samples
    .filter((sample) => sample.source === "current")
    .map((sample) => sample.id);
  const selectedLegacyIds = samples
    .filter((sample) => sample.source === "legacy")
    .map((sample) => sample.id);
  const [currentLinesResult, legacyLinesResult] = await Promise.all([
    selectedCurrentIds.length
      ? supabase
          .from("qb_order_items")
          .select(
            "order_id, product_id, allowed_unit_id, requested_quantity, base_quantity, conversion_factor_to_base, customer_notes, sort_order",
          )
          .in("order_id", selectedCurrentIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    selectedLegacyIds.length
      ? supabase
          .from("qb_legacy_order_template_lines")
          .select(
            "template_id, product_id, allowed_unit_id, quantity, notes, sort_order",
          )
          .in("template_id", selectedLegacyIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (currentLinesResult.error || legacyLinesResult.error) {
    return {
      success: false,
      message: "No pudimos cargar los productos de los pedidos anteriores.",
    };
  }

  const currentLines = (currentLinesResult.data ?? []) as CurrentLineRow[];
  const legacyLines = (legacyLinesResult.data ?? []) as LegacyLineRow[];
  const allowedUnitIds = [
    ...new Set(
      [...currentLines, ...legacyLines]
        .map((line) => line.allowed_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const allowedResult = allowedUnitIds.length
    ? await supabase
        .from("qb_product_allowed_units")
        .select(
          "id, product_id, unit_id, presentation_id, min_quantity, quantity_step",
        )
        .in("id", allowedUnitIds)
        .eq("is_active", true)
    : { data: [], error: null };

  if (allowedResult.error) {
    return {
      success: false,
      message: "No pudimos validar las unidades del promedio.",
    };
  }

  const allowedRows = (allowedResult.data ?? []) as AllowedUnitRow[];
  const productIds = [...new Set(allowedRows.map((row) => row.product_id))];
  const settingsResult = productIds.length
    ? await supabase
        .from("qb_product_unit_settings")
        .select("product_id, base_unit_id")
        .in("product_id", productIds)
    : { data: [], error: null };

  if (settingsResult.error) {
    return {
      success: false,
      message: "No pudimos convertir las unidades del promedio.",
    };
  }

  const baseUnitByProduct = new Map(
    (settingsResult.data ?? []).map((row) => [
      String(row.product_id),
      String(row.base_unit_id),
    ]),
  );
  const unitIds = [
    ...new Set([
      ...allowedRows
        .map((row) => row.unit_id)
        .filter((id): id is string => Boolean(id)),
      ...baseUnitByProduct.values(),
    ]),
  ];
  const presentationIds = allowedRows
    .map((row) => row.presentation_id)
    .filter((id): id is string => Boolean(id));
  const [unitsResult, presentationsResult] = await Promise.all([
    unitIds.length
      ? supabase
          .from("qb_units")
          .select("id, conversion_factor_to_base")
          .in("id", unitIds)
      : Promise.resolve({ data: [], error: null }),
    presentationIds.length
      ? supabase
          .from("qb_product_presentations")
          .select("id, conversion_factor_to_base")
          .in("id", presentationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (unitsResult.error || presentationsResult.error) {
    return {
      success: false,
      message: "No pudimos convertir las unidades del promedio.",
    };
  }

  const unitFactorById = new Map(
    (unitsResult.data ?? []).map((row) => [
      String(row.id),
      positiveNumber(row.conversion_factor_to_base, 1),
    ]),
  );
  const presentationFactorById = new Map(
    (presentationsResult.data ?? []).map((row) => [
      String(row.id),
      positiveNumber(row.conversion_factor_to_base, 1),
    ]),
  );
  const allowedById = new Map(allowedRows.map((row) => [row.id, row]));
  const allowedFactor = (row: AllowedUnitRow | undefined) => {
    if (!row) return 1;
    if (row.presentation_id) {
      return presentationFactorById.get(row.presentation_id) ?? 1;
    }
    const sourceFactor = row.unit_id
      ? (unitFactorById.get(row.unit_id) ?? 1)
      : 1;
    const baseUnitId = baseUnitByProduct.get(row.product_id);
    const baseFactor = baseUnitId
      ? (unitFactorById.get(baseUnitId) ?? 1)
      : 1;
    return sourceFactor / baseFactor;
  };

  const currentLinesByOrder = new Map<string, CurrentLineRow[]>();
  for (const line of currentLines) {
    const rows = currentLinesByOrder.get(line.order_id) ?? [];
    rows.push(line);
    currentLinesByOrder.set(line.order_id, rows);
  }
  const legacyLinesByTemplate = new Map<string, LegacyLineRow[]>();
  for (const line of legacyLines) {
    const rows = legacyLinesByTemplate.get(line.template_id) ?? [];
    rows.push(line);
    legacyLinesByTemplate.set(line.template_id, rows);
  }

  type Aggregate = {
    productId: string;
    allowedUnitId: string;
    factor: number;
    minimum: number;
    step: number;
    totalBaseQuantity: number;
    notes: string;
    firstSeen: number;
  };
  const aggregates = new Map<string, Aggregate>();
  let firstSeen = 0;

  for (const sample of samples) {
    const lines =
      sample.source === "current"
        ? (currentLinesByOrder.get(sample.id) ?? []).map((line) => ({
            productId: line.product_id,
            allowedUnitId: line.allowed_unit_id,
            quantity: positiveNumber(line.requested_quantity),
            baseQuantity: positiveNumber(line.base_quantity),
            factor: positiveNumber(line.conversion_factor_to_base),
            notes: line.customer_notes ?? "",
          }))
        : (legacyLinesByTemplate.get(sample.id) ?? []).map((line) => {
            const allowed = allowedById.get(line.allowed_unit_id);
            const factor = allowedFactor(allowed);
            const quantity = positiveNumber(line.quantity);
            return {
              productId: line.product_id,
              allowedUnitId: line.allowed_unit_id,
              quantity,
              baseQuantity: quantity * factor,
              factor,
              notes: line.notes ?? "",
            };
          });

    for (const line of lines) {
      if (!line.allowedUnitId || line.quantity <= 0) continue;
      const allowed = allowedById.get(line.allowedUnitId);
      const existing = aggregates.get(line.productId);
      if (existing) {
        existing.totalBaseQuantity += line.baseQuantity;
        if (!existing.notes && line.notes.trim()) existing.notes = line.notes;
        continue;
      }
      firstSeen += 1;
      aggregates.set(line.productId, {
        productId: line.productId,
        allowedUnitId: line.allowedUnitId,
        factor: line.factor > 0 ? line.factor : allowedFactor(allowed),
        minimum: positiveNumber(allowed?.min_quantity, 0.5),
        step: positiveNumber(allowed?.quantity_step, 0.5),
        totalBaseQuantity: line.baseQuantity,
        notes: line.notes,
        firstSeen,
      });
    }
  }

  const lines: QbRepeatableOrderLine[] = [...aggregates.values()]
    .sort((left, right) => left.firstSeen - right.firstSeen)
    .map((item) => ({
      productId: item.productId,
      allowedUnitId: item.allowedUnitId,
      inputMode: "quantity",
      quantity: snapAverageToUnit(
        item.totalBaseQuantity / samples.length / item.factor,
        item.minimum,
        item.step,
      ),
      requestedAmountBs: null,
      notes: item.notes,
    }));

  if (!lines.length) return { success: true, order: null };

  const latest = samples[0];
  const oldest = samples.at(-1) ?? latest;
  const currentSamples = samples.filter((sample) => sample.source === "current");
  const sameLocation = currentSamples.every(
    (sample) => sample.locationId === selection.data.locationId,
  );

  return {
    success: true,
    order: {
      id: `average-${samples.map((sample) => sample.id).join("-")}`,
      source: "average",
      submittedAt: latest.submittedAt,
      oldestSubmittedAt: oldest.submittedAt,
      sampleSize: samples.length,
      locationId: sameLocation ? selection.data.locationId : null,
      locationLabel: sameLocation
        ? latest.locationLabel
        : "Varias ubicaciones del cliente",
      sameLocation,
      lines,
    },
  };
}
