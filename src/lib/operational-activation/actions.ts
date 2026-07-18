"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_OPERATIONAL_CSV_ROWS } from "@/lib/operational-activation/csv";
import type { OperationalImportType, OperationalPreview, OperationalPreviewRow } from "@/types/operational-activation";

const requestSchema = z.object({
  importType: z.enum(["prices", "conversions", "initial_stock"]),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(MAX_OPERATIONAL_CSV_ROWS),
});

async function getAdminClient() {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") throw new Error("Solo un administrador puede usar la activación operativa.");
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("No se pudo conectar con la configuración operativa.");
  return supabase;
}

function decimal(value: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && Math.abs(number * 10 ** decimals - Math.round(number * 10 ** decimals)) < 1e-7 ? number : null;
}

function finalize(importType: OperationalImportType, fileHash: string, rows: OperationalPreviewRow[]): OperationalPreview {
  const count = (status: OperationalPreviewRow["status"]) => rows.filter((row) => row.status === status).length;
  const invalid = count("invalid");
  const unknown = count("unknown");
  const duplicates = count("duplicate");
  const ambiguous = count("ambiguous");
  const valid = count("valid");
  return { success: true, importType, fileHash, total: rows.length, valid, invalid, unchanged: count("unchanged"), unknown, duplicates, ambiguous, rows, canApply: valid > 0 && invalid + unknown + duplicates + ambiguous === 0 };
}

export async function previewOperationalImportAction(input: unknown): Promise<OperationalPreview> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new Error("El archivo supera los límites o su solicitud no es válida.");
  const { importType, fileHash, rows } = parsed.data;
  const supabase = await getAdminClient();
  const ids = rows.map((row) => row.product_id).filter(Boolean);
  const duplicateIds = new Set(ids.filter((id, index) => ids.indexOf(id) !== index));
  const [{ data: products }, { data: settings }, { data: units }, { data: presentations }, { data: allowed }] = await Promise.all([
    supabase.from("products").select("id,name,category_id,stock_current,is_active,category:product_categories(name)").in("id", ids),
    supabase.from("qb_product_unit_settings").select("product_id,base_sale_price,base_price_unit_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,supports_amount_bs,is_qb_active,is_classifiable").in("product_id", ids),
    supabase.from("qb_units").select("id,code,name,symbol,dimension_id,conversion_factor_to_base,is_active"),
    supabase.from("qb_product_presentations").select("id,product_id,name,symbol,conversion_factor_to_base,is_active").in("product_id", ids),
    supabase.from("qb_product_allowed_units").select("id,product_id,usage_context,unit_id,presentation_id,is_active").in("product_id", ids),
  ]);
  const productMap = new Map((products ?? []).map((row) => [row.id, row]));
  const settingMap = new Map((settings ?? []).map((row) => [row.product_id, row]));
  const unitMap = new Map((units ?? []).map((row) => [row.id, row]));
  const result: OperationalPreviewRow[] = [];

  rows.forEach((row, index) => {
    const base = { rowNumber: index + 2, productId: row.product_id, productName: row.product_name || "Producto desconocido" };
    if (duplicateIds.has(row.product_id)) { result.push({ ...base, currentValue: "", newValue: "", status: "duplicate", message: "El product_id está duplicado." }); return; }
    const product = productMap.get(row.product_id);
    const setting = settingMap.get(row.product_id);
    if (!product || !setting || !product.is_active) { result.push({ ...base, currentValue: "", newValue: "", status: "unknown", message: "El product_id no existe o está inactivo." }); return; }
    if (row.product_name !== product.name) { result.push({ ...base, currentValue: product.name, newValue: row.product_name, status: "invalid", message: "El nombre informativo fue modificado." }); return; }
    const categoryRelation = product.category as { name: string } | { name: string }[] | null;
    const category = Array.isArray(categoryRelation) ? categoryRelation[0]?.name ?? "" : categoryRelation?.name ?? "";

    if (importType === "prices") {
      const current = setting.base_sale_price === null ? "" : String(setting.base_sale_price);
      const pricingUnit = setting.base_price_unit_id ? unitMap.get(setting.base_price_unit_id) : null;
      const available = Boolean(current && pricingUnit?.is_active && (allowed ?? []).some((item) => item.product_id === product.id && item.usage_context === "pedido" && item.unit_id === pricingUnit.id && item.is_active));
      const expectedStatus = available ? "available" : current ? "blocked_unit" : "blocked_price";
      if (row.category !== category || row.pricing_unit !== (pricingUnit?.symbol ?? "") || row.current_base_price !== current || row.amount_bs_catalog_backed !== String(setting.supports_amount_bs) || row.qb17_status !== expectedStatus) { result.push({ ...base, currentValue: current || "Sin precio", newValue: row.new_base_price, status: "invalid", message: "Se modificaron columnas informativas o el archivo está desactualizado." }); return; }
      if (!setting.supports_amount_bs) { result.push({ ...base, currentValue: current, newValue: row.new_base_price, status: "invalid", message: "El producto no está respaldado para pedidos por Bs." }); return; }
      if (!row.new_base_price) { result.push({ ...base, currentValue: current || "Sin precio", newValue: "Sin cambio", status: "unchanged", message: "La celda vacía no retira el precio." }); return; }
      const value = decimal(row.new_base_price, 2);
      if (value === null) { result.push({ ...base, currentValue: current || "Sin precio", newValue: row.new_base_price, status: "invalid", message: "El precio debe ser positivo y tener máximo dos decimales." }); return; }
      if (Number(current) === value) { result.push({ ...base, currentValue: current, newValue: row.new_base_price, status: "unchanged", message: "El precio no cambia." }); return; }
      result.push({ ...base, currentValue: current || "Sin precio", newValue: `${value} Bs`, status: "valid", message: "Precio listo para aplicar.", normalized: { product_id: product.id, expected_price: current || null, new_price: value } });
      return;
    }

    const baseUnitId = setting.base_inventory_unit_id ?? setting.inventory_unit_id ?? setting.base_unit_id;
    const baseUnit = unitMap.get(baseUnitId);
    if (importType === "conversions") {
      if (row.category !== category || row.base_unit !== (baseUnit?.symbol ?? "")) { result.push({ ...base, currentValue: "", newValue: row.new_factor, status: "invalid", message: "La categoría o unidad base informativa fue modificada." }); return; }
      if (!row.new_factor && !row.receiving_unit && !row.presentation) { result.push({ ...base, currentValue: "Sin relación", newValue: "Sin cambio", status: "unchanged", message: "No se indicó una conversión." }); return; }
      const factor = decimal(row.new_factor, 9);
      if (factor === null) { result.push({ ...base, currentValue: row.current_factor, newValue: row.new_factor, status: "invalid", message: "El factor debe ser positivo." }); return; }
      if (Boolean(row.receiving_unit) === Boolean(row.presentation)) { result.push({ ...base, currentValue: "", newValue: row.new_factor, status: "ambiguous", message: "Indica una unidad o una presentación, no ambas." }); return; }
      if (row.receiving_unit) {
        const candidates = (units ?? []).filter((unit) => unit.is_active && [unit.id, unit.code, unit.symbol].some((value) => value.toLocaleLowerCase("es") === row.receiving_unit.toLocaleLowerCase("es")));
        if (candidates.length !== 1 || !baseUnit || candidates[0]?.dimension_id !== baseUnit.dimension_id) { result.push({ ...base, currentValue: "", newValue: row.receiving_unit, status: candidates.length > 1 ? "ambiguous" : "invalid", message: "La unidad no existe o no es compatible con la unidad base." }); return; }
        const target = candidates[0]; const canonical = Number(target.conversion_factor_to_base) / Number(baseUnit.conversion_factor_to_base);
        if (Math.abs(canonical - factor) > 1e-9) { result.push({ ...base, currentValue: String(canonical), newValue: String(factor), status: "invalid", message: "El factor no coincide con la unidad universal existente; no se puede redefinir desde el CSV." }); return; }
        const exists = (allowed ?? []).some((item) => item.product_id === product.id && item.usage_context === "recepcion" && item.unit_id === target.id && item.is_active);
        result.push({ ...base, currentValue: exists ? String(canonical) : "Sin relación", newValue: `${target.symbol}: ${factor}`, status: exists ? "unchanged" : "valid", message: exists ? "La relación ya existe." : "Relación inequívoca lista para aplicar.", normalized: { product_id: product.id, target_kind: "unit", target_id: target.id, new_factor: factor } }); return;
      }
      const candidates = (presentations ?? []).filter((item) => item.product_id === product.id && item.is_active && [item.id, item.name, item.symbol].some((value) => value.toLocaleLowerCase("es") === row.presentation.toLocaleLowerCase("es")));
      if (candidates.length !== 1) { result.push({ ...base, currentValue: "", newValue: row.presentation, status: "ambiguous", message: "La presentación no existe o no es inequívoca para el producto." }); return; }
      const target = candidates[0];
      if (Math.abs(Number(target.conversion_factor_to_base) - factor) > 1e-9) { result.push({ ...base, currentValue: String(target.conversion_factor_to_base), newValue: String(factor), status: "invalid", message: "El factor no coincide con la presentación configurada." }); return; }
      const exists = (allowed ?? []).some((item) => item.product_id === product.id && item.usage_context === "recepcion" && item.presentation_id === target.id && item.is_active);
      result.push({ ...base, currentValue: exists ? String(factor) : "Sin relación", newValue: `${target.name}: ${factor}`, status: exists ? "unchanged" : "valid", message: exists ? "La relación ya existe." : "Presentación lista para aplicar.", normalized: { product_id: product.id, target_kind: "presentation", target_id: target.id, new_factor: factor } }); return;
    }

    if (row.base_unit !== (baseUnit?.symbol ?? "") || row.current_stock !== String(product.stock_current)) { result.push({ ...base, currentValue: String(product.stock_current), newValue: row.initial_quantity, status: "invalid", message: "La unidad base o el saldo informativo fue modificado." }); return; }
    if (!row.initial_quantity && !row.cutoff_date) { result.push({ ...base, currentValue: String(product.stock_current), newValue: "Sin cambio", status: "unchanged", message: "No se indicó stock inicial." }); return; }
    const quantity = decimal(row.initial_quantity, 6);
    if (quantity === null || quantity > 1_000_000 || !/^\d{4}-\d{2}-\d{2}$/.test(row.cutoff_date)) { result.push({ ...base, currentValue: String(product.stock_current), newValue: row.initial_quantity, status: "invalid", message: "La cantidad debe ser positiva, razonable y la fecha obligatoria debe usar AAAA-MM-DD." }); return; }
    const baseAllowed = (allowed ?? []).filter((item) => item.product_id === product.id && item.usage_context === "recepcion" && item.unit_id === baseUnitId && item.is_active);
    if (baseAllowed.length !== 1 || setting.is_classifiable) { result.push({ ...base, currentValue: String(product.stock_current), newValue: String(quantity), status: "invalid", message: "Falta una relación base de recepción inequívoca o el producto requiere clasificación." }); return; }
    result.push({ ...base, currentValue: String(product.stock_current), newValue: `${quantity} ${baseUnit?.symbol ?? ""}`, status: "valid", message: "Creará un ingreso de apertura trazable.", normalized: { product_id: product.id, allowed_unit_id: baseAllowed[0]?.id ?? "", initial_quantity: quantity, cutoff_date: row.cutoff_date } });
  });
  return finalize(importType, fileHash, result);
}

export async function applyOperationalImportAction(preview: OperationalPreview, confirmation: string) {
  if (!preview.canApply || confirmation !== "APLICAR") return { success: false, message: "Revisa la vista previa y confirma escribiendo APLICAR." };
  const supabase = await getAdminClient();
  const rows = preview.rows.filter((row) => row.status === "valid").map((row) => row.normalized);
  const { data, error } = await supabase.rpc("apply_qb_operational_import", { p_import_type: preview.importType, p_file_hash: preview.fileHash, p_rows: rows, p_confirmation: confirmation });
  if (error) return { success: false, message: error.message.includes("ALREADY_APPLIED") ? "Este archivo ya fue aplicado anteriormente." : "No se pudo aplicar el lote. Ningún cambio fue confirmado." };
  revalidatePath("/configuracion/activacion-operativa"); revalidatePath("/productos"); revalidatePath("/ingresos"); revalidatePath("/catalogo");
  return { success: true, message: "Lote aplicado correctamente.", data };
}
