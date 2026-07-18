# QB-17: pedidos por importe en bolivianos

## Dos formas de solicitar

- **Por cantidad** conserva el flujo histórico: el cliente elige una unidad física y una cantidad.
- **Por importe en Bs** conserva el importe objetivo y el servidor calcula una cantidad física estimada.

BS es una modalidad comercial, no una unidad de medida. Nunca se crea una unidad BS ni se descuenta un importe monetario del inventario.

## Elegibilidad

La opción por importe aparece únicamente cuando el catálogo maestro respalda la modalidad BS, el producto tiene una unidad física de precio permitida y el administrador configuró un precio base positivo. La interfaz pública recibe solo el indicador de disponibilidad; no recibe el precio ni el factor internos.

Al incorporar QB-17, los 31 productos publicados respaldados por BS tenían unidad de precio, pero ninguno tenía precio positivo. Por ello la función queda segura e inactiva hasta que se registren precios reales. Los otros 28 productos con BS siguen pendientes de configuración física o incorporación al catálogo.

## Conversión y redondeo

Para una línea monetaria, el servidor calcula:

1. `importe solicitado / precio por unidad de precio`;
2. redondeo decimal de la cantidad estimada a 3 decimales;
3. conversión a la unidad base mediante el factor vigente;
4. redondeo de la cantidad base a 6 decimales.

PostgreSQL `numeric` realiza el cálculo; JavaScript no determina precio, factor ni cantidad base. Se rechazan importes con más de dos decimales, importes no positivos, precios nulos o no positivos y resultados que redondeen a cero. La versión del cálculo es `qb17-v1` y la política congelada es `round_half_away_from_zero_pricing_3_base_6`.

## Snapshots y trazabilidad

La línea pública conserva:

- modo de solicitud;
- importe BOB original;
- cantidad física estimada en la unidad de precio;
- cantidad física estimada en unidad base.

Una tabla del esquema privado conserva unidad de precio, precio base, factor, moneda, política de redondeo y versión. No concede lectura a `anon` ni `authenticated`.

## Preparación, entrega y recibos

Preparación muestra el importe original como referencia y permite registrar la cantidad física real. Crear y preparar no cambia stock. Confirmar entrega descuenta únicamente la cantidad base realmente preparada, con la protección existente contra doble descuento.

El recibo acumulativo continúa calculándose con la cantidad real entregada y el precio final aplicable al recibo. El importe original no fuerza el subtotal final. Las exportaciones del cliente no muestran el snapshot interno de precio ni el factor.

## Repetir un pedido

Una línea por cantidad se carga nuevamente como cantidad. Una línea por importe conserva el importe original y queda editable. Al enviarla con una nueva clave de idempotencia, el servidor recalcula la estimación con el precio vigente y guarda un snapshot nuevo; no reutiliza el precio histórico.

## Errores esperados

La solicitud se rechaza profesionalmente cuando el importe es inválido, el producto dejó de estar habilitado, falta un precio positivo o la unidad física de precio dejó de estar disponible. El carrito se conserva para corregirlo. Ningún mensaje público incluye SQL, nombres de tablas, precio interno, factores o secretos.
