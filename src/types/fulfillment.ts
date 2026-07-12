export const FULFILLMENT_TYPES = ["delivery", "recojo"] as const;
export const FULFILLMENT_STATUSES = [
  "pendiente",
  "despachado",
  "entregado",
  "retorno_pendiente",
  "devuelto",
  "cancelado",
] as const;
export const ORDER_SALE_PAYMENT_STATUSES = [
  "pendiente",
  "parcial",
  "pagado",
] as const;

export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export type OrderSalePaymentStatus = (typeof ORDER_SALE_PAYMENT_STATUSES)[number];

export type OrderFulfillment = {
  id: string;
  order_id: string;
  sale_id: string | null;
  fulfillment_type: FulfillmentType;
  status: FulfillmentStatus;
  responsible_user_id: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  outstanding_authorized_by: string | null;
  outstanding_authorized_at: string | null;
  outstanding_authorization_reason: string | null;
  outstanding_due_date: string | null;
  return_reason: string | null;
  returned_at: string | null;
  idempotency_key: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FulfillmentPayment = {
  id: string;
  amount: number;
  payment_method: "efectivo" | "qr" | "transferencia";
  external_reference: string | null;
  payment_date: string;
  status: "activo" | "revertido";
};

export type FulfillmentSaleSummary = {
  id: string;
  total: number;
  status: "borrador" | "confirmada" | "anulada";
  paid_amount: number;
  balance_due: number;
  payment_status: OrderSalePaymentStatus;
  payments: FulfillmentPayment[];
};

export type OrderFulfillmentWithSale = OrderFulfillment & {
  sale: FulfillmentSaleSummary | null;
};

export type InitialOrderPaymentInput = {
  paymentMethod: "efectivo" | "qr" | "transferencia";
  amount: number;
  externalReference: string | null;
};
