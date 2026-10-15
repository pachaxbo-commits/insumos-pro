import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPhysicalCorrectionUnits } from "@/lib/products/physical-unit-correction-units";
import type {
  ProductWithRelations,
  QbProductUnitSettings,
  QbProductPresentation,
  QbUnit,
  QbUnitDimension,
  UnitOfMeasure,
} from "@/types/products";

export type PhysicalUnitCorrectionCandidate = {
  id: string;
  name: string;
  legacyUnit: string;
  qbUnit: string;
  stock: number;
  purchasePrice: number;
  salePrice: number;
  qbBaseSalePrice: number | null;
  referenceCounts: Record<string, number>;
  conversionSummary: string[];
  referencesUnavailable: boolean;
};

type ReferenceQueryResult = {
  name: string;
  data: Array<{ product_id: string }> | null;
  error: unknown;
};

function isMoneySymbol(value: string | null | undefined) {
  return ["BS", "BOB"].includes((value ?? "").trim().toUpperCase().replaceAll(".", ""));
}

export async function getPhysicalUnitCorrectionReview({
  products,
  units,
  qbUnits,
  qbUnitDimensions,
  settings,
  presentations,
}: {
  products: ProductWithRelations[];
  units: UnitOfMeasure[];
  qbUnits: QbUnit[];
  qbUnitDimensions: QbUnitDimension[];
  settings: QbProductUnitSettings[];
  presentations: QbProductPresentation[];
}) {
  const settingsByProduct = new Map(settings.map((item) => [item.product_id, item]));
  const qbUnitsById = new Map(qbUnits.map((item) => [item.id, item]));
  const presentationSummaries = new Map<string, string[]>();
  for (const presentation of presentations) {
    const sourceUnit = qbUnitsById.get(presentation.contained_unit_id);
    const baseUnit = qbUnitsById.get(presentation.base_unit_id);
    const description = `${presentation.name} (${presentation.symbol}): ${presentation.contained_quantity} ${sourceUnit?.symbol ?? "?"} = ${presentation.base_quantity} ${baseUnit?.symbol ?? "?"}${presentation.allow_purchase ? " · compra permitida" : ""}${presentation.is_active ? " · activa" : " · inactiva"}`;
    presentationSummaries.set(presentation.product_id, [
      ...(presentationSummaries.get(presentation.product_id) ?? []),
      description,
    ]);
  }
  const candidates = products.filter((product) => {
    const productSettings = settingsByProduct.get(product.id);
    const currentQbUnit = qbUnitsById.get(
      productSettings?.base_inventory_unit_id ?? productSettings?.inventory_unit_id ?? productSettings?.base_unit_id ?? "",
    );
    return isMoneySymbol(product.unit?.abbreviation) || isMoneySymbol(currentQbUnit?.symbol);
  });
  if (!candidates.length) return { candidates: [] as PhysicalUnitCorrectionCandidate[], units: qbUnits };

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      units: qbUnits,
      candidates: candidates.map((product) => ({
        id: product.id,
        name: product.name,
        legacyUnit: product.unit?.abbreviation ?? "Sin unidad",
        qbUnit: "No disponible",
        stock: Number(product.stock_current),
        purchasePrice: Number(product.purchase_price),
        salePrice: Number(product.sale_price),
        qbBaseSalePrice: settingsByProduct.get(product.id)?.base_sale_price ?? null,
        referenceCounts: {},
        conversionSummary: ["No se pudieron cargar las conversiones del producto."],
        referencesUnavailable: true,
      })),
    };
  }

  const ids = candidates.map((product) => product.id);
  const results = await Promise.all([
    supabase.from("inventory_movements").select("product_id").in("product_id", ids),
    supabase.from("inventory_lots").select("product_id").in("product_id", ids),
    supabase.from("inventory_lot_consumptions").select("product_id").in("product_id", ids),
    supabase.from("order_items").select("product_id").in("product_id", ids),
    supabase.from("qb_order_items").select("product_id").in("product_id", ids),
    supabase.from("qb_legacy_order_template_lines").select("product_id").in("product_id", ids),
    supabase.from("qb_order_preparation_items").select("product_id").in("product_id", ids),
    supabase.from("qb_order_delivery_items").select("product_id").in("product_id", ids),
    supabase.from("qb_order_delivery_movements").select("product_id").in("product_id", ids),
    supabase.from("qb_merchandise_receipt_lines").select("product_id").in("product_id", ids),
    supabase.from("qb_merchandise_receipt_classification_results").select("product_id:output_product_id").in("output_product_id", ids),
    supabase.from("qb_product_classification_outputs").select("product_id:source_product_id").in("source_product_id", ids),
    supabase.from("qb_product_classification_outputs").select("product_id:output_product_id").in("output_product_id", ids),
    supabase.from("qb_conversion_snapshots").select("product_id").in("product_id", ids),
    supabase.from("qb_merchandise_receipt_movements").select("product_id").in("product_id", ids),
    supabase.from("qb_receipt_lines").select("product_id").in("product_id", ids),
  ]);
  const namedResults: ReferenceQueryResult[] = results.map((result, index) => ({
    name: ["Movimientos", "Lotes", "Consumos FIFO", "Pedidos", "Pedidos QB", "Plantillas QB", "Preparaciones", "Entregas", "Movimientos de entrega", "Compras", "Clasificaciones", "Clasificación configurada como origen", "Clasificación configurada como resultado", "Snapshots", "Movimientos de compra", "Recibos"][index] ?? "Referencias",
    data: result.data as Array<{ product_id: string }> | null,
    error: result.error,
  }));
  const countsByProduct = new Map<string, Record<string, number>>(
    ids.map((id) => [id, {}]),
  );
  for (const result of namedResults) {
    for (const row of result.data ?? []) {
      const counts = countsByProduct.get(row.product_id);
      if (counts) counts[result.name] = (counts[result.name] ?? 0) + 1;
    }
  }

  const availableUnits = getPhysicalCorrectionUnits(qbUnits, qbUnitDimensions, units);

  return {
    units: availableUnits,
    candidates: candidates.map((product) => {
      const productSettings = settingsByProduct.get(product.id);
      const currentUnit = qbUnitsById.get(
        productSettings?.base_inventory_unit_id ?? productSettings?.inventory_unit_id ?? productSettings?.base_unit_id ?? "",
      );
      return {
        id: product.id,
        name: product.name,
        legacyUnit: product.unit?.abbreviation ?? "Sin unidad",
        qbUnit: currentUnit ? `${currentUnit.name} (${currentUnit.symbol})` : "Sin configurar",
        stock: Number(product.stock_current),
        purchasePrice: Number(product.purchase_price),
        salePrice: Number(product.sale_price),
        qbBaseSalePrice: productSettings?.base_sale_price ?? null,
        referenceCounts: countsByProduct.get(product.id) ?? {},
        conversionSummary: presentationSummaries.get(product.id) ?? [
          "No hay equivalencia de presentación configurada. La compra comercial requerirá medir la cantidad física útil antes de ingresar stock.",
        ],
        referencesUnavailable: namedResults.some((result) => Boolean(result.error)),
      };
    }),
  };
}
