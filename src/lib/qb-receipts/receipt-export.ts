const unsafeFilenameCharacters = /[<>:"/\\|?*\u0000-\u001f]/g;
const repeatedSeparators = /[-_\s]+/g;

export function sanitizeReceiptFilePart(value: string) {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(unsafeFilenameCharacters, "-")
    .replace(repeatedSeparators, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "Recibo";
}

export function buildReceiptPngFilename(receiptNumber: string) {
  return `QB-Insumos-Recibo-${sanitizeReceiptFilePart(receiptNumber)}.png`;
}

export function buildReceiptShareMessage(receiptNumber: string, totalText: string) {
  return `Te compartimos el recibo ${receiptNumber} de QB Insumos por ${totalText}.`;
}

export function buildWhatsAppShareUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
