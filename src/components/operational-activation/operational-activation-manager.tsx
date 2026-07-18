"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, ShieldCheck } from "lucide-react";

import { applyOperationalImportAction, previewOperationalImportAction } from "@/lib/operational-activation/actions";
import { MAX_OPERATIONAL_CSV_BYTES, parseCsv, rowsToObjects } from "@/lib/operational-activation/csv";
import type { OperationalActivationSummary, OperationalImportType, OperationalPreview } from "@/types/operational-activation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const definitions: Record<OperationalImportType, { title: string; description: string }> = {
  prices: { title: "Precios para pedidos por Bs", description: "Vacío significa sin cambio. La retirada de precios continúa siendo individual y explícita." },
  conversions: { title: "Conversiones de recepción", description: "Solo admite unidades y presentaciones existentes, activas e inequívocas." },
  initial_stock: { title: "Stock inicial", description: "Crea un ingreso de apertura confirmado mediante el flujo normal de Ingresos." },
};

async function sha256(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function OperationalActivationManager({ summary }: { summary: OperationalActivationSummary }) {
  const [type, setType] = useState<OperationalImportType>("prices");
  const [preview, setPreview] = useState<OperationalPreview | null>(null);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  function handleFile(file: File | undefined) {
    if (!file) return;
    setPreview(null); setMessage(""); setConfirmation("");
    startTransition(async () => {
      try {
        if (!file.name.toLocaleLowerCase("es").endsWith(".csv") || file.type && !["text/csv", "application/vnd.ms-excel"].includes(file.type)) throw new Error("Selecciona un archivo CSV.");
        if (file.size > MAX_OPERATIONAL_CSV_BYTES) throw new Error("El archivo supera el límite de 1 MB.");
        const buffer = await file.arrayBuffer();
        const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        const rows = rowsToObjects(parseCsv(text), type);
        const result = await previewOperationalImportAction({ importType: type, fileHash: await sha256(buffer), rows });
        setPreview(result);
      } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo leer el archivo."); }
    });
  }

  function apply() {
    if (!preview) return;
    setMessage("");
    startTransition(async () => { const result = await applyOperationalImportAction(preview, confirmation); setMessage(result.message); if (result.success) { setPreview(null); setConfirmation(""); } });
  }

  const cards = [
    ["Publicados", summary.published_products], ["Respaldados por BS", summary.bs_backed], ["Habilitados por Bs", summary.bs_available],
    ["Sin precio", summary.missing_prices], ["Con recepción", summary.receiving_configured], ["Conversión pendiente", summary.pending_conversions],
    ["Stock negativo", summary.negative_stock], ["Sin movimientos", summary.without_movements],
  ];

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold">{value}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Plantillas actualizadas</CardTitle><CardDescription>Se generan desde el estado actual de la base. Ninguna descarga escribe datos. Para configurar pocos productos, utiliza Productos o guarda el precio desde un recibo. Usa esta plantilla únicamente para cargas masivas.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{Object.entries(definitions).map(([key, item]) => <Button key={key} asChild variant="outline" className="h-auto justify-start rounded-xl py-3"><a href={`/api/operational-activation/templates/${key}`}><Download className="size-4" /><span className="text-left"><span className="block">{item.title}</span><span className="block text-xs font-normal text-muted-foreground">Descargar CSV</span></span></a></Button>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Importación con vista previa</CardTitle><CardDescription>El archivo se valida completamente antes de habilitar la confirmación.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">{(Object.keys(definitions) as OperationalImportType[]).map((key) => <button type="button" key={key} onClick={() => { setType(key); setPreview(null); setMessage(""); }} className={`rounded-2xl border p-4 text-left ${type === key ? "border-slate-900 bg-slate-50" : "bg-white"}`}><p className="font-medium">{definitions[key].title}</p><p className="mt-1 text-xs text-muted-foreground">{definitions[key].description}</p></button>)}</div>
      <Label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed p-8"><FileUp className="size-5" />Seleccionar CSV<input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={(event) => handleFile(event.target.files?.[0])} /></Label>
      {pending ? <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Procesando de forma segura...</p> : null}
      {message ? <Alert><AlertTitle>Resultado</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
      {preview ? <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">{[["Filas",preview.total],["Válidas",preview.valid],["Inválidas",preview.invalid],["Sin cambios",preview.unchanged],["Desconocidas",preview.unknown],["Duplicadas",preview.duplicates],["Ambiguas",preview.ambiguous]].map(([label,value]) => <div key={label} className="rounded-xl bg-muted/50 p-3 text-sm"><span>{label}</span><strong className="float-right">{value}</strong></div>)}</div>
        <div className="max-h-[460px] overflow-auto rounded-2xl border"><Table><TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Producto</TableHead><TableHead>Actual</TableHead><TableHead>Nuevo</TableHead><TableHead>Estado</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((row) => <TableRow key={`${row.rowNumber}-${row.productId}`}><TableCell>{row.rowNumber}</TableCell><TableCell>{row.productName}</TableCell><TableCell>{row.currentValue}</TableCell><TableCell>{row.newValue}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell><TableCell>{row.message}</TableCell></TableRow>)}</TableBody></Table></div>
        {!preview.canApply ? <Alert className="border-amber-200 bg-amber-50"><AlertTriangle className="size-4" /><AlertTitle>No se puede aplicar</AlertTitle><AlertDescription>Corrige todos los errores bloqueantes y vuelve a generar la vista previa.</AlertDescription></Alert> : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-4" />Vista previa aprobada</p><p className="mt-1 text-sm">Escribe APLICAR para confirmar el lote completo.</p><div className="mt-3 flex max-w-md gap-2"><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="APLICAR" /><Button disabled={pending || confirmation !== "APLICAR"} onClick={apply}>Aplicar lote</Button></div></div>}
      </div> : null}
    </CardContent></Card>
  </div>;
}
