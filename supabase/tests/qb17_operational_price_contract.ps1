$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migration = Get-Content -LiteralPath (Join-Path $root "supabase\migrations\20260712092400_qb17_operational_price_management.sql") -Raw
$actions = Get-Content -LiteralPath (Join-Path $root "src\lib\products\actions.ts") -Raw
$component = Get-Content -LiteralPath (Join-Path $root "src\components\products\qb-product-price-management.tsx") -Raw

$checks = [ordered]@{
  "RPC is SECURITY DEFINER" = $migration -match "(?is)create or replace function public\.update_qb_product_base_price.*security definer"
  "RPC search_path is pg_catalog" = $migration -match "(?is)update_qb_product_base_price.*set search_path = pg_catalog"
  "Only authenticated can execute" = $migration -match "(?s)grant execute on function public\.update_qb_product_base_price.*?to authenticated"
  "Anon is revoked" = $migration -match "(?s)revoke all on function public\.update_qb_product_base_price.*?public, anon, authenticated"
  "Administrator role is required" = $migration -match "v_role not in \('admin', 'administrador'\)"
  "Positive price is required" = $migration -match "p_new_price <= 0"
  "Two decimals are enforced" = $migration -match "round\(p_new_price, 2\) <> p_new_price"
  "Product must be active" = $migration -match "QB_PRICE_PRODUCT_INACTIVE"
  "Pricing unit is validated" = $migration -match "QB_PRICE_UNIT_INVALID"
  "Concurrent changes are rejected" = $migration -match "QB_PRICE_CONCURRENT_CHANGE"
  "Audit captures old and new price" = $migration -match "previous_base_price" -and $migration -match "new_base_price"
  "Historical order snapshots are untouched" = $migration -notmatch "qb_order_amount_snapshots\s+(set|update|delete)"
  "Server Action is administrator-only" = $actions -match 'role !== "administrador"'
  "Server Action calls guarded RPC" = $actions -match 'rpc\("update_qb_product_base_price"'
  "Replacement confirmation is required" = $actions -match "confirm_replacement"
  "UI exposes search" = $component -match "Buscar producto"
  "UI exposes category filter" = $component -match "Todas las categorías"
  "UI exposes operational price states" = $component -match "Falta precio" -and $component -match "Unidad inválida" -and $component -match "No respaldado por BS"
  "UI explains historical price preservation" = $component -match "los recibos emitidos conservan sus importes originales"
  "Migration changes no stock" = $migration -notmatch "stock_current\s*="
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
$checks.GetEnumerator() | ForEach-Object { Write-Host ("[{0}] {1}" -f $(if ($_.Value) { "PASS" } else { "FAIL" }), $_.Key) }
if ($failed.Count -gt 0) { throw "Contrato estático QB-17 operativo falló: $($failed.Count) controles." }
Write-Host "Contrato estático local QB-17 operativo: $($checks.Count)/$($checks.Count)."
