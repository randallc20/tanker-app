/**
 * Wind Correction Factor Interpolation
 *
 * Uses the wind correction table from the Flight Planning Guide.
 * The factor is applied to zero-wind flight time to get actual flight time.
 *
 * Wind Correction Factor ≈ KTAS / (KTAS ± wind_component)
 * Positive wind = headwind (increases factor > 1.0)
 * Negative wind = tailwind (decreases factor < 1.0)
 */

import { WindCorrectionTable } from '../data/types'
import { interpWeight, interpAltitude } from './interpolation'

/**
 * Look up wind correction factor by bilinear interpolation in the wind table.
 *
 * @param ktas - Aircraft cruise true airspeed (knots)
 * @param windKt - Wind component in knots. Positive = headwind, negative = tailwind.
 * @param table - Wind correction table from aircraft data
 * @returns Correction factor to multiply zero-wind time by.
 *          Example: 1.13 means trip takes 13% longer than zero-wind.
 */
export function getWindCorrectionFactor(
  ktas: number,
  windKt: number,
  table: WindCorrectionTable
): number {
  const { ktas: ktasBreaks, winds, factors } = table

  // For each KTAS row, interpolate across wind columns to get the factor
  // Winds array is: [-100, -75, -50, -25, 0, 25, 50, 75, 100]
  // These are ascending, so we can use interpAltitude (ascending interp)
  const windInterpolated: (number | null)[] = ktasBreaks.map((_, ktasIdx) =>
    interpAltitude(windKt, winds, factors[ktasIdx])
  )

  // Now interpolate across KTAS rows (ascending)
  const result = interpAltitude(ktas, ktasBreaks, windInterpolated)
  return result ?? 1.0
}
