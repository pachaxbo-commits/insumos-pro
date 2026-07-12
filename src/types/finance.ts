import type { Customer } from "@/types/sales";
import type { Supplier } from "@/types/purchases";

export const FINANCE_STATUSES = ["pendiente", "parcial", "pagada", "vencida", "anulada"] as const;
export const PAYMENT_METHODS_FINANCE = ["efectivo", "transferencia", "qr", "tarjeta", "otro"] as const;
export const PAYMENT_TYPES = ["cobro_cliente", "pago_proveedor", "ingreso_manual", "gasto_manual"] as const;
export const CASH_MOVEMENT_TYPES = ["ingreso", "egreso"] as const;
export const CASH_SOURCE_TYPES = [
  "venta",
  "compra",
  "cobro_cliente",
  "pago_proveedor",
  "gasto_manual",
  "ingreso_manual",
] as const;

export type FinanceStatus = (typeof FINANCE_STATUSES)[number];
export type FinancePaymentMethod = (typeof PAYMENT_METHODS_FINANCE)[number];
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];
export type CashSourceType = (typeof CASH_SOURCE_TYPES)[number];

export type AccountReceivableFinance = {
  id: string;
  customer_id: string;
  sale_id: string | null;
  amount: number;
  paid_amount: number;
  balance: number;
  due_date: string | null;
  status: FinanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer: Customer | null;
};

export type AccountPayable = {
  id: string;
  supplier_id: string | null;
  purchase_id: string | null;
  amount: number;
  paid_amount: number;
  balance: number;
  due_date: string | null;
  status: FinanceStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  supplier: Supplier | null;
};

export type Payment = {
  id: string;
  payment_type: PaymentType;
  customer_id: string | null;
  supplier_id: string | null;
  sale_id: string | null;
  purchase_id: string | null;
  accounts_receivable_id: string | null;
  accounts_payable_id: string | null;
  amount: number;
  payment_method: FinancePaymentMethod;
  payment_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  fulfillment_id?: string | null;
  idempotency_key?: string | null;
  external_reference?: string | null;
  status?: "activo" | "revertido";
  reversal_of_payment_id?: string | null;
  customer: Pick<Customer, "id" | "name"> | null;
  supplier: Pick<Supplier, "id" | "name"> | null;
};

export type CashMovement = {
  id: string;
  movement_type: CashMovementType;
  source_type: CashSourceType;
  source_id: string | null;
  amount: number;
  payment_method: FinancePaymentMethod;
  movement_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type FinanceFilters = {
  arCustomer?: string;
  arStatus?: FinanceStatus | "all";
  arDate?: string;
  apSupplier?: string;
  apStatus?: FinanceStatus | "all";
  apDate?: string;
};

export type FinanceSummary = {
  receivableTotal: number;
  payableTotal: number;
  incomeToday: number;
  expenseToday: number;
  netCashToday: number;
  overdueReceivable: number;
  overduePayable: number;
  receivedPaymentsToday: number;
  paidPaymentsToday: number;
  manualExpensesToday: number;
};
