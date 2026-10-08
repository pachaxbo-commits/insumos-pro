import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";

import { requireRoleAccess } from "@/lib/auth/session";
import { todayInBolivia } from "@/lib/date-time";
import { getWarehousePurchases } from "@/lib/warehouse-purchases/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  await requireRoleAccess("/ingresos/compras-almacen");
  const supplied = request.nextUrl.searchParams.get("date");
  const date = supplied && /^\d{4}-\d{2}-\d{2}$/.test(supplied) ? supplied : todayInBolivia();
  const { catalog, rows, error } = await getWarehousePurchases(date);
  if (error) return new Response("No se pudo cargar la hoja de compras.", { status: 503 });

  const units = new Map(catalog.qbUnits.map((unit) => [unit.id, unit.name]));
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Compras almacén");
  sheet.addRow(["QB INSUMOS · HOJA DE COMPRAS PARA ALMACÉN"]);
  sheet.addRow(["Fecha", date]);
  sheet.addRow([]);
  sheet.columns = [
    { key: "number", width: 7 }, { key: "description", width: 35 },
    { key: "unit", width: 21 }, { key: "quantity", width: 12 },
    { key: "purchaseUnitPrice", width: 16 }, { key: "total", width: 16 },
    { key: "referenceUnit", width: 21 }, { key: "referencePrice", width: 20 },
    { key: "notes", width: 45 }, { key: "status", width: 15 },
  ];
  sheet.addRow(["N°", "Descripción", "Ud compra", "Cant.", "PU compra", "Total Bs", "Unidad referencia", "Precio referencial", "Observaciones", "Estado"]);
  rows.forEach((row, index) => sheet.addRow([
    index + 1, row.productName, row.unitLabel, row.quantity, row.unitPrice,
    row.total, row.referenceUnitId ? units.get(row.referenceUnitId) ?? "" : "", row.referencePrice,
    row.notes, row.status,
  ]));
  sheet.addRow(["", "TOTAL", "", "", "", rows.reduce((sum, row) => sum + row.total, 0)]);
  sheet.getColumn(4).numFmt = "#,##0.######";
  for (const index of [5, 6, 8]) sheet.getColumn(index).numFmt = '"Bs "#,##0.00';
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, rows.length + 4), column: 10 } };
  sheet.getRow(4).font = { bold: true };
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.getColumn(9).alignment = { wrapText: true, vertical: "top" };
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  const buffer = await book.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="qb-compras-almacen-${date}.xlsx"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
