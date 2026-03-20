import type { Stop, ComputedLeg, AircraftConfig, ValidationMessage } from './types';

/**
 * Validate trip inputs and return structured list of issues.
 * Hard errors block results. Soft warnings are informational.
 */
export function validateTrip(
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): { errors: ValidationMessage[]; warnings: ValidationMessage[] } {
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];

  // --- Hard Errors ---

  // Check cruise speed
  if (aircraft.cruiseSpeedKts <= 0) {
    errors.push({ type: 'error', message: 'Invalid aircraft speed.' });
  }

  // Check each leg feasibility
  for (let i = 0; i < legs.length; i++) {
    const baseBurn = legs[i].actualBurnGal;
    const reserve = aircraft.reserveFuelGal;

    // Leg infeasible: can't carry enough fuel
    if (baseBurn + reserve > aircraft.maxFuelGal) {
      errors.push({
        type: 'error',
        legIndex: i,
        message: `Leg ${stops[i].icao}→${stops[i + 1].icao} is infeasible: aircraft cannot carry enough fuel. Reduce reserve requirement or select a different aircraft.`,
      });
    }

    // Check ramp fee waiver feasibility
    if (stops[i].minWaiverGal > 0) {
      // This is a soft check - depends on FOB at the time
      if (stops[i].minWaiverGal > aircraft.maxFuelGal) {
        errors.push({
          type: 'error',
          stopIndex: i,
          message: `Ramp fee waiver at ${stops[i].icao} requires more fuel than the aircraft can carry.`,
        });
      }
    }
  }

  // --- Soft Warnings ---

  // Check delivery ratios
  for (let i = 0; i < legs.length; i++) {
    const ratio = 1 - (aircraft.burnPenaltyPctPerHr / 100) * legs[i].flightTimeHrs;
    if (ratio < 0.85 && ratio > 0) {
      warnings.push({
        type: 'warning',
        legIndex: i,
        message: `Long leg on ${stops[i].icao}→${stops[i + 1].icao} reduces tankering efficiency to ${(ratio * 100).toFixed(1)}%. Consider stopping to refuel.`,
      });
    }
    if (ratio <= 0) {
      errors.push({
        type: 'error',
        legIndex: i,
        message: `Tankering not physically feasible on leg ${stops[i].icao}→${stops[i + 1].icao} — delivery ratio is zero or negative.`,
      });
    }
  }

  // Check if initial fuel nearly full
  const tankeringCapacity = aircraft.maxFuelGal - aircraft.initFuelGal;
  if (tankeringCapacity < aircraft.maxFuelGal * 0.1 && tankeringCapacity > 0) {
    warnings.push({
      type: 'warning',
      message: `Initial fuel load leaves only ${Math.round(tankeringCapacity)} gal of tankering capacity.`,
    });
  }

  // Check if fuel prices are all similar
  const prices = stops.map(s => s.fuelPricePerGal).filter(p => p > 0);
  if (prices.length >= 2) {
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    if (maxPrice - minPrice < 0.10) {
      warnings.push({
        type: 'warning',
        message: 'Fuel prices are similar across all stops. Tankering savings will be minimal.',
      });
    }
  }

  // Check if cheapest fuel is at last stop
  if (stops.length >= 2) {
    const lastPrice = stops[stops.length - 1].fuelPricePerGal;
    const otherPrices = stops.slice(0, -1).map(s => s.fuelPricePerGal);
    if (lastPrice > 0 && otherPrices.every(p => p >= lastPrice)) {
      warnings.push({
        type: 'warning',
        message: 'Cheapest fuel is at your final destination — tankering from earlier stops only makes sense if delivery ratios are high.',
      });
    }
  }

  // Check ICAO codes found
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].icao && stops[i].icao.length === 4) {
      // Validation that ICAO is in database happens in the component
    }
  }

  // Check payload weight
  if (aircraft.rampWeightLbs > aircraft.aircraft.maxRampWeightLbs) {
    warnings.push({
      type: 'warning',
      message: `Entered weight exceeds aircraft max ramp weight of ${aircraft.aircraft.maxRampWeightLbs.toLocaleString()} lbs.`,
    });
  }

  return { errors, warnings };
}

/**
 * Quick check if trip can produce results (no hard errors).
 */
export function canComputeResults(
  stops: Stop[],
  legs: ComputedLeg[],
  aircraft: AircraftConfig
): boolean {
  const { errors } = validateTrip(stops, legs, aircraft);
  return errors.length === 0;
}
