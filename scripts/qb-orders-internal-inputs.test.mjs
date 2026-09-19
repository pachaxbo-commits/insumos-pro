import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createInternalOrderSchema,
  parseInternalOrderFormData,
} from "../src/lib/qb-orders/internal-order-input.ts";

const customerId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const productA = "33333333-3333-4333-8333-333333333333";
const productB = "44444444-4444-4444-8444-444444444444";
const unitA = "55555555-5555-4555-8555-555555555555";
const unitB = "66666666-6666-4666-8666-666666666666";
const idempotencyKey = "77777777-7777-4777-8777-777777777777";
const operationalDate = "2099-12-31";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const componentSource = source("src/components/qb-orders/internal-order-creator.tsx");
const actionSource = source("src/lib/qb-orders/actions.ts");
const migrationSource = source(
  "supabase/migrations/20260712092200_qb_ops_internal_order_creation.sql",
);

const quantityLine = (productId = productA, allowedUnitId = unitA, notes = "") => ({
  productId,
  inputMode: "quantity",
  allowedUnitId,
  quantity: 1,
  notes,
});

const amountLine = (productId = productB, notes = "") => ({
  productId,
  inputMode: "amount_bs",
  requestedAmountBs: 5,
  notes,
});

function registeredForm(items = [quantityLine()], includeNotes = true) {
  const formData = new FormData();
  formData.set("order_mode", "registered");
  formData.set("customer_account_id", customerId);
  formData.set("customer_location_id", locationId);
  formData.set("operational_date", operationalDate);
  formData.set("idempotency_key", idempotencyKey);
  formData.set("items", JSON.stringify(items));
  if (includeNotes) formData.set("customer_notes", "");
  return formData;
}

function guestForm(items = [quantityLine()]) {
  const formData = new FormData();
  formData.set("order_mode", "guest");
  formData.set("business_name", "Negocio QA");
  formData.set("responsible_name", "Responsable QA");
  formData.set("phone", "+59170000000");
  formData.set("address", "Dirección QA controlada");
  formData.set("idempotency_key", idempotencyKey);
  formData.set("operational_date", operationalDate);
  formData.set("items", JSON.stringify(items));
  return formData;
}

test("01 registered acepta notas generales omitidas como null", () => {
  const parsed = parseInternalOrderFormData(registeredForm([quantityLine()], false));
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.customerNotes, "");
});

test("02 registered acepta notas generales vacías", () => {
  const parsed = parseInternalOrderFormData(registeredForm());
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.customerNotes, "");
});

test("03 una línea válida acepta nota null", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([quantityLine(productA, unitA, null)]),
  );
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.items[0].notes, "");
});

test("04 una línea válida acepta nota vacía", () => {
  const parsed = parseInternalOrderFormData(registeredForm([quantityLine()]));
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.items[0].notes, "");
});

test("04b las observaciones conservan espacios internos y saltos de línea", () => {
  const note = "  dos   palabras\ncon separación  ";
  const formData = registeredForm([quantityLine(productA, unitA, note)]);
  formData.set("customer_notes", note);
  const parsed = parseInternalOrderFormData(formData);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.items[0].notes, "dos   palabras\ncon separación");
    assert.equal(parsed.data.customerNotes, "dos   palabras\ncon separación");
  }
  assert.match(componentSource, /<Textarea[\s\S]*Nota de \$\{product\.name\}/);
});

test("05 registered normaliza a vacío los campos guest recibidos como null", () => {
  const parsed = parseInternalOrderFormData(registeredForm());
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(
      [
        parsed.data.businessName,
        parsed.data.responsibleName,
        parsed.data.phone,
        parsed.data.email,
        parsed.data.address,
        parsed.data.locationLabel,
        parsed.data.locationReference,
      ],
      ["", "", "", "", "", "", ""],
    );
  }
});

test("06 coordenadas ausentes equivalen al par null/null", () => {
  const parsed = createInternalOrderSchema.safeParse({
    orderMode: "registered",
    operationalDate,
    customerAccountId: customerId,
    customerLocationId: locationId,
    latitude: null,
    longitude: null,
    idempotencyKey,
    items: [quantityLine()],
  });
  assert.equal(parsed.success, true);
  assert.doesNotMatch(actionSource, /p_latitude|p_longitude/);
});

test("07 place ID nulo no forma parte del contrato interno vigente", () => {
  const parsed = createInternalOrderSchema.safeParse({
    orderMode: "registered",
    operationalDate,
    customerAccountId: customerId,
    customerLocationId: locationId,
    googlePlaceId: null,
    idempotencyKey,
    items: [quantityLine()],
  });
  assert.equal(parsed.success, true);
  assert.doesNotMatch(actionSource, /p_google_place_id/);
});

test("08 el flujo interno rechaza pedidos guest", () => {
  const parsed = parseInternalOrderFormData(guestForm());
  assert.equal(parsed.success, false);
});

test("09 el contrato interno exige cliente registrado", () => {
  const parsed = parseInternalOrderFormData(guestForm());
  assert.equal(parsed.success, false);
});

test("10 reproduce dos líneas quantity válidas", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([quantityLine(productA, unitA), quantityLine(productB, unitB)]),
  );
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.items.length, 2);
});

test("11 el pedido interno exige cantidades y rechaza amount_bs", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([quantityLine(), amountLine()]),
  );
  assert.equal(parsed.success, false);
});

test("12 registered sin cliente devuelve mensaje de dominio", () => {
  const formData = registeredForm();
  formData.delete("customer_account_id");
  const parsed = parseInternalOrderFormData(formData);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(
      parsed.error.issues.find((issue) => issue.path[0] === "customerAccountId")?.message,
      "Selecciona un cliente.",
    );
  }
});

test("13 registered sin ubicación devuelve mensaje de dominio", () => {
  const formData = registeredForm();
  formData.delete("customer_location_id");
  const parsed = parseInternalOrderFormData(formData);
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.equal(
      parsed.error.issues.find((issue) => issue.path[0] === "customerLocationId")?.message,
      "Selecciona una ubicación.",
    );
  }
});

test("14 producto ausente devuelve mensaje de dominio", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([{ ...quantityLine(), productId: "" }]),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues[0].message, /producto/i);
});

test("15 una fila parcial no se descarta y se rechaza claramente", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([{ productId: productA, inputMode: "quantity", notes: "" }]),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues[0].message, /unidad|cantidad/i);
});

test("16 cantidad cero se rechaza", () => {
  const parsed = parseInternalOrderFormData(
    registeredForm([{ ...quantityLine(), quantity: 0 }]),
  );
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.equal(parsed.error.issues[0].message, "Ingresa una cantidad válida.");
});

test("17 error de servidor conserva el formulario", () => {
  assert.match(componentSource, /event\.preventDefault\(\)/);
  assert.doesNotMatch(componentSource, /<form action=/);
  assert.match(
    componentSource,
    /if \(!editing && result\.success && result\.orderId && result\.reference\)/,
  );
});

test("18 error de red conserva valores y muestra mensaje español", () => {
  assert.match(componentSource, /catch \{/);
  assert.match(componentSource, /Conservamos tus datos para que puedas intentarlo nuevamente/);
  assert.doesNotMatch(componentSource, /catch \{[\s\S]{0,250}resetAfterConfirmedCreation/);
});

test("19 éxito confirmado limpia todos los borradores", () => {
  for (const reset of [
    /setCustomerId\(""\)/,
    /setLocationId\(""\)/,
    /setOperationalDate\(boliviaTomorrow\(\)\)/,
    /setCustomerNotes\(""\)/,
    /setLines\(\[\]\)/,
  ]) assert.match(componentSource, reset);
  assert.match(componentSource, /formRef\.current\?\.reset\(\)/);
});

test("20 doble clic queda bloqueado y conserva idempotencia en reintentos", () => {
  assert.match(componentSource, /submissionInFlightRef\.current/);
  assert.match(
    componentSource,
    /disabled=\{[\s\S]*?pending[\s\S]*?\(!editing && !idempotencyKey\)[\s\S]*?lines\.length === 0[\s\S]*?\}/,
  );
  assert.doesNotMatch(
    componentSource.match(/catch \{[\s\S]*?\} finally/)?.[0] ?? "",
    /setIdempotencyKey/,
  );
  assert.match(componentSource, /setIdempotencyKey\(\(current\) => current \|\| crypto\.randomUUID\(\)\)/);
});

test("21 la acción confirma UUID y referencia antes de declarar éxito", () => {
  assert.match(actionSource, /uuidSchema\.safeParse\(result\.created_order_id\)/);
  assert.match(actionSource, /!orderId\.success \|\| !reference/);
  assert.match(actionSource, /orderId: createdOrders\[0\]\.id/);
});

test("22 crear un pedido no modifica stock", () => {
  assert.doesNotMatch(migrationSource, /stock_current\s*=/i);
  assert.doesNotMatch(migrationSource, /insert into public\.inventory_movements/i);
});

test("23 la interfaz nunca expone mensajes técnicos de Zod", () => {
  const createActionSource = actionSource.slice(
    actionSource.indexOf("export async function createQbInternalOrderAction"),
    actionSource.indexOf("export async function updateQbInternalOrderAction"),
  );
  assert.doesNotMatch(componentSource + createActionSource, /expected string|received null|SQLSTATE/i);
  assert.doesNotMatch(createActionSource, /errorMessage\(error/);
});

test("24 una solicitud inválida se detiene antes de invocar la RPC", () => {
  const duplicate = parseInternalOrderFormData(
    registeredForm([quantityLine(), quantityLine()]),
  );
  assert.equal(duplicate.success, false);
  const validationIndex = actionSource.indexOf("if (!parsed.success)");
  const rpcIndex = actionSource.indexOf(
    '"create_qb17_internal_catalog_order_with_date"',
  );
  assert.ok(validationIndex > 0 && rpcIndex > validationIndex);
});
