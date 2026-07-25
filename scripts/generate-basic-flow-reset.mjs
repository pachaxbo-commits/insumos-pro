import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , dumpArgument, outputArgument] = process.argv;

if (!dumpArgument || !outputArgument) {
  throw new Error(
    "Uso: node scripts/generate-basic-flow-reset.mjs <dump.sql> <migracion.sql>",
  );
}

const dumpPath = resolve(dumpArgument);
const outputPath = resolve(outputArgument);
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
  if (value === null || value === undefined) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bool(value) {
  return value === "t" ? "true" : "false";
}

function color(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "")
    ? value.toUpperCase()
    : "#FFFFFF";
}

function values(rows) {
  return rows.map((row) => `  (${row.join(", ")})`).join(",\n");
}

const categories = copyRows("product_categories");
const units = copyRows("units_of_measure");
const products = copyRows("products");
const productUnits = copyRows("product_units");
const productUnitRows = new Map();

for (const row of productUnits) {
  const current = productUnitRows.get(row.product_id) ?? [];
  current.push(row);
  productUnitRows.set(row.product_id, current);
}

const baseUnitByProduct = new Map();
for (const product of products) {
  const rows = (productUnitRows.get(product.id) ?? []).sort(
    (left, right) => Number(left.id) - Number(right.id),
  );
  const base = rows.find((row) => row.is_primary === "t") ?? rows[0];
  if (!base) throw new Error(`Producto ${product.id} sin unidades.`);
  baseUnitByProduct.set(product.id, base.unit_of_measure_id);
}

const weightUnitIds = new Set(
  units
    .filter((unit) =>
      ["KG", "ARROBA", "QUINTAL", "LIBRA", "ONZA", "GR"].includes(
        unit.abbreviation,
      ),
    )
    .map((unit) => unit.id),
);

const activeProductCount = products.filter(
  (product) => product.active === "t",
).length;

const migration = `-- Reinicio controlado del flujo básico de QB Insumos.
-- Fuente de catálogo: dump-railway-202607241212.sql.
-- Se conservan auth.users, profiles, customer_accounts, qb_customer_locations y customers.
-- No se importan pedidos, usuarios ni contraseñas del sistema antiguo.

begin;

create schema if not exists backup_basic_flow_20260724;
revoke all on schema backup_basic_flow_20260724 from public, anon, authenticated;

do $backup$
declare
  source_table record;
begin
  if exists (
    select 1
    from pg_catalog.pg_tables
    where schemaname = 'backup_basic_flow_20260724'
  ) then
    raise exception 'QB_BASIC_FLOW_BACKUP_ALREADY_EXISTS';
  end if;

  for source_table in
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    execute format(
      'create table backup_basic_flow_20260724.%I as table public.%I',
      source_table.tablename,
      source_table.tablename
    );
  end loop;
end;
$backup$;

comment on schema backup_basic_flow_20260724 is
  'Copia previa al reinicio del flujo básico y catálogo del 24/07/2026.';

do $reset$
declare
  table_name text;
begin
  foreach table_name in array array[
    'qb_receipts',
    'qb_merchandise_receipts',
    'qb_orders',
    'orders',
    'inventory_movements',
    'purchase_batches',
    'purchases',
    'sales',
    'accounts_receivable',
    'accounts_payable',
    'payments',
    'cash_movements',
    'public_order_submission_attempts'
  ]
  loop
    if pg_catalog.to_regclass('public.' || table_name) is not null then
      execute format('truncate table public.%I cascade', table_name);
    end if;
  end loop;
end;
$reset$;

truncate table public.products cascade;
truncate table public.product_categories cascade;
truncate table public.units_of_measure cascade;

create temporary table qb_legacy_categories (
  old_id bigint primary key,
  id uuid not null,
  name text not null,
  description text,
  is_active boolean not null,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_categories values
${values(
  categories.map((category, index) => [
    category.id,
    `${sql(stableUuid("category", category.id))}::uuid`,
    sql(category.name),
    sql(category.description),
    bool(category.active),
    index + 1,
  ]),
)};

create temporary table qb_legacy_units (
  old_id bigint primary key,
  id uuid not null,
  name text not null,
  abbreviation text not null,
  is_active boolean not null,
  unit_code text not null,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_units values
${values(
  units.map((unit, index) => [
    unit.id,
    `${sql(stableUuid("unit", unit.id))}::uuid`,
    sql(unit.name),
    sql(unit.abbreviation),
    bool(unit.active),
    sql(`legacy_${unit.id}`),
    index + 1,
  ]),
)};

create temporary table qb_legacy_products (
  old_id bigint primary key,
  id uuid not null,
  name text not null,
  description text,
  is_active boolean not null,
  category_old_id bigint,
  base_unit_old_id bigint not null,
  matrix_color text not null,
  controls_actual_weight boolean not null,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_products values
${values(
  products.map((product, index) => {
    const baseUnitId = baseUnitByProduct.get(product.id);
    return [
      product.id,
      `${sql(stableUuid("product", product.id))}::uuid`,
      sql(product.name.trim()),
      sql(product.description),
      bool(product.active),
      product.product_category_id ?? "null",
      baseUnitId,
      sql(color(product.color)),
      weightUnitIds.has(baseUnitId) ? "true" : "false",
      index + 1,
    ];
  }),
)};

create temporary table qb_legacy_product_units (
  old_id bigint primary key,
  product_old_id bigint not null,
  unit_old_id bigint not null,
  is_primary boolean not null,
  sort_order integer not null
) on commit drop;

insert into qb_legacy_product_units values
${values(
  productUnits.map((row, index) => [
    row.id,
    row.product_id,
    row.unit_of_measure_id,
    baseUnitByProduct.get(row.product_id) === row.unit_of_measure_id
      ? "true"
      : "false",
    index + 1,
  ]),
)};

insert into public.product_categories (
  id,
  name,
  description,
  is_active,
  catalog_slug,
  catalog_sort_order
)
select
  id,
  name,
  description,
  is_active,
  'catalogo-' || old_id,
  sort_order
from qb_legacy_categories;

insert into public.units_of_measure (
  id,
  name,
  abbreviation,
  is_active
)
select id, name, abbreviation, is_active
from qb_legacy_units;

insert into public.qb_unit_dimensions (
  code,
  name,
  base_unit_code,
  is_active,
  sort_order
)
values (
  'legacy_dump',
  'Unidades del sistema antiguo',
  'legacy_5',
  true,
  90
)
on conflict (code) do update
set name = excluded.name,
    base_unit_code = excluded.base_unit_code,
    is_active = true,
    sort_order = excluded.sort_order;

insert into public.qb_units (
  dimension_id,
  code,
  name,
  symbol,
  conversion_factor_to_base,
  is_base,
  is_active,
  sort_order
)
select
  dimension.id,
  source.unit_code,
  source.name,
  source.abbreviation,
  1,
  source.old_id = 5,
  source.is_active,
  source.sort_order
from qb_legacy_units source
join public.qb_unit_dimensions dimension
  on dimension.code = 'legacy_dump'
on conflict (dimension_id, code) do update
set name = excluded.name,
    symbol = excluded.symbol,
    conversion_factor_to_base = 1,
    is_base = excluded.is_base,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

insert into public.products (
  id,
  name,
  sku,
  category_id,
  unit_id,
  stock_current,
  stock_min,
  purchase_price,
  sale_price,
  catalog_description,
  catalog_sort_order,
  catalog_min_quantity,
  catalog_quantity_step,
  is_sellable,
  is_active,
  matrix_color,
  controls_actual_weight
)
select
  source.id,
  source.name,
  'LEGACY-' || lpad(source.old_id::text, 4, '0'),
  category.id,
  legacy_unit.id,
  0,
  0,
  0,
  0,
  source.description,
  source.sort_order,
  0.001,
  0.001,
  true,
  source.is_active,
  source.matrix_color,
  source.controls_actual_weight
from qb_legacy_products source
left join qb_legacy_categories category
  on category.old_id = source.category_old_id
join qb_legacy_units legacy_unit
  on legacy_unit.old_id = source.base_unit_old_id;

insert into public.qb_product_unit_settings (
  product_id,
  base_unit_id,
  inventory_unit_id,
  base_inventory_unit_id,
  base_price_unit_id,
  notes,
  is_visible_in_qb_catalog,
  is_classifiable,
  classification_mode,
  is_qb_active,
  supports_amount_bs
)
select
  product.id,
  unit.id,
  unit.id,
  unit.id,
  unit.id,
  'Importado del dump del sistema antiguo; factores originales iguales a 1.',
  product.is_active,
  false,
  'none',
  product.is_active,
  false
from qb_legacy_products product
join qb_legacy_units legacy_unit
  on legacy_unit.old_id = product.base_unit_old_id
join public.qb_unit_dimensions dimension
  on dimension.code = 'legacy_dump'
join public.qb_units unit
  on unit.dimension_id = dimension.id
 and unit.code = legacy_unit.unit_code;

with allowed_source as (
  select
    product.id as product_id,
    unit.id as unit_id,
    context.usage_context,
    product_unit.is_primary,
    row_number() over (
      partition by product.id, context.usage_context
      order by product_unit.sort_order
    ) as sort_order,
    product.is_active and legacy_unit.is_active as is_active
  from qb_legacy_product_units product_unit
  join qb_legacy_products product
    on product.old_id = product_unit.product_old_id
  join qb_legacy_units legacy_unit
    on legacy_unit.old_id = product_unit.unit_old_id
  join public.qb_unit_dimensions dimension
    on dimension.code = 'legacy_dump'
  join public.qb_units unit
    on unit.dimension_id = dimension.id
   and unit.code = legacy_unit.unit_code
  cross join (
    values ('pedido'::text), ('inventario'::text)
  ) as context(usage_context)
)
insert into public.qb_product_allowed_units (
  product_id,
  usage_context,
  unit_id,
  is_default,
  quantity_step,
  min_quantity,
  is_active,
  sort_order,
  notes
)
select
  product_id,
  usage_context,
  unit_id,
  is_primary,
  0.001,
  0.001,
  is_active,
  sort_order,
  'Unidad habilitada en el sistema antiguo'
from allowed_source;

do $validate$
declare
  product_count integer;
  active_product_count integer;
  settings_count integer;
  allowed_count integer;
begin
  select count(*), count(*) filter (where is_active)
  into product_count, active_product_count
  from public.products;

  select count(*) into settings_count
  from public.qb_product_unit_settings;

  select count(*) into allowed_count
  from public.qb_product_allowed_units
  where usage_context = 'pedido';

  if product_count <> ${products.length}
     or active_product_count <> ${activeProductCount}
     or settings_count <> ${products.length}
     or allowed_count <> ${productUnits.length} then
    raise exception
      'QB_BASIC_FLOW_IMPORT_INCOMPLETE products %, active %, settings %, allowed %',
      product_count,
      active_product_count,
      settings_count,
      allowed_count;
  end if;
end;
$validate$;

insert into public.audit_logs (action, entity_type, metadata)
values (
  'reset_basic_order_flow_and_import_legacy_catalog',
  'system',
  jsonb_build_object(
    'source', 'dump-railway-202607241212.sql',
    'products', ${products.length},
    'active_products', ${activeProductCount},
    'categories', ${categories.length},
    'units', ${units.length},
    'product_units', ${productUnits.length},
    'preserved', jsonb_build_array(
      'auth.users',
      'profiles',
      'customer_accounts',
      'qb_customer_locations',
      'customers'
    ),
    'backup_schema', 'backup_basic_flow_20260724'
  )
);

commit;
`;

writeFileSync(outputPath, migration, "utf8");
console.log(
  JSON.stringify(
    {
      dumpPath,
      outputPath,
      categories: categories.length,
      units: units.length,
      products: products.length,
      activeProducts: activeProductCount,
      productUnits: productUnits.length,
    },
    null,
    2,
  ),
);
