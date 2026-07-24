# QB Insumos — Matriz operativa

La **Matriz operativa** (`/matriz-operativa`) concentra el trabajo diario sin
reemplazar todavía **Pedidos**. PostgreSQL/Supabase es la única fuente de verdad:
no existe sincronización ni lectura de Google Sheets.

## Conceptos que nunca deben mezclarse

| Dato | Quién lo registra | Significado | Efecto en stock |
| --- | --- | --- | --- |
| Solicitado | Cliente; corrección versionada del Administrador | Última cantidad aceptada del pedido | Ninguno |
| Preparado | Inventario o Administrador | Producto separado desde bodega | Se descuenta al confirmar entrega |
| Externo | Entregador o Administrador | Producto conseguido fuera de bodega | Ninguno |
| Entregado | Entregador o Administrador | Cantidad que recibió realmente el cliente | Alimenta el recibo |

Los checks también son independientes. **Preparado en bodega** no confirma
entrega. **Entrega verificada** no cambia lo solicitado ni lo preparado.

## Administrador

Puede alternar Pedido, Preparación, Entrega y Resumen; ordenar clientes por
fecha; corregir solicitado con motivo; consultar diferencias, actores y horas;
finalizar preparación; confirmar o reabrir una entrega con motivo. La
reapertura no revierte stock automáticamente y se rechaza si existe un recibo
emitido.

El orden se guarda atómicamente por fecha. Pedidos repetidos del mismo cliente
se distinguen por referencia y ubicación.

## Inventario

Ve solicitado, escribe preparado, observa el faltante, marca el check de bodega
y deja una nota. Un faltante admite cero o preparación parcial. Finalizar
preparación exige revisar todas las líneas. Inventario no puede escribir externo
o entregado ni confirmar entrega, aunque manipule el payload.

## Entregador

Ve solicitado, snapshot de bodega y faltante. Escribe externo, entregado real,
check y observación; luego confirma. Entregar más o menos está permitido, pero
la observación es obligatoria si entregado difiere de solicitado. No puede
editar preparación, precios, stock o configuración.

## Estado visual, totales y móvil

La pantalla acompaña color con texto e iconos: completo, con diferencia o
pendiente. Los totales del extremo derecho separan solicitado, preparado,
externo, entregado y diferencia por producto/unidad. Cada cliente muestra
conteos de líneas solicitadas, preparadas, entregadas y pendientes.

Escritorio y móvil renderizan la misma matriz continua: categorías como filas
separadoras, productos en filas y todos los clientes agrupados horizontalmente.
Las columnas N°, DESCRIPCIÓN y UD, además de las cabeceras, permanecen visibles
durante el desplazamiento. En celular no existe selector ni filtrado de
clientes; el desplazamiento horizontal táctil recorre todos los grupos y llega
a los totales del extremo derecho. Un cliente enfocado sólo se resalta y recibe
auto-scroll. Todos los anchos usan las mismas RPC y auditoría.

## Guardado, conflictos y Realtime

Cada escritura envía versión esperada e idempotency key. La RPC bloquea la fila,
valida el rol y registra old/new en la misma transacción. Un conflicto nunca
sobrescribe silenciosamente: la interfaz avisa y vuelve a consultar el servidor.
Realtime sólo notifica; su payload no se usa como verdad. Si hay una edición
local, se muestra **Cambios remotos** y se protege la salida accidental.

## Stock y entrega

Guardar o finalizar preparación no descuenta stock. Confirmar entrega descuenta
una sola vez el snapshot preparado en bodega. Externo nunca crea una entrada ni
una salida. Si se entregó menos que lo sacado de bodega, no se restaura la
diferencia: una devolución futura requiere un movimiento explícito.

## Recibos

Los recibos nuevos toman la cantidad realmente entregada. Cada factor interno
(Distancia, Exigencia, Clima y Extraordinario) está desactivado o vale 5%; se
suman sobre el subtotal y nunca se componen. El snapshot interno conserva
subtotal, selección, porcentaje total, recargo, total, actor y fecha. La vista
del cliente oculta factores, subtotal administrativo y código interno. Un
recibo emitido no se recalcula.

## Guía de prueba para el cliente

1. Ingresar como Inventario, elegir hoy y abrir un cliente.
2. Registrar una línea completa y otra parcial; comprobar faltante y checks
   independientes.
3. Finalizar preparación.
4. Ingresar como Entregador en un celular; comprobar que aparece el cambio.
5. En la línea parcial registrar externo. Escribir entregado real.
6. Si entregado difiere de solicitado, dejar motivo y marcar entrega.
7. Confirmar. Verificar que sólo bodega disminuyó stock.
8. Como Administrador revisar Resumen, auditoría, orden persistido y generar un
   borrador de recibo.
9. Activar tres factores: el total debe ser subtotal + 15%.
10. Abrir la vista compartida: no debe mostrar factores, subtotal de recargo ni
    código interno.

No usar pedidos reales para una prueba destructiva. La aceptación automatizada
usa fixtures sintéticos dentro de una transacción con rollback.

## Fases posteriores

- ingresos masivos tipo Excel;
- visualización horizontal de históricos;
- migración final y controlada desde el archivo exportado de Sheets;
- rutas/GPS, proveedores y costos externos sólo en fases expresamente aprobadas.
