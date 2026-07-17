export type QbGuestOrderItemInput = {
  productId: string;
  allowedUnitId: string;
  quantity: number;
  notes?: string | null;
};

export type QbGuestOrderInput = {
  businessName: string;
  fullName: string;
  phone: string;
  email?: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  reference?: string | null;
  googlePlaceId?: string | null;
  customerNotes?: string | null;
  idempotencyKey: string;
  items: QbGuestOrderItemInput[];
};

export type QbGuestOrderActionCode =
  | "created"
  | "already_created"
  | "validation_error"
  | "origin_rejected"
  | "idempotency_conflict"
  | "rate_limited"
  | "order_rejected"
  | "service_unavailable";

export type QbGuestOrderActionResult = {
  success: boolean;
  code: QbGuestOrderActionCode;
  message: string;
  reference?: string;
};
