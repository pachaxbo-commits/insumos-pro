# QB Insumos - Checklist de autorizaciones de Staging

Cada bloque requiere aprobacion humana independiente. Marcar una etapa no autoriza la siguiente.

## 1. Solicitar acceso de solo lectura

- [x] Staging identificado por host y project ref.
- [x] Produccion excluida de la autorizacion.
- [x] Alcance limitado al inventario.
- [x] Responsable y ventana registrados.
- [x] Aprobacion humana recibida.

## 2. Conectarse a Staging para inventario

- [x] Credenciales temporales de solo lectura preparadas y posteriormente eliminadas.
- [x] Comandos revisados y sin mutaciones.
- [x] Scripts `01` a `08` aprobados y ejecutados con READ ONLY/ROLLBACK.
- [x] Regla de detencion confirmada.
- [x] Aprobacion humana recibida.

## 3. Realizar backup

- [ ] Metodo de snapshot/export aprobado.
- [ ] Auth y migraciones incluidos.
- [ ] Destino cifrado y restringido.
- [ ] Restauracion verificable planificada.
- [ ] Aprobacion humana recibida.

## 4. Crear migraciones de compatibilidad

- [ ] Inventario y diff terminados.
- [ ] Escenario A/B/C documentado.
- [ ] Migracion probada sobre copia restaurada.
- [ ] Datos historicos preservados.
- [ ] Aprobacion humana recibida.

## 5. Aplicar migracion

- [ ] Backup validado y reciente.
- [ ] Orden de migraciones confirmado.
- [ ] Rollback listo.
- [ ] Monitoreo y responsables presentes.
- [ ] Aprobacion humana recibida.

## 6. Ejecutar pruebas con datos de Staging

- [ ] Usuarios ficticios autorizados.
- [ ] Alcance de escrituras aprobado.
- [ ] Conteos antes de probar registrados.
- [ ] Limpieza o persistencia de datos definida.
- [ ] Aprobacion humana recibida.

## 7. Desplegar aplicacion

- [ ] Migraciones y smoke tests aprobados.
- [ ] Variables revisadas sin exponer service role.
- [ ] Rutas legacy siguen suspendidas.
- [ ] Plan de rollback de aplicacion disponible.
- [ ] Aprobacion humana recibida.

## Registro de aprobaciones

| Etapa | Aprobador | Fecha/hora | Evidencia | Resultado |
|---|---|---|---|---|
| Solo lectura |  |  |  |  |
| Conexion inventario |  |  |  |  |
| Backup |  |  |  |  |
| Compatibilidad |  |  |  |  |
| Migracion |  |  |  |  |
| Pruebas |  |  |  |  |
| Deploy |  |  |  |  |

## Estado posterior a QB-9.6

- Inventario de solo lectura: completado.
- Credenciales temporales: eliminadas.
- Backup: no autorizado.
- Creacion de proyecto QB nuevo: no autorizada.
- Traslado de datos/Auth/Storage: no autorizado.
- Migraciones sobre Staging actual: prohibidas y no autorizadas.
- Deploy: no autorizado.

La recomendacion tecnica es un Staging QB nuevo y limpio, pero requiere una autorizacion humana especifica antes de crearlo.
