# QB Insumos — guía final de entrega y activación

Documento operativo canónico para [Production](https://qb-insumos.vercel.app).
El único proyecto Supabase autorizado es `tekfwbhvqtojpfqusosg`. No usar
proyectos anteriores ni ejecutar `SUPABASE_SCHEMA.sql`.

## Convenciones de seguridad

- **Cotidiano:** operación normal después de la capacitación.
- **Configuración inicial:** se completa una vez con información aprobada.
- **Solo administrador:** cambia catálogo, seguridad o configuración global.
- **Inventario:** operación física de pedidos, ingresos y existencias.
- **Peligroso:** requiere respaldo, revisión y autorización expresa; puede
  afectar acceso o saldos. No se ejecuta durante una demostración.

## Acceso y roles

El personal usa `/login`. Cada persona debe tener su propia cuenta.

| Rol | Acceso permitido | Acceso denegado relevante |
| --- | --- | --- |
| Administrador | Inicio, Productos, Parametrización, Configuración, precios, fotografías, Pedidos, Ingresos, Inventario, Recibos, clasificación, usuarios y control de stock | Ningún módulo interno fuera de las restricciones del servidor |
| Inventario | Inicio, Pedidos, Matriz operativa (preparado/check de bodega), Ingresos e Inventario | Entrega final, externo, Productos, Parametrización, Configuración, precios, modalidad Bs, roles, Recibos y control estricto |
| Entregador | Inicio y Matriz operativa (externo, entregado real, check y confirmación) | Solicitado, preparación, precios, stock y configuración |
| Cliente registrado | Catálogo, Mi cuenta, ubicaciones, pedidos propios y repetir pedido | Toda ruta interna |
| Invitado | Catálogo y checkout invitado | Cuenta y rutas internas |
| Anónimo | Catálogo y login | Datos internos y escrituras administrativas |

Los guards de ruta, Server Actions, RLS y RPC vuelven a validar permisos. Ocultar
un enlace en la navegación no sustituye esas validaciones.

## Matriz operativa

La operación diaria nueva está en **Matriz operativa** y convive con
**Pedidos** durante la validación. Solicitado, preparado en bodega,
abastecimiento externo y entregado real son datos separados. Los checks de
bodega y entrega no se sustituyen entre sí. El recibo usa únicamente entregado
real; el stock usa únicamente preparado en bodega. Procedimiento, conflictos,
Realtime, móvil y prueba del cliente:
[QB_MATRIZ_OPERATIVA.md](QB_MATRIZ_OPERATIVA.md).

## Productos, unidades, presentaciones, fotografías y precios

**Configuración inicial — solo administrador:** abrir **Productos** y crear o
editar el producto. Configurar unidad base, unidad de inventario y unidad de
precio; después habilitar unidades o presentaciones por contexto.

Una presentación representa un empaque real, por ejemplo Caja, Saco o Carga, y
debe tener una equivalencia aprobada hacia la unidad base. No duplicar una
presentación para habilitarla en otro contexto.

Subir únicamente fotografías JPEG, PNG o WebP reales. El precio base debe ser
positivo y corresponder a su unidad. Habilitar **Por Bs** solo cuando producto,
precio y conversiones estén revisados. Los costos internos y el precio base no
se exponen en el catálogo público.

## Pedidos físicos y por Bs

**Cotidiano:** el cliente registrado o invitado crea pedidos desde Catálogo. Un
administrador también puede usar **Pedidos → Nuevo pedido**. Crear o preparar un
pedido no modifica stock.

- Pedido físico: conserva cantidad y unidad solicitadas.
- Pedido por Bs: conserva el importe exacto y una cantidad física estimada.
- Inventario registra la cantidad realmente preparada.
- La entrega descuenta únicamente la cantidad real.
- Un producto sin modalidad Bs rechaza un payload manipulado en el servidor.

## Preparación, entrega y recibos

**Inventario:** abrir el pedido, iniciar la preparación, completar checklist y
cantidades reales, guardar avances y confirmar preparación. Confirmar entrega
una sola vez; los reintentos no deben duplicar movimientos.

**Solo administrador:** en **Recibos**, agrupar pedidos entregados, resolver
precios pendientes, revisar la versión para cliente y emitir. El importe de un
pedido por Bs permanece fijo. El recibo no es factura fiscal ni registra pagos,
caja o cuentas por cobrar.

## Ingresos directos y recepción clasificada

**Administrador e Inventario:** en **Ingresos**, seleccionar producto, unidad o
presentación y cantidad positiva. Referencia, origen, costo y notas son
informativos u opcionales según se indica en pantalla. El botón muestra los
campos faltantes, bloquea doble envío y limpia el formulario solo después de un
éxito confirmado.

Un ingreso directo incrementa únicamente el producto recibido. Si el producto
requiere clasificación, el borrador debe distribuir exactamente 100 % entre
resultados activos. Se permite 0 %; no se permite merma en este contrato. Al
confirmar, el producto fuente no recibe stock y la cantidad total se conserva a
seis decimales.

## PAPA HOLANDESA

**Demostración, no confirmar sin mercadería real:** seleccionar **PAPA
HOLANDESA**, luego `Carga — 1 carga = 112,5 kg` e ingresar una carga. Crear el
borrador y distribuir Pequeña 0 %, Mediana 60 % y Grande 40 %. La vista previa
debe mostrar 0 kg, 67,5 kg y 45 kg, total 112,5 kg.

La configuración prevista es fuente no vendible/no publicada, base kg,
clasificación porcentual variable, una Carga de 10 arrobas, 11,25 kg por arroba,
sin merma y sin stock en la fuente. Las relaciones Grande, Mediana y Pequeña se
administran únicamente desde Productos.

## Stock provisional

El piloto opera con control estricto desactivado. Las entregas registran
movimientos y pueden producir saldo negativo; esos saldos deben regularizarse
antes de la activación definitiva.

## Inventario de apertura

**Configuración inicial — solo administrador:** acordar una fecha de corte y
descargar la plantilla generada desde **Configuración → Activación operativa**.
La plantilla ya contiene el identificador interno, nombre, unidad base y saldo
informativo. El cliente sólo completa `initial_quantity`, `cutoff_date` y
`notes`; no debe editar columnas informativas ni identificadores.

Flujo verificado:

1. Descargar la plantilla vigente, generada desde Production.
2. Completar cantidad positiva en unidad base y fecha `AAAA-MM-DD`.
3. Subir el CSV y revisar errores, duplicados, desconocidos y ambiguos por fila.
4. Confirmar conversión y cantidad base en la vista previa, que no escribe.
5. Aplicar únicamente con aprobación y la frase `APLICAR`.
6. Verificar ingreso de apertura, snapshot, actor, hash y movimientos.
7. Un mismo hash no puede aplicarse dos veces.
8. Corregir errores mediante un movimiento o ingreso trazable; nunca editar
   `stock_current` directamente.

Ejemplos ilustrativos, no datos reales: `25 kg`, `12 unidad`, `5 caja`, `2 saco`
o `1 carga` solo cuando esas unidades/presentaciones ya estén configuradas. Los
productos clasificados se cargan como resultados finales. PAPA HOLANDESA fuente
no recibe apertura si el conteo corresponde a Grande, Mediana y Pequeña.

## Control estricto

**Peligroso — solo administrador:** no activar hasta completar conteo inicial,
apertura, negativos, unidades, conversiones, prueba por roles y aceptación del
cliente. La activación exige `ACTIVAR CONTROL ESTRICTO`, registra actor y fecha,
no borra movimientos ni reinicia saldos y bloquea entregas insuficientes. Los
pedidos existentes conservan su contrato; la disponibilidad se valida al
entregar.

## Recuperación de contraseña

Desde `/mi-cuenta/recuperar`, la respuesta es neutral y no revela si existe la
cuenta. El correo debe dirigir a `/mi-cuenta/auth/confirm` con `token_hash` y
tipo `recovery`; una verificación válida abre `/mi-cuenta/restablecer`. Después
del cambio, la sesión de recuperación se cierra y se vuelve a `/login`.

El código cubre enlaces inválidos, usados o vencidos y bloquea retornos externos.
La entrega real, límites de envío, expiración y login posterior deben probarse
manualmente después de configurar SMTP. Véase
[QB_SMTP_RESEND_SETUP.md](QB_SMTP_RESEND_SETUP.md).

## Gestión de usuarios

**Solo administrador:** existe interfaz en **Configuración → Usuarios** para
invitar, asignar rol, activar/desactivar y restablecer acceso. `profiles` actúa
como membresía interna: contiene rol y estado. Los clientes externos usan
`customer_accounts` y nunca reciben rol interno.

No se crean ni comparten contraseñas temporales. La persona define su clave por
enlace. Para revocar acceso se desactiva el perfil, conservando historial. La
aplicación impide auto-desactivación/cambio de rol y protege al último
administrador activo. Procedimiento detallado: [CREACION_USUARIOS_REALES.md](../CREACION_USUARIOS_REALES.md).

## Limpieza segura

**Peligroso:** `scripts/production-close/cleanup-preview.sql` es sólo vista
previa. Exige fecha de corte, responsable, motivo, confirmación de alcance y
listas UUID explícitas. Muestra dependencias y mantiene en cero los candidatos
de catálogo maestro. Nunca clasificar QA por coincidencias de nombre.

Se conservan siempre catálogo, productos, unidades, presentaciones,
conversiones, configuraciones, imágenes, clientes y operaciones reales. Una
eliminación futura requiere respaldo, segunda revisión, autorización y un
ejecutor transaccional separado. No existe botón destructivo en la aplicación.

## Soporte

Registrar fecha/hora, pantalla, rol y referencia no sensible. No adjuntar
contraseñas, tokens, cookies, correos completos ni secretos. Ante riesgo de
duplicar movimientos o afectar autenticación, detener el flujo y escalar.

## Compuertas de cierre

- Reunión: [QB_CHECKLIST_REUNION_CLIENTE.md](QB_CHECKLIST_REUNION_CLIENTE.md).
- Activación definitiva: [QB_CHECKLIST_ACTIVACION_DEFINITIVA.md](QB_CHECKLIST_ACTIVACION_DEFINITIVA.md).
- Aceptación resumida: [QB_CHECKLIST_ACEPTACION_CLIENTE.md](QB_CHECKLIST_ACEPTACION_CLIENTE.md).
