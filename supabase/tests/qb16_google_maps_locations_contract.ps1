$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migration = Get-Content -Raw -Encoding UTF8 (Join-Path $root "supabase\migrations\20260712092000_qb16_google_maps_locations.sql")
$actions = Get-Content -Raw -Encoding UTF8 (Join-Path $root "src\lib\qb-catalog\actions.ts")
$guestActions = Get-Content -Raw -Encoding UTF8 (Join-Path $root "src\lib\qb-catalog\guest-actions.ts")
$guestTypes = Get-Content -Raw -Encoding UTF8 (Join-Path $root "src\types\qb-guest-order.ts")
$guestForm = Get-Content -Raw -Encoding UTF8 (Join-Path $root "src\components\catalog\guest-checkout-form.tsx")
$picker = Get-Content -Raw -Encoding UTF8 (Join-Path $root "src\components\locations\google-location-picker.tsx")
$sqlContract = Get-Content -Raw -Encoding UTF8 (Join-Path $root "supabase\tests\qb16_google_maps_locations_sql_contract.sql")
$documentation = Get-Content -Raw -Encoding UTF8 (Join-Path $root "docs\QB16_GOOGLE_MAPS_SETUP.md")
$envExample = Get-Content -Raw -Encoding UTF8 (Join-Path $root ".env.example")

$checks = [ordered]@{
  "columnas latitude longitude y google_place_id" = $migration -match "add column if not exists latitude" -and $migration -match "add column if not exists longitude" -and $migration -match "add column if not exists google_place_id"
  "coordenadas forman un par opcional" = $migration -match "latitude is null and longitude is null"
  "rangos de coordenadas en base" = $migration -match "latitude between -90 and 90" -and $migration -match "longitude between -180 and 180"
  "place id con limite" = $migration -match "length\(trim\(google_place_id\)\) between 1 and 200"
  "RPC guardar deriva auth uid" = $migration -match "save_own_qb_customer_location" -and $migration -match "auth\.uid\(\)"
  "RPC principal propia" = $migration -match "set_own_qb_customer_location_primary"
  "RPC desactivar propia" = $migration -match "deactivate_own_qb_customer_location"
  "serializacion por cliente" = $migration -match "pg_advisory_xact_lock"
  "search path endurecido" = ([regex]::Matches($migration, "(?m)^set search_path = pg_catalog$").Count -eq 4) -and $migration -match "set search_path = pg_catalog, extensions, private"
  "sin grants para anon" = $migration -notmatch "grant execute[\s\S]*to anon"
  "RPC solo para authenticated" = $migration -match "grant execute on function public\.save_own_qb_customer_location[^(]*\([^;]+\) to authenticated;" -and $migration -match "grant execute on function public\.set_own_qb_customer_location_primary\(uuid\) to authenticated;" -and $migration -match "grant execute on function public\.deactivate_own_qb_customer_location\(uuid\) to authenticated;"
  "snapshot solo antes de insertar" = $migration -match "before insert on public\.qb_orders"
  "snapshot agrega las tres propiedades" = $migration -match "'latitude'" -and $migration -match "'longitude'" -and $migration -match "'google_place_id'"
  "sin actualización histórica de pedidos" = $migration -notmatch "update public\.qb_orders"
  "validación de servidor finita" = $actions -match "z\.number\(\)\.finite\(\)"
  "identidad no llega desde formulario" = $actions -notmatch "customer_account_id:"
  "fallback exacto" = $picker -match "El mapa no est.* disponible en este momento\. Puedes escribir la direcci.*n manualmente\."
  "clave leída desde entorno público" = $picker -match "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
  "sin clave literal" = $picker -notmatch "AIza[0-9A-Za-z_-]{20,}"
  "sin registros de coordenadas" = $picker -notmatch "console\.(log|info|debug)"
  "guest admite coordenadas ausentes" = $guestTypes -match "latitude\?: number \| null" -and $guestActions -match "nullable\(\)\.optional\(\)"
  "direccion guest sigue obligatoria" = $guestActions -match "address: z\.string\(\)\.trim\(\)\.min\(5\)"
  "guest valida pareja opcional" = $guestActions -match "\(latitude === null\) !== \(longitude === null\)"
  "guest envia null a la RPC" = $guestActions -match "p_latitude: latitude\?\.toString\(\) \?\? null" -and $guestActions -match "p_longitude: longitude\?\.toString\(\) \?\? null"
  "submit guest no depende de geolocalizacion" = $guestForm -notmatch "locationStatus === .loading." -and $guestForm -match "Agregar el punto en el mapa ayuda"
  "DML directo revocado" = $migration -match "revoke insert, update, delete[\s\S]*on table public\.qb_customer_locations[\s\S]*from anon, authenticated;"
  "acciones usan solo RPC para DML" = $actions -notmatch "\.from\(.qb_customer_locations.\)[\s\S]*\.(insert|update|delete)\("
  "indice principal unica" = $migration -match "qb_customer_locations_one_active_primary_idx[\s\S]*where is_active = true and is_primary = true"
  "principal usa dos updates ordenados" = $migration -match "set_own_qb_customer_location_primary[\s\S]*set is_primary = false[\s\S]*set is_primary = true"
  "principal desmarca la activa actual" = $migration -match "set is_primary = false\s+where customer_account_id = v_user_id\s+and is_active = true\s+and is_primary = true;"
  "principal marca solo el destino propio" = $migration -match "set is_primary = true\s+where id = p_id\s+and customer_account_id = v_user_id\s+and is_active = true;"
  "principal verifica una fila actualizada" = $migration -match "get diagnostics v_updated_count = row_count;[\s\S]*v_updated_count <> 1[\s\S]*QB16_LOCATION_NOT_FOUND"
  "sin asignacion booleana de principal" = $migration -notmatch "set is_primary = \(id = p_id\)"
  "contrato SQL prueba cambio bidireccional repetido" = $sqlContract -match "no se cambi.* de A a B" -and $sqlContract -match "no se cambi.* de B a A" -and $sqlContract -match "no se cambi.* nuevamente de A a B" -and $sqlContract -match "unique_violation"
  "duplicados previos abortan" = $migration -match "QB16_DUPLICATE_ACTIVE_PRIMARY_LOCATIONS"
  "tres RPC validan cuenta activa" = ([regex]::Matches($migration, "where account\.id = v_user_id and account\.is_active = true").Count -eq 3)
  "snapshot exige propietario y activa" = $migration -match "location\.customer_account_id = new\.customer_account_id" -and $migration -match "location\.is_active = true"
  "snapshot rechaza ubicacion invalida" = $migration -match "QB16_INVALID_REGISTERED_LOCATION"
  "snapshot limpia claves anteriores" = $migration -match "- 'latitude'[\s\S]*- 'longitude'[\s\S]*- 'google_place_id'[\s\S]*\|\|"
  "telefono exige digitos reales" = $migration -match "regexp_replace\(phone, '\[\^0-9\]'" -and $migration -match "between 7 and 15"
  "carga regional en espanol" = $picker -match "language=es&region=BO"
  "autocomplete maneja gmp error" = $picker -match "addEventListener\(.gmp-error.[\s\S]*MAP_UNAVAILABLE_MESSAGE"
  "sin clave no muestra buscador vacio" = $picker -match "!readOnly && apiKey"
  "readonly sin punto no muestra mapa generico" = $picker -match "Esta ubicaci.*n fue guardada sin un punto en el mapa"
  "map id publico opcional" = $picker -match "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID" -and $envExample -match "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID="
  "documenta places new" = $documentation -match "Places API \(New\)"
  "documenta geocoding" = $documentation -match "Geocoding API"
  "documenta map id produccion" = $documentation -match "Map ID de tipo JavaScript"
  "contrato SQL no es read only" = $sqlContract -notmatch "set transaction read only" -and $sqlContract -match "(?m)^begin;" -and $sqlContract -match "(?m)^rollback;"
  "contrato SQL ejecuta RPC reales" = $sqlContract -match "public\.save_own_qb_customer_location\(" -and $sqlContract -match "public\.create_qb_guest_catalog_order\("
  "contrato SQL declara 40 escenarios" = $sqlContract -match "40::integer as scenarios_passed" -and $sqlContract -match "QB16_SQL_CONTRACT_OK"
  "HMAC idempotencia y rate limit conservados" = $migration -match "private\.qb_guest_order_idempotency" -and $migration -match "private\.qb_guest_order_rate_limits" -and $migration -match "least\(v_fingerprint_lock, v_phone_lock\)"
  "sin cambios de recibos o inventario" = $migration -notmatch "qb_receipts|inventory_movements|confirm_qb_order_delivery"
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
$checks.GetEnumerator() | ForEach-Object {
  $status = if ($_.Value) { "OK" } else { "FALLO" }
  Write-Host "[$status] $($_.Key)"
}

if ($failed.Count -gt 0) {
  throw "Contrato estático local QB-16: $($failed.Count) comprobaciones fallaron."
}

Write-Host "Contrato estático local QB-16 aprobado: $($checks.Count)/$($checks.Count)."
