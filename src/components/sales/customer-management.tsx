"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Archive, Edit3, Plus, Save, Search, UserRoundCheck } from "lucide-react";

import {
  createCustomerAction,
  deactivateCustomerAction,
  updateCustomerAction,
} from "@/lib/sales/actions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type { Customer, CustomerFilters } from "@/types/sales";
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
import { Textarea } from "@/components/ui/textarea";

type ActionState = {
  success: boolean;
  message?: string;
};

type CustomerManagementProps = {
  customers: Customer[];
  filters: CustomerFilters;
  canManage: boolean;
};

const initialState: ActionState = { success: false };

function NativeSelect({
  name,
  defaultValue,
  children,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="flex h-10 w-full rounded-xl border border-input bg-white/70 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
    >
      {children}
    </select>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-600",
      )}
    >
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

function TypeBadge({ type }: { type: Customer["customer_type"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        type === "credito"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      )}
    >
      {type === "credito" ? "Credito" : "Contado"}
    </Badge>
  );
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

function CustomerForm({ customer }: { customer?: Customer }) {
  const [state, formAction, pending] = useActionState(
    customer ? updateCustomerAction : createCustomerAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nombre comercial</Label>
          <Input
            name="name"
            defaultValue={customer?.name}
            required
            placeholder="Restaurante El Buen Sabor"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Razon social</Label>
          <Input
            name="business_name"
            defaultValue={customer?.business_name ?? ""}
            placeholder="Empresa o razon social"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>NIT/CI</Label>
          <Input name="nit" defaultValue={customer?.nit ?? ""} placeholder="1234567" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input name="phone" defaultValue={customer?.phone ?? ""} placeholder="700-00000" className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            name="email"
            type="email"
            defaultValue={customer?.email ?? ""}
            placeholder="cliente@empresa.com"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <NativeSelect name="customer_type" defaultValue={customer?.customer_type ?? "contado"}>
            <option value="contado">Contado</option>
            <option value="credito">Credito</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Limite de credito</Label>
          <Input
            name="credit_limit"
            type="number"
            min="0"
            step="0.01"
            defaultValue={customer?.credit_limit ?? 0}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Saldo actual</Label>
          <Input
            name="current_balance"
            type="number"
            min="0"
            step="0.01"
            defaultValue={customer?.current_balance ?? 0}
            required
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(customer?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Direccion</Label>
          <Textarea
            name="address"
            defaultValue={customer?.address ?? ""}
            placeholder="Direccion de entrega o referencia"
            className="rounded-xl"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending} className="rounded-xl">
          <Save className="size-4" />
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CustomerDeactivateForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState(deactivateCustomerAction, initialState);
  useActionToast(state);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={customerId} />
      <Button variant="outline" size="icon-sm" type="submit" disabled={pending}>
        <Archive className="size-4" />
        <span className="sr-only">Desactivar cliente</span>
      </Button>
    </form>
  );
}

export function CustomerManagement({
  customers,
  filters,
  canManage,
}: CustomerManagementProps) {
  const activeCustomers = customers.filter((customer) => customer.is_active).length;
  const creditCustomers = customers.filter((customer) => customer.customer_type === "credito").length;
  const totalDebt = customers.reduce((sum, customer) => sum + Number(customer.current_balance), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Clientes activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{activeCustomers}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Clientes a credito</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{creditCustomers}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Saldo por cobrar</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{formatCurrency(totalDebt)}</p>
        </div>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">Clientes</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Gestiona cartera comercial, limites de credito y saldos por cobrar.
              </p>
            </div>
            {canManage ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="rounded-xl">
                    <Plus className="size-4" />
                    Nuevo cliente
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Nuevo cliente</DialogTitle>
                    <DialogDescription>Registra un cliente para ventas de contado o credito.</DialogDescription>
                  </DialogHeader>
                  <CustomerForm />
                </DialogContent>
              </Dialog>
            ) : (
              <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                Solo lectura
              </Badge>
            )}
          </div>

          <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]" action="/clientes">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Buscar por cliente, razon social, NIT o telefono"
                className="h-10 rounded-xl pl-10"
              />
            </div>
            <NativeSelect name="type" defaultValue={filters.type ?? "all"}>
              <option value="all">Todos los tipos</option>
              <option value="contado">Contado</option>
              <option value="credito">Credito</option>
            </NativeSelect>
            <NativeSelect name="status" defaultValue={filters.status ?? "all"}>
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </NativeSelect>
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
                  <TableHead>Contacto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Limite</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                          <UserRoundCheck className="size-4" />
                        </span>
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.business_name || customer.nit || "Sin razon social"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{customer.phone || "N/D"}</p>
                        <p className="text-xs text-muted-foreground">{customer.email || "Sin email"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={customer.customer_type} />
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(customer.credit_limit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(customer.current_balance)}</TableCell>
                    <TableCell>
                      <StatusBadge active={customer.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon-sm">
                                  <Edit3 className="size-4" />
                                  <span className="sr-only">Editar cliente</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
                                <DialogHeader>
                                  <DialogTitle>Editar cliente</DialogTitle>
                                  <DialogDescription>Actualiza datos comerciales y credito.</DialogDescription>
                                </DialogHeader>
                                <CustomerForm customer={customer} />
                              </DialogContent>
                            </Dialog>
                            {customer.is_active ? (
                              <CustomerDeactivateForm customerId={customer.id} />
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Lectura</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!customers.length ? (
            <div className="py-12 text-center">
              <p className="font-medium">No hay clientes para estos filtros</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta la busqueda o registra el primer cliente.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
