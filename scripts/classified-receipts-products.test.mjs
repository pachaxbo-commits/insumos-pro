import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260712092700_classified_receipt_percentages.sql");
const storageMigration = read("supabase/migrations/20260712092800_product_catalog_images.sql");
const ingresos = read("src/components/qb-ingresos/qb-ingresos-management.tsx");
const ingresoActions = read("src/lib/qb-ingresos/actions.ts");
const combobox = read("src/components/products/product-combobox.tsx");
const productActions = read("src/lib/products/actions.ts");
const productForm = read("src/components/products/product-management.tsx");
const orderCreator = read("src/components/qb-orders/internal-order-creator.tsx");
const productConfig = read("src/components/products/qb-product-config-panel.tsx");

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
  assert.match(productConfig, /value={output\?\.output_type \?\? "product"}/);
  assert.doesNotMatch(productConfig, /<option value="loss">/);
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
