import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const picker = read("src/components/locations/google-location-picker.tsx");
const locationForm = read("src/components/customer-account/customer-location-form.tsx");
const manager = read("src/components/customer-account/customer-locations-manager.tsx");
const selector = read("src/components/catalog/checkout-location-selector.tsx");
const checkout = read("src/components/catalog/public-checkout.tsx");
const guest = read("src/components/catalog/guest-checkout-form.tsx");
const actions = read("src/lib/qb-catalog/actions.ts");
const guestActions = read("src/lib/qb-catalog/guest-actions.ts");
const guestTypes = read("src/types/qb-guest-order.ts");
const migration = read("supabase/migrations/20260712092000_qb16_google_maps_locations.sql");
const sqlContract = read("supabase/tests/qb16_google_maps_locations_sql_contract.sql");
const documentation = read("docs/QB16_GOOGLE_MAPS_SETUP.md");
const envExample = read(".env.example");
const gmpSelectStart = picker.indexOf('autocomplete.addEventListener("gmp-select"');
const gmpErrorStart = picker.indexOf('autocomplete.addEventListener("gmp-error"');
const gmpSelectHandler = picker.slice(gmpSelectStart, gmpErrorStart);

test("01 la clave solo se referencia por nombre", () => {
  assert.match(picker, /process\.env\.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(envExample, /^NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$/m);
  assert.doesNotMatch(picker, /AIza[0-9A-Za-z_-]{20,}/);
});
test("02 existe fallback manual sin clave", () => assert.match(picker, /El mapa no está disponible en este momento/));
test("03 el script se carga en componente cliente", () => {
  assert.match(picker, /^"use client";/);
  assert.match(picker, /<Script/);
});
test("04 el mapa inicia en Cochabamba", () => assert.match(picker, /-17\.3935[\s\S]*-66\.157/));
test("05 la búsqueda prioriza Bolivia", () => assert.match(picker, /includedRegionCodes = \["bo"\]/));
test("06 PlaceAutocompleteElement actualiza selección", () => {
  assert.match(picker, /PlaceAutocompleteElement/);
  assert.match(picker, /formattedAddress[\s\S]*latitude:[\s\S]*longitude:/);
});
test("07 clic en mapa selecciona posición", () => assert.match(picker, /addListener\("click"[\s\S]*selectPosition/));
test("08 marcador arrastrable selecciona posición", () => assert.match(picker, /gmpDraggable[\s\S]*addListener\("dragend"/));
test("09 geolocalización solo se pide en el botón", () => {
  assert.match(picker, /onClick=\{requestCurrentLocation\}/);
  assert.equal((picker.match(/getCurrentPosition/g) ?? []).length, 1);
});
test("10 los errores de geolocalización son profesionales", () => {
  assert.match(picker, /No se pudo acceder a tu ubicación/);
  assert.match(picker, /No pudimos obtener tu ubicación actual/);
  assert.match(picker, /La ubicación tardó demasiado/);
});
test("11 coordenadas inválidas se rechazan en servidor", () => assert.match(actions, /finite\(\)\.min\(min\)\.max\(max\)/));
test("12 nombre y dirección son obligatorios", () => assert.match(actions, /label: z\.string\(\)\.trim\(\)\.min\(2[\s\S]*address: z\.string\(\)\.trim\(\)\.min\(5/));
test("13 la referencia permanece independiente", () => {
  assert.match(locationForm, /name="reference"/);
  assert.doesNotMatch(picker, /name="reference"/);
});
test("14 las acciones derivan la identidad de la sesión", () => {
  assert.match(actions, /getClaims\(\)/);
  assert.doesNotMatch(locationForm, /customer_account_id/);
});
test("15 la primera ubicación puede quedar principal", () => assert.match(migration, /or not exists \([\s\S]*qb_customer_locations/));
test("16 el cambio de principal se serializa e identifica por cuenta", () => {
  assert.match(migration, /set_own_qb_customer_location_primary/);
  assert.match(migration, /pg_advisory_xact_lock/);
});
test("17 editar usa el mismo id y no duplica", () => {
  assert.match(locationForm, /name="id" value=\{location\.id\}/);
  assert.match(migration, /if p_id is null then[\s\S]*insert[\s\S]*else[\s\S]*update/);
});
test("18 eliminar pide confirmación y elige sustituta", () => {
  assert.match(manager, /window\.confirm/);
  assert.match(migration, /v_replacement_id/);
});
test("19 eliminar no altera pedidos históricos", () => assert.doesNotMatch(migration, /delete\s+from\s+public\.qb_orders/i));
test("20 checkout preselecciona la principal", () => assert.match(checkout, /find\(\(location\) => location\.isPrimary\) \?\? locations\[0\]/));
test("21 nueva ubicación se selecciona sin tocar el carrito", () => {
  assert.match(selector, /onSaved=\{\(locationId\)[\s\S]*onSelect\(locationId\)/);
  assert.doesNotMatch(selector, /saveLocalCart/);
});
test("22 snapshot registrado incorpora coordenadas y Place ID", () => assert.match(migration, /location_snapshot[\s\S]*'latitude'[\s\S]*'longitude'[\s\S]*'google_place_id'/));
test("23 snapshot invitado recibe coordenadas y Place ID", () => assert.match(guest, /latitude: locationSelection\.latitude[\s\S]*longitude: locationSelection\.longitude[\s\S]*googlePlaceId: locationSelection\.googlePlaceId/));
test("24 invitado conserva la acción segura existente", () => {
  assert.match(guest, /submitQbGuestCatalogOrderAction/);
  assert.doesNotMatch(guest, /customer_accounts|qb_customer_locations/);
});
test("25 no existe service role ni registro de coordenadas en cliente", () => {
  const clients = `${picker}\n${locationForm}\n${manager}\n${selector}\n${guest}`;
  assert.doesNotMatch(clients, /service_role|SUPABASE_SERVICE_ROLE_KEY|console\.(log|info|debug)/i);
});
test("26 no se toca el flujo de registro ni confirmación", () => {
  assert.doesNotMatch(checkout, /confirmacion|customer-registration/i);
  assert.doesNotMatch(migration, /auth\.users|profiles/);
});
test("27 la migración queda limitada a ubicaciones y snapshot", () => {
  assert.doesNotMatch(migration, /qb_receipts|inventory_movements|confirm_qb_order_delivery/i);
  assert.match(migration, /qb_customer_locations/);
});
test("28 el invitado admite coordenadas ausentes", () => {
  assert.match(guestTypes, /latitude\?: number \| null/);
  assert.match(guestActions, /latitude: z\.number\(\)\.finite\(\)\.min\(-90\)\.max\(90\)\.nullable\(\)\.optional\(\)/);
  assert.doesNotMatch(guest, /Selecciona tu ubicación en el mapa o usa tu ubicación actual antes de confirmar/);
});
test("29 la dirección invitada continúa obligatoria", () => {
  assert.match(guestActions, /address: z\.string\(\)\.trim\(\)\.min\(5\)\.max\(300\)/);
  assert.match(picker, /name="address"[\s\S]*required=\{!readOnly\}/);
});
test("30 coordenadas guest forman una pareja opcional", () => {
  assert.match(guestActions, /\(latitude === null\) !== \(longitude === null\)/);
  assert.match(migration, /\(\(p_latitude is null\) <> \(p_longitude is null\)\)/);
});
test("31 sin API key el submit y la geolocalización siguen disponibles", () => {
  assert.match(picker, /!readOnly && apiKey/);
  assert.match(picker, /onClick=\{requestCurrentLocation\}/);
  assert.doesNotMatch(guest, /locationStatus === "loading"/);
});
test("32 el rechazo de permiso no bloquea el formulario", () => {
  assert.match(picker, /PERMISSION_DENIED[\s\S]*No se pudo acceder a tu ubicación/);
  assert.doesNotMatch(picker, /disabled=\{locationStatus === "error"\}/);
});
test("33 usar Google Maps conserva coordenadas y Place ID", () => {
  assert.match(picker, /googlePlaceId: place\.id\?\.trim\(\) \|\| null/);
  assert.match(guest, /googlePlaceId: locationSelection\.googlePlaceId/);
});
test("34 se revoca DML directo para anon y authenticated", () => {
  assert.match(migration, /revoke insert, update, delete[\s\S]*on table public\.qb_customer_locations[\s\S]*from anon, authenticated;/);
  assert.doesNotMatch(actions, /\.from\("qb_customer_locations"\)[\s\S]*\.(insert|update|delete)\(/);
});
test("35 existe el índice único parcial solicitado", () => {
  assert.match(migration, /qb_customer_locations_one_active_primary_idx[\s\S]*where is_active = true and is_primary = true/);
  assert.match(migration, /QB16_DUPLICATE_ACTIVE_PRIMARY_LOCATIONS/);
});
test("36 las tres RPC exigen cuenta activa", () => {
  assert.equal((migration.match(/where account\.id = v_user_id and account\.is_active = true/g) ?? []).length, 3);
});
test("37 el trigger exige propietario y ubicación activa", () => {
  assert.match(migration, /location\.id = new\.customer_location_id[\s\S]*location\.customer_account_id = new\.customer_account_id[\s\S]*location\.is_active = true/);
  assert.match(migration, /QB16_INVALID_REGISTERED_LOCATION/);
});
test("38 el trigger elimina claves anteriores antes de combinar", () => {
  assert.match(migration, /- 'latitude'[\s\S]*- 'longitude'[\s\S]*- 'google_place_id'[\s\S]*\|\|/);
});
test("39 el contrato SQL es transaccional y no read only", () => {
  assert.match(sqlContract, /^begin;/m);
  assert.match(sqlContract, /^rollback;/m);
  assert.doesNotMatch(sqlContract, /set transaction read only/i);
});
test("40 el contrato SQL ejecuta las RPC y declara 40 escenarios", () => {
  assert.match(sqlContract, /public\.save_own_qb_customer_location\(/);
  assert.match(sqlContract, /public\.create_qb_guest_catalog_order\(/);
  assert.match(sqlContract, /40::integer as scenarios_passed/);
});
test("41 la documentación exige Places API New", () => assert.match(documentation, /Places API \(New\)/));
test("42 la documentación exige Geocoding API", () => assert.match(documentation, /Geocoding API/));
test("43 la documentación recomienda Map ID de producción", () => {
  assert.match(documentation, /Map ID de tipo JavaScript/);
  assert.match(envExample, /^NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=$/m);
});
test("44 readOnly sin coordenadas no muestra un mapa genérico", () => {
  assert.match(picker, /const showMap = !readOnly \|\| Boolean\(initialCoordinates\)/);
  assert.match(picker, /Esta ubicación fue guardada sin un punto en el mapa/);
});
test("45 gmp-error activa el fallback", () => {
  assert.match(
    picker,
    /addEventListener\("gmp-error"[\s\S]*La búsqueda visual no está disponible\. Puedes usar el mapa o escribir la dirección\./,
  );
});
test("46 la carga usa idioma español, región Bolivia y Map ID configurable", () => {
  assert.match(picker, /language=es&region=BO/);
  assert.match(picker, /NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID/);
  assert.match(picker, /configuredMapId \|\| "DEMO_MAP_ID"/);
});
test("47 no se alteran QB-15 ni módulos financieros u operativos", () => {
  assert.doesNotMatch(migration, /customer_registration|register_own_customer_account|qb_receipts|inventory_movements/);
  assert.doesNotMatch(guestActions, /qb_receipts|inventory_movements|confirm_qb_order_delivery/);
});
test("48 fetchFields queda completamente protegido por try catch", () => {
  assert.match(
    gmpSelectHandler,
    /try \{[\s\S]*prediction\.toPlace\(\)[\s\S]*await place\.fetchFields[\s\S]*\} catch \{/,
  );
});
test("49 un rechazo conserva la selección previa", () => {
  const catchBlock = gmpSelectHandler.slice(gmpSelectHandler.lastIndexOf("} catch {"));
  assert.match(catchBlock, /setMessage\(PLACE_SELECTION_ERROR_MESSAGE\)/);
  assert.doesNotMatch(catchBlock, /publish\(|setSelection\(|marker\.(map|position)\s*=/);
});
test("50 gmp-select no deja una promesa asíncrona sin manejo", () => {
  assert.match(gmpSelectHandler, /void \(async \(\) => \{[\s\S]*try \{[\s\S]*\} catch \{[\s\S]*\}\s*\}\)\(\);/);
});
test("51 un resultado sin location activa el fallback manual", () => {
  assert.match(
    gmpSelectHandler,
    /const position = coordinatesFrom\(place\.location\);[\s\S]*if \(!position\) \{[\s\S]*setMessage\(PLACE_SELECTION_ERROR_MESSAGE\)/,
  );
});
test("52 se conserva el mensaje profesional acordado", () => {
  assert.match(
    picker,
    /No pudimos completar esa dirección\. Selecciona el punto en el mapa o escríbela manualmente\./,
  );
});
test("53 el manejo de Places no escribe errores en consola", () => {
  assert.doesNotMatch(gmpSelectHandler, /console\.(log|error|warn|info|debug)/);
});
test("54 una respuesta antigua no reemplaza una selección reciente", () => {
  assert.match(gmpSelectHandler, /const requestId = \+\+selectionRequestRef\.current/);
  assert.ok(
    gmpSelectHandler.indexOf("requestId !== selectionRequestRef.current") <
      gmpSelectHandler.indexOf("const position = coordinatesFrom(place.location)"),
  );
  assert.match(
    picker,
    /selectionRequestRef\.current \+= 1;[\s\S]*const address = event\.target\.value;[\s\S]*publish\(\{ \.\.\.selectionRef\.current, address \}\)/,
  );
});
test("55 gmp-error continúa implementado", () => {
  assert.match(
    picker,
    /addEventListener\("gmp-error"[\s\S]*La búsqueda visual no está disponible\. Puedes usar el mapa o escribir la dirección\./,
  );
});

test("56 el selector orienta antes de escribir una dirección", () => {
  assert.match(picker, /MAP_PROMPT_MESSAGE = "Escribe una dirección para ubicarla en el mapa\."/);
  assert.match(picker, /selection\.address \? "" : MAP_PROMPT_MESSAGE/);
});

test("57 una selección válida elimina mensajes residuales", () => {
  assert.match(picker, /publish\(\{[\s\S]*googlePlaceId: place\.id\?\.trim\(\) \|\| null,[\s\S]*\}\);[\s\S]*setMessage\(""\)/);
});
test("56 la RPC cambia la principal mediante dos UPDATE separados", () => {
  assert.match(
    migration,
    /set_own_qb_customer_location_primary[\s\S]*update public\.qb_customer_locations[\s\S]*set is_primary = false[\s\S]*update public\.qb_customer_locations[\s\S]*set is_primary = true/,
  );
});
test("57 la RPC desmarca primero únicamente la principal activa actual", () => {
  assert.match(
    migration,
    /set is_primary = false\s+where customer_account_id = v_user_id\s+and is_active = true\s+and is_primary = true;/,
  );
});
test("58 la RPC marca después únicamente el destino activo propio", () => {
  assert.match(
    migration,
    /set is_primary = true\s+where id = p_id\s+and customer_account_id = v_user_id\s+and is_active = true;[\s\S]*get diagnostics v_updated_count = row_count;[\s\S]*v_updated_count <> 1/,
  );
});
test("59 la asignación booleana vulnerable ya no existe", () => {
  assert.doesNotMatch(migration, /set is_primary = \(id = p_id\)/);
});
test("60 el contrato SQL prueba el ciclo A a B a A a B", () => {
  assert.match(sqlContract, /no se cambió de A a B/);
  assert.match(sqlContract, /no se cambió de B a A/);
  assert.match(sqlContract, /no se cambió nuevamente de A a B/);
  assert.match(sqlContract, /unique_violation/);
});
test("61 el índice único parcial permanece presente", () => {
  assert.match(
    migration,
    /qb_customer_locations_one_active_primary_idx[\s\S]*where is_active = true and is_primary = true/,
  );
});
