import { JET_A_DENSITY_LBS_PER_GAL } from './units';

/** Standard ISA temperature at sea level in Celsius */
const ISA_STANDARD_TEMP_C = 15;

/**
 * Calculate Jet-A fuel density adjusted for temperature.
 * Jet-A weighs approximately 6.7 lbs/gal at standard conditions (15°C / 59°F).
 * Density varies with temperature: colder = denser, warmer = lighter.
 *
 * @param oatCelsius - Outside air temperature at cruise altitude in Celsius
 * @returns Density in lbs/gal
 */
export function jetADensity(oatCelsius: number): number {
  return JET_A_DENSITY_LBS_PER_GAL + (ISA_STANDARD_TEMP_C - oatCelsius) * 0.00485;
}

/**
 * Adjust burn rate (in gph) for fuel density at non-standard temperature.
 * Engine fuel flow is measured in lbs/hr (mass flow). When fuel is denser,
 * fewer gallons are needed to deliver the same mass flow.
 *
 * @param bookBurnGph - Book burn rate in gallons per hour (at standard density)
 * @param oatCelsius - Outside air temperature at cruise in Celsius
 * @returns Adjusted burn rate in gallons per hour
 */
export function densityAdjustedBurnGph(bookBurnGph: number, oatCelsius: number): number {
  const standardDensity = JET_A_DENSITY_LBS_PER_GAL;
  const actualDensity = jetADensity(oatCelsius);
  // Convert book gph to mass flow (lbs/hr), then back to gph at actual density
  const massFlowLbsHr = bookBurnGph * standardDensity;
  return massFlowLbsHr / actualDensity;
}

/**
 * Adjust effective cost when buying at one density and burning at another.
 * If fuel is denser at origin (cold), you get more energy per gallon purchased.
 *
 * @param costPerGal - Price per gallon at origin
 * @param originTempC - Temperature at origin airport
 * @param destTempC - Temperature at destination airport
 * @returns Density-adjusted effective cost per gallon
 */
export function densityAdjustedCost(
  costPerGal: number,
  originTempC: number,
  destTempC: number
): number {
  const densityAtOrigin = jetADensity(originTempC);
  const densityAtDest = jetADensity(destTempC);
  return costPerGal * (densityAtOrigin / densityAtDest);
}

/**
 * Get the density deviation percentage from standard.
 * Useful for tooltip display: "A 20°C temperature deviation changes Jet-A density by roughly 1.4%"
 *
 * @param oatCelsius - Outside air temperature in Celsius
 * @returns Percentage deviation from standard density (positive = denser)
 */
export function densityDeviationPct(oatCelsius: number): number {
  const actual = jetADensity(oatCelsius);
  return ((actual - JET_A_DENSITY_LBS_PER_GAL) / JET_A_DENSITY_LBS_PER_GAL) * 100;
}
