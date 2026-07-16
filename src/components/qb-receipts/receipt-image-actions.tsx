"use client";

import { Download, Share2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  buildReceiptPngFilename,
  buildReceiptShareMessage,
  buildWhatsAppShareUrl,
  shouldUseNativeReceiptFileShare,
} from "@/lib/qb-receipts/receipt-export";

type ReceiptImageActionsProps = {
  receiptNumber: string;
  targetId: string;
  totalText: string;
};

type ActionStatus =
  | { kind: "idle"; message: null }
  | { kind: "working"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

async function waitForReceiptAssets(node: HTMLElement) {
  await document.fonts?.ready;

  await Promise.all(
    Array.from(node.querySelectorAll("img")).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        });
      }

      if (typeof image.decode === "function") {
        await image.decode().catch(() => undefined);
      }
    }),
  );
}

async function createReceiptPng(targetId: string) {
  const receipt = document.getElementById(targetId);
  if (!receipt) {
    throw new Error("No se encontró el contenido del recibo.");
  }

  await waitForReceiptAssets(receipt);
  receipt.classList.add("qb-receipt-export-capturing");

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const { toBlob } = await import("html-to-image");
    const descendantWidths = Array.from(receipt.querySelectorAll<HTMLElement>("*")).map(
      (element) => element.scrollWidth,
    );
    const width = Math.max(receipt.scrollWidth, receipt.clientWidth, 760, ...descendantWidths);
    const height = receipt.scrollHeight;
    const blob = await toBlob(receipt, {
      backgroundColor: "#ffffff",
      cacheBust: true,
      height,
      pixelRatio: 2,
      skipAutoScale: false,
      style: {
        height: `${height}px`,
        margin: "0",
        maxWidth: "none",
        width: `${width}px`,
      },
      width,
    });

    if (!blob) {
      throw new Error("No se pudo crear el archivo PNG.");
    }

    return blob;
  } finally {
    receipt.classList.remove("qb-receipt-export-capturing");
  }
}

function downloadReceiptImage(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createPngFile(blob: Blob, filename: string) {
  return new File([blob], filename, { type: "image/png" });
}

function canSharePngFile(file: File) {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }

  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function getReceiptShareDeviceSignals() {
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };

  return {
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    userAgent: browserNavigator.userAgent,
    userAgentDataMobile: browserNavigator.userAgentData?.mobile,
  };
}

function shouldUseNativeFileShare(file: File) {
  return shouldUseNativeReceiptFileShare(
    getReceiptShareDeviceSignals(),
    canSharePngFile(file),
  );
}

export function ReceiptImageActions({
  receiptNumber,
  targetId,
  totalText,
}: ReceiptImageActionsProps) {
  const busyRef = useRef(false);
  const preparedFileRef = useRef<File | null>(null);
  const preparedReceiptKeyRef = useRef<string | null>(null);
  const whatsAppDownloadedFileRef = useRef<File | null>(null);
  const [shareReadyKey, setShareReadyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle", message: null });
  const busy = status.kind === "working";
  const filename = buildReceiptPngFilename(receiptNumber);
  const shareMessage = buildReceiptShareMessage(receiptNumber, totalText);
  const receiptKey = `${receiptNumber}:${targetId}`;
  const hasCurrentShareFile = shareReadyKey === receiptKey;

  function storePreparedFile(file: File) {
    preparedFileRef.current = file;
    preparedReceiptKeyRef.current = receiptKey;
  }

  function getPreparedFile() {
    if (preparedReceiptKeyRef.current !== receiptKey) {
      return null;
    }
    return preparedFileRef.current;
  }

  async function withLock(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await action();
    } finally {
      busyRef.current = false;
    }
  }

  function handleDownload() {
    void withLock(async () => {
      setStatus({ kind: "working", message: "Generando imagen..." });
      try {
        const blob = await createReceiptPng(targetId);
        const file = createPngFile(blob, filename);
        storePreparedFile(file);
        setShareReadyKey(shouldUseNativeFileShare(file) ? receiptKey : null);
        downloadReceiptImage(file, filename);
        setStatus({ kind: "success", message: "Imagen descargada." });
      } catch {
        setStatus({
          kind: "error",
          message: "No se pudo generar la imagen. Inténtalo nuevamente.",
        });
      }
    });
  }

  function handleShare() {
    if (busyRef.current) return;

    const preparedFile = getPreparedFile();
    if (preparedFile && shouldUseNativeFileShare(preparedFile)) {
      busyRef.current = true;
      setStatus({ kind: "working", message: "Preparando para compartir..." });

      let sharePromise: Promise<void>;
      try {
        sharePromise = navigator.share({
          title: `Recibo ${receiptNumber} de QB Insumos`,
          text: shareMessage,
          files: [preparedFile],
        });
      } catch (error) {
        busyRef.current = false;
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus({ kind: "idle", message: null });
          return;
        }
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setStatus({
            kind: "error",
            message: "No se pudo abrir el menú para compartir. Pulsa nuevamente para intentarlo.",
          });
          return;
        }
        setStatus({
          kind: "error",
          message: "No se pudo preparar el recibo para compartir. Inténtalo nuevamente.",
        });
        return;
      }

      void sharePromise
        .then(() => {
          setStatus({ kind: "success", message: "Recibo preparado para compartir." });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            setStatus({ kind: "idle", message: null });
            return;
          }
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            setStatus({
              kind: "error",
              message:
                "No se pudo abrir el menú para compartir. Pulsa nuevamente para intentarlo.",
            });
            return;
          }
          setStatus({
            kind: "error",
            message: "No se pudo preparar el recibo para compartir. Inténtalo nuevamente.",
          });
        })
        .finally(() => {
          busyRef.current = false;
        });
      return;
    }

    void withLock(async () => {
      const shareProbe = createPngFile(new Blob(["qb"], { type: "image/png" }), filename);
      const nativeFileShare = shouldUseNativeFileShare(preparedFile ?? shareProbe);
      const fallbackWindow = nativeFileShare ? null : window.open("about:blank", "_blank");
      if (fallbackWindow) {
        try {
          fallbackWindow.opener = null;
        } catch {
          // Some browsers expose opener as read-only.
        }
      }
      setStatus({
        kind: "working",
        message: nativeFileShare ? "Preparando para compartir..." : "Preparando imagen...",
      });

      try {
        let file = preparedFile;
        if (!file) {
          const blob = await createReceiptPng(targetId);
          file = createPngFile(blob, filename);
          storePreparedFile(file);
        }

        if (nativeFileShare) {
          setShareReadyKey(receiptKey);
          setStatus({
            kind: "success",
            message: "Imagen lista. Pulsa nuevamente para compartir.",
          });
          return;
        }

        setShareReadyKey(null);
        if (whatsAppDownloadedFileRef.current !== file) {
          downloadReceiptImage(file, filename);
          whatsAppDownloadedFileRef.current = file;
        }
        const whatsappUrl = buildWhatsAppShareUrl(shareMessage);
        if (fallbackWindow) {
          fallbackWindow.location.replace(whatsappUrl);
          setStatus({
            kind: "success",
            message:
              "La imagen del recibo fue descargada. Selecciona la conversación en WhatsApp y adjunta el archivo desde Descargas.",
          });
        } else {
          setStatus({
            kind: "success",
            message:
              "La imagen fue descargada. Abre WhatsApp Web y adjúntala desde Descargas.",
          });
        }
      } catch (error) {
        fallbackWindow?.close();
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus({ kind: "idle", message: null });
          return;
        }
        setStatus({
          kind: "error",
          message: "No se pudo generar la imagen. Inténtalo nuevamente.",
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={handleDownload}>
        <Download className="size-4" />
        {busy && status.message === "Generando imagen..." ? status.message : "Descargar imagen"}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={handleShare}>
        <Share2 className="size-4" />
        {busy &&
        (status.message === "Preparando para compartir..." ||
          status.message === "Preparando imagen...")
          ? status.message
          : hasCurrentShareFile
            ? "Abrir menú para compartir"
            : "Compartir por WhatsApp"}
      </Button>
      {status.message ? (
        <p
          aria-live="polite"
          className={`basis-full text-sm ${
            status.kind === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
