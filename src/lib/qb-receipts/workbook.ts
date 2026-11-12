import ExcelJS from "exceljs";
import type { QbReceipt } from "@/types/qb-receipts";

export async function buildReceiptWorkbook(receipt: QbReceipt, internal: boolean) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(internal ? "Recibo interno" : "Recibo");
  sheet.addRow(["Recibo", receipt.number, "Estado", receipt.status]);
  sheet.addRow(["Cliente", receipt.customerName, "Periodo", receipt.periodStart, receipt.periodEnd]);
  sheet.addRow([]);
  const headers = [
    "Producto", "Cantidad comercial", "Unidad comercial", "Entregado", "Unidad base",
    "Peso real", "Unidad de peso", "Peso normalizado (KG)", "Venta por unidad (Bs)", "Venta total (Bs)",
  ];
  if (internal) headers.push("Costo total (Bs)", "Margen total (Bs)");
  sheet.addRow(headers).font = { bold: true };

  for (const line of receipt.lines) {
    const values = [
      line.productName, line.commercialQuantitySnapshot, line.commercialUnitLabelSnapshot,
      line.deliveredBaseQuantity, line.baseUnitSymbol, line.actualWeightValue,
      line.actualWeightUnitSymbol, line.actualWeightKilograms,
      line.inputMode === "amount_bs" ? null : line.finalUnitPrice, line.lineTotal,
    ];
    if (internal) {
      values.push(
        line.costTotalPrecise === null ? null : Number(line.costTotalPrecise),
        line.profitTotalPrecise === null ? null : Number(line.profitTotalPrecise),
      );
    }
    sheet.addRow(values);
  }
  sheet.addRow(["Total del recibo", ...Array<null>(8).fill(null), receipt.hasPendingPrices ? null : receipt.totalAmount]);
  sheet.getColumn(1).width = 36;
  for (let column = 2; column <= headers.length; column++) {
    sheet.getColumn(column).width = headers[column - 1].length + 3;
    if (column >= 9) sheet.getColumn(column).numFmt = "#,##0.00######";
  }
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return workbook.xlsx.writeBuffer();
}
