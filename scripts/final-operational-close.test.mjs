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

test("administrator retains the complete internal surface", () => {
  for (const path of [
    "/",
    "/pedidos",
    "/matriz-operativa",
    "/clientes",
    "/recibos",
  ]) {
    assert.equal(canAccessPath("administrador", path), true, path);
  }

  for (const path of [
    "/productos",
    "/parametrizacion",
    "/configuracion",
    "/ingresos",
    "/inventario",
    "/reportes",
  ]) {
    assert.equal(canAccessPath("administrador", path), false, path);
  }
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
