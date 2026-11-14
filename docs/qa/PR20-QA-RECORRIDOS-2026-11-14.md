# PR #20 — evidencia de QA funcional

Fecha: 2026-11-14. Entorno: Supabase Docker `qb-pr20-e2e-qa` y Next.js en `http://127.0.0.1:3382`. Todas las escrituras fueron datos ficticios de QA. No se accedió a Production.

## Identidades y documentos de prueba

- Cliente ficticio `94fa2d09-ce1a-4674-8700-f4311be4bedd`, ubicación `16403299-1414-47b1-b319-a6c63886a887`.
- Producto Piña Verde `5bd7921f-7cdd-5b91-baf8-921283c05523`; Papa Holandesa Grande `cd391667-5977-5972-96e9-bc9fdc30a065`.
- Pedidos entregados desde RPCs operativos: `d23ee60f-80b0-4d6f-a53e-20a565e76da4`, `d30776d8-de29-4e7f-9abb-6bf37614a3a1`, `43541766-b1c5-4c39-839e-89c7d482aba4`, `99a54e8d-7cdd-46f6-853f-f8618afed953`, `db47d98f-5fc3-4d46-b3a1-61481fa8ea58`, `e241c984-4650-4a64-acbe-f74ca6d7c435` y `162a30f7-223c-48dc-bf24-68ffc700feec`.
- Recibos: `a48ca2f4-4277-4846-a2c0-1e63f3d6b4e3`, `0cdeb893-bfc8-4b2f-9a09-a77eeee66a4e`, `a9f53ba3-70cb-41b1-a5b3-04378185aeb7`, `224e58eb-ca46-4b17-9b82-53cb44814aea`, `817fad55-2a0e-4b79-a8c1-81457301973d`, `8348032a-4d4a-4d3f-96b8-612943eb129f` y `87edb772-c5f8-4eb5-ba91-90a32f6987ff`.

## Resultados de recibos

- **Piña Verde — PASS:** el primer recibo mostró cero editable. Al ingresar Bs 20, con factores de 5% cada uno, el formulario calculó venta Bs 96 sobre cuatro unidades (costo Bs 80, utilidad Bs 16). SQL confirmó el costo unitario manual de Bs 20.
- **Memoria de costos — PASS:** el borrador siguiente sugirió Bs 20; se cambió a Bs 22 y el siguiente borrador sugirió Bs 22.
- **Cero predeterminado — PASS:** se guardó otro recibo desde el formulario sin tocar el cero de ACEITE. SQL confirmó `cost_base_unit_snapshot`, `cost_source` y `receipt_cost_saved_at` nulos para esa línea; Piña conservó su snapshot de Bs 22.
- **Papa Holandesa — PASS:** el editor histórico de QA guardó por formulario una referencia de compra Bs 95/ARROBA; PostgreSQL confirmó `purchase_cost_reference_value=95` y unidad `arroba`. Se creó un segundo pedido/recibo desde formularios. Su línea comercial KG inició en Bs 0, mostró “Sin costo guardado en esta unidad” y el RPC de sugerencias devolvió `null`; SQL confirmó que no se copió el 95 como costo manual por KG. Un ingreso posterior por formulario de Bs 20/KG quedó registrado en KG y calculó venta Bs 20. Las pruebas automatizadas de base de costo y conversión de arroba también pasaron.

## Limpiezas desde Configuración → Datos de prueba

| Modalidad | Acción de navegador | Comprobación PostgreSQL |
|---|---|---|
| Solo Recibos | Se seleccionaron y confirmaron tres borradores con `BORRAR DATOS`. | Recibos 0; pedidos, preparaciones, entregas y movimientos permanecieron. |
| Pedidos y operación | Se confirmó desde el formulario. El primer intento reprodujo `DELETE requires a WHERE clause` y revirtió; tras la migración correctiva, el reintento pasó. | Pedidos, recibos, preparaciones, entregas y movimientos vinculados 0; tres movimientos de entrada independientes y sus existencias se conservaron. |
| Solo stock | Se confirmó desde el formulario cuando ya no había pedidos dependientes. | Movimientos, ingresos, lotes y recibos de mercadería 0; stock en cero. Productos, cliente, perfiles y unidades quedaron (378, 1, 2 y 52). |
| Pedidos + stock | Se confirmó desde el formulario con un pedido, una preparación, una entrega, un recibo y dos movimientos. | Pedido/recibo/preparación/entrega, movimientos, lotes e ingresos 0; stock no nulo 0. La auditoría reportó los dos movimientos eliminados antes de la limpieza y el único producto cuyo saldo se puso a cero. Los maestros se conservaron. |

- **Dependencia de stock — PASS:** con pedido y salida activos, el control Solo stock quedó deshabilitado; el aviso indicó que correspondía Pedidos + stock.
- **Vista previa desactualizada — PASS:** se agregó una entrada mediante RPC oficial después de abrir la confirmación; la acción devolvió “Los datos cambiaron. Actualiza la vista previa.” y la operación se canceló sin borrar pedido ni recibo.
- **Permisos — PASS:** el usuario ficticio `inventario` no vio el formulario de limpieza; `execute_qb_owner_cleanup` respondió `42501 Acceso denegado.`.
- **Rollback — PASS:** un trigger temporal exclusivo de QA generó `QA_FORCED_ROLLBACK_TEST` al eliminar movimientos. La acción falló y PostgreSQL conservó pedidos, recibos, preparación, entrega, movimientos y stock. El trigger y su función se retiraron después.

## `/pedidos` y corrección adicional

**PASS.** No había documento vacío: el formulario se abrió con cliente, ubicación y fecha. “Nuevo pedido” era el título, por lo que la espera anterior de un botón con ese texto era incorrecta. No hubo excepción JS, error de hidratación ni respuesta fallida de Server Action; `getInternalOrderCreationDataAction` respondió 200. Se prepararon pedidos con RPCs oficiales, sin depender del formulario de creación.

La limpieza integral reportaba como movimientos afectados solo las salidas eliminadas en la fase de pedidos, aunque también borraba movimientos independientes durante la fase de stock. Se añadió una migración posterior que captura movimientos, ingresos, lotes y productos antes de borrar o revertirlos. QA registró 135 migraciones tras estas dos migraciones correctivas adicionales; no se falsificaron versiones.

Capturas locales QA (no contienen credenciales y no se añaden al repositorio): `.qa-private/pedidos-diagnostico.png`, `.qa-private/receipt-default-zero-fixed.png`, `.qa-private/papa-cost-20-preview.png`, `.qa-private/papa-historical-95-arroba.png`, `.qa-private/papa-after-95-reference.png`, `.qa-private/cleanup-orders-after-fix.png`, `.qa-private/cleanup-stock.png`, `.qa-private/stale-preview.png`, `.qa-private/rollback-ui.png`, `.qa-private/cleanup-count-fix.png`.

## Validaciones de código

- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- `npm run test:receipt-line-pricing`: 10/10 PASS.
- `node --test scripts/qb-owner-cleanup-ui.test.mjs`: 3/3 PASS.
- `npm run test:receipt-cost-basis`: PASS.
- No se intentó crear/modificar workflows de GitHub; el OAuth del repositorio no tiene el scope requerido. El estado remoto de CI debe leerse para el SHA final, y ausencia de checks no se clasificará como fallo de pruebas.
