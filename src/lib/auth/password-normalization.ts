/**
 * Password normalization helper for client accounts.
 *
 * Rules:
 * 1. Remove leading numeric prefix (e.g., "08 ", "12. ", "01-", etc.)
 * 2. Trim whitespace
 * 3. Normalize Unicode (NFD decomposes accents into base letter + combining mark)
 * 4. Remove diacritics/accents
 * 5. Remove spaces
 * 6. Remove punctuation and invalid symbols (keep only [a-z0-9])
 * 7. Convert to lowercase
 *
 * Examples:
 * - "08 Burguer Melchor" -> "burguermelchor"
 * - "12 Café París" -> "cafeparis"
 */
export function normalizeClientInitialPassword(rawName: string): string {
  if (!rawName || typeof rawName !== "string") return "";

  // 1. Remove leading numeric prefix and accompanying punctuation/spaces
  let text = rawName.replace(/^[\s\d\-._/\\#)]+/, "").trim();

  // 2. Normalize Unicode to NFD
  text = text.normalize("NFD");

  // 3. Remove combining diacritical marks
  text = text.replace(/[\u0300-\u036f]/g, "");

  // 4. Lowercase
  text = text.toLowerCase();

  // 5. Remove any character that is not lowercase alphanumeric [a-z0-9]
  text = text.replace(/[^a-z0-9]/g, "");

  return text;
}

export type PasswordNormalizationResult = {
  isValid: boolean;
  password: string;
  error?: "empty" | "too_short";
};

export function validateInitialPassword(
  rawName: string,
  minLength = 6,
): PasswordNormalizationResult {
  const password = normalizeClientInitialPassword(rawName);

  if (!password) {
    return { isValid: false, password: "", error: "empty" };
  }

  if (password.length < minLength) {
    return { isValid: false, password, error: "too_short" };
  }

  return { isValid: true, password };
}
