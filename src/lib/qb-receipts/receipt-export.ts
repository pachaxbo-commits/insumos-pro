const unsafeFilenameCharacters = /[<>:"/\\|?*\u0000-\u001f]/g;
const repeatedSeparators = /[-_\s]+/g;
const mobileUserAgent = /Android|iPhone|iPad|iPod/i;
const desktopUserAgent = /Windows NT|Macintosh|Mac OS X|X11|CrOS|Linux x86_64/i;

export type ReceiptShareDeviceSignals = {
  coarsePointer?: boolean;
  maxTouchPoints?: number;
  userAgent?: string;
  userAgentDataMobile?: boolean;
};

export function isLikelyMobileShareDevice({
  coarsePointer = false,
  maxTouchPoints = 0,
  userAgent = "",
  userAgentDataMobile,
}: ReceiptShareDeviceSignals) {
  if (userAgentDataMobile === true) {
    return true;
  }

  if (mobileUserAgent.test(userAgent)) {
    return true;
  }

  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1 && coarsePointer) {
    return true;
  }

  if (desktopUserAgent.test(userAgent)) {
    return false;
  }

  return false;
}

export function shouldUseNativeReceiptFileShare(
  signals: ReceiptShareDeviceSignals,
  canShareFiles: boolean,
) {
  return isLikelyMobileShareDevice(signals) && canShareFiles;
}

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
