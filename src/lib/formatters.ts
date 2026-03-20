/** Number formatting utilities for aviation fuel calculator. */

const commaInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const comma1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const comma2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format fuel quantity: rounded to nearest whole gallon, comma thousands. E.g., "4,200 gal" */
export function formatFuel(gal: number, unit: string = 'gal'): string {
  return `${commaInt.format(Math.round(gal))} ${unit}`;
}

/** Format fuel price: always 2 decimal places, $ prefix. E.g., "$5.47/gal" */
export function formatFuelPrice(price: number, unit: string = 'gal'): string {
  return `$${comma2.format(price)}/${unit}`;
}

/** Format dollar amounts: >= $1000 comma separated no decimals, < $1000 two decimal places */
export function formatDollars(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs >= 1000 ? commaInt.format(Math.round(amount)) : comma2.format(amount);
  return `$${formatted}`;
}

/** Format savings: green-appropriate string with + prefix if positive, \u2212 if negative */
export function formatSavings(amount: number): string {
  if (amount === 0) return '$0.00';
  const abs = Math.abs(amount);
  const formatted = abs >= 1000 ? commaInt.format(Math.round(abs)) : comma2.format(abs);
  const prefix = amount > 0 ? '+' : '\u2212';
  return `${prefix}$${formatted}`;
}

/** Format delivery ratio: 1 decimal place, % suffix. E.g., "93.7%" */
export function formatRatio(ratio: number): string {
  // deliveryRatio() returns a decimal (e.g., 0.937), convert to percentage
  const pct = ratio <= 1 ? ratio * 100 : ratio;
  return `${comma1.format(pct)}%`;
}

/** Format flight time: Xh Ym format. E.g., "2h 25m" */
export function formatFlightTime(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0 && m === 0) return '0m';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Format distance: rounded to nearest nm/km, no decimals, comma thousands. E.g., "1,089 nm" */
export function formatDistance(nm: number, unit: string = 'nm'): string {
  return `${commaInt.format(Math.round(nm))} ${unit}`;
}

/** Format percentage: 1 decimal place. E.g., "12.4%" */
export function formatPct(pct: number): string {
  return `${comma1.format(pct)}%`;
}

/** Format weight: comma separated, no decimals, unit suffix. E.g., "18,500 lbs" */
export function formatWeight(lbs: number, unit: string = 'lbs'): string {
  return `${commaInt.format(Math.round(lbs))} ${unit}`;
}

/** Format temperature: 1 decimal place, unit suffix. E.g., "\u221218.5\u00B0C" */
export function formatTemp(celsius: number, useFahrenheit: boolean = false): string {
  const value = useFahrenheit ? celsius * 9 / 5 + 32 : celsius;
  const suffix = useFahrenheit ? '\u00B0F' : '\u00B0C';
  if (value < 0) {
    return `\u2212${comma1.format(Math.abs(value))}${suffix}`;
  }
  return `${comma1.format(value)}${suffix}`;
}
