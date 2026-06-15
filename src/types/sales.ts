import type { ProductWithRelations } from "@/types/products";
import type { Profile } from "@/types/auth";

export const CUSTOMER_TYPES = ["contado", "credito"] as const;
export const SALE_STATUSES = ["borrador", "confirmada", "anulada"] as const;
export const SALE_PAYMENT_TYPES = ["contado", "transferencia", "qr", "credito"] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type SaleStatus = (typeof SALE_STATUSES)[number];
export type SalePaymentType = (typeof SALE_PAYMENT_TYPES)[number];

export type Customer = {
  id: string;
  name: string;
  business_name: string | null;
  nit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: CustomerType;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  customer_id: string;
  sale_date: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_type: SalePaymentType;
  status: SaleStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type SaleItemWithProduct = SaleItem & {
  product: ProductWithRelations | null;
};

export type SaleWithRelations = Sale & {
  customer: Customer | null;
  items: SaleItemWithProduct[];
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
};

export type AccountReceivable = {
  id: string;
  sale_id: string;
  customer_id: string;
  amount: number;
  balance: number;
  status: "pendiente" | "pagada" | "parcial" | "anulada";
  created_at: string;
  updated_at: string;
};

export type CustomerFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
  type?: CustomerType | "all";
};

export type SaleFilters = {
  customer?: string;
  status?: SaleStatus | "all";
  date?: string;
};

export type SalesSummary = {
  salesToday: number;
  salesMonth: number;
  activeCustomers: number;
  pendingDebt: number;
  draftSales: number;
  confirmedSales: number;
};

export type TopSoldProduct = {
  product_id: string;
  name: string;
  quantity: number;
  revenue: number;
};
