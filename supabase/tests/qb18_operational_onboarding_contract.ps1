$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$migration = Get-Content (Join-Path $root "supabase\migrations\20260712092500_qb18_operational_onboarding_imports.sql") -Raw
$actions = Get-Content (Join-Path $root "src\lib\operational-activation\actions.ts") -Raw
$route = Get-Content -LiteralPath (Join-Path $root "src\app\api\operational-activation\templates\[type]\route.ts") -Raw
$checks = [ordered]@{
  "Private batch table" = $migration -match "private.qb_operational_import_batches"
  "Applied hash is unique" = $migration -match "applied_hash_idx"
  "No table grants" = $migration -match "revoke all on table private.qb_operational_import_batches"
  "Apply RPC security definer" = $migration -match "(?s)apply_qb_operational_import.*security definer"
  "Safe search path" = $migration -match "(?s)apply_qb_operational_import.*set search_path = pg_catalog"
  "Anon revoked" = $migration -match "(?s)revoke all on function public.apply_qb_operational_import.*anon"
  "Administrator enforced" = $migration -match "QB_OPERATIONAL_ADMIN_REQUIRED"
  "Explicit confirmation" = $migration -match "p_confirmation <> 'APLICAR'"
  "File hash validated" = $migration -match "\^\[a-f0-9\]\{64\}\$"
  "Row limit enforced" = $migration -match "v_total > 500"
  "Price RPC reused" = $migration -match "update_qb_product_base_price"
  "Price concurrency preserved" = $migration -match "QB_PRICE_CONCURRENT_CHANGE"
  "No price-unit mutation" = $migration -notmatch "set base_price_unit_id"
  "Conversion uses existing targets" = $migration -match "qb_units where id=v_target_id" -and $migration -match "qb_product_presentations where id=v_target_id"
  "Conversion creates no stock" = $migration -notmatch "stock_current\s*="
  "Stock creates opening receipt" = $migration -match "INGRESO-APERTURA"
  "Stock uses receipt confirmation" = $migration -match "confirm_qb_merchandise_receipt"
  "Snapshots are created" = $migration -match "insert into public.qb_conversion_snapshots"
  "Preview has no RPC" = ($actions.Substring($actions.IndexOf("export async function preview"), $actions.IndexOf("export async function apply")-$actions.IndexOf("export async function preview"))) -notmatch "\.rpc\("
  "Download is admin-only" = $route -match 'role !== "administrador"'
  "Download is no-store" = $route -match "no-store"
  "No public file storage" = $actions -notmatch "storage"
  "No legacy objects" = $migration -notmatch "purchases|sales|payments|cash_movements"
  "No order mutation" = $migration -notmatch "update public.qb_orders|insert into public.qb_orders"
  "No receipt billing mutation" = $migration -notmatch "qb_receipts"
}
$failed=@($checks.GetEnumerator()|?{-not $_.Value}); $checks.GetEnumerator()|%{Write-Host "[$(if($_.Value){'PASS'}else{'FAIL'})] $($_.Key)"}; if($failed.Count){throw "Contrato QB-18 falló: $($failed.Count)"}; Write-Host "Contrato estático local QB-18: $($checks.Count)/$($checks.Count)."
