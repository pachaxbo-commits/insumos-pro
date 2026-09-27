# Flujo E2E para entender y probar QB Insumos

Objetivo: comprender el sistema siguiendo una operación completa sin mezclar
los conceptos de pedido, preparación, entrega, stock y recibo.

Ejecutar en Supabase local o staging autorizado con datos sintéticos. No usar
pedidos, clientes ni inventario reales de Production.

## 1. Actores de prueba

Preparar una cuenta independiente para cada rol:

| Actor | Rol | Qué valida |
| --- | --- | --- |
| Admin QA | `administrador` | productos, clientes, pedidos, matriz y recibos |
| Bodega QA | `inventario` | preparación en la matriz |
| Reparto QA | `entregador` | cantidad entregada y confirmación de entrega |
| Cliente QA | cliente externo | catálogo, checkout, ubicaciones y pedidos propios |
| Invitado | sin sesión | catálogo y checkout invitado |

No reutilizar la misma sesión en varias pestañas para distintos roles. Usar
perfiles de navegador separados o cerrar sesión entre pasos.

## 2. Preparar catálogo y producto

Como Admin QA:

1. Abrir `/parametrizacion` y confirmar unidad base/presentaciones necesarias.
2. Abrir `/productos` y crear o seleccionar un producto sintético.
3. Confirmar que esté activo, vendible y visible en catálogo.
4. Configurar unidad base, unidad de inventario y unidad de precio.
5. Registrar un precio base positivo.
6. Habilitar **Por Bs** sólo si se probará ese modo y las conversiones son
   coherentes.
7. Si se carga imagen, usar JPEG/PNG/WebP sintético y verificar Storage.
8. Abrir `/catalogo` sin sesión y confirmar que no se expongan costo, stock
   exacto, proveedor, margen ni SKU interno.

Resultado esperado: el producto puede pedirse, pero todavía no cambió stock.

## 3. Crear el pedido

### Variante cliente registrado

1. Abrir `/registro` y crear Cliente QA, o usar una cuenta ya preparada.
2. Confirmar correo si el entorno lo exige.
3. En `/mi-cuenta`, registrar una ubicación manual; Maps es opcional.
4. Abrir `/catalogo`, agregar el producto y pasar a `/catalogo/checkout`.
5. Enviar el pedido y guardar su referencia.
6. En `/mi-cuenta`, confirmar que sólo aparezcan los pedidos propios.

### Variante invitado

1. Abrir `/catalogo` sin sesión.
2. Agregar el producto y completar checkout con datos sintéticos.
3. Confirmar que se crea en `pendiente_revision`.
4. Verificar que no se cree venta, no se reserve stock y no se expongan datos
   internos.

### Variante pedido interno

Como Admin QA abrir `/pedidos` y usar **Nuevo pedido**. Esta variante permite
probar pedido físico y, si está habilitado, pedido por importe en Bs.

Resultado esperado en todas las variantes: existe un pedido; inventario, caja,
CxC y recibos siguen sin cambios.

## 4. Generar la hoja de mercado

Como Admin QA:

1. Abrir `/matriz-operativa` para la fecha elegida.
2. Entrar en **Hoja para comprar en el mercado**.
3. Confirmar productos en filas, clientes en columnas y totales.
4. Verificar que **LÍNEAS PEDIDAS** sume las columnas de cada cliente.
5. Si un producto se repite en varios pedidos del mismo cliente, confirmar que
   se acumule sin mezclar unidades incompatibles.
6. Descargar el Excel y abrirlo.

Resultado esperado: la hoja representa lo solicitado antes de preparación y
entrega y puede compartirse entre compradores.

## 5. Revisar y preparar

Como Admin QA:

1. Abrir `/pedidos`.
2. Si el pedido es invitado, vincularlo a un cliente interno antes de preparar.
3. Revisar contacto, ubicación, modalidad y cantidades solicitadas.

Como Bodega QA:

1. Abrir `/matriz-operativa` y seleccionar la fecha del pedido.
2. En Preparación, comprobar que **CANT** corresponde a solicitado y no se
   edita allí.
3. Marcar **CHECK** para una línea completa.
4. Si el producto controla peso real, registrar **PESO REAL**; si no, debe
   mostrarse un guion.
5. Guardar una observación sintética.
6. Dejar otra línea parcial si se quiere comprobar faltantes.
7. Salir del campo y esperar el mensaje de guardado. La versión actual guarda
   por línea y no tiene un botón separado de “Finalizar preparación”.

Resultado esperado: el pedido refleja preparación, pero el stock aún no se
descuenta. Preparado no equivale a entregado.

## 6. Entregar

Como Reparto QA, idealmente desde viewport móvil:

1. Abrir `/matriz-operativa` en la misma fecha.
2. Confirmar que ve los cambios de Bodega QA mediante actualización/Realtime.
3. En Entrega, registrar **CANT**, **CHECK**, peso real y observación según el
   escenario.
4. Si bodega preparó menos, registrar el faltante como externo cuando aplique.
5. Si entregado difiere de solicitado, dejar motivo.
6. Confirmar la entrega una sola vez.
7. Reintentar la misma confirmación sólo para validar idempotencia: no debe
   duplicar movimientos.

Resultado esperado:

- sólo la cantidad preparada en bodega descuenta stock;
- externo no mueve stock;
- entregado real queda separado y alimentará el recibo;
- la operación conserva actor, hora, versión y auditoría.

## 7. Verificar el movimiento de inventario

La ruta legacy `/inventario` está pausada en la transición actual. En local o
staging, verificar con una consulta de sólo lectura o con la prueba de contrato
correspondiente:

1. Buscar el producto y la referencia de la entrega.
2. Confirmar un único movimiento de salida por la preparación entregada.
3. Verificar que el reintento no duplicó la salida.
4. En modo provisional puede existir saldo negativo; en control estricto una
   entrega insuficiente debe bloquearse.

Para regularizar, usar un ingreso o movimiento trazable. Nunca editar
`stock_current` en SQL.

## 8. Generar recibo

Como Admin QA:

1. Abrir `/recibos`.
2. Confirmar que el pedido entregado aparece como elegible.
3. Crear borrador y comprobar que usa entregado real.
4. Si se prueban factores, activar tres factores de 5 %: el total debe ser
   subtotal + 15 %, no composición sucesiva.
5. Resolver precios pendientes antes de emitir.
6. Emitir el recibo y abrir su vista de cliente.
7. Confirmar que la vista pública oculta factores, subtotal administrativo,
   notas internas, contacto sensible y código interno.

Resultado esperado: el recibo queda congelado y no se recalcula. No crea pago,
caja ni cuenta por cobrar y no equivale a factura fiscal.

## 9. Capacidades pausadas que no pertenecen a esta aceptación

No intentar completar la prueba vigente entrando manualmente a Ingresos,
Inventario legacy, Compras, Ventas, Proveedores, Finanzas, Reportes o
Configuración general. Esas rutas conservan código histórico o de soporte, pero
el guard actual no las concede a los roles del piloto. Cualquier reactivación
requiere una tarea separada, revisión de RLS/RPC y matriz de permisos.

## 10. Probar cuenta y recuperación

1. Desde `/mi-cuenta/recuperar`, solicitar recuperación para un correo de QA.
2. Confirmar que la respuesta no revela si la cuenta existe.
3. Abrir el enlace recibido y verificar paso por
   `/mi-cuenta/auth/confirm` hacia `/mi-cuenta/restablecer`.
4. Cambiar contraseña y comprobar que la sesión de recuperación se cierre.
5. Probar enlace vencido, inválido y ya utilizado.
6. Confirmar que el retorno externo quede bloqueado.

Esta prueba sólo valida entrega real si SMTP está configurado. Seguir
`docs/QB_SMTP_RESEND_SETUP.md` sin copiar credenciales.

## 11. Probar roles y aislamiento

- Invitado no abre rutas internas.
- Cliente sólo ve su cuenta, ubicaciones y pedidos.
- Inventario sólo abre su preparación en la matriz; no cambia entrega, precios,
  roles ni configuración.
- Entregador no cambia preparación, precios, stock ni configuración.
- Administrador gestiona producto, clientes, pedidos, todas las etapas de la
  matriz y recibos. La UI de usuarios no está montada actualmente.
- Ventas y Finanzas quedan sin espacio operativo en esta transición.
- Manipular el payload no debe superar Server Actions, RLS o RPC.
- Desactivar una cuenta interna debe revocar acceso sin borrar historial.
- No debe ser posible desactivar/cambiar el propio rol ni eliminar el último
  administrador activo.

## 12. Activación operativa y control estricto

Flujo peligroso; ejecutar sólo en local/staging:

1. Como Admin QA abrir directamente `/configuracion/activacion-operativa`; la
   herramienta no aparece en el menú actual.
2. Descargar la plantilla generada.
3. Completar cantidades sintéticas y fecha de corte.
4. Subir y revisar errores por fila sin aplicar.
5. Aplicar con la frase `APLICAR`.
6. Confirmar snapshot, hash, actor y movimientos.
7. Reintentar el mismo archivo: debe bloquear hash duplicado.
8. Revisar negativos, unidades y stock inicial.
9. Activar control estricto sólo con la frase requerida.
10. Intentar entregar más que el saldo: debe bloquearse sin movimiento parcial.

No activar control estricto ni aplicar una apertura durante una demostración en
Production.

## 13. Pruebas automatizadas antes del PR

```powershell
npm run lint
npm run build
npm run test:matrix
npm run test:matrix-units
npm run test:delivery-polish
npm run test:receipt-calculations
npm run test:main-flow
npm run test:receipt-market
```

Además, ejecutar las pruebas específicas en `scripts/` y `supabase/tests/` del
dominio modificado. En el PR registrar:

- entorno usado;
- comandos y resultados;
- roles probados;
- referencias de datos sintéticos;
- capturas sin datos sensibles;
- pruebas no ejecutadas y motivo.

## 14. Criterio de éxito del recorrido

Al finalizar, el desarrollador debe poder explicar y demostrar esta secuencia:

`producto → pedido → preparación → entrega → movimiento de stock → recibo`

y también por qué son incorrectas estas equivalencias:

- pedido = venta;
- preparado = entregado;
- externo = entrada de inventario;
- recibo = pago o factura;
- control oculto en UI = permiso seguro.
