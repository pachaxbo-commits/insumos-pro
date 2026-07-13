# QB-9.10 - Validacion E2E del nuevo Staging

Fecha/hora de cierre: 2026-07-12 22:13:24 -04:00

## Veredicto

**E2E FALLO, LIMPIEZA COMPLETA.**

El flujo se detuvo en la primera prueba negativa de pedido de un producto merma. El backend rechazo correctamente la operacion con `Producto no disponible en el catalogo QB`, pero el arnes esperaba un `result_code` y trato el error RPC como bloqueante. No se corrigio ni repitio el E2E. Se ejecuto inmediatamente la limpieza autorizada.

Staging volvio al estado inicial: cero usuarios, perfiles, cuentas, productos, movimientos y operaciones; permanecen solamente el esquema, las 14 migraciones y los registros canonicos de unidades.

## Identidad y preflight

- Proyecto: `qb-insumos-staging-v2`.
- Project ref: `tekfwbhvqtojpfqusosg`.
- Rama: `main`.
- Git previo: limpio.
- Supabase CLI: `2.109.1`.
- Migraciones locales/remotas: 14/14, emparejadas.
- Dry-run previo: `Remote database is up to date`.
- Migraciones pendientes o inesperadas: ninguna.
- Fases 15F-B/15F-C y fulfillment: ausentes del conjunto canonico.

## Esquema, RLS y grants

La inspeccion remota read-only produjo un dump de esquema de 5.304 lineas. El proceso de dump alcanzo el timeout al cerrar el contenedor, pero el archivo quedo completo y termino con los grants/default privileges esperados de `pg_dump`.

Resultados:

- tablas publicas: 39;
- tablas QB: 21/21;
- funciones criticas QB revisadas: presentes;
- tablas QB sin RLS: ninguna;
- politicas observadas: 55;
- tablas publicas con RLS: 31;
- trigger de actor de snapshot: presente;
- trigger de bloqueo de producto merma en items QB: presente;
- columnas criticas de `products`: presentes;
- columnas criticas de `audit_logs`: presentes;
- contrato directo `service_role` Fase 25: `profiles SELECT/INSERT`, `audit_logs INSERT`, `customer_accounts INSERT`;
- catalogo publico: `EXECUTE` para `anon` y `authenticated`;
- lectura directa externa de productos/precios: bloqueada en prueba con sesion real;
- lectura de configuracion QB interna por cliente: bloqueada.

No se creo ni modifico ningun objeto de esquema durante QB-9.10.

## Estado inicial

La consulta administrativa se ejecuto con `BEGIN READ ONLY`, `SET LOCAL ROLE postgres` y `ROLLBACK`.

| Dominio | Conteo inicial |
| --- | ---: |
| Auth users | 0 |
| Perfiles | 0 |
| Cuentas cliente | 0 |
| Categorias | 0 |
| Productos | 0 |
| Movimientos de inventario | 0 |
| Ingresos QB | 0 |
| Pedidos QB | 0 |
| Preparaciones/entregas | 0 |
| Recibos QB | 0 |
| Auditoria | 0 |
| Ventas/pagos/caja/CxC legacy | 0 |
| Dimensiones canonicas | 2 |
| Unidades canonicas | 5 |

Las cinco unidades son kg, libra, arroba, cuartilla y unidad.

## Run y manifiesto

- Run ID: `qb9_10_20260712_214722_256e2f6e`.
- Manifiesto: creado fuera del repositorio en `%TEMP%`.
- Secretos en manifiesto: ninguno.
- Usuarios registrados: 5.
- Filas registradas: 43.
- Orden inverso de limpieza: definido antes de crear usuarios.
- Limpieza SQL: transaccional, con conteo exacto por tabla/UUID antes de cada DELETE.
- `TRUNCATE`, comodines y rangos temporales: no usados.

## Usuarios ficticios

Se crearon mediante Admin Auth API, confirmados sin correo:

1. Administrador ficticio.
2. Inventario ficticio.
3. Cliente A ficticio.
4. Cliente B ficticio.
5. Usuario ficticio sin cuenta.

Las contrasenas aleatorias existieron solo en memoria. Los clientes externos no recibieron perfiles internos.

## Datos ficticios creados

- 2 perfiles internos;
- 2 cuentas cliente;
- 2 ubicaciones;
- 1 categoria;
- 1 unidad base legacy temporal;
- 5 productos: base, grande, mediana, pequena y merma;
- 5 configuraciones QB de producto;
- 1 presentacion carga = 112.5 kg;
- 2 unidades permitidas;
- 4 salidas de clasificacion;
- 1 ingreso, 1 linea y 1 snapshot;
- 4 resultados y 4 enlaces de movimientos de ingreso;
- 3 movimientos de inventario;
- 1 pedido, 1 item y 1 snapshot de pedido;
- 1 evento de auditoria.

Todos incorporaron el run ID o quedaron relacionados por UUID con filas del manifiesto.

## Resultados ejecutados

### RLS Cliente A/B

- Cliente A leyo su cuenta y ubicacion.
- Cliente A no leyo la cuenta ni ubicacion de Cliente B.
- Cliente A no obtuvo preparaciones, entregas ni recibos internos.
- Cliente A no pudo leer directamente `products`, `purchase_price` o `sale_price`.
- Cliente A no pudo leer configuracion QB interna.
- La prueba simetrica completa de pedidos A/B no se alcanzo por la parada temprana.

### Usuario sin customer_account

- Pudo consultar el catalogo publico.
- La prueba de creacion de pedido no se alcanzo.

### Administrador

- Creo parametrizacion y productos mediante sesion autenticada real.
- Creo y confirmo el ingreso QB-4.
- Consulto catalogo, stock y snapshots.
- El flujo posterior a pedido quedo detenido.

### Inventario

- Usuario y perfil creados correctamente.
- Preparacion, entrega y restricciones de recibo no se alcanzaron.

### Parametrizacion y productos

- kg y arroba cargaron con factores 1 y 11.25.
- Carga de papa quedo en 112.5 kg.
- Papa grande fue el unico producto visible y vendible en catalogo.
- Producto base y merma quedaron fuera del catalogo.
- El catalogo no retorno campos de precio, costo, total o factor.

### Ingreso 10 cargas

Resultado aprobado antes de la parada:

- 10 cargas = 1125 kg;
- Papa grande = 675 kg;
- Papa mediana = 225 kg;
- Papa pequena = 225 kg;
- producto base = 0 kg;
- producto merma = 0 kg;
- actor interno del snapshot correcto;
- doble confirmacion bloqueada;
- 3 movimientos de entrada y trazabilidad QB-4.

### Pedido e idempotencia

Resultado parcial aprobado:

- pedido Cliente A creado;
- 2 arrobas = 22.5 kg;
- snapshot con actor Auth cliente y sin perfil interno;
- stock permanecio en 675 kg;
- repeticion con la misma idempotency key retorno el pedido existente;
- ubicacion de Cliente B fue bloqueada;
- producto merma fue bloqueado por el backend.

La forma del bloqueo de merma fue un error RPC, no un `result_code`. Esa diferencia del arnes produjo la parada obligatoria.

## Resultados no ejecutados

Por la regla de primer error no se ejecutaron:

- pedido del usuario sin cuenta;
- pedido de Cliente B y aislamiento completo A/B;
- preparacion parcial de 1.5 arrobas;
- entrega y stock esperado 658.125 kg;
- doble entrega;
- recibo y factores 5/7/5/7;
- emision/anulacion;
- reportes y CSV;
- aplicacion local por rol;
- lint, TypeScript y build con variables temporales.

No se genero CSV y no se inicio un servidor Next.js.

## Primer error bloqueante

```text
attempt loss-product order: Producto no disponible en el catalogo QB.
```

Clasificacion: fallo del arnes de prueba al interpretar una denegacion valida. No se encontro evidencia de que el producto merma pudiera pedirse.

## Limpieza

La limpieza se ejecuto inmediatamente despues del error.

| Tabla | Filas eliminadas |
| --- | ---: |
| `audit_logs` | 1 |
| `customer_accounts` | 2 |
| `inventory_movements` | 3 |
| `product_categories` | 1 |
| `products` | 5 |
| `profiles` | 2 |
| `qb_conversion_snapshots` | 2 |
| `qb_customer_locations` | 2 |
| `qb_merchandise_receipt_classification_results` | 4 |
| `qb_merchandise_receipt_lines` | 1 |
| `qb_merchandise_receipt_movements` | 4 |
| `qb_merchandise_receipts` | 1 |
| `qb_order_items` | 1 |
| `qb_orders` | 1 |
| `qb_product_allowed_units` | 2 |
| `qb_product_classification_outputs` | 4 |
| `qb_product_presentations` | 1 |
| `qb_product_unit_settings` | 5 |
| `units_of_measure` | 1 |
| **Total** | **43** |

Usuarios Auth eliminados: 5/5.

Cada conteo fue comprobado antes del DELETE. Los 19 bloques se ejecutaron dentro de una sola transaccion y terminaron con `COMMIT`. Los usuarios Auth se eliminaron al final mediante Admin Auth API.

## Verificacion posterior

Los conteos finales coinciden con los iniciales:

- Auth users: 0;
- perfiles/cuentas: 0/0;
- categorias/unidades legacy/productos: 0/0/0;
- movimientos de inventario: 0;
- parametrizacion QB no canonica: 0;
- ingresos/pedidos/preparaciones/entregas/recibos: 0;
- snapshots/auditoria: 0/0;
- legacy financiero: 0;
- dimensiones/unidades canonicas: 2/5;
- residuos del run: ninguno;
- migraciones local/remoto: 14/14;
- dry-run final: `Remote database is up to date`.

## Confirmaciones de seguridad

- Migraciones nuevas o cambios de esquema: no.
- `db push`, `migration up`, `db reset` o seeds: no.
- Configuracion Auth modificada permanentemente: no.
- Usuarios ficticios restantes: ninguno.
- Secretos modificados o guardados: no.
- Claves impresas: no.
- `.env.local` modificado: no.
- Aplicacion desplegada: no.
- Produccion o proyectos legacy accedidos: no.
- Codigo operativo o migraciones modificados: no.
- Commit realizado: no.

## Riesgos pendientes

- El E2E integral no esta aprobado porque se detuvo antes de QB-6/QB-7/QB-8/UI.
- El arnes debe aceptar como resultado esperado tanto el `result_code` de rechazo como el error RPC canonico para pruebas negativas.
- La prueba corregida debe ejecutarse como un run nuevo, con nueva autorizacion y nuevo manifiesto; no debe reutilizarse este run.
- El timeout de cierre del dump de esquema no afecto el archivo obtenido, pero conviene aumentar el timeout en una proxima inspeccion.

## Recomendacion

Solicitar autorizacion para **QB-9.10.1**, limitada a corregir el arnes temporal fuera del repositorio y repetir desde cero el E2E completo con un nuevo run ID, manteniendo la misma limpieza transaccional. No preparar deploy hasta aprobar preparacion, entrega, recibos, reportes, UI, lint, TypeScript y build.
