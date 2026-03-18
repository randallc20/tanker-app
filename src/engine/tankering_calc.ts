/**
 * Core Tankering Calculation Engine
 *
 * Implements the complete fuel tankering analysis using actual POH data
 * with bilinear interpolation. NOT a flat percentage or Breguet approximation.
 *
 * Algorithm overview:
 * 1. Interpolate fuel flow at planned weight and tankered weight
 * 2. Apply wind correction to trip time
 * 3. Subtract climb/descent distance to get effective cruise distance
 * 4. Calculate cruise burn penalty (delta fuel flow × cruise time)
 * 5. Calculate climb burn penalty (heavier climb fuel - normal climb fuel)
 * 6. Apply temperature correction if ISA deviation provided
 * 7. Compute economics: gross savings - penalty cost = net savings
 *
 * All POH data comes from the AircraftPerformanceData interface.
 * The engine is aircraft-agnostic — it works with any aircraft that
 * conforms to the schema.
 */

import type { AircraftPerformanceData, TankeringInputs, TankeringResult, CruiseMode } from '../data/types'
import { getAircraft } from '../data/aircraft_registry'
import { interpBilinear, interpClimb } from './interpolation'
import { getWindCorrectionFactor } from './wind_correction'
import { isaDeviation, tempCorrectionFactor } from './temperature_correction'

/**
 * Calculate the maximum amount of fuel (lb) that can be tankered given
 * current weight, aircraft limits, and required fuel.
 *
 * @param aircraft - Aircraft performance data
 * @param plannedWeight - Current planned ramp weight (lb) WITHOUT tanker fuel
 * @param currentFuel - Current planned fuel load (lb)
 * @returns Maximum additional fuel in lb
 */
export function calcMaxTanker(
  aircraft: AircraftPerformanceData,
  plannedWeight: number,
  currentFuel: number
): number {
  const { mtow, maxFuel_lb } = aircraft.weights
  const mtowRoom = Math.max(0, mtow - plannedWeight)
  const fuelRoom = Math.max(0, maxFuel_lb - currentFuel)
  return Math.min(mtowRoom, fuelRoom)
}

/**
 * Run the full tankering calculation.
 *
 * @param inputs - All calculation inputs
 * @returns Full TankeringResult with verdict, economics, and breakdown
 */
export function calculateTankering(inputs: TankeringInputs): TankeringResult {
  const aircraft = getAircraft(inputs.aircraftId)
  if (!aircraft) {
    throw new Error(`Aircraft "${inputs.aircraftId}" not found in registry`)
  }

  const warnings: string[] = []
  const {
    cruiseMode, cruiseAltitude, tripDistance, plannedCruiseWeight,
    tankerAmount_lb, windComponent, forecastTemp_c, originPrice, destPrice,
    fuelDensity, descentDistance,
  } = inputs

  const tankeredWeight = plannedCruiseWeight + tankerAmount_lb
  const table = cruiseMode === 'hsc' ? aircraft.hsc : aircraft.lrc

  // ─── SANITY CHECKS ──────────────────────────────────────────────────────────
  if (tankeredWeight > aircraft.weights.mtow) {
    warnings.push(`Tankered weight (${tankeredWeight.toLocaleString()} lb) exceeds MTOW (${aircraft.weights.mtow.toLocaleString()} lb)`)
  }
  if (plannedCruiseWeight < 12000) {
    warnings.push(`Cruise weight (${plannedCruiseWeight.toLocaleString()} lb) is below minimum table weight (12,000 lb) — extrapolation may be inaccurate`)
  }
  if (tripDistance < 100) {
    warnings.push('Trip distance under 100 NM — climb/descent dominate and penalty may be understated')
  }
  if (Math.abs(windComponent) > 100) {
    warnings.push(`Wind component (${windComponent} kt) exceeds table range (±100 kt) — correction extrapolated`)
  }

  // Check FL450 at max weight (null data in POH)
  if (cruiseAltitude >= 45000 && plannedCruiseWeight >= 17100) {
    warnings.push('FL450 performance data unavailable at weights near MTOW')
  }

  // ─── STEP 1: Interpolate cruise fuel flow & KTAS ──────────────────────────
  const ffNormal = interpBilinear(
    cruiseAltitude, plannedCruiseWeight,
    table.altitudes, table.weights, table.fuelFlow
  )
  const ffHeavy = interpBilinear(
    cruiseAltitude, tankeredWeight,
    table.altitudes, table.weights, table.fuelFlow
  )
  const ktasHeavy = interpBilinear(
    cruiseAltitude, tankeredWeight,
    table.altitudes, table.weights, table.ktas
  )

  if (ffNormal === null || ffHeavy === null || ktasHeavy === null) {
    // Data unavailable at this altitude/weight combination
    return makeEmptyResult(warnings, 'Performance data unavailable at this altitude/weight combination')
  }

  // ─── STEP 7 (early): Temperature correction ──────────────────────────────
  let isaDev: number | null = null
  let tempCorrection = 1.0
  if (forecastTemp_c !== null) {
    isaDev = isaDeviation(forecastTemp_c, cruiseAltitude)
    tempCorrection = tempCorrectionFactor(isaDev)
    if (Math.abs(isaDev) > 20) {
      warnings.push(`ISA deviation (${isaDev > 0 ? '+' : ''}${isaDev.toFixed(0)}°C) is large — temperature correction may be less reliable`)
    }
  }

  const ffNormalCorr = ffNormal * tempCorrection
  const ffHeavyCorr = ffHeavy * tempCorrection

  // ─── STEP 3: Wind correction ──────────────────────────────────────────────
  const windFactor = getWindCorrectionFactor(ktasHeavy, windComponent, aircraft.windCorrection)

  // ─── STEP 4: Effective cruise distance ────────────────────────────────────
  // Climb distance at heavy weight
  const climbDistHeavy = interpClimb(
    cruiseAltitude, tankeredWeight,
    aircraft.climb.altitudes, aircraft.climb.weights, aircraft.climb.distance
  )
  const effectiveCruiseNM = Math.max(0, tripDistance - climbDistHeavy - descentDistance)

  // ─── STEP 5: Cruise burn penalty ──────────────────────────────────────────
  const cruiseTime_hrs = (effectiveCruiseNM / ktasHeavy) * windFactor
  const cruisePenalty_lb = (ffHeavyCorr - ffNormalCorr) * cruiseTime_hrs

  // ─── STEP 6: Climb burn penalty ──────────────────────────────────────────
  const climbFuelNormal = interpClimb(
    cruiseAltitude, plannedCruiseWeight,
    aircraft.climb.altitudes, aircraft.climb.weights, aircraft.climb.fuel
  )
  const climbFuelHeavy = interpClimb(
    cruiseAltitude, tankeredWeight,
    aircraft.climb.altitudes, aircraft.climb.weights, aircraft.climb.fuel
  )
  const climbPenalty_lb = Math.max(0, climbFuelHeavy - climbFuelNormal)

  // ─── STEP 8: Economics ────────────────────────────────────────────────────
  const totalPenalty_lb = cruisePenalty_lb + climbPenalty_lb
  const totalPenalty_gal = totalPenalty_lb / fuelDensity
  const tankerAmount_gal = tankerAmount_lb / fuelDensity

  const grossSavings = tankerAmount_gal * (destPrice - originPrice)
  const penaltyCost = totalPenalty_gal * originPrice
  const netSavings = grossSavings - penaltyCost
  const worthIt = netSavings > 0

  const penaltyPct = tankerAmount_lb > 0 ? (totalPenalty_lb / tankerAmount_lb) * 100 : 0
  const breakEvenPriceDiff = tankerAmount_lb > 0
    ? originPrice * (totalPenalty_lb / tankerAmount_lb)
    : 0

  // ─── Max tanker calculation ───────────────────────────────────────────────
  // Estimate current fuel load as trip fuel (planned weight - ZFW-ish)
  const estimatedTripFuel = plannedCruiseWeight - aircraft.weights.bow
  const maxTanker_lb = calcMaxTanker(aircraft, plannedCruiseWeight, Math.max(0, estimatedTripFuel))
  const maxTanker_gal = maxTanker_lb / fuelDensity

  // ─── Rule of thumb comparison ─────────────────────────────────────────────
  let ruleOfThumb: TankeringResult['ruleOfThumb'] = undefined
  if (aircraft.operatorRuleOfThumb) {
    const rot = aircraft.operatorRuleOfThumb
    // Using flat fuel flow: no weight sensitivity at all
    const rotTripTime = (tripDistance / rot.cruiseSpeed_ktas) * windFactor
    // Penalty is zero with flat fuel flow (same flow at any weight!)
    // But to be fair, use the percentage of extra weight as a rough penalty
    const rotPenaltyCost = 0  // flat model says no penalty
    const rotGross = tankerAmount_gal * (destPrice - originPrice)
    const rotNet = rotGross - rotPenaltyCost
    ruleOfThumb = {
      penaltyCost: rotPenaltyCost,
      netSavings: rotNet,
      ffUsed: rot.fuelFlow_lbhr,
      ktasUsed: rot.cruiseSpeed_ktas,
    }
  }

  return {
    worthIt,
    netSavings,
    grossSavings,
    penaltyCost,
    breakEvenPriceDiff,
    penaltyPct,
    cruisePenalty_lb,
    climbPenalty_lb,
    totalPenalty_lb,
    totalPenalty_gal,
    ffNormal: ffNormalCorr,
    ffHeavy: ffHeavyCorr,
    ffDelta: ffHeavyCorr - ffNormalCorr,
    cruiseKtas: ktasHeavy,
    effectiveCruiseNM,
    cruiseTime_hrs,
    windCorrectionFactor: windFactor,
    isaDeviation: isaDev,
    isaTempCorrection: tempCorrection,
    climbFuelNormal,
    climbFuelHeavy,
    climbDistanceHeavy: climbDistHeavy,
    maxTanker_lb,
    maxTanker_gal,
    ruleOfThumb,
    warnings,
  }
}

/**
 * Generate sensitivity data for charting.
 *
 * Sweeps one variable while holding others constant.
 */
export function sensitivitySweep(
  baseInputs: TankeringInputs,
  variable: 'priceDiff' | 'wind' | 'tankerAmount',
  points: number = 30
): { x: number; netSavings: number; label: string }[] {
  const results: { x: number; netSavings: number; label: string }[] = []

  if (variable === 'priceDiff') {
    // Sweep destination price from origin-$1 to origin+$3
    for (let i = 0; i <= points; i++) {
      const diff = -1 + (i / points) * 4 // -1 to +3
      const inputs = { ...baseInputs, destPrice: baseInputs.originPrice + diff }
      const r = calculateTankering(inputs)
      results.push({ x: diff, netSavings: r.netSavings, label: `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}/gal` })
    }
  } else if (variable === 'wind') {
    // Sweep wind from -100 (tailwind) to +100 (headwind)
    for (let i = 0; i <= points; i++) {
      const wind = -100 + (i / points) * 200
      const inputs = { ...baseInputs, windComponent: wind }
      const r = calculateTankering(inputs)
      results.push({ x: wind, netSavings: r.netSavings, label: `${wind > 0 ? 'HW' : wind < 0 ? 'TW' : ''}${Math.abs(wind).toFixed(0)} kt` })
    }
  } else if (variable === 'tankerAmount') {
    const aircraft = getAircraft(baseInputs.aircraftId)
    const maxLb = aircraft
      ? Math.min(aircraft.weights.mtow - baseInputs.plannedCruiseWeight, aircraft.weights.maxFuel_lb)
      : 3000
    const maxGal = maxLb / baseInputs.fuelDensity
    for (let i = 0; i <= points; i++) {
      const gal = (i / points) * maxGal
      const lb = gal * baseInputs.fuelDensity
      const inputs = { ...baseInputs, tankerAmount_lb: lb }
      const r = calculateTankering(inputs)
      results.push({ x: gal, netSavings: r.netSavings, label: `${gal.toFixed(0)} gal` })
    }
  }

  return results
}

/** Create an empty/error result */
function makeEmptyResult(warnings: string[], errorMsg: string): TankeringResult {
  warnings.push(errorMsg)
  return {
    worthIt: false, netSavings: 0, grossSavings: 0, penaltyCost: 0,
    breakEvenPriceDiff: 0, penaltyPct: 0,
    cruisePenalty_lb: 0, climbPenalty_lb: 0, totalPenalty_lb: 0, totalPenalty_gal: 0,
    ffNormal: 0, ffHeavy: 0, ffDelta: 0, cruiseKtas: 0,
    effectiveCruiseNM: 0, cruiseTime_hrs: 0,
    windCorrectionFactor: 1, isaDeviation: null, isaTempCorrection: 1,
    climbFuelNormal: 0, climbFuelHeavy: 0, climbDistanceHeavy: 0,
    maxTanker_lb: 0, maxTanker_gal: 0, ruleOfThumb: undefined, warnings,
  }
}
