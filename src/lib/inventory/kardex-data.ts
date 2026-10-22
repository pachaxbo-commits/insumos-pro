import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StockProductRow = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  stockCurrent: number;
  stockMin: number;
  unitSymbol: string;
  isActive: boolean;
};

export type InventoryKardexFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  productId: string | null;
  movementType: "all" | "entrada" | "salida" | "merma" | "ajuste";
  search: string | null;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
};

export type InventoryKardexRow = {
  id: string;
  product_id: string;
  product_name: string;
  unit_symbol: string;
  movement_type: string;
  quantity: number;
  stock_before: number | null;
  stock_after: number | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  responsible: string | null;
  reference: string;
  reference_href: string | null;
  fifo_lots: Array<{ lot_id: string | null; received_at: string | null; quantity: number; historical_unknown: boolean }>;
  affects_stock: boolean;
};

export type InventoryKardexSummaryRow = {
  product_id: string;
  product_name: string;
  unit_symbol: string;
  inbound: number;
  outbound: number;
  waste: number;
  adjustment: number;
  operations: number;
  stock_current: number;
};

export type InventoryKardexPage = {
  total: number;
  rows: InventoryKardexRow[];
  summary: { operations: number; products: InventoryKardexSummaryRow[] };
};

type InventoryKardexRpc = {
  total?: number;
  rows?: Array<Record<string, unknown>>;
  summary?: { operations?: number; products?: Array<Record<string, unknown>> };
};

const emptyKardex: InventoryKardexPage = { total: 0, rows: [], summary: { operations: 0, products: [] } };

export async function getStockProducts(): Promise<{ products: StockProductRow[]; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { products: [], error: "Supabase no está disponible." };
  const { data: productData, error: productError } = await supabase
    .from("products")
    .select("id,name,category_id,stock_current,stock_min,is_active,category:product_categories(name)")
    .order("name", { ascending: true });
  if (productError) return { products: [], error: "No pudimos cargar las existencias." };
  const products = (productData ?? []) as unknown as Array<{
    id: string; name: string; category_id: string | null; stock_current: number | string;
    stock_min: number | string; is_active: boolean;
    category: { name: string } | Array<{ name: string }> | null;
  }>;
  if (!products.length) return { products: [], error: null };
  const { data: settingsData } = await supabase.from("qb_product_unit_settings")
    .select("product_id,base_inventory_unit_id,inventory_unit_id,base_unit_id")
    .in("product_id", products.map((product) => product.id));
  const settings = (settingsData ?? []) as Array<{
    product_id: string; base_inventory_unit_id: string | null; inventory_unit_id: string | null; base_unit_id: string | null;
  }>;
  const unitIds = [...new Set(settings.map((row) => row.base_inventory_unit_id ?? row.inventory_unit_id ?? row.base_unit_id).filter((id): id is string => Boolean(id)))];
  const { data: unitsData } = unitIds.length
    ? await supabase.from("qb_units").select("id,symbol").in("id", unitIds)
    : { data: [] as Array<{ id: string; symbol: string }> };
  const symbols = new Map((unitsData ?? []).map((unit) => [unit.id, unit.symbol]));
  const settingsByProduct = new Map(settings.map((row) => [row.product_id, row]));
  return {
    error: null,
    products: products.map((product) => {
      const setting = settingsByProduct.get(product.id);
      const unitId = setting?.base_inventory_unit_id ?? setting?.inventory_unit_id ?? setting?.base_unit_id;
      const category = Array.isArray(product.category) ? product.category[0] : product.category;
      return {
        id: product.id,
        name: product.name,
        categoryId: product.category_id,
        categoryName: category?.name ?? "Sin categoría",
        stockCurrent: Number(product.stock_current ?? 0),
        stockMin: Number(product.stock_min ?? 0),
        unitSymbol: unitId ? symbols.get(unitId) ?? "Unidad sin configurar" : "Unidad sin configurar",
        isActive: product.is_active,
      };
    }),
  };
}

export async function getInventoryKardexPage(filters: InventoryKardexFilters): Promise<{ data: InventoryKardexPage; error: string | null }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { data: emptyKardex, error: "Supabase no está disponible." };
  const { data, error } = await supabase.rpc("get_qb_inventory_kardex", {
    p_date_from: filters.dateFrom,
    p_date_to: filters.dateTo,
    p_product_id: filters.productId,
    p_movement_type: filters.movementType,
    p_search: filters.search,
    p_order: filters.order,
    p_page_size: filters.pageSize,
    p_offset: (filters.page - 1) * filters.pageSize,
  });
  if (error) return { data: emptyKardex, error: "No pudimos cargar los movimientos del inventario." };
  const result = data as InventoryKardexRpc | null;
  const rows = (result?.rows ?? []).map((row) => ({
    id: String(row.id), product_id: String(row.product_id), product_name: String(row.product_name),
    unit_symbol: String(row.unit_symbol ?? "—"), movement_type: String(row.movement_type),
    quantity: Number(row.quantity ?? 0), stock_before: row.stock_before == null ? null : Number(row.stock_before),
    stock_after: row.stock_after == null ? null : Number(row.stock_after),
    reason: row.reason == null ? null : String(row.reason), notes: row.notes == null ? null : String(row.notes),
    created_at: String(row.created_at), responsible: row.responsible == null ? null : String(row.responsible),
    reference: String(row.reference ?? "Referencia no disponible"), reference_href: row.reference_href == null ? null : String(row.reference_href),
    fifo_lots: Array.isArray(row.fifo_lots) ? row.fifo_lots.map((lot) => {
      const value = lot as Record<string, unknown>;
      return { lot_id: value.lot_id == null ? null : String(value.lot_id), received_at: value.received_at == null ? null : String(value.received_at), quantity: Number(value.quantity ?? 0), historical_unknown: Boolean(value.historical_unknown) };
    }) : [],
    affects_stock: Boolean(row.affects_stock),
  }));
  const summaryProducts = (result?.summary?.products ?? []).map((row) => ({
    product_id: String(row.product_id), product_name: String(row.product_name), unit_symbol: String(row.unit_symbol ?? "—"),
    inbound: Number(row.inbound ?? 0), outbound: Number(row.outbound ?? 0), waste: Number(row.waste ?? 0),
    adjustment: Number(row.adjustment ?? 0), operations: Number(row.operations ?? 0), stock_current: Number(row.stock_current ?? 0),
  }));
  return { data: { total: Number(result?.total ?? 0), rows, summary: { operations: Number(result?.summary?.operations ?? 0), products: summaryProducts } }, error: null };
}
