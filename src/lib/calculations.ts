import { JET_A_DENSITY_LBS_PER_GAL, JET_A_CO2_KG_PER_GAL } from './units';
import { jetADensity, densityAdjustedBurnGph } from './fuelDensity';
import { windBurnMultiplier, applyBurnAdjustment } from './winds';
import type { AircraftConfig, ComputedLeg, Stop, WindInput, LegAnalysis } from './types';

// === Constants ===

/** Default weight sensitivity: 25% burn increase from lightest to heaviest */
export const DEFAULT_WEIGHT_SENSITIVITY = 0.25;

/** ISA standard temperature at sea level in Celsius */
export const ISA_STANDARD_TEMP_C = 15;

/** Marginal savings threshold in $/gal - within this range, verdict is "marginal" */
export const MARGINAL_THRESHOLD = 0.05;

// === 4.1 Flight Time ===

/**
 * Calculate flight time in hours.
 * flight_time_hrs = distance_nm / effective_groundspeed_kts
 */
export function flightTime(distanceNm: number, groundspeedKts: number): number {
  if (groundspeedKts <= 0) throw new Error('Groundspeed must be positive');
  return distanceNm / groundspeedKts;
}

/**
 * Calculate effective groundspeed from TAS and headwind component.
 * Positive headwindKts = headwind (reduces groundspeed).
 * Negative headwindKts = tailwind (increases groundspeed).
 */
export function effectiveGroundspeed(tasKts: number, headwindKts: number): number {
  return tasKts - headwindKts;
}

// === 4.2 Base Fuel Burn ===

/**
 * Calculate base fuel burn for a leg with all corrections applied in order:
 * 1. Weight correction
 * 2. Temperature/density correction
 * 3. Wind correction (baked into flight time if using headwind mode)
 * 4. Burn rate % adjustment (Mode A) applied as multiplier last
 */
export function computeLegBurn(
  distanceNm: number,
  aircraft: AircraftConfig,
  wind: WindInput | null,
  rampWeightLbs?: number,
): { burnGal: number; flightTimeHrs: number; groundspeedKts: number } {
  let burnRateGph = aircraft.burnRateGph;
  let groundspeedKts = aircraft.cruiseSpeedKts;

  // 1. Weight correction
  if (rampWeightLbs && rampWeightLbs > 0) {
    const weightFactor = rampWeightLbs / aircraft.aircraft.maxRampWeightLbs;
    const burnCorrection = 1 + (weightFactor - 0.85) * aircraft.weightSensitivity;
    burnRateGph *= burnCorrection;
  }

  // 2. Temperature/density correction
  if (aircraft.oatCelsius !== null) {
    burnRateGph = densityAdjustedBurnGph(burnRateGph, aircraft.oatCelsius);
  }

  // 3 & 4. Wind correction
  if (wind) {
    if (wind.mode === 'burn_adjustment' && wind.burnAdjustmentPct !== undefined) {
      // Mode A: simple percentage adjustment applied last
      burnRateGph = applyBurnAdjustment(burnRateGph, wind.burnAdjustmentPct);
    } else if (wind.mode === 'headwind_tailwind' && wind.headwindKts !== undefined) {
      // Mode B: headwind/tailwind affects groundspeed
      groundspeedKts = effectiveGroundspeed(aircraft.cruiseSpeedKts, wind.headwindKts);
      if (groundspeedKts <= 0) {
        throw new Error('Headwind exceeds aircraft speed - cannot make progress');
      }
    }
    // Mode C (live forecast) resolves to headwind component, same as Mode B
    if (wind.mode === 'live_forecast' && wind.headwindKts !== undefined) {
      groundspeedKts = effectiveGroundspeed(aircraft.cruiseSpeedKts, wind.headwindKts);
      if (groundspeedKts <= 0) {
        throw new Error('Headwind exceeds aircraft speed - cannot make progress');
      }
    }
  }

  const flightTimeHrs = flightTime(distanceNm, groundspeedKts);
  const burnGal = burnRateGph * flightTimeHrs;

  return { burnGal, flightTimeHrs, groundspeedKts };
}

// === 4.3 Burn Penalty ===

/**
 * Calculate burn penalty for carrying extra fuel.
 * Iterates 3 times to converge (penalty itself consumes fuel).
 *
 * @param extraFuelGal - Extra fuel carried beyond minimum
 * @param burnPenaltyPctPerHr - Burn penalty rate (e.g., 2.5 for 2.5%/hr)
 * @param flightTimeHrs - Flight time in hours
 * @returns Total penalty burn in gallons
 */
export function burnPenalty(
  extraFuelGal: number,
  burnPenaltyPctPerHr: number,
  flightTimeHrs: number
): number {
  const rate = burnPenaltyPctPerHr / 100;
  let penaltyGal = 0;
  for (let i = 0; i < 3; i++) {
    const effectiveExtra = extraFuelGal - penaltyGal;
    penaltyGal = effectiveExtra * rate * flightTimeHrs;
  }
  return penaltyGal;
}

/**
 * Calculate how much fuel actually arrives at destination after penalty.
 */
export function deliveredFuel(extraFuelGal: number, penaltyGal: number): number {
  return extraFuelGal - penaltyGal;
}

// === 4.4 Delivery Ratio ===

/**
 * Delivery ratio for a single leg.
 * The fraction of tankered fuel that actually arrives.
 */
export function deliveryRatio(burnPenaltyPctPerHr: number, flightTimeHrs: number): number {
  return 1 - (burnPenaltyPctPerHr / 100) * flightTimeHrs;
}

/**
 * Compound delivery ratio across multiple legs.
 * For tankering from stop i to stop j (non-adjacent), multiply individual ratios.
 */
export function compoundDeliveryRatio(
  legs: { burnPenaltyPctPerHr: number; flightTimeHrs: number }[]
): number {
  let ratio = 1;
  for (const leg of legs) {
    const r = deliveryRatio(leg.burnPenaltyPctPerHr, leg.flightTimeHrs);
    if (r <= 0) return 0;
    ratio *= r;
  }
  return ratio;
}

// === 4.5 Effective Delivered Cost ===

/**
 * The true cost per gallon to deliver fuel from origin to destination.
 */
export function effectiveDeliveredCost(
  priceAtOrigin: number,
  delivRatio: number,
  rampFee: number,
  totalGalPurchased: number
): number {
  if (delivRatio <= 0) return Infinity;
  const rampCostShare = totalGalPurchased > 0 ? rampFee / totalGalPurchased : 0;
  return (priceAtOrigin / delivRatio) + rampCostShare;
}

// === 4.6 Break-Even Price ===

/**
 * Maximum price at destination that makes tankering worthwhile.
 */
export function breakEvenPrice(effectiveDelivCost: number): number {
  return effectiveDelivCost;
}

// === 4.7 Savings Per Gallon ===

/**
 * Positive = save money by tankering. Negative = lose money.
 */
export function savingsPerGal(destPrice: number, effectiveDelivCost: number): number {
  return destPrice - effectiveDelivCost;
}

// === 4.8 Ramp Fee Waiver Logic ===

/**
 * Evaluate ramp fee waiver at a stop.
 * Returns recommended uplift considering waiver threshold.
 */
export function evaluateRampFeeWaiver(
  stop: Stop,
  plannedUplift: number,
  maxCapacity: number
): { recommendedUplift: number; rampFeePaid: number; rampFeeWaived: boolean; note: string } {
  if (stop.rampFee <= 0 || stop.minWaiverGal <= 0) {
    return {
      recommendedUplift: plannedUplift,
      rampFeePaid: 0,
      rampFeeWaived: false,
      note: '',
    };
  }

  const canMeetWaiver = stop.minWaiverGal <= maxCapacity;

  if (plannedUplift >= stop.minWaiverGal) {
    // Already meeting waiver threshold
    return {
      recommendedUplift: plannedUplift,
      rampFeePaid: 0,
      rampFeeWaived: true,
      note: 'Ramp fee waived — purchase meets minimum.',
    };
  }

  if (!canMeetWaiver) {
    // Can't physically meet waiver
    return {
      recommendedUplift: plannedUplift,
      rampFeePaid: stop.rampFee,
      rampFeeWaived: false,
      note: 'Cannot meet ramp fee waiver minimum — insufficient tank capacity.',
    };
  }

  // Evaluate: is it cheaper to buy up to waiver threshold or pay the ramp fee?
  const extraGalForWaiver = stop.minWaiverGal - plannedUplift;
  const costOfExtraFuel = extraGalForWaiver * stop.fuelPricePerGal;

  if (costOfExtraFuel < stop.rampFee) {
    // Cheaper to buy more fuel and waive the ramp fee
    const netSavings = stop.rampFee - costOfExtraFuel;
    return {
      recommendedUplift: stop.minWaiverGal,
      rampFeePaid: 0,
      rampFeeWaived: true,
      note: `Buy ${Math.round(extraGalForWaiver)} more gal to waive the $${stop.rampFee} ramp fee — net savings $${Math.round(netSavings)}.`,
    };
  }

  // Cheaper to just pay the ramp fee
  return {
    recommendedUplift: plannedUplift,
    rampFeePaid: stop.rampFee,
    rampFeeWaived: false,
    note: `Paying $${stop.rampFee} ramp fee is cheaper than buying ${Math.round(extraGalForWaiver)} extra gal.`,
  };
}

// === Leg Analysis ===

/**
 * Analyze a single leg for tankering viability.
 */
export function analyzeLeg(
  fromStop: Stop,
  toStop: Stop,
  leg: ComputedLeg,
  aircraft: AircraftConfig,
  totalGalPurchasedAtOrigin: number
): LegAnalysis {
  const ratio = deliveryRatio(aircraft.burnPenaltyPctPerHr, leg.flightTimeHrs);

  const rampFeeForCalc = fromStop.rampFee > 0 && totalGalPurchasedAtOrigin < fromStop.minWaiverGal
    ? fromStop.rampFee : 0;

  const effDelivCost = effectiveDeliveredCost(
    fromStop.fuelPricePerGal,
    ratio,
    rampFeeForCalc,
    totalGalPurchasedAtOrigin
  );

  const breakEven = breakEvenPrice(effDelivCost);
  const savings = savingsPerGal(toStop.fuelPricePerGal, effDelivCost);

  let verdict: LegAnalysis['verdict'];
  if (fromStop.rampFee > 0 && fromStop.minWaiverGal > 0) {
    verdict = 'ramp_fee_changes';
  } else if (savings > MARGINAL_THRESHOLD) {
    verdict = 'tanker';
  } else if (savings < -MARGINAL_THRESHOLD) {
    verdict = 'dont_tanker';
  } else {
    verdict = 'marginal';
  }

  // Override ramp_fee_changes if savings clearly point one way
  if (verdict === 'ramp_fee_changes') {
    if (savings > MARGINAL_THRESHOLD) verdict = 'tanker';
    else if (savings < -MARGINAL_THRESHOLD) verdict = 'dont_tanker';
  }

  return {
    legIndex: leg.fromIndex,
    fromIcao: fromStop.icao,
    toIcao: toStop.icao,
    distanceNm: leg.distanceNm,
    flightTimeHrs: leg.flightTimeHrs,
    actualBurnGal: leg.actualBurnGal,
    originPrice: fromStop.fuelPricePerGal,
    destPrice: toStop.fuelPricePerGal,
    deliveryRatio: ratio,
    breakEvenPrice: breakEven,
    effectiveDeliveredCost: effDelivCost,
    savingsPerGal: savings,
    verdict,
  };
}

// === Carbon Offset Cost ===

/**
 * Calculate carbon offset cost for fuel burned.
 * @param galBurned - Total gallons of fuel burned
 * @param offsetCostPerTonne - Cost per tonne of CO2 offset
 * @returns Total offset cost in dollars
 */
export function carbonOffsetCost(galBurned: number, offsetCostPerTonne: number): number {
  const co2Tonnes = (galBurned * JET_A_CO2_KG_PER_GAL) / 1000;
  return co2Tonnes * offsetCostPerTonne;
}

/**
 * Carbon offset cost per gallon burned.
 */
export function carbonCostPerGal(offsetCostPerTonne: number): number {
  return (JET_A_CO2_KG_PER_GAL / 1000) * offsetCostPerTonne;
}

// === Fuel Stop Cost ===

/**
 * Calculate the cost of a fuel-only stop (crew time).
 */
export function fuelStopCost(groundTimeMin: number, crewCostPerHr: number): number {
  return (groundTimeMin / 60) * crewCostPerHr;
}
