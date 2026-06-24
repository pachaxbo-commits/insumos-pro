# CHECKLIST_ENTREGA

## Tecnico

- [ ] Variables de entorno configuradas en Vercel.
- [ ] `SUPABASE_SCHEMA.sql` ejecutado completo o con bloque Fase 10 aplicado.
- [ ] `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql` aplicado y probado en staging si la base ya existia.
- [ ] `SUPABASE_SEED_DEMO.sql` no aplicado en produccion.
- [ ] Usuario administrador creado.
- [ ] Usuarios reales creados y roles validados.
- [ ] Datos demo limpiados o separados del entorno productivo.
- [ ] Datos reales iniciales cargados y aprobados.
- [ ] `npm run lint` OK.
- [ ] `npm run build` OK.
- [ ] Deploy en Vercel verificado.
- [ ] Dominio productivo y HTTPS verificados si aplica.

## Seguridad

- [ ] `.env.local` no esta en el repositorio.
- [ ] RLS habilitado en tablas operativas.
- [ ] RLS bloquea mutaciones directas en tablas operativas criticas.
- [ ] Roles asignados correctamente.
- [ ] Usuarios inactivos revisados.
- [ ] Bitacora visible solo para administradores.

## Demo y produccion

- [ ] Datos demo suficientes: productos, clientes, proveedores.
- [ ] Compra confirmable.
- [ ] Venta confirmable.
- [ ] Cuenta por cobrar para probar cobro.
- [ ] Cuenta por pagar para probar pago.
- [ ] Reportes con datos.
- [ ] Exportacion CSV probada.
- [ ] Checklist de pruebas cliente completado antes de operar con datos reales.

## Documentos

- [ ] `README_SETUP.md`
- [ ] `DEMO_CLIENTE.md`
- [ ] `GUIA_USUARIO.md`
- [ ] `GUIA_ADMIN.md`
- [ ] `SEGURIDAD_PERMISOS.md`
- [ ] `PENDIENTES_CONTROLADOS.md`
- [ ] `USUARIOS_DEMO.md`
- [ ] `PLAN_PUESTA_EN_PRODUCCION.md`
- [ ] `LIMPIEZA_DATOS_DEMO.md`
- [ ] `PLANTILLA_CARGA_DATOS.md`
- [ ] `CREACION_USUARIOS_REALES.md`
- [ ] `CHECKLIST_PRUEBAS_CLIENTE.md`
- [ ] `CONFIGURACION_PRODUCCION.md`
- [ ] `NOTAS_FASE_11.md`
- [ ] `MATRIZ_PERMISOS_FASE_12A.md`
- [ ] `PLAN_PRUEBAS_STAGING_FASE_12A.md`
- [ ] `NOTAS_FASE_12A.md`
