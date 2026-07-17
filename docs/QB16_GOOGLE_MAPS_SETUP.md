# Configuración de Google Maps para QB-16

QB-16 carga Google Maps únicamente en el navegador y mantiene disponible el formulario manual cuando el servicio no está configurado o no responde.

## Variables requeridas

Configurar manualmente en cada entorno:

```text
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
```

Ambas variables son públicas para el navegador. No deben contener credenciales administrativas, enviarse a Supabase, escribirse con valores reales en el repositorio ni aparecer en registros. El repositorio solo conserva sus nombres vacíos en `.env.example`.

Para producción se recomienda crear un Map ID de tipo JavaScript y asignarlo a `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. `DEMO_MAP_ID` se usa únicamente como fallback de desarrollo o revisión cuando no se configuró un Map ID propio.

## APIs utilizadas

La implementación usa directamente desde Maps JavaScript API:

- Maps JavaScript API para el mapa y los eventos de clic.
- Advanced Markers para el marcador movible.
- Places API (New) mediante `PlaceAutocompleteElement` para buscar direcciones.
- Geocoding API, consumida mediante el geocoder de Maps JavaScript API, para convertir una posición en una dirección legible.
- Geolocation API del navegador, únicamente después de pulsar “Usar mi ubicación actual”.

No existe un proxy propio ni una llamada de servidor que reciba la clave.

## Restricciones recomendadas

Antes de habilitar la clave, limitarla a sitios web mediante HTTP referrers y permitir exclusivamente Maps JavaScript API, Places API (New) y Geocoding API. Como mínimo, revisar estas referencias:

- Producción: `https://qb-insumos.vercel.app/*`.
- Previews de Vercel: los dominios de preview efectivamente asignados al proyecto, con el patrón más estrecho que permita Google Cloud.
- Desarrollo autorizado: `http://localhost:3000/*` y, solo si se utiliza, el puerto local equivalente.

No habilitar comodines de dominios ajenos ni APIs que QB Insumos no consume.

## Comportamiento de respaldo

Si falta la variable, el script falla o una biblioteca no está disponible, la pantalla conserva el campo de dirección y referencia y muestra:

> El mapa no está disponible en este momento. Puedes escribir la dirección manualmente.

La dirección siempre es obligatoria. Latitud y longitud son opcionales, pero deben existir juntas y ser válidas cuando se proporcionan. Las ubicaciones registradas y los pedidos invitados pueden guardarse solo con la dirección manual. El mapa mejora la precisión y el botón de ubicación actual continúa disponible sin clave, pero ninguno de los dos bloquea el pedido invitado.

## Revisión manual posterior

Después de configurar la clave en un entorno autorizado:

1. Crear, editar, visualizar, marcar como principal y eliminar una ubicación propia desde `/mi-cuenta`.
2. Probar búsqueda en Bolivia, clic en el mapa y arrastre del marcador.
3. Rechazar y aceptar por separado el permiso de geolocalización.
4. Confirmar que una ubicación nueva en `/catalogo/checkout` conserva el carrito y queda seleccionada.
5. Confirmar un pedido registrado y verificar que el snapshot contiene dirección, referencia y, cuando existan, coordenadas y Place ID.
6. Confirmar un pedido invitado y verificar que no se crea cuenta ni ubicación persistente.
7. Probar una carga sin clave y una falla controlada del script.
8. Verificar la experiencia en escritorio, tableta y celular.

La migración QB-16 debe revisarse y aplicarse por el procedimiento canónico antes de desplegar el código que invoca sus RPC.
