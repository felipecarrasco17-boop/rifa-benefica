/**
 * Converts a 1-based index (e.g. 1, 26, 27) to an Excel-style column label (e.g. "A", "Z", "AA").
 */
export function getExcelLabel(index: number): string {
  if (index <= 0) return '';
  let label = '';
  let temp = index;
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    label = String.fromCharCode(65 + modulo) + label;
    temp = Math.floor((temp - modulo) / 26);
  }
  return label;
}

/**
 * Converts an Excel-style column label (e.g. "A", "Z", "AA") to a 1-based index (e.g. 1, 26, 27).
 * Returns 0 if the label is invalid.
 */
export function excelLabelToIndex(label: string): number {
  const cleanLabel = label.toUpperCase().trim();
  if (!cleanLabel || !/^[A-Z]+$/.test(cleanLabel)) {
    return 0;
  }
  
  let index = 0;
  for (let i = 0; i < cleanLabel.length; i++) {
    const charCode = cleanLabel.charCodeAt(i);
    index = index * 26 + (charCode - 64);
  }
  return index;
}
