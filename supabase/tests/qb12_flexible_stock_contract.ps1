$ErrorActionPreference = "Stop"

$repository = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path

function Read-RepositoryFile([string]$RelativePath) {
  return [System.IO.File]::ReadAllText((Join-Path $repository $RelativePath))
}

function Get-Segment([string]$Text, [string]$StartMarker, [string]$EndMarker) {
  $start = $Text.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  if ($start -lt 0) {
    throw "No se encontro el inicio esperado: $StartMarker"
  }

  $end = $Text.IndexOf($EndMarker, $start + $StartMarker.Length, [System.StringComparison]::Ordinal)
  if ($end -lt 0) {
    throw "No se encontro el final esperado: $EndMarker"
  }

  return $Text.Substring($start, $end - $start)
}

function Assert-Contract([bool]$Condition, [string]$Scenario) {
  if (-not $Condition) {
    throw "Fallo QB-12: $Scenario"
  }

  Write-Output "[OK] $Scenario"
}

$qb5 = Read-RepositoryFile "supabase/migrations/20260712090800_qb5_customer_catalog_orders.sql"
$qb6 = Read-RepositoryFile "supabase/migrations/20260712090900_qb6_order_preparation_delivery.sql"
$qb11 = Read-RepositoryFile "supabase/migrations/20260712091600_qb11_guest_order_rpc.sql"
$qb12 = Read-RepositoryFile "supabase/migrations/20260712091700_qb12_flexible_stock_availability.sql"
$orderData = Read-RepositoryFile "src/lib/qb-orders/data.ts"
$orderUi = Read-RepositoryFile "src/components/qb-orders/qb-orders-management.tsx"
$productData = Read-RepositoryFile "src/lib/products/data.ts"

$catalog = Get-Segment $qb6 "create or replace function public.get_qb_public_catalog()" "create or replace function public.start_qb_order_preparation"
$registeredOrder = Get-Segment $qb5 "create or replace function public.create_qb_catalog_order(" "create or replace function public.get_qb_public_catalog()"
$guestOrder = Get-Segment $qb11 "create or replace function public.create_qb_guest_catalog_order(" "revoke all on function public.create_qb_guest_catalog_order("
$preparation = Get-Segment $qb6 "create or replace function public.save_qb_order_preparation(" "create or replace function public.confirm_qb_order_delivery"
$catalogResult = Get-Segment $catalog "returns table (" "language sql"
$delivery = Get-Segment $qb12 "create or replace function public.confirm_qb_order_delivery(" "comment on function public.confirm_qb_order_delivery(uuid)"

Assert-Contract (-not $catalog.Contains("stock_current")) "01 - producto visible con stock cero no se filtra del catalogo"
Assert-Contract (-not $catalog.Contains("stock_current")) "02 - producto visible con stock negativo no se filtra del catalogo"
Assert-Contract ($catalog.Contains("settings.is_visible_in_qb_catalog = true")) "03 - producto oculto queda fuera del catalogo publico"
Assert-Contract (
  $registeredOrder.Contains("settings.is_visible_in_qb_catalog = true") -and
  -not $registeredOrder.Contains("stock_current")
) "04 - pedido registrado con stock cero no se bloquea por inventario"
Assert-Contract (
  $guestOrder.Contains("settings.is_visible_in_qb_catalog = true") -and
  -not $guestOrder.Contains("stock_current")
) "05 - pedido invitado con stock cero no se bloquea por inventario"
Assert-Contract (-not $preparation.Contains("stock_current")) "06 - preparacion superior al stock no se bloquea por inventario"
Assert-Contract ($qb12.Contains("v_stock_after := v_stock_before - v_item.actual_base_quantity;")) "07 - entrega descuenta exactamente la cantidad preparada y entregada"
Assert-Contract (
  $qb12.Contains("drop constraint if exists products_stock_current_check") -and
  $qb12.Contains("drop constraint if exists inventory_movements_stock_after_check") -and
  -not $qb12.Contains("Stock insuficiente para confirmar la entrega QB")
) "08 - entrega puede dejar existencia negativa"
Assert-Contract (
  $qb12.Contains("if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id)") -and
  $qb12.Contains("Este pedido QB ya tiene descuento de stock por entrega.")
) "09 - segunda confirmacion no descuenta dos veces"
Assert-Contract (-not $catalogResult.Contains("stock_current")) "10 - payload publico no expone stock_current"
Assert-Contract (
  $qb12.Contains("'salida',`r`n      v_item.actual_base_quantity") -or
  $qb12.Contains("'salida',`n      v_item.actual_base_quantity")
) "11 - movimiento registra la cantidad base entregada exacta"
Assert-Contract (
  $productData.Contains('.from("products")') -and
  -not ($productData -match 'productsQuery\s*=\s*productsQuery\.eq\("is_visible_in_qb_catalog",\s*true\)') -and
  -not $qb12.Contains("delete from public.products")
) "12 - producto oculto permanece disponible en herramientas internas"

Assert-Contract ($orderData.Contains("product:products(name, stock_current)")) "advertencia interna consulta la existencia vigente"
Assert-Contract ($orderUi.Contains("El stock registrado es insuficiente.")) "advertencia interna previa a una entrega que quedara negativa"

Assert-Contract ($delivery.Contains("security definer")) "seguridad 01 - la funcion mantiene SECURITY DEFINER"
Assert-Contract (
  ([regex]::Matches($delivery, '(?im)^set search_path = pg_catalog$').Count -eq 1)
) "seguridad 02 - el search_path es exactamente pg_catalog"
Assert-Contract (-not $delivery.Contains("set search_path = public")) "seguridad 03 - public no forma parte del search_path"
Assert-Contract (
  @(
    "public.profiles",
    "public.qb_orders",
    "public.qb_order_delivery_movements",
    "public.qb_order_preparations",
    "public.qb_order_preparation_items",
    "public.qb_conversion_snapshots",
    "public.products",
    "public.inventory_movements",
    "public.audit_logs"
  ).Where({ -not $delivery.Contains($_) }).Count -eq 0
) "seguridad 04 - todas las tablas y vistas usadas conservan public.*"
Assert-Contract ($delivery.Contains("auth.uid()")) "seguridad 05 - auth.uid() permanece calificado"
Assert-Contract (
  $delivery.Contains("('admin', 'administrador', 'inventario')")
) "seguridad 06 - se conserva el control de roles operativos"
Assert-Contract (
  $delivery.Contains("public.qb_order_delivery_movements where order_id = p_order_id")
) "seguridad 07 - se conserva el bloqueo de doble descuento"
Assert-Contract (
  $delivery.Contains("public.qb_conversion_snapshots snapshot") -and
  $delivery.Contains("snapshot.source_table = 'qb_order_preparation_items'") -and
  $delivery.Contains("abs(snapshot.source_quantity - v_item.actual_quantity)") -and
  $delivery.Contains("abs(snapshot.base_quantity - v_item.actual_base_quantity)")
) "seguridad 08 - se conserva la validacion del snapshot de conversion"
Assert-Contract (
  $delivery.Contains("'salida',`r`n      v_item.actual_base_quantity") -or
  $delivery.Contains("'salida',`n      v_item.actual_base_quantity")
) "seguridad 09 - el movimiento conserva actual_base_quantity"
Assert-Contract (
  $delivery.Contains("set status = 'entregado_pendiente_recibo'")
) "seguridad 10 - se conserva el estado final de entrega"
Assert-Contract (
  $delivery.Contains("insert into public.audit_logs") -and
  $delivery.Contains("'confirm_qb_order_delivery'")
) "seguridad 11 - se conserva el audit log"
Assert-Contract (
  -not [regex]::IsMatch($qb12, '(?im)^\s*(grant|revoke)\b')
) "seguridad 12 - la migracion no contiene GRANT ni REVOKE"
Assert-Contract (
  $delivery.Contains("abs(") -and
  $delivery.Contains("now()") -and
  $delivery.Contains("jsonb_build_object(")
) "seguridad auxiliar - abs, now y jsonb_build_object se resuelven en pg_catalog"

Write-Output "Contrato estático local QB-12: 12 escenarios funcionales, 2 comprobaciones auxiliares y 12 controles de seguridad aprobados."
