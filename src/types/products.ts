export type ProductCategory = {
  id: string;
  name: string;
  description: string | null;
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
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductWithRelations = Product & {
  category: ProductCategory | null;
  unit: UnitOfMeasure | null;
  margin_percentage: number;
  stock_status: "sin_stock" | "stock_bajo" | "ok";
};

export type ProductFilters = {
  q?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
  stock?: "all" | "low";
};
