import Decimal from "decimal.js";
import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { todayInBolivia } from "@/lib/date-time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SiteSalesRow = {
  location_id: string | null;
  site: string;
  receipt_count: number;
  sales: number | string;
};

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const currency = new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" });

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRoleAccess("/reportes");
  const filters = await searchParams;
  const today = todayInBolivia();
  const start = typeof filters.desde === "string" ? filters.desde : today.slice(0, 8) + "01";
  const end = typeof filters.hasta === "string" ? filters.hasta : today;
  const site = typeof filters.sede === "string" ? filters.sede : "";
  const validPeriod = validDate(start) && validDate(end) &&
    end >= start && Date.parse(end) - Date.parse(start) <= 365 * 86_400_000;
  const supabase = validPeriod ? await createSupabaseServerClient() : null;
  const result = supabase ? await supabase.rpc("get_qb_site_sales_report", {
    p_start: start, p_end: end,
  }) : null;
  const rows = ((result?.data ?? []) as SiteSalesRow[])
    .sort((a, b) => a.site.localeCompare(b.site, "es"));
  const key = (row: SiteSalesRow) => row.location_id ?? "sin-atribucion";
  const visible = site ? rows.filter((row) => key(row) === site) : rows;
  const total = visible.reduce((sum, row) => sum.plus(row.sales), new Decimal(0));
  const error = !validPeriod ? "Elige un periodo válido de hasta 366 días."
    : !result || result.error ? "No se pudo consultar el reporte."
    : site && !visible.length ? "La sede seleccionada no está disponible." : null;

  return (
    <section className="space-y-5">
      <PageHeader title="Reportes por sede" description="Ventas de recibos emitidos, por fecha de emisión en Bolivia." />
      <form className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">Desde
          <input className="rounded border bg-background p-2" type="date" name="desde" defaultValue={start} required />
        </label>
        <label className="grid gap-1 text-sm">Hasta
          <input className="rounded border bg-background p-2" type="date" name="hasta" defaultValue={end} required />
        </label>
        <label className="grid gap-1 text-sm">Sede
          <select className="rounded border bg-background p-2" name="sede" defaultValue={site}>
            <option value="">Todas las sedes disponibles</option>
            {rows.map((row) => <option key={key(row)} value={key(row)}>{row.site}</option>)}
          </select>
        </label>
        <button className="rounded bg-primary px-4 py-2 text-primary-foreground" type="submit">Filtrar</button>
      </form>
      {error ? <p role="alert">{error}</p> : visible.length ? (
        <div className="overflow-x-auto rounded border bg-background">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th scope="col" className="p-3">Sede</th>
              <th scope="col" className="p-3 text-right">Recibos en la sede</th>
              <th scope="col" className="p-3 text-right">Venta atribuida</th>
            </tr></thead>
            <tbody>{visible.map((row) => <tr key={key(row)} className="border-b">
              <th scope="row" className="p-3 text-left font-medium">{row.site}</th>
              <td className="p-3 text-right">{row.receipt_count}</td>
              <td className="p-3 text-right">{currency.format(Number(row.sales))}</td>
            </tr>)}</tbody>
            <tfoot><tr className="font-semibold">
              <th scope="row" className="p-3 text-left" colSpan={2}>Total</th>
              <td className="p-3 text-right">{currency.format(total.toNumber())}</td>
            </tr></tfoot>
          </table>
        </div>
      ) : <p>No hay sedes disponibles para esta cuenta.</p>}
    </section>
  );
}
