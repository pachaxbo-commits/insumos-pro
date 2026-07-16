export const BOLIVIA_TIME_ZONE = "America/La_Paz";

type BoliviaDateStyle = "long" | "short";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string) {
  const match = dateOnlyPattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatBoliviaDate(
  value: string | null | undefined,
  style: BoliviaDateStyle = "long",
) {
  if (!value) return "Sin fecha";

  const dateOnly = parseDateOnly(value);
  const date = dateOnly ?? new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: style === "short" ? "short" : "long",
    year: "numeric",
    timeZone: BOLIVIA_TIME_ZONE,
  }).format(date);
}
