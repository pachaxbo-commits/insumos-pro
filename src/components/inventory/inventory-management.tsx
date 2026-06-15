"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ClipboardList,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { createInventoryMovementAction } from "@/lib/inventory/actions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActionToast } from "@/hooks/use-action-toast";
import type {
  InventoryFilters,
  InventoryMovementType,
  InventoryMovementWithRelations,
  InventorySummary,
} from "@/types/inventory";
import type { ProductWithRelations } from "@/types/products";
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

type InventoryManagementProps = {
  products: ProductWithRelations[];
  movements: InventoryMovementWithRelations[];
  alerts: ProductWithRelations[];
  summary: InventorySummary;
  filters: InventoryFilters;
  canManage: boolean;
};

const initialState: ActionState = { success: false };

const movementConfig: Record<
  InventoryMovementType,
  { label: string; icon: typeof ArrowDownLeft; className: string }
> = {
  entrada: {
    label: "Entrada",
    icon: ArrowDownLeft,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  devolucion: {
    label: "Devolucion",
    icon: RotateCcw,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  salida: {
    label: "Salida",
    icon: ArrowUpRight,
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
  merma: {
    label: "Merma",
    icon: Trash2,
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  ajuste: {
    label: "Ajuste",
    icon: ArrowRightLeft,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

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

function MovementBadge({ type }: { type: InventoryMovementType }) {
  const config = movementConfig[type];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("rounded-full", config.className)}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}

function StockAlertBadge({ product }: { product: ProductWithRelations }) {
  if (product.stock_status === "sin_stock") {
    return (
      <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-50 text-rose-700">
        Sin stock
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
      Stock bajo
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function MovementForm({ products }: { products: ProductWithRelations[] }) {
  const [state, formAction, pending] = useActionState(
    createInventoryMovementAction,
    initialState,
  );
  useActionToast(state);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Producto</Label>
          <NativeSelect name="product_id" required>
            <option value="">Seleccionar producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} - stock actual {formatNumber(Number(product.stock_current))}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label>Tipo</Label>
          <NativeSelect name="movement_type" defaultValue="entrada" required>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajuste a stock final</option>
            <option value="merma">Merma</option>
            <option value="devolucion">Devolucion</option>
          </NativeSelect>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="10"
            required
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            En ajuste, este valor sera el nuevo stock final.
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="reason">Motivo</Label>
          <Input
            id="reason"
            name="reason"
            placeholder="Reposicion, despacho manual, conteo fisico..."
            required
            className="rounded-xl"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            name="notes"
            placeholder="Detalle opcional del movimiento"
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

function MovementDelta({ movement }: { movement: InventoryMovementWithRelations }) {
  const delta = Number(movement.stock_after) - Number(movement.stock_before);

  return (
    <span className={cn("font-medium", delta >= 0 ? "text-emerald-700" : "text-rose-700")}>
      {delta >= 0 ? "+" : ""}
      {formatNumber(delta)}
    </span>
  );
}

export function InventoryManagement({
  products,
  movements,
  alerts,
  summary,
  filters,
  canManage,
}: InventoryManagementProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Total productos</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.totalProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Stock bajo</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.lowStockProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Sin stock</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.outOfStockProducts}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Movimientos de hoy</p>
          <p className="mt-2 font-heading text-3xl font-semibold">{summary.movementsToday}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="font-heading text-xl">Historial de movimientos</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cada cambio de stock queda registrado con antes, despues y usuario.
                </p>
              </div>
              {canManage ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="rounded-xl" disabled={!products.length}>
                      <ClipboardList className="size-4" />
                      Registrar movimiento
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Registrar movimiento</DialogTitle>
                      <DialogDescription>
                        Entradas y devoluciones suman; salidas y mermas restan; ajuste define el stock final.
                      </DialogDescription>
                    </DialogHeader>
                    {products.length ? (
                      <MovementForm products={products} />
                    ) : (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        No hay productos activos para registrar movimientos. Primero crea o activa un producto.
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              ) : (
                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 text-slate-600">
                  Solo lectura
                </Badge>
              )}
            </div>

            <form className="grid gap-3 lg:grid-cols-[1fr_0.75fr_0.75fr_auto]" action="/inventario">
              <NativeSelect name="product" defaultValue={filters.product ?? "all"}>
                <option value="all">Todos los productos</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="type" defaultValue={filters.type ?? "all"}>
                <option value="all">Todos los tipos</option>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="ajuste">Ajuste</option>
                <option value="merma">Merma</option>
                <option value="devolucion">Devolucion</option>
              </NativeSelect>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="date"
                  type="date"
                  defaultValue={filters.date ?? ""}
                  className="h-10 rounded-xl pl-10"
                />
              </div>
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
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Antes</TableHead>
                    <TableHead className="text-right">Despues</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Usuario</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{formatDateTime(movement.created_at)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{movement.product?.name ?? "Producto eliminado"}</p>
                          <p className="text-xs text-muted-foreground">
                            {movement.product?.sku ?? "Sin SKU"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <MovementBadge type={movement.movement_type} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-0.5">
                          <p>{formatNumber(Number(movement.quantity))}</p>
                          <MovementDelta movement={movement} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(Number(movement.stock_before))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(Number(movement.stock_after))}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{movement.reason}</p>
                          {movement.notes ? (
                            <p className="text-xs text-muted-foreground">{movement.notes}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {movement.created_by_profile?.full_name ||
                          movement.created_by?.slice(0, 8) ||
                          "Sistema"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!movements.length ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <ClipboardList className="size-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">No hay movimientos para estos filtros</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Registra el primer movimiento o cambia los filtros.
                  </p>
                </div>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/inventario">Limpiar filtros</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-white/60 bg-card/92 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-heading text-lg">
              <ShieldAlert className="size-5 text-amber-700" />
              Alertas de stock
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl border border-border/70 bg-background/80 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Stock {formatNumber(Number(product.stock_current))} / minimo{" "}
                      {formatNumber(Number(product.stock_min))}
                    </p>
                  </div>
                  <StockAlertBadge product={product} />
                </div>
              </div>
            ))}

            {!alerts.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/35 p-6 text-center">
                <p className="font-medium">Sin alertas activas</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Todos los productos activos superan su stock minimo.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
