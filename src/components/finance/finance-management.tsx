"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  HandCoins,
  ReceiptText,
  Save,
  WalletCards,
} from "lucide-react";

import {
  registerManualCashMovementAction,
  registerPayablePaymentAction,
  registerReceivablePaymentAction,
} from "@/lib/finance/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AccountPayable,
  AccountReceivableFinance,
  CashMovement,
  FinanceFilters,
  FinancePaymentMethod,
  FinanceStatus,
  FinanceSummary,
  Payment,
} from "@/types/finance";
import type { Customer } from "@/types/sales";
import type { Supplier } from "@/types/purchases";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ActionState = {
  success: boolean;
  message?: string;
};

type FinanceManagementProps = {
  receivables: AccountReceivableFinance[];
  payables: AccountPayable[];
  payments: Payment[];
  cashMovements: CashMovement[];
  customers: Customer[];
  suppliers: Supplier[];
  summary: FinanceSummary;
  filters: FinanceFilters;
  canManage: boolean;
};

const initialState: ActionState = { success: false };

const statusStyles: Record<FinanceStatus, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  parcial: "border-sky-200 bg-sky-50 text-sky-700",
  pagada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  vencida: "border-rose-200 bg-rose-50 text-rose-700",
  anulada: "border-slate-200 bg-slate-100 text-slate-600",
};

const paymentMethods: Array<{ value: FinancePaymentMethod; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "qr", label: "QR" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
];

function NativeSelect({
  name,
  defaultValue,
  children,
  required,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      required={required}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function StatusBadge({ status }: { status: FinanceStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-full", statusStyles[status])}>
      {status}
    </Badge>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00`));
}

function useActionToast(state: ActionState) {
  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);
}

function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2 text-sm",
        state.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {state.message}
    </p>
  );
}

function PaymentForm({
  id,
  balance,
  action,
  label,
}: {
  id: string;
  balance: number;
  action: typeof registerReceivablePaymentAction | typeof registerPayablePaymentAction;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const today = new Date().toISOString().slice(0, 10);

  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Monto</Label>
          <Input
            name="amount"
            type="number"
            min="0.01"
            max={balance}
            step="0.01"
            defaultValue={balance}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input name="payment_date" type="date" defaultValue={today} required className="rounded-xl" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Metodo</Label>
          <NativeSelect name="payment_method" defaultValue="transferencia" required>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea name="notes" placeholder="Referencia, comprobante o detalle operativo" className="rounded-xl" />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Registrando..." : label}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ManualCashForm() {
  const [state, formAction, pending] = useActionState(registerManualCashMovementAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <NativeSelect name="source_type" defaultValue="gasto_manual" required>
            <option value="ingreso_manual">Ingreso manual</option>
            <option value="gasto_manual">Gasto manual</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Monto</Label>
          <Input name="amount" type="number" min="0.01" step="0.01" required className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Metodo</Label>
          <NativeSelect name="payment_method" defaultValue="efectivo" required>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Fecha</Label>
          <Input name="movement_date" type="date" defaultValue={today} required className="rounded-xl" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea
            name="notes"
            placeholder="Delivery, transporte, alquiler, sueldos, mantenimiento u otros"
            className="rounded-xl"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Registrando..." : "Registrar movimiento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SummaryCards({ summary }: { summary: FinanceSummary }) {
  const cards = [
    { label: "Cuentas por cobrar", value: formatCurrency(summary.receivableTotal), icon: BanknoteArrowUp },
    { label: "Cuentas por pagar", value: formatCurrency(summary.payableTotal), icon: BanknoteArrowDown },
    { label: "Ingresos hoy", value: formatCurrency(summary.incomeToday), icon: HandCoins },
    { label: "Egresos hoy", value: formatCurrency(summary.expenseToday), icon: WalletCards },
    { label: "Saldo neto caja", value: formatCurrency(summary.netCashToday), icon: CreditCard },
    { label: "Vencidas por cobrar", value: String(summary.overdueReceivable), icon: CalendarClock },
    { label: "Vencidas por pagar", value: String(summary.overduePayable), icon: ReceiptText },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div key={card.label} className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <span className="rounded-xl bg-slate-900 p-2 text-white">
                <Icon className="size-4" />
              </span>
            </div>
            <p className="mt-2 font-heading text-3xl font-semibold">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function ReceivablesTable({
  receivables,
  customers,
  filters,
  canManage,
}: {
  receivables: AccountReceivableFinance[];
  customers: Customer[];
  filters: FinanceFilters;
  canManage: boolean;
}) {
  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="gap-4">
        <CardTitle className="font-heading text-xl">Cuentas por cobrar</CardTitle>
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]" action="/finanzas">
          <input type="hidden" name="tab" value="cobrar" />
          <NativeSelect name="arCustomer" defaultValue={filters.arCustomer ?? "all"}>
            <option value="all">Todos los clientes</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="arStatus" defaultValue={filters.arStatus ?? "all"}>
            <option value="all">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagada">Pagada</option>
            <option value="vencida">Vencida</option>
            <option value="anulada">Anulada</option>
          </NativeSelect>
          <Input name="arDate" type="date" defaultValue={filters.arDate ?? ""} className="h-10 rounded-xl" />
          <Button type="submit" variant="outline" className="rounded-xl">
            Filtrar
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Cliente</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivables.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.customer?.name ?? "Cliente no disponible"}</TableCell>
                  <TableCell>{formatDate(item.due_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.paid_amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.balance))}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {canManage && item.balance > 0 ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-xl">
                              Registrar cobro
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-xl">
                            <DialogHeader>
                              <DialogTitle>Registrar cobro</DialogTitle>
                              <DialogDescription>
                                Saldo pendiente: {formatCurrency(Number(item.balance))}
                              </DialogDescription>
                            </DialogHeader>
                            <PaymentForm
                              id={item.id}
                              balance={Number(item.balance)}
                              action={registerReceivablePaymentAction}
                              label="Registrar cobro"
                            />
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin acciones</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PayablesTable({
  payables,
  suppliers,
  filters,
  canManage,
}: {
  payables: AccountPayable[];
  suppliers: Supplier[];
  filters: FinanceFilters;
  canManage: boolean;
}) {
  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader className="gap-4">
        <CardTitle className="font-heading text-xl">Cuentas por pagar</CardTitle>
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]" action="/finanzas">
          <input type="hidden" name="tab" value="pagar" />
          <NativeSelect name="apSupplier" defaultValue={filters.apSupplier ?? "all"}>
            <option value="all">Todos los proveedores</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="apStatus" defaultValue={filters.apStatus ?? "all"}>
            <option value="all">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="pagada">Pagada</option>
            <option value="vencida">Vencida</option>
            <option value="anulada">Anulada</option>
          </NativeSelect>
          <Input name="apDate" type="date" defaultValue={filters.apDate ?? ""} className="h-10 rounded-xl" />
          <Button type="submit" variant="outline" className="rounded-xl">
            Filtrar
          </Button>
        </form>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Proveedor</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payables.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.supplier?.name ?? "Proveedor no disponible"}</TableCell>
                  <TableCell>{formatDate(item.due_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.paid_amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.balance))}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      {canManage && item.balance > 0 ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-xl">
                              Registrar pago
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-xl">
                            <DialogHeader>
                              <DialogTitle>Registrar pago</DialogTitle>
                              <DialogDescription>
                                Saldo pendiente: {formatCurrency(Number(item.balance))}
                              </DialogDescription>
                            </DialogHeader>
                            <PaymentForm
                              id={item.id}
                              balance={Number(item.balance)}
                              action={registerPayablePaymentAction}
                              label="Registrar pago"
                            />
                          </DialogContent>
                        </Dialog>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin acciones</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsTable({ payments }: { payments: Payment[] }) {
  return (
    <Card className="border-white/60 bg-card/92 shadow-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Historial de pagos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Relacionado</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{formatDate(payment.payment_date)}</TableCell>
                  <TableCell>{payment.payment_type}</TableCell>
                  <TableCell>{payment.customer?.name ?? payment.supplier?.name ?? "Movimiento manual"}</TableCell>
                  <TableCell>{payment.payment_method}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(payment.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function CashTable({ cashMovements, summary }: { cashMovements: CashMovement[]; summary: FinanceSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-700">Pagos recibidos hoy</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(summary.receivedPaymentsToday)}</p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-sm text-rose-700">Pagos realizados hoy</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(summary.paidPaymentsToday)}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm text-amber-700">Gastos manuales hoy</p>
          <p className="mt-2 font-heading text-2xl font-semibold">{formatCurrency(summary.manualExpensesToday)}</p>
        </div>
      </div>
      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Caja diaria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDate(movement.movement_date)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          movement.movement_type === "ingreso"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        {movement.movement_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{movement.source_type}</TableCell>
                    <TableCell>{movement.payment_method}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(movement.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function FinanceManagement({
  receivables,
  payables,
  payments,
  cashMovements,
  customers,
  suppliers,
  summary,
  filters,
  canManage,
}: FinanceManagementProps) {
  return (
    <div className="space-y-6">
      <SummaryCards summary={summary} />

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start rounded-2xl bg-white/70 p-1">
          <TabsTrigger value="resumen" className="rounded-xl">Resumen</TabsTrigger>
          <TabsTrigger value="cobrar" className="rounded-xl">Cuentas por cobrar</TabsTrigger>
          <TabsTrigger value="pagar" className="rounded-xl">Cuentas por pagar</TabsTrigger>
          <TabsTrigger value="pagos" className="rounded-xl">Pagos</TabsTrigger>
          <TabsTrigger value="caja" className="rounded-xl">Caja</TabsTrigger>
          <TabsTrigger value="manuales" className="rounded-xl">Gastos / Ingresos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <ReceivablesTable receivables={receivables.slice(0, 6)} customers={customers} filters={filters} canManage={canManage} />
            <PayablesTable payables={payables.slice(0, 6)} suppliers={suppliers} filters={filters} canManage={canManage} />
          </div>
        </TabsContent>

        <TabsContent value="cobrar">
          <ReceivablesTable receivables={receivables} customers={customers} filters={filters} canManage={canManage} />
        </TabsContent>

        <TabsContent value="pagar">
          <PayablesTable payables={payables} suppliers={suppliers} filters={filters} canManage={canManage} />
        </TabsContent>

        <TabsContent value="pagos">
          <PaymentsTable payments={payments} />
        </TabsContent>

        <TabsContent value="caja">
          <CashTable cashMovements={cashMovements} summary={summary} />
        </TabsContent>

        <TabsContent value="manuales">
          <Card className="border-white/60 bg-card/92 shadow-sm">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 font-heading text-xl">
                  <CircleDollarSign className="size-5" />
                  Movimientos manuales
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registra ingresos o gastos como delivery, transporte, alquiler, sueldos o mantenimiento.
                </p>
              </div>
              {canManage ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl">Nuevo movimiento</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Movimiento manual de caja</DialogTitle>
                      <DialogDescription>Este registro impacta la caja diaria.</DialogDescription>
                    </DialogHeader>
                    <ManualCashForm />
                  </DialogContent>
                </Dialog>
              ) : null}
            </CardHeader>
            <CardContent>
              <CashTable cashMovements={cashMovements.filter((movement) => movement.source_type.includes("manual"))} summary={summary} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
