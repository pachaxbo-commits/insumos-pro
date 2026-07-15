$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$migrationPath = Join-Path $repo "supabase/migrations/20260712091800_qb13_receipt_pending_prices.sql"
$qb7Path = Join-Path $repo "supabase/migrations/20260712091000_qb7_accumulated_receipts.sql"
$actionsPath = Join-Path $repo "src/lib/qb-receipts/actions.ts"
$dataPath = Join-Path $repo "src/lib/qb-receipts/data.ts"
$typesPath = Join-Path $repo "src/types/qb-receipts.ts"
$managementPath = Join-Path $repo "src/components/qb-receipts/qb-receipts-management.tsx"
$viewPath = Join-Path $repo "src/app/(private)/recibos/[id]/page.tsx"
$reportsDataPath = Join-Path $repo "src/lib/reports/data.ts"
$reportsUiPath = Join-Path $repo "src/components/reports/reports-management.tsx"
$reportsTypesPath = Join-Path $repo "src/types/reports.ts"

$requiredFiles = @(
  $migrationPath,
  $qb7Path,
  $actionsPath,
  $dataPath,
  $typesPath,
  $managementPath,
  $viewPath,
  $reportsDataPath,
  $reportsUiPath,
  $reportsTypesPath
)

foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) {
    throw "Falta archivo requerido para el contrato QB-13: $file"
  }
}

function Read-Utf8([string]$Path) {
  return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
}

function Get-Segment([string]$Text, [string]$Start, [string]$End) {
  $startIndex = $Text.IndexOf($Start, [StringComparison]::OrdinalIgnoreCase)
  if ($startIndex -lt 0) { throw "No se encontro el inicio del segmento: $Start" }
  $endIndex = $Text.IndexOf($End, $startIndex + $Start.Length, [StringComparison]::OrdinalIgnoreCase)
  if ($endIndex -lt 0) { throw "No se encontro el final del segmento: $End" }
  return $Text.Substring($startIndex, $endIndex - $startIndex)
}

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

$migration = Read-Utf8 $migrationPath
$qb7 = Read-Utf8 $qb7Path
$actions = Read-Utf8 $actionsPath
$data = Read-Utf8 $dataPath
$types = Read-Utf8 $typesPath
$management = Read-Utf8 $managementPath
$view = Read-Utf8 $viewPath
$reportsData = Read-Utf8 $reportsDataPath
$reportsUi = Read-Utf8 $reportsUiPath
$reportsTypes = Read-Utf8 $reportsTypesPath

$recalculate = Get-Segment $migration "create or replace function public.recalculate_qb_receipt_totals(" "create or replace function public.create_qb_receipt_draft("
$draft = Get-Segment $migration "create or replace function public.create_qb_receipt_draft(" "create or replace function public.update_qb_receipt_draft("
$update = Get-Segment $migration "create or replace function public.update_qb_receipt_draft(" "create or replace function public.emit_qb_receipt("
$emit = Get-Segment $migration "create or replace function public.emit_qb_receipt(" "comment on function public.create_qb_receipt_draft("
$void = Get-Segment $qb7 "create or replace function public.void_qb_receipt(" "revoke all on function public.qb_compound_unit_price("

$scenarios = @(
  @{
    Name = "Borrador con precio base NULL"
    Check = {
      $draft.Contains("settings.base_sale_price,") -and
      $draft.Contains("and settings.base_sale_price > 0 then settings.base_sale_price") -and
      -not $draft.Contains("settings.base_sale_price is null")
    }
  },
  @{
    Name = "Representacion segura de precio pendiente"
    Check = {
      $migration.Contains("alter column base_price_used drop not null") -and
      $migration.Contains("NULL representa precio pendiente") -and
      $types.Contains("basePriceUsed: number | null") -and
      $data.Contains("nullableNumberValue")
    }
  },
  @{
    Name = "Bloqueo de NULL, cero y negativos al emitir"
    Check = {
      $emit.Contains("base_price_used is not null") -and
      $emit.Contains("base_price_used > 0") -and
      $emit.Contains("base_price_used is null") -and
      $emit.Contains("base_price_used <= 0") -and
      $migration.Contains("base_price_used::text not in ('NaN', 'Infinity', '-Infinity')") -and
      $migration.Contains("base_price_used >= 0")
    }
  },
  @{
    Name = "Bloqueo de cantidad, linea, subtotal y total no positivos"
    Check = {
      $emit.Contains("delivered_base_quantity > 0") -and
      $emit.Contains("line_total > 0") -and
      $emit.Contains("v_line_count = 0") -and
      $emit.Contains("v_receipt.subtotal_amount <= 0") -and
      $emit.Contains("v_receipt.total_amount <= 0")
    }
  },
  @{
    Name = "Precio manual positivo"
    Check = {
      $update.Contains("v_line_price <= 0") -and
      $actions.Contains("z.number().finite().positive().max(99999999).nullable()") -and
      $management.Contains('min="0.0001"') -and
      $management.Contains('placeholder="Ingresa el precio"')
    }
  },
  @{
    Name = "Guardar precio como nueva base"
    Check = {
      $update.Contains("if v_save_new then") -and
      $update.Contains("set base_sale_price = v_line_price") -and
      $update.Contains("'precio_base_actualizado'") -and
      $management.Contains("saveAsNewBasePrice")
    }
  },
  @{
    Name = "Snapshot monetario conservado"
    Check = {
      $draft.Contains("original_base_price") -and
      $draft.Contains("base_price_used") -and
      $draft.Contains("conversion_snapshot_id") -and
      $update.Contains("base_price_edited = case") -and
      $update.Contains("else original_base_price is null")
    }
  },
  @{
    Name = "Recibo acumulativo conservado"
    Check = {
      $draft.Contains("p_order_ids uuid[]") -and
      $draft.Contains("orders.customer_account_id <> p_customer_account_id") -and
      $draft.Contains("insert into public.qb_receipt_orders") -and
      $draft.Contains("where orders.id = any(p_order_ids)")
    }
  },
  @{
    Name = "Anulacion libera pedidos sin restaurar inventario"
    Check = {
      $void.Contains("set inclusion_status = 'anulado'") -and
      $void.Contains("set status = 'entregado_pendiente_recibo'") -and
      -not $void.Contains("inventory_movements") -and
      -not $void.Contains("stock_current")
    }
  },
  @{
    Name = "Idempotencia y bloqueo de doble inclusion conservados"
    Check = {
      $draft.Contains("inclusion_status in ('borrador', 'emitido')") -and
      $qb7.Contains("qb_receipt_orders_active_order_unique_idx") -and
      $emit.Contains("Solo se pueden emitir recibos QB en borrador")
    }
  },
  @{
    Name = "Recibo emitido no editable"
    Check = {
      $update.Contains("if v_receipt.status <> 'borrador'") -and
      $update.Contains("Solo se pueden editar recibos QB en borrador")
    }
  },
  @{
    Name = "Interfaz bloquea emision y explica pendientes"
    Check = {
      $management.Contains("Precio pendiente") -and
      $management.Contains("disabled={emitPending || !canEmit}") -and
      $management.Contains("Puedes guardar el borrador con precios pendientes") -and
      $management.Contains("Cada precio escrito debe ser un n") -and
      $management.Contains("mero positivo v") -and
      $management.Contains("receipt.hasPendingPrices")
    }
  },
  @{
    Name = "Vista imprimible no presenta cero como precio definitivo"
    Check = {
      $view.Contains('if (value === null || value <= 0) return "Precio pendiente"') -and
      $view.Contains("receipt.hasPendingPrices") -and
      $view.Contains("PrintReceiptButton")
    }
  },
  @{
    Name = "Reportes y CSV identifican precios pendientes"
    Check = {
      $reportsTypes.Contains('pricingStatus: "pendiente" | "completo"') -and
      $reportsData.Contains('pricingStatus: hasPendingPrices ? "pendiente" : "completo"') -and
      $reportsData.Contains('total_recibo: row.totalAmount ?? ""') -and
      $reportsUi.Contains('row.totalAmount === null ? "Precio pendiente"')
    }
  },
  @{
    Name = "Guardas criticas permanecen en backend"
    Check = {
      $draft.Contains("security definer") -and
      $update.Contains("security definer") -and
      $emit.Contains("security definer") -and
      $draft.Contains("v_user_role not in ('admin', 'administrador')") -and
      $update.Contains("v_user_role not in ('admin', 'administrador')") -and
      $emit.Contains("v_user_role not in ('admin', 'administrador')") -and
      $recalculate.Contains("v_has_pending_or_invalid")
    }
  }
)

$securityAndPartialDraftScenarios = @(
  @{
    Name = "Las cuatro funciones usan search_path pg_catalog"
    Check = {
      @($recalculate, $draft, $update, $emit).Where({
        [regex]::IsMatch($_, '(?im)^\s*set search_path = pg_catalog\s*$')
      }).Count -eq 4
    }
  },
  @{
    Name = "La migracion no usa search_path public"
    Check = { -not [regex]::IsMatch($migration, '(?im)^\s*set search_path = public\s*$') }
  },
  @{
    Name = "Las cuatro funciones mantienen SECURITY DEFINER"
    Check = {
      @($recalculate, $draft, $update, $emit).Where({
        [regex]::IsMatch($_, '(?im)^\s*security definer\s*$')
      }).Count -eq 4
    }
  },
  @{
    Name = "Objetos de datos completamente calificados"
    Check = {
      $recalculate.Contains("public.qb_receipts") -and
      $recalculate.Contains("public.qb_receipt_lines") -and
      $recalculate.Contains("public.qb_receipt_orders") -and
      $draft.Contains("public.customer_accounts") -and
      $draft.Contains("public.qb_orders") -and
      $draft.Contains("public.qb_receipt_events") -and
      $update.Contains("public.qb_product_unit_settings") -and
      $emit.Contains("public.qb_receipt_events")
    }
  },
  @{
    Name = "auth.uid permanece calificado"
    Check = {
      @($recalculate, $draft, $update, $emit).Where({ $_.Contains("auth.uid()") }).Count -eq 4
    }
  },
  @{
    Name = "Recalculo valida usuario rol estado y bloquea la fila"
    Check = {
      $recalculate.Contains("v_user_id uuid := auth.uid()") -and
      $recalculate.Contains("where id = v_user_id and is_active = true") -and
      $recalculate.Contains("v_user_role not in ('admin', 'administrador')") -and
      $recalculate.Contains("v_receipt.status <> 'borrador'") -and
      $recalculate.Contains("Solo se pueden recalcular recibos en borrador") -and
      $recalculate.Contains("for update")
    }
  },
  @{
    Name = "NaN se rechaza al actualizar"
    Check = {
      $update.Contains("v_line_price::text in ('NaN', 'Infinity', '-Infinity')") -and
      $actions.Contains("z.number().finite()") -and
      $actions.Contains("El precio debe ser un n") -and
      $actions.Contains("mero positivo v") -and
      $actions.Contains("o quedar pendiente")
    }
  },
  @{
    Name = "NaN se rechaza al emitir"
    Check = {
      $emit.Contains("base_price_used::text not in ('NaN', 'Infinity', '-Infinity')") -and
      $emit.Contains("line_total::text in ('NaN', 'Infinity', '-Infinity')")
    }
  },
  @{
    Name = "Infinity y menos Infinity se rechazan"
    Check = {
      ([regex]::Matches($migration, "'Infinity', '-Infinity'").Count -ge 12) -and
      $update.Contains("numeric_value_out_of_range")
    }
  },
  @{
    Name = "Los cuatro factores rechazan valores especiales"
    Check = {
      $update.Contains("p_distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')") -and
      $update.Contains("p_exigency_factor_percent::text in ('NaN', 'Infinity', '-Infinity')") -and
      $update.Contains("p_weather_factor_percent::text in ('NaN', 'Infinity', '-Infinity')") -and
      $update.Contains("p_extraordinary_factor_percent::text in ('NaN', 'Infinity', '-Infinity')") -and
      $emit.Contains("v_receipt.distance_factor_percent::text in ('NaN', 'Infinity', '-Infinity')")
    }
  },
  @{
    Name = "Constraint monetaria rechaza valores especiales"
    Check = {
      $migration.Contains("add constraint qb_receipt_lines_prices_check check") -and
      ([regex]::Matches(
        (Get-Segment $migration "add constraint qb_receipt_lines_prices_check check" "comment on column public.qb_receipt_lines.base_price_used"),
        "::text not in \('NaN', 'Infinity', '-Infinity'\)"
      ).Count -eq 4)
    }
  },
  @{
    Name = "Linea vacia permanece NULL en borrador"
    Check = {
      $actions.Contains('if (!trimmed) return null') -and
      $update.Contains("if v_line_price_text is null then") -and
      $update.Contains("v_line_price := null")
    }
  },
  @{
    Name = "Borrador admite guardado parcial"
    Check = {
      $update.Contains("base_price_used = v_line_price") -and
      $update.Contains("case when v_line_price is null then false else v_save_new end") -and
      $management.Contains("hasPendingDraftLines") -and
      $management.Contains("disabled={updatePending || hasInvalidDraftLines}")
    }
  },
  @{
    Name = "Precio base nuevo requiere precio positivo"
    Check = {
      $update.Contains("if v_save_new and v_line_price is null then") -and
      $actions.Contains("line.basePriceUsed === null && line.saveAsNewBasePrice") -and
      $management.Contains('disabled={priceState !== "valid"}')
    }
  },
  @{
    Name = "Cero y negativos siguen rechazados"
    Check = {
      $update.Contains("v_line_price <= 0") -and
      $actions.Contains(".positive().max(99999999)") -and
      $management.Contains("parsed > 0")
    }
  },
  @{
    Name = "Borrador parcial no puede emitirse"
    Check = {
      $emit.Contains("v_valid_line_count <> v_line_count") -and
      $emit.Contains("El recibo contiene lineas pendientes o invalidas") -and
      $management.Contains("!hasPendingDraftLines") -and
      $management.Contains("!receipt.hasPendingPrices")
    }
  },
  @{
    Name = "Borrador completamente valorizado queda listo"
    Check = {
      $recalculate.Contains("v_has_pending_or_invalid") -and
      $recalculate.Contains("sum(line_total)") -and
      $management.Contains("receipt.subtotalAmount > 0") -and
      $management.Contains("receipt.totalAmount > 0")
    }
  },
  @{
    Name = "PDF reportes y CSV conservan pendientes"
    Check = {
      $view.Contains('return "Precio pendiente"') -and
      $reportsUi.Contains('"Precio pendiente"') -and
      $reportsData.Contains('total_recibo: row.totalAmount ?? ""')
    }
  },
  @{
    Name = "Migracion no cambia permisos"
    Check = { -not [regex]::IsMatch($migration, '(?im)^\s*(grant|revoke)\b') }
  },
  @{
    Name = "Migracion no redefine anulacion ni inventario"
    Check = {
      -not $migration.Contains("create or replace function public.void_qb_receipt") -and
      -not $migration.Contains("inventory_movements") -and
      -not $migration.Contains("stock_current")
    }
  }
)

$scenarios += $securityAndPartialDraftScenarios

$passed = 0
foreach ($scenario in $scenarios) {
  $ok = & $scenario.Check
  Assert-Contract $ok "FALLO: $($scenario.Name)"
  $passed++
  Write-Host "OK: $($scenario.Name)"
}

Assert-Contract (-not [regex]::IsMatch($migration, '(?im)^\s*(grant|revoke)\b')) "QB-13 no debe cambiar grants ni revokes."
Assert-Contract (-not $migration.Contains("create or replace function public.void_qb_receipt")) "QB-13 no debe redefinir la anulacion."
Assert-Contract (-not $migration.Contains("inventory_movements")) "QB-13 no debe modificar inventario."

Write-Host "Contrato estatico local QB-13 aprobado: $passed escenarios y 3 controles auxiliares."
