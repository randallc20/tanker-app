// Conversion constants
export const GAL_TO_L = 3.78541;
export const NM_TO_KM = 1.852;
export const LBS_TO_KG = 0.453592;
export const L_TO_GAL = 1 / GAL_TO_L;
export const KM_TO_NM = 1 / NM_TO_KM;
export const KG_TO_LBS = 1 / LBS_TO_KG;

// Fuel constants
export const JET_A_DENSITY_LBS_PER_GAL = 6.7;
export const JET_A_CO2_KG_PER_GAL = 9.57; // ICAO standard

// Conversion functions
export function galToL(gal: number): number { return gal * GAL_TO_L; }
export function lToGal(l: number): number { return l * L_TO_GAL; }
export function nmToKm(nm: number): number { return nm * NM_TO_KM; }
export function kmToNm(km: number): number { return km * KM_TO_NM; }
export function lbsToKg(lbs: number): number { return lbs * LBS_TO_KG; }
export function kgToLbs(kg: number): number { return kg * KG_TO_LBS; }
export function celsiusToFahrenheit(c: number): number { return c * 9/5 + 32; }
export function fahrenheitToCelsius(f: number): number { return (f - 32) * 5/9; }

// Display conversion helpers
export function convertFuel(gal: number, metric: boolean): number { return metric ? galToL(gal) : gal; }
export function convertDistance(nm: number, metric: boolean): number { return metric ? nmToKm(nm) : nm; }
export function convertWeight(lbs: number, metric: boolean): number { return metric ? lbsToKg(lbs) : lbs; }
export function fuelUnit(metric: boolean): string { return metric ? 'L' : 'gal'; }
export function distanceUnit(metric: boolean): string { return metric ? 'km' : 'nm'; }
export function weightUnit(metric: boolean): string { return metric ? 'kg' : 'lbs'; }

// Input conversion (metric input -> US internal)
export function inputFuel(val: number, metric: boolean): number { return metric ? lToGal(val) : val; }
export function inputDistance(val: number, metric: boolean): number { return metric ? kmToNm(val) : val; }
export function inputWeight(val: number, metric: boolean): number { return metric ? kgToLbs(val) : val; }
