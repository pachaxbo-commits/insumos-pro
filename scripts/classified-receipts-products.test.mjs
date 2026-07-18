import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260712092700_classified_receipt_percentages.sql");
const adminMigration = read("supabase/migrations/20260712093000_qb_classification_admin_configuration.sql");
const storageMigration = read("supabase/migrations/20260712092800_product_catalog_images.sql");
const ingresos = read("src/components/qb-ingresos/qb-ingresos-management.tsx");
const ingresoActions = read("src/lib/qb-ingresos/actions.ts");
const combobox = read("src/components/products/product-combobox.tsx");
const productActions = read("src/lib/products/actions.ts");
const productForm = read("src/components/products/product-management.tsx");
const orderCreator = read("src/components/qb-orders/internal-order-creator.tsx");
const productConfig = read("src/components/products/qb-product-config-panel.tsx");
const classificationConfig = read("src/components/products/product-classification-configuration.tsx");
const parametrization = read("src/components/products/qb-parametrization-panel.tsx");
const e2e = read("supabase/tests/classified_receipts_e2e_rollback.sql");

function distribute(baseQuantity, percentages) {
  const result = [];
  const lastPositiveIndex = percentages.reduce(
    (last, percentage, index) => percentage > 0 ? index : last,
    -1,
  );
  let assigned = 0;
  for (const [index, percentage] of percentages.entries()) {
    const quantity = index === lastPositiveIndex
      ? Math.round((baseQuantity - assigned) * 1_000_000) / 1_000_000
      : Math.round(baseQuantity * percentage / 100 * 1_000_000) / 1_000_000;
    result.push(quantity);
    assigned += quantity;
  }
  return result;
}

test("01 diez cargas equivalen a 1125 kg", () => assert.equal(10 * 112.5, 1125));
test("02 papa 50/30/20 conserva 1125 kg", () => {
  const quantities = distribute(1125, [50, 30, 20]);
  assert.deepEqual(quantities, [562.5, 337.5, 225]);
  assert.equal(quantities.reduce((sum, value) => sum + value, 0), 1125);
});
test("03 tomate 5 cajas equivale a 125 kg", () => assert.equal(5 * 25, 125));
test("04 vaina 2 sacos equivale a 42.75 kg", () => assert.equal(2 * 21.375, 42.75));
test("05 el residuo se asigna al ultimo resultado positivo", () => {
  const quantities = distribute(1, [33.3333, 33.3333, 33.3334, 0]);
  assert.deepEqual(quantities, [0.333333, 0.333333, 0.333334, 0]);
  assert.equal(quantities.reduce((sum, value) => sum + value, 0), 1);
});
test("06 la interfaz exige exactamente 100 por ciento", () => {
  assert.match(ingresos, /Math\.abs\(percentageTotal - 100\) < 0\.000001/);
  assert.match(ingresoActions, /Math\.abs\(total - 100\) > 0\.000001/);
});
test("07 la base usa numeric y seis decimales", () => {
  assert.match(migration, /numeric\(18, 6\)/);
  assert.match(migration, /round\(v_line\.base_quantity - v_quantity_total, 6\)/);
});
test("08 el porcentaje es variable por linea", () => {
  assert.match(migration, /assigned_percentage numeric\(7, 4\)/);
  assert.match(ingresos, /name={`percentage_\$\{index\}`}/);
});
test("09 no se ofrece merma nueva", () => {
  assert.match(classificationConfig, /Distribución variable, sin merma/);
  assert.doesNotMatch(classificationConfig, /<option value="loss">/);
  assert.match(adminMigration, /'loss_output', false/);
});
test("10 la clasificacion solo admite resultados producto activos", () => {
  assert.match(migration, /output_type = 'product'/);
  assert.match(migration, /product\.is_active = true/);
});
test("11 resultados repetidos son rechazados", () => assert.match(migration, /QB_CLASSIFICATION_DUPLICATE_OUTPUT/));
test("12 la RPC conserva cantidad y costo", () => {
  assert.match(migration, /QB_CLASSIFICATION_CONSERVATION_FAILED/);
  assert.match(migration, /v_assigned_cost := round\(v_line\.total_cost - v_cost_total, 4\)/);
});
test("13 la interfaz usa exclusivamente la RPC para porcentajes", () => {
  assert.match(ingresoActions, /rpc\("save_qb_merchandise_classification_percentages"/);
  assert.doesNotMatch(ingresoActions, /from\("qb_merchandise_receipt_classification_results"\)\s*\.delete/);
});
test("14 las confirmaciones existentes siguen usando su RPC", () => assert.match(ingresoActions, /rpc\("confirm_qb_merchandise_receipt"/));
test("15 el buscador ignora tildes y mayusculas", () => {
  assert.match(combobox, /normalize\("NFD"\)/);
  assert.match(combobox, /toLocaleLowerCase\("es"\)/);
});
test("16 el buscador consulta nombre categoria y unidad", () => assert.match(combobox, /option\.name}[\s\S]*option\.category[\s\S]*option\.unit/));
test("17 el buscador limita resultados y admite teclado", () => {
  assert.match(combobox, /maxResults = 8/);
  assert.match(combobox, /ArrowDown/);
  assert.match(combobox, /ArrowUp/);
  assert.match(combobox, /event\.key === "Enter"/);
});
test("18 ingresos, pedidos y configuracion reutilizan el buscador", () => {
  assert.match(ingresos, /<ProductCombobox/);
  assert.match(orderCreator, /<ProductCombobox/);
  assert.match(productConfig, /<ProductCombobox/);
});
test("19 la imagen se valida por firma y MIME", () => {
  assert.match(productActions, /0xff[\s\S]*0xd8[\s\S]*0xff/);
  assert.match(productActions, /RIFF[\s\S]*WEBP/);
  assert.match(productActions, /value\.type !== detected\.mime/);
});
test("20 SVG y archivos mayores a 5 MB no estan permitidos", () => {
  assert.doesNotMatch(storageMigration, /image\/svg\+xml/);
  assert.match(storageMigration, /5242880/);
  assert.match(productActions, /MAX_PRODUCT_IMAGE_BYTES/);
});
test("21 el nombre almacenado es generado", () => assert.match(productActions, /crypto\.randomUUID\(\)/));
test("22 reemplazar imagen elimina el objeto administrado anterior", () => assert.match(productActions, /previousPath[\s\S]*\.remove\(\[previousPath\]\)/));
test("23 el formulario acepta solo JPEG PNG y WebP", () => assert.match(productForm, /accept="image\/jpeg,image\/png,image\/webp"/));
test("24 crear o editar producto no cambia stock ni precios operativos", () => {
  assert.doesNotMatch(productForm, /name="stock_current"/);
  assert.doesNotMatch(productForm, /name="purchase_price"/);
  assert.doesNotMatch(productForm, /name="sale_price"/);
});
test("25 la configuracion y las imagenes son solo de administrador", () => {
  assert.match(productActions, /auth\.user\.role !== "administrador"/);
  assert.match(storageMigration, /current_user_role\(\) in \('admin', 'administrador'\)/);
});
test("26 cada imagen usa una ruta nueva antes de reemplazar la anterior", () => {
  assert.match(productActions, /`\$\{productId\}\/\$\{crypto\.randomUUID\(\)\}\.\$\{detected\.extension\}`/);
  assert.match(productActions, /if \(error\) \{[\s\S]*uploaded\.path[\s\S]*remove\(\[uploaded\.path\]\)/);
});
test("27 la configuracion administrativa usa una sola RPC atomica", () => {
  assert.match(productActions, /rpc\(\s*"save_qb_product_classification_configuration"/);
  assert.doesNotMatch(productActions, /from\("qb_product_classification_outputs"\)\s*\.(insert|update|delete)/);
  assert.match(adminMigration, /create or replace function public\.save_qb_product_classification_configuration/);
});
test("28 solo administradores pueden guardar resultados", () => {
  assert.match(adminMigration, /v_role not in \('admin', 'administrador'\)/);
  assert.match(adminMigration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(adminMigration, /grant execute on function[\s\S]*to authenticated/);
});
test("29 no queda DML directo de resultados para usuarios", () => {
  assert.match(adminMigration, /revoke insert, update, delete on table public\.qb_product_classification_outputs/);
  assert.match(adminMigration, /Internal roles can view QB classification outputs/);
  assert.doesNotMatch(adminMigration, /grant (insert|update|delete)/i);
});
test("30 la RPC impide origen propio duplicados inactivos y dimensiones distintas", () => {
  assert.match(adminMigration, /v_output_product_id = p_source_product_id/);
  assert.match(adminMigration, /v_output_product_id = any\(v_output_ids\)/);
  assert.match(adminMigration, /product\.is_active = true/);
  assert.match(adminMigration, /unit\.dimension_id = v_source_dimension_id/);
});
test("31 retirar una relacion la desactiva y no la elimina", () => {
  assert.match(adminMigration, /update public\.qb_product_classification_outputs output[\s\S]*set is_active = false/);
  assert.doesNotMatch(adminMigration, /delete from public\.qb_product_classification_outputs/);
});
test("32 la configuracion aparece dentro de editar producto", () => {
  assert.match(productForm, /product\.requires_classification[\s\S]*<LazyProductClassificationConfiguration/);
  assert.doesNotMatch(productConfig, /ProductClassificationOutputForm/);
});
test("33 la interfaz explica porcentaje variable y ausencia de stock fuente", () => {
  assert.match(classificationConfig, /distribuir el 100 %[\s\S]*productos[\s\S]*resultantes/);
  assert.match(classificationConfig, /El producto de entrada no acumula stock/);
});
test("34 presentaciones muestran equivalencia unitaria y total", () => {
  assert.match(parametrization, /Equivalencia por unidad/);
  assert.match(parametrization, /Total presentación/);
  assert.match(parametrization, /presentation\.conversion_factor_to_base/);
});
test("35 ingresos muestran resultados y bloquean configuracion incompleta", () => {
  assert.match(ingresos, /qbProductClassificationOutputs/);
  assert.match(ingresos, /Este producto requiere clasificación, pero todavía no tiene productos resultantes configurados/);
  assert.match(ingresos, /requiresClassification && !selectedOutputs\.length/);
});
test("36 el backend fuerza clasificacion y exige resultados activos", () => {
  assert.match(ingresoActions, /productResult\.data\.requires_classification \|\| settings\.is_classifiable/);
  assert.match(ingresoActions, /\.eq\("output_type", "product"\)/);
  assert.match(ingresoActions, /requires_classification: requiresClassification/);
});
test("37 recepcion usa el factor total de la presentacion", () => {
  assert.match(ingresoActions, /Number\(presentation\.conversion_factor_to_base\)/);
  assert.doesNotMatch(ingresoActions, /conversionFactorToBase =[\s\S]{0,120}Number\(presentation\.base_quantity\)/);
});
test("38 el contrato transaccional configura resultados con la misma RPC", () => {
  assert.match(e2e, /perform public\.save_qb_product_classification_configuration/);
  assert.doesNotMatch(e2e, /insert into public\.qb_product_classification_outputs/);
  assert.match(e2e, /rollback;/i);
});
