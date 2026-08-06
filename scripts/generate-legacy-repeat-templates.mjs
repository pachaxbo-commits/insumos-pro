import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , dumpArgument, outputArgument] = process.argv;

if (!dumpArgument) {
  throw new Error(
    "Uso: node scripts/generate-legacy-repeat-templates.mjs <dump.sql> [migracion.sql]",
  );
}

const dumpPath = resolve(dumpArgument);
const outputPath = outputArgument ? resolve(outputArgument) : null;
const dump = readFileSync(dumpPath, "utf8");

function decodeCopyValue(value) {
  if (value === "\\N") return null;
  return value
    .replaceAll("\\t", "\t")
    .replaceAll("\\n", "\n")
    .replaceAll("\\r", "\r")
    .replaceAll("\\\\", "\\");
}

function copyRows(table) {
  const match = dump.match(
    new RegExp(
      `COPY public\\.${table} \\(([^)]*)\\) FROM stdin;\\r?\\n([\\s\\S]*?)\\r?\\n\\\\\\.`,
      "m",
    ),
  );
  if (!match) throw new Error(`No se encontró COPY public.${table}.`);

  const columns = match[1].split(", ");
  return match[2].split(/\r?\n/).map((line) => {
    const values = line.split("\t").map(decodeCopyValue);
    return Object.fromEntries(
      columns.map((column, index) => [column, values[index]]),
    );
  });
}

function stableUuid(kind, legacyId) {
  const bytes = createHash("sha256")
    .update(`qb-insumos:${kind}:${legacyId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function values(rows) {
  return rows.map((row) => `  (${row.join(", ")})`).join(",\n");
}

function normalizeQuantity(quantity) {
  return Math.max(0.5, Math.round(quantity * 2) / 2);
}

const users = copyRows("users");
const orders = copyRows("orders");
const orderItems = copyRows("order_items");
const products = copyRows("products");
const units = copyRows("units_of_measure");
const productUnits = copyRows("product_units");

const activeCustomers = users.filter(
  (user) => user.role === "client" && user.active === "t",
);
const activeProductIds = new Set(
  products
    .filter((product) => product.active === "t")
    .map((product) => product.id),
);
const activeUnitIds = new Set(
  units.filter((unit) => unit.active === "t").map((unit) => unit.id),
);
const validProductUnits = new Set(
  productUnits
    .filter(
      (row) =>
        activeProductIds.has(row.product_id) &&
        activeUnitIds.has(row.unit_of_measure_id),
    )
    .map((row) => `${row.product_id}:${row.unit_of_measure_id}`),
);
const unitById = new Map(units.map((unit) => [unit.id, unit]));
const itemsByOrder = new Map();
const historySize = 8;

for (const item of orderItems) {
  const current = itemsByOrder.get(item.order_id) ?? [];
  current.push(item);
  itemsByOrder.set(item.order_id, current);
}

const recentOrdersByCustomer = new Map();
for (const order of orders) {
  if (order.confirmed !== "t") continue;
  const current = recentOrdersByCustomer.get(order.user_id) ?? [];
  current.push(order);
  recentOrdersByCustomer.set(order.user_id, current);
}
for (const [customerId, customerOrders] of recentOrdersByCustomer) {
  recentOrdersByCustomer.set(
    customerId,
    customerOrders
      .sort(
        (left, right) =>
          String(right.order_date).localeCompare(String(left.order_date)) ||
          Number(right.id) - Number(left.id),
      )
      .slice(0, historySize),
  );
}

const audit = {
  activeCustomers: activeCustomers.length,
  customersWithConfirmedOrder: 0,
  usableTemplates: 0,
  positiveSourceLines: 0,
  zeroQuantityLinesOmitted: 0,
  inactiveOrInvalidLinesOmitted: 0,
  normalizedQuantities: 0,
  positiveBsLines: 0,
  consolidatedLines: 0,
  templatesOver30Lines: 0,
  largestTemplate: 0,
};
const templates = [];

for (const customer of activeCustomers) {
  const customerOrders = recentOrdersByCustomer.get(customer.id) ?? [];
  if (!customerOrders.length) continue;
  audit.customersWithConfirmedOrder += 1;

  for (const order of customerOrders) {
    const consolidated = new Map();
    for (const item of (itemsByOrder.get(order.id) ?? []).sort(
      (left, right) => Number(left.id) - Number(right.id),
    )) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        audit.zeroQuantityLinesOmitted += 1;
        continue;
      }
      audit.positiveSourceLines += 1;

      if (
        !activeProductIds.has(item.product_id) ||
        !activeUnitIds.has(item.unit_of_measure_id) ||
        !validProductUnits.has(`${item.product_id}:${item.unit_of_measure_id}`)
      ) {
        audit.inactiveOrInvalidLinesOmitted += 1;
        continue;
      }

      if (
        ["BS", "BS."].includes(
          String(unitById.get(item.unit_of_measure_id)?.abbreviation ?? "")
            .trim()
            .toUpperCase(),
        )
      ) {
        audit.positiveBsLines += 1;
      }

      const current = consolidated.get(item.product_id);
      if (current) {
        current.quantity += quantity;
        if (item.notes?.trim() && !current.notes.includes(item.notes.trim())) {
          current.notes.push(item.notes.trim());
        }
        continue;
      }

      consolidated.set(item.product_id, {
        productId: item.product_id,
        unitId: item.unit_of_measure_id,
        quantity,
        notes: item.notes?.trim() ? [item.notes.trim()] : [],
        sortOrder: consolidated.size + 1,
      });
    }

    const lines = [...consolidated.values()].map((line) => {
      const normalized = normalizeQuantity(line.quantity);
      if (Math.abs(normalized - line.quantity) > 0.000001) {
        audit.normalizedQuantities += 1;
      }
      return {
        ...line,
        quantity: normalized,
        notes: [...new Set(line.notes)].join(" | ").slice(0, 500),
      };
    });
    if (!lines.length) continue;

    audit.usableTemplates += 1;
    audit.consolidatedLines += lines.length;
    audit.largestTemplate = Math.max(audit.largestTemplate, lines.length);
    if (lines.length > 30) audit.templatesOver30Lines += 1;
    templates.push({ customer, order, lines });
  }
}

console.log(JSON.stringify(audit, null, 2));

if (!outputPath) process.exit(0);

const templateRows = templates.map(({ customer, order }) => [
  sql(customer.email.trim().toLowerCase()),
  order.id,
  sql(order.order_date),
  sql(order.notes?.trim()),
]);
const lineRows = templates.flatMap(({ customer, order, lines }) =>
  lines.map((line) => [
    sql(customer.email.trim().toLowerCase()),
    order.id,
    `${sql(stableUuid("product", line.productId))}::uuid`,
    sql(`legacy_${line.unitId}`),
    line.quantity.toFixed(1),
    sql(line.notes),
    line.sortOrder,
  ]),
);

const migration = `-- Plantillas reutilizables de los últimos ${historySize} pedidos confirmados de cada cliente antiguo.
-- Solo se importan cantidades positivas, productos/unidades activos y combinaciones válidas.
-- Los productos repetidos se consolidan y las cantidades se ajustan al paso actual de 0.5.

begin;

create table if not exists public.qb_legacy_order_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  source_order_id bigint not null,
  source_order_date date not null,
  source_email text not null,
  source_notes text,
  imported_at timestamptz not null default now(),
  unique (customer_account_id, source_order_id)
);

create table if not exists public.qb_legacy_order_template_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  template_id uuid not null references public.qb_legacy_order_templates(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  allowed_unit_id uuid not null references public.qb_product_allowed_units(id) on delete restrict,
  quantity numeric(18, 6) not null check (quantity > 0),
  notes text,
  sort_order integer not null check (sort_order > 0),
  unique (template_id, product_id),
  constraint qb_legacy_template_line_notes_length check (char_length(coalesce(notes, '')) <= 500)
);

create index if not exists qb_legacy_order_templates_customer_date_idx
  on public.qb_legacy_order_templates(customer_account_id, source_order_date desc);
create index if not exists qb_legacy_order_template_lines_template_sort_idx
  on public.qb_legacy_order_template_lines(template_id, sort_order);

alter table public.qb_legacy_order_templates enable row level security;
alter table public.qb_legacy_order_template_lines enable row level security;

drop policy if exists "Admins can view legacy order templates"
  on public.qb_legacy_order_templates;
create policy "Admins can view legacy order templates"
  on public.qb_legacy_order_templates
  for select
  using (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Admins can view legacy order template lines"
  on public.qb_legacy_order_template_lines;
create policy "Admins can view legacy order template lines"
  on public.qb_legacy_order_template_lines
  for select
  using (public.current_user_role() in ('admin', 'administrador'));

grant select on table public.qb_legacy_order_templates to authenticated, service_role;
grant select on table public.qb_legacy_order_template_lines to authenticated, service_role;

create temporary table qb_legacy_repeat_templates (
  email text not null,
  source_order_id bigint not null,
  source_order_date date not null,
  source_notes text
) on commit drop;

insert into qb_legacy_repeat_templates values
${values(templateRows)};

insert into public.qb_legacy_order_templates (
  customer_account_id,
  source_order_id,
  source_order_date,
  source_email,
  source_notes
)
select
  customer.id,
  source.source_order_id,
  source.source_order_date,
  source.email,
  source.source_notes
from qb_legacy_repeat_templates source
join public.customer_accounts customer
  on lower(trim(customer.email)) = source.email
 and customer.is_active = true
on conflict (customer_account_id, source_order_id) do update
set source_order_date = excluded.source_order_date,
    source_email = excluded.source_email,
    source_notes = excluded.source_notes,
    imported_at = now();

create temporary table qb_legacy_repeat_lines (
  email text not null,
  source_order_id bigint not null,
  product_id uuid not null,
  unit_code text not null,
  quantity numeric(18, 6) not null,
  notes text,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_repeat_lines values
${values(lineRows)};

insert into public.qb_legacy_order_template_lines (
  template_id,
  product_id,
  allowed_unit_id,
  quantity,
  notes,
  sort_order
)
select
  template.id,
  source.product_id,
  allowed.id,
  source.quantity,
  source.notes,
  source.sort_order
from qb_legacy_repeat_lines source
join public.qb_legacy_order_templates template
  on template.source_order_id = source.source_order_id
 and template.source_email = source.email
join public.products product
  on product.id = source.product_id
 and product.is_active = true
join public.qb_product_allowed_units allowed
  on allowed.product_id = source.product_id
 and allowed.usage_context = 'pedido'
 and allowed.is_active = true
join public.qb_units unit
  on unit.id = allowed.unit_id
 and unit.code = source.unit_code
 and unit.is_active = true
join public.qb_unit_dimensions dimension
  on dimension.id = unit.dimension_id
 and dimension.code = 'legacy_dump'
on conflict (template_id, product_id) do update
set allowed_unit_id = excluded.allowed_unit_id,
    quantity = excluded.quantity,
    notes = excluded.notes,
    sort_order = excluded.sort_order;

do $validate$
declare
  template_count integer;
  line_count integer;
begin
  select count(*) into template_count
  from public.qb_legacy_order_templates;
  select count(*) into line_count
  from public.qb_legacy_order_template_lines;

  if template_count <> ${templates.length} or line_count <> ${lineRows.length} then
    raise exception
      'QB_LEGACY_REPEAT_IMPORT_INCOMPLETE templates %, lines %',
      template_count,
      line_count;
  end if;
end;
$validate$;

insert into public.audit_logs (action, entity_type, metadata)
values (
  'import_legacy_repeatable_order_templates',
  'system',
  ${sql(JSON.stringify({ source: "dump-railway-202607241212.sql", ...audit }))}::jsonb
);

commit;
`;

writeFileSync(outputPath, migration, "utf8");
console.log(`Migración escrita en ${outputPath}`);
