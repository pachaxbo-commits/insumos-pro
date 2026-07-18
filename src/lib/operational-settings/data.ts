import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbOperationalSettings } from "@/types/operational-settings";

type OperationalSettingsRow = {
  strict_stock_control?: boolean;
  strict_stock_enabled_at?: string | null;
  updated_at?: string | null;
  negative_products?: number;
  products_without_base_unit?: number;
  products_without_opening_stock?: number;
  pending_regularization?: number;
};

const initialSettings: QbOperationalSettings = {
  strictStockControl: false,
  strictStockEnabledAt: null,
  updatedAt: null,
  negativeProducts: 0,
  productsWithoutBaseUnit: 0,
  productsWithoutOpeningStock: 0,
  pendingRegularization: 0,
};

export async function getQbOperationalSettingsData(): Promise<QbOperationalSettings> {
  noStore();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return initialSettings;

  const { data, error } = await supabase.rpc("get_qb_operational_settings");
  if (error || !data || typeof data !== "object") return initialSettings;

  const row = data as OperationalSettingsRow;
  return {
    strictStockControl: Boolean(row.strict_stock_control),
    strictStockEnabledAt: row.strict_stock_enabled_at ?? null,
    updatedAt: row.updated_at ?? null,
    negativeProducts: Number(row.negative_products ?? 0),
    productsWithoutBaseUnit: Number(row.products_without_base_unit ?? 0),
    productsWithoutOpeningStock: Number(
      row.products_without_opening_stock ?? 0,
    ),
    pendingRegularization: Number(row.pending_regularization ?? 0),
  };
}
