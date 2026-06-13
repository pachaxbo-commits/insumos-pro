"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import { Archive, Edit3, Plus, Save, Search, Truck } from "lucide-react";

import {
  createSupplierAction,
  deactivateSupplierAction,
  updateSupplierAction,
} from "@/lib/purchases/actions";
import { cn } from "@/lib/utils";
import type { Supplier, SupplierFilters } from "@/types/purchases";
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

type SupplierManagementProps = {
  suppliers: Supplier[];
  filters: SupplierFilters;
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

function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, formAction, pending] = useActionState(
    supplier ? updateSupplierAction : createSupplierAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Nombre</Label>
          <Input
            name="name"
            defaultValue={supplier?.name}
            required
            placeholder="Agricola Don Pepe"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Contacto</Label>
          <Input
            name="contact_name"
            defaultValue={supplier?.contact_name ?? ""}
            placeholder="Nombre de contacto"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input
            name="phone"
            defaultValue={supplier?.phone ?? ""}
            placeholder="700-00000"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Direccion</Label>
          <Input
            name="address"
            defaultValue={supplier?.address ?? ""}
            placeholder="Direccion referencial"
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <NativeSelect name="is_active" defaultValue={String(supplier?.is_active ?? true)}>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </NativeSelect>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notas</Label>
          <Textarea
            name="notes"
            defaultValue={supplier?.notes ?? ""}
            placeholder="Condiciones, horarios o datos operativos"
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

export function SupplierManagement({
  suppliers,
  filters,
  canManage,
}: SupplierManagementProps) {
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Proveedores</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{suppliers.length}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Activos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{activeSuppliers}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Inactivos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {suppliers.length - activeSuppliers}
          </p>
        </div>
      </div>

      <Card className="border-white/60 bg-card/92 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="font-heading text-xl">Proveedores</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Gestiona proveedores para compras y reposicion de inventario.
              </p>
            </div>
            {canManage ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="rounded-xl">
                    <Plus className="size-4" />
                    Nuevo proveedor
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Nuevo proveedor</DialogTitle>
                    <DialogDescription>Registra un proveedor del catalogo operativo.</DialogDescription>
                  </DialogHeader>
                  <SupplierForm />
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <form className="grid gap-3 md:grid-cols-[1fr_220px_auto]" action="/proveedores">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={filters.q ?? ""}
                placeholder="Buscar proveedor, contacto o telefono"
                className="h-10 rounded-xl pl-10"
              />
            </div>
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
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Direccion</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((supplier) => (
                  <TableRow key={supplier.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                          <Truck className="size-4" />
                        </span>
                        <div>
                          <p className="font-medium">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {supplier.notes || "Sin notas"}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{supplier.contact_name || "N/D"}</TableCell>
                    <TableCell>{supplier.phone || "N/D"}</TableCell>
                    <TableCell>{supplier.address || "N/D"}</TableCell>
                    <TableCell>
                      <StatusBadge active={supplier.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="icon-sm">
                                  <Edit3 className="size-4" />
                                  <span className="sr-only">Editar proveedor</span>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Editar proveedor</DialogTitle>
                                  <DialogDescription>
                                    Actualiza los datos del proveedor.
                                  </DialogDescription>
                                </DialogHeader>
                                <SupplierForm supplier={supplier} />
                              </DialogContent>
                            </Dialog>
                            {supplier.is_active ? (
                              <form action={deactivateSupplierAction}>
                                <input type="hidden" name="id" value={supplier.id} />
                                <Button variant="outline" size="icon-sm" type="submit">
                                  <Archive className="size-4" />
                                  <span className="sr-only">Desactivar proveedor</span>
                                </Button>
                              </form>
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

          {!suppliers.length ? (
            <div className="py-12 text-center">
              <p className="font-medium">No hay proveedores para estos filtros</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajusta la busqueda o registra el primer proveedor.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
