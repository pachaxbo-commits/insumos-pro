import type { Profile } from "@/types/auth";
import type { ProductWithRelations } from "@/types/products";
import type { Customer, SalePaymentType } from "@/types/sales";
import type { OrderFulfillmentWithSale } from "@/types/fulfillment";

export const ORDER_STATUSES = [
  "borrador",
  "pendiente_revision",
  "recibido",
  "en_preparacion",
  "listo_para_confirmar",
  "confirmado_cliente",
  "preparado_completo",
  "preparado_incompleto",
  "confirmado",
  "despachado",
  "entregado",
  "cancelado",
] as const;

export const ORDER_ITEM_STATUSES = [
  "pendiente",
  "preparado",
  "parcial",
  "sin_stock",
  "cancelado",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];
export type OrderOrigin = "interno" | "catalogo_invitado";
export type OrderDeliveryType = "delivery" | "recojo";
export type OrderExpectedPaymentMethod = "efectivo" | "qr" | "mixto";

export type OrderContactSnapshot = {
  name?: string;
  phone?: string;
};

export type Order = {
  id: string;
  customer_id: string | null;
  order_date: string;
  requested_delivery_date: string | null;
  status: OrderStatus;
  payment_type: SalePaymentType;
  estimated_total: number;
  final_total: number;
  notes: string | null;
  sale_id: string | null;
  prepared_by: string | null;
  confirmed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  prepared_at: string | null;
  confirmed_at: string | null;
  origin: OrderOrigin;
  public_reference: string | null;
  contact_snapshot: OrderContactSnapshot;
  delivery_type: OrderDeliveryType | null;
  delivery_address: string | null;
  delivery_time_window: string | null;
  expected_payment_method: OrderExpectedPaymentMethod | null;
  version: number;
  submitted_at: string | null;
  quote_version: number;
  quote_issued_at: string | null;
  customer_confirmed_at: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string | null;
  unit_name: string | null;
  unit_abbreviation: string | null;
  requested_quantity: number;
  actual_quantity: number;
  unit_price: number;
  estimated_subtotal: number;
  final_subtotal: number;
  status: OrderItemStatus;
  notes: string | null;
  catalog_availability_snapshot: "disponible" | "consultar" | "agotado" | null;
  final_unit_price: number | null;
  price_adjustment_reason: string | null;
  price_adjusted_by: string | null;
  price_adjusted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderPublicEventType =
  | "quote_issued"
  | "quote_revoked"
  | "quote_invalidated"
  | "contact_requested"
  | "customer_confirmed"
  | "customer_confirmed_manually";

export type OrderPublicEvent = {
  id: string;
  order_id: string;
  event_type: OrderPublicEventType;
  quote_version: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PublicOrderQuoteItem = {
  product_name: string;
  requested_quantity: number;
  actual_quantity: number;
  unit_abbreviation: string | null;
  status: OrderItemStatus;
  final_unit_price: number;
  final_subtotal: number;
  notes: string | null;
};

export type PublicOrderQuoteSnapshot = {
  reference: string;
  customer_name: string;
  delivery_type: OrderDeliveryType;
  delivery_address: string | null;
  delivery_time_window: string;
  expected_payment_method: OrderExpectedPaymentMethod;
  notes: string | null;
  quote_version: number;
  final_total: number;
  items: PublicOrderQuoteItem[];
};

export type PublicOrderQuoteResult = {
  status:
    | "idle"
    | "loading"
    | "valid"
    | "confirmed"
    | "invalid"
    | "expired"
    | "revoked"
    | "outdated"
    | "unavailable"
    | "error";
  message?: string;
  snapshot?: PublicOrderQuoteSnapshot;
};

export type PublicOrderQuoteActionState = {
  success: boolean;
  message?: string;
  status?: "confirmed" | "already_confirmed" | "contact_requested";
};

export type OrderItemWithProduct = OrderItem & {
  product: ProductWithRelations | null;
};

export type OrderWithRelations = Order & {
  customer: Customer | null;
  items: OrderItemWithProduct[];
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | null;
  public_events: OrderPublicEvent[];
  fulfillment: OrderFulfillmentWithSale | null;
};

export type OrderFilters = {
  customer?: string;
  status?: OrderStatus | "all";
  date?: string;
};

export type OrdersSummary = {
  totalOrders: number;
  pendingReviewOrders: number;
  receivedOrders: number;
  inPreparationOrders: number;
  readyOrders: number;
  incompleteOrders: number;
  confirmedOrders: number;
};
