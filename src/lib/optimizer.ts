import type { Stop, ComputedLeg, AircraftConfig, UpliftPlan, TripResult } from './types';
import {
  deliveryRatio,
  compoundDeliveryRatio,
  effectiveDeliveredCost,
  burnPenalty,
  evaluateRampFeeWaiver,
  fuelStopCost,
} from './calculations';

/**
 * Compute compound delivery ratio from stop i to stop j.
 */
function computeCompoundDeliveryRatio(
  fromIdx: number,
  toIdx: number,
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): number {
  const legSlice: { burnPenaltyPctPerHr: number; flightTimeHrs: number }[] = [];
  for (let k = fromIdx; k < toIdx; k++) {
    legSlice.push({
      burnPenaltyPctPerHr: aircraft.burnPenaltyPctPerHr,
      flightTimeHrs: legs[k].flightTimeHrs,
    });
  }
  return compoundDeliveryRatio(legSlice);
}

/**
 * Compute effective delivered cost considering ramp fee.
 */
function computeEffectiveDeliveredCost(
  stop: Stop,
  totalGalBuying: number,
  delivRatio: number
): number {
  const rampFee = (stop.rampFee > 0 && totalGalBuying < stop.minWaiverGal)
    ? stop.rampFee : 0;
  return effectiveDeliveredCost(stop.fuelPricePerGal, delivRatio, rampFee, totalGalBuying);
}

/**
 * Estimate fuel needed at a future stop, given plans already made.
 */
function estimateFuelNeededAtStop(
  j: number,
  totalStops: number,
  legs: ComputedLeg[],
  aircraft: AircraftConfig,
  plansToDate: UpliftPlan[]
): number {
  let simFob = getProjectedFobAtStop(j, plansToDate, legs, aircraft);
  let needed = 0;
  for (let k = j; k < totalStops - 1; k++) {
    const req = legs[k].actualBurnGal + aircraft.reserveFuelGal;
    if (simFob < req) {
      needed += req - simFob;
      simFob = req;
    }
    // Account for both base burn and penalty burn from carrying extra fuel
    const extraAtK = Math.max(0, simFob - legs[k].actualBurnGal - aircraft.reserveFuelGal);
    const penalty = computePenaltyBurn(extraAtK, legs[k], aircraft);
    simFob -= legs[k].actualBurnGal + penalty;
  }
  return needed;
}

/**
 * Project FOB at a future stop based on plans made so far.
 */
function getProjectedFobAtStop(
  targetIdx: number,
  plans: UpliftPlan[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): number {
  if (plans.length === 0) return aircraft.initFuelGal;

  const lastPlan = plans[plans.length - 1];
  let fob = lastPlan.fobAfterUplift;

  // Simulate forward from last planned stop to target
  for (let k = lastPlan.stopIndex; k < targetIdx; k++) {
    if (k < legs.length) {
      // Add any uplift at intermediate stops
      const planAtK = plans.find(p => p.stopIndex === k);
      if (planAtK && k !== lastPlan.stopIndex) {
        fob += planAtK.upliftGal;
      }

      // Compute penalty burn on ALL extra fuel being carried, not just what was bought here
      const minRequired = legs[k].actualBurnGal + aircraft.reserveFuelGal;
      const extraCarried = Math.max(0, fob - minRequired);
      const penalty = extraCarried > 0
        ? burnPenalty(extraCarried, aircraft.burnPenaltyPctPerHr, legs[k].flightTimeHrs)
        : 0;
      fob -= legs[k].actualBurnGal + penalty;
    }
  }

  return Math.max(0, fob);
}

/**
 * Compute penalty burn for extra fuel on a leg.
 */
function computePenaltyBurn(
  extraGal: number,
  leg: ComputedLeg,
  aircraft: AircraftConfig
): number {
  if (extraGal <= 0 || !leg) return 0;
  return burnPenalty(extraGal, aircraft.burnPenaltyPctPerHr, leg.flightTimeHrs);
}

/**
 * Main optimizer: find uplift at each stop that minimizes total trip cost.
 *
 * Constraints (must never be violated):
 * 1. fob_after_uplift <= aircraft.maxFuelGal at every stop
 * 2. fob_at_next_stop >= aircraft.reserveFuelGal after every leg
 * 3. uplift <= stop.availableGal if set (0 = unlimited)
 * 4. uplift >= 0 (cannot return fuel)
 * 5. fob >= 0 at all times
 */
export function optimizeTrip(
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): UpliftPlan[] {
  const n = stops.length;
  const plans: UpliftPlan[] = [];
  let fob = aircraft.initFuelGal;

  for (let i = 0; i < n; i++) {
    // Step 1: Calculate minimum fuel required
    const minRequired = i < n - 1
      ? legs[i].actualBurnGal + aircraft.reserveFuelGal
      : aircraft.reserveFuelGal; // final stop: just reserves

    // Step 2: How much must we buy here?
    const mustBuy = Math.max(0, minRequired - fob);

    // Step 3: Capacity available for optional tankering
    const capacityForTankering = Math.max(0, aircraft.maxFuelGal - fob - mustBuy);

    // Step 4: Evaluate tankering for each future stop
    let totalExtraToBuy = 0;
    const tankerReasons: string[] = [];

    for (let j = i + 1; j < n; j++) {
      const delivRatio = computeCompoundDeliveryRatio(i, j, legs, aircraft);
      if (delivRatio <= 0) continue;

      // Evaluate effective cost considering potential ramp fee waiver at current purchase level
      // We need to check both the current total AND what it would be after adding tankered fuel
      const currentTotal = mustBuy + totalExtraToBuy;
      const effDelivCost = computeEffectiveDeliveredCost(
        stops[i], currentTotal, delivRatio
      );

      // Also check: if we're below the waiver threshold, would adding fuel for this stop
      // push us above it? If so, the effective cost may be lower than calculated.
      let adjustedEffDelivCost = effDelivCost;
      if (stops[i].rampFee > 0 && stops[i].minWaiverGal > 0 && currentTotal < stops[i].minWaiverGal) {
        // Currently paying ramp fee; check cost if we buy enough to waive it
        const costWithWaiver = computeEffectiveDeliveredCost(
          stops[i], stops[i].minWaiverGal, delivRatio
        );
        adjustedEffDelivCost = Math.min(effDelivCost, costWithWaiver);
      }

      const savingsPerGal = stops[j].fuelPricePerGal - adjustedEffDelivCost;

      if (savingsPerGal > 0) {
        const neededAtJ = estimateFuelNeededAtStop(j, n, legs, aircraft, plans);
        const remainingCapacity = capacityForTankering - totalExtraToBuy;

        let tankerForJ = Math.min(neededAtJ, remainingCapacity);

        // Apply FBO availability limit
        if (stops[i].availableGal > 0) {
          tankerForJ = Math.min(
            tankerForJ,
            stops[i].availableGal - mustBuy - totalExtraToBuy
          );
        }

        tankerForJ = Math.max(0, tankerForJ);

        if (tankerForJ > 0) {
          totalExtraToBuy += tankerForJ;
          tankerReasons.push(
            `${Math.round(tankerForJ)} gal for ${stops[j].icao} (saves $${Math.round(tankerForJ * savingsPerGal)} at $${savingsPerGal.toFixed(2)}/gal)`
          );
        }
      }
    }

    // Step 5: Check ramp fee waiver
    const totalBeforeWaiverCheck = mustBuy + totalExtraToBuy;
    const maxUpliftHere = aircraft.maxFuelGal - fob;
    const waiverResult = evaluateRampFeeWaiver(
      stops[i], totalBeforeWaiverCheck, maxUpliftHere
    );
    const finalUplift = Math.min(waiverResult.recommendedUplift, maxUpliftHere);

    // Step 6: Build plan entry
    const extraBuy = Math.max(0, finalUplift - mustBuy);
    const penaltyBurn = i < n - 1 ? computePenaltyBurn(extraBuy, legs[i], aircraft) : 0;

    // Add fuel stop cost if applicable
    let stopCostAddon = 0;
    if (stops[i].isFuelOnlyStop && stops[i].crewCostPerHr > 0) {
      stopCostAddon = fuelStopCost(stops[i].extraGroundTimeMin, stops[i].crewCostPerHr);
    }

    const cost = finalUplift * stops[i].fuelPricePerGal
      + (waiverResult.rampFeePaid)
      + stopCostAddon;

    plans.push({
      stopIndex: i,
      upliftGal: finalUplift,
      mustBuyGal: mustBuy,
      extraBuyGal: extraBuy,
      cost,
      rampFeePaid: waiverResult.rampFeePaid,
      rampFeeWaived: waiverResult.rampFeeWaived,
      penaltyBurnGal: penaltyBurn,
      fobAfterUplift: fob + finalUplift,
      reason: tankerReasons.length > 0
        ? tankerReasons.join('; ')
        : mustBuy > 0 ? 'Minimum required for next leg' : 'No tankering benefit',
      rampFeeNote: waiverResult.note,
    });

    // Step 7: Advance FOB
    if (i < n - 1) {
      fob = fob + finalUplift - legs[i].actualBurnGal - penaltyBurn;
    }
  }

  return plans;
}

/**
 * Minimum fuel plan: buy only bare minimum at each stop.
 */
export function minimumFuelPlan(
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): UpliftPlan[] {
  const n = stops.length;
  const plans: UpliftPlan[] = [];
  let fob = aircraft.initFuelGal;

  for (let i = 0; i < n; i++) {
    const minRequired = i < n - 1
      ? legs[i].actualBurnGal + aircraft.reserveFuelGal
      : aircraft.reserveFuelGal;

    const mustBuy = Math.max(0, minRequired - fob);

    // Check ramp fee even for minimum plan
    const maxUpliftHere = aircraft.maxFuelGal - fob;
    const waiverResult = evaluateRampFeeWaiver(stops[i], mustBuy, maxUpliftHere);
    const finalUplift = Math.min(waiverResult.recommendedUplift, maxUpliftHere);

    const cost = finalUplift * stops[i].fuelPricePerGal + waiverResult.rampFeePaid;

    plans.push({
      stopIndex: i,
      upliftGal: finalUplift,
      mustBuyGal: mustBuy,
      extraBuyGal: Math.max(0, finalUplift - mustBuy),
      cost,
      rampFeePaid: waiverResult.rampFeePaid,
      rampFeeWaived: waiverResult.rampFeeWaived,
      penaltyBurnGal: 0,
      fobAfterUplift: fob + finalUplift,
      reason: mustBuy > 0 ? 'Minimum required for next leg' : 'No fuel needed',
      rampFeeNote: waiverResult.note,
    });

    if (i < n - 1) {
      fob = fob + finalUplift - legs[i].actualBurnGal;
    }
  }

  return plans;
}

/**
 * Validate a manual uplift plan against all constraints.
 * Returns list of violations.
 */
export function validateManualPlan(
  manualUplifts: number[],
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): string[] {
  const violations: string[] = [];
  let fob = aircraft.initFuelGal;

  for (let i = 0; i < stops.length; i++) {
    const uplift = manualUplifts[i] ?? 0;

    // Constraint 4: uplift >= 0
    if (uplift < 0) {
      violations.push(`Stop ${stops[i].icao}: Cannot return fuel (negative uplift).`);
    }

    // Constraint 1: fob_after_uplift <= maxFuelGal
    const fobAfter = fob + uplift;
    if (fobAfter > aircraft.maxFuelGal) {
      violations.push(
        `Stop ${stops[i].icao}: Fuel on board (${Math.round(fobAfter)} gal) exceeds tank capacity (${aircraft.maxFuelGal} gal).`
      );
    }

    // Constraint 3: availability limit
    if (stops[i].availableGal > 0 && uplift > stops[i].availableGal) {
      violations.push(
        `Stop ${stops[i].icao}: Uplift (${Math.round(uplift)} gal) exceeds available fuel (${stops[i].availableGal} gal).`
      );
    }

    if (i < stops.length - 1) {
      const legBurn = legs[i].actualBurnGal;
      const fobAtNext = fobAfter - legBurn;

      // Constraint 5: fob >= 0
      if (fobAtNext < 0) {
        violations.push(
          `Leg ${stops[i].icao}→${stops[i + 1].icao}: Aircraft runs out of fuel (${Math.round(fobAtNext)} gal short).`
        );
      }

      // Constraint 2: fob_at_next >= reserves
      if (fobAtNext < aircraft.reserveFuelGal) {
        violations.push(
          `Leg ${stops[i].icao}→${stops[i + 1].icao}: Arrives with ${Math.round(fobAtNext)} gal, below reserve minimum of ${aircraft.reserveFuelGal} gal.`
        );
      }

      fob = fobAfter - legBurn;
    }
  }

  return violations;
}

/**
 * Compute FOB at each waypoint for a given plan (for charting).
 */
export function computeFobTimeline(
  plan: UpliftPlan[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): number[] {
  const fobs: number[] = [];
  let fob = aircraft.initFuelGal;

  for (let i = 0; i < plan.length; i++) {
    fob += plan[i].upliftGal;
    fobs.push(fob); // FOB after uplift at this stop

    if (i < legs.length) {
      fob -= legs[i].actualBurnGal + plan[i].penaltyBurnGal;
    }
  }

  return fobs;
}

/**
 * Build complete trip result from stops and legs.
 */
export function computeTripResult(
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): TripResult {
  const optimizedPlan = optimizeTrip(stops, legs, aircraft);
  const minPlan = minimumFuelPlan(stops, legs, aircraft);

  const totalCostOptimized = optimizedPlan.reduce((sum, p) => sum + p.cost, 0);
  const totalCostMinimum = minPlan.reduce((sum, p) => sum + p.cost, 0);
  const savings = totalCostMinimum - totalCostOptimized;
  const savingsPct = totalCostMinimum > 0 ? (savings / totalCostMinimum) * 100 : 0;
  const totalFuelUplifted = optimizedPlan.reduce((sum, p) => sum + p.upliftGal, 0);
  const totalBurned = legs.reduce((sum, l) => sum + l.actualBurnGal, 0)
    + optimizedPlan.reduce((sum, p) => sum + p.penaltyBurnGal, 0);
  const avgEffectiveCost = totalBurned > 0 ? totalCostOptimized / totalBurned : 0;

  return {
    optimizedPlan,
    minimumPlan: minPlan,
    totalCostOptimized,
    totalCostMinimum,
    savings,
    savingsPct,
    totalFuelUplifted,
    avgEffectiveCost,
    legs,
    warnings: [],
    errors: [],
  };
}
