# QB Insumos — cierre operativo del 18 de julio de 2026

## 1. Estado inicial

- Rama `main`; HEAD local y `origin/main`: `df62c5dccbe674620be11febe98c034079b95fb4`.
- Vercel Production estaba Ready y construido desde ese mismo commit.
- El único cambio previo era `temp/`, que no se inspeccionó, modificó ni incluyó.
- Proyecto Supabase enlazado: `tekfwbhvqtojpfqusosg`.
- Migraciones locales/remotas: 31/31, desde `20260712090100` hasta
  `20260712093100`, sin pendientes.

## 2. Funciones auditadas

Se revisaron catálogo público, autenticación, recuperación, autorización por
rol, productos, unidades, precios, pedidos por Bs, pedidos internos,
preparación, entrega, recibos, ingresos, clasificación, apertura, stock
provisional/estricto, fotografías, Realtime, polling y carga diferida.

La auditoría funcional autenticada visual quedó pendiente: el controlador de
Chrome disponible falló al inicializar y no existía una sesión segura
alternativa autorizada. No se presenta ninguna comprobación visual autenticada
como realizada.

## 3. Resultado por rol

- Administrador: los guards de ruta, acciones y RPC permiten la administración
  operativa prevista.
- Inventario: puede operar ingresos, preparación y entrega; no tiene rutas de
  Configuración ni acciones administrativas de precio, roles o clasificación.
- Cliente: las acciones derivan la identidad de la sesión y limitan cuenta,
  ubicaciones y pedidos propios.
- Invitado/anon: catálogo y checkout permanecen disponibles; las rutas privadas
  usan el control de sesión/rol. El catálogo público no expone stock, costo ni
  precio base interno.

Estos resultados proceden de código, contratos y build, no de una sesión visual
real por cada rol.

## 4. Estado de SMTP y recuperación

El endpoint público de Auth reportó email habilitado, alta habilitada,
autoconfirmación de correo desactivada y respuesta correcta. Esa interfaz no
permite distinguir con certeza SMTP propio del remitente predeterminado; por
tanto, SMTP externo no está confirmado.

El código cubre solicitud neutral, callback Production, `token_hash` de tipo
`recovery`, enlace inválido/vencido/usado, cambio de contraseña, cierre de la
sesión de recuperación, retorno a login y bloqueo de redirects externos. La
entrega real del correo y el login posterior requieren una prueba manual.

## 5. Pasos externos pendientes

1. Confirmar en Supabase Auth el Site URL y redirects exactos de Production.
2. Confirmar proveedor/remitente SMTP sin copiar credenciales.
3. Revisar plantillas y límites/rate limits del proveedor.
4. Solicitar un enlace a una cuenta controlada, cambiar la clave, iniciar sesión
   y comprobar que el enlace usado y uno vencido son rechazados.
5. Ejecutar la matriz visual autenticada de administrador, inventario y cliente.

## 6. Usuarios demo detectados

No se identificó ninguna cuenta demo mediante un criterio inequívoco. Las
estimaciones de tabla mostraron 2 perfiles internos y 3 cuentas cliente, pero
no autorizan inferir identidad, rol o carácter demo. No se creó, modificó ni
desactivó ninguna cuenta.

## 7. Datos operativos detectados

La RPC pública devolvió 384 combinaciones producto/unidad, 197 productos
publicados únicos, 9 categorías públicas y 1 producto público habilitado por
importe Bs. Las estadísticas read only de Supabase estimaron 199 productos,
199 configuraciones de unidad, 384 unidades permitidas, 5 pedidos, 0 recepciones
de mercadería, 2 recibos, 9 movimientos de inventario y 9 movimientos de
entrega.

Los conteos internos de productos activos, sin unidad, sin precio, con stock
negativo, sin recepción y membresías por rol no pudieron obtenerse de forma
exacta sin sesión autenticada. No se sustituyeron por cifras inventadas.

## 8. Vista previa de limpieza

`scripts/production-close/cleanup-preview.sql` es estrictamente read only, parte
con listas UUID vacías y fecha de corte nula, cuenta dependencias y fija en cero
los candidatos de catálogo maestro. Su contrato automatizado prohíbe DML. No se
ejecutó limpieza.

## 9. Inventario de apertura

El flujo vigente usa CSV con vista previa, confirmación explícita, ingreso y
movimientos trazables; conserva fecha de corte, unidad, conversión, actor y hash.
No edita el saldo directamente y puede ejecutarse antes de activar el modo
estricto. La guía final exige conteo físico, conciliación, correcciones por
movimiento y resolución de negativos. No se cargaron cantidades.

## 10. Caso Papa Holandesa

Los contratos verifican la mecánica `1 carga = 10 arrobas = 112,5 kg`, reparto
variable que totaliza 100 %, conservación de cantidad/costo y ausencia de stock
en la fuente. Las estadísticas indican 1 presentación y 3 relaciones de salida
en la base, pero no permiten atribuirlas con certeza a Papa sin lectura
autenticada.

El catálogo público contiene `PAPA HOLANDESA GRANDE` y `PAPA HOLANDESA MEDIANA`;
no contiene la fuente ni `PAPA HOLANDESA PEQUEÑA`. Por ello no se confirma que
las tres relaciones solicitadas estén vinculadas.

Prueba manual: seleccionar la fuente, registrar 1 carga, comprobar 112,5 kg,
asignar porcentajes acordados que sumen 100 %, confirmar, verificar movimientos
de cada resultado y comprobar que la fuente no recibió stock.

## 11. Seguridad

Los contratos confirman RLS/ACL, RPC `SECURITY DEFINER` con `search_path`
controlado, identidad derivada de sesión, revocación anon, roles administrativos
y de inventario, snapshots históricos, idempotencia, validación de payload,
restricciones de fotografías y ausencia de service role en navegador. El
service role permanece en un módulo `server-only`.

## 12. Rendimiento

Los contratos confirman diálogo local de Nuevo producto, búsqueda server-side
con debounce, paginación de 25 filas, carga diferida de clasificación y Nuevo
pedido, miniaturas optimizadas, consultas paralelas, canal Realtime controlado y
polling detenido con la pestaña oculta. No se publican tiempos autenticados
porque no pudieron medirse de forma real.

## 13. Fallos y correcciones

Se corrigió un fallo real: la administración de usuarios generaba y mostraba
contraseñas temporales. Ahora invita por enlace de recuperación con callback
seguro; la persona define su contraseña y, si el envío falla, la identidad recién
creada se elimina. El reseteo administrativo usa el mismo callback.

También se alinearon contratos estáticos antiguos con límites de componentes,
RPC multilínea, una sexta suscripción de configuración y consultas resumen
actuales. No se agregaron módulos comerciales.

## 14. Archivos modificados

- Autenticación interna: `src/lib/admin-users/actions.ts`,
  `src/components/admin/user-management.tsx`.
- Contratos: pruebas Node operativas, contratos PowerShell QB12/QB13/QB15/QB17
  y clasificación.
- Entrega: guía final, checklist, procedimiento de usuarios, plan/vista previa
  de limpieza y avisos de obsolescencia en documentos históricos principales.

## 15. Migración

No se creó ni aplicó ninguna migración. El historial permanece 31/31 y no se
ejecutó SQL general.

## 16. Pruebas

- Node: 308/308.
- Contratos PowerShell: piloto 23/23; sincronización 26/26; QB18 25/25;
  precios QB17 20/20; importe QB17 31/31; QB16 58/58; QB15 35/35;
  QB13 35 escenarios + 3 auxiliares; QB12 12 funcionales + 2 auxiliares +
  12 de seguridad; clasificación 33/33; QB14.2 57/57.
- ESLint, TypeScript, `git diff --check` y build Production: aprobados.

El contrato local con service role no se ejecutó porque implicaba una vía de
escritura incompatible con esta auditoría sin mutaciones reales.

## 17–20. Commit, push, deployment y URL

Los commits de código y contratos son `8651f21` y `c0a69e9`. El hash del commit
que contiene este propio informe, el push y el deployment se registran en el
handoff final, ya que un archivo no puede contener anticipadamente el hash de su
propio commit. URL canónica: `https://qb-insumos.vercel.app`.

## 21. Documentación final

La guía canónica es `docs/QB_GUIA_ENTREGA_FINAL.md`; el checklist corto es
`docs/QB_CHECKLIST_ACEPTACION_CLIENTE.md`. Los documentos operativos anteriores
apuntan a estas fuentes o quedan marcados como históricos.

## 22. Acciones manuales pendientes

- Completar SMTP/recuperación real y la matriz visual autenticada.
- Confirmar usuarios reales, roles, membresías y cuentas demo por UUID.
- Obtener conteos internos exactos con una sesión administrativa aprobada.
- Confirmar la configuración y las tres relaciones de Papa Holandesa.
- Conciliar y aprobar inventario de apertura.
- Aprobar por UUID y fecha de corte cualquier limpieza futura.
- Activar control estricto únicamente después de saldos aprobados.

## 23. Confirmaciones

No se limpiaron datos, no se crearon usuarios reales, no se inventaron
cantidades ni precios, no se activó el control estricto, no se accedió a
proyectos legacy, no se expusieron secretos y no hubo operaciones destructivas.
