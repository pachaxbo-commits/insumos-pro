export type QbReceiptStatus = "borrador" | "emitido" | "anulado";

export type QbReceiptOrderStatus = "borrador" | "emitido" | "anulado";

export type QbReceiptLine = {
  id: string;
  orderId: string;
  orderReference: string;
  productId: string;
  productName: string;
  deliveredBaseQuantity: number;
  baseUnitSymbol: string;
  visibleUnitLabel: string;
  inputMode: "quantity" | "amount_bs";
  requestedAmountBs: number | null;
  currencySnapshot: string | null;
  pricingUnitSymbol: string | null;
  estimatedBaseQuantity: number | null;
  fixedLineAmount: number | null;
  originalBasePrice: number | null;
  currentBasePrice: number | null;
  currentBasePriceUnitSymbol: string | null;
  basePriceUsed: number | null;
  basePriceEdited: boolean;
  saveAsNewBasePrice: boolean;
  finalUnitPrice: number | null;
  lineTotal: number | null;
  notes: string | null;
};

export type QbReceiptOrder = {
  id: string;
  orderId: string;
  orderReference: string;
  status: QbReceiptOrderStatus;
};

export type QbReceiptEvent = {
  id: string;
  eventType: string;
  createdAt: string;
};

export type QbReceipt = {
  id: string;
  number: string;
  status: QbReceiptStatus;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  distanceFactorPercent: number;
  exigencyFactorPercent: number;
  weatherFactorPercent: number;
  extraordinaryFactorPercent: number;
  subtotalAmount: number;
  totalAmount: number;
  hasPendingPrices: boolean;
  visibleNote: string | null;
  internalNotes: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  orders: QbReceiptOrder[];
  lines: QbReceiptLine[];
  events: QbReceiptEvent[];
};

export type QbReceiptPendingOrder = {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  deliveredAt: string | null;
  locationLabel: string | null;
  locationAddress: string | null;
  deliveredLineCount: number;
};

export type QbReceiptCustomerGroup = {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  orders: QbReceiptPendingOrder[];
};

export type QbReceiptsData = {
  receipts: QbReceipt[];
  pendingGroups: QbReceiptCustomerGroup[];
  error?: string;
};

export type QbReceiptDetailData = {
  receipt: QbReceipt | null;
  error?: string;
};

export type QbReceiptActionState = {
  success: boolean;
  message?: string;
  receiptId?: string;
};
