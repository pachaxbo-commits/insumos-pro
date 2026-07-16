$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pagePath = Join-Path $root "src/app/(private)/recibos/[id]/page.tsx"
$actionsPath = Join-Path $root "src/components/qb-receipts/receipt-image-actions.tsx"
$managementPath = Join-Path $root "src/components/qb-receipts/qb-receipts-management.tsx"
$datePath = Join-Path $root "src/lib/date-time.ts"
$exportPath = Join-Path $root "src/lib/qb-receipts/receipt-export.ts"

$page = Get-Content -LiteralPath $pagePath -Raw -Encoding utf8
$actions = Get-Content -LiteralPath $actionsPath -Raw -Encoding utf8
$management = Get-Content -LiteralPath $managementPath -Raw -Encoding utf8
$dateHelper = Get-Content -LiteralPath $datePath -Raw -Encoding utf8
$exportHelper = Get-Content -LiteralPath $exportPath -Raw -Encoding utf8

$script:Passed = 0

function Assert-Contract {
  param(
    [string]$Name,
    [bool]$Condition
  )

  if (-not $Condition) {
    throw "QB-14 FAIL: $Name"
  }

  $script:Passed += 1
  Write-Output "PASS $($script:Passed.ToString('00')) - $Name"
}

$exportStart = $page.IndexOf('id={receiptTargetId}')
$actionsStart = $page.IndexOf('<ReceiptImageActions')

Assert-Contract "El recibo exportable contiene el codigo" (
  $exportStart -ge 0 -and $page.IndexOf('{receipt.number}', $exportStart) -gt $exportStart
)
Assert-Contract "Las lineas se renderizan dinamicamente dentro del recibo" (
  $page.IndexOf('receipt.lines.map', $exportStart) -gt $exportStart
)
Assert-Contract "El recibo contiene subtotal y total" (
  $page.IndexOf('<span>Subtotal</span>', $exportStart) -gt $exportStart -and
  $page.IndexOf('<span>Total</span>', $exportStart) -gt $exportStart
)
Assert-Contract "El recibo contiene el aviso no fiscal" (
  $page.IndexOf('No constituye factura fiscal', $exportStart) -gt $exportStart
)
Assert-Contract "La navegacion y los botones quedan fuera del nodo exportable" (
  $actionsStart -ge 0 -and $actionsStart -lt $exportStart -and
  $page.IndexOf('Volver') -lt $exportStart
)
Assert-Contract "El nombre PNG se sanitiza" (
  $exportHelper.Contains('unsafeFilenameCharacters') -and
  $exportHelper.Contains('QB-Insumos-Recibo-') -and
  $exportHelper.Contains('.png')
)
Assert-Contract "Los recibos largos usan la altura completa" (
  $actions.Contains('receipt.scrollHeight') -and
  $actions.Contains('height,') -and
  $actions.Contains('receipt.scrollWidth') -and
  $actions.Contains('qb-receipt-export-capturing') -and
  $page.Contains('data-qb-receipt-table')
)
Assert-Contract "Los dobles clics quedan bloqueados" (
  $actions.Contains('busyRef.current') -and
  $actions.Contains('disabled={busy}')
)
Assert-Contract "El flujo nativo comparte un archivo PNG" (
  $actions.Contains('navigator.canShare({ files: [file] })') -and
  $actions.Contains('navigator.share({') -and
  $actions.Contains('files: [preparedFile]')
)
Assert-Contract "El fallback descarga y abre WhatsApp" (
  $actions.Contains('downloadReceiptImage(file, filename)') -and
  $actions.Contains('buildWhatsAppShareUrl(shareMessage)')
)
Assert-Contract "El fallback no afirma que el archivo fue enviado" (
  -not $actions.Contains('archivo fue enviado') -and
  $actions.Contains('puedas adjuntarla desde Descargas')
)
Assert-Contract "Los errores de generacion tienen mensaje profesional" (
  $actions.Contains('No se pudo generar la imagen.')
)
Assert-Contract "La fecha civil usa America La Paz sin retroceder a UTC" (
  $dateHelper.Contains('America/La_Paz') -and
  $dateHelper.Contains('dateOnlyPattern') -and
  -not $dateHelper.Contains('T00:00:00')
)
Assert-Contract "Lista y detalle usan el mismo helper de fecha" (
  $page.Contains('formatBoliviaDate') -and
  $management.Contains('formatBoliviaDate') -and
  -not $management.Contains('function shortDate')
)
Assert-Contract "La impresion continua disponible" (
  $page.Contains('<PrintReceiptButton />') -and
  $page.Contains('print:hidden')
)
Assert-Contract "Descargar y compartir no llaman RPC financieras" (
  -not ($actions -match 'emitQbReceipt|updateQbReceipt|voidQbReceipt|createQbReceipt|rpc\(')
)
Assert-Contract "La exportacion no modifica el recibo" (
  -not ($actions -match 'Server Action|useActionState|revalidatePath|supabase')
)
Assert-Contract "Los botones no aparecen en impresion ni imagen" (
  $actionsStart -lt $exportStart -and $page.Contains('print:hidden')
)

$cachedBranchStart = $actions.IndexOf('if (preparedFile && canSharePngFile(preparedFile))')
$cachedShareCall = $actions.IndexOf('sharePromise = navigator.share', $cachedBranchStart)
$cachedBranchEnd = $actions.IndexOf('if (preparedFile) {', $cachedShareCall)
$cachedBeforeShare = $actions.Substring(
  $cachedBranchStart,
  $cachedShareCall - $cachedBranchStart
)
$firstMobileStart = $actions.IndexOf('if (nativeFileShare) {')
$firstMobilePreparationStart = $actions.LastIndexOf(
  'const file = createPngFile',
  $firstMobileStart
)
$firstMobileEnd = $actions.IndexOf('downloadReceiptImage(file, filename)', $firstMobileStart)
$firstMobileBranch = $actions.Substring(
  $firstMobilePreparationStart,
  $firstMobileEnd - $firstMobilePreparationStart
)

Assert-Contract "Existe un ref local para el File preparado" (
  $actions.Contains('preparedFileRef = useRef<File | null>(null)')
)
Assert-Contract "Descargar almacena el File y registra una sola descarga" (
  $actions.Contains('preparedFileRef.current = file') -and
  $actions.Contains('downloadedFileRef.current = file') -and
  $actions.Contains('downloadReceiptImage(file, filename)')
)
Assert-Contract "El primer clic movil prepara sin llamar share tras generar" (
  $firstMobileBranch.Contains('Imagen lista. Pulsa nuevamente') -and
  -not $firstMobileBranch.Contains('navigator.share')
)
Assert-Contract "El segundo clic comparte el File almacenado" (
  $cachedShareCall -gt $cachedBranchStart -and
  $actions.Contains('files: [preparedFile]')
)
Assert-Contract "Share se inicia antes de cualquier await en la rama cacheada" (
  -not ($cachedBeforeShare -match '\bawait\b')
)
Assert-Contract "El boton indica que puede abrir el menu" (
  $actions.Contains('Abrir men') -and $actions.Contains('para compartir')
)
Assert-Contract "AbortError se trata como cancelacion voluntaria" (
  $actions.Contains('error.name === "AbortError"') -and
  $actions.Contains('setStatus({ kind: "idle", message: null })')
)
Assert-Contract "NotAllowedError conserva el File preparado" (
  $actions.Contains('error.name === "NotAllowedError"') -and
  $actions.Contains('Pulsa nuevamente para intentarlo') -and
  ([regex]::Matches($actions, 'preparedFileRef\.current = null')).Count -eq 0
)
Assert-Contract "El fallback no reemplaza la pagina actual" (
  -not ($actions -match '\bwindow\.location\.(assign|replace)\b')
)
Assert-Contract "Popup bloqueado mantiene descarga e instrucciones manuales" (
  $actions.Contains('La imagen fue descargada. Abre WhatsApp Web') -and
  $actions.Contains('desde Descargas.')
)
Assert-Contract "El archivo permanece solo en memoria del componente" (
  -not ($actions -match 'localStorage|sessionStorage|supabase|fetch\(|rpc\(')
)
Assert-Contract "El bloqueo de doble clic sigue activo en ambos flujos" (
  $actions.Contains('if (busyRef.current) return;') -and
  $actions.Contains('disabled={busy}')
)

if ($script:Passed -ne 30) {
  throw "QB-14 FAIL: se esperaban 30 controles y aprobaron $script:Passed."
}

Write-Output "Contrato focalizado local QB-14 OK: 30/30 controles."
