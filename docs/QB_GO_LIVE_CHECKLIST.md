# QB Insumos — checklist de puesta en marcha

## Decisiones previas

- [ ] Confirmar por escrito cuál será el entorno operativo definitivo.
- [ ] Confirmar que Production corresponde a `https://qb-insumos.vercel.app` y
  que Auth usa exclusivamente el proyecto autorizado `tekfwbhvqtojpfqusosg`.
- [ ] Mantener bloqueado cualquier proyecto anterior o legacy.
- [ ] Confirmar responsable operativo, responsable técnico y ventana de salida.
- [ ] Tomar y verificar un respaldo recuperable antes de cargar datos reales.

## Datos maestros y activación

- [ ] Validar los 197 productos y las 10 categorías existentes.
- [ ] Importar precios reales aprobados; no completar valores por suposición.
- [ ] Importar conversiones reales aprobadas y revisar unidades/presentaciones.
- [ ] Registrar stock inicial mediante el flujo autorizado y conciliado.
- [ ] Conservar catálogo y configuración maestra durante la limpieza de pruebas.
- [ ] No iniciar pedidos reales hasta que precios, conversiones y stock estén
  aprobados por el responsable operativo.

## Usuarios y correo

- [ ] Completar `docs/QB_SMTP_RESEND_SETUP.md` sin compartir la API key.
- [ ] Verificar remitente, Site URL y Redirect URL exactos.
- [ ] Crear los usuarios reales con el rol mínimo necesario.
- [ ] Probar confirmación de correo en otro navegador.
- [ ] Probar recuperación, cambio de contraseña y segundo uso del enlace.
- [ ] Verificar que cliente externo use `customer_accounts` y personal interno
  use `profiles`, sin identidades duplicadas entre ambos modelos.

## Datos de prueba auditados

Auditoría read-only del 17 de julio de 2026, sin mostrar identidades:

| Clase | Resultado | Decisión |
| --- | --- | --- |
| A — acceso necesario para prueba | 3 identidades con marcador demo: 2 perfiles internos y 1 cuenta cliente | Conservar hasta aceptación del cliente |
| B — inequívocamente descartable | 0 candidatos con marcadores QA/test/prueba | No hay eliminación propuesta |
| C — ambiguo, no tocar | 5 identidades totales, 2 pedidos, 2 preparaciones, 4 movimientos y 1 recibo | Revisar con responsable antes de cualquier eliminación |
| D — maestro, conservar | 197 productos, 10 categorías, 5 unidades y 2 precios positivos configurados | Conservar |

También se observaron 3 cuentas cliente totales, 2 perfiles internos, 0 usuarios
sin confirmar y 0 lotes de importación operativa. Estos conteos no autorizan
eliminaciones. Toda limpieza posterior requiere lista explícita, respaldo y
aprobación del dueño de los datos.

## Prueba de roles

- [ ] Administrador: login, Configuración, Productos, Clientes y auditoría.
- [ ] Inventario: Ingresos, existencias, preparación y entrega según permisos.
- [ ] Cliente registrado: Mi cuenta, ubicación, carrito y pedido.
- [ ] Visitante: catálogo y checkout invitado, sin acceso interno.
- [ ] Confirmar que un usuario interno sin cuenta cliente no pueda pedir como
  invitado.

## Primer ciclo real controlado

- [ ] Crear el primer pedido real con responsable presente.
- [ ] Revisar cantidad, importe, ubicación y referencia antes de preparar.
- [ ] Preparar y registrar cualquier ajuste físico permitido.
- [ ] Confirmar la primera entrega y conciliar el movimiento de inventario.
- [ ] Crear, revisar y emitir el primer recibo con precios válidos.
- [ ] Descargar/compartir la versión de cliente y verificar que no exponga datos
  internos.
- [ ] Conciliar pedido, entrega, inventario y recibo antes de continuar el piloto.

## Monitoreo inicial

- [ ] Revisar diariamente errores de Vercel, Supabase Auth y Resend sin copiar
  secretos ni datos personales.
- [ ] Vigilar entregabilidad, spam, límites y rebotes del correo transaccional.
- [ ] Revisar pedidos atascados, entregas duplicadas, movimientos y recibos.
- [ ] Registrar incidentes con hora, pantalla y referencia no sensible.
- [ ] Definir criterio de pausa y restauración si falla autenticación, inventario
  o emisión de recibos.
- [ ] Programar la revisión y eliminación posterior de datos demo solo después de
  la aceptación, con respaldo y autorización específica.
