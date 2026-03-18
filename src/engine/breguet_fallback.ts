/**
 * Breguet Range Equation Fallback
 *
 * For aircraft where tabular POH/FPG data is unavailable, provides
 * a Breguet-equation-based estimate of fuel burn penalty.
 *
 * This is LESS ACCURATE than POH interpolation because:
 * - Assumes constant L/D and TSFC across the weight range
 * - Does not capture cruise mode differences (HSC vs LRC)
 * - Does not model climb penalty separately
 *
 * Results from this mode are labeled "Estimated (Breguet equation)"
 * throughout the UI to distinguish from POH-data calculations.
 *
 * Breguet range equation:
 *   R = (V / SFC) × (L/D) × ln(W_initial / W_final)
 *
 * Fuel burn penalty for carrying extra weight X:
 *   penalty = W_initial × (1 - e^(-R × SFC / (V × L/D))) evaluated at two weights
 *   penalty = burn(W + X) - burn(W)
 */

export interface BreguetInputs {
  tripDistance_nm: number
  cruiseSpeed_ktas: number
  tsfc: number                // Thrust Specific Fuel Consumption (lb/hr/lb thrust)
  liftToDrag: number          // L/D ratio
  plannedWeight_lb: number    // Aircraft weight without tanker fuel
  tankerAmount_lb: number
  originPrice: number         // $/gal
  destPrice: number           // $/gal
  fuelDensity: number         // lb/gal
  windComponent: number       // kt, positive = headwind
}

export interface BreguetResult {
  totalPenalty_lb: number
  totalPenalty_gal: number
  penaltyPct: number
  grossSavings: number
  penaltyCost: number
  netSavings: number
  worthIt: boolean
  isEstimate: true            // Always true — flags this as Breguet estimate
}

/**
 * Calculate tankering penalty using Breguet range equation.
 *
 * @param inputs - Breguet calculation inputs
 * @returns Estimated result marked as Breguet estimate
 */
export function calculateBreguetFallback(inputs: BreguetInputs): BreguetResult {
  const {
    tripDistance_nm, cruiseSpeed_ktas, tsfc, liftToDrag,
    plannedWeight_lb, tankerAmount_lb, originPrice, destPrice,
    fuelDensity, windComponent,
  } = inputs

  // Ground speed accounting for wind
  const groundSpeed = cruiseSpeed_ktas - windComponent
  const tripTime_hrs = tripDistance_nm / Math.max(groundSpeed, 50)

  // Range parameter: c = R × SFC / (V × L/D)
  // Here R is in NM, V in kt, so R/V = trip_time
  // c = trip_time × SFC / L_D
  const c = tripTime_hrs * tsfc / liftToDrag

  // Fuel burned at normal weight
  const burnNormal = plannedWeight_lb * (1 - Math.exp(-c))

  // Fuel burned at heavy weight
  const heavyWeight = plannedWeight_lb + tankerAmount_lb
  const burnHeavy = heavyWeight * (1 - Math.exp(-c))

  const totalPenalty_lb = Math.max(0, burnHeavy - burnNormal)
  const totalPenalty_gal = totalPenalty_lb / fuelDensity
  const tanker_gal = tankerAmount_lb / fuelDensity

  const grossSavings = tanker_gal * (destPrice - originPrice)
  const penaltyCost = totalPenalty_gal * originPrice
  const netSavings = grossSavings - penaltyCost
  const penaltyPct = tankerAmount_lb > 0 ? (totalPenalty_lb / tankerAmount_lb) * 100 : 0

  return {
    totalPenalty_lb,
    totalPenalty_gal,
    penaltyPct,
    grossSavings,
    penaltyCost,
    netSavings,
    worthIt: netSavings > 0,
    isEstimate: true,
  }
}
