import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { getOperationalHistory } from "@/lib/operational-history/data";
import { summarizeHistory } from "@/lib/operational-history/summary";

function boliviaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function format(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(value);
}

export default async function HistorialPage({ searchParams }: {
  searchParams: Promise<{ startDate?: string; endDate?: string; customer?: string; product?: string; status?: string }>;
}) {
  await requireRoleAccess("/historial");
  const params = await searchParams;
  const today = boliviaToday();
  const defaultStart = new Date(`${today}T12:00:00-04:00`);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
  const startDate = validDate(params.startDate, defaultStart.toISOString().slice(0, 10));
  const endDate = validDate(params.endDate, today);
  const rangeDays = (Date.parse(endDate) - Date.parse(startDate)) / 86400000;
  const rangeError = rangeDays < 0 || rangeDays > 89 ? "Selecciona un rango de 1 a 90 días." : null;
  const data = rangeError ? { orders: [], error: rangeError, truncated: false } : await getOperationalHistory(startDate, endDate);
  const customers = [...new Map(data.orders.map((order) => [order.customerId, order.customerName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const products = [...new Map(data.orders.flatMap((order) => order.lines.map((line) => [line.productId, line.productName] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const statuses = [...new Set(data.orders.map((order) => order.status))].sort();
  const filtered = data.orders.filter((order) =>
    (!params.customer || order.customerId === params.customer) &&
    (!params.status || order.status === params.status) &&
    (!params.product || order.lines.some((line) => line.productId === params.product)));
  const summary = summarizeHistory(filtered);
  const dates = [...new Set(filtered.map((order) => order.date))];

  return <div className="space-y-4">
    <PageHeader title="Historial operativo" description="Consulta de pedidos, preparación, entrega y recibos existentes." />
    <form className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-2 xl:grid-cols-6" method="get">
      <label className="text-xs">Desde<input className="mt-1 h-9 w-full rounded-md border px-2" type="date" name="startDate" defaultValue={startDate} /></label>
      <label className="text-xs">Hasta<input className="mt-1 h-9 w-full rounded-md border px-2" type="date" name="endDate" defaultValue={endDate} /></label>
      <label className="text-xs">Cliente<select className="mt-1 h-9 w-full rounded-md border px-2" name="customer" defaultValue={params.customer ?? ""}>
        <option value="">Todos</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs">Producto<select className="mt-1 h-9 w-full rounded-md border px-2" name="product" defaultValue={params.product ?? ""}>
        <option value="">Todos</option>{products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs">Estado<select className="mt-1 h-9 w-full rounded-md border px-2" name="status" defaultValue={params.status ?? ""}>
        <option value="">Todos</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      <button className="self-end rounded-md bg-emerald-900 px-3 py-2 text-sm text-white" type="submit">Ver historial</button>
    </form>
    {data.error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{data.error}</p> : null}
    {data.truncated ? <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">El rango supera el límite de consulta. Acota las fechas para ver todos los pedidos.</p> : null}
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">Pedidos</p><strong className="text-xl">{summary.orderCount}</strong></div>
      <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">Entregas completadas</p><strong className="text-xl">{summary.deliveredOrderCount}</strong></div>
      <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">Cliente con más pedidos</p><strong className="text-sm">{summary.customerRanking[0]?.name ?? "—"}</strong></div>
      <div className="rounded-lg border bg-white p-3"><p className="text-xs text-muted-foreground">Producto más solicitado por líneas</p><strong className="text-sm">{summary.requestedProductRanking[0]?.name ?? "—"}</strong></div>
    </div>
    {dates.map((date) => <section key={date} className="space-y-2">
      <h2 className="border-b pb-1 text-sm font-semibold">{date}</h2>
      <div className="grid gap-2 lg:grid-cols-2">
        {filtered.filter((order) => order.date === date).map((order) => <article key={order.id} className="rounded-lg border bg-white p-3">
          <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{order.customerName}</h3><p className="text-xs text-muted-foreground">{order.reference} · {order.status.replaceAll("_", " ")}</p></div>
            <Link className="text-xs text-emerald-900 underline" href={`/matriz-operativa?date=${date}&mode=resumen&order=${order.id}`}>Ver operación</Link></div>
          <div className="mt-2 space-y-1 text-xs">{order.lines.filter((line) => !params.product || line.productId === params.product).map((line, index) =>
            <p key={line.productId + index} className="flex flex-wrap justify-between gap-x-3 border-t pt-1"><span className="font-medium">{line.productName}</span>
              <span>Solicitado {format(line.requested)} · Preparado {format(line.prepared)} · Entregado {format(line.delivered)} {line.unit}</span></p>)}</div>
          {order.receipts.length ? <p className="mt-2 text-xs">Recibos: {order.receipts.map((receipt) =>
            <Link key={receipt.id} className="mr-2 text-emerald-900 underline" href={`/recibos/${receipt.id}`}>{receipt.number} ({receipt.status})</Link>)}</p> : null}
        </article>)}
      </div>
    </section>)}
    {!filtered.length && !data.error ? <p className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">No hay pedidos para estos filtros.</p> : null}
    {summary.requestedProductRanking.length ? <p className="text-xs text-muted-foreground">Productos más solicitados: {summary.requestedProductRanking.slice(0, 3).map((item) => `${item.name} (${item.lines} líneas)`).join(" · ")}. Productos con más líneas entregadas: {summary.deliveredProductRanking.slice(0, 3).map((item) => `${item.name} (${item.lines})`).join(" · ")}.</p> : null}
  </div>;
}
