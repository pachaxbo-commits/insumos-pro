$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$pagePath = Join-Path $root "src/app/(private)/recibos/[id]/page.tsx"
$actionsPath = Join-Path $root "src/components/qb-receipts/receipt-image-actions.tsx"
$documentPath = Join-Path $root "src/components/qb-receipts/receipt-document.tsx"
$managementPath = Join-Path $root "src/components/qb-receipts/qb-receipts-management.tsx"
$datePath = Join-Path $root "src/lib/date-time.ts"
$exportPath = Join-Path $root "src/lib/qb-receipts/receipt-export.ts"

$page = Get-Content -LiteralPath $pagePath -Raw -Encoding utf8
$actions = Get-Content -LiteralPath $actionsPath -Raw -Encoding utf8
$document = Get-Content -LiteralPath $documentPath -Raw -Encoding utf8
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

$exportStart = $page.IndexOf('variant="customer-export"')
$actionsStart = $page.IndexOf('<ReceiptImageActions')

Assert-Contract "El recibo exportable contiene el codigo" (
  $exportStart -ge 0 -and $document.Contains('{receipt.number}')
)
Assert-Contract "Las lineas se renderizan dinamicamente dentro del recibo" (
  $document.Contains('receipt.lines.map')
)
Assert-Contract "La vista admin contiene subtotal y total" (
  $document.Contains('<span>Subtotal</span>') -and
  $document.Contains('<span>Total</span>') -and
  $document -match '!isCustomerExport\s*\?\s*\([\s\S]*?<span>Subtotal</span>[\s\S]*?receipt\.subtotalAmount'
)
Assert-Contract "La vista interna conserva el aviso no fiscal" (
  $document.Contains('No constituye factura fiscal') -and
  $document.Contains('!isCustomerExport ? (')
)
Assert-Contract "La navegacion y los botones quedan fuera del nodo exportable" (
  $actionsStart -ge 0 -and $actionsStart -lt $exportStart -and
  $page.IndexOf('Volver') -lt $exportStart -and
  -not $document.Contains('<ReceiptImageActions') -and
  -not $document.Contains('<PrintReceiptButton')
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
  $document.Contains('data-qb-receipt-table')
)
Assert-Contract "Los dobles clics quedan bloqueados" (
  $actions.Contains('busyRef.current') -and
  $actions.Contains('disabled={busy}')
)
Assert-Contract "El flujo nativo comparte un archivo PNG" (
  $actions.Contains('navigator.canShare({ files: [file] })') -and
  $actions.Contains('shouldUseNativeFileShare(preparedFile)') -and
  $actions.Contains('navigator.share({') -and
  $actions.Contains('files: [preparedFile]')
)
Assert-Contract "El fallback descarga y abre WhatsApp" (
  $actions.Contains('downloadReceiptImage(file, filename)') -and
  $actions.Contains('buildWhatsAppShareUrl(shareMessage)')
)
Assert-Contract "El fallback no afirma que el archivo fue enviado" (
  -not $actions.Contains('archivo fue enviado') -and
  $actions.Contains('adjunta el archivo desde Descargas')
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
  $document.Contains('formatBoliviaDate') -and
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

$cachedBranchStart = $actions.IndexOf('if (preparedFile && shouldUseNativeFileShare(preparedFile))')
$cachedShareCall = $actions.IndexOf('sharePromise = navigator.share', $cachedBranchStart)
$cachedBranchEnd = $actions.IndexOf('void withLock', $cachedShareCall)
$cachedBeforeShare = $actions.Substring(
  $cachedBranchStart,
  $cachedShareCall - $cachedBranchStart
)
$firstMobileStart = $actions.IndexOf('if (nativeFileShare) {')
$firstMobilePreparationStart = $actions.LastIndexOf(
  'let file = preparedFile',
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
  $actions.Contains('whatsAppDownloadedFileRef.current = file') -and
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

Assert-Contract "Windows macOS Linux y ChromeOS se clasifican como escritorio" (
  $exportHelper.Contains('Windows NT|Macintosh|Mac OS X|X11|CrOS|Linux x86_64') -and
  $exportHelper.Contains('return false')
)
Assert-Contract "canShare no activa el flujo nativo sin dispositivo movil" (
  $exportHelper.Contains(
    'return isLikelyMobileShareDevice(signals) && canShareFiles;'
  )
)
Assert-Contract "Android iPhone iPad e iPod se reconocen como moviles" (
  $exportHelper.Contains('Android|iPhone|iPad|iPod')
)
Assert-Contract "userAgentData mobile tiene prioridad progresiva" (
  $exportHelper.Contains('if (userAgentDataMobile === true)')
)
Assert-Contract "Pointer coarse no se usa como unica senal" (
  $exportHelper.Contains('maxTouchPoints > 1 && coarsePointer') -and
  -not $exportHelper.Contains('if (coarsePointer) {')
)
Assert-Contract "Escritorio conserva siempre la etiqueta de WhatsApp" (
  $actions.Contains('"Compartir por WhatsApp"') -and
  $actions.Contains('setShareReadyKey(null)')
)
Assert-Contract "Escritorio muestra el estado Preparando imagen" (
  $actions.Contains('"Preparando imagen..."')
)
Assert-Contract "El primer clic movil prepara y el segundo comparte" (
  $actions.Contains('"Imagen lista. Pulsa nuevamente para compartir."') -and
  $cachedShareCall -gt $cachedBranchStart
)
Assert-Contract "Escritorio reutiliza el File preparado" (
  $actions.Contains('let file = preparedFile') -and
  $actions.Contains('if (!file)')
)
Assert-Contract "La descarga de WhatsApp ocurre una sola vez por File" (
  $actions.Contains('if (whatsAppDownloadedFileRef.current !== file)') -and
  $actions.Contains('whatsAppDownloadedFileRef.current = file')
)
Assert-Contract "Se abre como maximo una pestaña por operacion" (
  ([regex]::Matches($actions, 'window\.open\("about:blank", "_blank"\)')).Count -eq 1 -and
  $actions.Contains('if (busyRef.current) return;')
)
Assert-Contract "WhatsApp Web abierto no altera la decision" (
  -not ($actions -match 'getWindow|findWindow|whatsapp.*opened|visibilityState')
)
Assert-Contract "La URL no contiene Blob base64 ni archivos locales" (
  -not ($exportHelper -match 'blob:|base64|data:image|file:') -and
  $exportHelper.Contains('https://wa.me/?text=')
)
Assert-Contract "No se intenta adjuntar el archivo automaticamente" (
  -not ($actions -match 'DataTransfer|clipboard|drop|attach|input\[type=.file')
)
Assert-Contract "El popup usa opener nulo cuando es posible" (
  $actions.Contains('fallbackWindow.opener = null')
)
Assert-Contract "Popup bloqueado no reemplaza QB Insumos" (
  -not ($actions -match '\bwindow\.location\.(assign|replace)\b') -and
  $actions.Contains('Abre WhatsApp Web') -and
  $actions.Contains('desde Descargas')
)
Assert-Contract "AbortError movil sigue siendo cancelacion voluntaria" (
  $actions.Contains('error.name === "AbortError"') -and
  $actions.Contains('setStatus({ kind: "idle", message: null })')
)
Assert-Contract "Fecha impresion y captura PNG permanecen integras" (
  $dateHelper.Contains('America/La_Paz') -and
  $page.Contains('<PrintReceiptButton />') -and
  $actions.Contains('pixelRatio: 2')
)

Assert-Contract "Existe variante interna y variante customer export" (
  $document.Contains('type ReceiptDocumentVariant = "admin" | "customer-export"') -and
  $page.Contains('variant="admin"') -and
  $page.Contains('variant="customer-export"')
)
Assert-Contract "PNG y WhatsApp apuntan solo a customer export" (
  $page.Contains('id={receiptTargetId}') -and
  $page.IndexOf('id={receiptTargetId}') -lt $page.IndexOf('variant="customer-export"') -and
  $page.IndexOf('id={receiptTargetId}') -gt $page.IndexOf('variant="admin"')
)
Assert-Contract "Customer export oculta Precio base" (
  $document -match '!isCustomerExport\s*\?\s*\(\s*<th[^>]*>Precio base</th>'
)
Assert-Contract "Customer export oculta factores aplicados" (
  $document -match '!isCustomerExport\s*\?\s*\(\s*<div>\s*<p[^>]*>\s*Factores aplicados'
)
Assert-Contract "Customer export oculta aviso fiscal y de pago" (
  $document -match '!isCustomerExport\s*\?\s*\(\s*<p[^>]*>\s*No constituye factura fiscal'
)
Assert-Contract "Customer export conserva columnas requeridas" (
  $document.Contains('>Producto</th>') -and
  $document.Contains('>Cantidad</th>') -and
  $document.Contains('>Precio final</th>') -and
  $document.Contains('>Total</th>')
)
Assert-Contract "Customer export conserva encabezado y datos generales" (
  $document.Contains('QbInsumosBrand') -and
  $document.Contains('Cliente') -and
  $document.Contains('Periodo') -and
  $document.Contains('Emision') -and
  $document.Contains('Pedidos incluidos')
)
Assert-Contract "Customer export conserva solo el total final" (
  ([regex]::Matches($document, 'receipt\.subtotalAmount')).Count -eq 1 -and
  $document.Contains('<span>Total</span>') -and
  $document.Contains('money(receipt.totalAmount)')
)
Assert-Contract "La nota visible se comparte sin duplicarse" (
  ([regex]::Matches($document, 'receipt\.visibleNote')).Count -eq 2 -and
  $document.Contains('<p className="font-medium">Nota</p>')
)

if ($script:Passed -ne 57) {
  throw "QB-14.2 FAIL: se esperaban 57 controles y aprobaron $script:Passed."
}

Write-Output "Contrato focalizado local QB-14.2 OK: 57/57 controles."
