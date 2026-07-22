# QB Insumos — guía final de entrega y activación

Esta es la guía operativa canónica para `https://qb-insumos.vercel.app`. El
proyecto autorizado de Supabase es únicamente `tekfwbhvqtojpfqusosg`. No se
debe usar ningún proyecto anterior ni ejecutar `SUPABASE_SCHEMA.sql`.

## Acceso y roles

- **Administrador:** catálogo maestro, productos, unidades, presentaciones,
  fotografías, precios, modalidad por Bs, pedidos internos, ingresos,
  clasificación, recibos, usuarios, auditoría, activación operativa y control
  de stock.
- **Inventario:** consulta productos y reportes; gestiona ingresos,
  clasificación, checklist de preparación, guardado parcial, cantidades reales
  y entrega. No puede cambiar precios, relaciones de clasificación, usuarios ni
  configuración administrativa.
- **Cliente registrado:** Catálogo, Mi cuenta, ubicaciones, pedido y repetición
  de pedidos propios. No tiene acceso a módulos internos.
- **Invitado/visitante:** Catálogo y checkout invitado. Las rutas privadas
  requieren inicio de sesión y rol interno activo.

El personal inicia sesión en `/login`. Los clientes pueden iniciar sesión o
registrarse desde Catálogo/Mi cuenta. No se comparten cuentas entre personas.

## Productos, unidades, fotografías y precios

1. En **Productos**, el administrador crea o edita el producto.
2. Configura unidad base, unidad de inventario y unidad de precio.
3. Habilita las unidades o presentaciones válidas por contexto.
4. Sube una fotografía real en formato admitido y comprueba la miniatura.
5. Registra un precio base positivo y decide si el producto será visible y
   vendible. Los costos internos no forman parte del catálogo público.
6. La modalidad **Por Bs** se habilita solo cuando el producto, las unidades y
   el precio cumplen el contrato físico. El importe solicitado queda como
   referencia fija; inventario siempre usa la cantidad real.

## Pedidos, preparación, entrega y recibos

Los pedidos pueden originarse en el Catálogo, como invitado o cliente, o desde
**Pedidos → Nuevo pedido** por un administrador. Crear un pedido no modifica
stock.

1. Inventario abre el pedido e inicia la preparación.
2. Marca el checklist, registra la cantidad física real y guarda avances.
3. Confirma la preparación cuando todas las líneas estén revisadas.
4. Confirma la entrega una sola vez. Allí se crea el movimiento de salida con
   la cantidad real; los reintentos no deben descontar de nuevo.
5. En **Recibos**, el administrador agrupa pedidos entregados, resuelve precios
   pendientes, revisa la versión para cliente y emite el recibo.

El recibo no es factura fiscal ni registra pagos, caja o cuentas por cobrar.

## Ingresos y recepción clasificada

En **Ingresos**, administrador e inventario registran la mercadería recibida
con una unidad o presentación configurada. Si el producto exige clasificación,
el borrador debe distribuir el 100 % entre resultados válidos antes de
confirmar. Al confirmar, el producto fuente no recibe stock; solo los resultados
válidos generan movimientos. Las relaciones de clasificación solo las cambia
un administrador desde Productos.

Para **PAPA HOLANDESA**, seleccionar `Carga` y comprobar antes de crear el
borrador que la interfaz muestra `1 carga = 112,5 kg`. En la prueba de una carga,
0/60/40 debe producir 0 kg, 67,5 kg y 45 kg. En la prueba de diez cargas,
20/30/50 debe producir 225 kg, 337,5 kg y 562,5 kg. En ambos casos el total debe
conservarse exactamente y el producto fuente no debe acumular stock.

## Stock provisional e inventario de apertura

El piloto opera con control estricto desactivado hasta que los saldos sean
confiables. En ese modo una entrega puede producir saldo negativo, pero siempre
deja movimiento y trazabilidad.

Para el inventario de apertura:

1. Contar el stock físico y acordar una única fecha de corte.
2. Descargar la plantilla desde **Configuración → Activación operativa**.
3. Completar solo `initial_quantity` y `cutoff_date`; no editar IDs, nombres,
   unidades ni saldo informativo.
4. Subir el CSV y revisar toda la vista previa. No se escribe nada en esta fase.
5. Aplicar solo con cantidades aprobadas y la confirmación `APLICAR`.
6. Verificar el Ingreso de apertura, snapshots, movimientos y saldos.
7. Corregir diferencias mediante un nuevo movimiento/ingreso trazable con
   motivo explícito; nunca editar `stock_current` directamente.
8. Resolver negativos y recién después activar el control estricto con la
   confirmación administrativa solicitada.

El flujo conserva fecha de corte, unidad base, conversión, hash del archivo,
actor y movimientos. Funciona mientras el control estricto está desactivado.

## Usuarios reales y recuperación de contraseña

El primer administrador se crea desde Supabase Dashboard mediante invitación y
se vincula una sola vez a un perfil interno `administrador`, siguiendo el
procedimiento de bootstrap revisado. Los siguientes usuarios se crean desde
**Configuración → Invitar usuario**. La aplicación no genera ni muestra
contraseñas temporales: cada persona recibe un enlace y define su propia clave.

Para recuperar acceso, usar `/mi-cuenta/recuperar`. La respuesta es neutral y no
revela si el correo existe. El enlace conduce a
`/mi-cuenta/restablecer`, vence y no debe poder reutilizarse. Al cambiar la
contraseña, la sesión de recuperación se cierra y el usuario vuelve a `/login`.

La configuración externa exacta de SMTP, remitente, Site URL, Redirect URL y
plantillas está en [QB_SMTP_RESEND_SETUP.md](QB_SMTP_RESEND_SETUP.md). Nunca
copiar credenciales SMTP a documentos, capturas, chats o tickets.

## Activación definitiva

Antes de operar en modo definitivo:

1. Confirmar backup recuperable y responsables de salida.
2. Aprobar catálogo, unidades, conversiones, fotografías y precios reales.
3. Completar y conciliar inventario de apertura.
4. Probar administrador, inventario, cliente registrado, invitado y visitante.
5. Probar invitación, recuperación, token usado/vencido y login posterior.
6. Revisar saldos negativos, pedidos pendientes, ingresos y recibos.
7. Ejecutar la vista previa de limpieza y obtener autorización por lista exacta.
8. Confirmar cero candidatos ambiguos antes de cualquier limpieza.
9. Realizar un primer ciclo real acompañado: pedido, preparación, entrega,
   movimiento y recibo.
10. Activar control estricto solo cuando el responsable apruebe los saldos.

## Soporte

Registrar incidentes con fecha/hora, pantalla, rol y referencia no sensible.
No adjuntar contraseñas, tokens, cookies, correos completos ni datos privados.
Revisar primero Vercel, Supabase Auth y la bitácora de QB Insumos. Si el incidente
puede duplicar movimientos o afectar autenticación, pausar el paso operativo y
escalar al responsable técnico antes de reintentar.
