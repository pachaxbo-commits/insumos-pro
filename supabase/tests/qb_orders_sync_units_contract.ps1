$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$migration = Get-Content -Raw -LiteralPath (Join-Path $root "supabase\migrations\20260712092900_qb_orders_realtime_units_guard.sql")
$hook = Get-Content -Raw -LiteralPath (Join-Path $root "src\components\qb-orders\use-qb-orders-synchronization.ts")
$ui = Get-Content -Raw -LiteralPath (Join-Path $root "src\components\qb-orders\qb-orders-management.tsx")
$actions = Get-Content -Raw -LiteralPath (Join-Path $root "src\lib\qb-orders\actions.ts")
$productUi = Get-Content -Raw -LiteralPath (Join-Path $root "src\components\products\product-management.tsx")
$productActions = Get-Content -Raw -LiteralPath (Join-Path $root "src\lib\products\actions.ts")
$publicationBlock = [regex]::Match(
  $migration,
  'foreach v_table_name[\s\S]*?end loop;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
).Value

$checks = [ordered]@{
  "Single authenticated browser channel" = ($hook -match 'channel\("qb-orders-operational-sync"\)' -and $hook -match 'createSupabaseBrowserClient')
  "Orders table observed" = $hook -match 'table: "qb_orders"'
  "Order items table observed" = $hook -match 'table: "qb_order_items"'
  "Preparations table observed" = $hook -match 'table: "qb_order_preparations"'
  "Preparation items table observed" = $hook -match 'table: "qb_order_preparation_items"'
  "Delivery movements table observed" = $hook -match 'table: "qb_order_delivery_movements"'
  "Channel cleanup exists" = $hook -match 'removeChannel\(channel\)'
  "Refresh is debounced" = $hook -match 'REFRESH_DEBOUNCE_MS = 750'
  "Visible polling is 15 seconds" = ($hook -match 'POLLING_INTERVAL_MS = 15_000' -and $hook -match 'visibilityState')
  "Focus and reconnection refresh" = ($hook -match '"focus"' -and $hook -match '"online"' -and $hook -match '"offline"')
  "Manual refresh exists" = ($hook -match 'refreshManually' -and $ui -match ': "Actualizar"')
  "Unsaved forms are preserved" = ($hook -match 'hasUnsavedChangesRef.current' -and $ui -match 'Descartar cambios y actualizar')
  "Stale confirmation is blocked" = ($ui -match 'synchronizationBlocked' -and $ui -match 'El pedido cambió en otro dispositivo')
  "Expected version reaches server" = ($ui -match 'expected_updated_at' -and $actions -match 'save_qb_order_preparation_versioned')
  "Version locks share the mutation transaction" = (($migration -split 'using errcode = ''40001''').Count -eq 5 -and ($migration -split 'for update;').Count -eq 6)
  "Versioned mutations validate internal roles" = (($migration -split 'No tienes permisos para modificar pedidos QB\.').Count -eq 5 -and $migration -match "'administrador', 'inventario'")
  "Conflicts request a refresh" = ($actions -match 'refreshRequired' -and $actions -match 'Actualiza la vista antes de continuar')
  "Realtime publication is focused" = (($publicationBlock -split "`n" | Select-String "'qb_.*'" | Measure-Object).Count -eq 5 -and $publicationBlock -notmatch 'customer_accounts|profiles|qb_customer_locations')
  "General unit trigger exists" = $migration -match 'before update of unit_id on public.products'
  "Canonical unit trigger exists" = $migration -match 'before update of base_unit_id, inventory_unit_id, base_inventory_unit_id'
  "Security functions use pg_catalog search path" = (($migration -split 'set search_path = pg_catalog').Count -eq 8)
  "Canonical unit is displayed first" = ($productUi -match 'base_inventory_unit_id' -and $productUi -match 'qbUnitsById.get\(unitId\)')
  "Product and units use one transactional RPC" = ($productActions -match 'save_qb_product_with_units' -and $migration -match 'insert into public.qb_product_unit_settings')
  "New product selects canonical units" = ($productUi -match 'base_unit_id' -and $productUi -match 'inventory_unit_id' -and $productUi -match 'price_unit_id')
  "Product RPC is administrator only" = ($migration -match "v_role not in \('admin', 'administrador'\)" -and $migration -match 'from public, anon, authenticated')
  "No browser service role" = ($hook -notmatch 'service[_-]?role' -and $ui -notmatch 'service[_-]?role')
}

$failed = 0
foreach ($entry in $checks.GetEnumerator()) {
  if ($entry.Value) {
    Write-Host "[PASS] $($entry.Key)"
  } else {
    Write-Host "[FAIL] $($entry.Key)"
    $failed++
  }
}

if ($failed -gt 0) {
  throw "Contrato estático de sincronización y unidades: $failed comprobaciones fallaron."
}

Write-Host "Contrato estático local de sincronización y unidades: $($checks.Count)/$($checks.Count)."
