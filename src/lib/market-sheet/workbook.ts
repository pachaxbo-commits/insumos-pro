import "server-only";

import ExcelJS from "exceljs";

import type { MarketSheetModel } from "@/lib/market-sheet/model";

function safeArgb(color: string | null) {
  const value = color?.trim().replace(/^#/, "").toUpperCase();
  return value && /^[0-9A-F]{6}$/.test(value) ? `FF${value}` : "FFFFFFFF";
}

function columnLetter(column: number) {
  let value = column;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export async function buildMarketWorkbook(model: MarketSheetModel) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QB Insumos";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Provisiones", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 5 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.45,
        bottom: 0.45,
        header: 0.15,
        footer: 0.15,
      },
      printTitlesRow: "1:5",
    },
    properties: { defaultRowHeight: 18 },
  });
  sheet.properties.showGridLines = false;

  const lastColumn = 9 + model.customers.length * 2;
  const lastColumnLetter = columnLetter(lastColumn);
  sheet.mergeCells(`A1:${lastColumnLetter}1`);
  sheet.getCell("A1").value = "QB INSUMOS · HOJA DE PROVISIÓN";
  sheet.getCell("A1").font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 16,
  };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF123B35" },
  };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(`A2:${lastColumnLetter}2`);
  sheet.getCell("A2").value = `Fecha operativa: ${model.operationalDate} · Pendiente por producto en unidad base`;
  sheet.getCell("A2").font = { italic: true, color: { argb: "FF475569" } };
  sheet.getCell("A2").alignment = { horizontal: "center" };

  sheet.mergeCells(`A3:${lastColumnLetter}3`);
  sheet.getCell("A3").value =
    "Las presentaciones se convierten a la unidad base y se consolidan por producto.";
  sheet.getCell("A3").font = { size: 9, color: { argb: "FF64748B" } };
  sheet.getCell("A3").alignment = { horizontal: "center" };

  const headers = [
    "CÓDIGO",
    "DESCRIPCIÓN",
    "UD",
    ...model.customers.flatMap(() => ["", ""]),
    "TOTAL",
    "STOCK FÍSICO",
    "RESERVADO",
    "DISPONIBLE",
    "FALTANTE / COMPRAR",
    "COSTO DE PROVISIÓN (Bs/UD)",
  ];
  const customerFirstColumns = model.customers.map((customer, index) => {
    const firstColumn = 4 + index * 2;
    return { customer, firstColumn };
  });
  const headerRow = sheet.getRow(5);
  headerRow.values = headers;
  customerFirstColumns.forEach(({ customer, firstColumn }) => {
    sheet.mergeCells(5, firstColumn, 5, firstColumn + 1);
    sheet.getCell(5, firstColumn).value = customer.name.toUpperCase();
  });
  headerRow.height = 34;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF0F172A" }, size: 9 };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    cell.border = {
      top: { style: "medium", color: { argb: "FF334155" } },
      bottom: { style: "medium", color: { argb: "FF334155" } },
      left: { style: "thin", color: { argb: "FF94A3B8" } },
      right: { style: "thin", color: { argb: "FF94A3B8" } },
    };
  });

  model.rows.forEach((item, index) => {
    const rowNumber = index + 6;
    const row = sheet.getRow(rowNumber);
    row.values = [
      index + 1,
      item.productName,
      item.unit,
      ...item.quantities.flatMap((quantity) => [quantity > 0 ? quantity : null, null]),
      item.total,
      item.stockAvailable,
      item.reserved,
      Math.max(item.stockAvailable - item.reserved, 0),
      item.toProvision,
      item.provisionCostUnit ?? null,
    ];
    row.height = 21;
    row.getCell(lastColumn).value = item.provisionCostUnit ?? null;
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: safeArgb(item.productColor) },
      };
      cell.font = { size: 9, bold: column === 2 };
      cell.alignment = {
        horizontal: column === 2 ? "left" : "center",
        vertical: "middle",
        wrapText: column === 2,
      };
      if (column >= 4) cell.numFmt = "0.###";
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
    for (let customerIndex = 0; customerIndex < model.customers.length; customerIndex += 1) {
      const left = row.getCell(4 + customerIndex * 2);
      left.border = { ...left.border, right: { style: "medium", color: { argb: "FF64748B" } } };
      const writing = row.getCell(5 + customerIndex * 2);
      writing.border = { ...writing.border, left: { style: "medium", color: { argb: "FF64748B" } } };
    }
  });

  const totalRowNumber = model.rows.length + 6;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.getCell(1).value = "";
  totalRow.getCell(2).value = "LÍNEAS PEDIDAS";
  totalRow.getCell(3).value = "";
  model.customerLineCounts.forEach((count, index) => {
    totalRow.getCell(4 + index * 2).value = count;
  });
  totalRow.getCell(lastColumn - 5).value = model.totalLineCount;
  totalRow.getCell(lastColumn).value = null;
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, color: { argb: "FF064E3B" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD1FAE5" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF047857" } },
      bottom: { style: "medium", color: { argb: "FF047857" } },
    };
  });
  for (let customerIndex = 0; customerIndex < model.customers.length; customerIndex += 1) {
    const left = totalRow.getCell(4 + customerIndex * 2);
    left.border = { ...left.border, right: { style: "medium", color: { argb: "FF047857" } } };
    const writing = totalRow.getCell(5 + customerIndex * 2);
    writing.border = { ...writing.border, left: { style: "medium", color: { argb: "FF047857" } } };
  }
  totalRow.height = 24;

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 32;
  sheet.getColumn(3).width = 12;
  for (let index = 0; index < model.customers.length; index += 1) {
    sheet.getColumn(4 + index * 2).width = 8;
    sheet.getColumn(5 + index * 2).width = 12;
  }
  const summaryStartColumn = 4 + model.customers.length * 2;
  for (let column = summaryStartColumn; column <= lastColumn; column += 1) {
    sheet.getColumn(column).width = column === lastColumn ? 20 : 13;
  }
  sheet.getColumn(lastColumn).width = 20;
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: totalRowNumber - 1, column: lastColumn },
  };
  sheet.pageSetup.printArea = `A1:${lastColumnLetter}${totalRowNumber}`;
  sheet.headerFooter.oddFooter =
    "&LQB Insumos&CHoja de Provisión&R Página &P de &N";

  return workbook.xlsx.writeBuffer();
}
