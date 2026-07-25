"use client";

import { useActionState } from "react";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomerAdminAction,
  deleteCustomerAdminAction,
  updateCustomerAdminAction,
  type CustomerAdminActionState,
} from "@/lib/customer-account/admin-actions";
import type { QbCustomerDirectoryRow } from "@/lib/customer-account/directory";

const initialState: CustomerAdminActionState = { success: false };

function Feedback({ state }: { state: CustomerAdminActionState }) {
  return state.message ? (
    <p
      className={`text-sm ${state.success ? "text-emerald-700" : "text-destructive"}`}
      aria-live="polite"
    >
      {state.message}
    </p>
  ) : null;
}

function CustomerFields({
  customer,
  includeEmail = false,
}: {
  customer?: QbCustomerDirectoryRow;
  includeEmail?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Negocio</Label>
        <Input
          name="business_name"
          defaultValue={customer?.businessName}
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <Label>Responsable</Label>
        <Input
          name="responsible_name"
          defaultValue={customer?.responsibleName}
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      {includeEmail ? (
        <div className="space-y-2">
          <Label>Correo</Label>
          <Input name="email" type="email" required maxLength={254} />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>Teléfono o WhatsApp</Label>
        <Input
          name="phone"
          defaultValue={customer?.phone ?? ""}
          maxLength={25}
        />
      </div>
      <div className="space-y-2">
        <Label>Nombre de ubicación</Label>
        <Input
          name="location_label"
          defaultValue={customer?.locationLabel ?? "Principal"}
          required
          minLength={2}
          maxLength={80}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Dirección</Label>
        <Input
          name="address"
          defaultValue={customer?.address ?? ""}
          required
          minLength={5}
          maxLength={300}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>Referencia</Label>
        <Input
          name="reference"
          defaultValue={customer?.locationReference ?? ""}
          maxLength={300}
        />
      </div>
    </div>
  );
}

function NewCustomerForm() {
  const [state, action, pending] = useActionState(
    createCustomerAdminAction,
    initialState,
  );
  return (
    <details className="rounded-2xl border border-emerald-200 bg-emerald-50/45">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold text-emerald-900">
        <Plus className="size-4" />
        Registrar cliente
      </summary>
      <form action={action} className="space-y-4 border-t p-4">
        <CustomerFields includeEmail />
        <div className="flex items-center justify-between gap-3">
          <Feedback state={state} />
          <Button type="submit" disabled={pending}>
            <Plus className="size-4" />
            {pending ? "Registrando…" : "Registrar"}
          </Button>
        </div>
      </form>
    </details>
  );
}

function EditCustomerForm({ customer }: { customer: QbCustomerDirectoryRow }) {
  const [state, action, pending] = useActionState(
    updateCustomerAdminAction,
    initialState,
  );
  return (
    <details className="rounded-xl border bg-white/70">
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
        <div>
          <p className="font-semibold">{customer.businessName}</p>
          <p className="text-xs text-muted-foreground">{customer.email}</p>
        </div>
        <div className="text-sm">
          <p>{customer.responsibleName}</p>
          <p className="text-xs text-muted-foreground">
            {customer.phone ?? "Teléfono pendiente"}
          </p>
        </div>
        <div className="text-sm">
          <p>{customer.locationLabel ?? "Sin ubicación"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {customer.address ?? "Dirección pendiente"}
          </p>
        </div>
        <span className="flex items-center justify-end gap-2">
          <Badge variant="outline">
            {customer.isActive ? "Activo" : "Inactivo"}
          </Badge>
          <Pencil className="size-4 text-muted-foreground" />
        </span>
      </summary>
      <form action={action} className="space-y-4 border-t p-4">
        <input type="hidden" name="id" value={customer.id} />
        <input
          type="hidden"
          name="location_id"
          value={customer.locationId ?? ""}
        />
        <CustomerFields customer={customer} />
        <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Estado</Label>
            <select
              name="is_active"
              defaultValue={String(customer.isActive)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
          <Feedback state={state} />
          <Button type="submit" disabled={pending}>
            <Save className="size-4" />
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
      <DeleteCustomerForm customer={customer} />
    </details>
  );
}

function DeleteCustomerForm({
  customer,
}: {
  customer: QbCustomerDirectoryRow;
}) {
  const [state, action, pending] = useActionState(
    deleteCustomerAdminAction,
    initialState,
  );
  return (
    <form
      action={action}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-rose-100 bg-rose-50/45 p-4"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `¿Eliminar definitivamente a ${customer.businessName}? También se borrarán todos sus pedidos, preparaciones, entregas, recibos, ubicaciones y acceso. Esta acción no se puede deshacer.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={customer.id} />
      <div>
        <p className="text-sm font-medium text-rose-900">Zona de eliminación</p>
        <p className="text-xs text-rose-800">
          Elimina definitivamente al cliente y todo su historial asociado.
        </p>
        <Feedback state={state} />
      </div>
      <Button type="submit" variant="destructive" disabled={pending}>
        <Trash2 className="size-4" />
        {pending ? "Eliminando…" : "Eliminar cliente"}
      </Button>
    </form>
  );
}

export function CustomerDirectoryManager({
  customers,
}: {
  customers: QbCustomerDirectoryRow[];
}) {
  return (
    <div className="space-y-4">
      <NewCustomerForm />
      <div className="space-y-2">
        {customers.map((customer) => (
          <EditCustomerForm key={customer.id} customer={customer} />
        ))}
        {!customers.length ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No hay clientes para estos filtros.
          </div>
        ) : null}
      </div>
    </div>
  );
}
