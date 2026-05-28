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

/**
 * Calculates the optimal total price for a given number of tickets based on active discount combos.
 */
export function calculateTotalPrice(n: number, config: any): number {
  const regularPrice = config.ticketPrice;
  if (!config.discountEnabled) {
    return n * regularPrice;
  }
  
  const c1Tickets = config.discountCombo1Tickets || 0;
  const c1Price = config.discountCombo1Price || 0;
  const c2Tickets = config.discountCombo2Tickets || 0;
  const c2Price = config.discountCombo2Price || 0;
  
  // Sort combos by ticket count descending
  const combos = [];
  if (c1Tickets > 1 && c1Price > 0) combos.push({ tickets: c1Tickets, price: c1Price });
  if (c2Tickets > 1 && c2Price > 0) combos.push({ tickets: c2Tickets, price: c2Price });
  combos.sort((a, b) => b.tickets - a.tickets);
  
  let remaining = n;
  let total = 0;
  
  for (const combo of combos) {
    if (remaining >= combo.tickets) {
      const count = Math.floor(remaining / combo.tickets);
      total += count * combo.price;
      remaining = remaining % combo.tickets;
    }
  }
  
  total += remaining * regularPrice;
  return total;
}
