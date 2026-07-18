$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$classification = Get-Content -LiteralPath (Join-Path $root "supabase\migrations\20260712092700_classified_receipt_percentages.sql") -Raw
$storage = Get-Content -LiteralPath (Join-Path $root "supabase\migrations\20260712092800_product_catalog_images.sql") -Raw
$actions = Get-Content -LiteralPath (Join-Path $root "src\lib\qb-ingresos\actions.ts") -Raw
$productActions = Get-Content -LiteralPath (Join-Path $root "src\lib\products\actions.ts") -Raw

$checks = [ordered]@{
  "Classification RPC is SECURITY DEFINER" = $classification -match "(?is)save_qb_merchandise_classification_percentages.*security definer"
  "Classification RPC search_path is pg_catalog" = $classification -match "(?is)save_qb_merchandise_classification_percentages.*set search_path = pg_catalog"
  "Authentication is derived from auth.uid" = $classification -match "v_user_id uuid := auth.uid\(\)"
  "Only admin and inventory roles can classify" = $classification -match "not in \('admin', 'administrador', 'inventario'\)"
  "Only draft classified lines are accepted" = $classification -match "QB_CLASSIFICATION_DRAFT_REQUIRED" -and $classification -match "QB_CLASSIFICATION_NOT_REQUIRED"
  "Percentages must total exactly 100" = $classification -match "v_percentage_total <> 100"
  "Only active configured product outputs are accepted" = $classification -match "output_type = 'product'" -and $classification -match "product.is_active = true"
  "Duplicate outputs are rejected" = $classification -match "QB_CLASSIFICATION_DUPLICATE_OUTPUT"
  "Residual quantity is assigned to the final positive output" = $classification -match "v_line.base_quantity - v_quantity_total"
  "Six decimal quantities are persisted" = $classification -match "round\(v_line.base_quantity - v_quantity_total, 6\)"
  "Cost residual is conserved" = $classification -match "v_line.total_cost - v_cost_total"
  "Calculation policy is snapshotted" = $classification -match "classified-percentage-v1" -and $classification -match "last_positive_output"
  "Direct classification-result mutation policy is removed" = $classification -match "drop policy if exists `"Inventory roles can manage QB merchandise classification results`""
  "Product configuration is administrator-only" = $classification -match "Administrators can insert products" -and $classification -match "Administrators can insert QB classification outputs"
  "Server Action calls the guarded percentage RPC" = $actions -match 'rpc\("save_qb_merchandise_classification_percentages"'
  "Existing receipt confirmation RPC remains" = $actions -match 'rpc\("confirm_qb_merchandise_receipt"'
  "Storage bucket is public only for catalog reads" = $storage -match "Public can view product catalog images" -and $storage -match "bucket_id = 'product-images'"
  "Storage writes require administrator" = $storage -match "Administrators can upload product catalog images" -and $storage -match "current_user_role\(\) in \('admin', 'administrador'\)"
  "Storage limits MIME and size" = $storage -match "image/jpeg" -and $storage -match "image/png" -and $storage -match "image/webp" -and $storage -match "5242880"
  "Server validates image signatures" = $productActions -match "detectProductImage" -and $productActions -match "value.type !== detected.mime"
  "No service-role credential is used" = $classification -notmatch "service_role_key|SUPABASE_SERVICE_ROLE" -and $storage -notmatch "service_role_key|SUPABASE_SERVICE_ROLE"
  "Migrations do not grant anon business execution" = $classification -notmatch "grant execute.*to anon" -and $storage -notmatch "grant .* to anon"
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value })
$checks.GetEnumerator() | ForEach-Object { Write-Host ("[{0}] {1}" -f $(if ($_.Value) { "PASS" } else { "FAIL" }), $_.Key) }
if ($failed.Count -gt 0) { throw "Contrato estatico de recepcion clasificada fallo: $($failed.Count) controles." }
Write-Host "Contrato estatico local de recepcion clasificada: $($checks.Count)/$($checks.Count)."
