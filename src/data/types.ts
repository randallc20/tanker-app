/**
 * Aircraft performance data schema.
 * Each aircraft entry must conform to this interface.
 * The CJ4 is the first entry; future aircraft slot in identically.
 */

export interface CruiseTable {
  /** Weight columns from POH (lb), heaviest first */
  weights: number[]
  /** Altitude rows from POH (ft) */
  altitudes: number[]
  /** KTAS values: ktas[altIdx][wtIdx], null where data unavailable */
  ktas: (number | null)[][]
  /** Fuel flow in lb/hr: fuelFlow[altIdx][wtIdx], null where data unavailable */
  fuelFlow: (number | null)[][]
}

export interface ClimbTable {
  /** Weight columns from POH (lb), heaviest first */
  weights: number[]
  /** Altitude rows from POH (ft) */
  altitudes: number[]
  /** Climb time in minutes: time[altIdx][wtIdx] */
  time: number[][]
  /** Climb fuel in lb: fuel[altIdx][wtIdx] */
  fuel: number[][]
  /** Climb distance in NM: distance[altIdx][wtIdx] */
  distance: number[][]
}

export interface WindCorrectionTable {
  /** KTAS breakpoints for rows */
  ktas: number[]
  /** Wind components for columns (negative = tailwind, positive = headwind) */
  winds: number[]
  /** Correction factors: factors[ktasIdx][windIdx] */
  factors: number[][]
}

export interface AircraftPerformanceData {
  id: string
  displayName: string
  manufacturer: string
  model: string
  engines: string
  dataSource: string
  dataRevision: string
  lastVerified: string

  weights: {
    maxRamp: number
    mtow: number
    maxLanding: number
    maxZeroFuel: number
    maxFuel_lb: number
    maxFuel_gal: number
    bow: number
    fuelDensity_default: number
  }

  hsc: CruiseTable
  lrc: CruiseTable
  climb: ClimbTable
  windCorrection: WindCorrectionTable

  operatorRuleOfThumb?: {
    fuelFlow_lbhr: number
    fuelFlow_galhr: number
    cruiseSpeed_ktas: number
  }
}

/** Cruise mode selection */
export type CruiseMode = 'hsc' | 'lrc'

/** Inputs for a tankering calculation */
export interface TankeringInputs {
  aircraftId: string
  cruiseMode: CruiseMode
  cruiseAltitude: number        // ft
  tripDistance: number           // NM
  plannedCruiseWeight: number   // lb (ZFW + trip fuel)
  tankerAmount_lb: number       // lb of extra fuel to carry
  windComponent: number         // kt, positive = headwind, negative = tailwind
  forecastTemp_c: number | null // °C at cruise altitude, null = ISA
  departureElevation: number    // ft MSL
  originPrice: number           // $/gal
  destPrice: number             // $/gal
  fuelDensity: number           // lb/gal (default 6.7)
  descentDistance: number       // NM (default 50)
}

/** Full tankering calculation result */
export interface TankeringResult {
  // Verdict
  worthIt: boolean
  netSavings: number            // $

  // Economics
  grossSavings: number          // $
  penaltyCost: number           // $
  breakEvenPriceDiff: number    // $/gal
  penaltyPct: number            // %

  // Burn breakdown
  cruisePenalty_lb: number
  climbPenalty_lb: number
  totalPenalty_lb: number
  totalPenalty_gal: number

  // Cruise details
  ffNormal: number              // lb/hr at planned weight
  ffHeavy: number               // lb/hr at tankered weight
  ffDelta: number               // lb/hr difference
  cruiseKtas: number            // KTAS at tankered weight
  effectiveCruiseNM: number
  cruiseTime_hrs: number
  windCorrectionFactor: number
  isaDeviation: number | null   // °C
  isaTempCorrection: number     // multiplier applied

  // Climb details
  climbFuelNormal: number       // lb
  climbFuelHeavy: number        // lb
  climbDistanceHeavy: number    // NM

  // Limits
  maxTanker_lb: number
  maxTanker_gal: number

  // Rule of thumb comparison
  ruleOfThumb?: {
    penaltyCost: number
    netSavings: number
    ffUsed: number
    ktasUsed: number
  }

  // Warnings
  warnings: string[]
}
