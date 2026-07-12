export const PUBLIC_CATALOG_AVAILABILITIES = [
  "disponible",
  "consultar",
  "agotado",
] as const;

export type PublicCatalogAvailability = (typeof PUBLIC_CATALOG_AVAILABILITIES)[number];

export type PublicCatalogCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type PublicCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  referencePrice: number;
  unitName: string;
  unitAbbreviation: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  minimumQuantity: number;
  quantityStep: number;
  availability: PublicCatalogAvailability;
  sortOrder: number;
  categorySortOrder: number;
};

export type LocalCatalogCartItem = {
  productId: string;
  allowedUnitId?: string;
  quantity: number;
  notes?: string;
};

export const PUBLIC_DELIVERY_TYPES = ["delivery", "recojo"] as const;
export const PUBLIC_EXPECTED_PAYMENT_METHODS = ["efectivo", "qr", "mixto"] as const;

export type PublicDeliveryType = (typeof PUBLIC_DELIVERY_TYPES)[number];
export type PublicExpectedPaymentMethod = (typeof PUBLIC_EXPECTED_PAYMENT_METHODS)[number];

export type PublicCheckoutActionState = {
  success: boolean;
  message?: string;
  reference?: string;
};
