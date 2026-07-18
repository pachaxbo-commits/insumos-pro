$ErrorActionPreference = "Stop"

function Read-RepoFile([string]$Path) {
  return Get-Content -Raw -LiteralPath $Path -Encoding UTF8
}

$migration = Read-RepoFile "supabase/migrations/20260712092300_qb17_amount_based_orders.sql"
$sql = Read-RepoFile "supabase/tests/qb17_amount_orders_sql_contract.sql"
$catalog = Read-RepoFile "src/components/catalog/public-catalog.tsx"
$checkout = Read-RepoFile "src/components/catalog/public-checkout.tsx"
$guest = Read-RepoFile "src/lib/qb-catalog/guest-actions.ts"
$registered = Read-RepoFile "src/lib/qb-catalog/actions.ts"
$internal = Read-RepoFile "src/lib/qb-orders/actions.ts"
$preparation = Read-RepoFile "src/components/qb-orders/qb-orders-management.tsx"
$repeat = Read-RepoFile "src/components/customer-account/customer-portal.tsx"
$reports = Read-RepoFile "src/lib/reports/data.ts"

$checks = [ordered]@{
  "01 quantity historico" = $migration.Contains("order_input_mode text not null default 'quantity'")
  "02 amount registrado" = $registered.Contains('create_qb17_catalog_order')
  "03 amount invitado" = $guest.Contains('create_qb17_guest_catalog_order')
  "04 amount interno" = $internal.Contains('create_qb17_internal_catalog_order')
  "05 importe cero" = $migration.Contains('v_amount <= 0')
  "06 importe negativo" = $sql.Contains("(6, 'Importe negativo rechazado'")
  "07 precio nulo" = $migration.Contains('settings.base_sale_price > 0')
  "08 precio cero" = $sql.Contains("(8, 'Precio cero rechazado'")
  "09 habilitacion BS" = $migration.Contains('settings.supports_amount_bs = true')
  "10 precio no autoritativo" = $sql.Contains("(10, 'Precio cliente no es autoridad'")
  "11 factor no autoritativo" = $sql.Contains("(11, 'Factor cliente no es autoridad'")
  "12 snapshot precio" = $migration.Contains('price_base_snapshot numeric(18, 4) not null')
  "13 snapshot factor" = $migration.Contains('conversion_factor_snapshot numeric(18, 9) not null')
  "14 conversion" = $migration.Contains('v_pricing_factor / v_base_factor')
  "15 redondeo" = $migration.Contains('round_half_away_from_zero_pricing_3_base_6')
  "16 idempotencia" = $sql.Contains("(16, 'Idempotencia conservada'")
  "17 catalogo sin precio" = $migration.Contains('amount_bs_available boolean') -and -not $catalog.Contains('base_sale_price')
  "18 preparacion fisica" = $preparation.Contains('estimatedRequestedQuantity')
  "19 stock no cambia crear" = $sql.Contains("(19, 'Stock no cambia al crear'")
  "20 stock no cambia preparar" = $sql.Contains("(20, 'Stock no cambia al preparar'")
  "21 entrega cantidad real" = $sql.Contains("(21, 'Entrega descuenta cantidad fisica real'")
  "22 doble entrega" = $sql.Contains("(22, 'Doble entrega no duplica descuento'")
  "23 recibo cantidad real" = $sql.Contains('delivered_base_quantity=v_actual_base')
  "24 importe conservado" = $checkout.Contains('requestedAmountBs')
  "25 repeticion recalcula" = $repeat.Contains('inputMode: "amount_bs"') -and -not $repeat.Contains('priceBaseSnapshot')
  "26 RLS registrado" = $sql.Contains("has_table_privilege('authenticated', 'public.qb_order_items', 'INSERT,UPDATE,DELETE')")
  "27 ACL invitado" = $migration.Contains('to service_role;')
  "28 rol interno" = $migration.Contains('create_qb17_internal_catalog_order')
  "29 exportacion segura" = -not ($catalog + $checkout + $reports).Contains('price_base_snapshot')
  "30 rollback" = $sql.TrimEnd().EndsWith('rollback;')
  "31 cero residuos" = $sql.Contains('on commit drop') -and $sql.Contains("(31, 'Cero residuos previsto'")
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
$checks.GetEnumerator() | ForEach-Object {
  Write-Host ("[{0}] {1}" -f ($(if ($_.Value) { "OK" } else { "FAIL" })), $_.Key)
}

if ($failed.Count -gt 0) {
  throw "Contrato estatico QB-17 fallo: $($failed.Count) controles."
}

Write-Host "Contrato estatico local QB-17: 31/31 controles aprobados."
