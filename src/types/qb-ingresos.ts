import type {
  ProductWithRelations,
  QbProductAllowedUnit,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
  QbUnitDimension,
} from "@/types/products";
import type { Profile } from "@/types/auth";

export const QB_MERCHANDISE_RECEIPT_STATUSES = [
  "borrador",
  "confirmado",
  "anulado",
] as const;

export type QbMerchandiseReceiptStatus =
  (typeof QB_MERCHANDISE_RECEIPT_STATUSES)[number];

export type QbMerchandiseSourceKind = "universal_unit" | "product_presentation";
export type QbMerchandiseMovementRole = "direct_entry" | "classified_output" | "loss";

export type QbMerchandiseReceipt = {
  id: string;
  receipt_date: string;
  status: QbMerchandiseReceiptStatus;
  reference_code: string | null;
  supplier_name: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  annulled_by: string | null;
  annulled_at: string | null;
  annulled_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type QbMerchandiseReceiptLine = {
  id: string;
  receipt_id: string;
  product_id: string;
  allowed_unit_id: string | null;
  source_kind: QbMerchandiseSourceKind;
  source_unit_id: string | null;
  product_presentation_id: string | null;
  source_label: string;
  source_quantity: number;
  base_unit_id: string;
  base_unit_symbol: string;
  base_quantity: number;
  conversion_factor_to_base: number;
  conversion_snapshot_id: string | null;
  unit_cost: number | null;
  total_cost: number;
  requires_classification: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  product: ProductWithRelations | null;
};

export type QbMerchandiseReceiptClassificationResult = {
  id: string;
  line_id: string;
  configured_output_id: string | null;
  output_type: "product" | "loss";
  output_product_id: string | null;
  label: string;
  assigned_percentage: number | null;
  base_quantity: number;
  assigned_cost: number;
  calculation_snapshot: Record<string, unknown> | null;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  output_product: ProductWithRelations | null;
};

export type QbMerchandiseReceiptMovement = {
  id: string;
  receipt_id: string;
  line_id: string;
  classification_result_id: string | null;
  inventory_movement_id: string | null;
  product_id: string | null;
  movement_type: "entrada" | "merma";
  movement_role: QbMerchandiseMovementRole;
  movement_quantity: number;
  created_at: string;
  product: ProductWithRelations | null;
};

export type QbMerchandiseReceiptLineWithRelations = QbMerchandiseReceiptLine & {
  classification_results: QbMerchandiseReceiptClassificationResult[];
  movements: QbMerchandiseReceiptMovement[];
};

export type QbMerchandiseReceiptWithRelations = QbMerchandiseReceipt & {
  lines: QbMerchandiseReceiptLineWithRelations[];
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type QbIngresosData = {
  receipts: QbMerchandiseReceiptWithRelations[];
  products: ProductWithRelations[];
  qbUnitDimensions: QbUnitDimension[];
  qbUnits: QbUnit[];
  qbProductUnitSettings: QbProductUnitSettings[];
  qbProductPresentations: QbProductPresentation[];
  qbProductAllowedUnits: QbProductAllowedUnit[];
  qbProductClassificationOutputs: QbProductClassificationOutput[];
  qbParametrizationWarning?: string;
  qbIngresosWarning?: string;
  error?: string;
};
