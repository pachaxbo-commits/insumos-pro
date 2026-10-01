export type QbReceiptStatus = "borrador" | "emitido" | "anulado";
export type QbReceiptPaymentStatus = "pendiente" | "pagado" | "cobrado";
export type QbReceiptPricingMode = "legacy" | "line_cost_markup";

export type QbReceiptComparisonUnit = {
  id: string;
  name: string;
  symbol: string;
};

export type QbReceiptOrderStatus = "borrador" | "emitido" | "anulado";

export type QbReceiptLine = {
  id: string;
  orderId: string;
  orderReference: string;
  productId: string;
  productName: string;
  productCode: string | null;
  categoryName: string | null;
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
  basePricePerArroba: number | null;
  previousBasePrice: number | null;
  previousBasePricePerArroba: number | null;
  previousSalePrice: number | null;
  salePricePerArroba: number | null;
  purchaseCostTotal: number | null;
  costBaseUnitSnapshot: string | null;
  costTotalPrecise: string | null;
  saleTotalPrecise: string | null;
  profitUnitPrecise: string | null;
  profitTotalPrecise: string | null;
  costSource: "manual" | "purchase_snapshot" | "fifo" | null;
  distanceFactorPercent: number;
  exigencyFactorPercent: number;
  weatherFactorPercent: number;
  extraordinaryFactorPercent: number;
  purchaseCostReferenceUnitId: string | null;
  purchaseCostReferenceUnitSymbol: string | null;
  purchaseCostReferenceValue: number | null;
  previousPurchaseCostReferenceUnitSymbol: string | null;
  previousPurchaseCostReferenceValue: number | null;
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
  pricingMode: QbReceiptPricingMode;
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
  costTotalPrecise: string | null;
  saleTotalPrecise: string | null;
  profitTotalPrecise: string | null;
  hasPendingPrices: boolean;
  visibleNote: string | null;
  internalNotes: string | null;
  issuedAt: string | null;
  receiptSentAt: string | null;
  receiptSentBy: string | null;
  paymentStatus: QbReceiptPaymentStatus;
  paidAt: string | null;
  paidBy: string | null;
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
  comparisonUnits: QbReceiptComparisonUnit[];
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
