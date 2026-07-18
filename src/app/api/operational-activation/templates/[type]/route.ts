import { requireAuthenticatedUser } from "@/lib/auth/session";
import { OPERATIONAL_HEADERS, toCsv } from "@/lib/operational-activation/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationalImportType } from "@/types/operational-activation";

export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") return new Response("Acceso no autorizado.", { status: 403 });
  const { type } = await params;
  if (!(["prices", "conversions", "initial_stock"] as string[]).includes(type)) return new Response("Plantilla desconocida.", { status: 404 });
  const importType = type as OperationalImportType;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return new Response("Servicio no disponible.", { status: 503 });
  const [{ data: products, error: productError }, { data: settings }, { data: units }, { data: allowed }, { data: presentations }] = await Promise.all([
    supabase.from("products").select("id,name,stock_current,is_active,category:product_categories(name)").eq("is_active", true).order("name"),
    supabase.from("qb_product_unit_settings").select("product_id,base_sale_price,base_price_unit_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,supports_amount_bs,is_qb_active,is_visible_in_qb_catalog"),
    supabase.from("qb_units").select("id,code,name,symbol,conversion_factor_to_base,is_active"),
    supabase.from("qb_product_allowed_units").select("id,product_id,usage_context,unit_id,presentation_id,is_active"),
    supabase.from("qb_product_presentations").select("id,product_id,name,symbol,conversion_factor_to_base,is_active"),
  ]);
  if (productError) return new Response("No se pudo generar la plantilla.", { status: 500 });
  const settingMap = new Map((settings ?? []).map((row) => [row.product_id, row]));
  const unitMap = new Map((units ?? []).map((row) => [row.id, row]));
  const presentationMap = new Map((presentations ?? []).map((row) => [row.id, row]));
  const rows: Record<string, unknown>[] = [];
  for (const product of products ?? []) {
    const setting = settingMap.get(product.id); if (!setting?.is_qb_active || !setting.is_visible_in_qb_catalog) continue;
    const categoryRelation = product.category as { name: string } | { name: string }[] | null;
    const category = Array.isArray(categoryRelation) ? categoryRelation[0]?.name ?? "" : categoryRelation?.name ?? "";
    const baseId = setting.base_inventory_unit_id ?? setting.inventory_unit_id ?? setting.base_unit_id;
    const baseUnit = unitMap.get(baseId); const pricingUnit = setting.base_price_unit_id ? unitMap.get(setting.base_price_unit_id) : null;
    if (importType === "prices") {
      if (!setting.supports_amount_bs) continue;
      const price = setting.base_sale_price === null ? "" : setting.base_sale_price;
      const available = Boolean(price && pricingUnit?.is_active && (allowed ?? []).some((item) => item.product_id === product.id && item.usage_context === "pedido" && item.unit_id === pricingUnit.id && item.is_active));
      rows.push({ product_id: product.id, product_name: product.name, category, pricing_unit: pricingUnit?.symbol ?? "", current_base_price: price, new_base_price: "", amount_bs_catalog_backed: "true", qb17_status: available ? "available" : price ? "blocked_unit" : "blocked_price", notes: "" });
    } else if (importType === "conversions") {
      const relations = (allowed ?? []).filter((item) => item.product_id === product.id && item.usage_context === "recepcion" && item.is_active);
      if (!relations.length) rows.push({ product_id: product.id, product_name: product.name, category, receiving_unit: "", presentation: "", base_unit: baseUnit?.symbol ?? "", current_factor: "", new_factor: "", status: "pending", notes: "" });
      else for (const relation of relations) { const unit = relation.unit_id ? unitMap.get(relation.unit_id) : null; const presentation = relation.presentation_id ? presentationMap.get(relation.presentation_id) : null; rows.push({ product_id: product.id, product_name: product.name, category, receiving_unit: unit?.code ?? "", presentation: presentation?.name ?? "", base_unit: baseUnit?.symbol ?? "", current_factor: unit && baseUnit ? Number(unit.conversion_factor_to_base) / Number(baseUnit.conversion_factor_to_base) : presentation?.conversion_factor_to_base ?? "", new_factor: "", status: "configured", notes: "" }); }
    } else rows.push({ product_id: product.id, product_name: product.name, base_unit: baseUnit?.symbol ?? "", current_stock: product.stock_current, initial_quantity: "", cutoff_date: "", notes: "" });
  }
  const csv = toCsv(OPERATIONAL_HEADERS[importType], rows);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="qb_${importType}_template.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
