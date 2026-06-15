# PLAN_PUESTA_EN_PRODUCCION

## Objetivo

Preparar Insumos Pro para operar con datos reales del cliente, separando el entorno de demo del entorno de produccion y reduciendo riesgos antes del primer uso comercial.

## Entornos

- Demo / prueba: usado para capacitacion, validacion comercial y datos ficticios.
- Produccion: usado solo con datos reales, usuarios reales y operaciones reales.
- Desarrollo local: usado por el equipo tecnico para cambios controlados.

No mezclar datos reales en el entorno de demo si el cliente no autorizo expresamente esa practica.

## Secuencia recomendada

1. Congelar version: no agregar modulos nuevos durante la puesta en produccion.
2. Confirmar deploy: validar que Vercel apunte al commit final aprobado.
3. Confirmar Supabase: validar URL, region, RLS, backups y SQL aplicado.
4. Crear respaldo: exportar datos actuales antes de cualquier limpieza.
5. Limpiar datos demo: seguir `LIMPIEZA_DATOS_DEMO.md` sin borrar usuarios admin.
6. Cargar datos reales: usar `PLANTILLA_CARGA_DATOS.md` y revisar formatos.
7. Crear usuarios reales: seguir `CREACION_USUARIOS_REALES.md`.
8. Ejecutar pruebas cliente: completar `CHECKLIST_PRUEBAS_CLIENTE.md`.
9. Activar dominio final: configurar DNS y validar HTTPS.
10. Entrega asistida: acompanar al cliente en el primer dia operativo.

## Criterios de listo

- `npm run lint` pasa sin errores.
- `npm run build` pasa sin errores.
- Variables de entorno configuradas en Vercel.
- SQL de `SUPABASE_SCHEMA.sql` aplicado en el proyecto correcto.
- Usuario administrador real creado.
- Datos demo limpiados o claramente separados.
- Datos maestros reales cargados y revisados.
- Permisos probados con roles reales.
- Exportaciones CSV probadas.
- Cliente entiende limitaciones y pendientes controlados.

## Riesgos a controlar

- Ejecutar SQL de limpieza en el proyecto equivocado.
- Borrar perfiles o usuarios administradores.
- Cargar stock inicial como numero manual sin movimiento de inventario.
- Usar contrasenas compartidas en produccion.
- Prometer reversas contables completas si aun estan documentadas como pendiente controlado.

## Responsables sugeridos

- Equipo tecnico: deploy, variables, SQL, respaldo, carga inicial y verificacion.
- Cliente administrador: validacion de datos, usuarios, permisos y pruebas de operacion.
- Usuario clave operativo: prueba de compras, ventas, inventario, cobros y pagos.

## Ventana de salida

Se recomienda hacer la puesta en produccion fuera de horas pico, con una ventana minima de 2 a 4 horas para carga, pruebas y ajustes menores.

