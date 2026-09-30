import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { PrintReceiptButton } from "@/components/qb-receipts/print-receipt-button";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import { buildMarketSheetModel } from "@/lib/market-sheet/model";
import { getOperationalMatrixData } from "@/lib/operational-matrix/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function todayInBolivia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
  }).format(new Date());
}

async function resolveDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: value, usedLatestDate: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = supabase
    ? await supabase
        .from("qb_operational_day_orders")
        .select("operational_date")
        .order("operational_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return {
    date: data?.operational_date ? String(data.operational_date) : todayInBolivia(),
    usedLatestDate: Boolean(data?.operational_date),
  };
}

function quantity(value: number) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 3 }).format(
    value,
  );
}

export default async function MarketPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador") redirect("/matriz-operativa");
  const { date: rawDate } = await searchParams;
  const { date, usedLatestDate } = await resolveDate(rawDate);

  const data = await getOperationalMatrixData(date, auth.user.role);
  const model = buildMarketSheetModel(data);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">Hoja de provisiones</h1>
        <Button asChild variant="outline">
          <Link href={`/matriz-operativa?date=${encodeURIComponent(date)}`}>
            <ArrowLeft className="size-4" />
            Preparación y entregas
          </Link>
        </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><a href={`/api/matriz-operativa/mercado.xlsx?date=${encodeURIComponent(date)}`}>Descargar Excel</a></Button>
          <PrintReceiptButton />
        </div>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-sm">Fecha de provisiones
          <input type="date" name="date" defaultValue={date} className="mt-1 block rounded-md border p-2" />
        </label>
        <Button type="submit">Ver fecha</Button>
        <p className="text-sm text-muted-foreground">Se genera directamente desde los pedidos. No registra compras ni cambia precios.</p>
      </form>
      {usedLatestDate ? (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 print:hidden">
          Mostramos automáticamente la fecha más reciente con pedidos: {date}.
          Puedes elegir otra fecha arriba.
        </p>
      ) : null}

      <section className="bg-white p-3 text-slate-950 print:p-0">
        <div className="border-b-2 border-emerald-900 pb-2 text-center">
          <h2 className="text-lg font-bold">QB INSUMOS · HOJA DE COMPRAS DE MERCADO</h2>
          <p className="mt-1 text-sm">Fecha operativa: {model.operationalDate}</p>
          <p className="text-xs text-slate-600">
            Cantidades solicitadas por los clientes antes de preparación
          </p>
        </div>

        {!model.rows.length ? (
          <p className="p-8 text-center text-sm text-slate-500">
            No hay pedidos solicitados para esta fecha.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-max border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-200">
                  <th className="border border-slate-500 px-2 py-2">N°</th>
                  <th className="min-w-52 border border-slate-500 px-2 py-2 text-left">DESCRIPCIÓN</th>
                  <th className="border border-slate-500 px-2 py-2">UD</th>
                  {model.customers.map((customer) => (
                    <th key={customer.key} className="max-w-28 border border-slate-500 px-2 py-2">
                      {customer.name}
                    </th>
                  ))}
                  <th className="border border-slate-500 bg-emerald-100 px-2 py-2">TOTAL</th>
                  <th className="border border-slate-500 bg-sky-100 px-2 py-2">STOCK FÍSICO</th>
                  <th className="border border-slate-500 bg-amber-100 px-2 py-2">RESERVADO</th>
                  <th className="border border-slate-500 bg-emerald-100 px-2 py-2">DISPONIBLE</th>
                  <th className="border border-slate-500 bg-rose-100 px-2 py-2">FALTANTE / COMPRAR</th>
                  <th className="min-w-28 border border-slate-500 px-2 py-2">PRECIO COMPRA (Bs/UD)</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row, index) => (
                  <tr key={row.key} style={{ backgroundColor: row.productColor ?? "#FFFFFF" }}>
                    <td className="border-b border-r border-slate-300 px-2 py-1 text-center">{index + 1}</td>
                    <td className="border-b border-r border-slate-300 px-2 py-1 font-medium">{row.productName}</td>
                    <td className="border-b border-r border-slate-300 px-2 py-1 text-center">{row.unit}</td>
                    {row.quantities.map((value, customerIndex) => (
                      <td key={model.customers[customerIndex]?.key} className="border-b border-r border-slate-300 px-2 py-1 text-center">
                        {value > 0 ? quantity(value) : ""}
                      </td>
                    ))}
                    <td className="border-b border-r border-slate-400 bg-emerald-50 px-2 py-1 text-center font-bold">{quantity(row.total)}</td>
                    <td className="border-b border-r border-slate-300 bg-sky-50 px-2 py-1 text-center">{quantity(row.stockCurrent)}</td>
                    <td className="border-b border-r border-slate-300 bg-amber-50 px-2 py-1 text-center">{quantity(row.reserved)}</td>
                    <td className={`border-b border-r border-slate-300 px-2 py-1 text-center font-semibold ${row.stockCurrent - row.reserved <= 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{quantity(Math.max(row.stockCurrent - row.reserved, 0))}</td>
                    <td className={`border-b border-r border-slate-300 px-2 py-1 text-center font-semibold ${row.total > row.stockCurrent ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{quantity(Math.max(row.total - row.stockCurrent, 0))}</td>
                    <td className="border border-slate-300 bg-white px-2 py-1" aria-label={`Precio de compra de ${row.productName} por ${row.unit}`} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-100 font-bold">
                  <th colSpan={3} className="border-y-2 border-emerald-800 px-2 py-2 text-left">LÍNEAS PEDIDAS</th>
                  {model.customers.map((customer, customerIndex) => (
                    <th key={customer.key} className="border-y-2 border-emerald-800 px-2 py-2">
                      {model.customerLineCounts[customerIndex]}
                    </th>
                  ))}
                  <th className="border-y-2 border-emerald-800 px-2 py-2">
                    {model.totalLineCount}
                  </th>
                  <th className="border-y-2 border-emerald-800" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
