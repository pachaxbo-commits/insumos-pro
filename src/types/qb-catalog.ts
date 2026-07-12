export type QbCatalogAllowedUnit = {
  id: string;
  label: string;
  kind: "universal_unit" | "product_presentation";
  minQuantity: number;
  quantityStep: number;
  isDefault: boolean;
  sortOrder: number;
};

export type QbCatalogCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type QbCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  sortOrder: number;
  allowedUnits: QbCatalogAllowedUnit[];
  isFrequent?: boolean;
};

export type QbLocalCartItem = {
  productId: string;
  allowedUnitId: string;
  quantity: number;
  notes?: string;
};

export type QbCustomerLocation = {
  id: string;
  customerAccountId: string;
  label: string;
  address: string;
  reference: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type QbCustomerAccount = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
};

export type QbOrderStatus =
  | "pendiente_preparacion"
  | "en_preparacion"
  | "preparado"
  | "entregado_pendiente_recibo"
  | "incluido_en_recibo_borrador"
  | "recibo_emitido"
  | "cancelado";

export type QbCustomerOrderItem = {
  id: string;
  productId: string;
  productName: string;
  allowedUnitId: string;
  sourceLabel: string;
  requestedQuantity: number;
  notes: string | null;
};

export type QbCustomerOrder = {
  id: string;
  reference: string;
  status: QbOrderStatus;
  submittedAt: string;
  customerNotes: string | null;
  locationLabel: string | null;
  locationAddress: string | null;
  items: QbCustomerOrderItem[];
};

export type QbFrequentProduct = {
  productId: string;
  count: number;
  lastOrderedAt: string;
};

export type QbCatalogData = {
  products: QbCatalogProduct[];
  categories: QbCatalogCategory[];
  frequentProducts: QbFrequentProduct[];
  error?: string;
};

export type QbCustomerPortalData = {
  account: QbCustomerAccount | null;
  locations: QbCustomerLocation[];
  orders: QbCustomerOrder[];
  frequentProducts: QbFrequentProduct[];
  error?: string;
};

export type QbCatalogActionState = {
  success: boolean;
  message?: string;
  reference?: string;
};
