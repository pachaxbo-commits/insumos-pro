export function summarizeVisibleProductChecks<T>(
  lines: T[],
  productKey: (line: T) => string,
  cellKey: (line: T) => string,
  isChecked: (line: T) => boolean,
) {
  const products = new Set<string>();
  const cells = new Map<string, T[]>();
  for (const line of lines) {
    products.add(productKey(line));
    const key = cellKey(line);
    const cellLines = cells.get(key);
    if (cellLines) cellLines.push(line);
    else cells.set(key, [line]);
  }
  let checks = 0;
  for (const cellLines of cells.values()) {
    if (cellLines.every(isChecked)) checks += 1;
  }
  return { products: products.size, checks };
}
