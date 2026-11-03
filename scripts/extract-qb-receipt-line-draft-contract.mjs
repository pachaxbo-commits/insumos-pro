import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = resolve(
  root,
  "supabase/migrations/20260929010000_qb_line_receipts_from_delivered_snapshots.sql",
);
const outputPath = process.argv[2];

if (!outputPath) throw new Error("Pass a temporary output SQL path.");

const source = readFileSync(sourcePath, "utf8");
const definition = source.match(
  /create or replace function public\.create_qb_receipt_line_draft\([\s\S]*?\n\$\$;/i,
)?.[0];

if (!definition) throw new Error("Could not extract the canonical receipt-line RPC.");

for (const contract of [
  "No tienes permisos para crear recibos QB.",
  "Solo puedes incluir pedidos entregados pendientes de recibo del mismo cliente.",
  "Uno o mas pedidos ya estan incluidos en un recibo activo.",
  "Todos los pedidos deben tener entrega QB-6 confirmada.",
  "No hay lineas entregadas cobrables para el recibo QB.",
  "insert into public.qb_receipt_lines",
  "perform public.recalculate_qb_receipt_totals(v_receipt_id)",
]) {
  if (!definition.includes(contract)) {
    throw new Error(`Canonical RPC is missing required validation: ${contract}`);
  }
}

writeFileSync(resolve(outputPath), `${definition}\n`, { encoding: "utf8", flag: "w" });
