import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatBoliviaDate } from "../src/lib/date-time.ts";
import {
  buildReceiptPngFilename,
  buildReceiptShareMessage,
  buildWhatsAppShareUrl,
  sanitizeReceiptFilePart,
} from "../src/lib/qb-receipts/receipt-export.ts";

const actionsSource = readFileSync(
  new URL("../src/components/qb-receipts/receipt-image-actions.tsx", import.meta.url),
  "utf8",
);

test("date-only values keep their civil day in Bolivia", () => {
  assert.equal(formatBoliviaDate("2026-07-16"), "16 de julio de 2026");
  assert.match(formatBoliviaDate("2026-07-16", "short"), /^16 jul 2026$/);
});

test("timestamps are interpreted in America/La_Paz", () => {
  assert.equal(formatBoliviaDate("2026-07-16T02:00:00.000Z"), "15 de julio de 2026");
  assert.equal(formatBoliviaDate("2026-07-16T12:00:00.000Z"), "16 de julio de 2026");
});

test("safe PNG filenames preserve the canonical receipt code", () => {
  assert.equal(
    buildReceiptPngFilename("QBR-20260716-C7BB04"),
    "QB-Insumos-Recibo-QBR-20260716-C7BB04.png",
  );
  assert.equal(sanitizeReceiptFilePart('QBR:2026/07*16?"'), "QBR-2026-07-16");
});

test("WhatsApp fallback contains only the prepared business message", () => {
  const message = buildReceiptShareMessage("QBR-20260716-C7BB04", "Bs 125,50");
  assert.equal(
    message,
    "Te compartimos el recibo QBR-20260716-C7BB04 de QB Insumos por Bs 125,50.",
  );
  assert.equal(
    decodeURIComponent(buildWhatsAppShareUrl(message).split("?text=")[1]),
    message,
  );
  assert.doesNotMatch(message, /enviado|uuid|token|administrador/i);
});

test("prepared file share starts before any await in the cached branch", () => {
  const branchStart = actionsSource.indexOf(
    "if (preparedFile && canSharePngFile(preparedFile))",
  );
  const shareCall = actionsSource.indexOf("sharePromise = navigator.share", branchStart);
  const branchEnd = actionsSource.indexOf("if (preparedFile) {", shareCall);
  const cachedBranch = actionsSource.slice(branchStart, branchEnd);

  assert.ok(branchStart >= 0);
  assert.ok(shareCall > branchStart);
  assert.doesNotMatch(cachedBranch.slice(0, cachedBranch.indexOf("navigator.share")), /\bawait\b/);
  assert.match(cachedBranch, /files: \[preparedFile\]/);
});

test("first mobile share prepares the file without sharing after generation", () => {
  const firstClickStart = actionsSource.indexOf("if (nativeFileShare) {");
  const firstClickEnd = actionsSource.indexOf("downloadReceiptImage(file, filename)", firstClickStart);
  const preparationStart = actionsSource.lastIndexOf(
    "const file = createPngFile",
    firstClickStart,
  );
  const firstClickBranch = actionsSource.slice(preparationStart, firstClickEnd);

  assert.match(firstClickBranch, /storePreparedFile\(file\)/);
  assert.match(firstClickBranch, /Imagen lista\. Pulsa nuevamente/);
  assert.doesNotMatch(firstClickBranch, /navigator\.share/);
});

test("desktop fallback never replaces the QB Insumos page", () => {
  assert.doesNotMatch(actionsSource, /\bwindow\.location\.(assign|replace)\b/);
  assert.match(actionsSource, /fallbackWindow\.opener = null/);
  assert.match(actionsSource, /Abre WhatsApp Web y adjúntala desde Descargas/);
});
