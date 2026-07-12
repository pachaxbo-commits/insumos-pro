# QB Insumos - Esquema esperado para inventario de Staging

Este documento describe el resultado esperado despues de Fases 2 a 25. No prueba el estado real de Staging y no autoriza conexiones ni migraciones.

## Baseline esperado

### profiles

Campos criticos: `id uuid`, `email text`, `full_name text`, `role text`, `is_active boolean`, timestamps.

Uso: identidad interna y resolucion de roles. No crear perfiles para clientes externos.

### products

Campos criticos:

- `id uuid`, `name text`, `sku text`;
- `category_id uuid`, `unit_id uuid`;
- `stock_current numeric(14,3)`;
- `stock_min numeric(14,3)`;
- `purchase_price numeric`, `sale_price numeric`;
- `supplier_name text`;
- `is_active boolean`, `is_sellable boolean`, `is_qb_loss_product boolean`;
- campos descriptivos QB de catalogo, sin `is_catalog_visible` como fuente QB.

Indices/constraints: SKU unique nullable, stock y precios no negativos.

### product_categories y units_of_measure

Categorias y unidades base activas. La visibilidad QB no depende de `product_categories.is_catalog_visible`.

### inventory_movements

Campos criticos: producto, tipo, cantidad, stock anterior/posterior, motivo, notas, creador y fecha. Tipos operativos incluyen `entrada`, `salida`, `ajuste`, `merma`.

### customer_accounts y audit_logs

- `customer_accounts`: cuenta Auth externa, datos de contacto y estado.
- `audit_logs`: actor, accion, entidad, metadata, `ip_address`, `user_agent`, fecha.

## Objetos QB

### QB-2/QB-3

- `qb_unit_dimensions`
- `qb_units`
- `qb_product_unit_settings`
- `qb_product_presentations`
- `qb_product_allowed_units`
- `qb_product_classification_outputs`
- `qb_conversion_snapshots`

Reglas clave:

- peso usa kg como base;
- factores positivos;
- cantidades con al menos 3 decimales;
- visibilidad unica: `qb_product_unit_settings.is_visible_in_qb_catalog`;
- snapshots distinguen perfil interno y actor Auth.

### QB-4

- `qb_merchandise_receipts`
- `qb_merchandise_receipt_lines`
- `qb_merchandise_receipt_classification_results`
- `qb_merchandise_receipt_movements`

Estados: `borrador`, `confirmado`, `anulado`. Confirmacion atomica; clasificacion no duplica stock.

### QB-5

- `qb_customer_locations`
- `qb_orders`
- `qb_order_items`

Estados relevantes: `pendiente_preparacion`, `en_preparacion`, `preparado`, `entregado_pendiente_recibo`, `incluido_en_recibo_borrador`, `recibo_emitido`, `cancelado`.

El catalogo externo usa `get_qb_public_catalog()` y no retorna precios.

### QB-6

- `qb_order_preparations`
- `qb_order_preparation_items`
- `qb_order_delivery_movements`

Preparar no mueve stock. Entregar crea una sola salida y usa cantidad real convertida.

### QB-7

- `qb_receipts`
- `qb_receipt_orders`
- `qb_receipt_lines`
- `qb_receipt_events`

Estados: `borrador`, `emitido`, `anulado`. Recibo no fiscal, sin cobro ni stock.

## Funciones criticas

Todas las funciones `SECURITY DEFINER` deben pertenecer a un propietario controlado y tener `search_path = public`.

- `get_qb_public_catalog()`
- `create_qb_catalog_order(uuid,text,jsonb,text)`
- `confirm_qb_merchandise_receipt(uuid)`
- `start_qb_order_preparation(uuid)`
- `save_qb_order_preparation(uuid,jsonb,text,boolean)`
- `confirm_qb_order_delivery(uuid)`
- `cancel_qb_order_before_delivery(uuid,text)`
- `create_qb_receipt_draft(uuid,uuid[])`
- `update_qb_receipt_draft(...)`
- `emit_qb_receipt(uuid)`
- `void_qb_receipt(uuid,text)`
- `admin_update_profile(uuid,text,text,boolean)`

## RLS esperado

RLS habilitado en todas las tablas de aplicacion.

- Cliente: cuenta, ubicaciones, pedidos e items propios.
- Cliente: sin productos directos, parametrizacion, preparacion, entrega, recibos internos o reportes.
- Inventario: parametrizacion y operacion QB permitida; no emite/anula recibos.
- Administrador: lectura y gestion QB segun las politicas.
- Mutaciones criticas: exclusivamente RPC.

## Grants esperados

### anon

- `EXECUTE get_qb_public_catalog()`.
- Sin acceso directo a tablas QB, productos, costos o precios.

### authenticated

- Lecturas y mutaciones directas solo donde RLS y el diseño las permiten.
- Pedidos, entrega y recibos criticos sin mutacion directa.
- RPCs QB con validacion de rol/identidad.

### service_role

Contrato Fase 25:

- `profiles`: `SELECT, INSERT`.
- `audit_logs`: `INSERT`.
- `customer_accounts`: `INSERT`.
- Admin Auth API: listar, crear, consultar y eliminar usuarios.
- Sin privilegios directos sobre productos, stock, tablas QB o modulos legacy.
- Sin RPC legacy `link_public_order_customer_account`.

No hay secuencias requeridas por este contrato.

## Triggers esperados

- timestamps `updated_at`;
- actor de snapshots QB;
- validacion de producto loss en pedidos;
- trigger Auth `handle_new_user` neutro;
- triggers propios de integridad definidos por Fases QB.

## Legacy tolerado pero suspendido

Pueden existir tablas o funciones de compras, ventas, pagos, caja, CxC, CxP, pedidos antiguos y confirmacion publica. Su presencia no las habilita.

No deben:

- aparecer en navegacion activa;
- recibir grants nuevos de QB;
- ser llamadas por RPCs QB;
- mutar stock durante pruebas QB;
- sobrescribir funciones endurecidas.

## Objetos incompatibles o que exigen revision

- dos fuentes de visibilidad de catalogo;
- politicas de productos `USING (true)` para clientes;
- columnas QB con nombres legacy;
- funciones `SECURITY DEFINER` sin search path;
- grants amplios a `anon`, `authenticated` o `service_role`;
- baseline local sintetico aplicado sobre datos existentes.

Toda diferencia debe quedar documentada antes de crear una migracion de compatibilidad.

