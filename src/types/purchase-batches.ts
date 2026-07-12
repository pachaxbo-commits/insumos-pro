import type { Profile } from "@/types/auth";
import type { ProductWithRelations } from "@/types/products";
import type { PaymentMethod, Supplier } from "@/types/purchases";

export const PURCHASE_BATCH_STATUSES = ["borrador", "confirmada", "cancelada"] as const;
export const PURCHASE_BATCH_PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "credito"] as const;

export type PurchaseBatchStatus = (typeof PURCHASE_BATCH_STATUSES)[number];
export type PurchaseBatchPaymentMethod = Extract<
  PaymentMethod,
  (typeof PURCHASE_BATCH_PAYMENT_METHODS)[number]
>;

export type PurchaseBatch = {
  id: string;
  batch_date: string;
  status: PurchaseBatchStatus;
  notes: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  child_purchase_ids: string[];
  confirmation_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PurchaseBatchLine = {
  id: string;
  batch_id: string;
  product_id: string;
  supplier_id: string;
  product_name: string | null;
  supplier_name: string | null;
  unit_name: string | null;
  unit_abbreviation: string | null;
  requires_classification: boolean;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  payment_method: PurchaseBatchPaymentMethod;
  notes: string | null;
  sort_order: number;
  line_revision: number;
  created_at: string;
  updated_at: string;
};

export type PurchaseBatchClassificationResult = {
  id: string;
  classification_id: string;
  product_id: string;
  product_name: string;
  unit_name: string | null;
  unit_abbreviation: string | null;
  quantity: number;
  sale_price_snapshot: number;
  sale_value: number;
  assigned_cost: number;
  unit_cost: number;
  sort_order: number;
  created_at: string;
  product: ProductWithRelations | null;
};

export type PurchaseBatchLineClassification = {
  id: string;
  batch_id: string;
  batch_line_id: string;
  base_product_id: string;
  base_product_name: string;
  base_quantity: number;
  base_unit_name: string | null;
  base_unit_abbreviation: string | null;
  original_subtotal: number;
  waste_quantity: number;
  waste_unit_name: string | null;
  waste_unit_abbreviation: string | null;
  distribution_method: "valor_venta";
  status: "borrador" | "lista";
  line_revision: number;
  notes: string | null;
  classified_by: string | null;
  classified_at: string;
  created_at: string;
  updated_at: string;
  results: PurchaseBatchClassificationResult[];
};

export type PurchaseBatchLineWithRelations = PurchaseBatchLine & {
  product: ProductWithRelations | null;
  supplier: Supplier | null;
  classification: PurchaseBatchLineClassification | null;
};

export type PurchaseBatchWithRelations = PurchaseBatch & {
  lines: PurchaseBatchLineWithRelations[];
  child_purchases: Array<{
    id: string;
    supplier_id: string | null;
    purchase_date: string;
    status: string;
    payment_status: string;
    payment_method: string;
    total: number;
  }>;
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type PurchaseBatchTotals = {
  total: number;
  cash: number;
  qrTransfer: number;
  credit: number;
  bySupplier: Array<{
    supplier_id: string;
    supplier_name: string;
    total: number;
  }>;
};
