import "server-only";

import { getQbIngresosData } from "@/lib/qb-ingresos/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WarehousePurchase = {
  id: string;
  receiptId: string;
  date: string;
  status: string;
  productId: string;
  productName: string;
  unitLabel: string;
  quantity: number;
  unitPrice: number;
  total: number;
  referenceUnitId: string;
  referencePrice: number;
  notes: string;
  actor: string;
  createdAt: string;
  updatedAt: string;
  requiresClassification: boolean;
  actualBaseQuantityRecorded: boolean;
  baseQuantity: number;
  baseUnitSymbol: string;
};

type PurchaseRow = {
  id: string;
  receipt_id: string;
  product_id: string;
  source_label: string;
  source_quantity: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  reference_unit_id: string;
  reference_price: number | string;
  notes: string | null;
  requires_classification: boolean;
  actual_base_quantity_recorded: boolean;
  base_quantity: number | string;
  base_unit_symbol: string;
  created_at: string;
  updated_at: string;
  product: { name: string } | { name: string }[] | null;
  receipt: {
    receipt_date: string;
    status: string;
    created_by_profile: { full_name: string | null } | { full_name: string | null }[] | null;
  } | {
    receipt_date: string;
    status: string;
    created_by_profile: { full_name: string | null } | { full_name: string | null }[] | null;
  }[] | null;
};

export async function getWarehousePurchases(date: string) {
  const catalog = await getQbIngresosData();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { catalog, rows: [] as WarehousePurchase[], error: "Supabase no disponible." };

  const { data, error } = await supabase
    .from("qb_merchandise_receipt_lines")
    .select(`id, receipt_id, product_id, source_label, source_quantity, unit_cost,
      total_cost, reference_unit_id, reference_price, notes, requires_classification,
      actual_base_quantity_recorded, base_quantity, base_unit_symbol,
      created_at, updated_at,
      product:products!qb_merchandise_receipt_lines_product_id_fkey(name),
      receipt:qb_merchandise_receipts!qb_merchandise_receipt_lines_receipt_id_fkey!inner(
        receipt_date, status,
        created_by_profile:profiles!qb_merchandise_receipts_created_by_fkey(full_name))`)
    .not("reference_price", "is", null)
    .eq("receipt.receipt_date", date)
    .neq("receipt.status", "anulado")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return { catalog, rows: [] as WarehousePurchase[], error: error.message };
  const rows = ((data ?? []) as unknown as PurchaseRow[]).flatMap((row) => {
    const receipt = Array.isArray(row.receipt) ? row.receipt[0] : row.receipt;
    if (!receipt || receipt.receipt_date !== date || receipt.status === "anulado") return [];
    const product = Array.isArray(row.product) ? row.product[0] : row.product;
    const profile = Array.isArray(receipt.created_by_profile)
      ? receipt.created_by_profile[0] : receipt.created_by_profile;
    return [{
      id: row.id,
      receiptId: row.receipt_id,
      date: receipt.receipt_date,
      status: receipt.status,
      productId: row.product_id,
      productName: product?.name ?? "Producto",
      unitLabel: row.source_label,
      quantity: Number(row.source_quantity),
      unitPrice: Number(row.unit_cost),
      total: Number(row.total_cost),
      referenceUnitId: row.reference_unit_id,
      referencePrice: Number(row.reference_price),
      notes: row.notes ?? "",
      actor: profile?.full_name ?? "Usuario",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requiresClassification: row.requires_classification,
      actualBaseQuantityRecorded: row.actual_base_quantity_recorded,
      baseQuantity: Number(row.base_quantity),
      baseUnitSymbol: row.base_unit_symbol,
    }];
  });
  return { catalog, rows, error: null };
}
