import "server-only";

import { getQbIngresosData } from "@/lib/qb-ingresos/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/auth";

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
  referenceUnitId: string | null;
  referencePrice: number | null;
  referencePriceOrigin: "manual" | "calculated" | null;
  notes: string;
  actor: string;
  createdAt: string;
  updatedAt: string;
  requiresClassification: boolean;
  actualBaseQuantityRecorded: boolean;
  baseQuantity: number;
  baseUnitId: string;
  baseUnitSymbol: string;
  sourceKind: string;
  allowedUnitId: string | null;
  commercialLabel: string | null;
};

export type WarehouseOperatingExpense = {
  id: string;
  clientKey: string;
  date: string;
  concept: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type PurchaseRow = {
  id: string;
  receipt_id: string;
  product_id: string;
  source_label: string;
  source_quantity: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  reference_unit_id: string | null;
  reference_price: number | string | null;
  reference_price_origin: "manual" | "calculated" | null;
  notes: string | null;
  requires_classification: boolean;
  actual_base_quantity_recorded: boolean;
  base_quantity: number | string;
  base_unit_id: string;
  base_unit_symbol: string;
  source_kind: string;
  allowed_unit_id: string | null;
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

export async function getWarehousePurchases(date: string, role: UserRole) {
  const catalog = await getQbIngresosData(role);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { catalog, rows: [] as WarehousePurchase[], expenses: [] as WarehouseOperatingExpense[], error: "Supabase no disponible." };

  if (role === "supervisor") {
    const { data, error } = await supabase.from("qb_operational_warehouse_purchases")
      .select("id,receipt_id,receipt_date,status,product_id,product_name,source_label,source_quantity,unit_cost,total_cost,reference_unit_id,reference_price,reference_price_origin,notes,requires_classification,actual_base_quantity_recorded,base_quantity,base_unit_id,base_unit_symbol,source_kind,allowed_unit_id,created_at,updated_at,created_by_profile_name")
      .eq("receipt_date", date).order("created_at", { ascending: false }).limit(1000);
    if (error) return { catalog, rows: [] as WarehousePurchase[], expenses: [] as WarehouseOperatingExpense[], error: error.message };
    const rows: WarehousePurchase[] = (data ?? []).map((row) => ({
      id: row.id, receiptId: row.receipt_id, date: row.receipt_date, status: row.status,
      productId: row.product_id, productName: row.product_name ?? "Producto", unitLabel: row.source_label,
      quantity: Number(row.source_quantity), unitPrice: Number(row.unit_cost), total: Number(row.total_cost),
      referenceUnitId: row.reference_unit_id, referencePrice: row.reference_price === null ? null : Number(row.reference_price),
      referencePriceOrigin: row.reference_price_origin, notes: row.notes ?? "", actor: row.created_by_profile_name ?? "Usuario",
      createdAt: row.created_at, updatedAt: row.updated_at, requiresClassification: row.requires_classification,
      actualBaseQuantityRecorded: row.actual_base_quantity_recorded, baseQuantity: Number(row.base_quantity),
      baseUnitId: row.base_unit_id, baseUnitSymbol: row.base_unit_symbol, sourceKind: row.source_kind,
      allowedUnitId: row.allowed_unit_id, commercialLabel: row.source_kind === "commercial_unmeasured" ? row.source_label : null,
    }));
    return { catalog, rows, expenses: [] as WarehouseOperatingExpense[], error: null };
  }

  const { data, error } = await supabase
    .from("qb_merchandise_receipt_lines")
    .select(`id, receipt_id, product_id, source_label, source_quantity, unit_cost,
      total_cost, reference_unit_id, reference_price, reference_price_origin, notes, requires_classification,
      actual_base_quantity_recorded, base_quantity, base_unit_id, base_unit_symbol, source_kind, allowed_unit_id,
      created_at, updated_at,
      product:products!qb_merchandise_receipt_lines_product_id_fkey(name),
      receipt:qb_merchandise_receipts!qb_merchandise_receipt_lines_receipt_id_fkey!inner(
        receipt_date, status,
        created_by_profile:profiles!qb_merchandise_receipts_created_by_fkey(full_name))`)
    .eq("is_warehouse_purchase", true)
    .eq("receipt.receipt_date", date)
    .neq("receipt.status", "anulado")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return { catalog, rows: [] as WarehousePurchase[], expenses: [] as WarehouseOperatingExpense[], error: error.message };
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
      productName: product?.name ?? catalog.products.find((item) => item.id === row.product_id)?.name ?? "Producto",
      unitLabel: row.source_label,
      quantity: Number(row.source_quantity),
      unitPrice: Number(row.unit_cost),
      total: Number(row.total_cost),
      referenceUnitId: row.reference_unit_id,
      referencePrice: row.reference_price === null ? null : Number(row.reference_price),
      referencePriceOrigin: row.reference_price_origin,
      notes: row.notes ?? "",
      actor: profile?.full_name ?? "Usuario",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requiresClassification: row.requires_classification,
      actualBaseQuantityRecorded: row.actual_base_quantity_recorded,
      baseQuantity: Number(row.base_quantity),
      baseUnitId: row.base_unit_id,
      baseUnitSymbol: row.base_unit_symbol,
      sourceKind: row.source_kind,
      allowedUnitId: row.allowed_unit_id,
      commercialLabel: row.source_kind === "commercial_unmeasured" ? row.source_label : null,
    }];
  });
  const expensesResult = await supabase
    .from("qb_warehouse_operating_expenses")
    .select("id, client_key, expense_date, concept, amount, created_at, updated_at, created_by, updated_by")
    .eq("expense_date", date)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (expensesResult.error) {
    return { catalog, rows, expenses: [] as WarehouseOperatingExpense[], error: expensesResult.error.message };
  }
  const expenses = (expensesResult.data ?? []).map((row) => ({
    id: row.id,
    clientKey: row.client_key,
    date: row.expense_date,
    concept: row.concept,
    amount: Number(row.amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  }));
  return { catalog, rows, expenses, error: null };
}
