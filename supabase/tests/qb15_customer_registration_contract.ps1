$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$migrationPath = Join-Path $root "supabase/migrations/20260712091900_qb15_public_customer_registration.sql"
$actionsPath = Join-Path $root "src/lib/customer-registration/actions.ts"
$accountPath = Join-Path $root "src/lib/customer-registration/account.ts"
$validationPath = Join-Path $root "src/lib/customer-registration/validation.ts"
$registrationPagePath = Join-Path $root "src/app/registro/page.tsx"
$registrationFormPath = Join-Path $root "src/components/customer-account/customer-registration-form.tsx"
$loginActionPath = Join-Path $root "src/lib/auth/actions.ts"
$loginFormPath = Join-Path $root "src/components/auth/login-form.tsx"
$callbackPath = Join-Path $root "src/app/mi-cuenta/auth/callback/route.ts"
$portalPath = Join-Path $root "src/components/customer-account/customer-portal.tsx"
$guestPath = Join-Path $root "src/components/catalog/guest-checkout-form.tsx"
$cartPath = Join-Path $root "src/hooks/use-local-cart.ts"
$sqlContractPath = Join-Path $root "supabase/tests/qb15_customer_registration_sql_contract.sql"
$qbCatalogActionPath = Join-Path $root "src/lib/qb-catalog/actions.ts"
$nodeTestPath = Join-Path $root "scripts/qb15-customer-registration.test.mjs"

$migration = Get-Content -LiteralPath $migrationPath -Raw -Encoding utf8
$actions = Get-Content -LiteralPath $actionsPath -Raw -Encoding utf8
$account = Get-Content -LiteralPath $accountPath -Raw -Encoding utf8
$validation = Get-Content -LiteralPath $validationPath -Raw -Encoding utf8
$registrationPage = Get-Content -LiteralPath $registrationPagePath -Raw -Encoding utf8
$registrationForm = Get-Content -LiteralPath $registrationFormPath -Raw -Encoding utf8
$loginAction = Get-Content -LiteralPath $loginActionPath -Raw -Encoding utf8
$loginForm = Get-Content -LiteralPath $loginFormPath -Raw -Encoding utf8
$callback = Get-Content -LiteralPath $callbackPath -Raw -Encoding utf8
$portal = Get-Content -LiteralPath $portalPath -Raw -Encoding utf8
$guest = Get-Content -LiteralPath $guestPath -Raw -Encoding utf8
$cart = Get-Content -LiteralPath $cartPath -Raw -Encoding utf8
$sqlContract = Get-Content -LiteralPath $sqlContractPath -Raw -Encoding utf8
$qbCatalogAction = Get-Content -LiteralPath $qbCatalogActionPath -Raw -Encoding utf8
$nodeTest = Get-Content -LiteralPath $nodeTestPath -Raw -Encoding utf8

$script:Passed = 0

function Assert-Contract {
  param(
    [string]$Name,
    [bool]$Condition
  )

  if (-not $Condition) {
    throw "QB-15 FAIL: $Name"
  }

  $script:Passed += 1
  Write-Output "PASS $($script:Passed.ToString('00')) - $Name"
}

Assert-Contract "Registro valido crea Auth y completa cuenta cliente" (
  $actions.Contains('supabase.auth.signUp') -and
  $actions.Contains('completeOwnCustomerAccount') -and
  $account.Contains('register_own_customer_account')
)
Assert-Contract "Se crea exactamente una customer_account propia" (
  $migration.Contains("where id = v_user_id") -and
  $migration.Contains("pg_advisory_xact_lock") -and
  $migration.Contains("insert into public.customer_accounts")
)
Assert-Contract "El registro no crea public profiles" (
  -not ($migration -match 'insert\s+into\s+public\.profiles') -and
  $migration.Contains("from public.profiles")
)
Assert-Contract "La cuenta cliente queda activa" (
  $migration -match 'phone,\s*is_active\s*\)\s*values' -and
  $migration -match 'v_phone,\s*true'
)
Assert-Contract "No se asigna ningun rol interno" (
  -not ($migration -match 'insert\s+into\s+public\.profiles|role\s*:|p_role|is_admin') -and
  -not ($registrationForm -match 'name="(role|active|id)"')
)
Assert-Contract "Correo repetido tiene mensaje profesional" (
  $actions.Contains("Ya existe una cuenta con este correo.") -and
  $actions.Contains("para continuar.")
)
Assert-Contract "Auth parcial puede completar vinculacion segura" (
  $loginAction.Contains("completeOwnCustomerAccount") -and
  $callback.Contains("completeOwnCustomerAccount") -and
  $registrationPage.Contains("customer_accounts")
)
Assert-Contract "Usuario interno no puede convertirse en cliente" (
  $migration.Contains("return 'internal_user'") -and
  $migration.Contains("from public.profiles") -and
  $actions.Contains("Este correo pertenece a un acceso interno")
)
Assert-Contract "Contrasenas diferentes se rechazan" (
  $validation.Contains("value.password === value.password_confirmation") -and
  $validation.Contains("no coinciden.")
)
Assert-Contract "Email invalido se rechaza" (
  $validation.Contains('z.email("Ingresa un correo')
)
Assert-Contract "WhatsApp vacio se rechaza" (
  $validation.Contains("digits.length >= 7") -and
  $validation.Contains("WhatsApp")
)
Assert-Contract "Doble clic no duplica cuentas" (
  $registrationForm.Contains("disabled={pending}") -and
  $migration.Contains("pg_advisory_xact_lock") -and
  $migration.Contains("already_registered")
)
Assert-Contract "Return externo se rechaza" (
  $validation.Contains("CUSTOMER_REGISTRATION_RETURN_PATHS") -and
  $validation.Contains("some((path) => path === value)") -and
  $validation.Contains(": fallback")
)
Assert-Contract "Return seguro vuelve al checkout" (
  $validation.Contains('"/catalogo/checkout"') -and
  $actions.Contains("redirect(returnTo)")
)
Assert-Contract "El carrito permanece durante registro" (
  $cart.Contains("insumos-pro:catalog-cart:v1") -and
  -not ($registrationForm -match 'saveLocalCart\(\[\]\)|localStorage\.removeItem')
)
Assert-Contract "Cliente nuevo entra en Mi cuenta" (
  $validation.Contains('fallback: CustomerRegistrationReturnPath = "/mi-cuenta"') -and
  $registrationPage.Contains("redirect(returnTo)")
)
Assert-Contract "Historial y ubicaciones empiezan vacios" (
  -not ($migration -match 'insert\s+into\s+public\.qb_customer_locations|insert\s+into\s+public\.qb_orders') -and
  $portal.Contains("no tienes pedidos.") -and
  $portal.Contains("no tienes ubicaciones guardadas.") -and
  $portal.Contains("Nueva ubicacion")
)
Assert-Contract "No se usa service role en registro cliente" (
  -not ($actions -match 'service_role|createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY') -and
  -not ($registrationForm -match 'service_role|SUPABASE_SERVICE_ROLE_KEY')
)
Assert-Contract "No se registran secretos o contrasenas" (
  -not ($actions -match 'console\.(log|info|debug)|password.*console|token.*console') -and
  -not ($registrationForm -match 'localStorage|sessionStorage|console\.(log|info|debug)')
)
Assert-Contract "El flujo invitado continua disponible" (
  $guest.Contains("Continuar sin cuenta") -and
  $guest.Contains("Crear una cuenta") -and
  $guest.Contains("submitQbGuestCatalogOrderAction")
)

Assert-Contract "La RPC usa SECURITY DEFINER y search_path pg_catalog" (
  $migration.Contains("security definer") -and
  $migration.Contains("set search_path = pg_catalog")
)
Assert-Contract "La RPC deriva identidad y correo de la sesion" (
  $migration.Contains("auth.uid()") -and
  $migration.Contains("auth.jwt() ->> 'email'") -and
  -not ($migration -match 'p_user_id|p_email')
)
Assert-Contract "La RPC no se concede a anon" (
  $migration.Contains("from public, anon") -and
  $migration.Contains("to authenticated") -and
  -not ($migration -match 'grant execute[\s\S]*to anon')
)
Assert-Contract "Registro tiene proteccion de origen y honeypot" (
  $actions.Contains("isSameOriginRequest") -and
  $actions.Contains("company_website")
)

Assert-Contract "INSERT directo queda revocado explicitamente" (
  $migration.Contains(
    "revoke insert on table public.customer_accounts from anon, authenticated;"
  )
)
Assert-Contract "Confirmacion de contrasena usa limites de 8 a 72" (
  $validation -match 'password_confirmation:\s*z\s*\.string\(\)\s*\.min\(8,' -and
  $validation -match 'password_confirmation:[\s\S]*?\.max\(72,'
)
Assert-Contract "Callback conserva el retorno seguro ante error de vinculacion" (
  $callback.Contains('getSafeCustomerReturnPath(requestedNext)') -and
  $callback.Contains('registrationUrl.searchParams.set("returnTo", next)') -and
  $callback.Contains('registrationUrl.searchParams.set(') -and
  $callback.Contains('"error"')
)
Assert-Contract "Existe contrato SQL transaccional con cobertura QB-15" (
  $sqlContract.Contains("begin;") -and
  $sqlContract.Contains("rollback;") -and
  $sqlContract.Contains("has_function_privilege") -and
  $sqlContract.Contains("has_table_privilege") -and
  $sqlContract.Contains("'unauthenticated'") -and
  $sqlContract.Contains("'internal_user'") -and
  $sqlContract.Contains("'already_registered'") -and
  $sqlContract.Contains("'inactive_account'") -and
  $sqlContract.Contains("public.update_qb_customer_profile") -and
  $sqlContract.Contains("SECURITY DEFINER") -and
  $sqlContract.Contains("search_path=pg_catalog") -and
  $sqlContract.Contains("sin residuos")
)

Assert-Contract "WhatsApp exige entre 7 y 15 digitos en TypeScript" (
  $validation.Contains('value.replace(/\D/g, "")') -and
  $validation.Contains("digits.length >= 7") -and
  $validation.Contains("digits.length <= 15") -and
  $validation.Contains("WhatsApp")
)
Assert-Contract "Registro y perfil comparten la validacion WhatsApp" (
  $validation.Contains("isValidWhatsApp") -and
  $qbCatalogAction.Contains("isValidWhatsApp") -and
  $qbCatalogAction.Contains("normalizeRegistrationText")
)
Assert-Contract "SQL valida cantidad real de digitos en ambas RPC" (
  ([regex]::Matches($migration, "regexp_replace\(v_phone, '\[\^0-9\]', '', 'g'\)")).Count -eq 2 -and
  ([regex]::Matches($migration, 'length\(v_phone_digits\) not between 7 and 15')).Count -eq 2
)
Assert-Contract "Simbolos y longitudes invalidas tienen pruebas focalizadas" (
  $nodeTest.Contains('"-------"') -and
  $nodeTest.Contains('"+++++++"') -and
  $nodeTest.Contains('"()()()"') -and
  $nodeTest.Contains('1234567890123456') -and
  $sqlContract.Contains("'-------'") -and
  $sqlContract.Contains("'1234567890123456'")
)
Assert-Contract "INSERT y UPDATE directos quedan revocados" (
  $migration.Contains(
    "revoke insert on table public.customer_accounts from anon, authenticated;"
  ) -and
  $migration.Contains(
    "revoke update on table public.customer_accounts from anon, authenticated;"
  ) -and
  $migration.Contains("public.update_own_customer_account(")
)
Assert-Contract "RPC de perfil limita identidad y campos modificados" (
  -not ($migration -match 'p_(id|auth_user_id|email|is_active|role)') -and
  $migration -match 'update public\.customer_accounts\s+set\s+full_name = v_business_name,\s+business_name = v_business_name,\s+responsible_name = v_responsible_name,\s+phone = v_phone' -and
  $migration.Contains("where id = v_user_id") -and
  $migration.Contains("and is_active = true") -and
  $migration.Contains("from public.profiles")
)
Assert-Contract "Contrato SQL protege privilegios y campos sensibles" (
  $sqlContract.Contains("has_table_privilege('authenticated', 'public.customer_accounts', 'UPDATE')") -and
  $sqlContract.Contains("has_column_privilege('authenticated', 'public.customer_accounts', 'email', 'UPDATE')") -and
  $sqlContract.Contains("has_column_privilege('authenticated', 'public.customer_accounts', 'is_active', 'UPDATE')") -and
  $sqlContract.Contains("public.update_own_customer_account(text,text,text,text,text,text)") -and
  $sqlContract.Contains("una identidad interna no debe actualizar")
)

if ($script:Passed -ne 35) {
  throw "QB-15 FAIL: se esperaban 35 controles y aprobaron $script:Passed."
}

Write-Output "Contrato estático local QB-15 OK: 35/35 controles."
