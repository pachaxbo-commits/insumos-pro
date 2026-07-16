import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatBoliviaDate } from "../src/lib/date-time.ts";
import {
  buildReceiptPngFilename,
  buildReceiptShareMessage,
  buildWhatsAppShareUrl,
  isLikelyMobileShareDevice,
  sanitizeReceiptFilePart,
  shouldUseNativeReceiptFileShare,
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

test("desktop operating systems always use the WhatsApp Web fallback", () => {
  const desktopAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64)",
    "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0)",
  ];

  for (const userAgent of desktopAgents) {
    assert.equal(
      shouldUseNativeReceiptFileShare(
        { userAgent, userAgentDataMobile: false },
        true,
      ),
      false,
    );
  }
});

test("mobile and tablet devices use native file share only when supported", () => {
  const mobileAgents = [
    "Mozilla/5.0 (Linux; Android 15; Pixel 9)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)",
    "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X)",
    "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X)",
  ];

  for (const userAgent of mobileAgents) {
    assert.equal(isLikelyMobileShareDevice({ userAgent }), true);
    assert.equal(shouldUseNativeReceiptFileShare({ userAgent }, true), true);
  }

  assert.equal(
    shouldUseNativeReceiptFileShare(
      { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)" },
      false,
    ),
    false,
  );
});

test("coarse pointer is complementary and never the sole mobile signal", () => {
  assert.equal(isLikelyMobileShareDevice({ coarsePointer: true }), false);
  assert.equal(
    isLikelyMobileShareDevice({
      coarsePointer: true,
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    }),
    true,
  );
});

test("prepared file share starts before any await in the cached branch", () => {
  const branchStart = actionsSource.indexOf(
    "if (preparedFile && shouldUseNativeFileShare(preparedFile))",
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
  const preparationStart = actionsSource.lastIndexOf("let file = preparedFile", firstClickStart);
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

test("desktop fallback reuses the prepared file and downloads it at most once", () => {
  assert.match(actionsSource, /let file = preparedFile/);
  assert.match(
    actionsSource,
    /if \(whatsAppDownloadedFileRef\.current !== file\) \{\s*downloadReceiptImage\(file, filename\);\s*whatsAppDownloadedFileRef\.current = file;/,
  );
  assert.match(actionsSource, /const fallbackWindow = nativeFileShare \? null : window\.open/);
  assert.match(actionsSource, /if \(busyRef\.current\) return;/);
});

test("desktop interface keeps the WhatsApp label and uses no automatic attachment", () => {
  assert.match(actionsSource, /setShareReadyKey\(null\)/);
  assert.match(actionsSource, /"Compartir por WhatsApp"/);
  assert.doesNotMatch(
    actionsSource,
    /buildWhatsAppShareUrl\([^)]*(blob|base64|createObjectURL)/,
  );
  assert.doesNotMatch(actionsSource, /fetch\(|supabase|rpc\(|Server Action/);
});
