import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DeliveredLine = {
  delivery_item_id: string;
  order_id: string;
  public_reference: string;
  operational_date: string;
  operational_status: string;
  customer_name: string | null;
  product_id: string;
  product_name: string;
  delivered_quantity: number | string;
  delivered_base_quantity: number | string;
  unit_symbol: string;
  delivered_at: string | null;
  cost_base_unit: number | string | null;
};

const quantity = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 4 });
const cost = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default async function OperationalReceiptsPage() {
  await requireRoleAccess("/recibos/operativo");
  const supabase = await createSupabaseServerClient();
  const result = supabase
    ? await supabase.from("qb_operational_delivered_lines")
        .select("delivery_item_id,order_id,public_reference,operational_date,operational_status,customer_name,product_id,product_name,delivered_quantity,delivered_base_quantity,unit_symbol,delivered_at,cost_base_unit")
        .order("delivered_at", { ascending: false }).limit(500)
    : { data: null, error: new Error("Supabase no está disponible.") };
  const rows = (result.data ?? []) as DeliveredLine[];

  return <main className="space-y-5">
    <PageHeader eyebrow="Vista operativa" title="Entregas para Recibos" description="Productos y cantidades efectivamente entregados. El costo base aparece solo cuando fue registrado." />
    {result.error ? <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">No se pudo cargar el detalle operativo.</p> : null}
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-slate-100 text-left"><tr>
          <th className="p-3">Fecha</th><th className="p-3">Pedido</th><th className="p-3">Cliente</th><th className="p-3">Producto</th><th className="p-3 text-right">Entregado</th><th className="p-3">Estado operativo</th><th className="p-3 text-right">Costo base / unidad</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.delivery_item_id} className="border-t">
          <td className="whitespace-nowrap p-3">{row.delivered_at ? new Date(row.delivered_at).toLocaleDateString("es-BO") : row.operational_date}</td>
          <td className="p-3">{row.public_reference}</td><td className="p-3">{row.customer_name || "Cliente"}</td><td className="p-3">{row.product_name}</td>
          <td className="whitespace-nowrap p-3 text-right">{quantity.format(Number(row.delivered_base_quantity))} {row.unit_symbol}</td>
          <td className="p-3">{row.operational_status}</td>
          <td className="whitespace-nowrap p-3 text-right">{row.cost_base_unit == null ? "Sin costo base registrado" : `Bs ${cost.format(Number(row.cost_base_unit))}`}</td>
        </tr>)}
          {!rows.length && !result.error ? <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Todavía no hay productos entregados.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </main>;
}
