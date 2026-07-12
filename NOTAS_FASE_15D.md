# NOTAS FASE 15D

## Alcance

Se implemento el flujo:

1. revisar pedido `pendiente_revision`;
2. corregir contacto y entrega;
3. vincular cliente existente;
4. liberar a `en_preparacion`;
5. registrar cantidades reales, parciales y faltantes;
6. dejarlo `listo_para_confirmar`;
7. ajustar precio final con motivo auditado si corresponde;
8. emitir resumen versionado;
9. confirmar desde enlace o manualmente;
10. pasar a `confirmado_cliente`.

`confirmado_cliente` no crea venta, no descuenta stock, no registra caja, pagos ni cuentas.

## Tokens

- Se generan 32 bytes aleatorios.
- La base guarda solo SHA-256 hexadecimal.
- El enlace usa `/pedido/confirmar#TOKEN`.
- El fragmento no se envia al servidor en la URL ni aparece en logs HTTP.
- El navegador lo conserva temporalmente en `sessionStorage` y lo retira de la barra.
- Expira en 72 horas.
- Es revocable y de un solo uso para confirmar.
- Doble confirmacion devuelve estado idempotente sin duplicar eventos.

El token y su hash no se escriben en auditoria ni eventos.

## Versiones

Cada cambio relevante en estado de item, cantidad real, motivo, precio o subtotal incrementa
`quote_version` y revoca enlaces activos. Editar contacto o condiciones durante revision tambien
incrementa version.

El resumen guarda un snapshot congelado con:

- referencia y nombre limitado;
- entrega y direccion parcialmente protegida;
- cantidades solicitadas y reales;
- faltantes y motivos;
- precio final, subtotales y total;
- horario, pago esperado y observaciones.

## Permisos

- `administrador` y `ventas`: revision, cliente, preparacion, precio, emision, revocacion y
  confirmacion manual.
- La preparacion sigue siendo una etapa del rol ventas definido en Fase 13; no se creo otro rol.
- `inventario` y `finanzas`: sin acceso a `/pedidos` ni a RPCs de Fase 15D.
- Visitante: sin SELECT o mutaciones directas; solo Server Actions con RPC `service_role`.

## Compatibilidad

Pedidos internos de Fase 13 conservan su confirmacion y creacion de venta. La RPC
`confirm_prepared_order` bloquea explicitamente pedidos `catalogo_invitado`; su venta definitiva
queda para Fase 15F.

## SQL

Pendiente de aplicar en staging despues de Fase 15C:

`SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql`

No se ejecuto SQL remoto.
