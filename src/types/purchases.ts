import type { ProductWithRelations } from "@/types/products";
import type { Profile } from "@/types/auth";

export const PURCHASE_STATUSES = ["borrador", "confirmada", "cancelada"] as const;
export const PAYMENT_STATUSES = ["pagada", "pendiente", "parcial"] as const;
export const PAYMENT_METHODS = ["efectivo", "transferencia", "qr", "credito"] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Purchase = {
  id: string;
  supplier_id: string | null;
  purchase_date: string;
  status: PurchaseStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  total: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseItem = {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
  created_at: string;
};

export type PurchaseItemWithProduct = PurchaseItem & {
  product: ProductWithRelations | null;
};

export type PurchaseWithRelations = Purchase & {
  supplier: Supplier | null;
  items: PurchaseItemWithProduct[];
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type PurchaseFilters = {
  supplier?: string;
  status?: PurchaseStatus | "all";
  date?: string;
};

export type SupplierFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
};

export type PurchasesSummary = {
  totalPurchases: number;
  draftPurchases: number;
  confirmedPurchases: number;
  pendingPayments: number;
};
