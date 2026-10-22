import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canAccessPath } from "../src/lib/auth/roles.ts";

test("inventory role is limited to the final operational surface", () => {
  for (const path of ["/", "/matriz-operativa"]) {
    assert.equal(canAccessPath("inventario", path), true, path);
  }

  for (const path of [
    "/pedidos",
    "/pedidos/uno",
    "/ingresos",
    "/inventario",
    "/productos",
    "/parametrizacion",
    "/configuracion",
    "/recibos",
    "/reportes",
    "/ventas",
    "/compras",
    "/proveedores",
    "/clientes",
    "/finanzas",
  ]) {
    assert.equal(canAccessPath("inventario", path), false, path);
  }
});

test("administrator retains the current operational routes", () => {
  for (const path of [
    "/",
    "/pedidos",
    "/matriz-operativa",
    "/productos",
    "/productos/uno",
    "/parametrizacion",
    "/clientes",
    "/recibos",
    "/configuracion",
    "/ingresos",
  ]) {
    assert.equal(canAccessPath("administrador", path), true, path);
  }

  for (const path of [
    "/inventario",
    "/reportes",
  ]) {
    assert.equal(canAccessPath("administrador", path), false, path);
  }
});

test("supervisor receives only the operational surface and safe receipt projection", () => {
  for (const path of ["/", "/pedidos", "/matriz-operativa", "/stock", "/ingresos/compras-almacen", "/recibos/operativo"]) {
    assert.equal(canAccessPath("supervisor", path), true, path);
  }
  for (const path of ["/productos", "/parametrizacion", "/clientes", "/configuracion", "/ingresos", "/recibos", "/historial", "/reportes", "/api/ingresos/compras-almacen.xlsx"]) {
    assert.equal(canAccessPath("supervisor", path), false, path);
  }
  const migration = readFileSync("supabase/migrations/20261022160000_qb_supervisor_operational_role.sql", "utf8");
  const header = readFileSync("src/components/layout/app-header.tsx", "utf8");
  assert.match(migration, /qb_operational_delivered_lines/);
  assert.match(migration, /qb_operational_preparation_costs[\s\S]*supervisor/);
  assert.equal(migration.includes("base_sale_price"), false);
  assert.match(header, /user\.role === "supervisor"\s*\? \{ href: "\/recibos\/operativo"/);
  assert.match(header, /user\.role === "supervisor"\s*\? "Compras almacén"/);
});

test("administrator sees warehouse purchasing in the active menu", () => {
  const sidebar = readFileSync("src/components/layout/app-sidebar.tsx", "utf8");

  assert.match(sidebar, /adminAvailablePaths[\s\S]*"\/ingresos"/);
  assert.match(sidebar, /href="\/ingresos\/compras-almacen"/);
});

test("final documentation and both meeting gates exist", () => {
  const guide = readFileSync("docs/QB_GUIA_ENTREGA_FINAL.md", "utf8");
  const meeting = readFileSync("docs/QB_CHECKLIST_REUNION_CLIENTE.md", "utf8");
  const activation = readFileSync("docs/QB_CHECKLIST_ACTIVACION_DEFINITIVA.md", "utf8");

  for (const topic of [
    "Recuperación de contraseña",
    "Gestión de usuarios",
    "Inventario de apertura",
    "Control estricto",
    "Limpieza segura",
    "PAPA HOLANDESA",
  ]) {
    assert.match(guide, new RegExp(topic, "i"));
  }

  for (const item of [
    "Acceso administrador",
    "Crear borrador de papa",
    "Recoger observaciones",
    "Error encontrado",
    "Aceptación del cliente",
  ]) {
    assert.match(meeting, new RegExp(item, "i"));
  }

  for (const item of [
    "SMTP probado",
    "stock inicial cargado",
    "prueba PC y celular",
    "control estricto activado conscientemente",
  ]) {
    assert.match(activation, new RegExp(item, "i"));
  }
});
