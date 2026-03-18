/**
 * ISA Temperature Deviation Correction
 *
 * POH performance tables are based on International Standard Atmosphere (ISA).
 * When actual conditions differ, fuel flow must be corrected:
 *
 * - Above ISA: +0.3% fuel flow per °C (engines work harder in thinner/hotter air)
 * - Below ISA: -0.2% fuel flow per °C (denser air, more efficient)
 *
 * Correction is capped at ±15% — beyond that, standard table interpolation
 * breaks down and the user should be warned.
 *
 * ISA temperature at altitude:
 *   ISA(ft) = 15 - (altitude_ft / 1000 × 1.98) °C
 *   Below tropopause (36,089 ft). Above that, ISA = -56.5°C (isothermal layer).
 */

const TROPOPAUSE_FT = 36089
const ISA_TROPO_TEMP = -56.5 // °C at and above tropopause

/**
 * Calculate ISA standard temperature at a given altitude.
 *
 * @param altitude_ft - Altitude in feet MSL
 * @returns ISA temperature in °C
 */
export function isaTemperature(altitude_ft: number): number {
  if (altitude_ft >= TROPOPAUSE_FT) return ISA_TROPO_TEMP
  return 15 - (altitude_ft / 1000) * 1.98
}

/**
 * Calculate ISA deviation.
 *
 * @param actualTemp_c - Actual/forecast temperature at altitude in °C
 * @param altitude_ft - Altitude in feet MSL
 * @returns Deviation from ISA in °C (positive = warmer than ISA)
 */
export function isaDeviation(actualTemp_c: number, altitude_ft: number): number {
  return actualTemp_c - isaTemperature(altitude_ft)
}

/**
 * Get the fuel flow correction multiplier for a given ISA deviation.
 *
 * @param deviation_c - ISA deviation in °C (positive = above ISA)
 * @returns Multiplier to apply to ISA fuel flow. Example: 1.06 means +6%.
 *          Capped at [0.85, 1.15].
 */
export function tempCorrectionFactor(deviation_c: number): number {
  let correction: number
  if (deviation_c >= 0) {
    correction = 1 + deviation_c * 0.003  // +0.3% per °C above ISA
  } else {
    correction = 1 + deviation_c * 0.002  // -0.2% per °C below ISA
  }
  // Cap at ±15%
  return Math.max(0.85, Math.min(1.15, correction))
}
