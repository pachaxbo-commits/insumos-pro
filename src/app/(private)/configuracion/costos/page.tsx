import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import { QbCostRulesWorkspace, type CostRuleRow } from "@/components/settings/qb-cost-rules-workspace";
import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProductRow = { id: string; name: string; sku: string | null };
type AllowedRow = { id: string; product_id: string; unit_id: string | null; presentation_id: string | null };
type UnitRow = { id: string; name: string; symbol: string; conversion_factor_to_base: number | string; dimension_id: string };
type PresentationRow = { id: string; product_id: string; name: string; symbol: string };
type RuleDbRow = {
  id: string; product_id: string; order_allowed_unit_id: string; cost_basis: "commercial_unit" | "actual_weight";
  rate_amount: number | string; reference_weight_unit_id: string | null; is_active: boolean; row_version: number;
};

export default async function QbCostRulesPage() {
  await requireRoleAccess("/configuracion/costos");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <p role="alert">No está disponible la conexión de datos.</p>;

  const [productsResult, allowedResult, unitsResult, presentationsResult, dimensionsResult, rulesResult] = await Promise.all([
    supabase.from("products").select("id,name,sku").eq("is_active", true).order("name"),
    supabase.from("qb_product_allowed_units").select("id,product_id,unit_id,presentation_id")
      .eq("usage_context", "pedido").eq("is_active", true).order("sort_order"),
    supabase.from("qb_units").select("id,name,symbol,conversion_factor_to_base,dimension_id").eq("is_active", true),
    supabase.from("qb_product_presentations").select("id,product_id,name,symbol").eq("is_active", true),
    supabase.from("qb_unit_dimensions").select("id,code,base_unit_code,is_active").eq("is_active", true),
    supabase.from("qb_product_cost_rules").select("id,product_id,order_allowed_unit_id,cost_basis,rate_amount,reference_weight_unit_id,is_active,row_version"),
  ]);
  const error = productsResult.error ?? allowedResult.error ?? unitsResult.error
    ?? presentationsResult.error ?? dimensionsResult.error ?? rulesResult.error;
  if (error) return <div className="space-y-4"><SettingsNav current="/configuracion/costos" />
    <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm">No se pudieron cargar las unidades y reglas de costo. No se mostraron valores parciales.</p></div>;

  const products = (productsResult.data ?? []) as ProductRow[];
  const allowed = (allowedResult.data ?? []) as AllowedRow[];
  const units = (unitsResult.data ?? []) as UnitRow[];
  const presentations = (presentationsResult.data ?? []) as PresentationRow[];
  const dimensions = (dimensionsResult.data ?? []) as { id: string; code: string; base_unit_code: string; is_active: boolean }[];
  const rules = (rulesResult.data ?? []) as RuleDbRow[];
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const presentationById = new Map(presentations.map((presentation) => [presentation.id, presentation]));
  const rulesByAllowed = new Map(rules.map((rule) => [rule.order_allowed_unit_id, rule]));
  const rows: CostRuleRow[] = allowed.flatMap((item) => {
    const product = productById.get(item.product_id);
    const unit = item.unit_id ? unitById.get(item.unit_id) : null;
    const presentation = item.presentation_id ? presentationById.get(item.presentation_id) : null;
    if (!product || (!unit && !presentation)) return [];
    const rule = rulesByAllowed.get(item.id);
    return [{ productId: product.id, productName: product.name, sku: product.sku,
      allowedUnitId: item.id, commercialUnitLabel: presentation?.symbol || presentation?.name || unit?.symbol || unit?.name || "Unidad",
      costBasis: rule?.cost_basis ?? "commercial_unit", rateAmount: rule ? String(rule.rate_amount) : "",
      referenceWeightUnitId: rule?.reference_weight_unit_id ?? "", active: rule?.is_active ?? true,
      rowVersion: rule?.row_version ?? null, configured: Boolean(rule) }];
  }).sort((a, b) => a.productName.localeCompare(b.productName, "es")
    || a.commercialUnitLabel.localeCompare(b.commercialUnitLabel, "es"));
  const weightDimensionIds = new Set(dimensions.filter((dimension) => dimension.code === "peso"
    && dimension.base_unit_code.trim().toUpperCase() === "KG").map((dimension) => dimension.id));
  const weightUnits = units.filter((unit) => weightDimensionIds.has(unit.dimension_id)
    && Number.isFinite(Number(unit.conversion_factor_to_base)) && Number(unit.conversion_factor_to_base) > 0)
    .map((unit) => ({ id: unit.id, symbol: unit.symbol, name: unit.name }));

  return <div className="space-y-4">
    <PageHeader eyebrow="Administración" title="Configuración · Base de costo"
      description="Define cómo se calcula el costo interno de cada producto y presentación en Recibos nuevos." />
    <SettingsNav current="/configuracion/costos" />
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      Esta configuración no cambia precios de venta, compras ni Recibos existentes. No configures equivalencias comerciales sin validación. En particular, una carga o una referencia histórica como legacy_6 no se convierte automáticamente a KG.
    </div>
    <QbCostRulesWorkspace rows={rows} weightUnits={weightUnits} />
  </div>;
}
