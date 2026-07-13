# QB-9.10.3.2 - Validacion final exclusiva de interfaz en Staging

Fecha de ejecucion: 2026-07-12 (America/La_Paz).

1. **Veredicto:** VALIDACION UI FALLO, LIMPIEZA COMPLETA.
2. **Project ref:** `tekfwbhvqtojpfqusosg`, exclusivamente `qb-insumos-staging-v2`.
3. **Migraciones:** PASS; `migration list` mostro 14 locales y 14 remotas coincidentes. No se ejecuto `db push`.
4. **Run ID:** `qb9_10_3_2_20260712_233530_25b5f541`.
5. **Preflight de datos:** PASS; 0 usuarios Auth y 0 filas operativas antes del run. Permanecian 2 dimensiones y 5 unidades canonicas.
6. **Git:** rama `main`, sin cambios operativos inesperados antes de crear este informe.
7. **Manifiesto UTF-8:** PASS. Se escribio desde Node con `encoding: "utf8"`.
8. **Prueba sin BOM:** PASS en comprobacion Node y comprobacion independiente de bytes; no aparecio la secuencia `EF BB BF`.
9. **Reescritura y lectura:** PASS; 2 reescrituras, 3 parseos y actualizacion correcta de `status`, `server_stopped` y `port_released`.
10. **Usuarios creados:** 3 de 3, exclusivamente administrador, inventario y cliente ficticios del run.
11. **Perfiles y cuenta:** no creados. Formaban parte de la transaccion de fixture que no llego a iniciarse.
12. **Fixture planificado:** 27 filas con UUID exactos registradas como `planned` en el manifiesto.
13. **Fixture creado:** 0 filas.
14. **Primer error inesperado:** `supabase db query --linked --file` rechazo la directiva de cliente psql `\set ON_ERROR_STOP on` como SQL y devolvio `ERROR 42601: syntax error at or near "on"`.
15. **Efecto del error:** el rechazo ocurrio en la primera linea, antes de `BEGIN`; ninguna sentencia de insercion fue ejecutada.
16. **Reintento o correccion:** NO. La ejecucion se detuvo inmediatamente conforme a la autorizacion.
17. **Servidor Next.js:** NO INICIADO.
18. **Puerto previsto:** 3100; permanecio libre.
19. **Inicio mediante PowerShell:** NO EJECUTADO porque el fixture no fue creado.
20. **Uso de `child_process.spawn`:** NO.
21. **Login administrador:** NO EJECUTADO.
22. **Rutas administrador:** NO EJECUTADAS.
23. **Logout administrador:** NO EJECUTADO.
24. **Login inventario:** NO EJECUTADO.
25. **Rutas y restricciones de inventario:** NO EJECUTADAS.
26. **Logout inventario:** NO EJECUTADO.
27. **Login cliente:** NO EJECUTADO.
28. **Catalogo, checkout y mi cuenta:** NO EJECUTADOS.
29. **Restricciones y logout del cliente:** NO EJECUTADOS.
30. **Middleware, redirecciones y rutas legacy:** NO EJECUTADOS.
31. **Errores de navegador o servidor:** ninguno, porque no se inicio navegador ni servidor. El error fue exclusivo del arnes SQL temporal.
32. **Limpieza de usuarios:** PASS; 3 de 3 usuarios Auth eliminados por UUID exacto y en orden inverso.
33. **Limpieza de filas:** no fue necesario ejecutar `DELETE`; las 27 filas permanecieron `planned` y nunca existieron en la base.
34. **Conteos finales:** iguales a los iniciales: 0 usuarios, perfiles, cuentas, categorias, productos, movimientos y tablas operativas QB; 2 dimensiones y 5 unidades canonicas.
35. **Residuos:** ninguno en Staging. No quedaron procesos del run y el puerto 3100 esta libre.
36. **Manifiesto conservado:** `%TEMP%\qb-insumos-qb9-10-3-2\qb9_10_3_2_20260712_233530_25b5f541\manifest.json`, sin claves, contrasenas, tokens, cookies ni cadenas de conexion.
37. **Backend E2E, reportes y CSV:** NO REPETIDOS.
38. **Lint, TypeScript y build:** NO REPETIDOS.
39. **Migraciones, esquema, RLS, Auth permanente y secretos:** NO MODIFICADOS.
40. **Deploy, proyectos legacy y commit:** NO. No se accedio a `epxmrfwtssbcqsytuwhf` ni `wfhvuzigmkgojdoofjib`.
41. **Riesgo pendiente:** toda la matriz UI por roles continua sin validar; el arnes temporal debe usar SQL compatible con `supabase db query` y no directivas de cliente psql.
42. **Siguiente paso exacto:** solicitar una nueva autorizacion para repetir solo la validacion UI desde un run nuevo, conservando la prueba UTF-8 aprobada y retirando previamente la directiva `\set` del SQL temporal. No preparar deploy hasta completar login, rutas, permisos, logout, redirecciones y suspension legacy con limpieza final aprobada.
