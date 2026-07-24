export type ProductCategory = {
  id: string;
  name: string;
  description: string | null;
  is_catalog_visible?: boolean;
  catalog_slug?: string | null;
  catalog_sort_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type UnitOfMeasure = {
  id: string;
  name: string;
  abbreviation: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  unit_id: string | null;
  stock_current: number;
  stock_min: number;
  purchase_price: number;
  sale_price: number;
  supplier_name: string | null;
  image_url: string | null;
  matrix_color?: string | null;
  requires_classification?: boolean;
  is_sellable?: boolean;
  is_catalog_visible?: boolean;
  catalog_description?: string | null;
  catalog_sort_order?: number;
  catalog_min_quantity?: number;
  catalog_quantity_step?: number;
  catalog_availability?: CatalogAvailability;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const CATALOG_AVAILABILITIES = [
  "disponible",
  "consultar",
  "agotado",
] as const;

export type CatalogAvailability = (typeof CATALOG_AVAILABILITIES)[number];

export type ProductWithRelations = Product & {
  category: ProductCategory | null;
  unit: UnitOfMeasure | null;
  margin_percentage: number;
  stock_status: "pendiente_regularizacion" | "sin_stock" | "stock_bajo" | "ok";
};

export type ProductFilters = {
  q?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
  stock?: "all" | "low";
};

export type QbUnitDimension = {
  id: string;
  code: string;
  name: string;
  base_unit_code: string;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QbUnit = {
  id: string;
  dimension_id: string;
  code: string;
  name: string;
  symbol: string;
  conversion_factor_to_base: number;
  is_base: boolean;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QbProductUnitSettings = {
  product_id: string;
  base_unit_id: string;
  inventory_unit_id: string | null;
  base_inventory_unit_id: string | null;
  base_price_unit_id: string | null;
  base_sale_price: number | null;
  supports_amount_bs: boolean;
  is_visible_in_qb_catalog: boolean;
  is_classifiable: boolean;
  classification_mode: QbClassificationMode;
  is_qb_active: boolean;
  internal_notes: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QbProductPresentation = {
  id: string;
  product_id: string;
  name: string;
  symbol: string;
  contained_quantity: number;
  contained_unit_id: string;
  base_quantity: number;
  base_unit_id: string;
  conversion_factor_to_base: number;
  allow_purchase: boolean;
  allow_order: boolean;
  allow_sale: boolean;
  allow_inventory: boolean;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const QB_ALLOWED_UNIT_CONTEXTS = [
  "pedido",
  "recepcion",
  "recibo",
  "inventario",
] as const;

export type QbAllowedUnitContext = (typeof QB_ALLOWED_UNIT_CONTEXTS)[number];

export const QB_CLASSIFICATION_MODES = [
  "none",
  "manual",
  "percentage",
  "weight",
] as const;

export type QbClassificationMode = (typeof QB_CLASSIFICATION_MODES)[number];

export type QbProductAllowedUnit = {
  id: string;
  product_id: string;
  usage_context: QbAllowedUnitContext;
  unit_id: string | null;
  presentation_id: string | null;
  is_default: boolean;
  quantity_step: number | null;
  min_quantity: number | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QbClassificationOutputType = "product" | "loss";

export type QbProductClassificationOutput = {
  id: string;
  source_product_id: string;
  output_type: QbClassificationOutputType;
  output_product_id: string | null;
  label: string;
  expected_percentage: number | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QbClassificationProductOption = {
  id: string;
  name: string;
  categoryName: string | null;
  isActive: boolean;
  baseUnitId: string | null;
  isQbActive: boolean;
};

export type QbClassificationEditorData = {
  products: QbClassificationProductOption[];
  settings: QbProductUnitSettings | null;
  presentations: QbProductPresentation[];
  outputs: QbProductClassificationOutput[];
  units: QbUnit[];
};
