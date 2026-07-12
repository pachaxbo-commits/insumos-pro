# QB Insumos - Checklist de autorizaciones de Staging

Cada bloque requiere aprobacion humana independiente. Marcar una etapa no autoriza la siguiente.

## 1. Solicitar acceso de solo lectura

- [ ] Staging identificado por host y project ref.
- [ ] Produccion identificada por separado.
- [ ] Alcance limitado al inventario.
- [ ] Responsable y ventana registrados.
- [ ] Aprobacion humana recibida.

## 2. Conectarse a Staging para inventario

- [ ] Credenciales de solo lectura preparadas.
- [ ] Comandos revisados y sin mutaciones.
- [ ] Scripts `01` a `08` aprobados.
- [ ] Regla de detencion confirmada.
- [ ] Aprobacion humana recibida.

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

