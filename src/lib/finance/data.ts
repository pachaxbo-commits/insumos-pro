import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Supplier } from "@/types/purchases";
import type { Customer } from "@/types/sales";
import type {
  AccountPayable,
  AccountReceivableFinance,
  CashMovement,
  FinanceFilters,
  FinanceSummary,
  Payment,
} from "@/types/finance";

export type FinanceData = {
  receivables: AccountReceivableFinance[];
  payables: AccountPayable[];
  payments: Payment[];
  cashMovements: CashMovement[];
  customers: Customer[];
  suppliers: Supplier[];
  summary: FinanceSummary;
};

const customerSelect =
  "id, name, business_name, nit, phone, email, address, customer_type, credit_limit, current_balance, is_active, created_at, updated_at";

const supplierSelect =
  "id, name, contact_name, phone, address, notes, is_active, created_at, updated_at";

const emptySummary: FinanceSummary = {
  receivableTotal: 0,
  payableTotal: 0,
  incomeToday: 0,
  expenseToday: 0,
  netCashToday: 0,
  overdueReceivable: 0,
  overduePayable: 0,
  receivedPaymentsToday: 0,
  paidPaymentsToday: 0,
  manualExpensesToday: 0,
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function buildMaps(customers: Customer[], suppliers: Supplier[]) {
  return {
    customersById: new Map(customers.map((customer) => [customer.id, customer])),
    suppliersById: new Map(suppliers.map((supplier) => [supplier.id, supplier])),
  };
}

function summarize(
  receivables: AccountReceivableFinance[],
  payables: AccountPayable[],
  payments: Payment[],
  cashMovements: CashMovement[],
) {
  const today = todayIso();
  const incomeToday = cashMovements
    .filter((movement) => movement.movement_date === today && movement.movement_type === "ingreso")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);
  const expenseToday = cashMovements
    .filter((movement) => movement.movement_date === today && movement.movement_type === "egreso")
    .reduce((sum, movement) => sum + Number(movement.amount), 0);

  return {
    receivableTotal: receivables.reduce((sum, item) => sum + Number(item.balance), 0),
    payableTotal: payables.reduce((sum, item) => sum + Number(item.balance), 0),
    incomeToday,
    expenseToday,
    netCashToday: incomeToday - expenseToday,
    overdueReceivable: receivables.filter((item) => item.status === "vencida").length,
    overduePayable: payables.filter((item) => item.status === "vencida").length,
    receivedPaymentsToday: payments
      .filter((payment) => payment.payment_date === today && payment.payment_type === "cobro_cliente")
      .reduce((sum, payment) => sum + Number(payment.amount), 0),
    paidPaymentsToday: payments
      .filter((payment) => payment.payment_date === today && payment.payment_type === "pago_proveedor")
      .reduce((sum, payment) => sum + Number(payment.amount), 0),
    manualExpensesToday: cashMovements
      .filter((movement) => movement.movement_date === today && movement.source_type === "gasto_manual")
      .reduce((sum, movement) => sum + Number(movement.amount), 0),
  };
}

export async function getFinanceData(filters: FinanceFilters = {}): Promise<FinanceData> {
  noStore();

  const empty: FinanceData = {
    receivables: [],
    payables: [],
    payments: [],
    cashMovements: [],
    customers: [],
    suppliers: [],
    summary: emptySummary,
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return empty;

  const [customersResult, suppliersResult] = await Promise.all([
    supabase.from("customers").select(customerSelect).order("name", { ascending: true }),
    supabase.from("suppliers").select(supplierSelect).order("name", { ascending: true }),
  ]);

  if (customersResult.error || suppliersResult.error) return empty;

  const customers = (customersResult.data ?? []) as Customer[];
  const suppliers = (suppliersResult.data ?? []) as Supplier[];
  const maps = buildMaps(customers, suppliers);

  let receivablesQuery = supabase
    .from("accounts_receivable")
    .select("id, customer_id, sale_id, amount, paid_amount, balance, due_date, status, notes, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (filters.arCustomer && filters.arCustomer !== "all") {
    receivablesQuery = receivablesQuery.eq("customer_id", filters.arCustomer);
  }

  if (filters.arStatus && filters.arStatus !== "all") {
    receivablesQuery = receivablesQuery.eq("status", filters.arStatus);
  }

  if (filters.arDate) {
    const range = dateRange(filters.arDate);
    receivablesQuery = receivablesQuery.gte("due_date", range.start).lt("due_date", range.end);
  }

  let payablesQuery = supabase
    .from("accounts_payable")
    .select("id, supplier_id, purchase_id, amount, paid_amount, balance, due_date, status, notes, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (filters.apSupplier && filters.apSupplier !== "all") {
    payablesQuery = payablesQuery.eq("supplier_id", filters.apSupplier);
  }

  if (filters.apStatus && filters.apStatus !== "all") {
    payablesQuery = payablesQuery.eq("status", filters.apStatus);
  }

  if (filters.apDate) {
    const range = dateRange(filters.apDate);
    payablesQuery = payablesQuery.gte("due_date", range.start).lt("due_date", range.end);
  }

  const [receivablesResult, payablesResult, paymentsResult, cashResult] = await Promise.all([
    receivablesQuery,
    payablesQuery,
    supabase
      .from("payments")
      .select(
        "id, payment_type, customer_id, supplier_id, sale_id, purchase_id, accounts_receivable_id, accounts_payable_id, amount, payment_method, payment_date, notes, created_by, created_at",
      )
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("cash_movements")
      .select("id, movement_type, source_type, source_id, amount, payment_method, movement_date, notes, created_by, created_at")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  if (receivablesResult.error || payablesResult.error || paymentsResult.error || cashResult.error) {
    return empty;
  }

  const receivables = ((receivablesResult.data ?? []) as Omit<AccountReceivableFinance, "customer">[]).map(
    (item) => ({
      ...item,
      customer: maps.customersById.get(item.customer_id) ?? null,
    }),
  );
  const payables = ((payablesResult.data ?? []) as Omit<AccountPayable, "supplier">[]).map((item) => ({
    ...item,
    supplier: item.supplier_id ? maps.suppliersById.get(item.supplier_id) ?? null : null,
  }));
  const payments = ((paymentsResult.data ?? []) as Omit<Payment, "customer" | "supplier">[]).map((payment) => ({
    ...payment,
    customer: payment.customer_id ? maps.customersById.get(payment.customer_id) ?? null : null,
    supplier: payment.supplier_id ? maps.suppliersById.get(payment.supplier_id) ?? null : null,
  }));
  const cashMovements = (cashResult.data ?? []) as CashMovement[];

  return {
    customers,
    suppliers,
    receivables,
    payables,
    payments,
    cashMovements,
    summary: summarize(receivables, payables, payments, cashMovements),
  };
}
