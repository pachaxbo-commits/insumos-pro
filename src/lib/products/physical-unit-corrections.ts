import "server-only";

import { getProductsCatalogData } from "@/lib/products/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPhysicalCorrectionUnits } from "@/lib/products/physical-unit-correction-units";
import { classifyPhysicalProduct } from "@/lib/products/physical-unit-correction-classification";
import type { ProductCorrectionKind } from "@/lib/products/physical-unit-correction-classification";
import type { QbProductAllowedUnit, QbUnit, QbUnitDimension } from "@/types/products";

export type ProductCorrectionStatus = "safe" | "review" | "blocked";

export type PhysicalUnitCorrectionCandidate = {
  id: string;
  name: string;
  category: string;
  legacyUnit: string;
  qbUnit: string;
  priceUnit: string;
  stock: number;
  purchasePrice: number;
  salePrice: number;
  qbBaseSalePrice: number | null;
  kind: ProductCorrectionKind;
  status: ProductCorrectionStatus;
  statusReason: string;
  suggestedUnitId: string | null;
  manualUnitChoiceAllowed: boolean;
  allowedUnitSummary: string[];
  referenceCounts: Record<string, number>;
  conversionSummary: string[];
  referencesUnavailable: boolean;
  legacyRegularizationAllowed: boolean;
  legacyAllowedUnitDetails: Array<{
    id: string;
    context: string;
    unit: string;
    active: boolean;
    isDefault: boolean;
    minQuantity: number | null;
    quantityStep: number | null;
    references: Array<{ table: string; count: number }>;
  }>;
  legacyRegularizationReason: string | null;
  operationalEnabled: boolean;
};

type ProductReferenceRow = {
  product_id: string;
  reference_counts: Record<string, number> | null;
  references_verified: boolean;
};

type LegacyUnitReferenceRow = {
  product_id: string;
  association_references: Record<string, Array<{ table: string; count: number }>> | null;
  references_verified: boolean;
};

function normalized(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function isMoneySymbol(value: string | null | undefined) {
  return ["BS", "BOB"].includes((value ?? "").trim().toUpperCase().replaceAll(".", ""));
}

function isPhysicalBaseTarget(unit: QbUnit) {
  const code = normalized(unit.code);
  const symbol = normalized(unit.symbol);
  return code === "kg" || code === "litro" || symbol === "kg" || symbol === "l" || symbol === "litro";
}

function targetUnit(kind: ProductCorrectionKind, units: QbUnit[], dimensions: QbUnitDimension[]) {
  if (kind === "review") return null;
  const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension.code]));
  const code = kind === "liquid" ? "volumen" : "peso";
  const candidates = units.filter((unit) => unit.is_active && dimensionById.get(unit.dimension_id) === code &&
    (kind === "liquid"
      ? ["litro", "l"].includes(normalized(unit.code)) || normalized(unit.symbol) === "l"
      : normalized(unit.code) === "kg" || normalized(unit.symbol) === "kg"));
  return candidates.length === 1 ? candidates[0] : null;
}

function candidateReason(input: {
  kind: ProductCorrectionKind; stock: number; prices: number[]; settingsPresent: boolean;
  referenceCounts: Record<string, number>; referencesVerified: boolean; proposed: QbUnit | null;
  presentations: string[]; incompatibleAllowedUnits: string[];
}) {
  if (!input.referencesVerified) return { status: "blocked" as const, reason: "No se pudieron verificar todas las relaciones de la base; la corrección queda bloqueada." };
  if (!input.settingsPresent) return { status: "blocked" as const, reason: "Falta configuración QB de unidad; requiere regularizarla antes de corregir." };
  if (input.stock !== 0) return { status: "blocked" as const, reason: "Tiene stock actual distinto de cero; requiere conteo físico y regularización explícita." };
  const refs = Object.entries(input.referenceCounts).filter(([, count]) => count > 0);
  if (refs.length) return { status: "blocked" as const, reason: `Tiene relaciones en ${refs.map(([name, count]) => `${name} (${count})`).join(", ")}; se conserva la unidad hasta clasificar y proteger esos datos.` };
  if (input.prices.some((value) => value !== 0)) return { status: "review" as const, reason: "Tiene precio de compra, venta o precio base QB. Se conserva cada importe y su unidad; requiere definir su unidad de precio antes de corregir." };
  if (input.incompatibleAllowedUnits.length) return { status: "review" as const, reason: "Las unidades permitidas no comparten la dimensión física propuesta (" + input.incompatibleAllowedUnits.join(", ") + "). Revisa su equivalencia antes de corregir; no se convertirán automáticamente." };
  if (input.kind === "review") return { status: "review" as const, reason: "La categoría y el nombre no permiten confirmar si es sólido o líquido; Administración debe validar la unidad física." };
  if (!input.proposed) return { status: "review" as const, reason: `No existe una correspondencia única y activa para la unidad objetivo ${input.kind === "liquid" ? "L" : "KG"}.` };
  if (input.presentations.length) return { status: "review" as const, reason: "Hay presentaciones o conversiones configuradas. Se revisarán sus dimensiones antes de permitir el cambio." };
  return { status: "safe" as const, reason: "Sin precio, stock ni referencias; la unidad futura puede corregirse sin alterar historial." };
}

export async function getPhysicalUnitCorrectionReview() {
  const pageSize = 100;
  const first = await getProductsCatalogData({}, { page: 1, pageSize, includeQbParametrization: true });
  if (first.error) return { candidates: [] as PhysicalUnitCorrectionCandidate[], units: first.qbUnits, totalProductsReviewed: 0, auditError: first.error };
  const pageResults = [first];
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const result = await getProductsCatalogData({}, { page, pageSize, includeQbParametrization: true });
    if (result.error) return { candidates: [] as PhysicalUnitCorrectionCandidate[], units: first.qbUnits, totalProductsReviewed: 0, auditError: `No se pudo revisar la página ${page} del catálogo: ${result.error}` };
    pageResults.push(result);
  }

  const products = pageResults.flatMap((result) => result.products);
  const distinctProductIds = new Set(products.map((product) => product.id));
  if (products.length !== first.pagination.total || distinctProductIds.size !== products.length ||
    pageResults.some((result) => result.pagination.total !== first.pagination.total)) {
    return {
      candidates: [] as PhysicalUnitCorrectionCandidate[],
      units: first.qbUnits,
      totalProductsReviewed: products.length,
      auditError: "El catálogo cambió mientras se paginaba; actualiza la página para ejecutar una revisión completa.",
    };
  }
  const settings = pageResults.flatMap((result) => result.qbProductUnitSettings);
  const presentations = pageResults.flatMap((result) => result.qbProductPresentations);
  const allowedUnits: QbProductAllowedUnit[] = pageResults.flatMap((result) => result.qbProductAllowedUnits);
  const settingsByProduct = new Map(settings.map((row) => [row.product_id, row]));
  const qbUnitsById = new Map(first.qbUnits.map((unit) => [unit.id, unit]));
  const allCandidateProducts = products.filter((product) => {
    const setting = settingsByProduct.get(product.id);
    const current = qbUnitsById.get(setting?.base_inventory_unit_id ?? setting?.inventory_unit_id ?? setting?.base_unit_id ?? "");
    return isMoneySymbol(product.unit?.abbreviation) || isMoneySymbol(current?.symbol);
  });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { candidates: [] as PhysicalUnitCorrectionCandidate[], units: first.qbUnits, totalProductsReviewed: products.length, auditError: "No hay conexión disponible para verificar dependencias." };
  const references = new Map<string, ProductReferenceRow>();
  const legacyReferences = new Map<string, Record<string, Array<{ table: string; count: number }>>>();
  let referenceError: string | null = null;
  for (let offset = 0; offset < allCandidateProducts.length; offset += 500) {
    const ids = allCandidateProducts.slice(offset, offset + 500).map((product) => product.id);
    const refsResult = await supabase.rpc("admin_get_product_reference_review", { p_product_ids: ids });
    if (refsResult.error) {
      referenceError = "No se pudieron verificar todas las referencias históricas.";
      break;
    }
    for (const row of (refsResult.data ?? []) as ProductReferenceRow[]) references.set(row.product_id, row);
    const legacyRefsResult = await supabase.rpc("admin_preview_legacy_unit_references", { p_product_ids: ids });
    if (legacyRefsResult.error) {
      referenceError = "No se pudieron verificar las referencias de las asociaciones legacy_dump.";
      break;
    }
    for (const row of (legacyRefsResult.data ?? []) as LegacyUnitReferenceRow[]) {
      legacyReferences.set(row.product_id, row.association_references ?? {});
      if (!row.references_verified) referenceError = "No se pudieron verificar las referencias de las asociaciones legacy_dump.";
    }
  }
  const dimensions = first.qbUnitDimensions;
  const validUnits = getPhysicalCorrectionUnits(first.qbUnits, dimensions, first.units);
  const dimensionCodeById = new Map(dimensions.map((dimension) => [dimension.id, dimension.code]));
  const legacyMatches = (unit: QbUnit | null) => {
    if (!unit) return false;
    const norm = (value: string) => normalized(value).replaceAll(".", "").replaceAll(" ", "");
    const keys = new Set([norm(unit.symbol), norm(unit.code)]);
    const matches = first.units.filter((legacy) => legacy.is_active && keys.has(norm(legacy.abbreviation)));
    const preferred = matches.filter((legacy) => [norm(unit.symbol), norm(unit.code)].includes(norm(legacy.name)));
    return preferred.length === 1 || (preferred.length === 0 && matches.length === 1);
  };
  const candidates = allCandidateProducts.map((product) => {
    const setting = settingsByProduct.get(product.id);
    const current = qbUnitsById.get(setting?.base_inventory_unit_id ?? setting?.inventory_unit_id ?? setting?.base_unit_id ?? "");
    const priceUnit = qbUnitsById.get(setting?.base_price_unit_id ?? "");
    const kind = classifyPhysicalProduct(product.category?.name, product.name);
    const proposedRaw = targetUnit(kind, validUnits, dimensions);
    const proposed = legacyMatches(proposedRaw) ? proposedRaw : null;
    const reference = references.get(product.id);
    const referenceCounts = reference?.reference_counts ?? {};
    const productPresentations = presentations.filter((row) => row.product_id === product.id);
    const productAllowedUnits = allowedUnits.filter((row) => row.product_id === product.id);
    const allowedUnitSummary = productAllowedUnits.map((row) => {
      const unit = row.unit_id ? qbUnitsById.get(row.unit_id) : null;
      return row.usage_context + ": " + (unit ? unit.symbol + " (" + (dimensionCodeById.get(unit.dimension_id) ?? "dimensión ausente") + ")" : row.presentation_id ? "presentación " + row.presentation_id : "sin unidad");
    });
    const expectedDimension = kind === "solid" ? "peso" : kind === "liquid" ? "volumen" : null;
    const incompatibleAllowedUnits = productAllowedUnits.flatMap((row, index) => {
      if (!expectedDimension || !row.unit_id) return [];
      const unit = qbUnitsById.get(row.unit_id);
      return unit && dimensionCodeById.get(unit.dimension_id) !== expectedDimension ? [allowedUnitSummary[index] ?? unit.symbol] : [];
    });
    const legacyAllowedUnits = productAllowedUnits.filter((row) => {
      const unit = row.unit_id ? qbUnitsById.get(row.unit_id) : null;
      return Boolean(unit && dimensionCodeById.get(unit.dimension_id) === "legacy_dump");
    });
    const associationReferences = legacyReferences.get(product.id) ?? {};
    const hasLegacyAssociationReferences = legacyAllowedUnits.some((row) => (associationReferences[row.id] ?? []).some((reference) => reference.count > 0));
    const nonLegacyIncompatibleUnits = productAllowedUnits.filter((row) => {
      if (!expectedDimension || !row.unit_id) return Boolean(row.presentation_id);
      const unit = qbUnitsById.get(row.unit_id);
      return !unit || dimensionCodeById.get(unit.dimension_id) !== expectedDimension && dimensionCodeById.get(unit.dimension_id) !== "legacy_dump";
    });
    const priceValues = [Number(product.purchase_price), Number(product.sale_price), Number(setting?.base_sale_price ?? 0)];
    const state = candidateReason({ kind, stock: Number(product.stock_current), prices: priceValues,
      settingsPresent: Boolean(setting), referenceCounts, referencesVerified: !referenceError && Boolean(reference?.references_verified),
      proposed, presentations: productPresentations.map((row) => row.name), incompatibleAllowedUnits });
    const conversionSummary = productPresentations.length
      ? productPresentations.map((row) => {
          const from = qbUnitsById.get(row.contained_unit_id)?.symbol ?? "?";
          const to = qbUnitsById.get(row.base_unit_id)?.symbol ?? "?";
          return `${row.name}: ${row.contained_quantity} ${from} = ${row.base_quantity} ${to}`;
        })
      : ["Sin presentaciones. Las compras comerciales deberán registrar su cantidad física útil antes de ingresar stock."];
    let legacyRegularizationReason: string | null = null;
    if (legacyAllowedUnits.length) {
      if (!reference?.references_verified || referenceError) {
        legacyRegularizationReason = "No se pudieron verificar todas las dependencias del producto.";
      } else if (!legacyReferences.has(product.id)) {
        legacyRegularizationReason = "No se verificaron las referencias directas de las asociaciones heredadas.";
      } else if (hasLegacyAssociationReferences) {
        legacyRegularizationReason = "Una o más asociaciones heredadas ya tienen referencias; no se pueden retirar.";
      } else if (!setting) {
        legacyRegularizationReason = "Falta configuración QB.";
      } else if (!product.is_active || !setting.is_qb_active) {
        legacyRegularizationReason = "El producto o su configuración QB están inactivos; primero requieren una decisión explícita de Administración.";
      } else if (Number(product.stock_current) !== 0) {
        legacyRegularizationReason = "Tiene stock actual distinto de cero.";
      } else if (priceValues.some((value) => value !== 0)) {
        legacyRegularizationReason = "Tiene precios configurados; su unidad requiere revisión antes de cambiarla.";
      } else if (productPresentations.length) {
        legacyRegularizationReason = "Tiene presentaciones o conversiones configuradas.";
      } else if (nonLegacyIncompatibleUnits.length) {
        legacyRegularizationReason = "También hay unidades incompatibles fuera de legacy_dump.";
      } else if (!validUnits.some(isPhysicalBaseTarget)) {
        legacyRegularizationReason = "No existe una unidad física KG o L activa para elegir.";
      } else {
        legacyRegularizationReason = "Puede regularizarse con confirmación individual; se retirarán las cantidades heredadas sin trasladarlas.";
      }
    }
    return {
      id: product.id, name: product.name, category: product.category?.name ?? "Sin categoría",
      legacyUnit: product.unit?.abbreviation ?? "Sin unidad", qbUnit: current ? `${current.name} (${current.symbol})` : "Sin configurar",
      priceUnit: priceUnit ? `${priceUnit.name} (${priceUnit.symbol})` : (product.unit?.abbreviation ?? "Sin configurar"),
      stock: Number(product.stock_current), purchasePrice: Number(product.purchase_price), salePrice: Number(product.sale_price),
      qbBaseSalePrice: setting?.base_sale_price ?? null, kind, status: state.status, statusReason: state.reason,
      suggestedUnitId: proposed?.id ?? null,
      manualUnitChoiceAllowed: state.status === "review" && kind === "review" && !referenceError &&
        Boolean(reference?.references_verified && setting) && Number(product.stock_current) === 0 &&
        priceValues.every((value) => value === 0) && productPresentations.length === 0 && incompatibleAllowedUnits.length === 0,
      allowedUnitSummary,
      referenceCounts, conversionSummary,
      referencesUnavailable: Boolean(referenceError) || !reference?.references_verified,
      legacyRegularizationAllowed: Boolean(legacyAllowedUnits.length && legacyReferences.has(product.id) && !hasLegacyAssociationReferences && setting && reference?.references_verified && !referenceError &&
        Number(product.stock_current) === 0 && product.is_active && setting.is_qb_active && priceValues.every((value) => value === 0) && productPresentations.length === 0 &&
        nonLegacyIncompatibleUnits.length === 0 && validUnits.some(isPhysicalBaseTarget)),
      legacyAllowedUnitDetails: legacyAllowedUnits.map((row) => ({
        id: row.id,
        context: row.usage_context,
        unit: row.unit_id ? qbUnitsById.get(row.unit_id)?.symbol ?? "sin unidad" : "sin unidad",
        active: row.is_active,
        isDefault: row.is_default,
        minQuantity: row.min_quantity === null ? null : Number(row.min_quantity),
        quantityStep: row.quantity_step === null ? null : Number(row.quantity_step),
        references: associationReferences[row.id] ?? [],
      })),
      legacyRegularizationReason,
      operationalEnabled: Boolean(product.is_active && setting?.is_qb_active),
    } satisfies PhysicalUnitCorrectionCandidate;
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { candidates, units: validUnits, totalProductsReviewed: products.length, auditError: referenceError };
}
