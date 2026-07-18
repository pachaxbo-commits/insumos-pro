$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migration = Get-Content (Join-Path $root "supabase\migrations\20260712093100_qb_pilot_stock_amount_contract.sql") -Raw
$stockAction = Get-Content (Join-Path $root "src\lib\operational-settings\actions.ts") -Raw
$amountAction = Get-Content (Join-Path $root "src\lib\products\actions.ts") -Raw
$orders = Get-Content (Join-Path $root "src\components\qb-orders\qb-orders-management.tsx") -Raw
$receipts = Get-Content (Join-Path $root "src\lib\qb-receipts\data.ts") -Raw

$checks = [ordered]@{
  "Single operational singleton" = $migration -match "qb_operational_settings_singleton_check"
  "Initial strict mode disabled" = $migration -match "strict_stock_control boolean not null default false"
  "Existing explicit mode preserved" = $migration -match "on conflict \(id\) do nothing"
  "No direct authenticated DML" = $migration -match "revoke all on table public.qb_operational_settings from public, anon, authenticated"
  "Internal read policy" = $migration -match "qb_operational_settings_internal_select"
  "Admin stock RPC" = $migration -match "QB_STOCK_ADMIN_REQUIRED"
  "Explicit activation phrase" = $migration -match "ACTIVAR CONTROL ESTRICTO"
  "Stock row lock" = $migration -match "(?s)from public.products product.*for update"
  "Strict insufficient guard" = $migration -match "QB_STOCK_INSUFFICIENT"
  "Available and missing values" = $migration -match "Existencia disponible" -and $migration -match "Faltante"
  "Delivery idempotency retained" = $migration -match "qb_order_delivery_movements"
  "Real delivered quantity retained" = $migration -match "v_item.actual_base_quantity"
  "Admin amount RPC" = $migration -match "QB_AMOUNT_ADMIN_REQUIRED"
  "Amount prerequisites" = $migration -match "QB_AMOUNT_PRICE_REQUIRED" -and $migration -match "QB_AMOUNT_CONVERSION_INVALID"
  "No automatic real enablement" = $migration -notmatch "(?s)update public.qb_product_unit_settings.{0,100}supports_amount_bs\s*=\s*true"
  "Fixed receipt amount" = $migration -match "fixed_line_amount = requested_amount_bs"
  "Private snapshot source" = $migration -match "private.qb_order_amount_snapshots"
  "Amount factors excluded" = $migration -match "when line.order_input_mode = 'amount_bs' then line.fixed_line_amount"
  "Server actions call only RPCs" = $stockAction -match 'rpc\("set_qb_strict_stock_control"' -and $amountAction -match 'rpc\("set_qb_product_amount_mode"'
  "UI preserves actual quantity" = $orders -match "Cantidad real" -and $receipts -match "fixedLineAmount"
  "Realtime publication added" = $migration -match "supabase_realtime add table public.qb_operational_settings"
  "No legacy project refs" = $migration -notmatch "epxmrfwtssbcqsytuwhf|wfhvuzigmkgojdoofjib"
  "No destructive database command" = $migration -notmatch "db reset|migration repair|SUPABASE_SCHEMA"
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
$checks.GetEnumerator() | ForEach-Object {
  Write-Host "[$(if ($_.Value) { 'PASS' } else { 'FAIL' })] $($_.Key)"
}
if ($failed.Count) { throw "Contrato estático del piloto falló: $($failed.Count)" }
Write-Host "Contrato estático local del piloto: $($checks.Count)/$($checks.Count)."
