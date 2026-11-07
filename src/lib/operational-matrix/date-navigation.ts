export const operationalPath = "/matriz-operativa";
export const provisionPath = "/matriz-operativa/mercado";
export const provisionExcelPath = "/api/matriz-operativa/mercado.xlsx";

export function operationalDateHref(
  path: string,
  date: string,
  params: URLSearchParams = new URLSearchParams(),
  mode?: string,
) {
  const query = new URLSearchParams(params);
  query.set("date", date);
  query.delete("fecha");
  query.delete("allPending");
  if (mode) query.set("mode", mode);
  return `${path}?${query.toString()}`;
}
