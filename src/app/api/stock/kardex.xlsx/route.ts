import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireRoleAccess } from "@/lib/auth/session";
import { getInventoryKardexPage, type InventoryKardexFilters, type InventoryKardexRow } from "@/lib/inventory/kardex-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export async function GET(request: NextRequest) {
  await requireRoleAccess("/stock");
  const params = request.nextUrl.searchParams;
  const rawType = params.get("type") ?? "all";
  const movementType = ["entrada", "salida", "merma", "ajuste"].includes(rawType)
    ? rawType as InventoryKardexFilters["movementType"]
    : "all";
  const filters: InventoryKardexFilters = {
    dateFrom: dateParam(params.get("from")),
    dateTo: dateParam(params.get("to")),
    productId: params.get("product") || null,
    movementType,
    search: params.get("q")?.slice(0, 120) || null,
    order: params.get("order") === "asc" ? "asc" : "desc",
    page: 1,
    pageSize: 1000,
  };
  const rawProductId = params.get("product");
  if (rawProductId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawProductId)) {
    return new Response("El producto seleccionado no es válido.", { status: 400 });
  }
  if ((params.has("from") && !filters.dateFrom) || (params.has("to") && !filters.dateTo)) {
    return new Response("La fecha seleccionada no es válida.", { status: 400 });
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    return new Response("El rango de fechas no es válido.", { status: 400 });
  }

  const firstPage = await getInventoryKardexPage(filters);
  if (firstPage.error) return new Response(firstPage.error, { status: 503 });
  const rows: InventoryKardexRow[] = [...firstPage.data.rows];
  for (let page = 2; page <= Math.ceil(firstPage.data.total / filters.pageSize); page += 1) {
    const next = await getInventoryKardexPage({ ...filters, page });
    if (next.error) return new Response("No se pudo completar la exportación de movimientos.", { status: 503 });
    rows.push(...next.data.rows);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QB Insumos";
  const sheet = workbook.addWorksheet("Kardex");
  sheet.columns = [
    { key: "date", width: 23 }, { key: "product", width: 34 }, { key: "type", width: 35 },
    { key: "in", width: 15 }, { key: "out", width: 22 }, { key: "unit", width: 14 },
    { key: "before", width: 16 }, { key: "after", width: 16 }, { key: "responsible", width: 26 },
    { key: "customer", width: 30 }, { key: "delivery", width: 23 },
    { key: "reason", width: 38 }, { key: "reference", width: 38 }, { key: "fifo", width: 55 },
  ];
  sheet.addRow(["QB INSUMOS · KARDEX DE ALMACÉN"]);
  sheet.addRow(["Periodo", filters.dateFrom ?? "Sin límite inicial", "a", filters.dateTo ?? "Sin límite final"]);
  sheet.addRow([]);
  sheet.addRow(["Fecha y hora", "Producto", "Tipo", "Entrada", "Salida / ajuste", "Unidad", "Stock anterior", "Stock posterior", "Responsable", "Cliente / pedido", "Fecha de entrega", "Motivo", "Origen / referencia", "Detalle FIFO"]);
  for (const row of rows) {
    const delta = row.stock_before === null || row.stock_after === null ? null : row.stock_after - row.stock_before;
    const fifo = row.fifo_lots.map((lot) => lot.historical_unknown
      ? `Stock histórico sin lote: ${lot.quantity} ${row.unit_symbol}`
      : `Lote ${lot.lot_id ?? "s/i"} (${lot.received_at ?? "sin fecha"}): ${lot.quantity} ${row.unit_symbol}`).join("; ");
    sheet.addRow({
      date: new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(row.created_at)),
      product: row.product_name,
      type: row.movement_type === "merma" && !row.affects_stock ? "Merma recepción · sin cambio de stock" : row.movement_type === "salida_conciliada" ? "Salida conciliada del mismo día" : row.movement_type,
      in: row.movement_type === "entrada" ? row.quantity : null,
      out: row.movement_type === "salida" || row.movement_type === "salida_conciliada" || row.movement_type === "merma" ? row.quantity : row.movement_type === "ajuste" ? delta : null,
      unit: row.unit_symbol,
      before: row.stock_before,
      after: row.stock_after,
      responsible: row.responsible ?? "No disponible",
      customer: row.customer_name ? `${row.customer_name}${row.order_reference ? ` · ${row.order_reference}` : ""}` : "—",
      delivery: row.delivery_at ? new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: "America/La_Paz" }).format(new Date(row.delivery_at)) : "—",
      reason: row.reason ?? "Sin motivo",
      reference: row.reference,
      fifo,
    });
  }
  sheet.getRow(4).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, rows.length + 4), column: 14 } };
  for (const column of [4,5,7,8]) sheet.getColumn(column).numFmt = "#,##0.###;[Red]-#,##0.###";
  sheet.getColumn(14).alignment = { wrapText: true, vertical: "top" };

  const summary = workbook.addWorksheet("Resumen por producto");
  summary.columns = [
    { key: "product", width: 35 }, { key: "unit", width: 14 }, { key: "inbound", width: 16 },
    { key: "outbound", width: 16 }, { key: "waste", width: 16 }, { key: "adjustment", width: 16 },
    { key: "operations", width: 14 }, { key: "stock", width: 18 },
  ];
  summary.addRow(["Producto", "Unidad", "Ingresos", "Salidas", "Mermas", "Ajuste neto", "Operaciones", "Stock actual"]);
  firstPage.data.summary.products.forEach((row) => summary.addRow({
    product: row.product_name, unit: row.unit_symbol, inbound: row.inbound, outbound: row.outbound,
    waste: row.waste, adjustment: row.adjustment, operations: row.operations, stock: row.stock_current,
  }));
  summary.getRow(1).font = { bold: true };
  summary.views = [{ state: "frozen", ySplit: 1 }];
  for (const column of [3,4,5,6,8]) summary.getColumn(column).numFmt = "#,##0.###;[Red]-#,##0.###";

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `qb-kardex-${filters.dateFrom ?? "inicio"}-${filters.dateTo ?? "hoy"}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
