"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, Package, Search } from "lucide-react";

import { StockAdjustmentDialog } from "@/components/products/product-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryKardexPage, InventoryKardexRow, StockProductRow } from "@/lib/inventory/kardex-data";

type Props = {
  view: "existencias" | "movimientos";
  products: StockProductRow[];
  categories: Array<{ id: string; name: string }>;
  kardex: InventoryKardexPage;
  error: string | null;
  dateFrom: string;
  dateTo: string;
  productId: string;
  movementType: string;
  search: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
  canManage: boolean;
};

function paramsHref(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && String(value)) params.set(key, String(value));
  return `/stock?${params.toString()}`;
}

function number(value: number) {
  return value.toLocaleString("es-BO", { maximumFractionDigits: 3 });
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(value));
}

function status(stock: number, minimum: number) {
  if (stock < 0) return { label: "Revisar saldo", className: "bg-rose-50 text-rose-800" };
  if (stock === 0) return { label: "Sin stock", className: "bg-slate-100 text-slate-700" };
  if (stock <= minimum) return { label: "Stock bajo", className: "bg-amber-50 text-amber-800" };
  return { label: "Normal", className: "bg-emerald-50 text-emerald-800" };
}

export function StockWorkspace(props: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const summaries = useMemo(() => new Map(props.kardex.summary.products.map((row) => [row.product_id, row])), [props.kardex.summary.products]);
  const products = useMemo(() => {
    const normalized = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return props.products.filter((product) => {
      if (!product.isActive) return false;
      const matchesQuery = !normalized || `${product.name} ${product.categoryName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized);
      return matchesQuery && (category === "all" || product.categoryId === (category === "none" ? null : category));
    });
  }, [props.products, query, category]);

  return <div className="space-y-4">
    <nav aria-label="Vistas de stock" className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2 shadow-sm">
      <Link href={paramsHref({ view: "existencias", from: props.dateFrom, to: props.dateTo })} aria-current={props.view === "existencias" ? "page" : undefined} className={`rounded-xl px-4 py-2 text-sm font-semibold ${props.view === "existencias" ? "bg-emerald-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}><Package className="mr-2 inline size-4" />Existencias actuales</Link>
      <Link href={paramsHref({ view: "movimientos", from: props.dateFrom, to: props.dateTo, product: props.productId, type: props.movementType, q: props.search, order: props.order })} aria-current={props.view === "movimientos" ? "page" : undefined} className={`rounded-xl px-4 py-2 text-sm font-semibold ${props.view === "movimientos" ? "bg-emerald-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}><History className="mr-2 inline size-4" />Historial de movimientos</Link>
      {props.canManage ? <Link href="/ingresos" className="ml-auto rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Ver ingresos</Link> : null}
    </nav>

    {props.error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{props.error}</p> : null}

    <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 shadow-sm">
      <input type="hidden" name="view" value={props.view} />
      <label className="text-xs text-slate-600">Consultar un mes<input name="month" type="month" defaultValue={props.dateFrom.slice(0, 7)} className="mt-1 block h-10 rounded-lg border px-2 text-sm" /></label>
      <Button type="submit" variant="outline">Ver mes completo</Button>
      <span className="pb-2 text-xs text-slate-500">O define un rango personalizado en los filtros.</span>
    </form>

    {props.view === "existencias" ? <>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="text-lg font-semibold text-slate-900">Existencias actuales</h2><p className="text-sm text-slate-600">El saldo mostrado es el vigente. Los movimientos y totales corresponden al periodo elegido.</p></div>
          <form method="get" className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="view" value="existencias" />
            <label className="text-xs text-slate-600">Desde<input name="from" type="date" defaultValue={props.dateFrom} className="mt-1 block h-10 rounded-lg border px-2 text-sm" /></label>
            <label className="text-xs text-slate-600">Hasta<input name="to" type="date" defaultValue={props.dateTo} className="mt-1 block h-10 rounded-lg border px-2 text-sm" /></label>
            <Button type="submit" className="self-end">Aplicar periodo</Button>
          </form>
        </div>
        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(220px,1fr)_minmax(190px,260px)]">
          <label className="relative"><span className="sr-only">Buscar producto</span><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o categoría…" className="pl-9" /></label>
          <label className="sr-only" htmlFor="stock-category">Filtrar por categoría</label><select id="stock-category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-sm"><option value="all">Todas las categorías</option>{props.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{props.products.some((product) => !product.categoryId) ? <option value="none">Sin categoría</option> : null}</select>
        </div>
        <p className="mb-2 text-xs text-slate-500">{products.length} de {props.products.filter((product) => product.isActive).length} productos activos · Periodo {props.dateFrom} a {props.dateTo}</p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-700"><tr><th className="p-3">Producto</th><th className="p-3">Unidad física</th><th className="bg-emerald-50 p-3 text-right">Stock actual</th><th className="p-3 text-right">Ingresos</th><th className="p-3 text-right">Salidas</th><th className="p-3 text-right">Mermas</th><th className="p-3 text-right">Ajustes netos</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead>
            <tbody>{products.map((product) => {
              const summary = summaries.get(product.id);
              const currentStatus = status(product.stockCurrent, product.stockMin);
              return <tr key={product.id} className="border-t hover:bg-slate-50"><td className="p-3"><span className="block font-medium">{product.name}</span><span className="text-xs text-slate-500">{product.categoryName}</span></td><td className="p-3">{product.unitSymbol}</td><td className="bg-emerald-50/60 p-3 text-right text-base font-bold tabular-nums">{number(product.stockCurrent)} <span className="text-xs font-medium">{product.unitSymbol}</span></td><td className="p-3 text-right tabular-nums">{number(summary?.inbound ?? 0)}</td><td className="p-3 text-right tabular-nums">{number(summary?.outbound ?? 0)}</td><td className="p-3 text-right tabular-nums">{number(summary?.waste ?? 0)}</td><td className="p-3 text-right tabular-nums">{number(summary?.adjustment ?? 0)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${currentStatus.className}`}>{currentStatus.label}</span></td><td className="p-3"><div className="flex items-center gap-2"><Link className="text-sm font-medium text-emerald-800 underline" href={paramsHref({ view: "movimientos", from: props.dateFrom, to: props.dateTo, product: product.id, type: "all", order: "desc", page: 1 })}>Ver movimientos</Link>{props.canManage ? <StockAdjustmentDialog product={{ id: product.id, name: product.name, stock_current: product.stockCurrent }} history={[]} canManage compact /> : null}</div></td></tr>;
            })}{products.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-slate-500">No hay productos que coincidan con esos filtros.</td></tr> : null}</tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-slate-500">Los importes de compra/venta no forman parte del inventario. Las cantidades se mantienen separadas por producto y unidad.</p>
    </> : <>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="text-lg font-semibold text-slate-900">Kardex de almacén</h2><p className="text-sm text-slate-600">Cada fila representa un movimiento registrado. El abastecimiento externo no aparece como salida de almacén.</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[140px_140px_190px_140px_150px_auto]">
              <input type="hidden" name="view" value="movimientos" />
              <label className="text-xs text-slate-600">Desde<input name="from" type="date" defaultValue={props.dateFrom} className="mt-1 block h-10 w-full rounded-lg border px-2 text-sm" /></label>
              <label className="text-xs text-slate-600">Hasta<input name="to" type="date" defaultValue={props.dateTo} className="mt-1 block h-10 w-full rounded-lg border px-2 text-sm" /></label>
              <label className="text-xs text-slate-600">Producto<select name="product" defaultValue={props.productId} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 text-sm"><option value="">Todos</option>{props.products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.isActive ? "" : " (inactivo)"}</option>)}</select></label>
              <label className="text-xs text-slate-600">Tipo<select name="type" defaultValue={props.movementType} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 text-sm"><option value="all">Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option><option value="merma">Mermas</option><option value="ajuste">Ajustes</option></select></label>
              <label className="text-xs text-slate-600">Orden<select name="order" defaultValue={props.order} className="mt-1 block h-10 w-full rounded-lg border bg-white px-2 text-sm"><option value="desc">Más recientes</option><option value="asc">Más antiguos</option></select></label>
              <Button type="submit" className="self-end">Filtrar</Button>
            </form>
            <a href={`/api/stock/kardex.xlsx?${new URLSearchParams({ from: props.dateFrom, to: props.dateTo, product: props.productId, type: props.movementType, q: props.search, order: props.order })}`} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-slate-50"><ArrowDownToLine className="size-4" />Excel</a>
            <Button type="button" variant="outline" className="h-10" onClick={() => window.print()}><ArrowUpFromLine className="mr-2 size-4" />Imprimir</Button>
          </div>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(220px,360px)_auto]">
          <form method="get" className="flex gap-2">
            <input type="hidden" name="view" value="movimientos" /><input type="hidden" name="from" value={props.dateFrom} /><input type="hidden" name="to" value={props.dateTo} /><input type="hidden" name="product" value={props.productId} /><input type="hidden" name="type" value={props.movementType} /><input type="hidden" name="order" value={props.order} />
            <Input name="q" defaultValue={props.search} placeholder="Buscar producto…" aria-label="Buscar producto en movimientos" /><Button type="submit" variant="outline">Buscar</Button>
          </form>
          <p className="self-center text-sm text-slate-600">{props.kardex.total.toLocaleString("es-BO")} movimientos · {props.dateFrom} a {props.dateTo}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[1300px] border-collapse text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-700"><tr><th className="p-3">Fecha y hora</th><th className="p-3">Producto</th><th className="p-3">Movimiento</th><th className="p-3 text-right">Entrada</th><th className="p-3 text-right">Salida / merma / ajuste</th><th className="p-3">Unidad</th><th className="p-3 text-right">Stock anterior</th><th className="p-3 text-right">Stock posterior</th><th className="p-3">Responsable</th><th className="p-3">Cliente / pedido</th><th className="p-3">Motivo y referencia</th><th className="p-3">Detalle</th></tr></thead>
            <tbody>{props.kardex.rows.map((row) => <MovementRow key={row.id} row={row} />)}{props.kardex.rows.length === 0 ? <tr><td colSpan={12} className="p-8 text-center text-slate-500">No hay movimientos registrados para esos filtros. Las compras en borrador no generan movimientos.</td></tr> : null}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Página {props.page} de {Math.max(1, Math.ceil(props.kardex.total / props.pageSize))} · resumen calculado sobre todo el rango, no solo esta página</span>
          <div className="flex gap-2"><Link aria-disabled={props.page <= 1} className={`rounded-lg border px-3 py-2 ${props.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`} href={paramsHref({ view: "movimientos", from: props.dateFrom, to: props.dateTo, product: props.productId, type: props.movementType, q: props.search, order: props.order, page: Math.max(1, props.page - 1) })}>Anterior</Link><Link aria-disabled={props.page >= Math.ceil(props.kardex.total / props.pageSize)} className={`rounded-lg border px-3 py-2 ${props.page >= Math.ceil(props.kardex.total / props.pageSize) ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`} href={paramsHref({ view: "movimientos", from: props.dateFrom, to: props.dateTo, product: props.productId, type: props.movementType, q: props.search, order: props.order, page: props.page + 1 })}>Siguiente</Link></div>
        </div>
      </section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3"><h3 className="font-semibold">Resumen del periodo por producto</h3><p className="text-xs text-slate-600">Entradas, salidas, mermas y ajustes se agrupan por producto y unidad; no se suman unidades distintas.</p></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-sm"><thead className="bg-slate-100 text-left text-xs uppercase"><tr><th className="p-3">Producto</th><th className="p-3">Unidad</th><th className="p-3 text-right">Ingresado</th><th className="p-3 text-right">Salido</th><th className="p-3 text-right">Merma</th><th className="p-3 text-right">Ajuste neto</th><th className="p-3 text-right">Operaciones</th><th className="bg-emerald-50 p-3 text-right">Stock actual</th></tr></thead><tbody>{props.kardex.summary.products.map((row) => <tr key={row.product_id} className="border-t"><td className="p-3 font-medium">{row.product_name}</td><td className="p-3">{row.unit_symbol}</td><td className="p-3 text-right">{number(row.inbound)}</td><td className="p-3 text-right">{number(row.outbound)}</td><td className="p-3 text-right">{number(row.waste)}</td><td className="p-3 text-right">{number(row.adjustment)}</td><td className="p-3 text-right">{row.operations}</td><td className="bg-emerald-50/60 p-3 text-right font-semibold">{number(row.stock_current)} {row.unit_symbol}</td></tr>)}{!props.kardex.summary.products.length ? <tr><td colSpan={8} className="p-5 text-center text-slate-500">Sin operaciones en el periodo.</td></tr> : null}</tbody></table></div>
      </section>
    </>}
  </div>;
}

function MovementRow({ row }: { row: InventoryKardexRow }) {
  const inbound = row.movement_type === "entrada";
  const outflow = row.movement_type === "salida" || row.movement_type === "salida_conciliada" || row.movement_type === "merma";
  const kindClass = inbound ? "bg-emerald-50 text-emerald-800" : outflow ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-800";
  const delta = row.stock_before === null || row.stock_after === null ? 0 : row.stock_after - row.stock_before;
  return <tr className="border-t align-top hover:bg-slate-50"><td className="whitespace-nowrap p-3">{dateTime(row.created_at)}</td><td className="p-3 font-medium">{row.product_name}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${kindClass}`}>{row.movement_type === "merma" && !row.affects_stock ? "Merma de recepción · sin movimiento de stock" : row.movement_type === "salida_conciliada" ? "Salida conciliada del mismo día" : row.movement_type}</span></td><td className="p-3 text-right font-semibold tabular-nums text-emerald-800">{inbound ? number(row.quantity) : "—"}</td><td className="p-3 text-right font-semibold tabular-nums text-amber-900">{outflow ? number(row.quantity) : row.movement_type === "ajuste" ? `${delta > 0 ? "+" : ""}${number(delta)}` : "—"}</td><td className="p-3">{row.unit_symbol}</td><td className="p-3 text-right tabular-nums">{row.stock_before === null ? "—" : number(row.stock_before)}</td><td className="p-3 text-right tabular-nums">{row.stock_after === null ? "—" : number(row.stock_after)}</td><td className="p-3">{row.responsible ?? "No disponible"}</td><td className="min-w-44 p-3">{row.customer_name ? <><span className="block font-medium">{row.customer_name}</span><span className="text-xs text-slate-600">{row.order_reference}</span>{row.delivery_at ? <span className="block text-xs text-slate-500">Entrega {dateTime(row.delivery_at)}</span> : null}</> : <span className="text-xs text-slate-500">—</span>}</td><td className="max-w-64 p-3"><span className="block">{row.reason ?? "Sin motivo"}</span>{row.reference_href ? <Link href={row.reference_href} className="text-xs text-emerald-800 underline">{row.reference}</Link> : <span className="text-xs text-slate-500">{row.reference}</span>}</td><td className="p-3">{row.notes || row.fifo_lots.length ? <details><summary className="cursor-pointer text-xs font-semibold text-emerald-800">Ver detalle {row.fifo_lots.length ? `FIFO (${row.fifo_lots.length})` : ""}</summary><div className="mt-2 max-w-64 space-y-1 text-xs text-slate-600">{row.notes ? <p>{row.notes}</p> : null}{row.fifo_lots.map((lot, index) => <p key={`${lot.lot_id ?? "historic"}-${index}`}>{lot.historical_unknown ? "Stock histórico sin lote identificable" : `Lote recibido ${lot.received_at ? dateTime(lot.received_at) : "sin fecha disponible"}`} · {number(lot.quantity)} {row.unit_symbol}</p>)}</div></details> : "—"}</td></tr>;
}
