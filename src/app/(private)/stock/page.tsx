import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StockWorkspace } from "@/components/stock/stock-workspace";
import { requireRoleAccess } from "@/lib/auth/session";
import { getInventoryKardexPage, getStockProducts } from "@/lib/inventory/kardex-data";
import { todayInBolivia } from "@/lib/date-time";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] ?? "" : current ?? "";
}

function validDate(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const date = new Date(`${input}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input;
}

function monthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const auth = await requireRoleAccess("/stock");
  const params = await searchParams;
  const today = todayInBolivia();
  const selectedMonth = monthRange(value(params, "month"));
  const currentMonth = today.slice(0, 7);
  const dateFromCandidate = value(params, "from");
  const dateToCandidate = value(params, "to");
  const dateFrom = selectedMonth?.from ?? (validDate(dateFromCandidate) ? dateFromCandidate : `${currentMonth}-01`);
  const dateTo = selectedMonth?.to ?? (validDate(dateToCandidate) ? dateToCandidate : today);
  const view = value(params, "view") === "movimientos" ? "movimientos" : "existencias";
  const typeValue = value(params, "type");
  const movementType = ["entrada", "salida", "merma", "ajuste"].includes(typeValue)
    ? typeValue as "entrada" | "salida" | "merma" | "ajuste"
    : "all";
  const pageValue = Number(value(params, "page"));
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100000) : 1;
  const productId = value(params, "product");
  const search = value(params, "q").trim().slice(0, 120);
  const order = value(params, "order") === "asc" ? "asc" : "desc";
  const [{ products, error: productsError }, { data: kardex, error: kardexError }] = await Promise.all([
    getStockProducts(),
    getInventoryKardexPage({ dateFrom, dateTo: dateFrom <= dateTo ? dateTo : dateFrom, productId: productId || null, movementType, search: search || null, order, page, pageSize: 50 }),
  ]);
  const categories = [...new Map(products.filter((product) => product.isActive && product.categoryId).map((product) => [product.categoryId!, { id: product.categoryId!, name: product.categoryName }])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const canManage = auth.user.role === "administrador" || auth.user.role === "inventario";

  return <div className="space-y-4">
    <PageHeader eyebrow="Operación" title="Stock" description="Consulta saldos vigentes y movimientos reales de almacén por producto." />
    <div className="flex flex-wrap gap-2 print:hidden">
      {canManage ? <Link href="/ingresos/compras-almacen" className="inline-flex rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">Hoja diaria de Compras</Link> : null}
      {canManage ? <Link href="/ingresos" className="inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Recepción de ingresos</Link> : null}
    </div>
    <StockWorkspace
      view={view}
      products={products}
      categories={categories}
      kardex={kardex}
      error={productsError ?? kardexError}
      dateFrom={dateFrom}
      dateTo={dateTo}
      productId={productId}
      movementType={movementType}
      search={search}
      order={order}
      page={page}
      pageSize={50}
      canManage={canManage}
    />
  </div>;
}
