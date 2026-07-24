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
emitido. Administrador, Inventario y Entregador pueden reabrir sin límite
temporal; siempre deben indicar el motivo y queda auditado.

El orden se guarda atómicamente por fecha. Pedidos repetidos del mismo cliente
se distinguen por referencia y ubicación.

## Inventario

Cada cliente conserva las tres columnas de la hoja anterior: **CANT, CHECK y
OBSERVACIÓN**. En esta etapa CANT registra lo preparado, CHECK es el control de
bodega y OBSERVACIÓN guarda la nota. Un faltante admite cero o preparación
parcial. Finalizar preparación exige revisar todas las líneas. Inventario no
puede escribir entrega, precios, stock o configuración, aunque manipule el
payload.

## Entregador

También trabaja con **CANT, CHECK y OBSERVACIÓN**. CANT registra la cantidad
real entregada. Si supera lo preparado, el sistema conserva internamente como
externo la diferencia necesaria; CHECK y OBSERVACIÓN pertenecen a la entrega.
Entregar más o menos está permitido, pero la observación es obligatoria si
entregado difiere de solicitado. No puede editar preparación, precios, stock o
configuración.

## Estado visual, totales y móvil

La pantalla acompaña color con texto e iconos: completo, con diferencia o
pendiente. Los totales del extremo derecho conservan solicitado, preparado,
externo y entregado aunque esas magnitudes no se conviertan en columnas
visibles. Cada cliente muestra conteos de líneas y checks.

Escritorio y móvil renderizan la misma matriz continua: categorías como filas
separadoras, productos en filas y todos los clientes agrupados horizontalmente.
Las columnas N°, DESCRIPCIÓN y UD, además de las cabeceras, permanecen visibles
durante el desplazamiento. En celular no existe selector ni filtrado de
clientes; cada grupo tiene exactamente CANT, CHECK y OBSERVACIÓN. El
desplazamiento horizontal táctil recorre todos los grupos y llega a los totales
del extremo derecho. Un cliente enfocado sólo se resalta y recibe auto-scroll.
Todos los anchos usan las mismas RPC y auditoría.

Los pedidos por cantidad avanzan temporalmente en incrementos de 0,5 para todos
los productos. Los pedidos por importe en Bs conservan precisión monetaria y la
equivalencia real puede tener más decimales.

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
del cliente muestra únicamente marca/logo, nombre del cliente, fecha de
entrega, productos, cantidad, precio final y total. Oculta contacto, periodo
administrativo, factores, notas internas, subtotal administrativo y código
interno. Un recibo emitido no se recalcula.

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
