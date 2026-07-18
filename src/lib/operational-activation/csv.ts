import type { OperationalImportType } from "@/types/operational-activation";

export const MAX_OPERATIONAL_CSV_BYTES = 1_000_000;
export const MAX_OPERATIONAL_CSV_ROWS = 500;

export const OPERATIONAL_HEADERS: Record<OperationalImportType, string[]> = {
  prices: ["product_id", "product_name", "category", "pricing_unit", "current_base_price", "new_base_price", "amount_bs_catalog_backed", "qb17_status", "notes"],
  conversions: ["product_id", "product_name", "category", "receiving_unit", "presentation", "base_unit", "current_factor", "new_factor", "status", "notes"],
  initial_stock: ["product_id", "product_name", "base_unit", "current_stock", "initial_quantity", "cutoff_date", "notes"],
};

export function parseCsv(text: string) {
  if (text.includes("\0")) throw new Error("El archivo contiene caracteres no permitidos.");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim()));
}

export function rowsToObjects(rows: string[][], type: OperationalImportType) {
  if (!rows.length) throw new Error("El archivo está vacío.");
  const headers = rows[0]?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  const expected = OPERATIONAL_HEADERS[type];
  if (headers.length !== expected.length || expected.some((header, index) => headers[index] !== header)) {
    throw new Error(`Los encabezados no corresponden a la plantilla de ${type}.`);
  }
  if (rows.length - 1 > MAX_OPERATIONAL_CSV_ROWS) throw new Error("El archivo supera 500 filas.");
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

export function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]) {
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}\r\n`;
}
